// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';
import { createEmptyProject } from './core/project';

// @ts-expect-error React test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('command palette keyboard interaction', () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrolled: string[];
  let originalScroll: PropertyDescriptor | undefined;
  beforeEach(() => {
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    scrolled = []; originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: function(this: HTMLElement) { scrolled.push(this.id); } });
  });
  afterEach(() => {
    act(() => root.unmount()); container.remove();
    if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });
  const press = (target: Element, key: string, options: KeyboardEventInit = {}) => act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }));
  });
  function mount() {
    const run = vi.fn(); const close = vi.fn();
    act(() => root.render(<CommandPalette project={createEmptyProject()} onClose={close} onAddBlock={vi.fn()} onSelectAction={vi.fn()}
      studioActions={Array.from({ length: 30 }, (_, id) => ({ id: String(id), title: `命令 ${id}`, subtitle: '', run }))} />));
    return { run, close, input: container.querySelector('input')! };
  }

  it('keeps the window open on right-click and middle-click of its backdrop', () => {
    const { close, input } = mount();
    const backdrop = container.querySelector('.cmd-palette-backdrop')!;
    for (const button of [2, 1]) act(() => { backdrop.dispatchEvent(new MouseEvent('mousedown', { button, bubbles: true })); });
    act(() => { input.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); });
    expect(close).not.toHaveBeenCalled();
    act(() => { backdrop.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); });
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not execute or close while confirming Chinese composition', () => {
    const { input, run, close } = mount();
    press(input, 'Enter', { isComposing: true }); press(input, 'Escape', { isComposing: true });
    press(input, 'Enter', { keyCode: 229 });
    expect(run).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
    press(input, 'Enter'); expect(run).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
  });

  it('announces and scrolls the active result while focus stays in the search field', () => {
    const { input } = mount();
    for (let i = 0; i < 18; i++) press(input, 'ArrowDown');
    const active = container.querySelector('[aria-selected="true"]')!;
    expect(active.textContent).toContain('命令 18');
    expect(input.getAttribute('aria-activedescendant')).toBe(active.id);
    expect(scrolled.at(-1)).toBe(active.id);
    expect(document.activeElement).toBe(input);
  });

  it('keeps Tab inside the palette and lets the close button handle Enter normally', () => {
    const { input, run, close } = mount();
    press(input, 'Tab', { shiftKey: true });
    const closeButton = container.querySelector<HTMLButtonElement>('[aria-label="关闭命令面板"]')!;
    expect(document.activeElement).toBe(closeButton);
    press(closeButton, 'Enter'); expect(run).not.toHaveBeenCalled();
    press(closeButton, 'Tab'); expect(document.activeElement).toBe(input);
    act(() => closeButton.click()); expect(close).toHaveBeenCalledOnce();
  });

  it('returns focus to the opener on unmount', () => {
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    try { mount(); act(() => root.render(null)); expect(document.activeElement).toBe(opener); }
    finally { opener.remove(); }
  });

  it('does not execute a search result on the parameter editor shortcut Ctrl+Enter', () => {
    const { input, run, close } = mount();
    press(input, 'Enter', { ctrlKey: true });
    expect(run).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  });
});
