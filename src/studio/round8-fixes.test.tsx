// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import {
  ExpressionPlotPreview,
  buildExpressionSvgPath,
  evaluateScalarExpressionAt,
  sampleExpressionCurve,
} from './ExpressionPlotPreview';
import { createEmptyProject } from './core/project';
import { AudioVisualizerModal } from './AudioVisualizerModal';
import { AutoLayoutModal } from './AutoLayoutModal';
import { CalculusPlaygroundModal } from './CalculusPlaygroundModal';
import { CameraDirectorModal } from './CameraDirectorModal';
import { ComplexMappingModal } from './ComplexMappingModal';
import { FourierPlaygroundModal } from './FourierPlaygroundModal';
import { GeometryPlaygroundModal } from './GeometryPlaygroundModal';
import { GraphPlaygroundModal } from './GraphPlaygroundModal';
import { KeyframeCurveModal } from './KeyframeCurveModal';
import { MatrixPlaygroundModal } from './MatrixPlaygroundModal';
import { PolarParametricModal } from './PolarParametricModal';
import { ProbabilityPlaygroundModal } from './ProbabilityPlaygroundModal';
import { RiemannPlaygroundModal } from './RiemannPlaygroundModal';
import { ShortcutsHelpModal } from './ShortcutsHelpModal';
import { SmartMarkerModal } from './SmartMarkerModal';
import { StoryboardModal } from './StoryboardModal';
import { SubtitleSyncModal } from './SubtitleSyncModal';
import { SurfacePlaygroundModal } from './SurfacePlaygroundModal';
import { TexColorStylerModal } from './TexColorStylerModal';
import { Vector3DPlaygroundModal } from './Vector3DPlaygroundModal';
import { VectorFieldPlaygroundModal } from './VectorFieldPlaygroundModal';
import LegacyTimeline from '../components/Timeline';
import { createDemo } from '../core/presets';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function renderIntoHost(element: React.ReactElement, fn: (host: HTMLDivElement) => Promise<void> | void) {
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(element);
    });
    await fn(host);
  } finally {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  }
}

