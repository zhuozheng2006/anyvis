// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { KeyframeCurveModal } from './KeyframeCurveModal';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('KeyframeCurveModal', () => {
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
        React.createElement(KeyframeCurveModal, { isOpen: false, onClose: () => {} })
      );
    });
    expect(container.querySelector('.keyframe-modal-backdrop')).toBeNull();
  });

  it('renders modal with title, presets and triggers apply', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(KeyframeCurveModal, {
          isOpen: true,
          onClose,
          onApplyRateFunc: onApply,
        })
      );
    });

    const backdrop = container.querySelector('.keyframe-modal-backdrop');
    expect(backdrop).not.toBeNull();

    // Check title
    expect(container.textContent).toContain('缓动曲线与关键帧检查器');
    expect(container.textContent).toContain('3B1B 平滑 (Smooth)');

    // Trigger apply button
    const applyBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('应用缓动曲线')
    );
    expect(applyBtn).toBeDefined();

    await act(async () => {
      applyBtn?.click();
    });

    expect(applyBtn?.disabled).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
  });
});
