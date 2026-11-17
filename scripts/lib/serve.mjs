// `library serve`: the library over http on 127.0.0.1, so the Settings view
// can save config.json. One write endpoint, guarded by a per-run token (sent
// in a header), the Origin and the Host. Files are read-only and never leave
// the library folder. node:http only. Contract: references/library.md.
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { readConfig, rebuildLibrary, writeConfig } from './library.mjs';

export const HOST = '127.0.0.1';
export const TOKEN_HEADER = 'x-concept-explainer-token';
export const CONFIG_PATH = '/api/config';
const MAX_BODY = 64 * 1024;

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

function serveFile(root, url, req, res) {
  const found = resolveFile(root, url.pathname);
  if (!found.file) return fail(res, found.status, found.status === 404 ? 'not found' : 'not allowed');
  res.writeHead(200, { ...SAFE_HEADERS, 'content-type': TYPES[extname(found.file).toLowerCase()] || 'application/octet-stream' });
  return res.end(req.method === 'HEAD' ? undefined : readFileSync(found.file));
}

function readBody(req) {
  return new Promise((done) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () => done(size > MAX_BODY ? null : Buffer.concat(chunks).toString('utf8')));
  });
}

async function saveConfig({ home, token, port }, req, res) {
  if (!allowedOrigins(port).includes(req.headers.origin)) return fail(res, 403, 'wrong origin');
  if (!sameToken(req.headers[TOKEN_HEADER], token)) return fail(res, 403, 'wrong or missing token');
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return fail(res, 415, 'send application/json');
  const raw = await readBody(req);
  if (raw === null) return fail(res, 413, `body over ${MAX_BODY} bytes`);
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
    if (url.pathname === CONFIG_PATH) {
      if (req.method === 'GET') return sendJson(res, 200, { config: readConfig(state.home) });
      if (req.method === 'POST') return saveConfig(state, req, res).catch((error) => fail(res, 500, `save failed: ${error.message}`));
      return fail(res, 405, 'use GET or POST');
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
