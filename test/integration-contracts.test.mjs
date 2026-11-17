import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishExplainer, writeConfig, libraryPaths } from '../scripts/lib/library.mjs';
import { CONFIG_KEYS, validateConfig } from '../scripts/lib/config.mjs';
import { CONFLICT_MODES } from '../scripts/lib/bundle.mjs';
import { HELP } from '../scripts/lib/cli/help.mjs';

// What the page code reads must be what the build writes, and the commands a
// page shows must be ones the CLI accepts.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const APP = read('../template/js/app.js');
const SETTINGS = read('../template/js/settings.js');
const LIBRARY_JS = read('../template/js/library.js');
const GALLERY = read('../template/js/gallery.js');
const MAIN = read('../scripts/lib/cli/main.mjs');
const SERVE = read('../scripts/lib/serve.mjs');
const example = JSON.parse(read('../examples/taskflow.explainer.json'));
const tag = (html, id) => JSON.parse(html.match(new RegExp(`id="${id}">([\\s\\S]*?)</script>`))[1]);
const MARKER = 'private-house-note-7f3a';

function library() {
  const root = mkdtempSync(join(tmpdir(), 'rx-contract-'));
  const home = join(root, 'home');
  writeConfig(home, { instructions: `Use ${MARKER}.`, audience: 'expert' });
  const sourcePath = join(root, 'work', 'taskflow', '.explainer', 'explainer.json');
  const { pagePath } = publishExplainer(example, { home, sourcePath, repoPath: join(root, 'work', 'taskflow') });
  return {
    root,
    page: readFileSync(pagePath, 'utf8'),
    hub: readFileSync(libraryPaths(home).hub, 'utf8'),
    kit: readFileSync(libraryPaths(home).kit, 'utf8'),
  };
}

test('library pages give the page code every context and data field it reads', () => {
  const { page, hub, kit } = library();
  const pageContext = tag(page, 'explainer-context');
  ['libraryHref', 'slug', 'style', 'config'].forEach((k) => assert.ok(k in pageContext, `explainer context.${k}`));
  const reads = [...new Set([...`${APP}\n${SETTINGS}`.matchAll(/context\.(\w+)/g)].map((m) => m[1]))]
    .filter((k) => !['serve', 'problem', 'goals', 'nonGoals', 'background'].includes(k));
  reads.forEach((k) => assert.ok(k in pageContext, `the page reads context.${k}, which the build never writes`));
  const hubData = tag(hub, 'explainer-data');
  // serve arrives at run time (library serve), like context.serve; the page treats it as optional.
  [...new Set([...LIBRARY_JS.matchAll(/\bdata\.(\w+)/g)].map((m) => m[1]))].filter((k) => k !== 'serve')
    .forEach((k) => assert.ok(k in hubData, `the hub reads data.${k}, which the build never writes`));
  assert.equal(tag(kit, 'explainer-context').libraryHref, 'index.html');
});

test('no page embeds the private instructions, and the hub carries no absolute paths', () => {
  const { root, page, hub, kit } = library();
  [page, hub, kit].forEach((html) => assert.ok(!html.includes(MARKER), 'instructions leaked into a page'));
  [tag(page, 'explainer-context').config, tag(hub, 'explainer-data').config, tag(hub, 'explainer-context').config, tag(kit, 'explainer-context').config]
    .forEach((config) => {
      assert.equal(config.audience, 'expert', 'the rest of the config is there');
      assert.ok(!('instructions' in config));
    });
  assert.ok(!hub.includes(root), 'the hub holds a local path');
  tag(hub, 'explainer-data').manifest.explainers.forEach((e) => {
    assert.ok(!('sourcePath' in e) && !('repoPath' in e));
  });
});

test('every Settings field is a config key, and every option it offers is a valid value', () => {
  const block = SETTINGS.slice(SETTINGS.indexOf('instructions:') > 0 ? SETTINGS.lastIndexOf('\n', SETTINGS.indexOf('style: { label:')) : 0, SETTINGS.indexOf('instructions:') + 300);
  const fields = [...block.matchAll(/^\s{2}(\w+):\s*\{\s*label:/gm)].map((m) => m[1]);
  assert.ok(fields.length >= 10, `found ${fields.join(', ')}`);
  fields.forEach((key) => assert.ok(CONFIG_KEYS.includes(key), `Settings shows "${key}", which is not a config key`));
  // One chunk per field, from its name to the next field's name.
  const starts = [...block.matchAll(/^\s{2}(\w+):\s*\{\s*label:/gm)];
  let checked = 0;
  starts.forEach((m, i) => {
    const chunk = block.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : block.length);
    const list = (chunk.match(/options:\s*\[([\s\S]*?)\]\s*[,}]/) || [])[1];
    if (!list) return;
    // opt('value', 'Label', 'help') lists give their values first; plain lists are the values.
    const values = /opt\(/.test(list) ? [...list.matchAll(/opt\('([^']+)'/g)].map((v) => v[1]) : [...list.matchAll(/'([^']+)'/g)].map((v) => v[1]);
    values.forEach((value) => {
      const candidate = m[1] === 'visuals' ? [value] : value;
      assert.deepEqual(validateConfig({ [m[1]]: candidate }).errors, [], `${m[1]} offers "${value}"`);
      checked += 1;
    });
  });
  assert.ok(checked >= 20, `only ${checked} option values were checked`);
});

test('the export filters the hub shows are flags the CLI and the server take', () => {
  const params = [...LIBRARY_JS.matchAll(/\['(\w+)', state\.\w+\]|\['(search)', input/g)].map((m) => m[1] || m[2]);
  assert.deepEqual(params.sort(), ['search', 'stack', 'tag', 'type']);
  params.forEach((p) => {
    assert.match(MAIN, new RegExp(`\\b${p}: \\{ type: 'string'`), `CLI option --${p}`);
    assert.match(SERVE, new RegExp(`one\\('${p}'\\)`), `/api/export reads ${p}`);
  });
  assert.match(SERVE, /list\('slugs'\)/, '/api/export reads slugs, which the hub sends for picked explainers');
});

test('every command a page shows is a command the CLI has, with flags it accepts', () => {
  const shown = [...`${APP}\n${SETTINGS}\n${LIBRARY_JS}\n${GALLERY}`.matchAll(/concept-explainer ([a-z][\w-]*)(?: ([a-z][\w-]*))?/g)]
    .map((m) => ({ command: m[1], sub: m[2] }))
    .filter(({ command }) => !['skill', 'bundle'].includes(command));
  assert.ok(shown.length >= 5);
  shown.forEach(({ command }) => assert.ok(HELP.includes(`concept-explainer ${command}`) || HELP.includes(`  ${command} `), `"${command}" is not a CLI command`));
  const flags = [...`${SETTINGS}\n${LIBRARY_JS}`.matchAll(/\$\{CLI_NAME\}[^`]*?(--[a-z-]+)/g)].map((m) => m[1]);
  flags.forEach((flag) => assert.match(MAIN, new RegExp(`'?${flag.slice(2)}'?: \\{ type:`), `the page shows ${flag}, which the CLI does not take`));
  const modes = [...SETTINGS.matchAll(/--on-conflict (\w+)/g)].map((m) => m[1]);
  modes.forEach((mode) => assert.ok(CONFLICT_MODES.includes(mode), mode));
});
