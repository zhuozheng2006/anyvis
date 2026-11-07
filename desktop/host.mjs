/** Electron-independent lifecycle and request policy, also exercised by Node tests. */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const EDITOR_URL = 'anyvis://studio/';
export const SETTINGS_URL = 'anyvis://desktop/settings.html';
const DESKTOP_FILES = new Map([
  ['/settings.html', 'text/html; charset=utf-8'], ['/settings.js', 'text/javascript; charset=utf-8'],
  ['/settings.css', 'text/css; charset=utf-8'],
]);

export function isEditorURL(value) {
  try { const url = new URL(value); return url.protocol === 'anyvis:' && url.hostname === 'studio' && !url.port && !url.username && !url.password; }
  catch { return false; }
}
export function isSettingsURL(value) {
  try { const url = new URL(value); return url.href === SETTINGS_URL; } catch { return false; }
}
export function externalURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function allowClipboardWrite(permission, pageURL, requestingURL) {
  if (permission !== 'clipboard-sanitized-write') return false;
  return (isEditorURL(pageURL) && isEditorURL(requestingURL)) || (isSettingsURL(pageURL) && isSettingsURL(requestingURL));
}

export function normalizeSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('设置格式无效。');
  if (value.pythonPath !== undefined && typeof value.pythonPath !== 'string') throw new Error('Python 路径必须为文字。');
  const pythonPath = typeof value.pythonPath === 'string' ? value.pythonPath.trim() : '';
  if (pythonPath && (!path.isAbsolute(pythonPath) || pythonPath.includes('\0') || pythonPath.length > 4096)) {
    throw new Error('请选择 Python 可执行文件的完整路径；不要填写命令参数。');
  }
  return { version: 1, pythonPath };
}

export function createSettingsStore(userData) {
  const filename = path.join(userData, 'desktop-settings.json');
  return {
    filename,
    async read() {
      try { return { settings: normalizeSettings(JSON.parse(await readFile(filename, 'utf8'))) }; }
      catch (error) {
        return { settings: normalizeSettings({}), warning: error.code === 'ENOENT' ? undefined : '桌面设置无法读取，已使用自动检测。原文件保留；保存新设置后才会替换。' };
      }
    },
    async save(value) {
      const settings = normalizeSettings(value);
      if (settings.pythonPath) {
        let file;
        try { file = await stat(settings.pythonPath); } catch { throw new Error('找不到这个 Python 文件，请重新选择。'); }
        if (!file.isFile()) throw new Error('请选择 Python 可执行文件，而不是文件夹。');
      }
      await mkdir(userData, { recursive: true });
      const temporary = `${filename}.tmp`;
      await writeFile(temporary, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
      await rename(temporary, filename);
      return settings;
    },
  };
}

/** Serialize restarts. A late start cannot resurrect a server after quit/retry. */
export function createEngineController({ createServer, paths, onState = () => {} }) {
  let current = null; let queue = Promise.resolve(); let generation = 0; let closed = false;
  return {
    get service() { return current; },
    restart(settings = {}) {
      const revision = ++generation;
      const operation = queue.catch(() => {}).then(async () => {
        if (closed || revision !== generation) throw Object.assign(new Error('启动已取消。'), { name: 'AbortError' });
        if (current) { const previous = current; current = null; await previous.close(); }
        onState({ state: 'starting', error: null });
        try {
          const service = await createServer({ ...paths, port: 0, pythonPath: settings.pythonPath || undefined });
          if (closed || revision !== generation) {
            await service.close();
            throw Object.assign(new Error('启动已取消。'), { name: 'AbortError' });
          }
          current = service;
          onState({ state: 'ready', error: null });
          return service;
        } catch (error) {
          if (!closed && revision === generation) onState({ state: 'error', error: error.message || '本地引擎无法启动。' });
          throw error;
        }
      });
      queue = operation;
      return operation;
    },
    async close() {
      closed = true; generation++;
      await queue.catch(() => {});
      if (current) { const previous = current; current = null; await previous.close(); }
    },
  };
}

/** Stable renderer origin keeps projects across launches with random loopback ports. */
export function createProtocolHandler({ getServiceURL, desktopRoot, fetchLocal }) {
  return async request => {
    let url;
    try { url = new URL(request.url); } catch { return new Response('无效地址', { status: 400 }); }
    if (url.protocol !== 'anyvis:' || url.username || url.password || url.port) return new Response('禁止访问', { status: 403 });
    if (url.hostname === 'desktop') {
      const type = DESKTOP_FILES.get(url.pathname);
      if (!type || !['GET', 'HEAD'].includes(request.method)) return new Response('文件不存在', { status: 404 });
      try {
        const data = await readFile(path.join(desktopRoot, url.pathname.slice(1)));
        return new Response(request.method === 'HEAD' ? null : data, { headers: {
          'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        } });
      } catch { return new Response('设置页面缺失，请重新安装 AnyVis。', { status: 503 }); }
    }
    if (!isEditorURL(request.url)) return new Response('禁止访问', { status: 403 });
    const base = getServiceURL();
    if (!base) return new Response('本地引擎尚未启动。请在“运行环境”菜单重试。', { status: 503 });
    const service = new URL(base);
    if (service.protocol !== 'http:' || service.hostname !== '127.0.0.1' || !service.port || service.username || service.password) return new Response('无效的本地服务地址', { status: 503 });
    if (!['GET', 'HEAD', 'POST', 'DELETE'].includes(request.method)) return new Response('请求方式不允许', { status: 405 });
    const headers = new Headers();
    for (const name of ['content-type', 'range', 'x-anyvis-token']) {
      const value = request.headers.get(name); if (value) headers.set(name, value);
    }
    // Never forward the custom scheme's Origin/Host, cookies, or an arbitrary URL.
    const target = new URL(url.pathname + url.search, base);
    if (target.origin !== new URL(base).origin) return new Response('禁止访问', { status: 403 });
    let body;
    if (['POST', 'DELETE'].includes(request.method)) {
      body = await request.arrayBuffer();
      const mediaUpload = request.method === 'POST' && url.pathname === '/api/assets';
      const limit = (mediaUpload ? 64 : 2) * 1024 * 1024;
      if (body.byteLength > limit) return new Response(mediaUpload ? '素材超过 64 MB。' : '请求超过 2 MB。', { status: 413 });
    }
    try { return await fetchLocal(target.href, { method: request.method, headers, body, redirect: 'manual', signal: request.signal }); }
    catch { return new Response('本地引擎连接中断。请在“运行环境”菜单重试。', { status: 503 }); }
  };
}
