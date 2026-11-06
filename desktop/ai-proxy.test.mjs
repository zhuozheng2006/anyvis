import { afterEach, describe, expect, it, vi } from 'vitest';
import { completionEndpoint, generateProject } from './ai-proxy.mjs';
import { createEmptyProject } from '../src/studio/core/project.ts';
import { createAction } from '../src/studio/core/catalog.ts';

function project() {
  const value = createEmptyProject();
  value.actions = [createAction('circle')];
  return value;
}
afterEach(() => vi.unstubAllGlobals());

describe('explicit AI provider proxy', () => {
  it('supports HTTPS base URLs and local models but rejects unsafe credential URLs', () => {
    expect(completionEndpoint('https://example.com/v1').url.href).toBe('https://example.com/v1/chat/completions');
    expect(completionEndpoint('http://127.0.0.1:1234/v1').local).toBe(true);
    expect(() => completionEndpoint('http://example.com/v1')).toThrow('HTTPS');
    expect(() => completionEndpoint('https://user:password@example.com/v1')).toThrow('HTTPS');
    expect(() => completionEndpoint('https://example.com/v1?key=secret')).toThrow('HTTPS');
  });
  it('makes one bounded request only on explicit invocation and validates the response', async () => {
    const p = project();
    const fetchMock = vi.fn(async (_url, request) => {
      const input = JSON.parse(request.body);
      expect(input.model).toBe('test-model');
      expect(input.max_tokens).toBe(12000);
      expect(request.redirect).toBe('error');
      expect(request.headers.Authorization).toBe('Bearer test-only-key');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...p, name: '修改后的动画' }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20 } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const output = await generateProject({ endpoint: 'https://example.com/v1', model: 'test-model', key: 'test-only-key', prompt: '修改标题', project: p });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(output.project.name).toBe('修改后的动画');
    expect(output.project.id).toBe(p.id);
    expect(output.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });
  it('does not disclose provider response bodies or retry authorization failures', async () => {
    const fetchMock = vi.fn(async () => new Response('echoed-secret-token', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateProject({ endpoint: 'https://example.com/v1', model: 'test', key: 'test-only-key', prompt: '做一个圆', project: project() })).rejects.toThrow('401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects truncated output without overwriting the current project', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{' } }] }))));
    const original = project();
    const before = JSON.stringify(original);
    await expect(generateProject({ endpoint: 'http://localhost:1234/v1', model: 'local', prompt: '再加一个圆', project: original })).rejects.toThrow('长度上限');
    expect(JSON.stringify(original)).toBe(before);
  });
});
