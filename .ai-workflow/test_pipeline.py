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
                        FAKE_COUNT=str(self.root/'count'))
        self.git('init','-q')
        self.git('config','user.email','test@example.invalid')
        self.git('config','user.name','Test')
        (self.repo/'value.txt').write_text('original')
        self.git('add','value.txt'); self.git('commit','-qm','initial')
        self.config=self.root/'config.json'
        self.config.write_text(json.dumps({'max_fix_rounds':2,'agent_timeout_seconds':30,
            'check_timeout_seconds':30,'setup':[], 'checks':[{'name':'check',
            'command':[sys.executable,'-c','print("ok")'],'required':True}]}))
    def git(self,*args):
        return subprocess.run(['git',*args],cwd=self.repo,check=True,capture_output=True)
    def invoke(self, mode='pass', extra=()):
        return subprocess.run([sys.executable,str(RUNNER),'Change value', '--repo',str(self.repo),
            '--config',str(self.config),*extra],env=dict(self.env,FAKE_MODE=mode),
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

if __name__=='__main__': unittest.main()
