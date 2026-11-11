// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ObjectManager } from './ObjectManager';
import { ObjectDialog } from './ObjectDialog';
import { createAction } from './core/catalog';
import { createEmptyProject } from './core/project';

// @ts-expect-error React test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('object dialog keyboard flow', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div'); document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const key = (element: Element, value: string, options: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options });
    act(() => { element.dispatchEvent(event); });
    return event;
  };
  const button = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
    .find(element => element.getAttribute('aria-label') === label || element.textContent?.includes(label))!;
  function manager(type = 'circle') {
    const circle = createAction(type, { name: '对象' });
    act(() => root.render(<ObjectManager project={{ ...createEmptyProject(), actions: [circle] }} selectedId={circle.id}
      onSelect={vi.fn()} onChange={vi.fn()} onAdd={vi.fn()} onError={vi.fn()} />));
  }

  it('focuses the object search and returns to the opener on Escape', () => {
    manager();
    const opener = button('添加对象'); opener.focus(); act(() => opener.click());
    const search = container.querySelector<HTMLInputElement>('[aria-label="搜索对象"]')!;
    expect(document.activeElement).toBe(search);
    expect(key(search, 'Escape').defaultPrevented).toBe(true);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('wraps Tab in both directions and recalculates after switching to assets', () => {
    manager(); act(() => button('添加对象').click());
    const close = button('关闭窗口');
    close.focus(); key(close, 'Tab', { shiftKey: true });
    const last = Array.from(container.querySelectorAll('.om-catalog-card')).at(-1);
    expect(document.activeElement).toBe(last);
    key(last!, 'Tab'); expect(document.activeElement).toBe(close);
    act(() => button('素材与音画').click());
    close.focus(); key(close, 'Tab', { shiftKey: true });
    expect(document.activeElement).not.toBe(last);
    expect(container.querySelector('.om-modal')?.contains(document.activeElement)).toBe(true);
    key(document.activeElement!, 'Tab'); expect(document.activeElement).toBe(close);
  });

  it('makes the parameter drawer keyboard accessible and restores its opener', () => {
    manager('axes');
    const opener = button('全部参数'); opener.focus(); act(() => opener.click());
    const close = button('关闭参数面板');
    expect(document.activeElement).toBe(close);
    key(close, 'Escape');
    expect(container.querySelector('.om-drawer')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('preserves IME composition and blocks editor shortcuts behind the picker', () => {
    manager(); act(() => button('添加对象').click());
    key(document.activeElement!, 'Escape', { isComposing: true });
    expect(container.querySelector('.om-modal')).not.toBeNull();
    const shortcut = vi.fn(); window.addEventListener('keydown', shortcut);
    try { key(button('关闭窗口'), '1'); expect(shortcut).not.toHaveBeenCalled(); }
    finally { window.removeEventListener('keydown', shortcut); }
  });

  it('skips disabled, hidden and negative-tabindex controls', () => {
    act(() => root.render(<ObjectDialog className="test-dialog" label="test" onClose={vi.fn()}>
      <button disabled>disabled</button><div style={{ display: 'none' }}><button>hidden</button></div>
      <button tabIndex={-1}>programmatic only</button><button id="only-control">active</button>
    </ObjectDialog>));
    const only = container.querySelector('#only-control')!;
    expect(document.activeElement).toBe(only);
    expect(key(only, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(only);
  });

  it('leaves nested dialog Escape to the nested editor', () => {
    const close = vi.fn();
    act(() => root.render(<ObjectDialog className="test-dialog" label="outer" onClose={close}>
      <div role="dialog" aria-label="inner"><input /></div>
    </ObjectDialog>));
    key(container.querySelector('input')!, 'Escape');
    expect(close).not.toHaveBeenCalled();
  });
});
