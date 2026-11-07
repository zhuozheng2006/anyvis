import type { MediaAsset } from './types.ts';
export function validateAssets(value: unknown): MediaAsset[] {
  if (!Array.isArray(value) || value.length > 100) throw Error('项目最多包含 100 个素材。');
  const ids = new Set<string>();
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('素材信息无效。');
    const a = raw as Record<string, unknown>;
    if (typeof a.id !== 'string' || !/^[a-f0-9]{64}$/.test(a.id) || ids.has(a.id)) throw Error('素材 ID 无效或重复。');
    ids.add(a.id);
    if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 200) throw Error('素材名称无效。');
    if (typeof a.bytes !== 'number' || !Number.isSafeInteger(a.bytes) || a.bytes < 1 || a.bytes > 64 * 1024 * 1024) throw Error('单个素材最大 64 MB。');
    const allowed = a.kind === 'image' ? ['png', 'jpg', 'webp', 'svg'] : a.kind === 'audio' ? ['wav', 'mp3', 'ogg', 'm4a', 'flac'] : [];
    if (typeof a.extension !== 'string' || !allowed.includes(a.extension)) throw Error('素材类型或扩展名无效。');
    const base = { id: a.id, name: a.name, kind: a.kind as MediaAsset['kind'], extension: a.extension, bytes: a.bytes };
    if (a.kind === 'image') {
      for (const key of ['width', 'height']) if (typeof a[key] !== 'number' || !Number.isInteger(a[key]) || a[key] <= 0 || a[key] > 8192) throw Error('图片尺寸无效。');
      return { ...base, width: a.width as number, height: a.height as number };
    }
    if (typeof a.duration !== 'number' || !Number.isFinite(a.duration) || a.duration <= 0 || a.duration > 7200) throw Error('配音时长无效。');
    return { ...base, duration: a.duration };
  });
}
export const assetPath = (asset: MediaAsset) => `assets/${asset.id}.${asset.extension}`;
