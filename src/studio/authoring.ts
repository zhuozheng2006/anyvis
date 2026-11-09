import { createAction, getBlockDefinition } from './core/catalog';
import { getApiEntry } from './core/api-registry';
import type { Action, BlockDefinition, FieldValue, Project } from './core/types';
import { planObjectRename, renameProjectObject } from './blocks/rename';

export function managedDefinition(definition?: BlockDefinition): boolean {
  if (!definition?.createsObject) return false;
  if (!definition.apiId) return !['tracker', 'audio'].includes(definition.objectKind || '');
  const api = getApiEntry(definition.apiId);
  return api?.kind === 'class' && !['animation', 'value', 'enum', 'scene', 'camera', 'tracker'].includes(api.resultKind);
}
export const managedObject = (action: Action) => managedDefinition(getBlockDefinition(action.type));
export function flattenActions(actions: Action[]): Action[] {
  return actions.flatMap(a => [a, ...flattenActions(a.children || []), ...(a.branches || []).flatMap(flattenActions)]);
}
export function actionLabel(action: Action): string {
  if (managedObject(action)) return action.fields.appear === 'hidden' || action.fields.mode === 'store' ? '准备对象' : '出现';
  return getBlockDefinition(action.type)?.label || action.type;
}
export function actionTrack(action: Action): string {
  if (getBlockDefinition(action.type)?.container) return '编排';
  const definition = getBlockDefinition(action.type);
  if (definition?.apiId && ['play', 'animate'].includes(String(action.fields.mode))) {
    // Animation constructors carry the target inside structured parameters.
    for (const key of ['p_mobject', 'p_vmobject', 'p_method', 'p_mobjects']) {
      try {
        const value = JSON.parse(String(action.fields[key] || 'null'));
        const target = value?.$ref || value?.$method?.receiver?.$ref;
        if (typeof target === 'string') return target;
      } catch { /* Invalid fields remain visible in diagnostics. */ }
    }
  }
  return String((managedObject(action) ? action.fields.name : action.fields.target || action.fields.receiver) || '场景与逻辑');
}
export function actionDuration(action: Action): number | null {
  const definition = getBlockDefinition(action.type);
  const sum = (items: Action[]) => {
    const values = items.map(actionDuration);
    return values.some(v => v === null) ? null : values.reduce<number>((n, v) => n + v!, 0);
  };
  if (definition?.container) {
    if (action.type === 'api_context') return sum(action.children || []);
    if (definition.container === 'parallel') {
      const values = action.branches ? action.branches.map(sum) : (action.children || []).map(actionDuration);
      return values.some(v => v === null) ? null : Math.max(0, ...values as number[]);
    }
    const duration = sum(action.children || []);
    return duration === null ? null : duration * (definition.container === 'repeat' ? Number(action.fields.count) : 1);
  }
  if (action.type === 'code') return null;
  if (definition?.apiId) {
    if (['play', 'animate'].includes(String(action.fields.mode))) return Number(action.fields.duration);
    // A Scene API or arbitrary callback may advance scene time while storing its result.
    const entry = getApiEntry(definition.apiId);
    if (entry?.owner?.startsWith('manim.scene.') && !['get_mobject_family_members', 'get_top_level_mobjects'].includes(entry.name)) return null;
    return 0;
  }
  if (definition?.createsObject && (!('appear' in action.fields) || ['hidden', 'none'].includes(String(action.fields.appear)))) return 0;
  return typeof action.fields.duration === 'number' ? action.fields.duration : 0;
}
export interface TimelineClip { action: Action; start: number | null; duration: number | null; track: string; index: number }
export function timelineClips(actions: Action[]): TimelineClip[] {
  let cursor: number | null = 0;
  return actions.map((action, index) => {
    const duration = actionDuration(action);
    const clip = { action, start: cursor, duration, track: actionTrack(action), index };
    cursor = cursor === null || duration === null ? null : cursor + duration;
    return clip;
  });
}
export function mapActions(actions: Action[], update: (a: Action) => Action): Action[] {
  return actions.map(a => update({ ...a, ...(a.children ? { children: mapActions(a.children, update) } : {}), ...(a.branches ? { branches: a.branches.map(b => mapActions(b, update)) } : {}) }));
}
export function updateAction(project: Project, id: string, fields: Record<string, FieldValue>): Project {
  let next = project;
  if (typeof fields.name === 'string') next = renameProjectObject(project, id, fields.name);
  const changes = { ...fields }; delete changes.name;
  return { ...next, workspace: undefined, actions: mapActions(next.actions, a => a.id === id ? { ...a, fields: { ...a.fields, ...changes } } : a) };
}
export function appendAction(project: Project, type: string, fields: Record<string, FieldValue> = {}): { project: Project; action: Action } {
  const action = createAction(type, fields);
  if (getBlockDefinition(type)?.createsObject) {
    const names = new Set(flattenActions(project.actions).filter(a => getBlockDefinition(a.type)?.createsObject).map(a => a.fields.name));
    const original = String(action.fields.name); let suffix = 2;
    while (names.has(action.fields.name)) action.fields.name = `${original} ${suffix++}`;
  }
  return { project: { ...project, workspace: undefined, actions: [...project.actions, action] }, action };
}
export function objectDependents(project: Project, id: string): string[] {
  const source = flattenActions(project.actions).find(a => a.id === id);
  if (!source || !getBlockDefinition(source.type)?.createsObject) return [];
  const probe = `rename_check_${id.slice(0, 12)}`;
  return [...new Set(planObjectRename(project.actions, id, probe).filter(p => p.blockId !== id).map(p => p.blockId))];
}
export function removeAction(project: Project, id: string): Project {
  return removeActions(project, [id]);
}
export function removeActions(project: Project, ids: string[]): Project {
  if (!ids.length) return project;
  const idSet = new Set(ids);
  const allFlattened = flattenActions(project.actions);
  const removed = allFlattened.filter(a => idSet.has(a.id));
  const fullRemovedSubtrees = flattenActions(removed);
  const removedIds = new Set(fullRemovedSubtrees.map(a => a.id));

  const dependents = new Set(fullRemovedSubtrees.filter(a => getBlockDefinition(a.type)?.createsObject)
    .flatMap(a => objectDependents(project, a.id)).filter(dependent => !removedIds.has(dependent)));
  if (dependents.size) throw Error(`此片段中的对象仍被 ${dependents.size} 个动作使用，请先修改或移除这些动作。`);

  const remove = (actions: Action[]): Action[] => actions.filter(a => !removedIds.has(a.id)).map(a => ({ ...a, ...(a.children ? { children: remove(a.children) } : {}), ...(a.branches ? { branches: a.branches.map(remove) } : {}) }));
  return { ...project, workspace: undefined, actions: remove(project.actions) };
}
/** Ripple editing changes order, not arbitrary absolute scheduling. */
export function reorderAction(project: Project, id: string, beforeId: string | null): Project {
  const source = project.actions.find(a => a.id === id);
  if (!source) throw Error('复合片段内部的动作请在积木中调整顺序。');
  if (beforeId === id) return project;
  const remaining = project.actions.filter(a => a.id !== id);
  const index = beforeId === null ? remaining.length : remaining.findIndex(a => a.id === beforeId);
  if (index < 0) throw Error('目标片段不存在。');
  remaining.splice(index, 0, source);
  return { ...project, workspace: undefined, actions: remaining };
}
export function parallelWithNext(project: Project, id: string): Project {
  const index = project.actions.findIndex(a => a.id === id);
  if (index < 0 || index >= project.actions.length - 1) throw Error('请选择有后续片段的动作。');
  const pair = project.actions.slice(index, index + 2);
  if (pair.some(a => getBlockDefinition(a.type)?.container || !actionDuration(a) || ['code', 'camera', 'wait'].includes(a.type))) throw Error('请选择两个可并行的动画片段。');
  if (actionTrack(pair[0]) === actionTrack(pair[1])) throw Error('同一对象的两个动画不能同时执行。');
  const group = createAction('parallel'); group.children = pair;
  return { ...project, workspace: undefined, actions: [...project.actions.slice(0, index), group, ...project.actions.slice(index + 2)] };
}
export function duplicateAction(project: Project, id: string): { project: Project; action: Action } {
  const usedNames = new Set(
    flattenActions(project.actions)
      .filter(a => getBlockDefinition(a.type)?.createsObject)
      .map(a => String(a.fields.name))
  );
  const renames: { id: string; name: string }[] = [];
  const cloneNode = (node: Action): Action => {
    const fresh = createAction(node.type, { ...node.fields });
    if (getBlockDefinition(node.type)?.createsObject && typeof fresh.fields.name === 'string') {
      const tracker = node.type === 'tracker';
      const base = fresh.fields.name.replace(tracker ? /_\d+$/ : /\s+\d+$/, '');
      const candidateFor = (suffix: number) => {
        const ending = `${tracker ? '_' : ' '}${suffix}`;
        return `${base.slice(0, (tracker ? 31 : 100) - ending.length)}${ending}`;
      };
      let suffix = 2;
      let candidate = candidateFor(suffix);
      while (usedNames.has(candidate)) {
        suffix += 1;
        candidate = candidateFor(suffix);
      }
      // Keep the old name until the whole clone exists so semantic renaming can
      // update its references, including forward/nested API references.
      renames.push({ id: fresh.id, name: candidate });
      usedNames.add(candidate);
    }
    if (node.children) fresh.children = node.children.map(cloneNode);
    if (node.branches) fresh.branches = node.branches.map(branch => branch.map(cloneNode));
    return fresh;
  };

  let clonedResult: Action | null = null;
  const insertAfter = (items: Action[]): Action[] => {
    const out: Action[] = [];
    for (const item of items) {
      if (item.id === id) {
        let copy = cloneNode(item);
        let clonedProject = { ...project, actions: [copy] };
        // Limit renaming to the copied subtree: outside users of the original
        // object and external references used by the copy must remain untouched.
        for (const rename of renames) clonedProject = renameProjectObject(clonedProject, rename.id, rename.name);
        copy = clonedProject.actions[0];
        clonedResult = copy;
        out.push(item, copy);
      } else {
        out.push({
          ...item,
          ...(item.children ? { children: insertAfter(item.children) } : {}),
          ...(item.branches ? { branches: item.branches.map(insertAfter) } : {}),
        });
      }
    }
    return out;
  };

  const nextActions = insertAfter(project.actions);
  if (!clonedResult) throw Error('未找到要复制的动作或对象。');
  return {
    project: { ...project, workspace: undefined, actions: nextActions },
    action: clonedResult,
  };
}
export function scaleActionsDuration(project: Project, ids: string[], factor: number): Project {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw Error('变速倍率必须为正数。');
  }
  const idSet = new Set(ids);
  const allFlattened = flattenActions(project.actions);
  const roots = allFlattened.filter(a => idSet.has(a.id));
  const targetSubtreeIds = new Set(flattenActions(roots).map(a => a.id));
  const fps = Math.max(1, project.scene.fps || 30);
  const minDur = Math.max(0.05, 1 / fps);

  let updatedCount = 0;
  const nextActions = mapActions(project.actions, action => {
    if (!targetSubtreeIds.has(action.id)) return action;
    const currentDur = action.fields.duration;
    if (typeof currentDur !== 'number' || currentDur <= 0) return action;
    const raw = currentDur * factor;
    const snapped = Math.min(120, Math.max(minDur, Math.round(raw * fps) / fps));
    updatedCount += 1;
    return {
      ...action,
      fields: {
        ...action.fields,
        duration: Number(snapped.toFixed(4)),
      },
    };
  });

  if (updatedCount === 0) {
    throw Error('所选片段没有可缩放的动画时长。');
  }
  return { ...project, workspace: undefined, actions: nextActions };
}
