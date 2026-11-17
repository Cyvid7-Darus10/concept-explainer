// Pure library logic: slugs, manifest entries and manifest updates.
// No fs here; scripts/lib/library.mjs does the reading and writing.
// Documented for humans in references/library.md: keep them in sync.
import { basename, dirname } from 'node:path';

export const MANIFEST_VERSION = 1;
export const SLUG_MAX = 64;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FALLBACK_SLUG = 'explainer';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const str = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const count = (value) => (Array.isArray(value) ? value.length : 0);

/**
 * Lowercase kebab, [a-z0-9-] only, at most `max` characters.
 * @param {string} value
 * @param {number} [max]
 */
export function slugify(value, max = SLUG_MAX) {
  const slug = String(value ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
  return slug || FALLBACK_SLUG;
}

/**
 * The slug an explainer would like: meta.repo, else the repo folder, else the
 * data file's folder (".explainer" stands for the repo folder above it).
 */
export function baseSlugFor(data, { repoPath, sourcePath } = {}) {
  const repo = isObject(data) && isObject(data.meta) ? str(data.meta.repo) : null;
  if (repo) return slugify(repo);
  if (str(repoPath)) return slugify(basename(repoPath));
  if (str(sourcePath)) {
    const folder = dirname(sourcePath);
    return slugify(basename(folder) === '.explainer' ? basename(dirname(folder)) : basename(folder));
  }
  return FALLBACK_SLUG;
}

/**
 * Two entries describe the same explainer when their repo names match, else
 * their repo folders, else their data files.
 */
export function sameSource(entry, source) {
  if (str(entry.repo) && str(source.repo)) return entry.repo === source.repo;
  if (str(entry.repoPath) && str(source.repoPath)) return entry.repoPath === source.repoPath;
  if (str(entry.sourcePath) && str(source.sourcePath)) return entry.sourcePath === source.sourcePath;
  return false;
}

/**
 * Reuse the slug of the same source, else take `base`, else `base-2`, `base-3`...
 * @returns {{ slug: string, existing: boolean }}
 */
export function chooseSlug(entries, base, source) {
  const match = entries.find((entry) => sameSource(entry, source));
  if (match) return { slug: match.slug, existing: true };
  const taken = new Set(entries.map((entry) => entry.slug));
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? '' : `-${n}`;
    const slug = `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!taken.has(slug)) return { slug, existing: false };
  }
}

/**
 * The manifest entry for one explainer.
 * @param {object} data explainer data
 * @param {{ slug: string, sourcePath?: string, repoPath?: string, publishedAt: string }} where
 */
export function entryFor(data, { slug, sourcePath, repoPath, publishedAt }) {
  const d = isObject(data) ? data : {};
  const meta = isObject(d.meta) ? d.meta : {};
  return {
    slug,
    title: str(meta.title) || slug,
    summary: str(meta.summary) || '',
    repo: str(meta.repo),
    sourcePath: str(sourcePath),
    repoPath: str(repoPath),
    stack: Array.isArray(meta.stack) ? meta.stack.filter((s) => typeof s === 'string') : [],
    preset: str(meta.preset),
    commit: str(meta.commit),
    generatedAt: str(meta.generatedAt),
    publishedAt,
    counts: {
      layers: count(d.layers),
      nodes: count(d.nodes),
      flows: count(d.flows),
      changes: count(d.changes),
      concepts: count(d.concepts),
      files: count(d.tree),
      quiz: count(d.quiz),
    },
    layers: (Array.isArray(d.layers) ? d.layers : []).filter(isObject).map((layer) => ({ label: str(layer.label) || '', color: str(layer.color) || '' })),
  };
}

export function emptyManifest(updatedAt) {
  return { version: MANIFEST_VERSION, updatedAt, explainers: [] };
}

export function isManifest(value) {
  return isObject(value)
    && value.version === MANIFEST_VERSION
    && Array.isArray(value.explainers)
    && value.explainers.every((entry) => isObject(entry) && typeof entry.slug === 'string' && SLUG_PATTERN.test(entry.slug));
}

const newestFirst = (a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')) || a.slug.localeCompare(b.slug);

/** A new manifest with `entry` added or replaced (by slug), newest first. */
export function upsertEntry(manifest, entry, updatedAt) {
  const others = manifest.explainers.filter((e) => e.slug !== entry.slug);
  return { ...manifest, updatedAt, explainers: [...others, entry].sort(newestFirst) };
}

/** A new manifest without the entry for `slug`. */
export function withoutEntry(manifest, slug, updatedAt) {
  return { ...manifest, updatedAt, explainers: manifest.explainers.filter((e) => e.slug !== slug) };
}
