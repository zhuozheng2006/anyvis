import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { createAnyVisServer, discoverPython } from './server.mjs';
import { createEmptyProject } from '../src/studio/core/project.ts';
import { createAction } from '../src/studio/core/catalog.ts';

function request(app, url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    Object.assign(req, { url, method, headers: { host: `127.0.0.1:${app.port}`, ...headers } });
    const parts = [];
    const res = new Writable({ write(chunk, encoding, callback) { parts.push(Buffer.from(chunk)); callback(); } });
    res.headers = {};
    res.writeHead = (status, responseHeaders) => { res.statusCode = status; Object.assign(res.headers, responseHeaders); };
    res.setHeader = (key, value) => { res.headers[key] = value; };
    res.on('error', reject);
    res.on('finish', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(parts), json: () => JSON.parse(Buffer.concat(parts).toString()) }));
    app.server.emit('request', req, res);
  });
}

test('project → server compiler → native Manim → playable media, diagnostics and cancellation', { timeout: 120_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) { t.skip(health.error); return; }
  const cacheRoot = await mkdtemp(path.join(tmpdir(), 'anyvis-native-integration-'));
  const app = await createAnyVisServer({ port: 4317, listen: false, cacheRoot, health });
  const { token } = (await request(app, '/api/session')).json();
  const headers = { 'content-type': 'application/json', 'x-anyvis-token': token };
  const post = body => request(app, '/api/render', { method: 'POST', headers, body });
  const waitFor = async id => {
    for (let i = 0; i < 400; i++) {
      const job = (await request(app, `/api/jobs/${id}`)).json();
      if (['done', 'error', 'cancelled'].includes(job.status)) return job;
      await delay(100);
    }
    throw new Error('Render did not finish within 40 seconds');
  };
  try {
    const project = createEmptyProject();
    project.scene = { ...project.scene, width: 960, height: 540, fps: 30 };
    project.actions = [
      createAction('circle', { name: '圆', duration: 0.2 }),
      createAction('square', { name: '方形', appear: 'hidden' }),
      createAction('transform', { target: '圆', destination: '方形', duration: 0.3 }),
      createAction('text', { name: '标题', text: health.chineseFont ? '让形状动起来' : 'Shapes in motion', y: 2.6, duration: 0.3 }),
      ...(health.latex ? [createAction('formula', { name: '公式', tex: 'x^2+y^2=1', y: -2.6, duration: 0.3 })] : []),
      createAction('wait', { duration: 0.2 }),
    ];
    const submitted = await post({ project, quality: 'preview', revision: 'integration-2d' });
    assert.equal(submitted.status, 202, submitted.bytes.toString());
    const job = await waitFor(submitted.json().id);
    assert.equal(job.status, 'done', JSON.stringify(job));
    assert.equal(job.revision, 'integration-2d');
    assert.equal(job.width, 960); assert.equal(job.height, 540); assert.equal(job.fps, 30);
    assert.ok(job.duration > 0.8 && job.duration < 2);
    const media = await request(app, job.videoUrl, { headers: { range: 'bytes=0-127' } });
    assert.equal(media.status, 206); assert.equal(media.bytes.length, 128);
    assert.match(media.headers['Content-Range'], /^bytes 0-127\//);
    const poster = await request(app, job.posterUrl);
    assert.equal(poster.status, 200); assert.deepEqual([...poster.bytes.subarray(0, 4)], [137, 80, 78, 71]);
    const cached = await post({ project, quality: 'preview', revision: 'integration-cached' });
    assert.equal(cached.json().id, job.id); assert.equal(cached.json().cached, true); assert.equal(cached.json().revision, 'integration-cached');

    const three = createEmptyProject(); three.scene.dimension = '3d';
    three.scene.width = 960; three.scene.height = 540;
    three.actions = [createAction('camera'), createAction('three_axes', { duration: 0.2 }),
      createAction('surface', { resolution: 8, uMin: -2, uMax: 2, vMin: -2, vMax: 2, duration: 0.3 }),
      createAction('ambient_rotation', { rate: 0.2 }), createAction('wait', { duration: 0.3 })];
    const result3d = await post({ project: three, quality: 'preview', revision: 'integration-3d' });
    assert.equal(result3d.status, 202, result3d.bytes.toString());
    const job3d = await waitFor(result3d.json().id);
    assert.equal(job3d.status, 'done', JSON.stringify(job3d));

    const bad = createEmptyProject();
    const failBlock = createAction('code', { code: 'raise ValueError("expected diagnostic")' }); bad.actions = [failBlock];
    const denied = await post({ project: bad, revision: 'untrusted' });
    assert.equal(denied.status, 403); assert.equal(denied.json().requiresTrust, true);
    const failed = await post({ project: bad, trustCode: true, revision: 'diagnostic' });
    const errorJob = await waitFor(failed.json().id);
    assert.equal(errorJob.status, 'error'); assert.match(errorJob.error, /expected diagnostic/); assert.equal(errorJob.blockId, failBlock.id);

    const slow = createEmptyProject(); slow.actions = [createAction('code', { code: 'import time\ntime.sleep(30)\nself.wait(1)' })];
    const waiting = await post({ project: slow, trustCode: true, revision: 'cancel' });
    assert.equal(waiting.status, 202, waiting.bytes.toString());
    await delay(150);
    const cancelled = await request(app, `/api/jobs/${waiting.json().id}`, { method: 'DELETE', headers });
    assert.equal(cancelled.json().status, 'cancelled');
    await delay(200);
  } finally { await app.close(); await delay(250); await rm(cacheRoot, { recursive: true, force: true }); }
});
