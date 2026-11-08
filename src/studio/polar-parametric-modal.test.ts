// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { PolarParametricModal } from './PolarParametricModal';
import type { Project } from './core/types';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dummyProject: Project = {
  schemaVersion: 2,
  id: 'proj_polar_modal_test',
  name: 'Polar Test',
  scene: { dimension: '2d', background: '#000000', width: 1920, height: 1080, fps: 60 },
  actions: [],
};

describe('PolarParametricModal', () => {
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

  it('does not render when closed', async () => {
    await act(async () => {
      root.render(
        React.createElement(PolarParametricModal, {
          isOpen: false,
          onClose: () => {},
          project: dummyProject,
          onApply: () => {},
        }),
      );
    });
    expect(container.querySelector('.polar-modal-overlay')).toBeNull();
  });

  it('renders modal with polar/parametric curves, presets, and triggers apply', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(PolarParametricModal, {
          isOpen: true,
          onClose,
          project: dummyProject,
          onApply,
        }),
      );
    });

    const overlay = container.querySelector('.polar-modal-overlay');
    expect(overlay).not.toBeNull();

    // Check title
    expect(container.textContent).toContain('极坐标与参数方程曲线动画交互台');

    // Check presets
    expect(container.textContent).toContain('玫瑰花瓣线');
    expect(container.textContent).toContain('心脏线');
    expect(container.textContent).toContain('李萨如振动图形');

    // Check stats HUD
    expect(container.textContent).toContain('微分几何实时度量');
    expect(container.textContent).toContain('直角坐标 (x, y):');
    expect(container.textContent).toContain('累计轨迹弧长 L:');

    // Trigger apply
    const applyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('插入到当前场景'),
    );
    expect(applyBtn).toBeDefined();

    await act(async () => {
      applyBtn?.click();
    });

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    const [appliedProject, actionIds] = onApply.mock.calls[0];
    expect(appliedProject.actions.length).toBeGreaterThan(0);
    expect(actionIds.length).toBeGreaterThan(0);
  });
});
