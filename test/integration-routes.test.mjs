import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildExplainer } from '../scripts/lib/build.mjs';
import { buildSearchIndex } from '../scripts/lib/search-index.mjs';
import { bootPage, snapshot } from './page-harness.mjs';

// Every href the library search can produce must land on a real view and on
// its own item there, never on the chapter's fallback. The page's own router
// runs in node:vm (page-harness.mjs).
const SOURCES = {
  'acme-taskflow': '../examples/taskflow.explainer.json',
  'acme-taskflow-pr-512': '../examples/pr-cursor-paging.explainer.json',
  'acme-taskflow-proposal-0007-live-updates': '../examples/proposal-live-updates.explainer.json',
  'idempotency-keys': '../examples/concept-idempotency-keys.explainer.json',
  'chapters-all': './fixtures/chapters-all.explainer.json',
};
const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const APP = readFileSync(new URL('../template/js/app.js', import.meta.url), 'utf8');
// The code walkthrough chapter is planned but may not be wired into the page yet.
const CODE_WIRED = /key:\s*'code'/.test(APP);
// Types that open a whole chapter, not one item in it.
const CHAPTER_LEVEL = new Set(['explainer', 'run']);

const hashOf = (href) => href.split('#')[1] || '';
const viewOf = (hash) => decodeURIComponent((hash.split('/')[0]) || 'overview');

for (const [slug, path] of Object.entries(SOURCES)) {
  test(`${slug}: every search href lands on its view and its own item`, async (t) => {
    const data = load(path);
    const page = bootPage(buildExplainer(data, { context: { slug } }));
    const shown = new Set(page.views());
    // Hrefs into chapters this page does not show are checked on their own, below.
    const entries = buildSearchIndex(slug, data).filter((e) => shown.has(viewOf(hashOf(e.href))) || viewOf(hashOf(e.href)) === 'code');
    assert.ok(entries.length > 5, 'the index has entries to check');
    const byType = new Map();
    entries.forEach((e) => byType.set(e.type, [...(byType.get(e.type) || []), e]));

    for (const [type, group] of byType) {
      const isCode = group.some((e) => viewOf(hashOf(e.href)) === 'code');
      await t.test(type, { todo: isCode && !CODE_WIRED ? 'the code walkthrough chapter is not wired into app.js yet' : false }, () => {
        const hrefs = [...new Set(group.map((e) => e.href))];
        const states = hrefs.map((href) => {
          const hash = hashOf(href);
          const landed = page.route(hash);
          assert.equal(landed.view, viewOf(hash), `${hash} opened "${landed.view}" instead of its own view`);
          return { hash, state: snapshot(landed.section) };
        });
        if (CHAPTER_LEVEL.has(type)) return;
        if (states.length > 1) {
          // Fallback would leave every item showing the same state.
          const seen = new Map();
          states.forEach(({ hash, state }) => {
            assert.ok(!seen.has(state), `${hash} shows the same state as ${seen.get(state)}: the router fell back instead of opening the item`);
            seen.set(state, hash);
          });
        } else {
          const [{ hash }] = states;
          const entry = group[0];
          const { section } = page.route(hash);
          assert.ok(section.textContent.includes(entry.title), `${hash}: "${entry.title}" is not on the view`);
        }
      });
    }
  });
}

test('an unknown id falls back to its chapter, and an unknown chapter to the overview', () => {
  const page = bootPage(buildExplainer(load('../examples/taskflow.explainer.json'), { context: {} }));
  assert.equal(page.route('flows/no-such-flow').view, 'flows');
  assert.equal(page.route('concepts/99').view, 'concepts');
  assert.equal(page.route('no-such-chapter/x').view, 'overview');
  assert.equal(page.route('').view, 'overview');
});

// FINDING (backend, scripts/lib/search-index.mjs): the index links into every
// chapter that has data, but a page shows only meta.chapters when it is set.
// Those hrefs open the Overview. Seen in pr-cursor-paging and
// proposal-live-updates (glossary) and chapters-all (quiz).
test('the search index links only to chapters the page shows', { todo: 'finding for backend: search-index.mjs should follow meta.chapters' }, () => {
  const hidden = [];
  for (const [slug, path] of Object.entries(SOURCES)) {
    const data = load(path);
    const shown = new Set(bootPage(buildExplainer(data, { context: { slug } })).views());
    buildSearchIndex(slug, data).forEach((e) => {
      const view = viewOf(hashOf(e.href));
      if (view !== 'code' && !shown.has(view)) hidden.push(`${slug}: ${hashOf(e.href)}`);
    });
  }
  assert.deepEqual(hidden, []);
});
