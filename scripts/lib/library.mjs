// The explainer library: one folder that holds every published explainer and
// a hub page to search them. Pure rules live in library-model.mjs; this file
// does the fs work. Layout and contract: references/library.md.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { buildExplainer, buildLibrary } from './build.mjs';
import { buildSearchIndex } from './search-index.mjs';
import {
  SLUG_PATTERN, baseSlugFor, chooseSlug, emptyManifest, entryFor, isManifest, upsertEntry, withoutEntry,
} from './library-model.mjs';

// Explainer pages link back to the hub with this relative path.
const HUB_FROM_PAGE = '../../index.html';

/** Library home: $REPO_EXPLAINER_HOME, else ~/.repo-explainer. */
export function resolveHome(env = process.env) {
  return env.REPO_EXPLAINER_HOME || join(homedir(), '.repo-explainer');
}

export function libraryPaths(home) {
  const explainers = join(home, 'explainers');
  return {
    home,
    hub: join(home, 'index.html'),
    manifest: join(home, 'library.json'),
    explainers,
    dirFor: (slug) => join(explainers, slug),
  };
}

/** Write via a temp file in the same folder, then rename, so readers never see half a file. */
export function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  try {
    writeFileSync(temp, content);
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw new Error(`write ${path}: ${error.message}`);
  }
}

const now = () => new Date().toISOString();
const toJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

function readStoredData(paths, slug) {
  try {
    return JSON.parse(readFileSync(join(paths.dirFor(slug), 'explainer.json'), 'utf8'));
  } catch {
    return null;
  }
}

// Every explainers/<slug>/explainer.json that parses, as [slug, data, mtime].
function scanStored(paths) {
  if (!existsSync(paths.explainers)) return [];
  return readdirSync(paths.explainers)
    .filter((slug) => SLUG_PATTERN.test(slug))
    .map((slug) => [slug, readStoredData(paths, slug)])
    .filter(([, data]) => data && typeof data === 'object')
    .map(([slug, data]) => [slug, data, statSync(join(paths.dirFor(slug), 'explainer.json')).mtime.toISOString()]);
}

function recoverManifest(paths) {
  const at = now();
  return scanStored(paths).reduce(
    (manifest, [slug, data, mtime]) => upsertEntry(manifest, entryFor(data, { slug, publishedAt: mtime }), at),
    emptyManifest(at),
  );
}

/**
 * Read library.json. A missing file is an empty library. A corrupt one is
 * moved aside to library.json.corrupt-<time> and rebuilt from the stored data.
 * @returns {{ manifest: object, recovered: boolean, backupPath: string|null }}
 */
export function readManifest(home) {
  const paths = libraryPaths(home);
  if (!existsSync(paths.manifest)) return { manifest: emptyManifest(now()), recovered: false, backupPath: null };
  let parsed = null;
  try {
    parsed = JSON.parse(readFileSync(paths.manifest, 'utf8'));
  } catch {
    parsed = null;
  }
  if (isManifest(parsed)) return { manifest: parsed, recovered: false, backupPath: null };
  const backupPath = `${paths.manifest}.corrupt-${now().replace(/[:.]/g, '-')}`;
  renameSync(paths.manifest, backupPath);
  const manifest = recoverManifest(paths);
  writeAtomic(paths.manifest, toJson(manifest));
  return { manifest, recovered: true, backupPath };
}

/** Rewrite the hub page from the manifest and each stored explainer. */
export function writeHub(home, manifest, options = {}) {
  const paths = libraryPaths(home);
  const index = manifest.explainers.flatMap((entry) => buildSearchIndex(entry.slug, readStoredData(paths, entry.slug) || { meta: entry }));
  writeAtomic(paths.hub, buildLibrary(manifest, index, options));
  return paths.hub;
}

function writePage(paths, slug, data, options) {
  const pagePath = join(paths.dirFor(slug), 'index.html');
  writeAtomic(pagePath, buildExplainer(data, { templateDir: options.templateDir, context: { libraryHref: HUB_FROM_PAGE, slug } }));
  return pagePath;
}

