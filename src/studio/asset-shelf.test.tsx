// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AssetShelf } from './AssetShelf';
import { uploadAsset } from './api';
import { createEmptyProject } from './core/project';
import { createAction } from './core/catalog';
import type { MediaAsset, Project } from './core/types';

vi.mock('./api', () => ({ uploadAsset: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const image: MediaAsset = { id: 'a'.repeat(64), name: '图片.png', kind: 'image', extension: 'png', width: 2, height: 2, bytes: 4 };
const voice: MediaAsset = { id: 'b'.repeat(64), name: '配音.wav', kind: 'audio', extension: 'wav', duration: 1, bytes: 4 };
const host = document.createElement('div'); document.body.appendChild(host);
let root = createRoot(host);
afterEach(async () => { await act(async () => root.unmount()); root = createRoot(host); vi.clearAllMocks(); });
const callbacks = () => ({ onProjectChange: vi.fn(), onError: vi.fn(), onClose: vi.fn(), onSelectObject: vi.fn() });
async function chooseFile() {
  const input = host.querySelector('input')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['data'], 'fixture.wav')] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

for (const asset of [image, voice]) it(`rejects adding ${asset.kind} beyond the action limit without changing or closing the project`, async () => {
  const project = { ...createEmptyProject(), assets: [asset], actions: Array.from({ length: 500 }, () => createAction('wait', { duration: 0 })) };
  const props = callbacks();
  await act(async () => root.render(<AssetShelf project={project} {...props} />));
  await act(async () => host.querySelector<HTMLButtonElement>(asset.kind === 'image' ? '.om-asset-btn-primary' : '.om-asset-btn-track')!.click());
  expect(props.onProjectChange).not.toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('500');
});

it('rejects an upload that would exceed the asset limit and retains the saved project', async () => {
  const project = { ...createEmptyProject(), assets: Array.from({ length: 100 }, (_, i) => ({ ...voice, id: i.toString(16).padStart(64, '0') })) };
  vi.mocked(uploadAsset).mockResolvedValue(voice);
  const props = callbacks();
  await act(async () => root.render(<AssetShelf project={project} {...props} />));
  await chooseFile();
  expect(props.onProjectChange).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('100');
});

it('does not commit a newly uploaded image if automatic object creation exceeds the limit', async () => {
  const project = { ...createEmptyProject(), actions: Array.from({ length: 500 }, () => createAction('wait', { duration: 0 })) };
  vi.mocked(uploadAsset).mockResolvedValue(image);
  const props = callbacks();
  await act(async () => root.render(<AssetShelf project={project} {...props} />));
  await chooseFile();
  expect(props.onProjectChange).not.toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('500');
});

it('merges an upload into current edits and ignores a result after switching projects', async () => {
  let resolve!: (asset: MediaAsset) => void;
  vi.mocked(uploadAsset).mockImplementation(() => new Promise(done => { resolve = done; }));
  const props = callbacks();
  const initial = createEmptyProject();
  await act(async () => root.render(<AssetShelf project={initial} {...props} />));
  await chooseFile();
  const edited: Project = { ...initial, name: '编辑期间的新名字', actions: [createAction('wait')] };
  await act(async () => root.render(<AssetShelf project={edited} {...props} />));
  await act(async () => resolve(voice));
  expect(props.onProjectChange.mock.calls[0][0]).toMatchObject({ name: edited.name, actions: edited.actions, assets: [voice] });
  props.onProjectChange.mockClear();
  await chooseFile();
  await act(async () => root.render(<AssetShelf project={createEmptyProject()} {...props} />));
  await act(async () => resolve(voice));
  expect(props.onProjectChange).not.toHaveBeenCalled();
});

it('opens the upload chooser with Enter or Space and prevents duplicate uploads while pending', async () => {
  vi.mocked(uploadAsset).mockImplementation(() => new Promise(() => {}));
  await act(async () => root.render(<AssetShelf project={createEmptyProject()} {...callbacks()} />));
  const input = host.querySelector('input')!;
  const click = vi.spyOn(input, 'click');
  const dropzone = host.querySelector('[role="button"]')!;
  for (const key of ['Enter', ' ']) await act(async () => dropzone.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
  expect(click).toHaveBeenCalledTimes(2);
  await chooseFile();
  await act(async () => dropzone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(click).toHaveBeenCalledTimes(2);
  expect(dropzone.getAttribute('aria-disabled')).toBe('true');
});
