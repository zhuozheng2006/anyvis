// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { RiemannPlaygroundModal } from './RiemannPlaygroundModal';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('RiemannPlaygroundModal', () => {
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
        React.createElement(RiemannPlaygroundModal, { isOpen: false, onClose: () => {} })
      );
    });
    expect(container.querySelector('.riemann-modal-backdrop')).toBeNull();
  });

  it('renders modal with title, presets, statistics and triggers insert', async () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(RiemannPlaygroundModal, {
          isOpen: true,
          onClose,
          onInsertRiemann: onInsert,
        })
      );
    });

    const backdrop = container.querySelector('.riemann-modal-backdrop');
    expect(backdrop).not.toBeNull();

    // Check title
    expect(container.textContent).toContain('3B1B 黎曼和与定积分交互台');

    // Check stats cards
    expect(container.textContent).toContain('黎曼和');
    expect(container.textContent).toContain('精确积分');

    // Trigger insert button
    const insertBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('插入到动画编排')
    );
    expect(insertBtn).toBeDefined();

    await act(async () => {
      insertBtn?.click();
    });

    expect(onInsert).toHaveBeenCalledTimes(1);
    const [preset, a, b, n, mode] = onInsert.mock.calls[0];
    expect(preset.id).toBe('parabola');
    expect(a).toBe(0);
    expect(b).toBe(3);
    expect(n).toBe(16);
    expect(mode).toBe('mid');
  });
});
