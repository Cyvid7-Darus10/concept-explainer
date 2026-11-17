import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectDiff } from '../scripts/lib/diff.mjs';
import { collectChanges } from '../scripts/lib/changes.mjs';
import { measureDiff } from '../scripts/lib/estimate-input.mjs';

// A repo you are asked to explain is untrusted. Its own git config can name
// programs (fsmonitor, external diff, textconv) that git would run. None may run.
function hostileRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'rx-git-'));
  const marker = join(dir, '..', `${dir.split('/').pop()}-pwned`);
  const hook = join(dir, 'hook.sh');
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  writeFileSync(hook, `#!/bin/sh\necho ran "$@" >> "${marker}"\n`);
  chmodSync(hook, 0o755);
  writeFileSync(join(dir, 'a.js'), 'a\n');
  writeFileSync(join(dir, '.gitattributes'), '*.js diff=evil\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  writeFileSync(join(dir, 'a.js'), 'a\nb\n');
  git('commit', '-q', '-am', 'change');
  git('config', 'core.fsmonitor', hook);
  git('config', 'diff.external', hook);
  git('config', 'diff.evil.textconv', hook);
  git('config', 'core.pager', hook);
  return { dir, marker };
}

test('diff, estimate and changes never run programs named by the repo config', () => {
  const { dir, marker } = hostileRepo();
  assert.equal(collectDiff(dir, { base: 'HEAD~1' }).diff[0].path, 'a.js');
  assert.deepEqual(measureDiff(dir, { base: 'HEAD~1' }), { lines: 1, files: 1 });
  assert.ok(collectChanges(dir, { since: '1 year ago' }).length >= 1);
  assert.ok(!existsSync(marker), 'a repo hook ran');
});

test('every git call disables repo-configured programs and ends options before refs', async () => {
  const { gitArgs } = await import('../scripts/lib/changes.mjs');
  const args = gitArgs('/r', ['diff', '--numstat', '--end-of-options', 'a...b', '--']);
  assert.deepEqual(args.slice(0, 10), ['-c', 'core.fsmonitor=false', '-c', 'diff.external=', '-c', 'core.pager=cat', '-c', 'core.hooksPath=/dev/null', '-C', '/r']);
  assert.ok(args.includes('--no-ext-diff') && args.includes('--no-textconv'), 'diff runs without external diff or textconv');
  const log = gitArgs('/r', ['log', '-n1']);
  assert.ok(log.includes('--no-ext-diff') && log.includes('--no-textconv'));
  assert.ok(!gitArgs('/r', ['rev-parse', 'HEAD']).includes('--no-textconv'), 'only diff and log get diff flags');
});

test('diff and estimate put refs after --end-of-options and close with --', async () => {
  const { readFileSync } = await import('node:fs');
  ['diff.mjs', 'estimate-input.mjs'].forEach((file) => {
    const source = readFileSync(new URL(`../scripts/lib/${file}`, import.meta.url), 'utf8');
    const calls = [...source.matchAll(/git\(repo, \[([^\]]*)\]\)/g)].map((m) => m[1]);
    assert.ok(calls.length > 0, file);
    calls.forEach((call) => assert.match(call, /'--end-of-options', [^,]+, '--'$/, `${file}: ${call}`));
  });
});
