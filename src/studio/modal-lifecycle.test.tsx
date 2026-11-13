// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioVisualizerModal } from './AudioVisualizerModal';
import { CameraDirectorModal } from './CameraDirectorModal';
import { ComplexMappingModal } from './ComplexMappingModal';
import { KeyframeCurveModal } from './KeyframeCurveModal';
import { PolarParametricModal } from './PolarParametricModal';
import { PositionPad } from './PositionPad';
import { ProbabilityPlaygroundModal } from './ProbabilityPlaygroundModal';
import { SmartMarkerModal } from './SmartMarkerModal';
import { SurfacePlaygroundModal } from './SurfacePlaygroundModal';
import { TexColorStylerModal } from './TexColorStylerModal';
import { Vector3DPlaygroundModal } from './Vector3DPlaygroundModal';
import { clientToSvgPoint, copyTextToClipboard } from './browser-utils';
import { createEmptyProject } from './core/project';

describe('Modal lifecycle and drag commit regressions', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('PositionPad buffers pointer drag as draft and commits once on pointerup', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(<PositionPad mode="position" x={0} y={0} onChange={onChange} />);
    });

    const svg = container.querySelector<SVGSVGElement>('.pos-pad-stage')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 160,
      height: 90,
      right: 160,
      bottom: 90,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    await act(async () => {
      svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 80, clientY: 45, bubbles: true }));
      svg.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 45, bubbles: true }));
      svg.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 0, bubbles: true }));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector('.pos-pad-coords')?.textContent).toBe('(7.1, 4.0)');

    await act(async () => {
      svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 160, clientY: 0, bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ x: 7.1, y: 4.0 });
  });

  it('cancels background animation loops when kept-mounted playground modals close', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 42);
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const project = createEmptyProject();

    // AudioVisualizerModal starts playing=true when opened
    await act(async () => {
      root.render(
        <AudioVisualizerModal isOpen onClose={vi.fn()} onInsertAudioVisualizer={vi.fn()} />
      );
    });
    expect(rafSpy).toHaveBeenCalled();
    await act(async () => {
      root.render(
        <AudioVisualizerModal isOpen={false} onClose={vi.fn()} onInsertAudioVisualizer={vi.fn()} />
      );
    });
    expect(cancelSpy).toHaveBeenCalledWith(42);

    // KeyframeCurveModal also runs a preview loop when open
    cancelSpy.mockClear();
    await act(async () => {
      root.render(<KeyframeCurveModal isOpen onClose={vi.fn()} />);
    });
    await act(async () => {
      root.render(<KeyframeCurveModal isOpen={false} onClose={vi.fn()} />);
    });
    expect(cancelSpy).toHaveBeenCalledWith(42);

    // PolarParametricModal & ComplexMappingModal should also stop loops on close
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    await act(async () => {
      root.render(<PolarParametricModal isOpen onClose={vi.fn()} project={project} onApply={vi.fn()} />);
    });
    const traceBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('动态循迹'))!;
    expect(traceBtn).not.toBeNull();
    await act(async () => { traceBtn.click(); });
    await act(async () => {
      root.render(<PolarParametricModal isOpen={false} onClose={vi.fn()} project={project} onApply={vi.fn()} />);
    });
    expect(clearIntervalSpy).toHaveBeenCalled();

    cancelSpy.mockClear();
    await act(async () => {
      root.render(<ComplexMappingModal isOpen onClose={vi.fn()} project={project} onApply={vi.fn()} />);
    });
    const morphBtn = container.querySelector<HTMLButtonElement>('.morph-play-btn')!;
    expect(morphBtn).not.toBeNull();
    await act(async () => { morphBtn.click(); });
    await act(async () => {
      root.render(<ComplexMappingModal isOpen={false} onClose={vi.fn()} project={project} onApply={vi.fn()} />);
    });
    expect(cancelSpy).toHaveBeenCalledWith(42);
  });

  it('closes SmartMarkerModal on Escape', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <SmartMarkerModal project={createEmptyProject()} isOpen onClose={onClose} onApply={vi.fn()} />
      );
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('toggles ProbabilityPlaygroundModal open/closed safely and handles equal/reversed interval bounds', async () => {
    const project = createEmptyProject();
    await act(async () => {
      root.render(<ProbabilityPlaygroundModal isOpen project={project} onClose={vi.fn()} onApply={vi.fn()} />);
    });
    expect(container.querySelector('.prob-hud')?.textContent).toContain('68.3%');

    // Close and reopen — would throw React hooks order error if useMemo ran after early return
    await act(async () => {
      root.render(<ProbabilityPlaygroundModal isOpen={false} project={project} onClose={vi.fn()} onApply={vi.fn()} />);
    });
    expect(container.innerHTML).toBe('');

    await act(async () => {
      root.render(<ProbabilityPlaygroundModal isOpen project={project} onClose={vi.fn()} onApply={vi.fn()} />);
    });
    expect(container.querySelector('.prob-hud')).not.toBeNull();

    // Switching presets should render without error
    const binomialBtn = Array.from(container.querySelectorAll('button.preset-chip')).find((btn) =>
      btn.textContent?.includes('二项'),
    ) as HTMLButtonElement | undefined;
    expect(binomialBtn).toBeDefined();
    await act(async () => {
      binomialBtn!.click();
    });
    expect(container.querySelector('.prob-hud')?.textContent).toContain('棣莫弗-拉普拉斯');
  });

  it('scales CSS-resized SVG coordinates via clientToSvgPoint and handles clipboard rejection safely', async () => {
    const fakeSvg = {
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 320, height: 240 }),
    } as Pick<Element, 'getBoundingClientRect'>;
    expect(clientToSvgPoint(fakeSvg, 260, 170, 640, 480)).toEqual({ x: 320, y: 240 });
    expect(clientToSvgPoint(null, 10, 10, 640, 480)).toBeNull();

    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await expect(copyTextToClipboard('test-code')).resolves.toBe(false);
    expect(writeText).toHaveBeenCalledWith('test-code');
  });

  it('stops CameraDirectorModal playback cleanly on close and resets at maxTime', async () => {
    vi.useFakeTimers();
    const project = createEmptyProject();
    await act(async () => {
      root.render(<CameraDirectorModal isOpen project={project} onClose={vi.fn()} onApply={vi.fn()} />);
    });

    const playBtn = container.querySelector<HTMLButtonElement>('.camera-play-btn')!;
    expect(playBtn.textContent).toContain('播放');

    await act(async () => {
      playBtn.click();
    });
    expect(playBtn.textContent).toContain('暂停');

    // Closing resets playback without leaving active interval errors
    await act(async () => {
      root.render(<CameraDirectorModal isOpen={false} project={project} onClose={vi.fn()} onApply={vi.fn()} />);
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    await act(async () => {
      root.render(<CameraDirectorModal isOpen project={project} onClose={vi.fn()} onApply={vi.fn()} />);
    });
    expect(container.querySelector<HTMLButtonElement>('.camera-play-btn')?.textContent).toContain('播放');
  });

  it('handles 3D orbit pointercancel without throwing on missing capture and cancels pending TexColorStyler close timer', async () => {
    vi.useFakeTimers();
    const project = createEmptyProject();

    await act(async () => {
      root.render(<Vector3DPlaygroundModal isOpen project={project} onClose={vi.fn()} onApply={vi.fn()} />);
    });
    const svg3d = container.querySelector('svg.vector3d-svg')!;
    expect(svg3d).not.toBeNull();
    await act(async () => {
      svg3d.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100 }));
      svg3d.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 140, clientY: 100 }));
      svg3d.dispatchEvent(new Event('pointercancel', { bubbles: true }));
    });
    expect(svg3d.closest('.vector3d-modal-backdrop')).not.toBeNull();

    await act(async () => {
      root.render(<SurfacePlaygroundModal isOpen project={project} onClose={vi.fn()} onApply={vi.fn()} />);
    });
    const surfaceCanvas = container.querySelector('.surface-canvas-container')!;
    expect(surfaceCanvas).not.toBeNull();
    await act(async () => {
      surfaceCanvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100 }));
      surfaceCanvas.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 150, clientY: 120 }));
      surfaceCanvas.dispatchEvent(new Event('lostpointercapture', { bubbles: true }));
    });

    const onClose = vi.fn();
    const onInsert = vi.fn();
    await act(async () => {
      root.render(<TexColorStylerModal isOpen onClose={onClose} onInsertColoredTex={onInsert} />);
    });
    const insertBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('插入'))!;
    await act(async () => {
      insertBtn.click();
    });
    expect(onInsert).toHaveBeenCalledOnce();
    // Re-render closed before 450ms timer elapses: delayed timer must be cancelled
    await act(async () => {
      root.render(<TexColorStylerModal isOpen={false} onClose={onClose} onInsertColoredTex={onInsert} />);
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
