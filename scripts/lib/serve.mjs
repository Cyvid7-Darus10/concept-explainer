// `library serve`: the library over http on 127.0.0.1, so Settings can save
// config.json and Share can export and import. Every API call needs a
// per-run token in a header; writes also need the right Origin; every
// request needs the right Host (DNS rebinding). Files are read only and never
// leave the library folder. node:http only. Contract: references/library.md.
import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { readConfig, rebuildLibrary, writeConfig } from './library.mjs';
import { MAX_BUNDLE_BYTES, applyImport, createBundle, parseBundle, planImport } from './bundle.mjs';

export const HOST = '127.0.0.1';
export const TOKEN_HEADER = 'x-concept-explainer-token';
export const CONFIG_PATH = '/api/config';
export const EXPORT_PATH = '/api/export';
export const IMPORT_PATH = '/api/import';
const MAX_CONFIG_BODY = 64 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

const SAFE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-resource-policy': 'same-origin',
};

function sendJson(res, status, body) {
  res.writeHead(status, { ...SAFE_HEADERS, 'content-type': TYPES['.json'] });
  res.end(JSON.stringify(body));
}

const fail = (res, status, error) => sendJson(res, status, { error });

function sameToken(given, token) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function allowedOrigins(port) {
  return [`http://${HOST}:${port}`, `http://localhost:${port}`];
}

// A file inside the library, or null. Symlinks out of the library count as outside.
function resolveFile(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { status: 400 };
  }
  if (decoded.includes('\0') || decoded.split(/[\\/]/).includes('..')) return { status: 403 };
  let target = resolve(root, `.${decoded}`);
  if (target !== root && !target.startsWith(root + sep)) return { status: 403 };
  if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
  if (!existsSync(target)) return { status: 404 };
  const real = realpathSync(target);
  if (!real.startsWith(root + sep)) return { status: 403 };
  return statSync(real).isFile() ? { file: real } : { status: 404 };
}

const NON_PAGE_CSP = "default-src 'none'; frame-ancestors 'none'";
const hashOf = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

// A CSP for one built page: its own inline <script> and <style> blocks by
// hash, Google Fonts, and fetches back to this server. Style attributes set
// by the page's own code (CSS variables, positions) cannot be hashed, so
// style-src-attr allows them; that permits no style elements and no script.
export function pageCsp(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => hashOf(m[1]));
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => hashOf(m[1]));
  return [
    "default-src 'none'",
    `script-src ${scripts.join(' ') || "'none'"}`,
    `style-src ${[...styles, 'https://fonts.googleapis.com'].join(' ')}`,
    "style-src-attr 'unsafe-inline'",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function serveFile(root, url, req, res) {
  const found = resolveFile(root, url.pathname);
  if (!found.file) return fail(res, found.status, found.status === 404 ? 'not found' : 'not allowed');
  const ext = extname(found.file).toLowerCase();
  const body = readFileSync(found.file);
  const csp = ext === '.html' ? pageCsp(body.toString('utf8')) : NON_PAGE_CSP;
  res.writeHead(200, { ...SAFE_HEADERS, 'content-security-policy': csp, 'content-type': TYPES[ext] || 'application/octet-stream' });
  return res.end(req.method === 'HEAD' ? undefined : body);
}

function readBody(req, max) {
  return new Promise((done) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= max) chunks.push(chunk);
    });
    req.on('end', () => done(size > max ? null : Buffer.concat(chunks).toString('utf8')));
  });
}

const hasToken = (state, req) => sameToken(req.headers[TOKEN_HEADER], state.token);

// Every write: right origin, right token, JSON, under the size cap.
// Returns the body text, or null once it has replied with the refusal.
async function writeBody(state, req, res, max) {
  const refuse = (status, error) => {
    fail(res, status, error);
    return null;
  };
  if (!allowedOrigins(state.port).includes(req.headers.origin)) return refuse(403, 'wrong origin');
  if (!hasToken(state, req)) return refuse(403, 'wrong or missing token');
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return refuse(415, 'send application/json');
  const raw = await readBody(req, max);
  return raw === null ? refuse(413, `body over ${max} bytes`) : raw;
}

