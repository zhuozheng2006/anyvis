// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ToolsHubDropdown } from './ToolsHubDropdown';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ToolsHubDropdown', () => {
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

  it('toggles dropdown mega menu and invokes callbacks when items clicked', async () => {
    const onOpenMatrix = vi.fn();
    const onOpenGeometry = vi.fn();
    const onOpenVector3D = vi.fn();
    const onOpenStoryboard = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ToolsHubDropdown, {
          onOpenMatrix,
          onOpenFourier: vi.fn(),
          onOpenCalculus: vi.fn(),
          onOpenRiemann: vi.fn(),
          onOpenVectorField: vi.fn(),
          onOpenComplexMapping: vi.fn(),
          onOpenPolarParametric: vi.fn(),
          onOpenGeometry,
          onOpenVector3D,
          onOpenSurface: vi.fn(),
          onOpenGraph: vi.fn(),
          onOpenProbability: vi.fn(),
          onOpenAutoLayout: vi.fn(),
          onOpenCameraDirector: vi.fn(),
          onOpenSubtitleSync: vi.fn(),
          onOpenStoryboard,
          onOpenEasingCurve: vi.fn(),
          onOpenAudioVisualizer: vi.fn(),
          onOpenTexColorStyler: vi.fn(),
        }),
      );
    });

    const trigger = container.querySelector('.tools-hub-trigger') as HTMLButtonElement;
    expect(trigger).toBeDefined();
    expect(trigger.textContent).toContain('数理动效工作台');
    expect(trigger.textContent).toContain('19');

    // Mega menu should initially be closed
    expect(container.querySelector('.tools-mega-menu')).toBeNull();

    // Click trigger to open
    await act(async () => {
      trigger.click();
    });

    const megaMenu = container.querySelector('.tools-mega-menu');
    expect(megaMenu).not.toBeNull();

    // Check categories
    expect(container.textContent).toContain('3B1B 高等数理');
    expect(container.textContent).toContain('几何拓扑与空间');
    expect(container.textContent).toContain('导演运镜与剪辑');

    // Click Matrix tool
    const matrixItem = Array.from(container.querySelectorAll('.tools-menu-item')).find((btn) =>
      btn.textContent?.includes('矩阵线性变换台'),
    ) as HTMLButtonElement;
    expect(matrixItem).toBeDefined();

    await act(async () => {
      matrixItem.click();
    });

    expect(onOpenMatrix).toHaveBeenCalledTimes(1);
    // Menu should close automatically
    expect(container.querySelector('.tools-mega-menu')).toBeNull();

    // Reopen and test Vector3D tool
    await act(async () => {
      trigger.click();
    });
    const vec3dItem = Array.from(container.querySelectorAll('.tools-menu-item')).find((btn) =>
      btn.textContent?.includes('三维向量与空间叉乘'),
    ) as HTMLButtonElement;
    expect(vec3dItem).toBeDefined();

    await act(async () => {
      vec3dItem.click();
    });
    expect(onOpenVector3D).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.tools-mega-menu')).toBeNull();
  });
});
