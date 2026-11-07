import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { EDITOR_URL, SETTINGS_URL, isEditorURL, isSettingsURL, externalURL, allowClipboardWrite, createSettingsStore, createEngineController, createProtocolHandler } from './host.mjs';
const desktopRoot = path.dirname(fileURLToPath(import.meta.url));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('only the fixed application origins and safe external HTTPS links are permitted', () => {
  assert.equal(isEditorURL(EDITOR_URL), true);
  assert.equal(isSettingsURL(SETTINGS_URL), true);
  for (const url of ['http://127.0.0.1:4317', 'https://studio/', 'anyvis://studio.evil/', 'anyvis://user@studio/', 'anyvis://studio:4/']) assert.equal(isEditorURL(url), false);
  assert.equal(isSettingsURL('anyvis://desktop/settings.html#untrusted'), false);
  assert.equal(externalURL('https://github.com/zhuozheng2006/anyvis'), 'https://github.com/zhuozheng2006/anyvis');
  for (const url of ['file:///tmp/private', 'javascript:alert(1)', 'https://user:pass@example.com/', 'http://example.com/']) assert.equal(externalURL(url), null);
  assert.equal(allowClipboardWrite('clipboard-sanitized-write', EDITOR_URL, EDITOR_URL), true);
  assert.equal(allowClipboardWrite('clipboard-read', EDITOR_URL, EDITOR_URL), false);
  assert.equal(allowClipboardWrite('clipboard-sanitized-write', EDITOR_URL, 'https://example.com'), false);
});

