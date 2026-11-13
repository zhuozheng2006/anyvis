import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import http from 'node:http';
import { createAnyVisServer, discoverPython, parseRange } from './server.mjs';
import { createEmptyProject } from '../src/studio/core/project.ts';
import { AUTHORING_PROTOCOL } from '../src/studio/core/protocol.ts';

// Exercise the actual HTTP route handler without binding a socket. Some build
// environments deny listen(); a separate smoke run checks real browser I/O.
function request(app, url, { method = 'GET', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [Buffer.from(body)] : []);
    Object.assign(req, { url, method, headers: { host: `127.0.0.1:${app.port}`, ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])) } });
    const chunks = [];
    const res = new Writable({ write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
    res.headers = {};
    res.writeHead = (status, responseHeaders) => { res.statusCode = status; Object.assign(res.headers, responseHeaders); };
    res.setHeader = (key, value) => { res.headers[key] = value; };
    res.on('error', reject);
    res.on('finish', () => {
      const bytes = Buffer.concat(chunks);
      resolve({ status: res.statusCode, headers: res.headers, bytes, json: () => JSON.parse(bytes.toString() || '{}') });
    });
    app.server.emit('request', req, res);
  });
}

test('video byte ranges support seeking and reject malformed or impossible ranges', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=800-', 1000), { start: 800, end: 999 });
  assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=900-1500', 1000), { start: 900, end: 999 });
  for (const value of ['bytes=1000-', 'bytes=9-2', 'bytes=-0', 'bytes=0-1,3-4', 'bytes=-', 'junk']) assert.equal(parseRange(value, 1000), false);
});

test('desktop injects runtime and static paths without falling back from an explicit Python', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-path-test-'));
  const staticRoot = path.join(directory, 'app.asar', 'dist');
  const runtimeRoot = path.join(directory, 'resources', 'runtime');
  await mkdir(staticRoot, { recursive: true }); await mkdir(runtimeRoot, { recursive: true });
  const workerPath = path.join(runtimeRoot, 'worker.cjs');
  await writeFile(workerPath, `console.log('ANYVIS_EVENT '+JSON.stringify({event:'health',available:true,probeCwd:process.cwd(),worker:__filename}));\n`);
  await writeFile(path.join(staticRoot, 'index.html'), '<!doctype html><title>Packaged AnyVis</title>');
  await writeFile(path.join(staticRoot, 'test.js'), 'export const packaged = true;');
  let app;
  try {
    const absent = await discoverPython({ pythonPath: path.join(directory, 'missing-python'), workerPath, runtimeRoot });
    assert.equal(absent.available, false); assert.match(absent.error, /不会自动切换/);
    app = await createAnyVisServer({ port: 4317, listen: false, cacheRoot: path.join(directory, 'cache'), pythonPath: process.execPath, workerPath, runtimeRoot, staticRoot });
    const health = await app.healthPromise;
    assert.equal(health.available, true); assert.equal(health.python, process.execPath);
    assert.equal(health.probeCwd, await realpath(runtimeRoot)); assert.equal(health.worker, await realpath(workerPath));
    assert.equal((await request(app, '/api/health')).json().authoringProtocol, AUTHORING_PROTOCOL);
    const page = await request(app, '/');
    assert.equal(page.status, 200); assert.match(page.bytes.toString(), /Packaged AnyVis/);
    assert.match(page.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
    const asset = await request(app, '/test.js');
    assert.equal(asset.status, 200); assert.equal(asset.bytes.toString(), 'export const packaged = true;');
  } finally { if (app) await app.close(); await rm(directory, { recursive: true, force: true }); }
});

test('closing the desktop service kills an unfinished runtime probe', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-probe-test-'));
  const workerPath = path.join(directory, 'probe.cjs');
  await writeFile(workerPath, `require('node:fs').writeFileSync(require('node:path').join(__dirname,'probe.pid'),String(process.pid)); setInterval(()=>{},1000);\n`);
  const app = await createAnyVisServer({ port: 4317, listen: false, cacheRoot: path.join(directory, 'cache'), pythonPath: process.execPath, workerPath, runtimeRoot: directory });
  try {
    let pid;
    for (let i = 0; i < 100 && !pid; i++) {
      pid = await readFile(path.join(directory, 'probe.pid'), 'utf8').then(Number, () => null);
      if (!pid) await delay(10);
    }
    assert.ok(pid, 'probe subprocess started');
    const started = Date.now(); await app.close();
    assert.ok(Date.now() - started < 2000, 'close should not wait for the 15-second health deadline');
    assert.equal((await app.healthPromise).available, false);
    assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH');
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});

