// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StageZoomControls, getNextZoomIn, getNextZoomOut, ZOOM_STEPS } from './StageZoomControls';

describe('StageZoomControls helpers', () => {
  it('correctly calculates next zoom in and out steps', () => {
    expect(ZOOM_STEPS).toEqual([0.5, 0.75, 1.0, 1.25, 1.5, 2.0]);
    expect(getNextZoomIn(0.5)).toBe(0.75);
    expect(getNextZoomIn(1.0)).toBe(1.25);
    expect(getNextZoomIn(2.0)).toBe(2.25);
    expect(getNextZoomIn(2.75)).toBe(3.0);
    expect(getNextZoomIn(3.0)).toBe(3.0);

    expect(getNextZoomOut(2.0)).toBe(1.5);
    expect(getNextZoomOut(1.0)).toBe(0.75);
    expect(getNextZoomOut(0.5)).toBe(0.25);
    expect(getNextZoomOut(0.25)).toBe(0.25);
  });
});

describe('StageZoomControls', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

  it('renders zoom percentage and triggers onZoomIn and onZoomOut', async () => {
    const onZoomChange = vi.fn();
    const onResetZoom = vi.fn();
    const onToggleFullscreen = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(StageZoomControls, {
          zoom: 1.0,
          onZoomChange,
          onResetZoom,
          isFullscreen: false,
          onToggleFullscreen,
        })
      );
    });

    const pill = container.querySelector('.stage-zoom-pill')!;
    expect(pill.textContent).toBe('100%');

    // Click Reset
    await act(async () => {
      pill.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onResetZoom).toHaveBeenCalledTimes(1);

    // Click Zoom In
    const zoomInBtn = container.querySelector('button[aria-label="放大画面"]')!;
    await act(async () => {
      zoomInBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onZoomChange).toHaveBeenCalledWith(1.25);

    // Click Zoom Out
    const zoomOutBtn = container.querySelector('button[aria-label="缩小画面"]')!;
    await act(async () => {
      zoomOutBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onZoomChange).toHaveBeenCalledWith(0.75);

    // Click Fullscreen
    const fsBtn = container.querySelector('button[aria-label="舞台全屏预览"]')!;
    await act(async () => {
      fsBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
  });
});
