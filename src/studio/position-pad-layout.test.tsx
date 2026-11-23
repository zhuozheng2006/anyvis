// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ObjectManager } from './ObjectManager';
import { ActionInspector } from './ActionInspector';
import { PositionPad, clientRatioToManimCoords } from './PositionPad';
import { createAction } from './core/catalog';
import { createEmptyProject } from './core/project';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function portraitPad() {
  const svg = host.querySelector<SVGSVGElement>('.pos-pad-stage')!;
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 20, top: 10, width: 90, height: 160 } as DOMRect);
  return (type: string, x: number, y: number, init: PointerEventInit = {}) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, ...init });
    // jsdom has MouseEvent but no PointerEvent constructor.
    Object.defineProperties(event, {
      pointerId: { value: init.pointerId ?? 1 },
      pointerType: { value: init.pointerType ?? 'mouse' },
      isPrimary: { value: init.isPrimary ?? true },
    });
    return svg.dispatchEvent(event);
  };
}

it.each([
  [1920, 1080, 4.5],
  [1080, 1920, 1.4],
  [1080, 1080, 2.5],
])('keeps object alignment inside the %s × %s frame without changing z', async (width, height, expectedX) => {
  const action = createAction('circle', { x: 0, y: 0, z: 3 });
  const initial = createEmptyProject();
  const project = { ...initial, scene: { ...initial.scene, width, height }, actions: [action] };
  const onChange = vi.fn();
  await act(async () => root.render(<ObjectManager project={project} selectedId={action.id}
    onSelect={() => {}} onChange={onChange} onAdd={() => {}} onError={() => {}} />));
  const right = host.querySelector<HTMLButtonElement>('[aria-label="右侧 (RIGHT)"]')!;
  await act(async () => right.click());
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0].actions[0].fields).toMatchObject({ x: expectedX, y: 0, z: 3 });
  expect(expectedX).toBeLessThan(4 * width / height);

  const svg = host.querySelector<SVGSVGElement>('.pos-pad-stage')!;
  const [, , viewWidth, viewHeight] = svg.getAttribute('viewBox')!.split(' ').map(Number);
  expect(viewWidth / viewHeight).toBeCloseTo(width / height);
});

it('maps portrait dragging to the actual frame and commits only the final coordinates', async () => {
  const onChange = vi.fn();
  await act(async () => root.render(<PositionPad mode="position" x={0} y={0} frameAspect={9 / 16} onChange={onChange} />));
  const pointer = portraitPad();
  await act(async () => { pointer('pointerdown', 65, 90); pointer('pointermove', 87.5, 50); });
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => { pointer('pointerup', 87.5, 50); });
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ x: 1.1, y: 2 });
  // A 0.1-unit snap must not round the 2.25-unit frame boundary outside the scene.
  expect(clientRatioToManimCoords(1, 0.5, 0.1, 9 / 16).x).toBeLessThanOrEqual(2.25);
  await act(async () => { pointer('pointerdown', 110, 90); });
  expect(host.querySelector('.pos-pad-coords')?.textContent).toBe('(2.25, 0.0)');
  await act(async () => { pointer('pointerup', 110, 90); });
  expect(onChange).toHaveBeenLastCalledWith({ x: 2.25, y: 0 });
});

it('keeps object coordinates when the position pad is right-clicked', async () => {
  const circle = createAction('circle', { x: 0, y: 0, z: 3 });
  const base = createEmptyProject();
  const project = { ...base, scene: { ...base.scene, width: 1080, height: 1920 }, actions: [circle] };
  const onChange = vi.fn();
  await act(async () => root.render(<ObjectManager project={project} selectedId={circle.id}
    onSelect={() => {}} onChange={onChange} onAdd={() => {}} onError={() => {}} />));
  const pointer = portraitPad();
  await act(async () => {
    pointer('pointerdown', 87.5, 50, { button: 2, buttons: 2 });
    pointer('contextmenu', 87.5, 50, { button: 2, buttons: 2 });
    pointer('pointerup', 87.5, 50, { button: 2 });
  });
  expect(host.querySelector('.pos-pad-coords')?.textContent).toBe('(0.0, 0.0)');
  expect(onChange).not.toHaveBeenCalled();
});

