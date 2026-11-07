import type { BackgroundMusic, Project } from './core/types';
import { validateProject } from './core/project';

const CURRENT = 'anyvis.studio.v2.current';
const LIBRARY = 'anyvis.studio.v2.projects';
const DEFAULT_MUSIC = 'anyvis.studio.defaultMusic';
export function readDefaultMusic(): BackgroundMusic {
  try { return localStorage.getItem(DEFAULT_MUSIC) === 'none' ? 'none' : 'piano'; }
  catch { return 'piano'; }
}
export function saveDefaultMusic(music: BackgroundMusic) { localStorage.setItem(DEFAULT_MUSIC, music); }
/** Apply preferences only when creating a new work, never when opening a saved/imported work. */
export function withDefaultMusic(project: Project): Project {
  return { ...project, scene: { ...project.scene, backgroundMusic: readDefaultMusic(), musicGainDb: -18 } };
}
export interface SavedProject { project: Project; savedAt: number }
export function readProjects(): SavedProject[] {
  try {
    const list = JSON.parse(localStorage.getItem(LIBRARY) || '[]');
    if (!Array.isArray(list)) return [];
    return list.flatMap(item => { try { return [{ project: validateProject(item.project), savedAt: Number(item.savedAt) || 0 }]; } catch { return []; } });
  } catch { return []; }
}
export function readCurrent(): Project | undefined {
  try {
    const current = validateProject(JSON.parse(localStorage.getItem(CURRENT) || 'null'));
    // A previous quota failure may have saved the newer version only to the library.
    return readProjects().find(item => item.project.id === current.id)?.project || current;
  } catch { return undefined; }
}
export function saveProject(project: Project) {
  const valid = validateProject({ ...project, name: project.name.trim() ? project.name : '未命名动画' });
  const items = readProjects().filter(item => item.project.id !== valid.id);
  // Save the durable project list first: a quota error must not overwrite the only current draft.
  localStorage.setItem(LIBRARY, JSON.stringify([{ project: valid, savedAt: Date.now() }, ...items]));
  localStorage.setItem(CURRENT, JSON.stringify(valid));
}
/** Fall back only when reading the editor fails, never after a partial storage write. */
export function saveLatestProject(snapshot: () => Project | undefined, fallback: Project) {
  let latest = fallback;
  try { latest = snapshot() || fallback; } catch { /* Keep the last valid editor state. */ }
  saveProject(latest);
}
export function downloadText(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function fileName(name: string) { return name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 90) || 'AnyVis'; }
