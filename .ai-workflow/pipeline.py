#!/usr/bin/env python3
"""Local Claude plan/review -> Codex implementation. Standard library only."""
import argparse
import datetime
import glob
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import uuid
import fcntl

HERE = Path(__file__).resolve().parent
class Stop(RuntimeError):
    pass


def save(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, indent=2) + '\n')
    tmp.replace(path)


def environment():
    env = os.environ.copy()
    # Require subscription authentication; never silently use an API credential.
    for key in ('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY',
                'OPENAI_BASE_URL', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK',
                'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_BARE',
                'CLAUDE_CODE_SIMPLE'):
        env.pop(key, None)
    return env


def capture(args, cwd=None, include_stderr=False):
    p = subprocess.run(args, cwd=cwd, env=environment(), text=True,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
    if p.returncode:
        raise Stop(p.stderr.strip() or p.stdout.strip() or str(args))
    return (p.stdout + (p.stderr if include_stderr else "")).strip()


def execute(args, cwd, log, timeout, prompt=None):
    print(f'Running {log.stem} …', flush=True)
    with log.open('w') as out:
        p = subprocess.Popen(args, cwd=cwd, env=environment(), text=True,
                             stdin=subprocess.PIPE if prompt is not None else subprocess.DEVNULL,
                             stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            p.communicate(prompt, timeout=timeout)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            os.killpg(p.pid, signal.SIGTERM)
            try:
                p.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(p.pid, signal.SIGKILL)
                p.wait()
            raise Stop(f'Interrupted or timed out. See {log}; inspect changes before resuming.')
    return p.returncode


def doctor():
    for tool in ('git', 'codex', 'claude'):
        if not shutil.which(tool):
            raise Stop(f'Missing {tool}. See SETUP.md.')
    if 'ChatGPT' not in capture(['codex', 'login', 'status'], include_stderr=True):
        raise Stop('Codex must use ChatGPT login. Run: codex login')
    try:
        auth = json.loads(capture(['claude', 'auth', 'status']))
    except Stop:
        raise Stop('Claude subscription sign-in needed. Open claude and sign in with your Pro account.')
    # Newer Claude Code versions report subscription logins as 'claude.ai'.
    if not auth.get('loggedIn') or auth.get('authMethod') not in ('oauth', 'claude.ai'):
        raise Stop('Claude subscription sign-in needed. Open claude and sign in with your Pro account.')
    print('Both subscription sign-ins are available. Ensure paid extra usage is disabled in account settings.')


def checks(state, label):
    root, checkout = Path(state['run']), Path(state['checkout'])
    results = []
    for i, item in enumerate(state['config']['checks']):
        args = []
        for arg in item['command']:
            if glob.has_magic(arg):
                matches = sorted(glob.glob(arg, root_dir=checkout))
                if not matches:
                    raise Stop(f'Check pattern matched no files: {arg}')
                args.extend(matches)
            else:
                args.append(arg)
        log = root / f'{label}-{i}.log'
        code = execute(args, checkout, log, state['config']['check_timeout_seconds'])
        results.append({'name': item['name'], 'exit_code': code,
                        'required': item.get('required', True), 'log': str(log)})
    save(root / f'{label}.json', results)
    return results


def claude(state, prompt, schema, name):
    root = Path(state['run'])
    log = root / f'{name}.json'
    # Read-only built-in tool set. No shell, edits, plugins, hooks or MCP servers.
    args = ['claude', '--safe-mode', '-p', '--permission-mode', 'dontAsk',
            '--tools', 'Read,Glob,Grep', '--allowedTools', 'Read,Glob,Grep',
            '--add-dir', str(root), '--output-format', 'json',
            '--json-schema', json.dumps(schema), '--no-session-persistence']
    if state['config'].get('claude_model'):
        args += ['--model', state['config']['claude_model']]
    if execute(args, state['checkout'], log, state['config']['agent_timeout_seconds'], prompt):
        raise Stop(f'Claude failed. See {log}. No automatic retry or API fallback.')
    try:
        payload = json.loads(log.read_text())
        if payload.get('is_error') or payload.get('permission_denials'):
            raise ValueError('Claude reported an error or denied tool request')
        result = payload['structured_output']
        if not isinstance(result, dict):
            raise ValueError('Missing structured result')
        return result
    except (ValueError, KeyError) as e:
        raise Stop(f'Invalid Claude result in {log}: {e}')


def code(state, instructions, name):
    root = Path(state['run'])
    args = ['codex', '-a', 'never', 'exec', '--ignore-user-config',
            '-c', 'forced_login_method="chatgpt"', '--sandbox', 'workspace-write',
            '--color', 'never', '-o', str(root / f'{name}.md')]
    if state['config'].get('codex_model'):
        args += ['--model', state['config']['codex_model']]
    args += ['-']
    prompt = f'''Work on this task: {state['task']}
Read applicable AGENTS.md and CLAUDE.md. Implement only the requested scope.
Add or update automated tests for every behavior you build or change, in the project's
existing test locations and style: cover the main path, edge cases and error handling, and
add a regression test for each bug you fix. Tests must run offline and pass. Never weaken,
skip or delete existing assertions; if one is genuinely obsolete, replace it and explain why.
If something cannot reasonably be tested automatically, say so and why in your report.
Do not commit, push, merge, deploy, modify git history, or change other checkouts.
Do not weaken checks or edit workflow control files. Do not read secrets.
Project constraints: {state['config'].get('constraints', '')}
Plan:\n{(root / 'plan.md').read_text()}
{instructions}
Run relevant checks and report changes, tests, and limitations honestly.
'''
    if execute(args, state['checkout'], root / f'{name}.log',
               state['config']['agent_timeout_seconds'], prompt):
        raise Stop(f'Codex failed. See {root / (name + ".log")}. Inspect before resuming.')


def snapshot(state, label):
    root, checkout = Path(state['run']), Path(state['checkout'])
    if capture(['git', 'rev-parse', 'HEAD'], checkout) != state['base']:
        raise Stop('Checkout HEAD changed unexpectedly. Inspect the run before continuing.')
    if capture(['git', 'branch', '--show-current'], checkout) != state['branch']:
        raise Stop('Checkout branch changed unexpectedly.')
    # Includes staged/unstaged changes; new files are enumerated separately for reviewer Read.
    patch = root / f'{label}.patch'
    if execute(['git', 'diff', '--no-ext-diff', '--binary', state['base'], '--'], checkout, patch, 60):
        raise Stop('Unable to capture diff')
    new = capture(['git', 'ls-files', '--others', '--exclude-standard'], checkout)
    (root / f'{label}-new-files.txt').write_text(new + '\n')
    return patch, new


def run(state):
    root = Path(state['run'])
    def advance(stage):
        state['stage'] = stage
        save(root / 'state.json', state)
    if state['stage'] == 'setup':
        for i, args in enumerate(state['config'].get('setup', [])):
            if execute(args, state['checkout'], root / f'setup-{i}.log', 600):
                raise Stop(f'Dependency setup failed. See setup-{i}.log.')
        advance('baseline')
    if state['stage'] == 'baseline':
        checks(state, 'baseline')
        advance('plan')
    if state['stage'] == 'plan':
        result = claude(state, f'''Plan this task in the repository: {state['task']}
Read relevant source and applicable AGENTS.md/CLAUDE.md. No implementation.
Constraints: {state['config'].get('constraints', '')}
Baseline checks: {(root / 'baseline.json').read_text()}
Inspect baseline logs where needed. Identify pre-existing failures separately.
Provide a concise implementation plan, acceptance criteria, files and verification.
List the specific tests to add or update (file, cases) so every new or changed behavior is covered.
Do not expand scope to unrelated baseline failures; flag them as blockers.
''', {'type': 'object', 'properties': {'plan': {'type': 'string'}},
      'required': ['plan'], 'additionalProperties': False}, 'plan')
        if not isinstance(result.get('plan'), str) or not result['plan'].strip():
            raise Stop('Planner produced an empty plan')
        (root / 'plan.md').write_text(result['plan'] + '\n')
        advance('code')
    if state['stage'] == 'code':
        code(state, 'Baseline results:\n' + (root / 'baseline.json').read_text(), 'code')
        advance('check')
    while state['stage'] in ('check', 'review', 'fix'):
        n = state['round']
        if state['stage'] == 'fix':
            feedback = (root / f'review-{n}.result.json').read_text()
            code(state, f'Address actionable review findings within task scope:\n{feedback}\n'
                 + (root / f'checks-{n}.json').read_text(), f'fix-{n + 1}')
            state['round'] += 1
            advance('check')
            n = state['round']
        if state['stage'] == 'check':
            snapshot(state, f'diff-{n}')
            checks(state, f'checks-{n}')
            advance('review')
        if state['stage'] == 'review':
            patch, new = snapshot(state, f'diff-{n}')
            verdict = claude(state, f'''Independently review the actual current changes for: {state['task']}
Read applicable AGENTS.md/CLAUDE.md and relevant source. Do not edit anything.
Read plan: {root / 'plan.md'}
Read diff: {patch}
Read these new files as well (they are not in the diff):\n{new}
Read baseline check results: {root / 'baseline.json'}
Read current check results and relevant logs: {root / f'checks-{n}.json'}
Assess correctness, regressions, security, tests and all acceptance criteria.
New or changed behavior without meaningful automated tests is an actionable finding, as are
tests that would pass without the change or weakened/deleted existing assertions.
Report actionable findings with file/line references where possible, distinguish baseline issues.
Approved must be false if any required check fails, implementation is incomplete,
there are unresolved findings, or evidence is insufficient. Findings=[] only if none.
''', {'type': 'object', 'properties': {'approved': {'type': 'boolean'},
      'summary': {'type': 'string'}, 'findings': {'type': 'array', 'items': {'type': 'string'}}},
      'required': ['approved', 'summary', 'findings'], 'additionalProperties': False}, f'review-{n}')
            if (type(verdict.get('approved')) is not bool or
                    not isinstance(verdict.get('summary'), str) or
                    not isinstance(verdict.get('findings'), list) or
                    not all(isinstance(x, str) for x in verdict['findings'])):
                raise Stop('Invalid review shape; refusing to treat it as approval')
            save(root / f'review-{n}.result.json', verdict)
            evidence = json.loads((root / f'checks-{n}.json').read_text())
            passed = all(x['exit_code'] == 0 for x in evidence if x['required'])
            if verdict['approved'] and not verdict['findings'] and passed:
                advance('complete')
            elif n >= state['config']['max_fix_rounds']:
                advance('needs-attention')
            else:
                advance('fix')
    print(f"Status: {state['stage']}\nCheckout: {state['checkout']}\nEvidence: {root}")
    return 0 if state['stage'] == 'complete' else 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('task', nargs='?')
    parser.add_argument('--repo', default=str(HERE.parent))
    parser.add_argument('--config', default=str(HERE / 'config.json'))
    parser.add_argument('--doctor', action='store_true')
    parser.add_argument('--from-head', action='store_true', help='Explicitly exclude uncommitted source changes')
    parser.add_argument('--resume', type=Path, help='Run folder printed by an earlier run')
    args = parser.parse_args()
    if args.doctor:
        doctor()
        return 0
    if not args.resume and not args.task:
        parser.error('Provide a task description, --resume RUN_FOLDER, or --doctor')
    doctor()
    if args.resume:
        root = args.resume.resolve()
    else:
        repo = Path(capture(['git', 'rev-parse', '--show-toplevel'], args.repo)).resolve()
        dirty = capture(['git', 'status', '--porcelain'], repo)
        if dirty and not args.from_head:
            raise Stop('Source has uncommitted changes. Commit them first, or use --from-head to EXCLUDE them.')
        config = json.loads(Path(args.config).read_text())
        if not 0 <= config['max_fix_rounds'] <= 2:
            raise Stop('max_fix_rounds must be between 0 and 2')
        if not config.get('checks') or not any(c.get('required', True) for c in config['checks']):
            raise Stop('Configure at least one required check')
        tag = datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
        root = repo.parent / (repo.name + '-ai-runs') / tag
        root.mkdir(parents=True)
        branch = 'ai/' + tag
        checkout = root / 'checkout'
        base = capture(['git', 'rev-parse', 'HEAD'], repo)
        capture(['git', 'worktree', 'add', '-b', branch, str(checkout), base], repo)
        state = {'run': str(root), 'repo': str(repo), 'checkout': str(checkout),
                 'base': base, 'branch': branch, 'task': args.task, 'config': config,
                 'round': 0, 'stage': 'setup'}
        save(root / 'state.json', state)
        print(f'Run folder: {root}', flush=True)
        if dirty:
            print('Uncommitted source changes were EXCLUDED; checkout starts at HEAD.', flush=True)
    with (root / 'run.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Stop('This run is already active')
        return run(json.loads((root / 'state.json').read_text()))


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (Stop, OSError, ValueError, subprocess.SubprocessError) as exc:
        print(f'STOPPED: {exc}', file=sys.stderr)
        sys.exit(2)
