import type { Project } from './core/types';
export interface ProjectHistory { past: Project[]; present: Project; future: Project[] }
export type HistoryAction = { type: 'edit'; value: Project | ((p: Project) => Project) } | { type: 'undo' } | { type: 'redo' };
const content = (p: Project) => JSON.stringify([p.id, p.name, p.scene, p.actions, p.assets]);
export function projectHistory(state: ProjectHistory, action: HistoryAction): ProjectHistory {
  if (action.type === 'undo') {
    if (!state.past.length) return state;
    return { past: state.past.slice(0, -1), present: state.past.at(-1)!, future: [state.present, ...state.future] };
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state;
    return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  }
  const next = typeof action.value === 'function' ? action.value(state.present) : action.value;
  if (next.id !== state.present.id) return { past: [], present: next, future: [] };
  if (content(next) === content(state.present)) return { ...state, present: next };
  return { past: [...state.past.slice(-79), state.present], present: next, future: [] };
}
