// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { FourierPlaygroundModal } from './FourierPlaygroundModal';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('FourierPlaygroundModal', () => {
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
        React.createElement(FourierPlaygroundModal, { isOpen: false, onClose: () => {} })
      );
    });
    expect(container.querySelector('.fourier-modal')).toBeNull();
  });

  it('renders modal with title, presets and triggers insert', async () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(FourierPlaygroundModal, {
          isOpen: true,
          onClose,
          onInsertFourier: onInsert,
        })
      );
    });

    const modal = container.querySelector('.fourier-modal');
    expect(modal).not.toBeNull();
    expect(container.textContent).toContain('3B1B 傅里叶环绕圆交互台');
    expect(container.textContent).toContain('π 符号');
    expect(container.textContent).toContain('爱心曲线');

    // Click insert button
    const insertBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('插入参数曲线积木')
    );
    expect(insertBtn).toBeDefined();

    await act(async () => {
      insertBtn?.click();
    });

    expect(onInsert).toHaveBeenCalledTimes(1);
    const [coeffs, name] = onInsert.mock.calls[0];
    expect(coeffs.length).toBeGreaterThan(0);
    expect(name).toBe('傅里叶_pi');
  });
});
