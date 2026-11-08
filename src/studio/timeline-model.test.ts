import { expect, it } from 'vitest';
import { createAction } from './core/catalog';
import { createEmptyProject, validateProject } from './core/project';
import { compileProject } from './core/compiler';
import { audioClips, editAudioClip, moveAnimationClip, moveAnimationClips, resizeAnimationClip, splitActionClip, splitAudioClip } from './timeline-model';
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
it('batch ripple-moves multiple selected animations together preserving relative order', () => {
  const circle = createAction('circle', { appear: 'none' });
  const move1 = createAction('shift', { target: '圆', duration: 1 });
  const move2 = createAction('rotate', { target: '圆', duration: 1.5 });
  const p = { ...createEmptyProject(), actions: [circle, createAction('wait', { duration: 4 }), move1, move2] };
  const next = moveAnimationClips(p, [move1.id, move2.id], 1, move1.id);
  const clips = timelineClips(next.actions);
  const c1 = clips.find(c => c.action.id === move1.id);
  const c2 = clips.find(c => c.action.id === move2.id);
  expect(c1?.start).toBe(1);
  expect(c2?.start).toBe(2);
  expect(compileProject(next).duration).toBe(6.5);
  expect(compileProject(next).diagnostics).toEqual([]);
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
it('splits wait and animation clips at the playhead with proportional parameter subdivision', () => {
  const c = createAction('circle', { name: 'c' });
  const w = createAction('wait', { duration: 4 });
  const s = createAction('shift', { target: 'c', duration: 2, dx: 4, dy: 2 });
  const p = { ...createEmptyProject(), actions: [c, w, s] };

  // Wait clip split: circle is 1s, wait is 1s -> 5s. Split at t = 2.5s (1.5s into wait)
  const clips1 = timelineClips(p.actions);
  const waitClip = clips1.find(clip => clip.action.id === w.id)!;
  const splitWait = splitActionClip(p, waitClip, 2.5);
  expect(splitWait.project.actions.map(a => a.type)).toEqual(['circle', 'wait', 'wait', 'shift']);
  expect(splitWait.project.actions[1].fields.duration).toBe(1.5);
  expect(splitWait.project.actions[2].fields.duration).toBe(2.5);
  expect(compileProject(splitWait.project).diagnostics).toEqual([]);

  // Shift clip split: shift starts at 5s, ends at 7s. Split at 5.5s (1/4 of the way)
  const clips2 = timelineClips(p.actions);
  const shiftClip = clips2.find(clip => clip.action.id === s.id)!;
  const splitShift = splitActionClip(p, shiftClip, 5.5);
  expect(splitShift.project.actions.map(a => a.type)).toEqual(['circle', 'wait', 'shift', 'shift']);
  expect(splitShift.project.actions[2].fields).toMatchObject({ duration: 0.5, dx: 1, dy: 0.5 });
  expect(splitShift.project.actions[3].fields).toMatchObject({ duration: 1.5, dx: 3, dy: 1.5 });
  expect(compileProject(splitShift.project).diagnostics).toEqual([]);

  // Boundary error checking: wait is from 1s to 5s
  expect(() => splitActionClip(p, waitClip, 1)).toThrow('一帧');
  expect(() => splitActionClip(p, waitClip, 5)).toThrow('一帧');
});
