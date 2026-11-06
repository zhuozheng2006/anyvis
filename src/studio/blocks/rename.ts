import { getBlockDefinition } from '../core/catalog';
import { RESERVED_SYMBOLS } from '../core/expression';
import type { Action, FieldValue, Project } from '../core/types';

export interface RenamePatch { blockId: string; field: string; value: FieldValue }

function flatten(actions: Action[]): Action[] {
  return actions.flatMap((action) => [action, ...flatten(action.children ?? []), ...(action.branches ?? []).flatMap(flatten)]);
}

/** A name edit is a semantic transaction, never a search/replace over text. */
export function planObjectRename(actions: Action[], actionId: string, candidate: string): RenamePatch[] {
  const all = flatten(actions);
  const source = all.find((action) => action.id === actionId);
  const definition = source && getBlockDefinition(source.type);
  if (!source || !definition?.createsObject) throw new Error('只能重命名创建对象的积木。');
  const name = candidate.trim();
  const previous = String(source.fields.name);
  if (!name || name.length > 100 || /[\r\n\0,，]/.test(name)) throw new Error('名称需要 1–100 个字符，不能含换行或逗号。');
  const isTracker = definition.objectKind === 'tracker';
  if (isTracker && (!/^[A-Za-z][A-Za-z_0-9]{0,30}$/.test(name) || RESERVED_SYMBOLS.has(name))) {
    throw new Error('参数名用英文字母开头，可含数字和下划线；请避开 x、t、pi 等数学名称。');
  }
  if (all.some((action) => action.id !== actionId && getBlockDefinition(action.type)?.createsObject && action.fields.name === name)) {
    throw new Error(`“${name}”已被使用，请换一个名称。`);
  }
  if (previous === name) return [];
  const patches: RenamePatch[] = [{ blockId: source.id, field: 'name', value: name }];
  // A copied constructor can temporarily share a name with the original. Its
  // rename must not steal references belonging to that original object.
  if (all.some((action) => action.id !== actionId && getBlockDefinition(action.type)?.createsObject && action.fields.name === previous)) return patches;
  for (const action of all) {
    const fields = getBlockDefinition(action.type)?.fields ?? [];
    for (const field of fields) {
      const value = action.fields[field.name];
      if (typeof value !== 'string') continue;
      const kind = field.reference ?? (field.type === 'object' ? 'object' : field.type === 'expression' ? 'expression' : undefined);
      let renamed = value;
      if (kind === 'object' && value === previous) renamed = name;
      if (kind === 'object-list') {
        renamed = value.split(/([,，])/).map((part) => part.trim() === previous ? part.replace(previous, () => name) : part).join('');
      }
      if (kind === 'expression' && isTracker) {
        renamed = value.replace(/[A-Za-z_][A-Za-z_0-9]*/g, (token) => token === previous ? name : token);
      }
      if (renamed !== value) patches.push({ blockId: action.id, field: field.name, value: renamed });
    }
  }
  return patches;
}

/** Used by the property inspector and AI edits; the caller owns undo history. */
export function renameProjectObject(project: Project, actionId: string, name: string): Project {
  const patches = planObjectRename(project.actions, actionId, name);
  if (!patches.length) return project;
  const changes = new Map<string, Record<string, FieldValue>>();
  for (const patch of patches) changes.set(patch.blockId, { ...changes.get(patch.blockId), [patch.field]: patch.value });
  const apply = (actions: Action[]): Action[] => actions.map((action) => ({
    ...action,
    ...(changes.has(action.id) ? { fields: { ...action.fields, ...changes.get(action.id)! } } : {}),
    ...(action.children ? { children: apply(action.children) } : {}),
    ...(action.branches ? { branches: action.branches.map(apply) } : {}),
  }));
  const updated = { ...project, actions: apply(project.actions) };
  delete updated.workspace;
  return updated;
}
