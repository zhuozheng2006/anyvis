// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionInspector } from './ActionInspector';
import { createAction } from './core/catalog';

describe('ActionInspector UX Enhancements: Arrow Stepping, Reset to Default, LaTeX Copy', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('steps number values with ArrowUp and ArrowDown keys and commits change', async () => {
    const circleAction = createAction('circle', { name: '圆', radius: 1.0 });
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ActionInspector, {
          action: circleAction,
          actions: [circleAction],
          fields: ['radius'],
          onChange,
        })
      );
    });

    const radiusInput = container.querySelector<HTMLInputElement>('.ai-fields-input')!;
    expect(radiusInput.value).toBe('1');

    // ArrowUp -> increments by 0.1 (or step)
    await act(async () => {
      radiusInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith({ radius: 1.1 });
    expect(radiusInput.value).toBe('1.1');

    // ArrowDown -> decrements by 0.1
    onChange.mockClear();
    await act(async () => {
      radiusInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith({ radius: 1.0 });
  });

  it('renders reset button when field value differs from default and restores default on click', async () => {
    // Circle radius default in catalog is 1
    const circleAction = createAction('circle', { name: '大圆', radius: 2.5 });
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ActionInspector, {
          action: circleAction,
          actions: [circleAction],
          fields: ['radius'],
          onChange,
        })
      );
    });

    const resetBtn = container.querySelector<HTMLButtonElement>('.ai-fields-reset-btn');
    expect(resetBtn).not.toBeNull();
    expect(resetBtn?.textContent).toContain('重置');

    await act(async () => {
      resetBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith({ radius: 1 });
  });

  it('renders LaTeX copy button for formula actions and triggers clipboard write', async () => {
    const formulaAction = createAction('formula', { name: '欧拉公式', tex: 'e^{i\\pi}+1=0' });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    await act(async () => {
      root.render(
        React.createElement(ActionInspector, {
          action: formulaAction,
          actions: [formulaAction],
          fields: ['tex'],
          onChange: vi.fn(),
        })
      );
    });

    const copyBtn = container.querySelector<HTMLButtonElement>('.ai-fields-copy-tex-btn');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.textContent).toContain('复制');

    await act(async () => {
      copyBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(writeTextMock).toHaveBeenCalledWith('e^{i\\pi}+1=0');
  });

  it('renders scrub handle for numeric inputs', async () => {
    const circleAction = createAction('circle', { name: '圆', radius: 1.0 });

    await act(async () => {
      root.render(
        React.createElement(ActionInspector, {
          action: circleAction,
          actions: [circleAction],
          fields: ['radius'],
          onChange: vi.fn(),
        })
      );
    });

    const scrubHandle = container.querySelector('.ai-fields-scrub-handle');
    expect(scrubHandle).not.toBeNull();
    expect(scrubHandle?.textContent).toContain('↔');
  });
});
