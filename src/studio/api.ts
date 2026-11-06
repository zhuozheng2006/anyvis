import type { Project } from './core/types';

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';
export interface RenderJob {
  id: string; status: JobStatus; progress?: number; message?: string;
  videoUrl?: string; posterUrl?: string; duration?: number; error?: string;
  blockId?: string; revision?: string;
}
export interface EngineHealth {
  available: boolean; version?: string; python?: string; latex?: boolean;
  codec?: string; message?: string; error?: string;
  [key: string]: unknown;
}
let sessionToken = '';
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method || 'GET';
  if (method !== 'GET' && !sessionToken) {
    const session = await fetch('/api/session');
    if (!session.ok) throw new Error('无法连接渲染服务，请通过 AnyVis 启动器打开。');
    sessionToken = (await session.json()).token;
  }
  const response = await fetch(path, {
    ...options,
    headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-AnyVis-Token': sessionToken } : {}), ...options.headers },
  });
  let result: unknown;
  try { result = await response.json(); } catch { throw new Error('渲染服务未启动，或返回了无效数据。'); }
  if (!response.ok) {
    if (response.status === 403) sessionToken = '';
    const data = result as { error?: string | { message?: string }; message?: string };
    const message = typeof data.error === 'string' ? data.error : data.error?.message;
    throw new Error(message || data.message || `请求失败 (${response.status})`);
  }
  return result as T;
}
export function startRender(project: Project, quality: 'preview' | 'final', revision: string, trustCode: boolean) {
  return api<RenderJob>('/api/render', { method: 'POST', body: JSON.stringify({ project, quality, revision, trustCode }) });
}
