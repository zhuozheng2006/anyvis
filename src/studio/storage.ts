import type { Project } from './core/types';
import { validateProject } from './core/project';

const CURRENT = 'anyvis.studio.v2.current';
const LIBRARY = 'anyvis.studio.v2.projects';
export interface SavedProject { project: Project; savedAt: number }
export function readProjects(): SavedProject[] {
  try {
    const list = JSON.parse(localStorage.getItem(LIBRARY) || '[]');
    if (!Array.isArray(list)) return [];
    return list.flatMap(item => { try { return [{ project: validateProject(item.project), savedAt: Number(item.savedAt) || 0 }]; } catch { return []; } });
  } catch { return []; }
}
export function readCurrent(): Project | undefined {
  try { return validateProject(JSON.parse(localStorage.getItem(CURRENT) || 'null')); } catch { return undefined; }
}
export function saveProject(project: Project) {
  const items = readProjects().filter(item => item.project.id !== project.id);
  // Save the durable project list first: a quota error must not overwrite the only current draft.
  localStorage.setItem(LIBRARY, JSON.stringify([{ project, savedAt: Date.now() }, ...items]));
  localStorage.setItem(CURRENT, JSON.stringify(project));
}
export function downloadText(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function fileName(name: string) { return name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 90) || 'AnyVis'; }
