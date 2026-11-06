import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createAnyVisServer, parseRange } from './server.mjs';

// Exercise the actual HTTP route handler without binding a socket. Some build
// environments deny listen(); a separate smoke run checks real browser I/O.
function request(app, url, { method = 'GET', headers = {}, body = '' } = {}) {
  return new Promise(resolve => {
    const req = Readable.from(body ? [Buffer.from(body)] : []);
    Object.assign(req, { url, method, headers: { host: `127.0.0.1:${app.port}`, ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])) } });
    const res = new EventEmitter();
    res.writeHead = (status, responseHeaders) => { res.statusCode = status; res.headers = responseHeaders; };
    res.end = text => { res.writableEnded = true; resolve({ status: res.statusCode, headers: res.headers, json: () => JSON.parse(text || '{}') }); };
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
