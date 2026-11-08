// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { Vector3DPlaygroundModal } from './Vector3DPlaygroundModal';
import { createEmptyProject } from './core/project';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Vector3DPlaygroundModal', () => {
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

  it('renders nothing when isOpen is false', async () => {
    await act(async () => {
      root.render(
        React.createElement(Vector3DPlaygroundModal, {
          isOpen: false,
          onClose: vi.fn(),
          project: createEmptyProject(),
          onApply: vi.fn(),
        })
      );
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders interactive 3D canvas and presets when isOpen is true', async () => {
    await act(async () => {
      root.render(
        React.createElement(Vector3DPlaygroundModal, {
          isOpen: true,
          onClose: vi.fn(),
          project: createEmptyProject(),
          onApply: vi.fn(),
        })
      );
    });
    expect(container.querySelector('.vector3d-modal-window')).toBeTruthy();
    expect(container.querySelector('.vector3d-svg')).toBeTruthy();
    expect(container.textContent).toContain('三维向量运算与叉乘工作台');
    expect(container.textContent).toContain('标准正交基与叉乘');
  });

  it('switches tabs to Manim CE source code view', async () => {
    await act(async () => {
      root.render(
        React.createElement(Vector3DPlaygroundModal, {
          isOpen: true,
          onClose: vi.fn(),
          project: createEmptyProject(),
          onApply: vi.fn(),
        })
      );
    });

    const codeTabBtn = Array.from(container.querySelectorAll('.tab-btn')).find(
      btn => btn.textContent?.includes('Manim CE 源码')
    ) as HTMLButtonElement;
    expect(codeTabBtn).toBeTruthy();

    await act(async () => {
      codeTabBtn.click();
    });

    expect(container.querySelector('.code-block')).toBeTruthy();
    expect(container.textContent).toContain('ThreeDScene');
  });

  it('calls onApply and onClose when apply button clicked', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(Vector3DPlaygroundModal, {
          isOpen: true,
          onClose,
          project: createEmptyProject(),
          onApply,
        })
      );
    });

    const applyBtn = container.querySelector('.apply-button') as HTMLButtonElement;
    expect(applyBtn).toBeTruthy();

    await act(async () => {
      applyBtn.click();
    });

    expect(onApply).toHaveBeenCalled();
    const [appliedProject, addedIds] = onApply.mock.calls[0];
    expect(appliedProject.scene.dimension).toBe('3d');
    expect(addedIds.length).toBeGreaterThan(0);
    expect(onClose).toHaveBeenCalled();
  });
});
