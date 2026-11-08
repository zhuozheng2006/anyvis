// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { QuickAddToolbar } from './QuickAddToolbar';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('QuickAddToolbar', () => {
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

  it('renders quick add buttons and triggers onAdd with correct types', async () => {
    const onAdd = vi.fn();

    await act(async () => {
      root.render(React.createElement(QuickAddToolbar, { onAdd }));
    });

    const toolbar = container.querySelector('.quick-add-toolbar');
    expect(toolbar).not.toBeNull();

    // Verify all button labels exist
    expect(container.textContent).toContain('文字');
    expect(container.textContent).toContain('公式');
    expect(container.textContent).toContain('圆');
    expect(container.textContent).toContain('正方形');
    expect(container.textContent).toContain('坐标系');
    expect(container.textContent).toContain('箭头');

    // Click '文字' button
    const textBtn = Array.from(container.querySelectorAll('.quick-add-btn')).find((b) =>
      b.textContent?.includes('文字'),
    ) as HTMLButtonElement;
    expect(textBtn).toBeDefined();

    await act(async () => {
      textBtn.click();
    });
    expect(onAdd).toHaveBeenCalledWith('text');

    // Click '圆' button
    const circleBtn = Array.from(container.querySelectorAll('.quick-add-btn')).find((b) =>
      b.textContent?.includes('圆'),
    ) as HTMLButtonElement;
    expect(circleBtn).toBeDefined();

    await act(async () => {
      circleBtn.click();
    });
    expect(onAdd).toHaveBeenCalledWith('circle');
  });
});
