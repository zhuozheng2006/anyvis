// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionInspector } from './ActionInspector';
import { createAction } from './core/catalog';
import { createEmptyProject, validateProject } from './core/project';

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

  it('commits numeric scrub drag once on pointerup and reverts on pointercancel', async () => {
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

    const scrubHandle = container.querySelector('.ai-fields-scrub-handle')!;
    const input = container.querySelector<HTMLInputElement>('.ai-fields-input')!;

    await act(async () => {
      scrubHandle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, bubbles: true }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 108 }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 120 }));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('1.5');

    await act(async () => {
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 120 }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ radius: 1.5 });

    // Cancel discards pending scrub draft
    onChange.mockClear();
    await act(async () => {
      scrubHandle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, bubbles: true }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 140 }));
    });
    expect(input.value).toBe('2.5');
    await act(async () => {
      window.dispatchEvent(new Event('pointercancel'));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('1.5');
  });

  it('keeps RateFuncPicker idle while closed and emits only project-valid easing options', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const shiftAction = createAction('shift', { target: '圆', dx: 2, easing: 'smooth' });
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ActionInspector, {
          action: shiftAction,
          actions: [createAction('circle', { name: '圆' }), shiftAction],
          fields: ['easing'],
          onChange,
        })
      );
    });

    expect(rafSpy).not.toHaveBeenCalled();

    const trigger = container.querySelector<HTMLButtonElement>('.rfp-trigger')!;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(rafSpy).toHaveBeenCalled();
    const options = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    expect(options.length).toBeGreaterThan(0);

    for (const option of options) {
      await act(async () => {
        option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const chosen = onChange.mock.calls.at(-1)?.[0] as { easing: string };
      expect(() => validateProject({
        ...createEmptyProject(),
        actions: [createAction('circle', { name: '圆' }), createAction('shift', { target: '圆', dx: 2, easing: chosen.easing })],
      })).not.toThrow();

      // Re-open for the next card
      await act(async () => {
        container.querySelector<HTMLButtonElement>('.rfp-trigger')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }

    rafSpy.mockRestore();
  });
});
