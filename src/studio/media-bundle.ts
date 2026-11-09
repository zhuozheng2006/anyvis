import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import type { MediaAsset, Project } from './core/types';
import { validateProject } from './core/project';
import { assetPath } from './core/assets';
import { exportStandalonePython } from './core/export';
import { uploadAsset } from './api';
const LIMIT = 128 * 1024 * 1024;
export interface BundleOptions { requireSource?: boolean }
export function packProject(project: Project, contents: Record<string, Uint8Array>, options: BundleOptions = {}): Uint8Array {
  const files: Record<string, Uint8Array> = { 'project.anyvis.json': strToU8(JSON.stringify(project, null, 2)) };
  if (files['project.anyvis.json'].length > 8 * 1024 * 1024) throw Error('项目文件超过 8 MB，请拆分项目后保存。');
  let total = files['project.anyvis.json'].length;
  for (const asset of project.assets || []) {
    const bytes = contents[assetPath(asset)];
    if (!bytes || bytes.length !== asset.bytes) throw Error(`素材缺失或不完整：${asset.name}`);
    total += bytes.length; if (total > LIMIT) throw Error('素材包超过 128 MB，请拆分项目。');
    files[assetPath(asset)] = bytes;
  }
  // Editable projects may contain drafts with compiler errors; saving must still work.
  try { files['scene.py'] = strToU8(exportStandalonePython(project)); }
  catch (error) { if (options.requireSource) throw error; }
  files['README.txt'] = strToU8('AnyVis 项目与原始素材\n请在 AnyVis 中导入整个 ZIP，以恢复图片和配音。\n'
    + (files['scene.py'] ? '可在解压目录运行：python -m manim render scene.py AnyVisScene\n需要相同版本的 Manim、字体和公式工具。\n' : '当前草稿含未完成或错误的动画，已保留可编辑工程，未生成 scene.py。请在 AnyVis 中修正后重新导出源码。\n'));
  const archive = zipSync(files, { level: 0 });
  // Include source, README and ZIP headers: every exported bundle must fit the importer.
  if (archive.length > LIMIT) throw Error('素材包超过 128 MB，请拆分项目。');
  return archive;
}
export function unpackProject(bytes: Uint8Array): { project: Project; files: Record<string, Uint8Array> } {
  if (bytes.length > LIMIT) throw Error('素材包超过 128 MB。');
  let total = 0, count = 0, invalid = false;
  const files = unzipSync(bytes, { filter: file => {
    total += file.originalSize; count++;
    const allowed = ['project.anyvis.json', 'scene.py', 'README.txt'].includes(file.name) || /^assets\/[a-f0-9]{64}\.(png|jpg|webp|svg|wav|mp3|ogg|m4a|flac)$/.test(file.name);
    if (!allowed || total > LIMIT || count > 103 || file.originalSize > 64 * 1024 * 1024) { invalid = true; return false; }
    return true;
  } });
  if (invalid || !files['project.anyvis.json'] || files['project.anyvis.json'].length > 8 * 1024 * 1024) throw Error('素材包包含无效路径、过大文件或缺少项目。');
  const project = validateProject(JSON.parse(strFromU8(files['project.anyvis.json'])));
  for (const asset of project.assets || []) if (files[assetPath(asset)]?.length !== asset.bytes) throw Error(`素材缺失或不完整：${asset.name}`);
  return { project, files };
}
export async function downloadProjectBundle(project: Project, options: BundleOptions = {}) {
  // Source export must fail explicitly, before downloading potentially large media.
  if (options.requireSource) exportStandalonePython(project);
  const contents: Record<string, Uint8Array> = {};
  if ((project.assets || []).reduce((n, a) => n + a.bytes, 0) > LIMIT) throw Error('素材包超过 128 MB，请拆分项目。');
  for (const asset of project.assets || []) {
    const response = await fetch(`/api/assets/${asset.id}/file`);
    if (!response.ok) throw Error(`无法读取素材：${asset.name}，请重新上传。`);
    contents[assetPath(asset)] = new Uint8Array(await response.arrayBuffer());
  }
  const bytes = packProject(project, contents, options);
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'application/zip' }));
  const link = document.createElement('a'); link.href = url; link.download = `${project.name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 90) || 'AnyVis'}.anyvis.zip`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importProjectBundle(file: File): Promise<Project> {
  if (file.size > LIMIT) throw Error('素材包超过 128 MB。');
  const { project, files } = unpackProject(new Uint8Array(await file.arrayBuffer()));
  // Check all content hashes before uploading any files. Server validates actual media.
  for (const asset of project.assets || []) {
    const digest = await crypto.subtle.digest('SHA-256', files[assetPath(asset)].slice().buffer);
    if ([...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('') !== asset.id) throw Error(`素材校验失败：${asset.name}`);
  }
  const assets: MediaAsset[] = [];
  for (const asset of project.assets || []) {
    const uploaded = await uploadAsset(new File([files[assetPath(asset)].slice().buffer], `asset.${asset.extension}`));
    if (uploaded.id !== asset.id) throw Error(`素材校验失败：${asset.name}`);
    assets.push({ ...uploaded, name: asset.name });
  }
  return { ...project, assets };
}
