import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export const MAX_ASSET_BYTES = 64 * 1024 * 1024;
export const ASSET_ID = /^[a-f0-9]{64}$/;
export const ASSET_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac' };
const error = (message, status = 400) => Object.assign(new Error(message), { status });
export async function readAssetBody(req) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_ASSET_BYTES) throw error('单个素材最大 64 MB。', 413);
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_ASSET_BYTES) throw error('单个素材最大 64 MB。', 413);
    chunks.push(chunk);
  }
  if (!size) throw error('素材文件为空。');
  return Buffer.concat(chunks);
}
export function createAssetStore(root, probe) {
  const get = async id => {
    if (!ASSET_ID.test(id)) throw error('素材 ID 无效。');
    try {
      const asset = JSON.parse(await readFile(path.join(root, `${id}.json`), 'utf8'));
      if (asset.id !== id || !ASSET_MIME[asset.extension]) throw error('素材索引损坏。');
      const filename = path.join(root, `${id}.${asset.extension}`);
      if ((await stat(filename)).size !== asset.bytes) throw error('素材文件不完整。');
      return { asset, filename };
    } catch { throw error('素材缺失，请重新上传对应的图片或配音。', 404); }
  };
  return {
    get,
    async import(bytes, name) {
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_ASSET_BYTES) throw error('素材为空或超过 64 MB。', 413);
      const extension = path.extname(name).slice(1).toLowerCase().replace('jpeg', 'jpg');
      if (!ASSET_MIME[extension]) throw error('支持 PNG、JPEG、WebP、SVG 图片和 WAV、MP3、M4A、OGG、FLAC 配音。', 415);
      const kind = ASSET_MIME[extension].startsWith('image/') ? 'image' : 'audio';
      await mkdir(root, { recursive: true });
      const temporary = path.join(root, `upload-${randomUUID()}.${extension}`);
      try {
        await writeFile(temporary, bytes, { flag: 'wx' });
        const info = await probe(temporary, kind);
        if (!info || info.kind !== kind || !ASSET_MIME[info.extension]) throw error('无法识别素材格式。');
        const id = createHash('sha256').update(bytes).digest('hex');
        const asset = { id, name: path.basename(name).slice(0, 200) || `素材.${info.extension}`, kind, extension: info.extension, bytes: bytes.length, ...(kind === 'image' ? { width: info.width, height: info.height } : { duration: info.duration }) };
        await rename(temporary, path.join(root, `${id}.${asset.extension}`));
        const metadata = path.join(root, `metadata-${randomUUID()}.json`);
        try { await writeFile(metadata, JSON.stringify(asset)); await rename(metadata, path.join(root, `${id}.json`)); }
        finally { await rm(metadata, { force: true }); }
        return asset;
      } finally { await rm(temporary, { force: true }); }
    },
    async stage(assets, directory) {
      if (!assets.length) return;
      await mkdir(path.join(directory, 'assets'), { recursive: true });
      for (const asset of assets) {
        const stored = await get(asset.id);
        await copyFile(stored.filename, path.join(directory, 'assets', `${asset.id}.${stored.asset.extension}`));
      }
    },
  };
}
