// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ShortcutsHelpModal } from './ShortcutsHelpModal';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ShortcutsHelpModal', () => {
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
        React.createElement(ShortcutsHelpModal, {
          isOpen: false,
          onClose: () => {},
        }),
      );
    });
    expect(container.querySelector('.shortcuts-modal-overlay')).toBeNull();
  });

  it('renders modal with shortcut groups and responds to close button and Esc key', async () => {
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ShortcutsHelpModal, {
          isOpen: true,
          onClose,
        }),
      );
    });

    const overlay = container.querySelector('.shortcuts-modal-overlay');
    expect(overlay).not.toBeNull();

    // Check title
    expect(container.textContent).toContain('全局快捷键速查中心');

    // Check groups
    expect(container.textContent).toContain('播放与视口控制');
    expect(container.textContent).toContain('视图与界面切换');
    expect(container.textContent).toContain('剪辑与编排操作');
    expect(container.textContent).toContain('全局工程管理');

    // Check some keys
    expect(container.textContent).toContain('Space');
    expect(container.textContent).toContain('Home');

    // Click close button
    const closeBtn = container.querySelector('.shortcuts-close-btn') as HTMLButtonElement;
    expect(closeBtn).toBeDefined();

    await act(async () => {
      closeBtn.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    // Test Esc key event
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
