// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAction } from './core/catalog';
import { createEmptyProject } from './core/project';
import { DISTRIBUTION_PRESETS, sampleDistribution, createProbabilityActions } from './probability';
import { ProbabilityPlaygroundModal } from './ProbabilityPlaygroundModal';
import { POLAR_PARAMETRIC_PRESETS, sampleCurve, createPolarParametricActions } from './polar-parametric';
import { PolarParametricModal } from './PolarParametricModal';
import { COMPLEX_PRESETS, generateMorphedGrid, probeComplexMapping } from './complex-mapping';
import { ComplexMappingModal } from './ComplexMappingModal';
import { sampleVectorField, probeVectorField } from './vector-field';
import { VectorFieldPlaygroundModal } from './VectorFieldPlaygroundModal';
import { computeDft, getFourierPreset } from './fourier';
import { FourierPlaygroundModal } from './FourierPlaygroundModal';
import { CALCULUS_PRESETS, computeSecantSlope, computeDerivative, createCalculusActions } from './calculus';
import { CalculusPlaygroundModal } from './CalculusPlaygroundModal';
import { computeExactDefiniteIntegral, computeRiemannSum } from './riemann';
import { RiemannPlaygroundModal } from './RiemannPlaygroundModal';
import { solveCubicBezierT, sampleCubicBezier } from './easing-curve';
import { KeyframeCurveModal } from './KeyframeCurveModal';
import { GraphPlaygroundModal } from './GraphPlaygroundModal';
import { useBoundedPlayback } from './browser-utils';
import { formatSrtTime } from './subtitles';
import { formatTimestamp } from './storyboard';
import { StoryboardModal } from './StoryboardModal';
import { generateSmartMarkers } from './smart-marker';
import { SmartMarkerModal } from './SmartMarkerModal';
import { getNextZoomIn, getNextZoomOut, StageZoomControls } from './StageZoomControls';
import { manimToStagePercent, stagePercentToManim } from './stage-direct-gizmo';
import { addMarker, updateMarker, TimelineMarkerBar } from './TimelineMarkerBar';

// @ts-expect-error React test environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button'));
  const found = buttons.find(btn => btn.textContent?.includes(text));
  if (!found) {
    throw new Error(`Button containing "${text}" not found`);
  }
  return found;
}

