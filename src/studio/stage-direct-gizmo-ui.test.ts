// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { StageDirectGizmo } from './StageDirectGizmo';
import type { Action } from './core/types';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('StageDirectGizmo UI component', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders nothing when action is null or has no spatial/color fields', async () => {
    await act(async () => {
      root.render(
        React.createElement(StageDirectGizmo, {
          action: null,
          onChange: vi.fn(),
        })
      );
    });
    expect(container.firstChild).toBeNull();

    const waitAction: Action = { id: 'wait_1', type: 'wait', fields: { duration: 1.0 } };
    await act(async () => {
      root.render(
        React.createElement(StageDirectGizmo, {
          action: waitAction,
          onChange: vi.fn(),
        })
      );
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders reticle and quick strip for spatial object', async () => {
    const circleAction: Action = {
      id: 'circle_1',
      type: 'circle_create',
      fields: {
        name: 'my_circle',
        x: 0,
        y: 0,
        radius: 1.5,
        color: '#58C4DD',
      },
    };

    await act(async () => {
      root.render(
        React.createElement(StageDirectGizmo, {
          action: circleAction,
          onChange: vi.fn(),
        })
      );
    });

    expect(container.querySelector('[data-testid="stage-direct-gizmo"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gizmo-reticle"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gizmo-quick-strip"]')).toBeTruthy();
    expect(container.textContent).toContain('my_circle');
    expect(container.textContent).toContain('(0.0, 0.0)');
  });

  it('triggers onChange when preset alignment button is clicked', async () => {
    const circleAction: Action = {
      id: 'circle_1',
      type: 'circle_create',
      fields: {
        name: 'my_circle',
        x: 0,
        y: 0,
        color: '#58C4DD',
      },
    };
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(StageDirectGizmo, {
          action: circleAction,
          onChange,
        })
      );
    });

    const alignBtns = container.querySelectorAll('.gizmo-align-btn');
    expect(alignBtns.length).toBe(9);

    // Click UL (first button)
    await act(async () => {
      (alignBtns[0] as HTMLButtonElement).click();
    });

    expect(onChange).toHaveBeenCalledWith({ x: -4.5, y: 2.5 });
  });

  it('triggers onChange when color swatch is clicked', async () => {
    const circleAction: Action = {
      id: 'circle_1',
      type: 'circle_create',
      fields: {
        name: 'my_circle',
        x: 0,
        y: 0,
        color: '#58C4DD',
      },
    };
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(StageDirectGizmo, {
          action: circleAction,
          onChange,
        })
      );
    });

    const colorDots = container.querySelectorAll('.gizmo-color-dot');
    expect(colorDots.length).toBe(8);

    // Click second color (翠绿 #83C167)
    await act(async () => {
      (colorDots[1] as HTMLButtonElement).click();
    });

    expect(onChange).toHaveBeenCalledWith({ color: '#83C167' });
  });
});
