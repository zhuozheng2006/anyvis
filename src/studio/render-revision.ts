import type { Project } from './core/types';

/** Markers describe editing/chapters; they do not change rendered frames or audio. */
export function renderScene(scene: Project['scene']): Omit<Project['scene'], 'markers'> {
  const { markers: _markers, ...settings } = scene;
  return settings;
}

export function revisionOf(project: Project): string {
  const value = JSON.stringify([renderScene(project.scene), project.actions, project.assets]);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return `${project.id}:${(hash >>> 0).toString(16)}`;
}
