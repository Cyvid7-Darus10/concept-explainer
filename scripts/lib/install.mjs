// `repo-explainer install`: link this skill into Claude's skills folder and
// copy the library rule into its rules folder. Safe to run again: it never
// replaces a real folder or an edited rule unless `force` is set, and even
// then it moves the old one aside instead of deleting it.
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { writeAtomic } from './library.mjs';

export const SKILL_NAME = 'repo-explainer';
const RULE_SOURCE = join('rules', 'repo-explainer.md');

/** Claude config folder: $CLAUDE_CONFIG_DIR, else ~/.claude. */
export function resolveConfigDir(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

const lstatOrNull = (path) => {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
};

const realOrNull = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
};

const backupName = (path) => `${path}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;

// Decide what to do with the skill link before touching anything.
function planSkill(skillDir, target, force) {
  const stat = lstatOrNull(target);
  if (!stat) return { kind: 'link' };
  if (realOrNull(target) === realOrNull(skillDir)) return { kind: 'noop' };
  if (stat.isSymbolicLink()) return { kind: 'relink' };
  if (!force) {
    const what = stat.isDirectory() ? 'a real folder' : 'a real file';
    throw new Error(`install: ${target} is ${what}, not a link to this skill. Move it away or rerun with --force (it will be kept as a backup)`);
  }
  return { kind: 'replace' };
}

function planRule(ruleText, target, force) {
  if (!existsSync(target)) return { kind: 'write' };
  const stat = lstatSync(target);
  if (!stat.isSymbolicLink() && readFileSync(target, 'utf8') === ruleText) return { kind: 'noop' };
  if (!stat.isSymbolicLink() && !force) {
    throw new Error(`install: ${target} differs from this skill's rule. Rerun with --force to replace it (it will be kept as a backup)`);
  }
  return { kind: stat.isSymbolicLink() ? 'unlink' : 'replace' };
}

/**
 * @param {{ skillDir: string, configDir?: string, force?: boolean }} options
 * @returns {string[]} one line per thing done
 */
export function installSkill({ skillDir, configDir = resolveConfigDir(), force = false }) {
  const source = resolve(skillDir);
  const skillTarget = join(configDir, 'skills', SKILL_NAME);
  const ruleTarget = join(configDir, 'rules', 'repo-explainer.md');
  const ruleText = readFileSync(join(source, RULE_SOURCE), 'utf8');

  // Plan both first, so a refusal leaves nothing half done.
  const skill = planSkill(source, skillTarget, force);
  const rule = planRule(ruleText, ruleTarget, force);
  const actions = [];

  if (skill.kind === 'noop') {
    actions.push(`skill already linked: ${skillTarget}`);
  } else {
    mkdirSync(join(configDir, 'skills'), { recursive: true });
    if (skill.kind === 'relink') rmSync(skillTarget);
    if (skill.kind === 'replace') {
      const backup = backupName(skillTarget);
      renameSync(skillTarget, backup);
      actions.push(`moved the old skill folder to ${backup}`);
    }
    symlinkSync(source, skillTarget, 'dir');
    actions.push(`${skill.kind === 'relink' ? 'relinked' : 'linked'} ${skillTarget} -> ${source}`);
  }

  if (rule.kind === 'noop') {
    actions.push(`rule up to date: ${ruleTarget}`);
  } else {
    if (rule.kind === 'unlink') rmSync(ruleTarget);
    if (rule.kind === 'replace') {
      const backup = backupName(ruleTarget);
      renameSync(ruleTarget, backup);
      actions.push(`moved the old rule to ${backup}`);
    }
    writeAtomic(ruleTarget, ruleText);
    actions.push(`wrote ${ruleTarget}`);
  }
  return actions;
}
