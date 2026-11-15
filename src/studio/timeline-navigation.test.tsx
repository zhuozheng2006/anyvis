// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Timeline } from './Timeline';
import { createAction } from './core/catalog';
import { createEmptyProject } from './core/project';

interface EditorCallbacks {
  onClickTimeArea(time: number): boolean;
  onScroll(position: { scrollLeft: number; scrollTop: number }): void;
}
let editorCallbacks: EditorCallbacks;
// Replace only the virtualized editor's DOM; keep AnyVis state, marker and
// split operations real so the tests exercise their shared playhead.
vi.mock('@xzdarcy/react-timeline-editor', () => ({
  Timeline: (props: EditorCallbacks) => {
    editorCallbacks = props;
    return <div className="timeline-editor" />;
  },
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement, root: Root;
beforeEach(() => { host = document.body.appendChild(document.createElement('div')); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

function mount(canPlay = false) {
  const wait = createAction('wait', { duration: 4 });
  let latest = { ...createEmptyProject(), actions: [wait] };
  function Parent() {
    const [project, setProject] = useState(latest), [time, setTime] = useState(0);
    latest = project;
    return <Timeline project={project} selectedId={wait.id} time={time} canPlay={canPlay}
      onChange={setProject} onSelect={() => {}} onShowBlocks={() => {}} onSeek={setTime} onError={() => {}} />;
  }
  act(() => root.render(<Parent />));
  return { project: () => latest };
}

it.each([false, true])('uses a selected time for markers and splitting with preview available=%s', canPlay => {
  const state = mount(canPlay);
  act(() => { editorCallbacks.onClickTimeArea(1.5); });
  expect(host.querySelector('.tl-timecode')?.textContent).toBe('00:01:15');
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="添加时间轴标记"]')!.click());
  expect(state.project().scene.markers?.[0].time).toBe(1.5);
  const split = host.querySelector<HTMLButtonElement>('[aria-label="在播放头处分割动画片段"]')!;
  expect(split.disabled).toBe(false);
  act(() => split.click());
  expect(state.project().actions.map(action => action.fields.duration)).toEqual([1.5, 2.5]);
});

function hover(clientX: number) {
  act(() => host.querySelector('.tl-body')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX })));
}
function mockGeometry() {
  vi.spyOn(host.querySelector('.tl-body')!, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 1000 } as DOMRect);
  vi.spyOn(host.querySelector('.timeline-editor')!, 'getBoundingClientRect').mockReturnValue({ left: 250, width: 850 } as DOMRect);
}

it('aligns hover time with the ruler origin and horizontal scroll', () => {
  mount(); mockGeometry();
  // Editor starts at x=250, the ruler adds 16px, and one second is 80px.
  hover(346);
  expect(host.querySelector('.tl-hover-pill')?.textContent).toBe('00:01:00 (30F)');
  act(() => editorCallbacks.onScroll({ scrollLeft: 800, scrollTop: 0 }));
  expect(host.querySelector('.tl-hover-pill')?.textContent).toBe('00:11:00 (330F)');
  hover(426);
  expect(host.querySelector('.tl-hover-pill')?.textContent).toBe('00:12:00 (360F)');
});

it('recomputes the hovered time after zoom and clears it over track labels', () => {
  mount(); mockGeometry(); hover(346);
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="放大时间轴"]')!.click());
  expect(host.querySelector('.tl-hover-pill')?.textContent).toBe('00:00:21 (21F)');
  hover(240);
  expect(host.querySelector('.tl-hover-pill')).toBeNull();
});
