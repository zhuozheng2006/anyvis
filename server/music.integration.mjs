import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { createAnyVisServer, discoverPython } from './server.mjs';
import { createEmptyProject } from '../src/studio/core/project.ts';
import { createAction } from '../src/studio/core/catalog.ts';
const execute = promisify(execFile);
function request(app, url, body, token) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    Object.assign(req, { url, method: body ? 'POST' : 'GET', headers: { host: `127.0.0.1:${app.port}`, 'content-type': 'application/json', 'x-anyvis-token': token } });
    const parts = [], res = new Writable({ write(chunk, encoding, callback) { parts.push(Buffer.from(chunk)); callback(); } });
    res.writeHead = status => { res.statusCode = status; }; res.setHeader = () => {};
    res.on('error', reject); res.on('finish', () => resolve({ status: res.statusCode, bytes: Buffer.concat(parts), json: () => JSON.parse(Buffer.concat(parts).toString()) }));
    app.server.emit('request', req, res);
  });
}

test('default piano is mixed into real video and none exports a genuinely silent video', { timeout: 120_000 }, async t => {
  const health = await discoverPython(); if (!health.available) { t.skip(health.error); return; }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-music-'));
  const app = await createAnyVisServer({ listen: false, port: 4317, cacheRoot: path.join(directory, 'cache'), health });
  try {
    const token = (await request(app, '/api/session')).json().token;
    const project = createEmptyProject(); project.scene = { ...project.scene, width: 640, height: 360, fps: 24, musicGainDb: -18 };
    project.actions = [createAction('circle', { appear: 'none' }), createAction('wait', { duration: 4 })];
    for (const music of ['piano', 'none']) {
      project.scene.backgroundMusic = music;
      const submit = await request(app, '/api/render', { project, quality: 'preview', revision: music }, token);
      assert.equal(submit.status, 202, submit.bytes.toString());
      let job;
      for (let i = 0; i < 600; i++) {
        job = (await request(app, `/api/jobs/${submit.json().id}`)).json();
        if (['done', 'error'].includes(job.status)) break;
        await delay(100);
      }
      assert.equal(job.status, 'done', JSON.stringify(job));
      assert.ok(Math.abs(job.duration - 4) < .1, JSON.stringify(job));
      const media = await request(app, job.videoUrl), filename = path.join(directory, `${music}.${job.format}`);
      assert.equal(media.status, 200); await writeFile(filename, media.bytes);
      const { stdout } = await execute(health.python, ['-c', `import av,numpy as np,sys,json
with av.open(sys.argv[1]) as c:
 frames=list(c.decode(video=0)); assert len(frames)==96,len(frames)
with av.open(sys.argv[1]) as c:
 if sys.argv[2]=='none':
  assert len(c.streams.audio)==0
  print(json.dumps({'music':'none','frames':len(frames),'audioStreams':0}))
 else:
  assert len(c.streams.audio)==1
  stream=c.streams.audio[0]; values=[]
  for frame in c.decode(stream):
   a=frame.to_ndarray().astype(float)
   if frame.format.name.startswith('s16'): a/=32768
   values.extend(a.reshape(-1))
  samples=np.asarray(values); rms=float(np.sqrt(np.mean(samples*samples)))
  peak=float(np.max(np.abs(samples)))
  assert .002<rms<.1,(rms,peak)
  assert peak<.3,peak
  print(json.dumps({'music':'piano','frames':len(frames),'rms':rms,'peak':peak}))
`, filename, music], { timeout: 20_000, maxBuffer: 1024 * 1024 });
      t.diagnostic(stdout.trim());
    }
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