test('a listen failure aborts the in-flight runtime probe before rejecting startup', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-listen-test-'));
  const workerPath = path.join(directory, 'probe.cjs');
  await writeFile(workerPath, 'setInterval(()=>{},1000);\n');
  const failure = Object.assign(new Error('test listen failure'), { code: 'EADDRINUSE' });
  const mocked = t.mock.method(http.Server.prototype, 'listen', () => { throw failure; });
  try {
    const started = Date.now();
    await assert.rejects(createAnyVisServer({ port: 4317, cacheRoot: path.join(directory, 'cache'), pythonPath: process.execPath, workerPath, runtimeRoot: directory }), error => error === failure);
    assert.ok(Date.now() - started < 2000);
  } finally { mocked.mock.restore(); await rm(directory, { recursive: true, force: true }); }
});

test('closing or reconnecting the service cancels an active AI request immediately', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-ai-close-test-'));
  const app = await createAnyVisServer({ port: 4317, listen: false, cacheRoot: directory, health: { available: false, capabilities: {} } });
  let fetchStarted;
  const started = new Promise(resolve => { fetchStarted = resolve; });
  const mocked = t.mock.method(globalThis, 'fetch', (url, options) => new Promise((resolve, reject) => {
    fetchStarted();
    const abort = () => reject(new DOMException('Aborted by service shutdown', 'AbortError'));
    if (options.signal.aborted) abort();
    else options.signal.addEventListener('abort', abort, { once: true });
  }));
  try {
    const { token } = (await request(app, '/api/session')).json();
    const response = request(app, '/api/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AnyVis-Token': token },
      body: JSON.stringify({ endpoint: 'https://example.test/v1', model: 'test-model', key: 'local-test-only', prompt: '绘制一个圆', project: createEmptyProject() }),
    });
    await started;
    const at = Date.now(); await app.close();
    const result = await response;
    assert.ok(Date.now() - at < 2000);
    assert.equal(result.status, 408); assert.match(result.json().error, /已取消/);
  } finally { mocked.mock.restore(); await app.close(); await rm(directory, { recursive: true, force: true }); }
});

test('local API blocks cross-site execution, DNS-rebinding hosts and missing session tokens', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-api-test-'));
  const app = await createAnyVisServer({ port: 4317, listen: false, cacheRoot: directory, health: { available: false, error: 'test environment', capabilities: {} } });
  try {
    const sessionResponse = await request(app, '/api/session');
    assert.equal(sessionResponse.status, 200);
    assert.equal(sessionResponse.headers['Access-Control-Allow-Origin'], undefined);
    const { token } = await sessionResponse.json();
    assert.match(token, /^[a-f0-9]{64}$/);
    const crossSite = await request(app, '/api/session', { headers: { Origin: 'https://attacker.example' } });
    assert.equal(crossSite.status, 403);
    const rebinding = await request(app, '/api/session', { headers: { Host: `attacker.example:${app.port}` } });
    assert.equal(rebinding.status, 403);
    const absentToken = await request(app, '/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(absentToken.status, 403);
    const authenticated = await request(app, '/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AnyVis-Token': token }, body: '{}' });
    assert.equal(authenticated.status, 503);
    assert.match((await authenticated.json()).error, /test environment/);
    const mediaTraversal = await request(app, '/api/media/anything/%2e%2e%2f%2e%2e%2fpackage.json');
    assert.equal(mediaTraversal.status, 404);
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});

test('asset upload probe turns malformed worker JSON error lines into friendly decoding error', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-probe-json-test-'));
  const runtimeRoot = path.join(directory, 'runtime');
  await mkdir(runtimeRoot, { recursive: true });
  const workerPath = path.join(runtimeRoot, 'worker.cjs');
  await writeFile(
    workerPath,
    `
const args = process.argv.slice(2);
if (args[0] === '--probe-asset') {
  console.log('ANYVIS_EVENT {not-valid-json');
  process.exit(1);
}
console.log('ANYVIS_EVENT ' + JSON.stringify({ event: 'health', available: true, capabilities: {} }));
`,
  );
  const app = await createAnyVisServer({
    port: 4317,
    listen: false,
    cacheRoot: path.join(directory, 'cache'),
    pythonPath: process.execPath,
    workerPath,
    runtimeRoot,
  });
  try {
    await app.healthPromise;
    const { token } = (await request(app, '/api/session')).json();
    const res = await request(app, '/api/assets?name=broken.png', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-AnyVis-Token': token },
      body: 'not-a-real-png',
    });
    assert.equal(res.status, 400);
    const payload = res.json();
    assert.match(payload.error, /素材无法解码或校验超时/);
    assert.doesNotMatch(payload.error, /SyntaxError|JSON/);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
