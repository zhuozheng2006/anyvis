import type { MediaAsset, Project } from './core/types';

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';
export interface RenderJob {
  id: string; status: JobStatus; progress?: number; message?: string;
  videoUrl?: string; posterUrl?: string; duration?: number; error?: string;
  blockId?: string; revision?: string;
}
export interface EngineHealth {
  authoringProtocol?: number;
  available: boolean; version?: string; python?: string; latex?: boolean;
  codec?: string; message?: string; error?: string;
  [key: string]: unknown;
}
let sessionToken = '';
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  for (let attempt = 0; attempt < 2; attempt++) {
    if (method !== 'GET' && !sessionToken) {
      const session = await fetch('/api/session', { signal: options.signal });
      if (!session.ok) throw new Error('无法连接渲染服务，请通过 AnyVis 启动器打开。');
      sessionToken = (await session.json()).token;
    }
    const headers = new Headers(options.headers);
    if (method !== 'GET') {
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      headers.set('X-AnyVis-Token', sessionToken);
    }
    const response = await fetch(path, { ...options, headers });
    let result: unknown;
    try { result = await response.json(); } catch { throw new Error('渲染服务未启动，或返回了无效数据。'); }
    if (response.ok) return result as T;
    const data = result as { error?: string | { message?: string }; message?: string };
    const message = typeof data.error === 'string' ? data.error : data.error?.message;
    // The service rejects expired sessions before dispatching mutations. Retry only
    // this rejection, never a permission/trust failure or an ambiguous network error.
    if (response.status === 403 && message === '会话已过期，请刷新页面。') {
      sessionToken = '';
      if (attempt === 0 && method !== 'GET' && !(options.body instanceof ReadableStream)) continue;
    }
    throw new Error(message || data.message || `请求失败 (${response.status})`);
  }
  throw new Error('无法刷新本地服务会话。');
}
export function startRender(project: Project, quality: 'preview' | 'final', revision: string, trustCode: boolean) {
  return api<RenderJob>('/api/render', { method: 'POST', body: JSON.stringify({ project: { ...project, workspace: undefined }, quality, revision, trustCode }) });
}
export function uploadAsset(file: File): Promise<MediaAsset> {
  if (file.size > 64 * 1024 * 1024) throw Error('单个素材最大 64 MB。');
  return api<MediaAsset>(`/api/assets?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
}
