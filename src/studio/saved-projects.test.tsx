// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SavedProjects } from './SavedProjects';
import { createEmptyProject } from './core/project';
import { createAction } from './core/catalog';
import type { SavedProject } from './storage';

// @ts-expect-error React test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('saved project navigation', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  function render(items: SavedProject[], current = createEmptyProject()) {
    const onOpen = vi.fn(); const onContinue = vi.fn();
    act(() => root.render(<SavedProjects items={items} currentProject={current} onOpen={onOpen} onContinue={onContinue} />));
    return { onOpen, onContinue };
  }
  function search(value: string) {
    const input = host.querySelector('input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  const saved = (name: string, savedAt: number): SavedProject => ({ project: { ...createEmptyProject(), name }, savedAt });

  it('continues the live work without reopening an older automatic save', () => {
    const old = saved('旧标题', 1);
    const current = { ...old.project, name: '刚修改的标题', actions: [createAction('circle')] };
    const { onOpen, onContinue } = render([old], current);
    const row = host.querySelector<HTMLButtonElement>('.current-project')!;
    expect(row.textContent).toContain('刚修改的标题'); expect(row.textContent).toContain('1 个积木');
    act(() => row.click());
    expect(onContinue).toHaveBeenCalledOnce(); expect(onOpen).not.toHaveBeenCalled();
    expect(old.project.name).toBe('旧标题');
  });

  it('keeps a work visible before its first automatic save', () => {
    const current = { ...createEmptyProject(), name: '新作品' };
    render([], current);
    expect(host.querySelector('.current-project')?.textContent).toContain('新作品');
    expect(host.querySelector('[role="status"]')?.textContent).toBe('共 1 个作品');
  });

  it('matches multiple words case-insensitively and opens the exact selected project', () => {
    const match = saved('Manim 线性代数', 2); const other = saved('几何', 3);
    const { onOpen } = render([match, other]);
    search('  线性 MANIM  ');
    const rows = host.querySelectorAll<HTMLButtonElement>('.saved-project-list > button');
    expect(rows.length).toBe(1); act(() => rows[0].click());
    expect(onOpen).toHaveBeenCalledWith(match.project);
    expect(host.querySelector('[role="status"]')?.textContent).toBe('找到 1 / 3 个作品');
  });

  it('offers a clear path out of an empty search', () => {
    render([saved('几何', 1)]); search('几何');
    const clear = host.querySelector<HTMLButtonElement>('[aria-label="清除作品搜索"]')!;
    clear.focus(); act(() => clear.click());
    expect(document.activeElement).toBe(host.querySelector('input'));
    search('没有这样的作品');
    expect(host.textContent).toContain('没有找到匹配的作品');
    const showAll = Array.from(host.querySelectorAll('button')).find(button => button.textContent === '显示全部作品')!;
    showAll.focus(); act(() => showAll.click());
    expect(document.activeElement).toBe(host.querySelector('input'));
    expect(host.querySelector('input')?.value).toBe('');
    expect(host.querySelectorAll('.saved-project-list > button').length).toBe(2);
  });

  it('sorts by recent saves or natural names without mutating stored entries', () => {
    const items = [saved('方案 10', 20), saved('方案 2', 10)];
    render(items); search('方案');
    const names = () => Array.from(host.querySelectorAll('.saved-project-list strong')).map(node => node.textContent);
    expect(names()).toEqual(['方案 10', '方案 2']);
    act(() => { const select = host.querySelector('select')!; select.value = 'name'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(names()).toEqual(['方案 2', '方案 10']);
    expect(items.map(item => item.project.name)).toEqual(['方案 10', '方案 2']);
  });
});
