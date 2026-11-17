import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// End-to-end runs of the CLI. Every run points the library and the Claude
// config at temp folders, so the real ~/.repo-explainer and ~/.claude stay untouched.
const CLI = fileURLToPath(new URL('../bin/repo-explainer.mjs', import.meta.url));
const EXAMPLE = fileURLToPath(new URL('../examples/taskflow.explainer.json', import.meta.url));

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'rx-cli-'));
  const env = { ...process.env, REPO_EXPLAINER_HOME: join(root, 'home'), CLAUDE_CONFIG_DIR: join(root, 'claude') };
  const data = join(root, 'taskflow.explainer.json');
  copyFileSync(EXAMPLE, data);
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8' });
  return { root, env, data, run, home: env.REPO_EXPLAINER_HOME, config: env.CLAUDE_CONFIG_DIR };
}

test('build publishes to the library by default and prints the hub path', () => {
  const { root, data, run, home } = setup();
  const result = run('build', data);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(root, 'taskflow.html')));
  assert.ok(existsSync(join(home, 'explainers', 'acme-taskflow', 'index.html')));
  assert.ok(existsSync(join(home, 'library.json')));
  assert.match(result.stderr, new RegExp(`library: .*${join(home, 'index.html').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('build --no-library leaves the library alone', () => {
  const { data, run, home } = setup();
  const result = run('build', data, '--no-library');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!existsSync(home));
  assert.doesNotMatch(result.stderr, /library/);
});

test('a failed build publishes nothing', () => {
  const { root, run, home } = setup();
  const bad = join(root, 'bad.json');
  writeFileSync(bad, JSON.stringify({ meta: {} }));
  const result = run('build', bad);
  assert.equal(result.status, 1);
  assert.ok(!existsSync(home));
});

test('library list, path, add, remove and rebuild work end to end', () => {
  const { data, run, home, env } = setup();
  assert.match(run('library').stdout, /empty/i);
  assert.equal(run('library', 'path').stdout.trim(), join(home, 'index.html'));

  const added = run('library', 'add', data);
  assert.equal(added.status, 0, added.stderr);
  assert.match(added.stderr, /added acme-taskflow/);
  assert.match(run('library', 'add', data).stderr, /updated acme-taskflow/);

  const listed = execFileSync(process.execPath, [CLI, 'library', 'list'], { env, encoding: 'utf8' });
  assert.match(listed, /acme-taskflow\s+Taskflow, explained/);

  const rebuilt = run('library', 'rebuild');
  assert.equal(rebuilt.status, 0, rebuilt.stderr);
  assert.match(rebuilt.stderr, /rebuilt 1 explainer/);

  const removed = run('library', 'remove', 'acme-taskflow');
  assert.equal(removed.status, 0, removed.stderr);
  assert.ok(!existsSync(join(home, 'explainers', 'acme-taskflow')));
  assert.match(run('library', 'remove', 'acme-taskflow').stderr, /no explainer "acme-taskflow"/);
  assert.equal(run('library', 'remove').status, 1);
});

test('library add validates first', () => {
  const { root, run, home } = setup();
  const bad = join(root, 'bad.json');
  writeFileSync(bad, JSON.stringify({ meta: {} }));
  assert.equal(run('library', 'add', bad).status, 1);
  assert.ok(!existsSync(join(home, 'library.json')));
});

test('unknown library subcommands are usage errors', () => {
  const { run } = setup();
  const result = run('library', 'frobnicate');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown library command "frobnicate"/);
});

test('install links into CLAUDE_CONFIG_DIR, is idempotent and refuses real folders', () => {
  const { run, config } = setup();
  const first = run('install');
  assert.equal(first.status, 0, first.stderr);
  assert.ok(lstatSync(join(config, 'skills', 'repo-explainer')).isSymbolicLink());
  assert.ok(existsSync(join(config, 'rules', 'repo-explainer.md')));
  assert.match(run('install').stderr, /already linked/);

  writeFileSync(join(config, 'rules', 'repo-explainer.md'), 'edited');
  const refused = run('install');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /--force/);
  assert.equal(readFileSync(join(config, 'rules', 'repo-explainer.md'), 'utf8'), 'edited');
  assert.equal(run('install', '--force').status, 0);
});

test('help mentions the library and install commands', () => {
  const { run } = setup();
  const { stdout } = run('--help');
  assert.match(stdout, /library \[list\|path\|add\|remove\|rebuild\|open\]/);
  assert.match(stdout, /install \[--force\]/);
  assert.match(stdout, /--no-library/);
});
