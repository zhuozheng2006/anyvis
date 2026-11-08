// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { CalculusPlaygroundModal } from './CalculusPlaygroundModal';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('CalculusPlaygroundModal', () => {
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
        React.createElement(CalculusPlaygroundModal, { isOpen: false, onClose: () => {} })
      );
    });
    expect(container.querySelector('.calculus-modal')).toBeNull();
  });

  it('renders modal with title, presets and triggers insert', async () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(CalculusPlaygroundModal, {
          isOpen: true,
          onClose,
          onInsertCalculus: onInsert,
        })
      );
    });

    const modal = container.querySelector('.calculus-modal');
    expect(modal).not.toBeNull();
    expect(container.textContent).toContain('3B1B 微积分导数与切线交互台');
    expect(container.textContent).toContain('抛物线');
    expect(container.textContent).toContain('正弦函数');

    // Click insert button
    const insertBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('插入微积分积木')
    );
    expect(insertBtn).toBeDefined();

    await act(async () => {
      insertBtn?.click();
    });

    expect(onInsert).toHaveBeenCalledTimes(1);
    const [preset, x0] = onInsert.mock.calls[0];
    expect(preset.id).toBe('quadratic');
    expect(x0).toBe(1.0);
  });
});
