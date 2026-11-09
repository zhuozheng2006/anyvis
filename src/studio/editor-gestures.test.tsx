// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { StageDirectGizmo } from './StageDirectGizmo';
import { Timeline } from './Timeline';
import { createAction } from './core/catalog';
import { createEmptyProject } from './core/project';
import { projectHistory } from './project-history';
import { updateAction } from './authoring';

// jsdom has no layout for the third-party virtualized rows. Keep our actual
// Timeline and parent callbacks; replace only that library's DOM projection.
vi.mock('@xzdarcy/react-timeline-editor', () => ({
  Timeline: ({ editorData, getActionRender }: { editorData: { id: string; actions: { id: string }[] }[]; getActionRender: (a: { id: string }, r: { id: string }) => React.ReactNode }) =>
    <div>{editorData.flatMap(row => row.actions.map(action => <div className="timeline-editor-action" key={action.id}>{getActionRender(action, row)}</div>))}</div>,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } });
const pointer = (el: Element, type: string, x: number, y: number) => {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  el.dispatchEvent(e);
};

it.each([0.5, 1, 2])('keeps grab offset under %sx zoom and pan; commits one undoable drag', async zoom => {
  const host = document.body.appendChild(document.createElement('div')), root = createRoot(host);
  const action = createAction('circle', { x: 1, y: 1 });
  let history = { past: [] as ReturnType<typeof createEmptyProject>[], present: { ...createEmptyProject(), actions: [action] }, future: [] as ReturnType<typeof createEmptyProject>[] };
  const onChange = vi.fn(fields => { history = projectHistory(history, { type: 'edit', value: updateAction(history.present, action.id, fields) }); });
  try {
    await act(async () => root.render(<StageDirectGizmo action={action} onChange={onChange}/>));
    const overlay = host.querySelector('.stage-direct-gizmo-container')!;
    vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({ left: -240, top: 73, width: 710 * zoom, height: 400 * zoom } as DOMRect);
    const reticle = host.querySelector('.gizmo-reticle') as HTMLElement;
    reticle.setPointerCapture = vi.fn(); reticle.releasePointerCapture = vi.fn();
    // Grab off-centre; a one pixel move must not teleport x=1 to x=2.
    await act(async () => pointer(reticle, 'pointerdown', 181, 171));
    await act(async () => pointer(reticle, 'pointermove', 182, 171));
    expect(Number(reticle.getAttribute('aria-valuenow'))).toBeCloseTo(1, 1);
    for (let i = 1; i <= 10; i++) await act(async () => pointer(reticle, 'pointermove', 181 + i * 5 * zoom, 171 - i * 5 * zoom));
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => pointer(reticle, 'pointerup', 181 + 50 * zoom, 171 - 50 * zoom));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ x: 2, y: 2 });
    expect(history.past).toHaveLength(1);
    history = projectHistory(history, { type: 'undo' });
    expect(history.present.actions[0].fields).toMatchObject({ x: 1, y: 1 });
    await act(async () => pointer(reticle, 'pointerdown', 181, 171));
    await act(async () => pointer(reticle, 'pointermove', 231, 121));
    await act(async () => pointer(reticle, 'pointercancel', 231, 121));
    await act(async () => pointer(reticle, 'pointerup', 231, 121));
    expect(onChange).toHaveBeenCalledTimes(1);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it.each([null, 'old'])('retains box selection through parent callbacks (previous %s)', async initial => {
  const host = document.body.appendChild(document.createElement('div')), root = createRoot(host);
  const first = createAction('wait'), second = createAction('wait');
  const project = { ...createEmptyProject(), actions: [first, second] };
  let selection: string[] = [];
  function Parent() {
    const [selected, setSelected] = useState<string | null>(initial);
    const [ids, setIds] = useState<string[]>(initial ? [initial] : []);
    selection = ids;
    return <Timeline project={project} selectedId={selected} selectedIds={ids} time={0} onChange={() => {}} onSelectIds={setIds}
      onSelect={id => { setSelected(id); setIds(id ? [id] : []); }} onShowBlocks={() => {}} onSeek={() => {}} onError={() => {}}/>;
  }
  try {
    await act(async () => root.render(<Parent/>));
    const surface = host.querySelector('.tl-body')!;
    const clips = surface.querySelectorAll('.timeline-editor-action');
    expect(clips.length).toBe(2);
    clips.forEach((clip, i) => vi.spyOn(clip, 'getBoundingClientRect').mockReturnValue({ left: 20 + i * 40, right: 50 + i * 40, top: 20, bottom: 40 } as DOMRect));
    await act(async () => surface.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 10, clientY: 10 })));
    await act(async () => window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 50 })));
    await act(async () => window.dispatchEvent(new MouseEvent('mouseup', { clientX: 100, clientY: 50 })));
    expect(selection).toEqual([first.id, second.id]);
    await act(async () => host.querySelector('.tl-editor')!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));
    expect(selection).toEqual([]);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it.each([
  ['wait', {}, true],
  ['shift', { easing: 'linear' }, true],
  ['shift', { easing: 'smooth' }, false],
  ['scale', { factor: 2 }, false],
  ['rotate', { angle: 90 }, false],
] as const)('only offers semantically safe splitting for %s %j', async (type, fields, allowed) => {
  const host = document.body.appendChild(document.createElement('div')), root = createRoot(host);
  const action = createAction(type, { target: 'c', duration: 2, ...fields });
  const project = { ...createEmptyProject(), actions: [createAction('circle', { name: 'c', appear: 'none' }), action] };
  const change = vi.fn();
  try {
    await act(async () => root.render(<Timeline project={project} selectedId={action.id} selectedIds={[action.id]} time={1} onChange={change} onSelect={() => {}} onShowBlocks={() => {}} onSeek={() => {}} onError={() => {}}/>));
    const button = host.querySelector('[aria-label="在播放头处分割动画片段"]') as HTMLButtonElement;
    expect(button.disabled).toBe(!allowed);
    await act(async () => button.click());
    expect(change).toHaveBeenCalledTimes(allowed ? 1 : 0);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it('fits portrait letterboxing and uses its actual Manim frame width', async () => {
  const host = document.body.appendChild(document.createElement('div')), root = createRoot(host);
  Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 400 } });
  const onChange = vi.fn(), action = createAction('circle', { x: 1, y: 0 });
  try {
    await act(async () => root.render(<StageDirectGizmo action={action} frameAspect={9/16} onChange={onChange}/>));
    const overlay = host.querySelector('.stage-direct-gizmo-container') as HTMLElement;
    expect(overlay.style.width).toBe('225px');
    expect(overlay.style.height).toBe('400px');
    vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({ left: 150, top: 20, width: 450, height: 800 } as DOMRect);
    const reticle = host.querySelector('.gizmo-reticle') as HTMLElement;
    reticle.setPointerCapture = vi.fn(); reticle.releasePointerCapture = vi.fn();
    await act(async () => pointer(reticle, 'pointerdown', 400, 420));
    await act(async () => pointer(reticle, 'pointermove', 450, 420));
    await act(async () => pointer(reticle, 'pointerup', 450, 420));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ x: 1.5, y: 0 });
  } finally { await act(async () => root.unmount()); host.remove(); }
});
