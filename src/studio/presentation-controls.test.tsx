// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import StudioApp from './StudioApp';
import { createAction } from './core/catalog';
import { createEmptyProject } from './core/project';
import { AUTHORING_PROTOCOL } from './core/protocol';
import type { Project } from './core/types';
import type { RenderJob } from './api';
import { saveProject } from './storage';

vi.mock('./blocks/StudioBlocks', () => ({ StudioBlocks: () => <div /> }));
vi.mock('@xzdarcy/react-timeline-editor', () => ({ Timeline: () => <div /> }));
vi.mock('./previews', () => ({ builtinPreview: (_project: Project, revision: string) => ({
  url: '/initial.mp4', revision, quality: 'preview', format: 'mp4',
}) }));
const { renderVideo } = vi.hoisted(() => ({ renderVideo: vi.fn<(_project: Project, _quality: string, revision: string) => Promise<RenderJob>>() }));
vi.mock('./api', () => ({
  api: async () => ({ available: true, authoringProtocol: AUTHORING_PROTOCOL }),
  startRender: renderVideo,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  localStorage.clear();
  saveProject({ ...createEmptyProject(), actions: [
    createAction('circle', { name: '圆', duration: 1 }), createAction('wait', { duration: 1 }),
    createAction('square', { name: '方', duration: 1 }), createAction('wait', { duration: 1 }),
  ] });
  renderVideo.mockReset().mockImplementation(async (_project, _quality, revision) => ({
    id: 'rendered', status: 'done', videoUrl: '/updated.mp4', revision,
  }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  host = document.body.appendChild(document.createElement('div')); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const overlay = () => host.querySelector<HTMLElement>('.presentation-overlay');
const step = () => host.querySelector('.presentation-step-badge')?.textContent;
async function mountAndEnter() {
  await act(async () => root.render(<StudioApp />));
  await act(async () => button('演播模式').click());
  expect(overlay()).not.toBeNull();
}
async function press(target: HTMLElement, key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...options });
  await act(async () => { target.dispatchEvent(event); });
  return event;
}

it.each(['退出演播', '上一步', '步骤 1'])('leaves Space activation to the focused %s button', async label => {
  await mountAndEnter();
  await act(async () => button('步骤 2').click());
  const target = button(label); target.focus();
  const event = await press(target, ' ', { code: 'Space' });
  expect(event.defaultPrevented).toBe(false);
  expect(step()).toBe('2 / 2');
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  // jsdom has no native keyboard activation. Verify the click left available
  // by the unconsumed Space still performs the focused button's own action.
  await act(async () => target.click());
  if (label === '退出演播') expect(overlay()).toBeNull();
  else expect(step()).toBe('1 / 2');
});

it('advances from the presentation background but ignores repeated, composing and modified keys', async () => {
  await mountAndEnter();
  const surface = overlay()!;
  for (const options of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    for (const key of [' ', 'ArrowRight', 'Escape']) {
      const event = await press(surface, key, options);
      expect(event.defaultPrevented).toBe(false);
    }
  }
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect((await press(surface, ' ', { code: 'Space' })).defaultPrevented).toBe(true);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  expect(step()).toBe('1 / 2');
  await press(surface, 'ArrowRight');
  expect(step()).toBe('2 / 2');
  await press(surface, 'ArrowLeft');
  expect(step()).toBe('1 / 2');
  await press(surface, 'Escape');
  expect(overlay()).toBeNull();
});

it('blocks stale previews in both entry points and permits the newly rendered project', async () => {
  await act(async () => root.render(<StudioApp />));
  const aspect = host.querySelector<HTMLSelectElement>('.stage-hud-select')!;
  await act(async () => { aspect.value = '1080x1920'; aspect.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(button('演播模式').disabled).toBe(true);
  expect(button('演播模式').title).toContain('更新预览');
  await act(async () => button('全局命令面板').click());
  const command = [...host.querySelectorAll<HTMLButtonElement>('.cmd-palette-item')].find(el => el.textContent?.includes('开启交互式演播模式'))!;
  await act(async () => command.click());
  expect(overlay()).toBeNull();
  expect(host.querySelector('.studio-toast')?.textContent).toContain('更新预览');
  await act(async () => host.querySelector<HTMLButtonElement>('.preview-button')!.click());
  expect(renderVideo).toHaveBeenCalledOnce();
  expect(button('演播模式').disabled).toBe(false);
  await act(async () => button('演播模式').click());
  expect(overlay()?.querySelector('video')?.getAttribute('src')).toBe('/updated.mp4');
});

it('ends the current presentation if an already running render replaces its video', async () => {
  let finish!: (job: RenderJob) => void;
  renderVideo.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => root.render(<StudioApp />));
  await act(async () => host.querySelector<HTMLButtonElement>('.preview-button')!.click());
  const revision = renderVideo.mock.calls[0][2];
  await act(async () => button('演播模式').click());
  expect(overlay()).not.toBeNull();
  await act(async () => finish({ id: 'updated', status: 'done', videoUrl: '/updated.mp4', revision }));
  expect(overlay()).toBeNull();
  expect(host.querySelector('.studio-toast')?.textContent).toContain('重新开启演播');
  await act(async () => button('演播模式').click());
  expect(overlay()?.querySelector('video')?.getAttribute('src')).toBe('/updated.mp4');
});

it('keeps marker-only edits eligible for presentation without rerendering', async () => {
  await act(async () => root.render(<StudioApp />));
  const timelineTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(el => el.textContent?.includes('时间轴'))!;
  await act(async () => timelineTab.click());
  await act(async () => { await vi.dynamicImportSettled(); });
  await act(async () => button('添加时间轴标记').click());
  expect(host.querySelector('.tmb-pill')).not.toBeNull();
  expect(button('演播模式').disabled).toBe(false);
  await act(async () => button('演播模式').click());
  expect(overlay()).not.toBeNull();
  expect(renderVideo).not.toHaveBeenCalled();
});

it('ends presentation if the project changes while its overlay is open', async () => {
  await mountAndEnter();
  const aspect = host.querySelector<HTMLSelectElement>('.stage-hud-select')!;
  await act(async () => { aspect.value = '1080x1920'; aspect.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(overlay()).toBeNull();
  expect(button('演播模式').disabled).toBe(true);
});

it('stays on the same chapter when playback is rejected and allows retry', async () => {
  await mountAndEnter();
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('Playback blocked', 'NotAllowedError'));
  await press(overlay()!, ' ');
  expect(host.querySelector('.presentation-btn.primary .lucide-pause')).toBeNull();
  expect(host.querySelector('.studio-toast')?.textContent).toContain('重试');
  await act(async () => button('下一步').click());
  expect(step()).toBe('1 / 2');
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  expect(host.querySelector('.presentation-btn.primary .lucide-pause')).not.toBeNull();
});
