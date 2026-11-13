// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canUsePlaybackSpaceShortcut, canUseWorkspaceShortcut, handleProjectShortcut } from './studio-shortcuts';

describe('project shortcut ownership', () => {
  let area: HTMLDivElement;
  let actions: Parameters<typeof handleProjectShortcut>[1];
  let listener: (event: KeyboardEvent) => void;
  beforeEach(() => {
    area = document.createElement('div'); document.body.append(area);
    actions = { save: vi.fn(), render: vi.fn(), undo: vi.fn(), redo: vi.fn(), togglePalette: vi.fn(), closeStudioDialog: vi.fn() };
    listener = event => handleProjectShortcut(event, actions);
    window.addEventListener('keydown', listener, true);
  });
  afterEach(() => { window.removeEventListener('keydown', listener, true); area.remove(); });
  function press(target: Element, key: string, options: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event); return event;
  }

  it('preserves save, preview, palette, undo and redo outside dialogs', () => {
    press(area, 's', { ctrlKey: true }); press(area, 'Enter', { metaKey: true });
    press(area, 'k', { ctrlKey: true }); press(area, 'z', { metaKey: true });
    press(area, 'Z', { ctrlKey: true, shiftKey: true });
    for (const name of ['save', 'render', 'togglePalette', 'undo', 'redo'] as const) expect(actions[name]).toHaveBeenCalledOnce();
  });

  it('lets parameter editors consume Ctrl+Enter without starting a preview', () => {
    area.innerHTML = '<div role="dialog"><input /></div>';
    const apply = vi.fn(); const input = area.querySelector('input')!;
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && event.ctrlKey) apply(); });
    expect(press(input, 'Enter', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(apply).toHaveBeenCalledOnce(); expect(actions.render).not.toHaveBeenCalled();
  });

  it('leaves text undo and input-method confirmation to the field', () => {
    area.innerHTML = '<div contenteditable=""><span>text</span></div>';
    press(area.querySelector('span')!, 'z', { ctrlKey: true });
    press(area, 'Enter', { ctrlKey: true, isComposing: true });
    press(area, 'Enter', { ctrlKey: true, keyCode: 229 });
    expect(actions.undo).not.toHaveBeenCalled(); expect(actions.render).not.toHaveBeenCalled();
  });

  it('does not close the underlying settings window when a nested dialog receives Escape', () => {
    area.innerHTML = '<div role="dialog" class="studio-modal"><div role="dialog"><input /></div><button>close</button></div>';
    press(area.querySelector('input')!, 'Escape');
    expect(actions.closeStudioDialog).not.toHaveBeenCalled();
    press(area.querySelector('button')!, 'Escape');
    expect(actions.closeStudioDialog).toHaveBeenCalledOnce();
  });

  it('allows Cmd+K to dismiss its palette but does not open it over another modal', () => {
    area.innerHTML = '<div role="dialog" class="cmd-palette-dialog"><input /></div>';
    press(area.querySelector('input')!, 'k', { metaKey: true });
    expect(actions.togglePalette).toHaveBeenCalledOnce();
    area.querySelector('div')!.className = 'om-modal';
    press(area.querySelector('input')!, 'k', { ctrlKey: true });
    expect(actions.togglePalette).toHaveBeenCalledOnce();
  });

  it('blocks background view shortcuts even when focus has strayed outside a modal', () => {
    area.innerHTML = '<button>background</button><div role="dialog"></div>';
    expect(canUseWorkspaceShortcut(press(area.querySelector('button')!, '1'))).toBe(false);
    area.querySelector('[role="dialog"]')!.remove();
    expect(canUseWorkspaceShortcut(press(area.querySelector('button')!, '1'))).toBe(true);
    expect(canUseWorkspaceShortcut(press(area, '1', { isComposing: true }))).toBe(false);
  });

  it('restricts Space playback shortcut on focused interactive controls while allowing non-interactive workspace regions', () => {
    area.innerHTML = '<div tabindex="0" id="stage"></div><button>播放</button><div role="tab">积木</div><input type="range" />';
    expect(canUsePlaybackSpaceShortcut(press(area.querySelector('#stage')!, ' '))).toBe(true);
    expect(canUsePlaybackSpaceShortcut(press(area.querySelector('button')!, ' '))).toBe(false);
    expect(canUsePlaybackSpaceShortcut(press(area.querySelector('[role="tab"]')!, ' '))).toBe(false);
    expect(canUsePlaybackSpaceShortcut(press(area.querySelector('input')!, ' '))).toBe(false);
  });
});
