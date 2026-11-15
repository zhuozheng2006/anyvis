// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timeline } from './Timeline';
import { createEmptyProject } from './core/project';
import { createAction } from './core/catalog';

// @ts-expect-error React test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('timeline shortcut ownership', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1200, height: 600, top: 0, left: 0, bottom: 600, right: 1200, x: 0, y: 0, toJSON: () => ({}),
    });
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function mount() {
    const wait = createAction('wait', { duration: 2 });
    const onChange = vi.fn(), onSelect = vi.fn(), onSeek = vi.fn(), onPlay = vi.fn();
    act(() => root.render(<Timeline project={{ ...createEmptyProject(), actions: [wait] }} selectedId={wait.id}
      selectedIds={[wait.id]} time={1} canPlay onPlay={onPlay} onChange={onChange} onSelect={onSelect} onSeek={onSeek}
      onShowBlocks={vi.fn()} onError={vi.fn()} />));
    onChange.mockClear(); onSelect.mockClear(); onSeek.mockClear();
    return { onChange, onSelect, onSeek, onPlay, section: container.querySelector('.tl-editor')! };
  }
  function press(target: Element, key: string, options: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
    act(() => { target.dispatchEvent(event); }); return event;
  }
  function openMarkerDialog() {
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="节奏标记助手"]')!.click());
    return container.querySelector<HTMLButtonElement>('.smm-close-btn')!;
  }

  it('does not delete the selected background clip from the marker dialog', () => {
    const { onChange, onSelect } = mount();
    press(openMarkerDialog(), 'Delete');
    expect(onChange).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(container.querySelector('.smm-overlay')).not.toBeNull();
  });

  it('lets Escape close the marker dialog without clearing background selection', () => {
    const { onSelect } = mount();
    press(openMarkerDialog(), 'Escape');
    expect(container.querySelector('.smm-overlay')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores IME events and keyboard events already consumed by a child', () => {
    const { onChange, onSeek, section } = mount();
    press(section, 'd', { isComposing: true });
    press(section, 'd', { keyCode: 229 });
    expect(onChange).not.toHaveBeenCalled();
    const button = container.querySelector('button')!;
    button.addEventListener('keydown', event => event.preventDefault(), { once: true });
    press(button, 'ArrowRight');
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('keeps delete and arrows inside editable text', () => {
    const { onChange, onSeek, section } = mount();
    const editable = document.createElement('div'); editable.setAttribute('contenteditable', '');
    editable.innerHTML = '<span>正在编辑</span>'; section.append(editable);
    press(editable.firstElementChild!, 'Delete'); press(editable.firstElementChild!, 'ArrowRight');
    expect(onChange).not.toHaveBeenCalled(); expect(onSeek).not.toHaveBeenCalled();
  });

  it('still duplicates, deletes and seeks when the timeline owns the keyboard', () => {
    const { onChange, onSelect, onSeek, section } = mount();
    press(section, 'd');
    expect(onChange.mock.calls[0][0].actions).toHaveLength(2);
    press(section, 'Delete');
    expect(onChange.mock.calls[1][0].actions).toHaveLength(0);
    expect(onSelect).toHaveBeenLastCalledWith('');
    press(section, 'ArrowRight');
    expect(onSeek).toHaveBeenCalledOnce();
  });

  it('leaves Space on focused buttons to their native activation', () => {
    const { onPlay } = mount();
    const addMarker = container.querySelector<HTMLButtonElement>('[aria-label="添加时间轴标记"]')!;
    addMarker.focus();
    const event = press(addMarker, ' ', { code: 'Space' });
    expect(event.defaultPrevented).toBe(false);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('still plays with Space when the timeline surface owns the keyboard', () => {
    const { onPlay, section } = mount();
    const event = press(section, ' ', { code: 'Space' });
    expect(event.defaultPrevented).toBe(true);
    expect(onPlay).toHaveBeenCalledOnce();
  });
});
