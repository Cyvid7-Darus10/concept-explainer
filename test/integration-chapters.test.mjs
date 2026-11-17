import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CHAPTER_KEYS, TYPE_RULES } from '../scripts/lib/schema.mjs';
import { listTypePresets } from '../scripts/lib/init.mjs';
import { buildExplainer } from '../scripts/lib/build.mjs';
import { bootPage } from './page-harness.mjs';

// The backend's chapter keys and the page's chapter table must agree: every
// key has one entry, every entry draws with a function the build ships, and
// every type's chapters exist.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const APP = read('../template/js/app.js');
const BUILD = read('../scripts/lib/build.mjs');

const chaptersBlock = APP.slice(APP.indexOf('const CHAPTERS = ['), APP.indexOf('];', APP.indexOf('const CHAPTERS = [')));
const ENTRIES = [...chaptersBlock.matchAll(/\{\s*key:\s*'([\w-]+)'[\s\S]*?render:\s*([\w$]+)/g)].map((m) => ({ key: m[1], render: m[2] }));
const SCRIPT_ORDER = JSON.parse(BUILD.match(/const SCRIPT_ORDER = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
const shippedSource = SCRIPT_ORDER.map((f) => read(`../template/js/${f}`)).join('\n');
const allSources = [
  ...readdirSync(new URL('../template/js/', import.meta.url)).filter((f) => f.endsWith('.js')),
  ...readdirSync(new URL('../template/js/chapters/', import.meta.url)).map((f) => `chapters/${f}`),
].map((f) => ({ file: f, source: read(`../template/js/${f}`) }));
const defines = (name, source) => new RegExp(`(function\\s+${name}\\s*\\(|(const|let)\\s+${name}\\s*=)`).test(source);
const CODE_TODO = ENTRIES.some((e) => e.key === 'code') ? false : 'the code walkthrough chapter is not wired into app.js yet';

test('the chapter table parses', () => {
  assert.ok(ENTRIES.length >= 16, `found ${ENTRIES.length} entries`);
});

for (const key of CHAPTER_KEYS) {
  test(`chapter "${key}" has exactly one entry in app.js`, { todo: key === 'code' ? CODE_TODO : false }, () => {
    assert.equal(ENTRIES.filter((e) => e.key === key).length, 1);
  });
}

test('the walkthrough chapter key is in the schema once the chapter ships', { todo: CHAPTER_KEYS.includes('code') ? false : 'schema CHAPTER_KEYS has no "code" yet' }, () => {
  assert.ok(CHAPTER_KEYS.includes('code'));
});

test('every chapter entry is a schema chapter key', () => {
  ENTRIES.forEach((e) => assert.ok(CHAPTER_KEYS.includes(e.key) || e.key === 'code', `${e.key} is not in CHAPTER_KEYS`));
});

test('every chapter renderer is defined in a file the build ships', () => {
  ENTRIES.forEach(({ key, render }) => {
    const home = allSources.find((s) => defines(render, s.source));
    assert.ok(home, `${key}: ${render} is defined nowhere`);
    assert.ok(defines(render, shippedSource), `${key}: ${render} lives in ${home.file}, which build.mjs SCRIPT_ORDER does not include`);
  });
});

test('every chapter a type uses has an entry', () => {
  const keys = new Set(ENTRIES.map((e) => e.key));
  Object.entries(TYPE_RULES).forEach(([type, rule]) => rule.chapters.forEach((c) => assert.ok(keys.has(c), `${type}: ${c}`)));
  listTypePresets().forEach((p) => p.chapters.forEach((c) => assert.ok(keys.has(c), `presets/types/${p.type}.json: ${c}`)));
});

test('intros override the heading and lead of the v2 chapters', () => {
  const data = JSON.parse(read('../examples/pr-cursor-paging.explainer.json'));
  const intros = {
    context: { title: 'Why we changed paging', lead: 'Custom context lead.' },
    diff: { title: 'Every file, line by line', lead: 'Custom diff lead.' },
    risks: { title: 'What we worried about', lead: 'Custom risks lead.' },
  };
  const page = bootPage(buildExplainer({ ...data, intros }, { context: {} }));
  Object.entries(intros).forEach(([key, intro]) => {
    const { view, section } = page.route(key);
    assert.equal(view, key);
    const heading = section.querySelector('h1');
    assert.equal(heading.textContent, intro.title, key);
    assert.ok(section.textContent.includes(intro.lead), key);
  });
});
