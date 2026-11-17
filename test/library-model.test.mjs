import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  slugify, baseSlugFor, chooseSlug, entryFor, upsertEntry, withoutEntry, emptyManifest, isManifest, SLUG_PATTERN,
} from '../scripts/lib/library-model.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));

test('slugify makes lowercase kebab from anything, capped at 64', () => {
  assert.equal(slugify('Acme/Task Flow'), 'acme-task-flow');
  assert.equal(slugify('  --Café__Ünïcode!!  '), 'cafe-unicode');
  assert.equal(slugify('../../etc/passwd'), 'etc-passwd');
  assert.equal(slugify('x'.repeat(100)).length, 64);
  assert.equal(slugify('!!!'), 'explainer');
  assert.match(slugify('a'.repeat(63) + '-b'), SLUG_PATTERN);
});

test('base slug prefers meta.repo, then the repo folder, then the data folder', () => {
  assert.equal(baseSlugFor(example, {}), 'acme-taskflow');
  assert.equal(baseSlugFor({ meta: {} }, { repoPath: '/work/My App' }), 'my-app');
  assert.equal(baseSlugFor({ meta: {} }, { sourcePath: '/work/shop/data/explainer.json' }), 'data');
  assert.equal(baseSlugFor({ meta: {} }, { sourcePath: '/work/shop/.explainer/explainer.json' }), 'shop', '.explainer means the repo above it');
  assert.equal(baseSlugFor({}, {}), 'explainer');
});

test('chooseSlug reuses the slug of the same source and suffixes a different one', () => {
  const entries = [
    { slug: 'shop', repo: 'acme/shop' },
    { slug: 'shop-2', repo: 'other/shop' },
    { slug: 'local', repoPath: '/a/local' },
  ];
  assert.deepEqual(chooseSlug(entries, 'shop', { repo: 'acme/shop' }), { slug: 'shop', existing: true });
  assert.deepEqual(chooseSlug(entries, 'shop', { repo: 'other/shop' }), { slug: 'shop-2', existing: true });
  assert.deepEqual(chooseSlug(entries, 'shop', { repo: 'third/shop' }), { slug: 'shop-3', existing: false });
  assert.deepEqual(chooseSlug(entries, 'local', { repoPath: '/a/local' }), { slug: 'local', existing: true });
  assert.deepEqual(chooseSlug(entries, 'local', { repoPath: '/b/local' }), { slug: 'local-2', existing: false });
  assert.deepEqual(chooseSlug(entries, 'fresh', { sourcePath: '/x.json' }), { slug: 'fresh', existing: false });
});

test('a suffixed slug still fits in 64 characters', () => {
  const base = 'a'.repeat(64);
  const { slug } = chooseSlug([{ slug: base, repo: 'one/x' }], base, { repo: 'two/x' });
  assert.equal(slug.length, 64);
  assert.ok(slug.endsWith('-2'));
});

test('entryFor summarises the data with counts and layers', () => {
  const entry = entryFor(example, { slug: 'acme-taskflow', sourcePath: '/s.json', repoPath: '/r', publishedAt: '2026-11-18T00:00:00.000Z' });
  assert.equal(entry.title, example.meta.title);
  assert.equal(entry.repo, 'acme/taskflow');
  assert.deepEqual(entry.stack, example.meta.stack);
  assert.equal(entry.counts.flows, example.flows.length);
  assert.equal(entry.counts.files, example.tree.length);
  assert.equal(entry.counts.quiz, example.quiz.length);
  assert.deepEqual(entry.layers[0], { label: example.layers[0].label, color: example.layers[0].color });
  assert.equal(entry.publishedAt, '2026-11-18T00:00:00.000Z');
  assert.deepEqual(Object.keys(entry).sort(), ['commit', 'counts', 'generatedAt', 'layers', 'preset', 'publishedAt', 'repo', 'repoPath', 'slug', 'sourcePath', 'stack', 'summary', 'title'].sort());
});

test('entryFor tolerates sparse data', () => {
  const entry = entryFor({}, { slug: 'x', publishedAt: 't' });
  assert.equal(entry.title, 'x');
  assert.equal(entry.repo, null);
  assert.deepEqual(entry.stack, []);
  assert.equal(entry.counts.nodes, 0);
});

test('upsertEntry and withoutEntry return new manifests, newest first', () => {
  const start = emptyManifest('t0');
  const a = upsertEntry(start, { slug: 'a', publishedAt: '2026-01-01' }, 't1');
  const b = upsertEntry(a, { slug: 'b', publishedAt: '2026-02-01' }, 't2');
  const a2 = upsertEntry(b, { slug: 'a', publishedAt: '2026-03-01', title: 'new' }, 't3');
  assert.deepEqual(start.explainers, []);
  assert.deepEqual(b.explainers.map((e) => e.slug), ['b', 'a']);
  assert.deepEqual(a2.explainers.map((e) => e.slug), ['a', 'b']);
  assert.equal(a2.explainers[0].title, 'new');
  assert.equal(a2.updatedAt, 't3');
  assert.deepEqual(withoutEntry(a2, 'a', 't4').explainers.map((e) => e.slug), ['b']);
  assert.equal(a2.explainers.length, 2, 'original untouched');
});

test('isManifest accepts only the documented shape', () => {
  assert.ok(isManifest(emptyManifest('t')));
  assert.ok(isManifest({ version: 1, updatedAt: 't', explainers: [{ slug: 'ok' }] }));
  assert.ok(!isManifest(null));
  assert.ok(!isManifest({ version: 1 }));
  assert.ok(!isManifest({ version: 1, explainers: [{ slug: '../evil' }] }));
  assert.ok(!isManifest({ version: 2, explainers: [] }));
});
