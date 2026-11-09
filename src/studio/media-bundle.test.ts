import { expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createEmptyProject } from './core/project';
import { downloadProjectBundle, packProject, unpackProject } from './media-bundle';
import { createAction } from './core/catalog';
it('saves an unfinished draft but refuses to call it a runnable source export', () => {
  const p = createEmptyProject();
  p.actions = [createAction('shift', { target: '不存在' })];
  const draft = unpackProject(packProject(p, {}));
  expect(draft.project).toEqual(p);
  expect(draft.files['scene.py']).toBeUndefined();
  expect(() => packProject(p, {}, { requireSource: true })).toThrow('不存在');
});
it('rejects invalid source before fetching media or starting a download', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  try {
    const p = createEmptyProject(); p.actions = [createAction('shift', { target: '不存在' })];
    await expect(downloadProjectBundle(p, { requireSource: true })).rejects.toThrow('不存在');
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); }
});
it('refuses to export a project JSON larger than the importer accepts', () => {
  expect(() => packProject({ ...createEmptyProject(), workspace: { oversized: 'x'.repeat(8 * 1024 * 1024) } }, {})).toThrow('8 MB');
});
it('roundtrips the editable project, original media and runnable source together', () => {
  const asset = { id: 'a'.repeat(64), name: '主角.png', kind: 'image' as const, extension: 'png', width: 2, height: 2, bytes: 4 };
  const p = { ...createEmptyProject(), assets: [asset] }, path = `assets/${asset.id}.png`, image = new Uint8Array([1, 2, 3, 4]);
  p.scene.markers = [{ id: 'chapter', time: 1.25, label: '证明开始', color: '#38bdf8' }];
  const unpacked = unpackProject(packProject(p, { [path]: image }));
  expect(unpacked.project).toEqual(p); expect(unpacked.files[path]).toEqual(image);
  expect(unpacked.files['scene.py']).toBeDefined();
  expect(() => packProject(p, {})).toThrow('素材缺失');
});
it('rejects traversal, oversized expanded entries and missing referenced assets before import', () => {
  const project = strToU8(JSON.stringify(createEmptyProject()));
  expect(() => unpackProject(zipSync({ 'project.anyvis.json': project, '../escape.py': strToU8('bad') }))).toThrow('无效路径');
  expect(() => unpackProject(zipSync({ 'scene.py': strToU8('bad') }))).toThrow('缺少项目');
  const p = { ...createEmptyProject(), assets: [{ id: 'b'.repeat(64), name: '配音.wav', kind: 'audio', extension: 'wav', duration: 1, bytes: 10 }] };
  expect(() => unpackProject(zipSync({ 'project.anyvis.json': strToU8(JSON.stringify(p)) }))).toThrow('素材缺失');
});
