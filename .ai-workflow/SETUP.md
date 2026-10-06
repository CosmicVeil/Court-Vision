# CourtVision: Claude plan → Codex code → Claude review

This is a local, on-demand pipeline. Give it one task; it creates a separate Git worktree, prepares dependencies, records baseline checks, asks Claude to plan, asks Codex to implement, runs checks, and asks a fresh Claude session to review the actual changes. Codex can address findings up to twice. It leaves the branch and evidence for you to inspect and merge.

## Start on this Mac

The files are installed in `/Users/mohandixit/Documents/GitHub/CourtVision/.ai-workflow/`.

1. Open Terminal. Run `claude` and sign in with the Claude Pro subscription. Codex is already signed in with ChatGPT. If needed elsewhere, run `codex login` and choose ChatGPT sign-in.
2. Check both accounts' usage/billing settings. Turn off optional paid extra usage or automatic credit purchases if you want subscription-only spending. The runner removes standard API-key environment variables and has no API fallback, but cannot change or guarantee your account billing settings.
3. Check readiness:

```bash
cd /Users/mohandixit/Documents/GitHub/CourtVision
python3 .ai-workflow/pipeline.py --doctor
```

4. Commit the project changes you want the pipeline to see, including the workflow files. Then run a concrete, bounded task:

```bash
python3 .ai-workflow/pipeline.py "Fix upcoming-games pagination so page 2 displays games 11–20; add regression coverage."
```

CourtVision currently has uncommitted backend/model changes. The runner refuses a dirty source checkout by default. To deliberately start at the latest commit and EXCLUDE all uncommitted changes:

```bash
python3 .ai-workflow/pipeline.py --from-head "Describe the task and acceptance criteria here"
```

This flag also excludes new/uncommitted tests. It does not stash, commit, or copy your work. The pipeline files themselves can run before being committed because the controller runs outside the new checkout.

## What a run does

1. Creates `CourtVision-ai-runs/<timestamp>/checkout` alongside CourtVision, on a new `ai/<timestamp>` branch based on the current HEAD.
2. Runs the configured `setup` commands in that checkout (`npm ci` in `frontend/` and a fresh `backend/.venv`). Dependencies are isolated; this requires network access. No Python environments, ignored files, or `.env` secrets are copied from your main checkout.
3. Records baseline results for every configured check.
4. Claude reads the code and produces `plan.md` with acceptance criteria.
5. Codex edits the isolated checkout with the workspace-write sandbox and no interactive approval prompts. Operations outside its sandbox fail rather than being automatically escalated.
6. The controller runs configured checks and saves logs. Claude independently reads the Git diff, new files, surrounding source, plan, and check results, and returns structured review findings.
7. Up to two fix/review rounds run. Success requires both zero unresolved review findings and every required check passing. Otherwise the run ends with `needs-attention` and exit code 2.

Claude receives only Read, Glob and Grep tools in safe mode. Its hooks, plugins and custom instructions are disabled by that mode; prompts explicitly ask it to read applicable AGENTS.md/CLAUDE.md. Codex is instructed not to commit/push/merge/deploy. No controller step performs these actions. This is a personal local development workflow, not a hostile-code sandbox or proof of correctness. Run it only against projects you trust.

## CourtVision verification

Two configs ship with CourtVision:

- `config.json` (default, full stack): `npm --prefix frontend test`, `npm --prefix frontend run build`, `npm --prefix frontend run lint`, and the offline backend suite (`python -m unittest discover -s backend/tests -t backend`).
- `config.backend-ml.json` (model work): the backend suite plus a fast `backend/scripts/evaluate_model.py` smoke run. Use it with `--config .ai-workflow/config.backend-ml.json`.

All checks pass on the current code, so a failing check after a run means the run broke something. Backend tests are offline (no Postgres, no live NBA services). These checks do not cover live NBA integrations or real model quality; avoid automatically running scripts that hit live services or retrain models. An AI review is useful evidence, not a guarantee.

## Progress, interruptions, and review

The terminal prints the run folder. It contains:

