import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

test('only the hub, the kit, explainer pages and fonts are served; data files never', async () => {
  writeFileSync(join(home, 'config.json'), JSON.stringify({ instructions: 'private house notes' }));
  writeFileSync(join(home, 'index.html.tmp-123-abcd'), 'half written');
  writeFileSync(join(home, 'library.json.corrupt-2026'), '{}');
  for (const path of ['/config.json', '/library.json', '/explainers/acme-taskflow/explainer.json', '/index.html.tmp-123-abcd',
    '/library.json.corrupt-2026', '/.lock/pid', '/.serve/x', '/explainers/acme-taskflow/explainer.json.replaced-1', '/explainers/ACME/index.html',
    '/fonts/../config.json', '/fonts/x.js', '/kit.html/']) {
    const res = await send({ path });
    assert.equal(res.status, 404, `${path} gave ${res.status}`);
    assert.doesNotMatch(res.body, /private house notes|"explainers"|half written/);
  }
  for (const path of ['/', '/index.html', '/kit.html', '/explainers/acme-taskflow/', '/explainers/acme-taskflow/index.html']) {
    assert.equal((await send({ path })).status, 200, path);
  }
});

test('a wrong Host header is refused, against DNS rebinding', async () => {
  assert.equal((await send({ path: '/index.html', headers: { host: 'evil.example:80' } })).status, 403);
});

test('GET /api/config needs the token, since config can hold private instructions', async () => {
  assert.equal((await send({ path: '/api/config' })).status, 403);
  assert.equal((await send({ path: '/api/config', headers: { [TOKEN_HEADER]: 'wrong' } })).status, 403);
  const res = await send({ path: '/api/config', headers: { [TOKEN_HEADER]: served.token } });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).config.style, 'clean');
});

test('pages get a strict CSP that hashes their inline script and style', async () => {
  const res = await send({ path: '/index.html' });
  const csp = res.headers['content-security-policy'];
  assert.ok(csp, 'CSP header present');
  const script = res.body.match(/<script>([\s\S]*?)<\/script>/)[1];
  const style = res.body.match(/<style>([\s\S]*?)<\/style>/)[1];
  const hash = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'sha256-/);
  assert.ok(csp.includes(hash(script)), csp);
  assert.ok(csp.includes(hash(style)), csp);
  assert.doesNotMatch(csp.replace("style-src-attr 'unsafe-inline'", ''), /unsafe-inline|unsafe-eval/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal((await send({ path: '/library.json' })).status, 404);
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

const auth = () => ({ [TOKEN_HEADER]: served.token });
const upload = (body, query = '', headers = {}) => send({
  method: 'POST', path: `/api/import${query}`, body,
  headers: { origin: origin(), 'content-type': 'application/json', ...auth(), ...headers },
});

test('every inline script and style block in a served page is covered by the CSP', async () => {
  const hash = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
  for (const path of ['/index.html', '/kit.html', '/explainers/acme-taskflow/index.html']) {
    const res = await send({ path });
    const csp = res.headers['content-security-policy'];
    const scripts = [...res.body.matchAll(/<script(?![^>]*\bsrc=)(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    const styles = [...res.body.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
    assert.ok(scripts.length >= 2, path);
    [...scripts, ...styles].forEach((block) => assert.ok(csp.includes(hash(block)), `${path}: a block is not hashed`));
  }
  const { pageCsp } = await import('../scripts/lib/serve.mjs');
  const csp = pageCsp('<script data-prepaint>a()</script><script>b()</script><style media="x">p{}</style>');
  [hash('a()'), hash('b()'), hash('p{}')].forEach((h) => assert.ok(csp.includes(h), h));
});

test('GET /api/export needs the token and returns a data-only bundle', async () => {
  assert.equal((await send({ path: '/api/export' })).status, 403);
  assert.equal((await send({ path: '/api/export', headers: { [TOKEN_HEADER]: 'wrong' } })).status, 403);
  const res = await send({ path: '/api/export?type=repo', headers: auth() });
  assert.equal(res.status, 200, res.body);
  assert.match(res.headers['content-disposition'], /attachment; filename="explainers-.*\.explainers\.json"/);
  const bundle = JSON.parse(res.body);
  assert.equal(bundle.format, 'concept-explainer-bundle');
  assert.equal(bundle.explainers[0].slug, 'acme-taskflow');
  assert.doesNotMatch(res.body, /sourcePath|repoPath/);
  assert.equal(JSON.parse((await send({ path: '/api/export?slugs=acme-taskflow', headers: auth() })).body).explainers.length, 1);
  const missing = await send({ path: '/api/export?slugs=acme-taskflow,nope', headers: auth() });
  assert.equal(missing.status, 400);
  assert.match(JSON.parse(missing.body).error, /no explainer "nope"/);
  assert.equal((await send({ method: 'POST', path: '/api/export', headers: { origin: origin(), ...auth() } })).status, 405);
});

test('POST /api/import plans with ?dryRun=1, applies without it, and checks token, origin and size', async () => {
  const bundle = (await send({ path: '/api/export', headers: auth() })).body;
  const dry = await upload(bundle, '?dryRun=1');
  assert.equal(dry.status, 200, dry.body);
  const plan = JSON.parse(dry.body).summary;
  assert.equal(plan.dryRun, true);
  assert.deepEqual(Object.keys(plan).sort(), ['added', 'dryRun', 'rejected', 'replaced', 'skipped']);
  assert.equal(plan.added[0].slug, 'acme-taskflow-2');
  assert.ok(!existsSync(join(home, 'explainers', 'acme-taskflow-2')), 'dry run wrote nothing');
  const skip = JSON.parse((await upload(bundle, '?dryRun=1&onConflict=skip')).body).summary;
  assert.equal(skip.skipped.length, 1);
  const applied = await upload(bundle);
  assert.equal(applied.status, 200, applied.body);
  assert.equal(JSON.parse(applied.body).summary.dryRun, false);
  assert.ok(existsSync(join(home, 'explainers', 'acme-taskflow-2', 'index.html')));
  assert.match(readFileSync(join(home, 'index.html'), 'utf8'), /acme-taskflow-2/, 'the hub was rebuilt');
  assert.equal((await upload(bundle, '?dryRun=1', { [TOKEN_HEADER]: 'wrong' })).status, 403);
  assert.equal((await upload(bundle, '?dryRun=1', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await upload(bundle, '?dryRun=1', { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await upload('{ nope')).status, 400);
  assert.match(JSON.parse((await upload('{"format":"zip"}')).body).error, /not a concept-explainer bundle/);
  assert.equal((await upload(bundle, '?dryRun=1&onConflict=merge')).status, 400);
  assert.equal((await upload('x'.repeat(10 * 1024 * 1024 + 10))).status, 413);
  const hostile = JSON.stringify({ format: 'concept-explainer-bundle', version: 1, explainers: [{ slug: '../../x', data: { __proto__: { polluted: 1 } } }] });
  const rejected = JSON.parse((await upload(hostile, '?dryRun=1')).body).summary;
  assert.equal(rejected.rejected.length, 1);
  assert.equal(({}).polluted, undefined);
});

test('only GET, HEAD and the API methods are allowed', async () => {
  assert.equal((await send({ method: 'POST', path: '/index.html', headers: { origin: origin(), [TOKEN_HEADER]: served.token } })).status, 405);
  assert.equal((await send({ method: 'DELETE', path: '/api/config' })).status, 405);
  assert.equal((await send({ method: 'PUT', path: '/library.json' })).status, 405);
  assert.equal((await send({ path: '/api/other' })).status, 404);
});
