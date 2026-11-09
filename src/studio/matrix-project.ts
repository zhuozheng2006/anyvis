import { createAction, getBlockDefinition } from './core/catalog';
import { flattenActions } from './authoring';
import { appendPlaygroundActions, playgroundName } from './playground-actions';
import type { Project } from './core/types';

export function createMatrixActions(project: Project, matrix: string) {
  const kinds = getBlockDefinition('apply_matrix')!.fields.find(f => f.name === 'target')!.objectKinds!;
  const target = flattenActions(project.actions).filter(a => {
    const d = getBlockDefinition(a.type);
    return d?.createsObject && kinds.includes(d.objectKind || '');
  }).at(-1);
  const targetName = target ? String(target.fields.name) : playgroundName('平面');
  const actions = target ? [] : [createAction('plane', { name: targetName })];
  const action = createAction('apply_matrix', { matrix, target: targetName });
  actions.push(action);
  return { ...appendPlaygroundActions(project, actions), action, targetName };
}
