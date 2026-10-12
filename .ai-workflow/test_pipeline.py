"""Offline integration tests; fake AI CLIs, real isolated Git worktrees."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

RUNNER = Path(__file__).with_name('pipeline.py')
FAKE = '''#!/usr/bin/env python3
import json, os, pathlib, sys
name=pathlib.Path(sys.argv[0]).name
args=sys.argv[1:]
if args[:2]==['login','status']:
    print('Logged in using ChatGPT', file=sys.stderr); sys.exit(0)
if args[:2]==['auth','status']:
    print(json.dumps({'loggedIn':True,'authMethod':'oauth'})); sys.exit(0)
prompt=sys.stdin.read()
with open(os.environ['FAKE_PROMPTS'],'a') as log:
    log.write(name+': '+prompt.splitlines()[0]+'\\n'+prompt+'\\n---\\n')
if name=='codex':
    pathlib.Path(os.environ['FAKE_PROMPTS']+'.codex-args').write_text(json.dumps(args))
    with open(os.environ['FAKE_PROMPTS']+'.codex-args-all','a') as f: f.write(json.dumps(args)+'\\n')
if name=='codex' and prompt.startswith('Diagnose this bug'):
    if os.environ.get('FAKE_DIAG')=='fix':
        pathlib.Path('value.txt').write_text('fixed during diagnosis')
    else:
        pathlib.Path('tests').mkdir(exist_ok=True)
        pathlib.Path('tests/repro.txt').write_text('fails until fixed')
    pathlib.Path(args[args.index('-o')+1]).write_text('' if os.environ.get('FAKE_DIAG')=='empty' else 'Root cause: value.txt')
    sys.exit(0)
if name=='codex':
    pathlib.Path('value.txt').write_text('changed')
    pathlib.Path(args[args.index('-o')+1]).write_text('Implemented task')
    sys.exit(0)
mode=os.environ.get('FAKE_MODE','pass')
if mode=='quota':
    print('Usage limit reached'); sys.exit(1)
schema=json.loads(args[args.index('--json-schema')+1])
if 'plan' in schema['properties']:
    result={'plan':'Change value.txt and verify it.'}
else:
    counter=pathlib.Path(os.environ['FAKE_COUNT'])
    n=int(counter.read_text()) if counter.exists() else 0
    counter.write_text(str(n+1))
    approved=mode=='pass' or (mode=='fix' and n>0)
    result={'approved':approved,'summary':'Review','findings':[] if approved else ['Correct value.txt']}
    if mode=='invalid': result['approved']='true'
print(json.dumps({'structured_output':result,'is_error':False}))
'''

class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root / 'repo'; self.repo.mkdir()
        self.bin = self.root / 'bin'; self.bin.mkdir()
        for name in ('claude','codex'):
            p=self.bin/name; p.write_text(FAKE); p.chmod(0o755)
        self.env = dict(os.environ, PATH=str(self.bin)+os.pathsep+os.environ['PATH'],
                        FAKE_COUNT=str(self.root/'count'), FAKE_PROMPTS=str(self.root/'prompts'))
        self.git('init','-q')
        self.git('config','user.email','test@example.invalid')
        self.git('config','user.name','Test')
        (self.repo/'value.txt').write_text('original')
        self.git('add','value.txt'); self.git('commit','-qm','initial')
        self.config=self.root/'config.json'
        self.config.write_text(json.dumps({'max_fix_rounds':2,'agent_timeout_seconds':30,
            'check_timeout_seconds':30,'setup':[], 'test_paths':['tests/*'], 'checks':[{'name':'check',
            'command':[sys.executable,'-c','print("ok")'],'required':True}]}))
    def git(self,*args):
        return subprocess.run(['git',*args],cwd=self.repo,check=True,capture_output=True)
    def invoke(self, mode='pass', extra=(), **env):
        return subprocess.run([sys.executable,str(RUNNER),'Change value', '--repo',str(self.repo),
            '--config',str(self.config),*extra],env=dict(self.env,FAKE_MODE=mode,**env),
            capture_output=True,text=True,timeout=60)
    def state(self):
        path=next((self.root/'repo-ai-runs').glob('*/state.json'))
        return path,json.loads(path.read_text())
    def test_success_isolated(self):
        p=self.invoke(); self.assertEqual(p.returncode,0,p.stderr)
        _,s=self.state(); self.assertEqual(s['stage'],'complete')
        self.assertEqual((self.repo/'value.txt').read_text(),'original')
        self.assertEqual((Path(s['checkout'])/'value.txt').read_text(),'changed')
    def test_bounded_fix_loop(self):
        p=self.invoke('fix'); self.assertEqual(p.returncode,0,p.stderr)
        self.assertEqual(self.state()[1]['round'],1)
    def test_max_rounds_stops(self):
        p=self.invoke('reject'); self.assertEqual(p.returncode,2)
        self.assertEqual(self.state()[1]['stage'],'needs-attention')
        self.assertEqual((self.root/'count').read_text(),'3')
    def test_bad_review_fails_closed(self):
        p=self.invoke('invalid'); self.assertEqual(p.returncode,2)
        self.assertIn('Invalid review shape',p.stderr)
    def test_dirty_requires_explicit_head(self):
        (self.repo/'value.txt').write_text('user edits')
        p=self.invoke(); self.assertEqual(p.returncode,2)
        self.assertIn('uncommitted',p.stderr)
        p=self.invoke(extra=['--from-head']); self.assertEqual(p.returncode,0,p.stderr)
        self.assertEqual((self.repo/'value.txt').read_text(),'user edits')
    def test_quota_resume(self):
        p=self.invoke('quota'); self.assertEqual(p.returncode,2)
        path,s=self.state(); self.assertEqual(s['stage'],'plan')
        p=subprocess.run([sys.executable,str(RUNNER),'--resume',str(path.parent)],
            env=self.env,capture_output=True,text=True,timeout=60)
        self.assertEqual(p.returncode,0,p.stderr)
    def test_required_failure_overrides_approval(self):
        config=json.loads(self.config.read_text())
        config['checks'][0]['command']=[sys.executable,'-c','raise SystemExit(1)']
        self.config.write_text(json.dumps(config))
        p=self.invoke(); self.assertEqual(p.returncode,2)
        self.assertEqual(self.state()[1]['stage'],'needs-attention')
    def prompts(self):
        return (self.root/'prompts').read_text()
    def test_feature_mode_skips_diagnosis(self):
        p=self.invoke(); self.assertEqual(p.returncode,0,p.stderr)
        path,s=self.state(); self.assertEqual(s['mode'],'feature')
        self.assertFalse((path.parent/'diagnosis.md').exists())
        self.assertNotIn('Diagnose this bug',self.prompts())
    def test_bug_mode_diagnoses_before_planning(self):
        p=self.invoke(extra=['--bug']); self.assertEqual(p.returncode,0,p.stderr)
        path,s=self.state(); run=path.parent
        self.assertEqual((s['mode'],s['stage']),('bug','complete'))
        self.assertIn('Root cause',(run/'diagnosis.md').read_text())
        self.assertTrue((run/'repro.json').exists())
        self.assertIn('tests/repro.txt',(run/'diff-diagnosis-new-files.txt').read_text())
        order=[line.split(':')[0] for line in self.prompts().split('---\n') if line.strip()]
        self.assertEqual(order[:3],['codex','claude','codex'])
        self.assertTrue(self.prompts().startswith('codex: Diagnose this bug'))
        plan_prompt=self.prompts().split('---\n')[1]
        self.assertIn(str(run/'diagnosis.md'),plan_prompt)
        self.assertIn(str(run/'repro.json'),plan_prompt)
    def test_every_agent_prompt_enforces_scope(self):
        p=self.invoke('fix',extra=['--bug']); self.assertEqual(p.returncode,0,p.stderr)
        prompts=[x for x in self.prompts().split('---\n') if x.strip()]
        self.assertEqual(len(prompts),6)  # diagnose, plan, code, review, fix, review
        for prompt in prompts:
            self.assertIn('STRICT SCOPE',prompt)
        self.assertIn('Skip any finding that asks',prompts[4])
    def test_codex_model_and_reasoning_effort(self):
        config=json.loads(self.config.read_text())
        config.update(codex_model='gpt-6-astra',codex_reasoning_effort='high')
        self.config.write_text(json.dumps(config))
        p=self.invoke(); self.assertEqual(p.returncode,0,p.stderr)
        args=json.loads(Path(str(self.root/'prompts')+'.codex-args').read_text())
        self.assertEqual(args[args.index('--model')+1],'gpt-6-astra')
        self.assertIn('model_reasoning_effort="high"',args)
        self.assertIn('--ignore-user-config',args)
    def test_codex_reasoning_effort_per_stage(self):
        config=json.loads(self.config.read_text())
        config['codex_reasoning_effort']={'code':'high','fix':'medium'}
        self.config.write_text(json.dumps(config))
        p=self.invoke('fix'); self.assertEqual(p.returncode,0,p.stderr)
        calls=[json.loads(x) for x in Path(str(self.root/'prompts')+'.codex-args-all').read_text().splitlines()]
        self.assertEqual(len(calls),2)  # code, then one fix round
        self.assertIn('model_reasoning_effort="high"',calls[0])
        self.assertIn('model_reasoning_effort="medium"',calls[1])
    def test_codex_defaults_when_unset(self):
        p=self.invoke(); self.assertEqual(p.returncode,0,p.stderr)
        args=json.loads(Path(str(self.root/'prompts')+'.codex-args').read_text())
        self.assertNotIn('--model',args)
        self.assertFalse(any(a.startswith('model_reasoning_effort') for a in args))
    def test_custom_branch_name(self):
        p=self.invoke(extra=['--branch','feat/value-change']); self.assertEqual(p.returncode,0,p.stderr)
        self.assertEqual(self.state()[1]['branch'],'feat/value-change')
        self.git('rev-parse','--verify','refs/heads/feat/value-change')
    def test_existing_or_invalid_branch_is_refused(self):
        self.git('branch','taken')
        p=self.invoke(extra=['--branch','taken']); self.assertEqual(p.returncode,2)
        self.assertIn('already exists',p.stderr)
        p=self.invoke(extra=['--branch','bad..name']); self.assertEqual(p.returncode,2)
        self.assertIn('Invalid branch name',p.stderr)
        self.assertFalse((self.root/'repo-ai-runs').exists())
    def test_base_branch_and_spec(self):
        self.git('checkout','-qb','feature-base')
        (self.repo/'value.txt').write_text('from base'); self.git('commit','-qam','base work')
        self.git('checkout','-q','-')
        spec=self.root/'spec.md'; spec.write_text('# Spec\nMake it blue.')
        p=self.invoke(extra=['--base','feature-base','--spec',str(spec)]); self.assertEqual(p.returncode,0,p.stderr)
        path,s=self.state(); run=path.parent
        self.assertEqual((run/'spec.md').read_text(),'# Spec\nMake it blue.')
        self.assertEqual(s['base'],self.git('rev-parse','feature-base').stdout.decode().strip())
        prompts=[x for x in self.prompts().split('---\n') if x.strip()]
        for prompt in prompts:
            self.assertIn(str(run/'spec.md'),prompt)
        self.assertIn('Work test-first',prompts[1])
    def test_unknown_base_or_spec_is_refused(self):
        p=self.invoke(extra=['--base','no-such-branch']); self.assertEqual(p.returncode,2)
        self.assertIn('Unknown base',p.stderr)
        p=self.invoke(extra=['--spec',str(self.root/'missing.md')]); self.assertEqual(p.returncode,2)
        self.assertIn('Spec file not found',p.stderr)
        self.assertFalse((self.root/'repo-ai-runs').exists())
    def test_check_placeholders_env_and_screenshots(self):
        script=('import os,pathlib,sys;'
                'd=pathlib.Path(os.environ["AI_RUN_DIR"])/"screenshots"/os.environ["AI_CHECK_LABEL"];'
                'd.mkdir(parents=True,exist_ok=True);(d/"frame.png").write_bytes(b"png");'
                'sys.exit(0 if sys.argv[1]==os.environ["AI_RUN_DIR"] else 1)')
        check=self.root/'check.py'; check.write_text(script)
        config=json.loads(self.config.read_text())
        config['checks'][0]['command']=[sys.executable,str(check),'{run_dir}']
        self.config.write_text(json.dumps(config))
        p=self.invoke(); self.assertEqual(p.returncode,0,p.stderr)
        path,_=self.state(); run=path.parent
        review=[x for x in self.prompts().split('---\n') if x.strip()][2]
        self.assertIn(str(run/'screenshots'/'checks-0'/'frame.png'),review)
    def make_skill(self,name,extra=None):
        d=self.root/'skills-src'/name; d.mkdir(parents=True)
        (d/'SKILL.md').write_text(f'# {name}')
        if extra: (d/extra).write_text('extra')
        return str(d)
    def test_stage_skills_are_copied_and_named_in_prompts(self):
        config=json.loads(self.config.read_text())
        config['codex_skills']={'diagnose':[self.make_skill('debugging')],
                                'code':[self.make_skill('tdd')],'fix':[self.make_skill('receiving')]}
        config['review_skills']=[self.make_skill('review-anim','STANDARDS.md')]
        self.config.write_text(json.dumps(config))
        p=self.invoke('fix',extra=['--bug']); self.assertEqual(p.returncode,0,p.stderr)
        path,_=self.state(); run=path.parent
        for name in ('debugging','tdd','receiving','review-anim'):
            self.assertTrue((run/'skills'/name/'SKILL.md').exists())
        self.assertTrue((run/'skills'/'review-anim'/'STANDARDS.md').exists())
        prompts=[x for x in self.prompts().split('---\n') if x.strip()]
        diagnose,plan,code,review,fix,review2=prompts
        skill=lambda n: str(run/'skills'/n/'SKILL.md')
        self.assertIn(skill('debugging'),diagnose); self.assertNotIn(skill('tdd'),diagnose)
        self.assertIn(skill('tdd'),code); self.assertNotIn(skill('receiving'),code)
        self.assertIn(skill('receiving'),fix); self.assertNotIn(skill('tdd'),fix)
        self.assertIn(skill('review-anim'),review); self.assertNotIn(skill('review-anim'),plan)
        self.assertIn('No one is available',code)
    def test_missing_skill_is_refused_before_run_folder(self):
        config=json.loads(self.config.read_text())
        config['codex_skills']={'code':[str(self.root/'nope')]}
        self.config.write_text(json.dumps(config))
        p=self.invoke(); self.assertEqual(p.returncode,2)
        self.assertIn('Skill for code not found',p.stderr)
        self.assertFalse((self.root/'repo-ai-runs').exists())
    def test_bug_diagnosis_may_not_fix_code(self):
        p=self.invoke(extra=['--bug'],FAKE_DIAG='fix'); self.assertEqual(p.returncode,2)
        self.assertIn('outside test_paths: value.txt',p.stderr)
        self.assertEqual(self.state()[1]['stage'],'diagnose')
    def test_bug_empty_diagnosis_stops(self):
        p=self.invoke(extra=['--bug'],FAKE_DIAG='empty'); self.assertEqual(p.returncode,2)
        self.assertIn('empty diagnosis',p.stderr)
    def test_check_cwd(self):
        (self.repo/'sub').mkdir(); (self.repo/'sub'/'marker.txt').write_text('x')
        self.git('add','sub'); self.git('commit','-qm','sub')
        config=json.loads(self.config.read_text())
        config['checks'][0].update(cwd='sub',command=[sys.executable,'-c',
            'import pathlib,sys; sys.exit(0 if pathlib.Path("marker.txt").exists() else 1)'])
        self.config.write_text(json.dumps(config))
        p=self.invoke(); self.assertEqual(p.returncode,0,p.stderr)

if __name__=='__main__': unittest.main()
