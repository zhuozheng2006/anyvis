import { expect, it } from 'vitest';
import { createEmptyProject, validateProject } from './project';
import { createAction } from './catalog';
import { compileProject } from './compiler';
import type { MediaAsset } from './types';
const image: MediaAsset = { id: 'a'.repeat(64), name: '图.png', kind: 'image', extension: 'png', bytes: 20, width: 64, height: 64 };
const voice: MediaAsset = { id: 'b'.repeat(64), name: '配音.wav', kind: 'audio', extension: 'wav', bytes: 1000, duration: 5 };
it('validates soundtrack settings while keeping legacy projects silent', () => {
  const p = createEmptyProject();
  expect(validateProject(p).scene.backgroundMusic).toBeUndefined();
  expect(compileProject(p).code).not.toContain('_anyvis_piano_segment');
  for (const scene of [{ ...p.scene, backgroundMusic: 'unknown' }, { ...p.scene, musicGainDb: NaN }, { ...p.scene, musicGainDb: 1 }])
    expect(() => validateProject({ ...p, scene })).toThrow();
});
it('exports self-contained piano after voiceover timing without extending the video', () => {
  const p = createEmptyProject(); p.scene.backgroundMusic = 'piano'; p.scene.musicGainDb = -24;
  p.assets = [voice]; p.actions = [createAction('audio_play', { asset: voice.id }), createAction('wait', { duration: 1 })];
  const result = compileProject(p);
  expect(result.diagnostics).toEqual([]); expect(result.requiresTrust).toBe(false); expect(result.duration).toBe(5);
  expect(result.code).toContain('_anyvis_piano_segment(float(self.time)).apply_gain(-24)');
  expect(result.code.indexOf('_anyvis_finish_audio(self, _av_audio_tracks)')).toBeLessThan(result.code.indexOf('_anyvis_piano_segment(float(self.time))'));
  expect(compileProject({ ...p, scene: { ...p.scene, backgroundMusic: 'none' } }).code).not.toContain('_anyvis_piano_segment');
});
it('preserves validated assets and rejects traversal, duplicates and invalid media metadata', () => {
  const p = { ...createEmptyProject(), assets: [image, voice] };
  expect(validateProject(p).assets).toEqual([image, voice]);
  for (const assets of [[{ ...image, id: '../bad' }], [image, image], [{ ...voice, duration: Infinity }], [{ ...image, extension: 'py' }]])
    expect(() => validateProject({ ...p, assets })).toThrow();
});
it('compiles uploaded transparent images and nonblocking trimmed audio without arbitrary path permission', () => {
  const p = { ...createEmptyProject(), assets: [image, voice], actions: [
    createAction('image_asset', { asset: image.id, duration: .5 }),
    createAction('audio_play', { name: '讲解', asset: voice.id, offset: 1, length: 3, gain: -6 }),
    createAction('shift', { target: '图片', dx: 2, duration: 1 }),
    createAction('audio_stop', { target: '讲解' }),
    createAction('wait', { duration: 1 }),
  ] };
  const result = compileProject(p);
  expect(result.diagnostics).toEqual([]);
  expect(result.requiresTrust).toBe(false);
  expect(result.duration).toBe(2.5);
  expect(result.code).toContain(`ImageMobject("assets/${image.id}.png")`);
  expect(result.code).toContain('add_audio_segment');
  expect(result.code).toContain("'offset': 1, 'length': 3, 'gain': -6");
});
it('extends the final hold to audio end and rejects overlong or out-of-bounds cuts', () => {
  const p = { ...createEmptyProject(), assets: [voice], actions: [createAction('audio_play', { asset: voice.id }), createAction('wait', { duration: 1 })] };
  expect(compileProject(p).duration).toBe(5);
  p.actions[0].fields.offset = 6;
  expect(compileProject(p).diagnostics[0].message).toContain('裁剪');
  p.actions[0].fields.offset = 0; p.actions[0].fields.delay = 600;
  expect(compileProject(p).diagnostics[0].message).toContain('10 分钟');
});
