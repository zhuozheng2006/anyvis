import { createAction } from './core/catalog.ts';
import { API_ENTRIES } from './core/api-registry.ts';
import { createEmptyProject, validateProject } from './core/project.ts';
import { compileProject } from './core/compiler.ts';
import type { Action, Project } from './core/types.ts';

/** Workbenches emit the same validated, editable actions as the main editor. */
export const playgroundName = (label: string) => `${label}_${crypto.randomUUID().slice(0, 8)}`;
export function playgroundApi(path: string, name: string, params: Record<string, unknown>, options: { receiver?: string; mode?: string; duration?: number } = {}): Action {
  const entry = API_ENTRIES.find(entry => entry.path === path);
  if (!entry) throw new Error(`未注册的 Manim API：${path}`);
  return createAction(entry.type, { name, ...Object.fromEntries(Object.entries(params).map(([key, value]) => [`p_${key}`, JSON.stringify(value)])), ...options });
}
export function appendPlaygroundActions(project: Project, actions: Action[], dimension = project.scene.dimension) {
  const next = validateProject({ ...project, workspace: undefined, scene: { ...project.scene, dimension }, actions: [...project.actions, ...actions] });
  const errors = compileProject(next).diagnostics.filter(d => d.severity === 'error');
  if (errors.length) throw new Error(errors.map(d => d.message).join('\n'));
  return { project: next, actionIds: actions.map(action => action.id) };
}
/** Sampled geometry stays data; no user expression is evaluated as Python code. */
export function playgroundPolyline(name: string, points: number[][], color = '#38bdf8', visible = true): Action[] {
  if (points.length < 2 || points.some(p => p.length !== 3 || p.some(v => !Number.isFinite(v)))) throw new Error('曲线采样必须包含有限坐标。');
  return [
    playgroundApi('VMobject', name, { stroke_color: color, stroke_width: 3 }, { mode: 'store' }),
    playgroundApi('VMobject.set_points_as_corners', playgroundName('曲线点集'), { points }, { receiver: name, mode: 'store' }),
    ...(visible ? [createAction('create', { target: name, duration: 1 })] : []),
  ];
}

export const emptyPlayground = createEmptyProject;
export function playgroundPython(result: { project: Project }, className: string): string {
  return compileProject(result.project).code.replace('class AnyVisScene(', `class ${className}(`);
}
