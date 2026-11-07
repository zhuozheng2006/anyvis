import { createAction, getBlockDefinition } from './core/catalog';
import { compileProject } from './core/compiler';
import type { Action, Project } from './core/types';
import { actionDuration, timelineClips, updateAction } from './authoring';

export interface AudioClip {
  id: string; action: Action; start: number | null; duration: number; anchor: number | null;
  offset: number; sourceDuration: number; stop: number | null; editable: boolean;
}
export const frameTime = (time: number, fps: number) => Math.round(time * fps) / fps;
export function audioClips(project: Project): AudioClip[] {
  const clips: AudioClip[] = [], active = new Map<string, AudioClip>();
  const counts = new Map<string, number>();
  const walk = (actions: Action[], origin: number | null, nested = false): number | null => {
    let cursor = origin;
    for (const action of actions) {
      if (action.type === 'audio_play') {
        const name = String(action.fields.name), previous = active.get(name);
        if (previous) previous.stop = cursor;
        const sourceDuration = project.assets?.find(a => a.id === action.fields.asset)?.duration || 0;
        const offset = Number(action.fields.offset), available = Math.max(0, sourceDuration - offset);
        const count = counts.get(action.id) || 0; counts.set(action.id, count + 1);
        const clip: AudioClip = { id: `${action.id}:audio:${count}`, action, anchor: cursor, start: cursor === null ? null : cursor + Number(action.fields.delay), duration: Math.min(available, Number(action.fields.length) || available), offset, sourceDuration, stop: null, editable: !nested };
        clips.push(clip); active.set(name, clip);
      } else if (action.type === 'audio_stop') {
        const clip = active.get(String(action.fields.target)); if (clip) clip.stop = cursor;
      } else if (action.type === 'sequence' || action.type === 'api_context' || action.type === 'repeat') {
        const count = action.type === 'repeat' ? Number(action.fields.count) : 1;
        for (let i = 0; i < Math.min(2000, count); i++) cursor = walk(action.children || [], cursor, true);
        continue;
      }
      const duration = actionDuration(action);
      cursor = cursor === null || duration === null ? null : cursor + duration;
    }
    return cursor;
  };
  walk(project.actions, 0);
  return clips.map(c => ({ ...c, duration: c.start !== null && c.stop !== null ? Math.max(0, Math.min(c.duration, c.stop - c.start)) : c.duration }));
}

/** All edits commit to the action tree, never a second timeline document. */
export function editAudioClip(project: Project, clip: AudioClip, start: number, end: number, mode: 'move' | 'left' | 'right'): Project {
  if (!clip.editable || clip.start === null || clip.anchor === null) throw Error('嵌套或动态配音请在积木中编辑播放时机。');
  const fps = project.scene.fps;
  start = frameTime(Math.max(0, start), fps); end = frameTime(end, fps);
  const delta = mode === 'left' ? start - clip.start : 0;
  const offset = clip.offset + delta;
  const duration = mode === 'move' ? clip.duration : end - start;
  if (offset < -1e-8 || duration < 1 / fps - 1e-8 || offset + duration > clip.sourceDuration + 1e-8) throw Error('裁剪范围必须在配音源文件时长内，且至少保留一帧。');
  if (start + duration > 600) throw Error('片段不能超过场景的 10 分钟范围。');
  if (clip.stop !== null && start + duration > clip.stop + 1e-8) throw Error('片段超过“停止播放配音”的位置，请先移动或删除停止积木。');
  let next = updateAction(project, clip.action.id, { delay: start, offset: Math.max(0, offset), length: duration });
  // A nonblocking root audio cue may move to the beginning without changing visual timing.
  const action = next.actions.find(a => a.id === clip.action.id)!;
  next = { ...next, actions: [action, ...next.actions.filter(a => a.id !== action.id)] };
  return checkedEdit(project, next);
}

export function checkedEdit(before: Project, after: Project): Project {
  const existing = new Set(compileProject(before).diagnostics.filter(d => d.severity === 'error').map(d => `${d.blockId}:${d.message}`));
  const added = compileProject(after).diagnostics.find(d => d.severity === 'error' && !existing.has(`${d.blockId}:${d.message}`));
  if (added) throw Error(added.message);
  return after;
}

/** Ripple insertion; waiting gaps can be split, animations cannot be silently overlapped. */
export function moveAnimationClip(project: Project, id: string, requested: number): Project {
  const selected = timelineClips(project.actions).find(c => c.action.id === id);
  if (!selected || selected.start === null || selected.duration === null) throw Error('动态片段请在积木中调整顺序。');
  const start = frameTime(Math.max(0, requested), project.scene.fps);
  if (Math.abs(start - selected.start) < 1e-8) return project;
  const rest = project.actions.filter(a => a.id !== id), clips = timelineClips(rest);
  let index = rest.length, gap = 0, split: { index: number; before: number; after: number } | undefined;
  for (const clip of clips) {
    if (clip.start === null || clip.duration === null) { index = clip.index; break; }
    const end = clip.start + clip.duration;
    if (clip.action.type === 'wait' && start > clip.start && start < end) {
      split = { index: clip.index, before: start - clip.start, after: end - start }; break;
    }
    if (start < clip.start + clip.duration / 2) { index = clip.index; break; }
  }
  if (split) {
    rest.splice(split.index, 1, createAction('wait', { duration: split.before }), selected.action, createAction('wait', { duration: split.after }));
  } else {
    if (index === rest.length) {
      const last = clips[clips.length - 1]; const end = last ? (last.start ?? 0) + (last.duration ?? 0) : 0;
      gap = Math.max(0, start - end);
    }
    rest.splice(index, 0, ...(gap ? [createAction('wait', { duration: gap })] : []), selected.action);
  }
  return checkedEdit(project, { ...project, workspace: undefined, actions: rest });
}

export function resizeAnimationClip(project: Project, id: string, duration: number): Project {
  const clip = timelineClips(project.actions).find(c => c.action.id === id);
  const field = clip && getBlockDefinition(clip.action.type)?.fields.find(f => f.name === 'duration');
  if (!clip || !field || getBlockDefinition(clip.action.type)?.container) throw Error('复合片段请在积木中编辑内部时长。');
  duration = frameTime(duration, project.scene.fps);
  if (duration < Math.max(1 / project.scene.fps, field.min ?? 0) || duration > (field.max ?? 600)) throw Error('片段时长超出允许范围。');
  return checkedEdit(project, updateAction(project, id, { duration }));
}
