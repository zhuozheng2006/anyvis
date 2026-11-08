// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { TexColorStylerModal } from './TexColorStylerModal';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('TexColorStylerModal', () => {
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
        React.createElement(TexColorStylerModal, { isOpen: false, onClose: () => {} })
      );
    });
    expect(container.querySelector('.tex-styler-modal-backdrop')).toBeNull();
  });

  it('renders modal with formula, token chips, swatches and triggers insert', async () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(TexColorStylerModal, {
          isOpen: true,
          onClose,
          onInsertColoredTex: onInsert,
        })
      );
    });

    const backdrop = container.querySelector('.tex-styler-modal-backdrop');
    expect(backdrop).not.toBeNull();

    // Check title
    expect(container.textContent).toContain('3B1B 公式专属配色器');
    expect(container.textContent).toContain('欧拉恒等式');

    // Trigger insert button
    const insertBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('插入到动画编排')
    );
    expect(insertBtn).toBeDefined();

    await act(async () => {
      insertBtn?.click();
    });

    expect(onInsert).toHaveBeenCalledTimes(1);
    const [rawTex, colorMap, name] = onInsert.mock.calls[0];
    expect(rawTex).toContain('e^{i\\pi}');
    expect(colorMap.e).toBe('#e2b340');
    expect(name).toContain('欧拉恒等式');
  });
});
