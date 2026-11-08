// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { AutoLayoutModal } from './AutoLayoutModal';
import type { Project } from './core/types';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dummyProject: Project = {
  schemaVersion: 2,
  id: 'proj_layout_modal_test',
  name: 'AutoLayout Test',
  scene: { dimension: '2d', background: '#000000', width: 1920, height: 1080, fps: 60 },
  actions: [
    {
      id: 'a1',
      type: 'create_circle',
      fields: { name: 'Dot_1', x: -2, y: 1, radius: 0.5 },
      children: [],
    },
    {
      id: 'a2',
      type: 'create_circle',
      fields: { name: 'Dot_2', x: 2, y: -1, radius: 0.5 },
      children: [],
    },
  ],
};

describe('AutoLayoutModal', () => {
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
        React.createElement(AutoLayoutModal, {
          isOpen: false,
          onClose: () => {},
          project: dummyProject,
          onApply: () => {},
        }),
      );
    });
    expect(container.querySelector('.layout-modal-overlay')).toBeNull();
  });

  it('renders modal with movable objects, layout modes, and triggers apply', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(AutoLayoutModal, {
          isOpen: true,
          onClose,
          project: dummyProject,
          onApply,
        }),
      );
    });

    const overlay = container.querySelector('.layout-modal-overlay');
    expect(overlay).not.toBeNull();

    // Check title
    expect(container.textContent).toContain('智能对齐与多物体自动布局');

    // Check movable objects list
    expect(container.textContent).toContain('Dot_1');
    expect(container.textContent).toContain('Dot_2');

    // Check layout modes
    expect(container.textContent).toContain('水平整齐排列');
    expect(container.textContent).toContain('垂直对齐排列');
    expect(container.textContent).toContain('网格矩阵布局');
    expect(container.textContent).toContain('环形放射分布');

    // Switch to vertical layout
    const verticalBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('垂直对齐排列'),
    );
    expect(verticalBtn).toBeDefined();

    await act(async () => {
      verticalBtn?.click();
    });

    // Trigger apply
    const applyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('应用自动对齐布局'),
    );
    expect(applyBtn).toBeDefined();

    await act(async () => {
      applyBtn?.click();
    });

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    const [appliedProject, actionIds] = onApply.mock.calls[0];
    expect(appliedProject.actions.length).toBe(2);
    expect(actionIds).toHaveLength(2);
  });
});