- `state.json`: task, configuration snapshot, base commit, branch and checkpoint.
- `plan.md`: Claude's plan.
- `baseline*.log` / `checks-*.log`: check evidence.
- `code.log`, `code.md`, `fix-*.log`: implementation output.
- `diff-*.patch`, `diff-*-new-files.txt`: tracked changes and new-file inventory.
- `review-*.result.json`: review verdict and findings.

A timeout, CLI error, malformed review or usage-limit error stops the run. There is no busy retry, account switching, or API fallback. After the issue is resolved:

```bash
python3 .ai-workflow/pipeline.py --resume /absolute/path/to/CourtVision-ai-runs/RUN_FOLDER
```

Inspect partial edits first: resuming repeats the interrupted stage, so model work is not guaranteed exactly once. The runner prevents two processes from resuming the same run simultaneously. After the two fix rounds are exhausted, `needs-attention` is terminal; inspect and address it manually or launch a new scoped task. Completed runs are not re-reviewed on resume.

Review the checkout and its new files before committing or merging. Do not delete a worktree with uncommitted work you need. To remove a finished checkout, first preserve its work as appropriate, then use `git worktree remove /absolute/path/to/checkout`. Logs are retained separately. There is no automatic cleanup or scheduler.

## Reuse in another repository or machine

1. Install Git, Python 3.10+ (macOS/Linux), Node/npm if the project needs them, Codex CLI and Claude Code. Sign in using the subscriptions.
2. Copy `pipeline.py`, `config.json`, `SETUP.md` and optionally `test_pipeline.py` into the other repository's `.ai-workflow` directory.
3. Edit `config.json` for that project. `setup` is a list of dependency-install commands; `checks` lists commands, names and whether they are required. Commands are argument arrays, not shell strings. Wildcards in check arguments are expanded by the runner. Use executable scripts for complex shell logic.
4. Replace CourtVision's constraints with that project's requirements. Include at least one meaningful required check. Choose offline tests when possible. Keep `max_fix_rounds` between 0 and 2.
5. Model fields default to `null`, using each CLI's available default. You can set a model supported by your account; larger models and long context usually consume more allowance. Neither paid plan guarantees unlimited automatic runs.
6. Run the offline controller tests and readiness check:

```bash
python3 .ai-workflow/test_pipeline.py
python3 .ai-workflow/pipeline.py --doctor
python3 .ai-workflow/pipeline.py "Your task with acceptance criteria"
```

You can instead keep one shared copy and supply explicit paths:

```bash
python3 /path/to/pipeline.py \
  --repo /path/to/another-repo \
  --config /path/to/that-project-config.json \
  "Your task"
```

On a different machine, sign in again; do not copy tokens. The script uses macOS/Linux process groups and file locking; on Windows use WSL. Keep the machine awake and the terminal process alive while a task runs. There is no separate hosted service.

Example configuration for a Python project (adjust interpreter/dependencies):

```json
{
  "max_fix_rounds": 2,
  "agent_timeout_seconds": 1800,
  "check_timeout_seconds": 300,
  "setup": [
    ["python3", "-m", "venv", ".venv"],
    [".venv/bin/python", "-m", "pip", "install", "-r", "requirements-dev.txt"]
  ],
  "checks": [
    {"name": "Unit tests", "command": [".venv/bin/python", "-m", "pytest", "tests/unit"], "required": true}
  ],
  "constraints": "Preserve public API compatibility. Use offline tests.",
  "claude_model": null,
  "codex_model": null
}
```

## Subscription and CLI references

- [Codex with ChatGPT plans](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)
- [Claude Code with Pro or Max](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)
- [Claude scripted runs](https://code.claude.com/docs/en/headless)
- [Codex CLI](https://developers.openai.com/codex/cli/)

This setup uses `claude -p` without `--bare`: the currently documented bare mode does not read subscription login. CLI behavior can change; re-run the doctor and offline tests after upgrades, and consult the docs if authentication or flags change.

## Validation performed during setup

Offline integration tests use fake AI executables and real temporary Git worktrees to verify isolation, repair-loop limits, failed-check gating, invalid-review rejection, dirty-source handling and checkpoint resumption. No live model task has been run: Claude Code still requires subscription sign-in, and no implementation task was supplied. The offline tests validate controller behavior, not model quality or live-provider availability.
