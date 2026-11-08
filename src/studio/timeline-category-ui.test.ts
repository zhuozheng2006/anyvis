// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timeline } from './Timeline';
import { createEmptyProject } from './core/project';
import { appendAction } from './authoring';

describe('Timeline semantic category coloring and tag UI', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    if (typeof globalThis.ResizeObserver === 'undefined') {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    }
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1200 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
    HTMLElement.prototype.getBoundingClientRect = () => ({
      width: 1200,
      height: 600,
      top: 0,
      left: 0,
      bottom: 600,
      right: 1200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders category badges on clips and supports toggling color mode', async () => {
    let project = createEmptyProject();
    const circle = appendAction(project, 'circle', { name: '红圆', appear: 'fade' });
    project = circle.project;
    const rotate = appendAction(project, 'rotate', { target: '红圆', angle: 90, duration: 1.5 });
    project = rotate.project;
    const wait = appendAction(project, 'wait', { duration: 1 });
    project = wait.project;

    await act(async () => {
      root.render(
        React.createElement(Timeline, {
          project,
          selectedId: circle.action.id,
          time: 0,
          onChange: vi.fn(),
          onSelect: vi.fn(),
          onShowBlocks: vi.fn(),
          onSeek: vi.fn(),
          onError: vi.fn(),
        })
      );
    });

    // Check color mode button
    const colorModeBtn = container.querySelector<HTMLButtonElement>('.tl-color-mode-btn');
    expect(colorModeBtn).not.toBeNull();
    expect(colorModeBtn?.textContent).toContain('分类色彩');

    // Click to toggle to track colors
    await act(async () => {
      colorModeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(colorModeBtn?.textContent).toContain('轨道色彩');

    // Click back to category colors
    await act(async () => {
      colorModeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(colorModeBtn?.textContent).toContain('分类色彩');
  });
});