describe('Round 6 regression fixes', () => {
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

  describe('probability.ts & ProbabilityPlaygroundModal', () => {
    it('guards sampleDistribution against sigma <= 0, NaN parameters, and non-positive numSamples', () => {
      const normalPreset = DISTRIBUTION_PRESETS.find(p => p.id === 'normal')!;
      const normalZeroSigma = sampleDistribution(
        normalPreset,
        { mu: 0, sigma: 0, n: 10, p: 0.5, lambda: 4 },
        0,
      );
      expect(normalZeroSigma.points.length).toBeGreaterThanOrEqual(4);
      expect(normalZeroSigma.points.every(pt => Number.isFinite(pt.x) && Number.isFinite(pt.y))).toBe(true);

      const binomialPreset = DISTRIBUTION_PRESETS.find(p => p.id === 'binomial')!;
      const binomialDegenerate = sampleDistribution(
        binomialPreset,
        { mu: 0, sigma: 1, n: 0, p: Number.NaN, lambda: 4 },
        80,
      );
      expect(binomialDegenerate.points.length).toBe(2);
      expect(binomialDegenerate.points.every(pt => Number.isFinite(pt.y))).toBe(true);
      expect(Number.isFinite(binomialDegenerate.variance)).toBe(true);

      const poissonPreset = DISTRIBUTION_PRESETS.find(p => p.id === 'poisson')!;
      const poissonZeroLambda = sampleDistribution(
        poissonPreset,
        { mu: 0, sigma: 1, n: 10, p: 0.5, lambda: 0 },
        80,
      );
      expect(poissonZeroLambda.points.length).toBeGreaterThan(2);
      expect(poissonZeroLambda.points.every(pt => Number.isFinite(pt.y))).toBe(true);

      const expPreset = DISTRIBUTION_PRESETS.find(p => p.id === 'exponential')!;
      const expNegativeLambda = sampleDistribution(
        expPreset,
        { mu: 0, sigma: 1, n: 10, p: 0.5, lambda: -2 },
        80,
      );
      expect(expNegativeLambda.points.length).toBeGreaterThan(2);
      expect(Number.isFinite(expNegativeLambda.mean)).toBe(true);
      expect(Number.isFinite(expNegativeLambda.variance)).toBe(true);
    });

    it('guards createProbabilityActions when n <= 0 or parameters are NaN', () => {
      const project = createEmptyProject();
      const binomialPreset = DISTRIBUTION_PRESETS.find(p => p.id === 'binomial')!;
      const res = createProbabilityActions(project, binomialPreset, {
        mu: Number.NaN,
        sigma: 0,
        n: 0,
        p: Number.NaN,
        lambda: 0,
      });
      expect(res.actionIds.length).toBeGreaterThan(0);
      for (const action of res.project.actions) {
        for (const val of Object.values(action.fields)) {
          if (typeof val === 'number') {
            expect(Number.isFinite(val)).toBe(true);
          }
        }
      }
    });

    it('clears applyError in ProbabilityPlaygroundModal when slider values change', async () => {
      const project = createEmptyProject();
      await act(async () => {
        root.render(
          React.createElement(ProbabilityPlaygroundModal, {
            isOpen: true,
            onClose: () => {},
            project,
            onApply: () => {
              throw new Error('应用分布失败');
            },
          }),
        );
      });

      const applyBtn = findButtonByText(container, '插入到当前场景');
      await act(async () => {
        applyBtn.click();
      });
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('应用分布失败');

      const sliders = container.querySelectorAll('input[type="range"]');
      expect(sliders.length).toBeGreaterThan(0);
      await act(async () => {
        setInputValue(sliders[0] as HTMLInputElement, '0.5');
      });
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });
  });

  describe('polar-parametric.ts & PolarParametricModal', () => {
    it('guards sampleCurve and createPolarParametricActions against NaN progressFraction and NaN params', () => {
      const preset = POLAR_PARAMETRIC_PRESETS.find(p => p.id === 'rose_curve')!;
      const sampled = sampleCurve(preset, { k: Number.NaN, a: Number.NaN }, Number.NaN, 0);
      expect(sampled.fullPoints.length).toBeGreaterThanOrEqual(3);
      expect(sampled.currentPoints.length).toBeGreaterThanOrEqual(1);
      expect(sampled.currentPoint).toBeDefined();
      expect(Number.isFinite(sampled.currentPoint[0])).toBe(true);
      expect(Number.isFinite(sampled.currentPoint[1])).toBe(true);

      const project = createEmptyProject();
      const applied = createPolarParametricActions(project, preset, { k: Number.NaN, a: Number.NaN });
      expect(applied.actionIds.length).toBeGreaterThan(0);
      for (const action of applied.project.actions) {
        for (const val of Object.values(action.fields)) {
          expect(String(val)).not.toContain('NaN');
        }
      }
    });

    it('stops playback when PolarParametricModal closes', async () => {
      const project = createEmptyProject();
      await act(async () => {
        root.render(
          React.createElement(PolarParametricModal, {
            isOpen: true,
            onClose: () => {},
            project,
            onApply: () => {},
          }),
        );
      });

      const playBtn = findButtonByText(container, '动态循迹描迹动画');
      await act(async () => {
        playBtn.click();
      });
      expect(findButtonByText(container, '暂停动画')).toBeTruthy();

      await act(async () => {
        root.render(
          React.createElement(PolarParametricModal, {
            isOpen: false,
            onClose: () => {},
            project,
            onApply: () => {},
          }),
        );
      });
      await act(async () => {
        root.render(
          React.createElement(PolarParametricModal, {
            isOpen: true,
            onClose: () => {},
            project,
            onApply: () => {},
          }),
        );
      });
      expect(findButtonByText(container, '动态循迹描迹动画')).toBeTruthy();
    });
  });

  describe('complex-mapping.ts & ComplexMappingModal', () => {
    it('guards generateMorphedGrid and probeComplexMapping against non-positive spacing and zero step', () => {
      const preset = COMPLEX_PRESETS[0]!;
      const lines = generateMorphedGrid(preset, { min: -2, max: 2 }, -1, Number.NaN, 0);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every(l => l.points.length >= 3)).toBe(true);

      const probe = probeComplexMapping({ re: 1, im: 1 }, preset, 0);
      expect(Number.isFinite(probe.magnification)).toBe(true);
      expect(Number.isFinite(probe.rotationDeg)).toBe(true);
    });

    it('stops morph animation when ComplexMappingModal closes', async () => {
      const project = createEmptyProject();
      await act(async () => {
        root.render(
          React.createElement(ComplexMappingModal, {
            isOpen: true,
            onClose: () => {},
            project,
            onApply: () => {},
          }),
        );
      });

      const playBtn = findButtonByText(container, '演化平滑变形动画');
      await act(async () => {
        playBtn.click();
      });
      expect(findButtonByText(container, '正在演化形变')).toBeTruthy();

      await act(async () => {
        root.render(
          React.createElement(ComplexMappingModal, {
            isOpen: false,
            onClose: () => {},
            project,
            onApply: () => {},
          }),
        );
      });
      await act(async () => {
        root.render(
          React.createElement(ComplexMappingModal, {
            isOpen: true,
            onClose: () => {},
            project,
            onApply: () => {},
          }),
        );
      });
      expect(findButtonByText(container, '演化平滑变形动画')).toBeTruthy();
    });
  });

  describe('vector-field.ts & VectorFieldPlaygroundModal', () => {
    it('guards sampleVectorField and probeVectorField against non-positive step and zero h', () => {
      const vortexFn = (x: number, y: number): [number, number] => [-y, x];
      const sampled = sampleVectorField({ xMin: -2, xMax: 2, yMin: -2, yMax: 2 }, 0, vortexFn);
      expect(sampled.samples.length).toBeGreaterThan(0);

      const probe = probeVectorField(1, 1, vortexFn, 0);
      expect(Number.isFinite(probe.divergence)).toBe(true);
      expect(Number.isFinite(probe.curl)).toBe(true);
    });

    it('clears applyError when interacting with VectorFieldPlaygroundModal controls', async () => {
      const project = createEmptyProject();
      await act(async () => {
        root.render(
          React.createElement(VectorFieldPlaygroundModal, {
            isOpen: true,
            onClose: () => {},
            project,
            onApply: () => {
              throw new Error('注入向量场失败');
            },
          }),
        );
      });

      const applyBtn = findButtonByText(container, '插入到当前场景');
      await act(async () => {
        applyBtn.click();
      });
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('注入向量场失败');

      const modeBtn = findButtonByText(container, '流线粒子 (Streamlines)');
      await act(async () => {
        modeBtn.click();
      });
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });
  });

  describe('fourier.ts & FourierPlaygroundModal', () => {
    it('guards computeDft and getFourierPreset against NaN/non-positive counts', () => {
      const presetPts = getFourierPreset('star', 0);
      expect(presetPts.length).toBe(4);
      const coeffs = computeDft(presetPts, Number.NaN);
      expect(coeffs.length).toBeGreaterThan(0);
    });

    it('disables insert button while inserted feedback is active in FourierPlaygroundModal', async () => {
      await act(async () => {
        root.render(
          React.createElement(FourierPlaygroundModal, {
            isOpen: true,
            onClose: () => {},
            onInsertFourier: vi.fn(() => true),
          }),
        );
      });

      const btn = findButtonByText(container, '插入参数曲线积木');
      expect(btn.disabled).toBe(false);
      await act(async () => {
        btn.click();
      });
      expect(btn.disabled).toBe(true);
    });
  });

  describe('calculus.ts & CalculusPlaygroundModal', () => {
    it('guards computeSecantSlope, computeDerivative, and createCalculusActions against NaN/zero steps', () => {
      const fn = (x: number) => x * x;
      expect(computeDerivative(fn, 3, 0)).toBeCloseTo(6, 4);
      expect(computeSecantSlope(fn, 3, Number.NaN)).toBeCloseTo(6, 4);

      const project = createEmptyProject();
      const res = createCalculusActions(project, CALCULUS_PRESETS[0]!, '曲线', Number.NaN, 0);
      const tracker = res.project.actions.find(a => a.type === 'tracker');
      expect(tracker?.fields.value).toBe(1);
    });

    it('disables insert button after click in CalculusPlaygroundModal', async () => {
      await act(async () => {
        root.render(
          React.createElement(CalculusPlaygroundModal, {
            isOpen: true,
            onClose: () => {},
            onInsertCalculus: vi.fn(() => true),
          }),
        );
      });

      const btn = findButtonByText(container, '插入微积分积木');
      await act(async () => {
        btn.click();
      });
      expect(btn.disabled).toBe(true);
    });
  });

  describe('riemann.ts & RiemannPlaygroundModal', () => {
    it('guards computeExactDefiniteIntegral and computeRiemannSum against NaN subdivisions and bounds', () => {
      const fn = (x: number) => x * x;
      expect(computeExactDefiniteIntegral(fn, Number.NaN, 2)).toBe(0);
      expect(computeExactDefiniteIntegral(fn, 0, 3, Number.NaN)).toBeCloseTo(9, 3);

      const res = computeRiemannSum(fn, 0, 2, Number.NaN, 'mid');
      expect(res.rectangles.length).toBe(16);
      expect(Number.isFinite(res.sum)).toBe(true);
    });

    it('cancels limit animation on preset switch and disables insert button while inserted', async () => {
      await act(async () => {
        root.render(
          React.createElement(RiemannPlaygroundModal, {
            isOpen: true,
            onClose: () => {},
            onInsertRiemann: vi.fn(() => true),
          }),
        );
      });

      const limitBtn = findButtonByText(container, '一键演示极限逼近');
      await act(async () => {
        limitBtn.click();
      });
      expect(limitBtn.disabled).toBe(true);

      const sinePresetBtn = findButtonByText(container, '平修正弦');
      await act(async () => {
        sinePresetBtn.click();
      });
      expect(limitBtn.disabled).toBe(false);

      const insertBtn = findButtonByText(container, '插入到动画编排');
      await act(async () => {
        insertBtn.click();
      });
      expect(insertBtn.disabled).toBe(true);
    });
  });

  describe('easing-curve.ts & KeyframeCurveModal', () => {
    it('guards solveCubicBezierT and sampleCubicBezier against NaN progress x', () => {
      expect(solveCubicBezierT(0.42, 0.58, Number.NaN)).toBe(0);
      expect(sampleCubicBezier(0.42, 0, 0.58, 1, Number.NaN)).toBe(0);
    });

    it('disables apply button after applying linear curve in KeyframeCurveModal', async () => {
      await act(async () => {
        root.render(
          React.createElement(KeyframeCurveModal, {
            isOpen: true,
            onClose: () => {},
            onApplyRateFunc: vi.fn(),
          }),
        );
      });

      const linearBtn = findButtonByText(container, '匀速线性 (Linear)');
      await act(async () => {
        linearBtn.click();
      });
      const applyBtn = findButtonByText(container, '应用缓动曲线');
      expect(applyBtn.disabled).toBe(false);
      await act(async () => {
        applyBtn.click();
      });
      expect(applyBtn.disabled).toBe(true);
    });
  });

  describe('GraphPlaygroundModal', () => {
    it('stops physics simulation when modal closes', async () => {
      const project = createEmptyProject();
      await act(async () => {
        root.render(
          React.createElement(GraphPlaygroundModal, {
            isOpen: true,
            onClose: () => {},
            project,
            onApply: () => {},
          }),
        );
      });

      const simBtn = findButtonByText(container, '开启力导向物理自适应布局');
      await act(async () => {
        simBtn.click();
      });
      expect(findButtonByText(container, '暂停力导向物理弹簧')).toBeTruthy();

      await act(async () => {
        root.render(
          React.createElement(GraphPlaygroundModal, {
            isOpen: false,
            onClose: () => {},
            project,
            onApply: () => {},
          }),
        );
      });
      await act(async () => {
        root.render(
          React.createElement(GraphPlaygroundModal, {
            isOpen: true,
            onClose: () => {},
            project,
            onApply: () => {},
          }),
        );
      });
      expect(findButtonByText(container, '开启力导向物理自适应布局')).toBeTruthy();
    });
  });

  describe('useBoundedPlayback, subtitles, storyboard, smart-marker, zoom, gizmo, and markers', () => {
    it('clamps playbackTime when maxTime shrinks or is non-positive in useBoundedPlayback', async () => {
      let currentState: ReturnType<typeof useBoundedPlayback> | null = null;
      const Harness: React.FC<{ isOpen: boolean; maxTime: number }> = ({ isOpen, maxTime }) => {
        currentState = useBoundedPlayback(isOpen, maxTime);
        return null;
      };

      await act(async () => {
        root.render(React.createElement(Harness, { isOpen: true, maxTime: 10 }));
      });
      await act(async () => {
        currentState?.setPlaybackTime(8);
      });
      expect(currentState?.playbackTime).toBe(8);

      await act(async () => {
        root.render(React.createElement(Harness, { isOpen: true, maxTime: 4 }));
      });
      expect(currentState?.playbackTime).toBe(4);

      await act(async () => {
        root.render(React.createElement(Harness, { isOpen: true, maxTime: Number.NaN }));
      });
      expect(currentState?.playbackTime).toBe(1);
    });

    it('guards formatSrtTime and formatTimestamp against NaN seconds', () => {
      expect(formatSrtTime(Number.NaN)).toBe('00:00:00,000');
      expect(formatTimestamp(Number.NaN)).toBe('00:00');
    });

    it('catches onApply errors in StoryboardModal and displays chapterError', async () => {
      const project = createEmptyProject();
      await act(async () => {
        root.render(
          React.createElement(StoryboardModal, {
            isOpen: true,
            onClose: () => {},
            project,
            onApply: () => {
              throw new Error('同步章节失败');
            },
          }),
        );
      });

      const syncBtn = findButtonByText(container, '保存并同步到时间轴标记');
      await act(async () => {
        syncBtn.click();
      });
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('同步章节失败');
    });

    it('guards generateSmartMarkers against NaN cadence/bpm and closes SmartMarkerModal on backdrop click', async () => {
      const project = createEmptyProject();
      project.actions = [
        createAction('wait', { duration: 4 }),
      ];
      const markers = generateSmartMarkers(project, {
        mode: 'speech',
        cadenceSeconds: Number.NaN,
      });
      expect(markers.length).toBeGreaterThan(0);
      expect(markers.every(m => Number.isFinite(m.time))).toBe(true);

      const onClose = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(SmartMarkerModal, {
            isOpen: true,
            project,
            onClose,
            onApply: () => {},
          }),
        );
      });
      const overlay = container.querySelector('.smm-overlay') as HTMLElement;
      expect(overlay).toBeTruthy();
      await act(async () => {
        overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('guards StageZoomControls and stage-direct-gizmo against NaN inputs', async () => {
      expect(getNextZoomIn(Number.NaN)).toBe(1.25);
      expect(getNextZoomOut(Number.NaN)).toBe(0.75);

      const pct = manimToStagePercent(Number.NaN, Number.NaN, 0);
      expect(pct.leftPercent).toBeCloseTo(50, 5);
      expect(pct.topPercent).toBeCloseTo(50, 5);

      const manim = stagePercentToManim(Number.NaN, Number.NaN, 0, 0);
      expect(manim.x).toBe(0);
      expect(manim.y).toBe(0);

      await act(async () => {
        root.render(
          React.createElement(StageZoomControls, {
            zoom: Number.NaN,
            onZoomChange: () => {},
            onResetZoom: () => {},
            isFullscreen: false,
            onToggleFullscreen: () => {},
          }),
        );
      });
      expect(container.textContent).toContain('100%');
    });

    it('prevents duplicate onUpdateMarker calls on Enter + blur in TimelineMarkerBar and guards NaN fps', async () => {
      const project = createEmptyProject();
      project.scene.fps = Number.NaN as unknown as number;
      const added = addMarker(project, 1.25, '测试点');
      expect(Number.isFinite(added.marker.time)).toBe(true);
      const updated = updateMarker(added.project, added.marker.id, { time: 2.5 });
      expect(Number.isFinite(updated.scene.markers?.[0]?.time)).toBe(true);

      const onUpdateMarker = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(TimelineMarkerBar, {
            markers: [added.marker],
            currentTime: 0,
            fps: Number.NaN,
            onSeek: () => {},
            onAddMarker: () => {},
            onUpdateMarker,
            onRemoveMarker: () => {},
          }),
        );
      });

      const labelEl = container.querySelector('.tmb-label') as HTMLElement;
      expect(labelEl).toBeTruthy();
      await act(async () => {
        labelEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      const input = container.querySelector('input.tmb-input') as HTMLInputElement;
      expect(input).toBeTruthy();
      await act(async () => {
        setInputValue(input, '新名称');
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(onUpdateMarker).toHaveBeenCalledTimes(1);
      expect(onUpdateMarker).toHaveBeenCalledWith(added.marker.id, { label: '新名称' });
    });
  });
});
