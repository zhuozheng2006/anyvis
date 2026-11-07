import { expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createEmptyProject } from './core/project';
import { packProject, unpackProject } from './media-bundle';
it('roundtrips the editable project, original media and runnable source together', () => {
  const asset = { id: 'a'.repeat(64), name: '主角.png', kind: 'image' as const, extension: 'png', width: 2, height: 2, bytes: 4 };
  const p = { ...createEmptyProject(), assets: [asset] }, path = `assets/${asset.id}.png`, image = new Uint8Array([1, 2, 3, 4]);
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
