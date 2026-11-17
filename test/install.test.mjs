import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, symlinkSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSkill, resolveConfigDir } from '../scripts/lib/install.mjs';

const SKILL_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RULE = readFileSync(join(SKILL_DIR, 'rules', 'repo-explainer.md'), 'utf8');
const tempConfig = () => mkdtempSync(join(tmpdir(), 'rx-claude-'));
const skillLink = (config) => join(config, 'skills', 'repo-explainer');
const ruleFile = (config) => join(config, 'rules', 'repo-explainer.md');

test('config dir comes from CLAUDE_CONFIG_DIR, else ~/.claude', () => {
  assert.equal(resolveConfigDir({ CLAUDE_CONFIG_DIR: '/tmp/c' }), '/tmp/c');
  assert.equal(resolveConfigDir({}), join(homedir(), '.claude'));
});

test('install links the skill and copies the rule', () => {
  const config = tempConfig();
  const actions = installSkill({ skillDir: SKILL_DIR, configDir: config });
  assert.ok(lstatSync(skillLink(config)).isSymbolicLink());
  assert.equal(realpathSync(skillLink(config)), realpathSync(SKILL_DIR));
  assert.equal(readFileSync(ruleFile(config), 'utf8'), RULE);
  assert.equal(actions.length, 2);
  assert.match(actions[0], /linked/);
  assert.match(actions[1], /wrote/);
});

test('install is idempotent', () => {
  const config = tempConfig();
  installSkill({ skillDir: SKILL_DIR, configDir: config });
  const again = installSkill({ skillDir: SKILL_DIR, configDir: config });
  assert.match(again[0], /already linked/);
  assert.match(again[1], /up to date/);
  assert.deepEqual(readdirSync(join(config, 'skills')), ['repo-explainer']);
});

test('a symlink pointing elsewhere is relinked', () => {
  const config = tempConfig();
  mkdirSync(join(config, 'skills'), { recursive: true });
  symlinkSync(tempConfig(), skillLink(config));
  const [action] = installSkill({ skillDir: SKILL_DIR, configDir: config });
  assert.match(action, /relinked/);
  assert.equal(realpathSync(skillLink(config)), realpathSync(SKILL_DIR));
});

test('a real skill folder or edited rule is never replaced without --force', () => {
  const config = tempConfig();
  mkdirSync(skillLink(config), { recursive: true });
  writeFileSync(join(skillLink(config), 'SKILL.md'), 'mine');
  assert.throws(() => installSkill({ skillDir: SKILL_DIR, configDir: config }), /is a real folder.*--force/s);
  assert.equal(readFileSync(join(skillLink(config), 'SKILL.md'), 'utf8'), 'mine');
  assert.ok(!existsSync(ruleFile(config)), 'nothing written after a refusal');

  const other = tempConfig();
  mkdirSync(join(other, 'rules'), { recursive: true });
  writeFileSync(ruleFile(other), 'my own rule');
  assert.throws(() => installSkill({ skillDir: SKILL_DIR, configDir: other }), /differs.*--force/s);
  assert.equal(readFileSync(ruleFile(other), 'utf8'), 'my own rule');
  assert.ok(!existsSync(skillLink(other)), 'nothing linked after a refusal');
});

test('--force moves the real folder and rule aside, then installs', () => {
  const config = tempConfig();
  mkdirSync(skillLink(config), { recursive: true });
  writeFileSync(join(skillLink(config), 'SKILL.md'), 'mine');
  mkdirSync(join(config, 'rules'), { recursive: true });
  writeFileSync(ruleFile(config), 'my own rule');
  const actions = installSkill({ skillDir: SKILL_DIR, configDir: config, force: true });
  assert.ok(lstatSync(skillLink(config)).isSymbolicLink());
  assert.equal(readFileSync(ruleFile(config), 'utf8'), RULE);
  const backups = readdirSync(join(config, 'skills')).filter((f) => f.startsWith('repo-explainer.backup-'));
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(join(config, 'skills', backups[0], 'SKILL.md'), 'utf8'), 'mine');
  assert.ok(readdirSync(join(config, 'rules')).some((f) => f.startsWith('repo-explainer.md.backup-')));
  assert.ok(actions.some((a) => /moved/.test(a)));
});

test('a skill cloned straight into the skills folder counts as installed', () => {
  const config = tempConfig();
  mkdirSync(join(config, 'skills'), { recursive: true });
  symlinkSync(SKILL_DIR, skillLink(config));
  const [action] = installSkill({ skillDir: skillLink(config), configDir: config });
  assert.match(action, /already/);
  assert.equal(readlinkSync(skillLink(config)), SKILL_DIR);
});
