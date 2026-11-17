import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLibraryServer, TOKEN_HEADER } from '../scripts/lib/serve.mjs';
import { publishExplainer, readConfig } from '../scripts/lib/library.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
let home;
let outside;
let served;

before(async () => {
  home = mkdtempSync(join(tmpdir(), 'rx-serve-'));
  outside = mkdtempSync(join(tmpdir(), 'rx-outside-'));
  writeFileSync(join(outside, 'secret.txt'), 'do not serve');
  publishExplainer(example, { home });
  symlinkSync(join(outside, 'secret.txt'), join(home, 'link.txt'));
  served = await startLibraryServer({ home, port: 0, quiet: true });
});

after(() => served.close());

function send({ method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: served.port, method, path, headers: { host: `127.0.0.1:${served.port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const origin = () => `http://127.0.0.1:${served.port}`;
const save = (body, headers = {}) => send({
  method: 'POST', path: '/api/config', body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: { origin: origin(), 'content-type': 'application/json', [TOKEN_HEADER]: served.token, ...headers },
});

test('binds to 127.0.0.1 on a random port with a fresh token, and prints a URL with it in the fragment', () => {
  assert.ok(served.port > 0);
  assert.match(served.token, /^[0-9a-f]{48}$/);
  assert.equal(served.url, `http://127.0.0.1:${served.port}/index.html#token=${served.token}`);
  assert.equal(served.server.address().address, '127.0.0.1');
});

test('serves files from the library with safe headers, and folders by their index.html', async () => {
  const hub = await send({ path: '/index.html' });
  assert.equal(hub.status, 200);
  assert.match(hub.headers['content-type'], /text\/html/);
  assert.equal(hub.headers['x-content-type-options'], 'nosniff');
  assert.equal(hub.headers['cache-control'], 'no-store');
  assert.equal((await send({ path: '/' })).status, 200);
  assert.equal((await send({ path: '/explainers/acme-taskflow/' })).status, 200);
  assert.equal((await send({ path: '/explainers/' })).status, 404, 'no directory listing');
});

test('path traversal and links out of the library are refused', async () => {
  for (const path of ['/../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/explainers/..%2f..%2f..%2fetc/passwd', '/link.txt', '/%00', '/%E0%A4%A']) {
    const res = await send({ path });
    assert.ok([400, 403, 404].includes(res.status), `${path} gave ${res.status}`);
    assert.doesNotMatch(res.body, /do not serve|root:/);
  }
});

test('a wrong Host header is refused, against DNS rebinding', async () => {
  assert.equal((await send({ path: '/index.html', headers: { host: 'evil.example:80' } })).status, 403);
});

test('GET /api/config returns the current config', async () => {
  const res = await send({ path: '/api/config' });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).config.style, 'clean');
});

test('saving needs the token, the right origin and JSON', async () => {
  assert.equal((await save({ audience: 'expert' }, { [TOKEN_HEADER]: 'wrong' })).status, 403);
  assert.equal((await save({ audience: 'expert' }, { [TOKEN_HEADER]: '' })).status, 403);
  assert.equal((await save({ audience: 'expert' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await save({ audience: 'expert' }, { origin: '' })).status, 403);
  assert.equal((await save({ audience: 'expert' }, { 'content-type': 'text/plain' })).status, 415);
  assert.equal(readConfig(home).audience, 'engineer', 'nothing was saved');
});

test('bad bodies are refused with the reason, and nothing is saved', async () => {
  const bad = await save({ audience: 'kids', theme: 'dark' });
  assert.equal(bad.status, 400);
  assert.match(JSON.parse(bad.body).error, /audience/);
  assert.equal((await save('{ not json')).status, 400);
  assert.equal((await save('[1,2]')).status, 400);
  assert.equal((await save(JSON.stringify({ instructions: 'x'.repeat(70000) }))).status, 413);
  assert.equal(readConfig(home).audience, 'engineer');
});

test('a good save writes config.json and rebuilds the hub with it', async () => {
  const res = await save({ audience: 'expert', style: 'playful' });
  assert.equal(res.status, 200, res.body);
  assert.equal(JSON.parse(res.body).config.audience, 'expert');
  assert.equal(readConfig(home).audience, 'expert');
  const hub = readFileSync(join(home, 'index.html'), 'utf8');
  assert.equal(JSON.parse(hub.match(/id="explainer-data">([\s\S]*?)<\/script>/)[1]).config.audience, 'expert');
});

test('only GET, HEAD and the one POST are allowed', async () => {
  assert.equal((await send({ method: 'POST', path: '/index.html', headers: { origin: origin(), [TOKEN_HEADER]: served.token } })).status, 405);
  assert.equal((await send({ method: 'DELETE', path: '/api/config' })).status, 405);
  assert.equal((await send({ method: 'PUT', path: '/library.json' })).status, 405);
  assert.equal((await send({ path: '/api/other' })).status, 404);
});
