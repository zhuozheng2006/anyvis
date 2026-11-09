import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Readable, Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { createAnyVisServer, discoverPython } from './server.mjs';
import { createEmptyProject } from '../src/studio/core/project.ts';
import { createAction } from '../src/studio/core/catalog.ts';
import { nativeExecutionEnvironment } from '../scripts/api-evidence.mjs';
const execute = promisify(execFile);
function request(app, url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))] : []);
    Object.assign(req, { url, method, headers: { host: `127.0.0.1:${app.port}`, ...headers } });
    const parts = [], res = new Writable({ write(chunk, encoding, callback) { parts.push(Buffer.from(chunk)); callback(); } });
    res.headers = {}; res.writeHead = (status, headers) => { res.statusCode = status; Object.assign(res.headers, headers); }; res.setHeader = (key, value) => { res.headers[key] = value; };
    res.on('error', reject); res.on('finish', () => resolve({ status: res.statusCode, bytes: Buffer.concat(parts), headers: res.headers, json: () => JSON.parse(Buffer.concat(parts).toString()) }));
    app.server.emit('request', req, res);
  });
}
test('uploaded media survives restart and project ZIP reopening, then renders in worker and standalone Python', { timeout: 120_000 }, async t => {
  const health = await discoverPython(); if (!health.available) { t.skip(health.error); return; }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-media-'));
  let app;
  try {
    await execute(health.python, ['-c', `from PIL import Image,ImageDraw
import wave, numpy as np
image=Image.new('RGBA',(64,64),(0,0,0,0)); ImageDraw.Draw(image).ellipse((4,4,60,60),fill=(255,0,0,255)); image.save('sprite.png')
rate=44100; t=np.arange(rate*4)/rate; y=.2*np.sin(2*np.pi*np.where(t<1,330,660)*t)
with wave.open('voice.wav','wb') as f:
 f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes((y*32767).astype('<i2').tobytes())
`], { cwd: directory });
    // Upload/decode must not require the user's PyAV build to have an encoder.
    await writeFile(path.join(directory, 'voice.ogg'), await readFile(new URL('./fixtures/voice-tones.ogg', import.meta.url)));
    const options = { listen: false, port: 4317, cacheRoot: path.join(directory, 'cache'), health };
    app = await createAnyVisServer(options);
    let headers = { 'x-anyvis-token': (await request(app, '/api/session')).json().token };
    const bad = await request(app, '/api/assets?name=unsafe.svg', { method: 'POST', headers, body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') });
    assert.equal(bad.status, 400); assert.match(bad.json().error, /SVG/);
    const svgUpload = (name, svg) => request(app, `/api/assets?name=${name}.svg`, { method: 'POST', headers, body: Buffer.from(svg) });
    const tiny = await svgUpload('tiny', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 .25 2"><rect width=".25" height="2" fill="#0000ff"/></svg>');
    assert.equal(tiny.status, 201); assert.equal(tiny.json().width, 1); assert.equal(tiny.json().height, 2);
    const physical = await svgUpload('physical', '<svg xmlns="http://www.w3.org/2000/svg" width="1in" height="36pt"><rect width="96" height="48"/></svg>');
    assert.equal(physical.status, 201); assert.equal(physical.json().width, 96); assert.equal(physical.json().height, 48);
    for (const box of ['0 0 2', 'NaN 0 2 2', '0 0 -2 2']) {
      assert.equal((await svgUpload('invalid', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}"/>`)).status, 400);
    }
    const denied = await request(app, '/api/assets?name=voice.wav', { method: 'POST', body: await readFile(path.join(directory, 'voice.wav')) });
    assert.equal(denied.status, 403);
    const upload = async name => {
      const result = await request(app, `/api/assets?name=${name}`, { method: 'POST', headers, body: await readFile(path.join(directory, name)) });
      assert.equal(result.status, 201, result.bytes.toString()); return result.json();
    };
    const image = await upload('sprite.png'), wav = await upload('voice.wav'), voice = await upload('voice.ogg');
    assert.equal(image.width, 64); assert.equal(wav.duration, 4); assert.ok(voice.duration > 3.9 && voice.duration < 4.1);
    await app.close(); app = await createAnyVisServer(options);
    headers = { 'x-anyvis-token': (await request(app, '/api/session')).json().token, 'content-type': 'application/json' };
    assert.equal((await request(app, `/api/assets/${image.id}`)).json().id, image.id);
    assert.equal((await request(app, `/api/assets/${voice.id}/file`, { headers: { range: 'bytes=0-31' } })).bytes.length, 32);
    let project = createEmptyProject(); project.scene = { ...project.scene, width: 640, height: 360, fps: 24 }; project.assets = [image, voice, tiny.json()];
    project.actions = [createAction('image_asset', { name: '主角', asset: image.id, height: 2, x: -2, appear: 'none' }), createAction('audio_play', { name: '讲解', asset: voice.id, delay: .5, offset: 1, length: 2, gain: -6 }), createAction('shift', { target: '主角', dx: 4, duration: 1 }), createAction('audio_stop', { target: '讲解' }), createAction('wait', { duration: 1 })];
    project.actions.unshift(createAction('image_asset', { name: '矢量', asset: tiny.json().id, height: 1, x: 3, y: 2, appear: 'none' }));
    const timelineModule = path.join(directory, 'timeline.mjs');
    await build({ entryPoints: [fileURLToPath(new URL('../src/studio/timeline-model.ts', import.meta.url))], outfile: timelineModule, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
    const { audioClips, splitAudioClip } = await import(pathToFileURL(timelineModule).href);
    project = splitAudioClip(project, audioClips(project)[0], .75).project;
    project.scene.markers = [{ id: 'voice-cut', time: .75, label: '配音分割接缝', color: '#38bdf8' }];
    const bundleModule = path.join(directory, 'bundle.mjs');
    await build({ entryPoints: [fileURLToPath(new URL('../src/studio/media-bundle.ts', import.meta.url))], outfile: bundleModule, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
    const { packProject, unpackProject } = await import(pathToFileURL(bundleModule).href);
    const assetFiles = {};
    for (const asset of project.assets) {
      const response = await request(app, `/api/assets/${asset.id}/file`);
      assert.equal(response.status, 200);
      assetFiles[`assets/${asset.id}.${asset.extension}`] = response.bytes;
    }
    const archive = path.join(directory, 'project.anyvis.zip');
    await writeFile(archive, packProject(project, assetFiles));
    const reopened = unpackProject(await readFile(archive));
    assert.deepEqual(reopened.project, JSON.parse(JSON.stringify(project)), 'Project metadata, markers and actions must survive reopening');
    project = reopened.project;
    const submitted = await request(app, '/api/render', { method: 'POST', headers, body: { project, quality: 'preview', revision: 'media-fixture' } });
    assert.equal(submitted.status, 202, submitted.bytes.toString());
    let job;
    for (let i = 0; i < 500; i++) {
      job = (await request(app, `/api/jobs/${submitted.json().id}`)).json();
      if (['done', 'error'].includes(job.status)) break;
      await delay(100);
    }
    assert.equal(job.status, 'done', JSON.stringify(job));
    assert.equal(job.format, health.capabilities.mp4Audio ? 'mp4' : 'webm');
    const media = await request(app, job.videoUrl); assert.equal(media.status, 200);
    const filename = path.join(directory, `result.${job.format}`); await writeFile(filename, media.bytes);
    const verifyVideo = `import av,numpy as np,json,sys
filename=sys.argv[1]
with av.open(filename) as c:
 assert len(c.streams.audio)==1
 if filename.endswith('.mp4'):
  assert c.streams.video[0].codec_context.name=='h264'
  assert c.streams.audio[0].codec_context.name=='aac'
 centers=[]; blue=[]; times=[]
 for frame in c.decode(video=0):
  times.append(float(frame.time))
  pixels=frame.to_ndarray(format='rgb24'); mask=(pixels[:,:,0]>180)&(pixels[:,:,1]<80)&(pixels[:,:,2]<80)
  blue.append(int(((pixels[:,:,2]>180)&(pixels[:,:,0]<80)&(pixels[:,:,1]<80)).sum()))
  if mask.any(): centers.append(float(np.where(mask)[1].mean()))
 assert len(centers)==48 and centers[-1]-centers[0]>140, centers
 np.testing.assert_allclose(np.diff(times),1/24,atol=.001)
 assert min(blue)>10, blue
with av.open(filename) as c:
 stream=c.streams.audio[0]; rate=stream.rate; samples=np.zeros(rate*3); cursor=None
 for frame in c.decode(stream):
  a=frame.to_ndarray().astype(float)
  if frame.format.is_planar: a=a.mean(axis=0)
  else: a=a.reshape(-1,len(frame.layout.channels)).mean(axis=1)
  if frame.format.name.startswith('s16'): a/=32768
  # WebM timestamps are millisecond-quantized; decoded PCM is continuous.
  if cursor is None: cursor=round(float(frame.time or 0)*rate)
  count=min(len(a),len(samples)-max(0,cursor))
  if count>0: samples[max(0,cursor):max(0,cursor)+count]=a[:count]
  cursor+=len(a)
 def rms(a,b): return float(np.sqrt(np.mean(samples[int(a*rate):int(b*rate)]**2)))
 before,voice,after=rms(.1,.3),rms(.6,.9),rms(1.3,1.6)
 assert before<.003 and after<.003 and .035<voice<.09,(before,voice,after)
 seam=rms(.72,.78); assert .035<seam<.09,seam
 chunk=samples[int(.6*rate):int(.9*rate)]; frequencies=np.fft.rfftfreq(len(chunk),1/rate)
 tone=float(frequencies[np.abs(np.fft.rfft(chunk)).argmax()]); assert abs(tone-660)<10,tone
 active=np.flatnonzero(np.abs(samples)>.02)
 onset,offset=float(active[0]/rate),float((active[-1]+1)/rate)
 assert abs(onset-.5)<.025 and abs(offset-1)<.025,(onset,offset)
 print(json.dumps({'frames':len(centers),'horizontalTravel':centers[-1]-centers[0],'rmsBefore':before,'rmsVoice':voice,'rmsAfter':after,'rmsCutSeam':seam,'toneHz':tone,'onsetSeconds':onset,'offsetSeconds':offset}))
`;
    const workerCheck = await execute(health.python, ['-c', verifyVideo, filename], { timeout: 20_000, maxBuffer: 1024 * 1024 });
    t.diagnostic(`worker ${job.format}: ${workerCheck.stdout.trim()}`);
    // The exported source must work independently of the worker and its asset cache.
    const standalone = path.join(directory, 'standalone');
    await mkdir(path.join(standalone, 'assets'), { recursive: true });
    assert.ok(reopened.files['scene.py'], 'ZIP must include runnable source');
    for (const [name, bytes] of Object.entries(reopened.files)) await writeFile(path.join(standalone, name), bytes);
    // PyAV wheels differ: Linux commonly has libx264 but no libvorbis,
    // whereas this project's Conda runtime uses VP9/Vorbis without libx264.
    const standaloneFormat = health.nativeMp4 ? 'mp4' : 'webm';
    await execute(health.python, ['-m', 'manim', 'render', '--format', standaloneFormat, '--disable_caching', '--media_dir', 'media', 'scene.py', 'AnyVisScene'], {
      cwd: standalone, env: nativeExecutionEnvironment(health.python), timeout: 60_000, maxBuffer: 2 * 1024 * 1024,
    });
    const standaloneFile = path.join(standalone, 'media', 'videos', 'scene', '360p24', `AnyVisScene.${standaloneFormat}`);
    const standaloneCheck = await execute(health.python, ['-c', verifyVideo, standaloneFile], { timeout: 20_000, maxBuffer: 1024 * 1024 });
    t.diagnostic(`standalone ${standaloneFormat}: ${standaloneCheck.stdout.trim()}`);
    await execute(health.python, ['-c', `import av,importlib.util,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('worker',sys.argv[1]);worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
original_has_encoder=worker.has_encoder
worker.has_encoder=lambda av,name: False if name=='aac' else original_has_encoder(av,name)
source=Path(sys.argv[2]);target=source.with_name('missing-aac.mp4');before=source.read_bytes()
assert worker.transcode(av,source,target,24,lambda _:None)==source
assert not target.exists() and source.read_bytes()==before
`, fileURLToPath(new URL('./worker.py', import.meta.url)), standaloneFile], { timeout: 20_000 });
    t.diagnostic('Missing AAC encoder retains the original video and soundtrack without writing a silent MP4.');
  } finally { if (app) await app.close(); if (process.env.ANYVIS_KEEP_MEDIA) t.diagnostic(directory); else await rm(directory, { recursive: true, force: true }); }
});