describe('Round 8 fixes', () => {
  it('supports % modulo in ExpressionPlotPreview and splits SVG paths across domain gaps and asymptotes', async () => {
    expect(evaluateScalarExpressionAt('x % 2', { x: 5 })).toBe(1);
    expect(evaluateScalarExpressionAt('5 % 2 + 1', { x: 0 })).toBe(2);

    const domainHoleResult = sampleExpressionCurve('sqrt(x^2 - 1)');
    expect(domainHoleResult.valid).toBe(true);
    const domainHolePath = buildExpressionSvgPath(domainHoleResult.samples, domainHoleResult.yMin, domainHoleResult.yMax);
    expect(domainHolePath.match(/M/g)?.length).toBeGreaterThanOrEqual(2);

    const poleResult = sampleExpressionCurve('1 / x');
    expect(poleResult.valid).toBe(true);
    const polePath = buildExpressionSvgPath(poleResult.samples, poleResult.yMin, poleResult.yMax);
    expect(polePath.match(/M/g)?.length).toBeGreaterThanOrEqual(2);

    const tanResult = sampleExpressionCurve('tan(x)');
    expect(tanResult.valid).toBe(true);
    const tanPath = buildExpressionSvgPath(tanResult.samples, tanResult.yMin, tanResult.yMax);
    expect(tanPath.match(/M/g)?.length).toBeGreaterThanOrEqual(3);

    await renderIntoHost(<ExpressionPlotPreview expression="sqrt(x^2 - 1)" />, host => {
      const curve = host.querySelector('svg.expr-plot-svg path[fill="none"]');
      expect(curve).not.toBeNull();
      expect(curve!.getAttribute('d')!.match(/M/g)?.length).toBeGreaterThanOrEqual(2);
    });

    await renderIntoHost(<ExpressionPlotPreview expression="x % 2" />, host => {
      expect(host.querySelector('.expr-plot-error')).toBeNull();
      expect(host.querySelector('svg.expr-plot-svg')).not.toBeNull();
    });
  });

  it('closes MatrixPlaygroundModal on Escape and backdrop clicks, ignoring IME or inner clicks', async () => {
    const onClose = vi.fn();
    await renderIntoHost(<MatrixPlaygroundModal isOpen onClose={onClose} onInsertMatrix={vi.fn()} />, async host => {
      const overlay = host.querySelector('.mpm-overlay') as HTMLElement;
      const header = host.querySelector('.mpm-header') as HTMLElement;
      expect(overlay).not.toBeNull();
      expect(header).not.toBeNull();

      await act(async () => {
        header.click();
      });
      expect(onClose).not.toHaveBeenCalled();

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, cancelable: true }));
      });
      expect(onClose).not.toHaveBeenCalled();

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
      });
      expect(onClose).toHaveBeenCalledTimes(1);

      await act(async () => {
        overlay.click();
      });
      expect(onClose).toHaveBeenCalledTimes(2);
    });
  });

  it('uses unique SVG marker IDs across Vector3DPlaygroundModal instances and removes unused arrowhead in VectorFieldPlaygroundModal', async () => {
    const project = createEmptyProject();
    await renderIntoHost(
      <>
        <Vector3DPlaygroundModal isOpen project={project} onClose={vi.fn()} onApply={vi.fn()} />
        <Vector3DPlaygroundModal isOpen project={project} onClose={vi.fn()} onApply={vi.fn()} />
      </>,
      host => {
        const markers = Array.from(host.querySelectorAll('marker[id$="-arrowhead-u"]'));
        expect(markers).toHaveLength(2);
        expect(markers[0].id).not.toBe(markers[1].id);
        expect(host.querySelector('#arrowhead-u')).toBeNull();
        const svgs = Array.from(host.querySelectorAll('svg.vector3d-svg'));
        expect(svgs[0].querySelector(`line[marker-end="url(#${markers[0].id})"]`)).not.toBeNull();
        expect(svgs[1].querySelector(`line[marker-end="url(#${markers[1].id})"]`)).not.toBeNull();
      },
    );

    await renderIntoHost(<VectorFieldPlaygroundModal isOpen project={project} onClose={vi.fn()} onApply={vi.fn()} />, host => {
      expect(host.querySelector('#arrowhead')).toBeNull();
    });
  });

  it('closes all studio modals on Escape cleanly', async () => {
    const project = createEmptyProject();
    const cases: Array<[string, (onClose: () => void) => React.ReactElement]> = [
      ['AudioVisualizerModal', onClose => <AudioVisualizerModal isOpen onClose={onClose} />],
      ['AutoLayoutModal', onClose => <AutoLayoutModal isOpen onClose={onClose} project={project} onApply={vi.fn()} />],
      ['CalculusPlaygroundModal', onClose => <CalculusPlaygroundModal isOpen onClose={onClose} />],
      ['CameraDirectorModal', onClose => <CameraDirectorModal isOpen onClose={onClose} project={project} onApply={vi.fn()} />],
      ['ComplexMappingModal', onClose => <ComplexMappingModal isOpen onClose={onClose} project={project} onApply={vi.fn()} />],
      ['FourierPlaygroundModal', onClose => <FourierPlaygroundModal isOpen onClose={onClose} />],
      ['GeometryPlaygroundModal', onClose => <GeometryPlaygroundModal isOpen onClose={onClose} project={project} onApply={vi.fn()} />],
      ['GraphPlaygroundModal', onClose => <GraphPlaygroundModal isOpen onClose={onClose} project={project} onApply={vi.fn()} />],
      ['KeyframeCurveModal', onClose => <KeyframeCurveModal isOpen onClose={onClose} />],
      ['PolarParametricModal', onClose => <PolarParametricModal isOpen onClose={onClose} project={project} onApply={vi.fn()} />],
      ['ProbabilityPlaygroundModal', onClose => <ProbabilityPlaygroundModal isOpen onClose={onClose} project={project} onApply={vi.fn()} />],
      ['RiemannPlaygroundModal', onClose => <RiemannPlaygroundModal isOpen onClose={onClose} />],
      ['ShortcutsHelpModal', onClose => <ShortcutsHelpModal isOpen onClose={onClose} />],
      ['SmartMarkerModal', onClose => <SmartMarkerModal isOpen project={project} onClose={onClose} onApply={vi.fn()} />],
      ['StoryboardModal', onClose => <StoryboardModal isOpen onClose={onClose} project={project} onApply={vi.fn()} />],
      ['SubtitleSyncModal', onClose => <SubtitleSyncModal isOpen onClose={onClose} project={project} onApply={vi.fn()} />],
      ['SurfacePlaygroundModal', onClose => <SurfacePlaygroundModal isOpen onClose={onClose} project={project} onApply={vi.fn()} />],
      ['TexColorStylerModal', onClose => <TexColorStylerModal isOpen onClose={onClose} />],
      ['Vector3DPlaygroundModal', onClose => <Vector3DPlaygroundModal isOpen onClose={onClose} project={project} onApply={vi.fn()} />],
      ['VectorFieldPlaygroundModal', onClose => <VectorFieldPlaygroundModal isOpen onClose={onClose} project={project} onApply={vi.fn()} />],
    ];

    for (const [, factory] of cases) {
      const onClose = vi.fn();
      await renderIntoHost(factory(onClose), async () => {
        await act(async () => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
        });
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    }
  });

  it('guards legacy Timeline seek width, non-finite cue time input, and minimum new clip duration', async () => {
    const baseDemo = createDemo('2d');
    const project = {
      ...baseDemo,
      cues: baseDemo.cues.length ? baseDemo.cues : [{ id: 'cue-1', time: 2, title: '节点 1', description: '' }],
    };
    const onSeek = vi.fn();
    const onChange = vi.fn();

    await renderIntoHost(
      <LegacyTimeline project={project} time={project.duration - 0.04} onSeek={onSeek} onChange={onChange} />,
      async host => {
        const ruler = host.querySelector('.ruler') as HTMLElement;
        expect(ruler).not.toBeNull();
        vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 0, height: 24, right: 0, bottom: 24, x: 0, y: 0, toJSON: () => ({}) });
        await act(async () => {
          ruler.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 20 }));
        });
        expect(onSeek).not.toHaveBeenCalled();

        const addClipBtn = host.querySelector('button[title^="添加 "]') as HTMLButtonElement | null;
        expect(addClipBtn).not.toBeNull();
        await act(async () => {
          addClipBtn!.click();
        });
        expect(onChange).toHaveBeenCalledTimes(1);
        const addedProject = onChange.mock.calls[0][0];
        const createdClip = addedProject.clips[addedProject.clips.length - 1];
        expect(createdClip.duration).toBeGreaterThanOrEqual(0.1);
        expect(createdClip.start + createdClip.duration).toBeLessThanOrEqual(project.duration + 1e-6);

        const cueBtn = host.querySelector('.cue-dot') as HTMLButtonElement | null;
        expect(cueBtn).not.toBeNull();
        await act(async () => {
          cueBtn!.click();
        });
        const cueTimeInput = host.querySelector('input[aria-label="节点时间"]') as HTMLInputElement;
        expect(cueTimeInput).not.toBeNull();
        onChange.mockClear();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        await act(async () => {
          setter.call(cueTimeInput, '');
          cueTimeInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(onChange).not.toHaveBeenCalled();
      },
    );
  });
});