it('accepts only the initiating touch until its drag ends', async () => {
  const onChange = vi.fn();
  await act(async () => root.render(<PositionPad mode="position" x={0} y={0} frameAspect={9 / 16} onChange={onChange} />));
  const pointer = portraitPad();
  const finger = { pointerType: 'touch', pointerId: 10 };
  const other = { pointerType: 'touch', pointerId: 11, isPrimary: false };
  await act(async () => {
    pointer('pointerdown', 65, 90, finger);
    pointer('pointermove', 87.5, 50, finger);
    pointer('pointerdown', 20, 170, other);
    pointer('pointermove', 20, 170, other);
    pointer('contextmenu', 20, 170, other);
  });
  expect(host.querySelector('.pos-pad-coords')?.textContent).toBe('(1.1, 2.0)');
  await act(async () => {
    pointer('pointerup', 20, 170, other);
    pointer('pointercancel', 20, 170, other);
    pointer('lostpointercapture', 20, 170, other);
  });
  expect(onChange).not.toHaveBeenCalled();
  expect(host.querySelector('.pos-pad-coords')?.textContent).toBe('(1.1, 2.0)');
  await act(async () => { pointer('pointerup', 110, 90, finger); });
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ x: 2.25, y: 0 });
});

it('opens the long-press menu without committing a touch or cancelling the next drag', async () => {
  const onChange = vi.fn();
  await act(async () => root.render(<PositionPad mode="position" x={0} y={0} frameAspect={9 / 16} onChange={onChange} />));
  const pointer = portraitPad();
  const finger = { pointerType: 'touch', pointerId: 10 };
  await act(async () => { pointer('pointerdown', 87.5, 50, finger); });
  expect(host.querySelector('.pos-pad-coords')?.textContent).toBe('(1.1, 2.0)');
  await act(async () => {
    // Some engines dispatch a MouseEvent for the menu, without a pointer ID.
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    expect(host.querySelector('.pos-pad-stage')!.dispatchEvent(menu)).toBe(true);
    pointer('pointerup', 87.5, 50, finger);
  });
  expect(onChange).not.toHaveBeenCalled();
  expect(host.querySelector('.pos-pad-coords')?.textContent).toBe('(0.0, 0.0)');
  await act(async () => { pointer('pointerdown', 110, 90, finger); pointer('pointerup', 110, 90, finger); });
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ x: 2.25, y: 0 });
});

it('leaves a Mac Control-click to the context menu even if the menu arrives after pointerup', async () => {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
  const onChange = vi.fn();
  await act(async () => root.render(<PositionPad mode="position" x={0} y={0} frameAspect={9 / 16} onChange={onChange} />));
  const pointer = portraitPad();
  await act(async () => {
    pointer('pointerdown', 87.5, 50, { ctrlKey: true, button: 0, buttons: 1 });
    pointer('pointerup', 87.5, 50, { ctrlKey: true, button: 0 });
    expect(pointer('contextmenu', 87.5, 50, { ctrlKey: true, button: 2 })).toBe(true);
  });
  expect(onChange).not.toHaveBeenCalled();
  expect(host.querySelector('.pos-pad-coords')?.textContent).toBe('(0.0, 0.0)');
});

it.each(['pointercancel', 'lostpointercapture'])('discards the owning pointer draft on %s', async type => {
  const onChange = vi.fn();
  await act(async () => root.render(<PositionPad mode="position" x={0} y={0} frameAspect={9 / 16} onChange={onChange} />));
  const pointer = portraitPad();
  await act(async () => { pointer('pointerdown', 87.5, 50); });
  expect(host.querySelector('.pos-pad-coords')?.textContent).toBe('(1.1, 2.0)');
  await act(async () => { pointer(type, 87.5, 50); pointer('pointerup', 87.5, 50); });
  expect(onChange).not.toHaveBeenCalled();
  expect(host.querySelector('.pos-pad-coords')?.textContent).toBe('(0.0, 0.0)');
});

it('keeps explicit shift distances unchanged in a portrait action inspector', async () => {
  const action = createAction('shift', { dx: 0, dy: 0, dz: 3 });
  const onChange = vi.fn();
  await act(async () => root.render(<ActionInspector action={action} actions={[action]}
    frameAspect={9 / 16} onChange={onChange} />));
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="向右偏移 (+2, 0)"]')!.click());
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ dx: 2, dy: 0 });
});
