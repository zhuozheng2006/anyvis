// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { GeometryPlaygroundModal } from './GeometryPlaygroundModal';
import type { Project } from './core/types';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dummyProject: Project = {
  schemaVersion: 2,
  id: 'proj_geo_modal_test',
  name: 'Euclidean Geometry Test',
  scene: { dimension: '2d', background: '#000000', width: 1920, height: 1080, fps: 60 },
  actions: [],
};

describe('GeometryPlaygroundModal', () => {
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
        React.createElement(GeometryPlaygroundModal, {
          isOpen: false,
          onClose: () => {},
          project: dummyProject,
          onApply: () => {},
        }),
      );
    });
    expect(container.querySelector('.geo-modal-overlay')).toBeNull();
  });

  it('renders modal with euclidean geometry canvas, presets, and triggers apply', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(GeometryPlaygroundModal, {
          isOpen: true,
          onClose,
          project: dummyProject,
          onApply,
        }),
      );
    });

    const overlay = container.querySelector('.geo-modal-overlay');
    expect(overlay).not.toBeNull();

    // Check title
    expect(container.textContent).toContain('经典欧几里得几何与三角形四心画板');

    // Check presets
    expect(container.textContent).toContain('欧拉线与四心共线定理');
    expect(container.textContent).toContain('勾股定理几何弦图');

    // Check stats HUD
    expect(container.textContent).toContain('几何参量实时度量');
    expect(container.textContent).toContain('面积 S:');
    expect(container.textContent).toContain('周长 P:');
    expect(container.textContent).toContain('欧拉线比值 HG/GO:');

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
