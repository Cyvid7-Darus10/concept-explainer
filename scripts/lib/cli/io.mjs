// Shared CLI plumbing: usage errors, JSON files and the validation report.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const BIN = 'concept-explainer';

/** A mistake in how the CLI was called. Printed without a stack. */
export class UsageError extends Error {}

export function readJson(path) {
  if (!existsSync(path)) throw new UsageError(`file not found: ${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new UsageError(`could not parse ${path}: ${error.message}`);
  }
}

export function writeFile(path, content) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, content);
  process.stderr.write(`✔ wrote ${path}\n`);
}

export const toJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function printJson(value) {
  process.stdout.write(toJson(value));
}

export function report({ errors, warnings }, strict) {
  warnings.forEach((w) => process.stderr.write(`  ⚠ ${w}\n`));
  errors.forEach((e) => process.stderr.write(`  ✖ ${e}\n`));
  const failed = errors.length > 0 || (strict && warnings.length > 0);
  process.stderr.write(`${failed ? '✖' : '✔'} ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  return !failed;
}

export function requirePositional(positionals, label) {
  if (!positionals[0]) throw new UsageError(`missing ${label}. Run \`${BIN} --help\``);
  return positionals[0];
}

/** Run `fn`, turning a thrown error into a UsageError (for bad input, not bugs). */
export function asUsage(fn) {
  try {
    return fn();
  } catch (error) {
    throw new UsageError(error.message);
  }
}
