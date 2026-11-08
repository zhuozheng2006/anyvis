// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ComplexMappingModal } from './ComplexMappingModal';
import type { Project } from './core/types';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dummyProject: Project = {
  schemaVersion: 2,
  id: 'proj_cp_modal_test',
  name: 'Test Project',
  scene: { dimension: '2d', background: '#000000', width: 1920, height: 1080, fps: 60 },
  actions: [],
};

describe('ComplexMappingModal', () => {
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
        React.createElement(ComplexMappingModal, {
          isOpen: false,
          onClose: () => {},
          project: dummyProject,
          onApply: () => {},
        }),
      );
    });
    expect(container.querySelector('.complex-map-overlay')).toBeNull();
  });

  it('renders modal with HUD, complex presets, and triggers apply', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ComplexMappingModal, {
          isOpen: true,
          onClose,
          project: dummyProject,
          onApply,
        }),
      );
    });

    const overlay = container.querySelector('.complex-map-overlay');
    expect(overlay).not.toBeNull();

    // Check header
    expect(container.textContent).toContain('3B1B 复变函数与共形映射工作台');

    // Check conformal HUD
    expect(container.textContent).toContain('局部共形导数 (Conformal HUD)');
    expect(container.textContent).toContain('局部伸缩');
    expect(container.textContent).toContain('局部旋转');

    // Check presets
    expect(container.textContent).toContain('二次平方映射');
    expect(container.textContent).toContain('复指数映射');

    // Trigger apply button
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
    expect(appliedProject.actions.length).toBe(3);
    expect(actionIds.length).toBe(3);
  });
});