/**
 * Copy an explainer into the library, build its page, and refresh the hub.
 * @param {object} data validated explainer data
 * @param {{ home?: string, sourcePath?: string, repoPath?: string, templateDir?: string }} [options]
 * @returns {{ slug: string, updated: boolean, pagePath: string, hubPath: string, recovered: boolean }}
 */
export function publishExplainer(data, options = {}) {
  if (!data || typeof data !== 'object' || !data.meta || typeof data.meta !== 'object') {
    throw new Error('publish explainer: data has no meta object');
  }
  const home = options.home || resolveHome();
  const paths = libraryPaths(home);
  const { manifest, recovered } = readManifest(home);
  const source = { repo: data.meta.repo, repoPath: options.repoPath, sourcePath: options.sourcePath };
  const { slug, existing } = chooseSlug(manifest.explainers, baseSlugFor(data, options), source);
  const at = now();

  writeAtomic(join(paths.dirFor(slug), 'explainer.json'), toJson(data));
  const pagePath = writePage(paths, slug, data, options);
  const entry = entryFor(data, { slug, sourcePath: options.sourcePath, repoPath: options.repoPath, publishedAt: at });
  const next = upsertEntry(manifest, entry, at);
  writeAtomic(paths.manifest, toJson(next));
  const hubPath = writeHub(home, next, options);
  return { slug, updated: existing, pagePath, hubPath, recovered };
}

/** Delete one explainer from the library and refresh the hub. */
export function removeExplainer(slug, options = {}) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) throw new Error(`remove explainer: invalid slug "${slug}"`);
  const home = options.home || resolveHome();
  const paths = libraryPaths(home);
  const { manifest } = readManifest(home);
  if (!manifest.explainers.some((e) => e.slug === slug)) throw new Error(`remove explainer: no explainer "${slug}" in ${home}`);
  rmSync(paths.dirFor(slug), { recursive: true, force: true });
  const next = withoutEntry(manifest, slug, now());
  writeAtomic(paths.manifest, toJson(next));
  writeHub(home, next, options);
  return { slug, hubPath: paths.hub };
}

/**
 * Re-render every page and the hub from the stored data with the current
 * template. Entries whose data is gone or broken are dropped; folders with
 * data but no entry are adopted.
 * @returns {{ rebuilt: string[], skipped: string[], hubPath: string }}
 */
export function rebuildLibrary(options = {}) {
  const home = options.home || resolveHome();
  const paths = libraryPaths(home);
  const { manifest } = readManifest(home);
  const known = new Map(manifest.explainers.map((e) => [e.slug, e]));
  const stored = new Map(scanStored(paths).map(([slug, data, mtime]) => [slug, { data, mtime }]));
  const at = now();

  const skipped = [...known.keys()].filter((slug) => !stored.has(slug));
  const next = [...stored].reduce((acc, [slug, { data, mtime }]) => {
    const previous = known.get(slug) || {};
    writePage(paths, slug, data, options);
    const entry = entryFor(data, { slug, sourcePath: previous.sourcePath, repoPath: previous.repoPath, publishedAt: previous.publishedAt || mtime });
    return upsertEntry(acc, entry, at);
  }, emptyManifest(at));

  writeAtomic(paths.manifest, toJson(next));
  const hubPath = writeHub(home, next, options);
  return { rebuilt: [...stored.keys()], skipped, hubPath };
}

/** Manifest entries, newest first. Never writes unless the manifest is corrupt. */
export function listExplainers(options = {}) {
  return readManifest(options.home || resolveHome()).manifest.explainers;
}

/** Make sure the hub page exists (an empty library still gets one). */
export function ensureHub(options = {}) {
  const home = options.home || resolveHome();
  const paths = libraryPaths(home);
  if (existsSync(paths.hub)) return paths.hub;
  return writeHub(home, readManifest(home).manifest, options);
}
