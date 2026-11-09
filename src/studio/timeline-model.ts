import { createAction, getBlockDefinition } from './core/catalog';
import { compileProject } from './core/compiler';
import type { Action, Project } from './core/types';
import { actionDuration, appendAction, timelineClips, updateAction, type TimelineClip } from './authoring';

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

/** Cut the audible range into two independently editable cues, sharing the source. */
export function splitAudioClip(project: Project, clip: AudioClip, time: number): { project: Project; id: string } {
  if (!clip.editable || clip.start === null) throw Error('嵌套或动态配音请在积木中编辑。');
  const cut = frameTime(time, project.scene.fps), left = cut - clip.start, right = clip.duration - left;
  if (left < 1 / project.scene.fps - 1e-8 || right < 1 / project.scene.fps - 1e-8) throw Error('请把播放头放在配音内部，左右至少各保留一帧。');
  const first = updateAction(project, clip.action.id, { length: left });
  const result = appendAction(first, 'audio_play', { ...clip.action.fields, name: `${clip.action.fields.name} 分段`, delay: cut, offset: clip.offset + left, length: right });
  const next = { ...result.project, actions: [result.action, ...result.project.actions.filter(a => a.id !== result.action.id)] };
  return { project: checkedEdit(project, next), id: result.action.id };
}

/** Split only waits and linear relative movement; other animations cannot be replayed safely. */
export function splitActionClip(project: Project, clip: TimelineClip, time: number): { project: Project; id: string } {
  if (clip.start === null || clip.duration === null) throw Error('动态片段请在积木中编辑。');
  const action = clip.action;
  if (action.type !== 'wait' && action.type !== 'shift') throw Error('当前仅支持分割等待和匀速移动；此动画无法保持原效果，请在积木中编排。');
  if (action.type === 'shift' && action.fields.easing !== 'linear') throw Error('非匀速移动分割后会改变原运动节奏；请先选择匀速，或在积木中编排。');
  const fps = project.scene.fps;
  const cut = frameTime(time, fps);
  // Snap only the playhead. Rounding each piece separately changes the total
  // duration of imported projects whose timing is not on the current frame grid.
  const left = cut - clip.start;
  const right = clip.duration - left;
  if (left < 1 / fps - 1e-8 || right < 1 / fps - 1e-8) {
    throw Error('请把播放头放在片段内部，左右至少各保留一帧。');
  }

  const idx = project.actions.findIndex(a => a.id === action.id);
  if (idx < 0) throw Error('片段不存在或在复合动作内部，请在积木中调整。');

  if (action.type === 'wait') {
    const firstWait = { ...action, fields: { ...action.fields, duration: left } };
    const secondWait = createAction('wait', { duration: right });
    const nextActions = [...project.actions];
    nextActions.splice(idx, 1, firstWait, secondWait);
    return { project: checkedEdit(project, { ...project, workspace: undefined, actions: nextActions }), id: secondWait.id };
  }

  const proportion = left / (left + right);
  if (action.type === 'shift' && (typeof action.fields.dx === 'number' || typeof action.fields.dy === 'number' || typeof action.fields.dz === 'number')) {
    const origDx = Number(action.fields.dx || 0), origDy = Number(action.fields.dy || 0), origDz = Number(action.fields.dz || 0);
    const firstDx = origDx * proportion, firstDy = origDy * proportion, firstDz = origDz * proportion;
    const secondDx = origDx - firstDx, secondDy = origDy - firstDy, secondDz = origDz - firstDz;
    const firstAction = { ...action, fields: { ...action.fields, duration: left, dx: firstDx, dy: firstDy, dz: firstDz } };
    const secondAction = createAction('shift', { ...action.fields, duration: right, dx: secondDx, dy: secondDy, dz: secondDz });
    const nextActions = [...project.actions];
    nextActions.splice(idx, 1, firstAction, secondAction);
    return { project: checkedEdit(project, { ...project, workspace: undefined, actions: nextActions }), id: secondAction.id };
  }

  throw Error('该类型的片段不支持在时间轴中自动分割。');
}

/** Ripple insertion; waiting gaps can be split, animations cannot be silently overlapped. */
export function moveAnimationClip(project: Project, id: string, requested: number): Project {
  return moveAnimationClips(project, [id], requested, id);
}

/** Batch ripple insertion for multiple selected animation clips; preserves relative order. */
export function moveAnimationClips(project: Project, ids: string[], requestedStart: number, anchorId: string): Project {
  if (ids.length <= 1) {
    const id = ids[0] ?? anchorId;
    const selected = timelineClips(project.actions).find(c => c.action.id === id);
    if (!selected || selected.start === null || selected.duration === null) throw Error('动态片段请在积木中调整顺序。');
    const start = frameTime(Math.max(0, requestedStart), project.scene.fps);
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

  const idSet = new Set(ids);
  const allClips = timelineClips(project.actions);
  const selectedClips = allClips.filter(c => idSet.has(c.action.id));
  const anchorClip = selectedClips.find(c => c.action.id === anchorId) || selectedClips[0];
  if (!anchorClip || anchorClip.start === null || anchorClip.duration === null) throw Error('动态片段请在积木中调整顺序。');
  if (selectedClips.some(c => c.start === null || c.duration === null)) throw Error('动态片段请在积木中调整顺序。');

  const delta = frameTime(requestedStart - anchorClip.start, project.scene.fps);
  if (Math.abs(delta) < 1e-8) return project;

  const selectedActions = project.actions.filter(a => idSet.has(a.id));
  const rest = project.actions.filter(a => !idSet.has(a.id));
  const clips = timelineClips(rest);

  const minSelectedStart = Math.min(...selectedClips.map(c => c.start!));
  const start = frameTime(Math.max(0, minSelectedStart + delta), project.scene.fps);

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
    rest.splice(split.index, 1, createAction('wait', { duration: split.before }), ...selectedActions, createAction('wait', { duration: split.after }));
  } else {
    if (index === rest.length) {
      const last = clips[clips.length - 1]; const end = last ? (last.start ?? 0) + (last.duration ?? 0) : 0;
      gap = Math.max(0, start - end);
    }
    rest.splice(index, 0, ...(gap ? [createAction('wait', { duration: gap })] : []), ...selectedActions);
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
