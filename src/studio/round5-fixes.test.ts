// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAction } from './core/catalog';
import { createEmptyProject } from './core/project';
import type { Action } from './core/types';
import { TexColorStylerModal } from './TexColorStylerModal';
import { SurfacePlaygroundModal } from './SurfacePlaygroundModal';
import { Vector3DPlaygroundModal } from './Vector3DPlaygroundModal';
import { AutoLayoutModal } from './AutoLayoutModal';
import { AudioVisualizerModal } from './AudioVisualizerModal';
import { StageDirectGizmo } from './StageDirectGizmo';
import { TrackerControlBar, suggestNextTrackerName } from './TrackerControlBar';
import { PositionPad, clampAndSnapCoord } from './PositionPad';

// @ts-expect-error React test environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function makeFullProject(count = 500) {
  const base = createEmptyProject();
  const actions: Action[] = Array.from({ length: count }, (_, idx) =>
    createAction('wait', { duration: 0.1 + (idx % 3) * 0.1 }),
  );
  return { ...base, actions };
}

describe('Round 5 regression fixes', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('prevents rapid double-submit, cancels close on reopen, and catches copy/insert errors in TexColorStylerModal', async () => {
    vi.useFakeTimers();
    const onInsert = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(TexColorStylerModal, {
          isOpen: true,
          onClose,
          onInsertColoredTex: onInsert,
        }),
      );
    });

    const insertBtn = container.querySelector<HTMLButtonElement>('.tex-styler-btn-primary')!;
    await act(async () => {
      insertBtn.click();
      insertBtn.click();
    });
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(insertBtn.disabled).toBe(true);

    // Closing before 450ms cancels scheduled close and re-enables button on reopen
    await act(async () => {
      root.render(
        React.createElement(TexColorStylerModal, {
          isOpen: false,
          onClose,
          onInsertColoredTex: onInsert,
        }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onClose).not.toHaveBeenCalled();

    // Reopen and verify excessively long rawTex copy fails gracefully via role="alert"
    vi.useRealTimers();
    const onFailingInsert = vi.fn(() => {
      throw new Error('公式插入校验失败');
    });
    await act(async () => {
      root.render(
        React.createElement(TexColorStylerModal, {
          isOpen: true,
          onClose,
          onInsertColoredTex: onFailingInsert,
        }),
      );
    });
    const textInput = container.querySelector<HTMLInputElement>('.tex-styler-input')!;
    await act(async () => {
      setInputValue(textInput, 'x'.repeat(20050));
    });
    const copyBtn = container.querySelector<HTMLButtonElement>('.tex-styler-btn-secondary')!;
    await act(async () => {
      copyBtn.click();
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    // Editing formula or selecting preset clears the error; failing insert shows role="alert"
    const presetCard = container.querySelector<HTMLButtonElement>('.tex-styler-preset-card')!;
    await act(async () => {
      presetCard.click();
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();

    const insertBtnReopened = container.querySelector<HTMLButtonElement>('.tex-styler-btn-primary')!;
    expect(insertBtnReopened.disabled).toBe(false);
    await act(async () => {
      insertBtnReopened.click();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('公式插入校验失败');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clears applyError on preset change/reopen and ignores non-finite sliders in SurfacePlaygroundModal', async () => {
    const project = makeFullProject(499);
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(SurfacePlaygroundModal, {
          isOpen: true,
          onClose,
          project,
          onApply: vi.fn(),
        }),
      );
    });

    const applyBtn = container.querySelector<HTMLButtonElement>('.btn-primary')!;
    await act(async () => {
      applyBtn.click();
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    // Preset change clears error
    const presetButtons = container.querySelectorAll<HTMLButtonElement>('.preset-chip');
    await act(async () => {
      presetButtons[1].click();
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();

    // Non-finite slider input does not corrupt camera HUD readouts
    const rangeInputs = container.querySelectorAll<HTMLInputElement>('.slider-row input[type="range"]');
    await act(async () => {
      setInputValue(rangeInputs[0], 'NaN');
    });
    expect(container.textContent).not.toContain('NaN');

    // Error also clears across close/reopen
    await act(async () => {
      applyBtn.click();
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => {
      root.render(
        React.createElement(SurfacePlaygroundModal, {
          isOpen: false,
          onClose,
          project,
          onApply: vi.fn(),
        }),
      );
    });
    await act(async () => {
      root.render(
        React.createElement(SurfacePlaygroundModal, {
          isOpen: true,
          onClose,
          project,
          onApply: vi.fn(),
        }),
      );
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('resets generationError on close/op/preset switches and ignores non-finite inputs in Vector3DPlaygroundModal', async () => {
    const project = makeFullProject(499);
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(Vector3DPlaygroundModal, {
          isOpen: true,
          onClose,
          project,
          onApply: vi.fn(),
        }),
      );
    });

    const applyBtn = container.querySelector<HTMLButtonElement>('.apply-button')!;
    await act(async () => {
      applyBtn.click();
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    // Switching operation clears error
    const dotOpBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('.op-btn')).find((b) =>
      b.textContent?.includes('点乘'),
    )!;
    await act(async () => {
      dotOpBtn.click();
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();

    // Non-finite coordinate input does not propagate NaN
    const coordSlider = container.querySelector<HTMLInputElement>('.coord-grid input[type="range"]')!;
    await act(async () => {
      setInputValue(coordSlider, 'NaN');
    });
    expect(container.textContent).not.toContain('NaN');
  });

  it('ignores non-finite layout slider inputs in AutoLayoutModal', async () => {
    const base = createEmptyProject();
    const project = {
      ...base,
      actions: [
        createAction('circle', { name: 'c1', x: -1, y: 0 }),
        createAction('circle', { name: 'c2', x: 1, y: 0 }),
      ],
    };

    await act(async () => {
      root.render(
        React.createElement(AutoLayoutModal, {
          isOpen: true,
          onClose: vi.fn(),
          project,
          onApply: vi.fn(),
        }),
      );
    });

    const gapSlider = container.querySelector<HTMLInputElement>('.layout-param-row input[type="range"]')!;
    await act(async () => {
      setInputValue(gapSlider, 'NaN');
    });
    expect(container.textContent).not.toContain('NaN');
  });

  it('clamps non-finite or tiny barCount values in AudioVisualizerModal oscilloscope mode', async () => {
    await act(async () => {
      root.render(
        React.createElement(AudioVisualizerModal, {
          isOpen: true,
          onClose: vi.fn(),
        }),
      );
    });

    // Switch to oscilloscope preset to exercise denominator (barCount - 1)
    const oscPreset = Array.from(container.querySelectorAll<HTMLButtonElement>('.audio-vis-preset-card')).find(
      (b) => b.textContent?.includes('波形') || b.textContent?.includes('Oscilloscope'),
    );
    if (oscPreset) {
      await act(async () => {
        oscPreset.click();
      });
    }

    const slider = container.querySelector<HTMLInputElement>('input[type="range"].audio-vis-slider')!;
    await act(async () => {
      setInputValue(slider, '1');
    });
    expect(container.querySelector('.audio-vis-slider-label')?.textContent).toContain('8');

    await act(async () => {
      setInputValue(slider, 'NaN');
    });
    expect(container.textContent).not.toContain('NaN');
    const paths = Array.from(container.querySelectorAll('svg path'));
    for (const p of paths) {
      expect(p.getAttribute('d') || '').not.toContain('NaN');
    }
  });

  it('clears drag draft and gesture state when StageDirectGizmo switches action mid-drag', async () => {
    const onChange = vi.fn();
    const actionA: Action = {
      id: 'circle_a',
      type: 'circle',
      fields: { name: 'ObjA', x: 0, y: 0, color: '#58C4DD' },
    };
    const actionB: Action = {
      id: 'circle_b',
      type: 'circle',
      fields: { name: 'ObjB', x: 2, y: -1, color: '#83C167' },
    };

    await act(async () => {
      root.render(React.createElement(StageDirectGizmo, { action: actionA, onChange }));
    });

    const gizmo = container.querySelector<HTMLDivElement>('[data-testid="stage-direct-gizmo"]')!;
    vi.spyOn(gizmo, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 225,
      width: 400,
      height: 225,
      toJSON: () => ({}),
    });

    const reticle = container.querySelector<HTMLDivElement>('[data-testid="gizmo-reticle"]')!;
    await act(async () => {
      reticle.dispatchEvent(
        Object.assign(new Event('pointerdown', { bubbles: true }), {
          button: 0,
          pointerId: 1,
          clientX: 200,
          clientY: 112.5,
        }),
      );
    });
    await act(async () => {
      reticle.dispatchEvent(
        Object.assign(new Event('pointermove', { bubbles: true }), {
          pointerId: 1,
          clientX: 260,
          clientY: 90,
        }),
      );
    });
    expect(container.textContent).not.toContain('(0.0, 0.0)');

    // Switch action prop mid-drag without unmounting
    await act(async () => {
      root.render(React.createElement(StageDirectGizmo, { action: actionB, onChange }));
    });

    expect(container.textContent).toContain('ObjB');
    expect(container.textContent).toContain('(2.0, -1.0)');

    const nextReticle = container.querySelector<HTMLDivElement>('[data-testid="gizmo-reticle"]')!;
    await act(async () => {
      nextReticle.dispatchEvent(
        Object.assign(new Event('pointerup', { bubbles: true }), {
          pointerId: 1,
          clientX: 260,
          clientY: 90,
        }),
      );
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('avoids object name collisions in suggestNextTrackerName and reports errors in TrackerControlBar', async () => {
    const circleA = createAction('circle', { name: 'a' });
    expect(suggestNextTrackerName([circleA])).toBe('b');

    const base = createEmptyProject();
    const tracker = createAction('tracker', { name: 'a', value: 1 });
    const projectWithTracker = { ...base, actions: [tracker] };
    const onError = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(TrackerControlBar, {
          project: projectWithTracker,
          selectedId: tracker.id,
          onSelect: vi.fn(),
          onChange: () => {
            throw new Error('保存操作被拒绝');
          },
          onError,
        }),
      );
    });

    const addBtn = container.querySelector<HTMLButtonElement>('.tcb-add-btn')!;
    const animBtn = container.querySelector<HTMLButtonElement>('.tcb-anim-btn')!;
    await act(async () => {
      addBtn.click();
    });
    await act(async () => {
      animBtn.click();
    });
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith('保存操作被拒绝');
  });

  it('guards PositionPad and clampAndSnapCoord against non-finite coordinates', async () => {
    expect(clampAndSnapCoord(Number.NaN, 7.1, 0.1)).toBe(0);
    expect(clampAndSnapCoord(Number.POSITIVE_INFINITY, 7.1, 0.1)).toBe(0);

    await act(async () => {
      root.render(
        React.createElement(PositionPad, {
          mode: 'position',
          x: Number.NaN,
          y: Number.POSITIVE_INFINITY,
          onChange: vi.fn(),
        }),
      );
    });

    expect(container.querySelector('.pos-pad-coords')?.textContent).toBe('(0.0, 0.0)');
    const circle = container.querySelector('svg circle')!;
    expect(circle.getAttribute('cx')).not.toBe('NaN');
    expect(circle.getAttribute('cy')).not.toBe('NaN');
  });
});
