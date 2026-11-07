import { expect, it } from 'vitest';
import { createAction } from './core/catalog';
import { createEmptyProject, validateProject } from './core/project';
import { compileProject } from './core/compiler';
import { audioClips, editAudioClip, moveAnimationClip, resizeAnimationClip, splitAudioClip } from './timeline-model';
import { timelineClips } from './authoring';
const voice = { id: 'b'.repeat(64), name: 'voice.wav', kind: 'audio' as const, extension: 'wav', bytes: 100, duration: 10 };
const audioProject = () => ({ ...createEmptyProject(), assets: [voice], actions: [createAction('wait', { duration: 2 }), createAction('audio_play', { asset: voice.id, delay: 1, offset: 2, length: 4 }), createAction('wait', { duration: 5 }), createAction('audio_stop', { target: '配音' })] });
it('projects independent sound, stops and repeated nested playback at their actual times', () => {
  const p = audioProject();
  expect(audioClips(p)[0]).toMatchObject({ start: 3, anchor: 2, duration: 4, stop: 7 });
  const repeat = createAction('repeat', { count: 2 }); repeat.children = [createAction('audio_play', { asset: voice.id, length: 1 }), createAction('wait', { duration: 2 })];
  p.actions = [repeat];
  expect(audioClips(p).map(c => [c.start, c.duration, c.editable])).toEqual([[0, 1, false], [2, 1, false]]);
});
it('moves sound independently while preserving visual time and one canonical project', () => {
  const p = audioProject(), next = editAudioClip(p, audioClips(p)[0], 1, 5, 'move');
  expect(audioClips(next)[0]).toMatchObject({ start: 1, duration: 4, offset: 2, stop: 7 });
  expect(next.actions.filter(a => a.type === 'wait').map(a => a.fields.duration)).toEqual([2, 5]);
  expect(compileProject(validateProject(next)).diagnostics).toEqual([]);
  expect(compileProject(next).duration).toBe(7);
  expect(compileProject(next).code).toContain("'start': self.time + 1");
  expect(() => editAudioClip(p, audioClips(p)[0], 6, 10, 'move')).toThrow('停止播放');
});
it('trims the source in point and duration without modifying the original asset', () => {
  const p = audioProject(), next = editAudioClip(p, audioClips(p)[0], 4, 7, 'left');
  expect(audioClips(next)[0]).toMatchObject({ start: 4, duration: 3, offset: 3 });
  expect(next.assets).toEqual(p.assets);
  expect(() => editAudioClip(p, audioClips(p)[0], 0, 7, 'left')).toThrow('源文件');
});
it('ripple-inserts an animation into a wait and rejects moves before object construction', () => {
  const circle = createAction('circle', { appear: 'none' }), move = createAction('shift', { target: '圆', duration: 1 });
  const p = { ...createEmptyProject(), actions: [circle, createAction('wait', { duration: 4 }), move] };
  const next = moveAnimationClip(p, move.id, 2);
  expect(timelineClips(next.actions).find(c => c.action.id === move.id)?.start).toBe(2);
  expect(compileProject(next).duration).toBe(5);
  const resized = resizeAnimationClip(next, move.id, 2.5);
  expect(compileProject(resized).duration).toBe(6.5);
  expect(() => moveAnimationClip({ ...p, actions: [createAction('wait', { duration: 1 }), circle, move] }, move.id, 0)).toThrow();
});
it('muted audio retains timeline length but is excluded from the exported mix', () => {
  const p = audioProject(); p.actions[1].fields.muted = 'yes';
  const compiled = compileProject(p);
  expect(compiled.diagnostics).toEqual([]); expect(compiled.duration).toBe(7);
  expect(compiled.code).toContain("'muted': True"); expect(compiled.code).toContain("if not track['muted']:");
});
it('cuts audio at the playhead with contiguous source samples and independent cues', () => {
  const p = audioProject(); p.actions[1].fields.gain = -6;
  const { project: next, id } = splitAudioClip(p, audioClips(p)[0], 5);
  const pieces = audioClips(next).sort((a, b) => a.start! - b.start!);
  expect(pieces.map(c => [c.start, c.offset, c.duration])).toEqual([[3, 2, 2], [5, 4, 2]]);
  expect(pieces[1].action.id).toBe(id);
  expect(pieces.every(c => c.action.fields.gain === -6)).toBe(true);
  expect(new Set(pieces.map(c => c.action.fields.name)).size).toBe(2);
  expect(next.assets).toEqual(p.assets);
  expect(compileProject(next).diagnostics).toEqual([]);
  expect(compileProject(next).duration).toBe(7);
  expect(p.actions[1].fields.length).toBe(4);
});
it('cuts only the audible range and rejects endpoints or nested cues', () => {
  const p = audioProject(); p.actions[1].fields.length = 8;
  const clip = audioClips(p)[0];
  expect(clip.duration).toBe(4);
  expect(audioClips(splitAudioClip(p, clip, 4).project).find(c => c.action.id !== clip.action.id)?.duration).toBe(3);
  for (const at of [clip.start!, clip.start! + clip.duration]) expect(() => splitAudioClip(p, clip, at)).toThrow('一帧');
  expect(() => splitAudioClip(p, { ...clip, editable: false }, 4)).toThrow('嵌套');
});