function exportBundle(state, url, res) {
  const list = (name) => (url.searchParams.get(name) || '').split(',').map((s) => s.trim()).filter(Boolean);
  const one = (name) => url.searchParams.get(name) || undefined;
  let result;
  try {
    result = createBundle(state.home, { slugs: list('slugs'), type: one('type'), tag: one('tag'), stack: one('stack'), search: one('search') });
  } catch (error) {
    return fail(res, 400, error.message);
  }
  const name = `explainers-${new Date().toISOString().slice(0, 10)}.explainers.json`;
  res.writeHead(200, { ...SAFE_HEADERS, 'content-type': TYPES['.json'], 'content-disposition': `attachment; filename="${name}"` });
  return res.end(JSON.stringify(result.bundle, null, 2));
}

async function importBundle(state, url, req, res) {
  const raw = await writeBody(state, req, res, MAX_BUNDLE_BYTES);
  if (raw === null) return undefined;
  let plan;
  try {
    plan = planImport(state.home, parseBundle(raw), { onConflict: url.searchParams.get('onConflict') || undefined });
  } catch (error) {
    return fail(res, 400, error.message);
  }
  // ?dryRun=1 plans only. Without it the plan is applied and the hub rebuilt.
  const summary = url.searchParams.get('dryRun') === '1' ? plan.summary : applyImport(state.home, plan);
  return sendJson(res, 200, { summary });
}

async function saveConfig(state, req, res) {
  const { home } = state;
  const raw = await writeBody(state, req, res, MAX_CONFIG_BODY);
  if (raw === null) return undefined;
  let changes;
  try {
    changes = JSON.parse(raw);
  } catch {
    return fail(res, 400, 'body is not JSON');
  }
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return fail(res, 400, 'body must be a JSON object of settings');
  let config;
  try {
    config = writeConfig(home, changes);
  } catch (error) {
    return fail(res, 400, error.message);
  }
  rebuildLibrary({ home });
  return sendJson(res, 200, { config });
}

function handler(state) {
  return (req, res) => {
    const { port } = state;
    if (![`${HOST}:${port}`, `localhost:${port}`].includes(req.headers.host)) return fail(res, 403, 'wrong host');
    let url;
    try {
      url = new URL(req.url, `http://${HOST}:${port}`);
    } catch {
      return fail(res, 400, 'bad url');
    }
    const failed = (error) => fail(res, 500, `${url.pathname} failed: ${error.message}`);
    if (url.pathname === CONFIG_PATH) {
      if (req.method === 'GET') return hasToken(state, req) ? sendJson(res, 200, { config: readConfig(state.home) }) : fail(res, 403, 'wrong or missing token');
      if (req.method === 'POST') return saveConfig(state, req, res).catch(failed);
      return fail(res, 405, 'use GET or POST');
    }
    if (url.pathname === EXPORT_PATH) {
      if (req.method !== 'GET') return fail(res, 405, 'use GET');
      return hasToken(state, req) ? exportBundle(state, url, res) : fail(res, 403, 'wrong or missing token');
    }
    if (url.pathname === IMPORT_PATH) {
      if (req.method !== 'POST') return fail(res, 405, 'use POST');
      return importBundle(state, url, req, res).catch(failed);
    }
    if (url.pathname.startsWith('/api/')) return fail(res, 404, 'not found');
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'read only');
    return serveFile(state.root, url, req, res);
  };
}

/**
 * Serve the library until closed.
 * @param {{ home: string, port?: number, quiet?: boolean }} options
 * @returns {Promise<{ server: import('node:http').Server, port: number, token: string, url: string, close: () => Promise<void> }>}
 */
export function startLibraryServer({ home, port = 0 }) {
  const state = { home, root: realpathSync(home), token: randomBytes(24).toString('hex'), port: 0 };
  const server = createServer(handler(state));
  return new Promise((done, reject) => {
    server.once('error', (error) => reject(new Error(`serve on ${HOST}:${port}: ${error.message}`)));
    server.listen(port, HOST, () => {
      state.port = server.address().port;
      done({
        server,
        port: state.port,
        token: state.token,
        url: `http://${HOST}:${state.port}/index.html#token=${state.token}`,
        close: () => new Promise((closed) => server.close(() => closed())),
      });
    });
  });
}
