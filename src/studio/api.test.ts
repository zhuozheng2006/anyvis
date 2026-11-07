import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
it('refreshes an expired service session and retries the rejected mutation once', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response({ token: 'old' }))
    .mockResolvedValueOnce(response({ error: '会话已过期，请刷新页面。' }, 403))
    .mockResolvedValueOnce(response({ token: 'new' })).mockResolvedValueOnce(response({ id: 'job' }));
  vi.stubGlobal('fetch', fetch); const { api } = await import('./api');
  expect(await api('/api/render', { method: 'POST', body: '{}' })).toEqual({ id: 'job' });
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(fetch.mock.calls[1][1].headers.get('X-AnyVis-Token')).toBe('old');
  expect(fetch.mock.calls[3][1].headers.get('X-AnyVis-Token')).toBe('new');
  expect(fetch.mock.calls[3][1].body).toBe('{}');
});
it('does not retry trust failures and preserves raw upload headers', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response({ token: 'token' }))
    .mockResolvedValueOnce(response({ error: '请先阅读代码，再明确启用。' }, 403));
  vi.stubGlobal('fetch', fetch); const { api } = await import('./api');
  await expect(api('/api/assets', { method: 'POST', headers: new Headers({ 'Content-Type': 'application/octet-stream' }), body: new Blob(['data']) })).rejects.toThrow('明确启用');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][1].headers.get('Content-Type')).toBe('application/octet-stream');
});
it('stops after one session retry when the service continues rejecting it', async () => {
  const fetch = vi.fn().mockImplementation(async (url: string) => url === '/api/session'
    ? response({ token: 'token' }) : response({ error: '会话已过期，请刷新页面。' }, 403));
  vi.stubGlobal('fetch', fetch); const { api } = await import('./api');
  await expect(api('/api/render', { method: 'POST', body: '{}' })).rejects.toThrow('会话已过期');
  expect(fetch).toHaveBeenCalledTimes(4);
});
