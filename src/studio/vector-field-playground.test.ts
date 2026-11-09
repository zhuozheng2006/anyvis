import { compileProject } from './core/compiler.ts';
// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { VectorFieldPlaygroundModal } from './VectorFieldPlaygroundModal';
import type { Project } from './core/types';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dummyProject: Project = {
  schemaVersion: 2,
  id: 'proj_vf_test',
  name: 'Test Project',
  scene: { dimension: '2d', background: '#000000', width: 1920, height: 1080, fps: 60 },
  actions: [],
};

describe('VectorFieldPlaygroundModal', () => {
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
        React.createElement(VectorFieldPlaygroundModal, {
          isOpen: false,
          onClose: () => {},
          project: dummyProject,
          onApply: () => {},
        }),
      );
    });
    expect(container.querySelector('.vector-field-overlay')).toBeNull();
  });

  it('renders modal with HUD, mathematical presets, and triggers apply', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(VectorFieldPlaygroundModal, {
          isOpen: true,
          onClose,
          project: dummyProject,
          onApply,
        }),
      );
    });

    const overlay = container.querySelector('.vector-field-overlay');
    expect(overlay).not.toBeNull();

    // Check header title
    expect(container.textContent).toContain('2D 向量场与流线工作台');

    // Check probe HUD metrics
    expect(container.textContent).toContain('探针物理量 (Probe HUD)');
    expect(container.textContent).toContain('散度 ∇·F');
    expect(container.textContent).toContain('旋度 (∇×F)z');

    // Check presets exist
    expect(container.textContent).toContain('旋转涡流');
    expect(container.textContent).toContain('偶极子源汇场');

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
    expect(compileProject(appliedProject).diagnostics).toEqual([]);
    expect(appliedProject.actions.filter((a: {type:string}) => a.type === 'arrow').length).toBeGreaterThan(20);
    expect(actionIds.length).toBe(appliedProject.actions.length);
  });
});
