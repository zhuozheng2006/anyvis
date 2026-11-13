// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from './core/project';
import { createAction } from './core/catalog';
import { StoryboardModal } from './StoryboardModal';
import { interpolateCameraPose, getViewfinderBox, type CameraShot } from './camera-director';
import { CameraDirectorModal } from './CameraDirectorModal';
import { SubtitleSyncModal } from './SubtitleSyncModal';
import { ActionInspector } from './ActionInspector';
import { MathSymbolPalette } from './MathSymbolPalette';
import { RiemannPlaygroundModal } from './RiemannPlaygroundModal';
import { CalculusPlaygroundModal } from './CalculusPlaygroundModal';
import { KeyframeCurveModal } from './KeyframeCurveModal';
import { GeometryPlaygroundModal } from './GeometryPlaygroundModal';
import { MatrixPlaygroundModal } from './MatrixPlaygroundModal';

// @ts-expect-error React test environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Round 4 regression fixes', () => {
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

  it('preserves unsaved chapter renames and skipAnimations across add/delete in StoryboardModal', async () => {
    const project = {
      ...createEmptyProject(),
      scene: {
        ...createEmptyProject().scene,
        markers: [{ id: 'm1', time: 4, label: '原始二段', color: '#38bdf8' }],
      },
      actions: [
        createAction('text', { name: 'a', duration: 4 }),
        createAction('text', { name: 'b', duration: 6 }),
      ],
    };
    const onApply = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(StoryboardModal, {
          isOpen: true,
          onClose: () => {},
          project,
          onApply,
        }),
      );
    });

    const titleInputs = () =>
      Array.from(container.querySelectorAll<HTMLInputElement>('.chapter-title-input'));
    const skipCheckboxes = () =>
      Array.from(
        container.querySelectorAll<HTMLInputElement>('.chapter-skip-label input[type="checkbox"]'),
      );

    await act(async () => {
      setInputValue(titleInputs()[0], '自定义开篇');
      setInputValue(titleInputs()[1], '自定义推导');
      skipCheckboxes()[0].click();
      skipCheckboxes()[1].click();
    });

    const addRow = container.querySelector('.storyboard-add-row')!;
    const addName = addRow.querySelector<HTMLInputElement>('input[type="text"]')!;
    const addTime = addRow.querySelector<HTMLInputElement>('input[type="number"]')!;
    const addBtn = Array.from(addRow.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('插入分段'),
    )!;

    await act(async () => {
      setInputValue(addName, '中段证明');
      setInputValue(addTime, '2');
    });
    await act(async () => {
      addBtn.click();
    });

    expect(titleInputs().map((el) => el.value)).toEqual(['自定义开篇', '中段证明', '自定义推导']);
    expect(skipCheckboxes().map((el) => el.checked)).toEqual([true, false, true]);

    // Deleting the newly inserted second chapter still keeps chapters 1 & 3 edits intact
    const deleteBtns = container.querySelectorAll<HTMLButtonElement>('.chapter-delete-btn');
    await act(async () => {
      deleteBtns[0].click();
    });

    expect(titleInputs().map((el) => el.value)).toEqual(['自定义开篇', '自定义推导']);
    expect(skipCheckboxes().map((el) => el.checked)).toEqual([true, true]);

    // Invalid insert timestamp reports alert instead of silently failing
    await act(async () => {
      setInputValue(addTime, '0');
    });
    await act(async () => {
      addBtn.click();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('0s');
  });

  it('guards zero duration/zoom in camera interpolation and sorts trajectory polyline chronologically', async () => {
    const edgeShots: CameraShot[] = [
      { id: 's1', name: 'S1', time: 0, duration: 0, x: 1, y: 2, zoom: 0, rateFunc: 'smooth' },
      { id: 's2', name: 'S2', time: 2, duration: 0, x: 4, y: -1, zoom: -2, rateFunc: 'smooth' },
    ];
    for (const t of [0, 1, 2, Number.NaN]) {
      const pose = interpolateCameraPose(edgeShots, t);
      expect(Number.isFinite(pose.x)).toBe(true);
      expect(Number.isFinite(pose.y)).toBe(true);
      expect(Number.isFinite(pose.zoom)).toBe(true);
      expect(pose.zoom).toBeGreaterThanOrEqual(0.2);
    }
    const box = getViewfinderBox(0, 0, 0);
    expect(Number.isFinite(box.width)).toBe(true);
    expect(Number.isFinite(box.height)).toBe(true);

    const project = createEmptyProject();
    await act(async () => {
      root.render(
        React.createElement(CameraDirectorModal, {
          isOpen: true,
          onClose: () => {},
          project,
          onApply: () => {},
        }),
      );
    });

    // Make first shot time (10s) later than second shot (2.5s) without re-sorting cards manually
    const firstTimeInput = container.querySelectorAll<HTMLInputElement>(
      '.camera-shot-card input[type="number"]',
    )[0];
    await act(async () => {
      setInputValue(firstTimeInput, '10');
    });

    const polyline = container.querySelector('polyline');
    expect(polyline).not.toBeNull();
    const pts = polyline!
      .getAttribute('points')!
      .trim()
      .split(/\s+/)
      .map((pair) => Number(pair.split(',')[0]));
    // After moving origin shot (x=0, svgX=300) to t=10s (after S2 at t=2.5s, x=2.5, svgX=400),
    // the chronological polyline should end at svgX=300 rather than starting there.
    expect(pts[pts.length - 1]).toBeCloseTo(300, 1);
  });

  it('resets file input value and reports invalid/empty .srt imports in SubtitleSyncModal', async () => {
    let readerBehavior: 'valid' | 'invalid' = 'invalid';
    class MockFileReader {
      result: string | null = null;
      onload: ((ev: { target: { result: string } }) => void) | null = null;
      onerror: (() => void) | null = null;
      abort = vi.fn();
      readAsText() {
        const text =
          readerBehavior === 'invalid'
            ? 'not an srt file'
            : '1\n00:00:00,000 --> 00:00:02,000\nImported line\n';
        this.result = text;
        this.onload?.({ target: { result: text } });
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);

    const project = createEmptyProject();
    await act(async () => {
      root.render(
        React.createElement(SubtitleSyncModal, {
          isOpen: true,
          onClose: () => {},
          project,
          onApply: () => {},
        }),
      );
    });

    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const mockFile = new File(['bad'], 'test.srt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [mockFile],
    });
    let backedValue = 'C:\\fakepath\\test.srt';
    Object.defineProperty(fileInput, 'value', {
      configurable: true,
      get: () => backedValue,
      set: (v: string) => {
        backedValue = v;
      },
    });

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(backedValue).toBe('');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('未能从所选文件中解析');

    readerBehavior = 'valid';
    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('Imported line');
  });

  it('limits LaTeX toolbar and copy button strictly to tex/text math fields and guards unmounted palette timer', async () => {
    vi.useFakeTimers();
    const formulaAction = createAction('formula', {
      name: 'eq1',
      tex: 'E = mc^2',
      fontSize: 40,
    });
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ActionInspector, {
          action: formulaAction,
          actions: [formulaAction],
          fields: ['name', 'tex', 'fontSize'],
          onChange,
        }),
      );
    });

    const nameRow = container.querySelector('[data-field="name"]')!;
    const texRow = container.querySelector('[data-field="tex"]')!;
    const sizeRow = container.querySelector('[data-field="fontSize"]')!;

    expect(nameRow.querySelector('.ai-fields-copy-tex-btn')).toBeNull();
    expect(nameRow.querySelector('.math-symbol-palette')).toBeNull();
    expect(sizeRow.querySelector('.ai-fields-copy-tex-btn')).toBeNull();
    expect(sizeRow.querySelector('.math-symbol-palette')).toBeNull();
    expect(texRow.querySelector('.ai-fields-copy-tex-btn')).not.toBeNull();
    expect(texRow.querySelector('.math-symbol-palette')).not.toBeNull();

    // Unmounting MathSymbolPalette before its focus timeout fires must not invoke focus()
    const inputEl = document.createElement('input');
    inputEl.value = 'x';
    const focusSpy = vi.spyOn(inputEl, 'focus');
    const setSelSpy = vi.spyOn(inputEl, 'setSelectionRange');
    const inputRef = { current: inputEl };

    await act(async () => {
      root.render(
        React.createElement(MathSymbolPalette, {
          inputRef,
          value: 'x',
          onChange,
        }),
      );
    });
    const fracBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('分式'),
    )!;
    await act(async () => {
      fracBtn.click();
    });
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(focusSpy).not.toHaveBeenCalled();
    expect(setSelSpy).not.toHaveBeenCalled();
  });

  it('cancels delayed auto-close timers when Riemann/Calculus/Keyframe modals close early and prevents double insert', async () => {
    vi.useFakeTimers();

    // 1. RiemannPlaygroundModal
    const onCloseR = vi.fn();
    const onInsertR = vi.fn();
    await act(async () => {
      root.render(
        React.createElement(RiemannPlaygroundModal, {
          isOpen: true,
          onClose: onCloseR,
          onInsertRiemann: onInsertR,
        }),
      );
    });
    const rPrimary = container.querySelector<HTMLButtonElement>('.riemann-btn-primary')!;
    await act(async () => {
      rPrimary.click();
      rPrimary.click();
    });
    expect(onInsertR).toHaveBeenCalledTimes(1);
    await act(async () => {
      root.render(
        React.createElement(RiemannPlaygroundModal, {
          isOpen: false,
          onClose: onCloseR,
          onInsertRiemann: onInsertR,
        }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onCloseR).not.toHaveBeenCalled();

    // 2. CalculusPlaygroundModal
    const onCloseC = vi.fn();
    const onInsertC = vi.fn();
    await act(async () => {
      root.render(
        React.createElement(CalculusPlaygroundModal, {
          isOpen: true,
          onClose: onCloseC,
          onInsertCalculus: onInsertC,
        }),
      );
    });
    const cPrimary = container.querySelector<HTMLButtonElement>('.calculus-btn-primary')!;
    await act(async () => {
      cPrimary.click();
      cPrimary.click();
    });
    expect(onInsertC).toHaveBeenCalledTimes(1);
    await act(async () => {
      root.render(
        React.createElement(CalculusPlaygroundModal, {
          isOpen: false,
          onClose: onCloseC,
          onInsertCalculus: onInsertC,
        }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onCloseC).not.toHaveBeenCalled();

    // 3. KeyframeCurveModal (linear preset allows apply)
    const onCloseK = vi.fn();
    const onApplyK = vi.fn();
    await act(async () => {
      root.render(
        React.createElement(KeyframeCurveModal, {
          isOpen: true,
          onClose: onCloseK,
          onApplyRateFunc: onApplyK,
        }),
      );
    });
    const linearPreset = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Linear'),
    )!;
    await act(async () => {
      linearPreset.click();
    });
    const kPrimary = container.querySelector<HTMLButtonElement>('.keyframe-btn-primary')!;
    await act(async () => {
      kPrimary.click();
      kPrimary.click();
    });
    expect(onApplyK).toHaveBeenCalledTimes(1);
    await act(async () => {
      root.render(
        React.createElement(KeyframeCurveModal, {
          isOpen: false,
          onClose: onCloseK,
          onApplyRateFunc: onApplyK,
        }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onCloseK).not.toHaveBeenCalled();
  });

  it('catches collinear Copy Python errors in GeometryPlaygroundModal and ignores non-finite Matrix inputs', async () => {
    const project = createEmptyProject();
    await act(async () => {
      root.render(
        React.createElement(GeometryPlaygroundModal, {
          isOpen: true,
          onClose: () => {},
          project,
          onApply: () => {},
        }),
      );
    });

    const svg = container.querySelector<SVGSVGElement>('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 640,
      bottom: 480,
      width: 640,
      height: 480,
      toJSON: () => ({}),
    });

    const handles = container.querySelectorAll('.geo-vertex-handle');
    // Move vertex C (index 2) to y = -1.2 (clientY = 336) so A, B, C are collinear
    await act(async () => {
      handles[2].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await act(async () => {
      svg.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 320, clientY: 336 }));
      svg.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    const copyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('复制 Manim Python 代码'),
    )!;
    await act(async () => {
      copyBtn.click();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('共线');

    // MatrixPlaygroundModal non-finite input guard
    await act(async () => {
      root.render(
        React.createElement(MatrixPlaygroundModal, {
          isOpen: true,
          onClose: () => {},
        }),
      );
    });

    const matrixInput = container.querySelector<HTMLInputElement>('.mpm-cell input[type="number"]')!;
    await act(async () => {
      setInputValue(matrixInput, 'NaN');
    });
    expect(container.querySelector('.mpm-code')?.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('NaN');
  });
});
