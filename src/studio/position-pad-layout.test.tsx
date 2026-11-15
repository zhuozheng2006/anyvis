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
  const svg = host.querySelector<SVGSVGElement>('.pos-pad-stage')!;
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 20, top: 10, width: 90, height: 160 } as DOMRect);
  const pointer = (type: string, x: number, y: number) => svg.dispatchEvent(new MouseEvent(type, {
    bubbles: true, clientX: x, clientY: y,
  }));
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

it('keeps explicit shift distances unchanged in a portrait action inspector', async () => {
  const action = createAction('shift', { dx: 0, dy: 0, dz: 3 });
  const onChange = vi.fn();
  await act(async () => root.render(<ActionInspector action={action} actions={[action]}
    frameAspect={9 / 16} onChange={onChange} />));
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="向右偏移 (+2, 0)"]')!.click());
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ dx: 2, dy: 0 });
});
