// library, install and config commands, plus publishing used by build.
import { resolve } from 'node:path';
import {
  ensureHub, libraryPaths, listExplainers, publishExplainer, readConfig, rebuildLibrary, removeExplainer, resolveHome, styleFor, writeConfig,
} from '../library.mjs';
import { installSkill, resolveConfigDir } from '../install.mjs';
import { CONFIG_DEFAULTS, setConfigValue } from '../config.mjs';
import { startLibraryServer } from '../serve.mjs';
import { openPath } from '../open.mjs';
import { validateExplainer } from '../validate.mjs';
import {
  BIN, UsageError, asUsage, printJson, readJson, report, requirePositional,
} from './io.mjs';

const home = () => resolveHome();

// The style for this run: --style when given, else the library default. Checked before any work.
export function chosenStyle(opts) {
  return asUsage(() => styleFor(home(), opts.style));
}

export function validated(file, opts) {
  const data = readJson(file);
  if (!report(validateExplainer(data, { repoRoot: opts.repo && resolve(opts.repo) }), opts.strict)) {
    process.exitCode = 1;
    return null;
  }
  return data;
}

export function publish(data, file, opts, style) {
  const result = publishExplainer(data, { home: home(), sourcePath: resolve(file), repoPath: opts.repo && resolve(opts.repo), style });
  if (result.recovered) process.stderr.write('  ⚠ library.json was corrupt; it was backed up and rebuilt\n');
  process.stderr.write(`✔ ${result.updated ? 'updated' : 'added'} ${result.slug} in the library\n  page: ${result.pagePath}\n  library: ${result.hubPath}\n`);
  return result;
}

const LIBRARY = {
  list() {
    const entries = listExplainers({ home: home() });
    if (!entries.length) {
      process.stdout.write(`The library is empty. Run \`${BIN} build <explainer.json>\` to add one.\n`);
      return;
    }
    const width = Math.max(...entries.map((e) => e.slug.length)) + 2;
    entries.forEach((e) => process.stdout.write(`${e.slug.padEnd(width)}${e.type.padEnd(11)}${e.title}  (${String(e.publishedAt).slice(0, 10)})\n`));
    process.stdout.write(`\n${entries.length} explainer(s). Hub: ${libraryPaths(home()).hub}\n`);
  },
  path() {
    process.stdout.write(`${libraryPaths(home()).hub}\n`);
  },
  add(positionals, opts) {
    const file = requirePositional(positionals, '<explainer.json>');
    const style = chosenStyle(opts);
    const data = validated(file, opts);
    if (data) publish(data, file, opts, style);
  },
  remove(positionals) {
    const slug = requirePositional(positionals, '<slug>');
    asUsage(() => removeExplainer(slug, { home: home() }));
    process.stderr.write(`✔ removed ${slug}\n  library: ${libraryPaths(home()).hub}\n`);
  },
  rebuild(_positionals, opts) {
    const { rebuilt, skipped, hubPath } = rebuildLibrary({ home: home(), style: chosenStyle(opts) });
    skipped.forEach((slug) => process.stderr.write(`  ⚠ dropped ${slug}: its explainer.json is missing or broken\n`));
    process.stderr.write(`✔ rebuilt ${rebuilt.length} explainer(s)\n  library: ${hubPath}\n`);
  },
  open() {
    openPath(ensureHub({ home: home() }));
  },
  style(positionals) {
    if (!positionals[0]) {
      process.stdout.write(`${readConfig(home()).style}\n`);
      return;
    }
    const config = asUsage(() => writeConfig(home(), { style: positionals[0] }));
    process.stderr.write(`✔ default style: ${config.style}\n  run \`${BIN} library rebuild\` to restyle pages already in the library\n`);
  },
  async serve(_positionals, opts) {
    const port = opts.port === undefined ? 0 : Number(opts.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new UsageError(`--port "${opts.port}" is not a port number`);
    ensureHub({ home: home() });
    const served = await startLibraryServer({ home: home(), port });
    process.stdout.write(`Serving ${home()} on 127.0.0.1 only.\nOpen: ${served.url}\nSettings can save while this runs. Press Ctrl+C to stop.\n`);
    process.once('SIGINT', () => {
      served.close().then(() => process.stderr.write('\n✔ stopped\n'));
    });
  },
};

const CONFIG = {
  show(_positionals, opts) {
    const config = readConfig(home());
    if (opts.json) return printJson(config);
    Object.entries(config).forEach(([key, value]) => {
      process.stdout.write(`${key.padEnd(20)}${typeof value === 'string' ? value || '(empty)' : JSON.stringify(value)}\n`);
    });
    process.stdout.write(`\nSaved in ${libraryPaths(home()).config}\n`);
    return undefined;
  },
  get(positionals) {
    const key = requirePositional(positionals, '<key>');
    const config = readConfig(home());
    if (!(key in config)) throw new UsageError(`unknown setting "${key}" (use ${Object.keys(config).join(', ')})`);
    const value = config[key];
    process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value)}\n`);
  },
  set(positionals) {
    const [key, ...rest] = positionals;
    if (!key || !rest.length) throw new UsageError(`usage: ${BIN} config set <key> <value>`);
    const next = asUsage(() => setConfigValue(readConfig(home()), key, rest.join(' ')));
    asUsage(() => writeConfig(home(), next));
    process.stderr.write(`✔ ${key} = ${JSON.stringify(key.startsWith('chapters.') ? next.chapters : next[key])}\n  run \`${BIN} library rebuild\` to show it in pages already built\n`);
  },
  reset() {
    writeConfig(home(), CONFIG_DEFAULTS);
    process.stderr.write('✔ config reset to the defaults\n');
  },
};

export const LIBRARY_COMMANDS = {
  library(positionals, opts) {
    const [sub = 'list', ...rest] = positionals;
    const run = LIBRARY[sub];
    if (!run) throw new UsageError(`unknown library command "${sub}". Use list, path, add, remove, rebuild, open, style or serve`);
    return run(rest, opts);
  },

  config(positionals, opts) {
    const [sub = 'show', ...rest] = positionals;
    const run = CONFIG[sub];
    if (!run) throw new UsageError(`unknown config command "${sub}". Use get, set or reset, or no command to print`);
    return run(rest, opts);
  },

  install(_positionals, opts, context) {
    const actions = asUsage(() => installSkill({ skillDir: context.skillDir, configDir: resolveConfigDir(), force: Boolean(opts.force) }));
    actions.forEach((line) => process.stderr.write(`✔ ${line}\n`));
    process.stderr.write(`  library: ${libraryPaths(home()).hub}\n`);
  },
};
