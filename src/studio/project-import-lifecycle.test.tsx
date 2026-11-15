// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudioApp from './StudioApp';
import { createEmptyProject } from './core/project';
import type { Project } from './core/types';
import { readCurrent, saveProject } from './storage';

const { bundleImport } = vi.hoisted(() => ({ bundleImport: vi.fn() }));
vi.mock('./blocks/StudioBlocks', () => ({ StudioBlocks: () => <div /> }));
vi.mock('./media-bundle', () => ({ importProjectBundle: bundleImport, downloadProjectBundle: vi.fn() }));

// @ts-expect-error React test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const named = (name: string): Project => ({ ...createEmptyProject(), name });

describe('project import request ownership', () => {
  let container: HTMLDivElement;
  let root: Root;
  let mounted: boolean;
  beforeEach(async () => {
    localStorage.clear(); saveProject(named('开始编辑的作品'));
    bundleImport.mockReset();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 200 })));
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
    container = document.createElement('div'); document.body.append(container); root = createRoot(container); mounted = true;
    await act(async () => root.render(<StudioApp />));
  });
  afterEach(async () => {
    if (mounted) await act(async () => root.unmount());
    container?.remove(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  const title = () => container.querySelector<HTMLInputElement>('[aria-label="作品名称"]')!.value;
  const fileInput = () => container.querySelector<HTMLInputElement>('input[type="file"][accept*=".anyvis"]')!;
  const jsonFile = (name: string, text: () => Promise<string>) => {
    const file = new File(['{}'], `${name}.anyvis.json`, { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: text }); return file;
  };
  async function choose(file: File) {
    const input = fileInput();
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  async function newWork() {
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="我的作品"]')!.click());
    const create = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('新建作品'))!;
    await act(async () => create.click());
  }

  it.each(['json', 'zip'])('does not let a slow %s import replace a more recently opened file', async kind => {
    const first = deferred<Project>();
    if (kind === 'zip') {
      bundleImport.mockReturnValueOnce(first.promise);
      await choose(new File(['zip'], 'first.anyvis.zip'));
    } else {
      await choose(jsonFile('first', async () => JSON.stringify(await first.promise)));
    }
    await choose(jsonFile('second', async () => JSON.stringify(named('后来选择的作品'))));
    expect(title()).toBe('后来选择的作品');
    await act(async () => first.resolve(named('迟到的旧作品')));
    expect(title()).toBe('后来选择的作品');
  });

  it('invalidates a pending import when the user creates another work', async () => {
    const first = deferred<string>(); await choose(jsonFile('pending', () => first.promise));
    await newWork(); const chosenTitle = title();
    await act(async () => first.resolve(JSON.stringify(named('过期导入'))));
    expect(title()).toBe(chosenTitle);
    expect(container.textContent).not.toContain('已打开项目。');
  });

  it('ignores an older failure after a newer import succeeds', async () => {
    const first = deferred<string>(); await choose(jsonFile('pending', () => first.promise));
    await choose(jsonFile('second', async () => JSON.stringify(named('新作品'))));
    await act(async () => first.reject(new Error('旧请求失败')));
    expect(title()).toBe('新作品');
    expect(container.textContent).not.toContain('旧请求失败');
  });

  it('clears the file input immediately and supports selecting the same file again', async () => {
    const first = deferred<string>(), second = deferred<string>();
    const reader = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const file = jsonFile('same', reader); let value = 'C:\\fakepath\\same.anyvis.json';
    Object.defineProperty(fileInput(), 'value', { configurable: true, get: () => value, set: next => { value = next; } });
    await choose(file); expect(value).toBe('');
    value = 'C:\\fakepath\\same.anyvis.json'; await choose(file); expect(value).toBe(''); expect(reader).toHaveBeenCalledTimes(2);
    await act(async () => second.resolve(JSON.stringify(named('第二次读取'))));
    await act(async () => first.resolve(JSON.stringify(named('第一次读取'))));
    expect(title()).toBe('第二次读取');
  });

  it('leaves the saved work untouched when an import finishes after unmount', async () => {
    const first = deferred<string>(); await choose(jsonFile('pending', () => first.promise));
    await act(async () => root.unmount()); mounted = false;
    const stored = localStorage.getItem('anyvis.studio.v2.projects');
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    await act(async () => first.resolve(JSON.stringify(named('卸载后不应打开'))));
    expect(storageWrite).not.toHaveBeenCalled();
    expect(localStorage.getItem('anyvis.studio.v2.projects')).toBe(stored);
    expect(container.textContent).toBe('');
  });

  it('still refuses to switch if saving the current work fails', async () => {
    const original = readCurrent()!.id;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    await choose(jsonFile('new', async () => JSON.stringify(named('不应打开'))));
    expect(title()).toBe('开始编辑的作品');
    expect(readCurrent()!.id).toBe(original);
    expect(container.textContent).toContain('暂未切换');
  });
});