test('Python settings persist atomically, ignore unrelated keys and preserve the previous value on invalid input', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-settings-test-'));
  try {
    const store = createSettingsStore(directory);
    assert.equal((await store.read()).settings.pythonPath, '');
    const executable = path.join(directory, process.platform === 'win32' ? 'python.exe' : 'python');
    await writeFile(executable, 'test');
    await store.save({ pythonPath: executable, secret: 'must-not-persist' });
    assert.equal((await createSettingsStore(directory).read()).settings.pythonPath, executable);
    assert.equal((await readFile(store.filename, 'utf8')).includes('must-not-persist'), false);
    await assert.rejects(store.save({ pythonPath: 'python --command' }), /完整路径/);
    await assert.rejects(store.save({ pythonPath: directory }), /文件夹/);
    assert.equal((await store.read()).settings.pythonPath, executable);
    await store.save({ pythonPath: '   ' });
    assert.equal((await store.read()).settings.pythonPath, '');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('corrupt saved settings fall back without destroying the file before an explicit save', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-settings-corrupt-'));
  try {
    const store = createSettingsStore(directory); await writeFile(store.filename, '{broken');
    const result = await store.read();
    assert.equal(result.settings.pythonPath, ''); assert.match(result.warning, /原文件保留/);
    assert.equal(await readFile(store.filename, 'utf8'), '{broken');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('the desktop owns its ephemeral service and closes it before a settings restart', async () => {
  const calls = []; let nextPort = 32000;
  const engine = createEngineController({ paths: { cacheRoot: '/user-data/cache', workerPath: '/resources/worker.py' }, createServer: async options => {
    const port = nextPort++; calls.push(['create', options]); return { port, close: async () => calls.push(['close', port]) };
  } });
  await engine.restart({ pythonPath: '/python/first' }); await engine.restart({ pythonPath: '/python/second' });
  assert.equal(engine.service.port, 32001);
  assert.equal(calls[0][1].port, 0); assert.equal(calls[0][1].cacheRoot, '/user-data/cache');
  assert.deepEqual(calls[1], ['close', 32000]); assert.equal(calls[2][1].pythonPath, '/python/second');
  await engine.close(); await engine.close();
  assert.deepEqual(calls.at(-1), ['close', 32001]); assert.equal(engine.service, null);
});

test('quitting during an unfinished startup closes the late service instead of resurrecting it', async () => {
  const pending = deferred(); const started = deferred(); let closed = 0;
  const engine = createEngineController({ paths: {}, createServer: () => { started.resolve(); return pending.promise; } });
  const startup = engine.restart(); await started.promise;
  const startupFailure = assert.rejects(startup, { name: 'AbortError' });
  const shutdown = engine.close(); pending.resolve({ close: async () => { closed++; } });
  await Promise.all([startupFailure, shutdown]); assert.equal(closed, 1); assert.equal(engine.service, null);
});

test('failed startup can be retried and exposes a useful error state', async () => {
  let attempt = 0; const states = [];
  const engine = createEngineController({ paths: {}, onState: value => states.push(value), createServer: async () => {
    if (!attempt++) throw new Error('listen EPERM'); return { port: 43210, close: async () => {} };
  } });
  await assert.rejects(engine.restart(), /EPERM/); assert.equal(states.at(-1).state, 'error');
  await engine.restart(); assert.equal(states.at(-1).state, 'ready'); await engine.close();
});

test('protocol follows only the currently owned loopback service, retains the stable origin and forwards video ranges', async () => {
  let base = 'http://127.0.0.1:35001'; const calls = [];
  const handler = createProtocolHandler({ desktopRoot, getServiceURL: () => base, fetchLocal: async (url, options) => {
    calls.push({ url, options }); return new Response(new Uint8Array(32), { status: 206, headers: { 'Content-Range': 'bytes 0-31/1000' } });
  } });
  const url = `${EDITOR_URL}templates/video.webm`;
  const response = await handler(new Request(url, { headers: { Range: 'bytes=0-31', Cookie: 'secret', Origin: 'https://evil.example' } }));
  assert.equal(response.status, 206); assert.equal((await response.arrayBuffer()).byteLength, 32);
  assert.equal(calls[0].url, base + '/templates/video.webm'); assert.equal(calls[0].options.headers.get('range'), 'bytes=0-31');
  assert.equal(calls[0].options.headers.has('cookie'), false); assert.equal(calls[0].options.headers.has('origin'), false);
  base = 'http://127.0.0.1:35002'; await handler(new Request(url));
  assert.equal(calls[1].url, base + '/templates/video.webm'); assert.equal(url, 'anyvis://studio/templates/video.webm');
  base = 'https://evil.example'; assert.equal((await handler(new Request(url))).status, 503);
  assert.equal(calls.length, 2);
});

test('protocol forwards token and JSON body, blocks oversized or escaping requests and serves only settings assets', async () => {
  const calls = [];
  const handler = createProtocolHandler({ desktopRoot, getServiceURL: () => 'http://127.0.0.1:35000', fetchLocal: async (url, options) => {
    calls.push({ url, options }); return Response.json({ error: '项目 JSON 无法解析。' }, { status: 400 });
  } });
  const response = await handler(new Request(`${EDITOR_URL}api/render`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AnyVis-Token': 'test-token' }, body: '{' }));
  assert.equal(response.status, 400); assert.equal(calls[0].options.headers.get('x-anyvis-token'), 'test-token');
  assert.equal(Buffer.from(calls[0].options.body).toString(), '{');
  assert.equal((await handler(new Request(`${EDITOR_URL}api/render`, { method: 'POST', body: 'x'.repeat(2 * 1024 * 1024 + 1) }))).status, 413);
  assert.equal((await handler(new Request('anyvis://studio//evil.example/api/session'))).status, 403);
  assert.equal((await handler(new Request('anyvis://desktop/host.mjs'))).status, 404);
  assert.equal((await handler(new Request(SETTINGS_URL))).status, 200);
  assert.equal(calls.length, 1);
});

test('normal application quit closes windows before waiting for requests and engine cleanup', async () => {
  const events = []; const app = new EventEmitter(); let connectionClosed = false;
  Object.assign(app, { setName() {}, requestSingleInstanceLock: () => true, whenReady: () => new Promise(() => {}),
    quit: () => events.push('quit'), exit: () => events.push('forced-exit') });
  const electron = { app, protocol: { registerSchemesAsPrivileged() {} }, BrowserWindow: { getAllWindows: () => [{
    isDestroyed: () => false, close: () => { events.push('pagehide-and-close'); connectionClosed = true; },
  }] } };
  const nativeRequire = createRequire(import.meta.url);
  const context = vm.createContext({ require: name => name === 'electron' ? electron : nativeRequire(name),
    process: { argv: ['node', 'desktop/main.cjs'], platform: process.platform }, __dirname: desktopRoot, console,
    fakeEngine: { close: async () => { events.push('engine-close'); assert.equal(connectionClosed, true, 'active renderer requests must close before server shutdown waits'); } },
  });
  new vm.Script(await readFile(path.join(desktopRoot, 'main.cjs'), 'utf8')).runInContext(context);
  new vm.Script('engine = fakeEngine').runInContext(context);
  app.emit('before-quit', { preventDefault: () => events.push('defer-quit') });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['defer-quit', 'pagehide-and-close', 'engine-close', 'quit']);
});
