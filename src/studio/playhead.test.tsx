// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import StudioApp from './StudioApp';
import { createAction } from './core/catalog';
import { createEmptyProject } from './core/project';
import { saveProject } from './storage';
import type { VideoPreview } from './previews';

vi.mock('./blocks/StudioBlocks', () => ({ StudioBlocks: () => <div /> }));
const { preview } = vi.hoisted(() => ({ preview: vi.fn<() => VideoPreview | null>() }));
vi.mock('./previews', () => ({ builtinPreview: preview }));
let seekFromRuler: (time: number) => boolean;
// Keep StudioApp and Timeline real; jsdom cannot lay out virtualized tracks.
vi.mock('@xzdarcy/react-timeline-editor', () => ({
  Timeline: ({ onClickTimeArea }: { onClickTimeArea: typeof seekFromRuler }) => {
    seekFromRuler = onClickTimeArea;
    return <div className="timeline-editor" />;
  },
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  localStorage.clear();
  saveProject({ ...createEmptyProject(), actions: [createAction('wait', { duration: 4 })] });
  preview.mockReturnValue(null);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 200 })));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const button = (label: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
const timecode = () => host.querySelector('.tl-timecode')?.textContent;
async function mount(withVideo = false) {
  if (withVideo) preview.mockReturnValue({ url: '/test.mp4', revision: 'previous', quality: 'preview', format: 'mp4' });
  await act(async () => root.render(<StudioApp />));
  const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(el => el.textContent?.includes('时间轴'))!;
  await act(async () => { tab.click(); });
  await act(async () => { await vi.dynamicImportSettled(); });
}
async function metadata(duration = 2) {
  const video = host.querySelector('video')!;
  Object.defineProperty(video, 'duration', { configurable: true, value: duration });
  await act(async () => video.dispatchEvent(new Event('loadedmetadata')));
  return video;
}

it('moves the editing playhead and adds a marker before the first render', async () => {
  await mount();
  expect(host.querySelector('video')).toBeNull();
  await act(async () => { seekFromRuler(1.5); });
  expect(timecode()).toBe('00:01:15');
  await act(async () => button('添加时间轴标记').click());
  expect(host.querySelector('.tmb-timecode')?.textContent).toBe('01:15');
});

it('keeps the editing cursor beyond an older preview after its paused seek event', async () => {
  await mount(true);
  const video = await metadata(2);
  await act(async () => { seekFromRuler(3.5); });
  expect(video.currentTime).toBe(2);
  await act(async () => video.dispatchEvent(new Event('timeupdate')));
  expect(timecode()).toBe('00:03:15');
  await act(async () => button('添加时间轴标记').click());
  expect(host.querySelector('.tmb-timecode')?.textContent).toBe('03:15');
});

it('returns the main preview to the presentation exit time and restores focus', async () => {
  await mount(true);
  const video = await metadata(4);
  const trigger = button('演播模式'); trigger.focus();
  await act(async () => trigger.click());
  const presentation = host.querySelector<HTMLVideoElement>('.presentation-stage video')!;
  presentation.currentTime = 1.5;
  await act(async () => button('退出演播').click());
  expect(host.querySelector('.presentation-overlay')).toBeNull();
  expect(video.currentTime).toBe(1.5);
  expect(timecode()).toBe('00:01:15');
  expect(document.activeElement).toBe(trigger);
});

it('follows real video playback and the final frame after timeline seeking', async () => {
  await mount(true);
  const video = await metadata(2);
  await act(async () => { seekFromRuler(3.5); });
  Object.defineProperty(video, 'paused', { configurable: true, value: false });
  video.currentTime = 0;
  await act(async () => video.dispatchEvent(new Event('play')));
  expect(timecode()).toBe('00:00:00');
  video.currentTime = 0.5;
  await act(async () => video.dispatchEvent(new Event('timeupdate')));
  expect(timecode()).toBe('00:00:15');
  Object.defineProperty(video, 'paused', { configurable: true, value: true });
  video.currentTime = 2;
  await act(async () => video.dispatchEvent(new Event('ended')));
  expect(timecode()).toBe('00:02:00');
});

it('uses the actual stopped frame when pause follows the last periodic update', async () => {
  await mount(true);
  const video = await metadata(2);
  Object.defineProperty(video, 'paused', { configurable: true, value: false });
  video.currentTime = 0.5;
  await act(async () => video.dispatchEvent(new Event('timeupdate')));
  expect(timecode()).toBe('00:00:15');
  // pause() sets paused synchronously; its final media events arrive later.
  Object.defineProperty(video, 'paused', { configurable: true, value: true });
  video.currentTime = 0.7;
  await act(async () => {
    video.dispatchEvent(new Event('timeupdate'));
    video.dispatchEvent(new Event('pause'));
  });
  expect(timecode()).toBe('00:00:21');
});
