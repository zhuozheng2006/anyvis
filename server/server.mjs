import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile, stat, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = path.join(ROOT, 'server', 'worker.py');
const EVENT_PREFIX = 'ANYVIS_EVENT ';
const MAX_BODY = 2 * 1024 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webm': 'video/webm', '.mp4': 'video/mp4', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' };

function json(res, status, data) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

export function parseRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return false;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return false;
  return { start, end };
}

async function serveFile(req, res, filename, contentType, downloadable = false) {
  let metadata;
  try { metadata = await stat(filename); } catch { return json(res, 404, { error: '文件不存在或已清理，请重新预览。' }); }
  if (!metadata.isFile()) return json(res, 404, { error: '文件不存在。' });
  const range = parseRange(req.headers.range, metadata.size);
  if (range === false) {
    res.writeHead(416, { 'Content-Range': `bytes */${metadata.size}` }); res.end(); return;
  }
  const headers = { 'Content-Type': contentType || MIME[path.extname(filename)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': path.basename(filename) === 'preview.png' ? 'no-store' : 'private, max-age=3600' };
  if (downloadable) headers['Content-Disposition'] = `attachment; filename="AnyVis${path.extname(filename)}"`;
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${metadata.size}`;
    headers['Content-Length'] = range.end - range.start + 1;
  } else headers['Content-Length'] = metadata.size;
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = createReadStream(filename, range || undefined);
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

async function readJson(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw Object.assign(new Error('请求必须使用 application/json。'), { status: 415 });
  }
  let size = 0; const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > MAX_BODY) throw Object.assign(new Error('项目超过 2 MB，请减少积木或拆分场景。'), { status: 413 });
    parts.push(part);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw Object.assign(new Error('项目 JSON 无法解析。'), { status: 400 }); }
}

function workerEnvironment(python) {
  const additions = [path.dirname(python), '/Library/TeX/texbin'].filter(p => path.isAbsolute(p) && existsSync(p));
  return { ...process.env, PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1', PATH: [...additions, process.env.PATH || ''].join(path.delimiter) };
}

function probePython(python) {
  return new Promise(resolve => {
    let output = ''; let settled = false;
    const child = spawn(python, [WORKER, '--health'], { cwd: ROOT, env: workerEnvironment(python), windowsHide: true });
    const finish = data => { if (!settled) { settled = true; clearTimeout(timer); resolve(data); } };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(null); }, 15_000);
    child.stdout.on('data', data => { output = (output + data.toString()).slice(-100_000); });
    child.stderr.on('data', () => {});
    child.on('error', () => finish(null));
    child.on('close', () => {
      const line = output.split(/\r?\n/).findLast(value => value.startsWith(EVENT_PREFIX));
      try { finish(line ? { ...JSON.parse(line.slice(EVENT_PREFIX.length)), python } : null); }
      catch { finish(null); }
    });
  });
}

export async function discoverPython() {
  const executable = process.platform === 'win32' ? 'python.exe' : 'bin/python';
  const candidates = [process.env.ANYVIS_PYTHON, path.join(ROOT, '.runtime', executable),
    ...['miniconda3', 'anaconda3', 'miniforge3', 'mambaforge'].map(folder => path.join(homedir(), folder, 'envs', 'manim', executable)),
    'python3', 'python'].filter(Boolean);
  let last;
  for (const candidate of new Set(candidates)) {
    if (path.isAbsolute(candidate) && !existsSync(candidate)) continue;
    const result = await probePython(candidate);
    if (result?.available) return result;
    if (result) last = result;
    if (process.env.ANYVIS_PYTHON === candidate) break;
  }
  return { available: false, error: last?.error || '没有找到可用的 Manim 环境。可设置 ANYVIS_PYTHON 为已安装 Manim 的 Python 路径。', capabilities: {} };
}

export async function createAnyVisServer(options = {}) {
  const cacheRoot = options.cacheRoot || path.join(ROOT, '.anyvis-cache');
  await mkdir(cacheRoot, { recursive: true });
  const token = randomBytes(32).toString('hex');
  const requestedPort = options.port ?? Number(process.env.ANYVIS_PORT || 4317);
  const uiPort = Number(process.env.ANYVIS_UI_PORT || 5174);
  let actualPort = requestedPort;
  const jobs = new Map(); const pending = [];
  let running = null; let stopped = false;
  let health = { available: false, checking: true, message: '正在检查 Manim 运行环境…', capabilities: {} };
  const healthPromise = (options.health ? Promise.resolve(options.health) : discoverPython()).then(result => { health = { ...result, checking: false }; return health; });

  function validOrigin(req) {
    const allowedPorts = new Set([actualPort, requestedPort, uiPort].map(String));
    const allowed = value => {
      try {
        const url = new URL(value);
        return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && allowedPorts.has(url.port || (url.protocol === 'https:' ? '443' : '80')) && ['http:', 'https:'].includes(url.protocol);
      } catch { return false; }
    };
    if (!allowed(`http://${req.headers.host || ''}`)) return false;
    if (req.headers.origin && !allowed(req.headers.origin)) return false;
    return !['cross-site'].includes(req.headers['sec-fetch-site']);
  }

  function authorized(req) {
    const supplied = req.headers['x-anyvis-token'];
    if (typeof supplied !== 'string') return false;
    const bytes = Buffer.from(supplied);
    return bytes.length === token.length && timingSafeEqual(bytes, Buffer.from(token));
  }

  function publicJob(job) {
    return { id: job.id, status: job.status, progress: job.progress, message: job.message, revision: job.revision,
      quality: job.quality, videoUrl: job.videoUrl, posterUrl: job.posterUrl, duration: job.duration,
      error: job.error, blockId: job.blockId, details: job.details, source: job.code,
      format: job.format, width: job.width, height: job.height, fps: job.fps, cached: job.cached || false,
      createdAt: job.createdAt, completedAt: job.completedAt };
  }

  function terminate(job) {
    if (!job.child || job.child.exitCode !== null) return;
    try {
      if (process.platform !== 'win32') process.kill(-job.child.pid, 'SIGTERM');
      else job.child.kill('SIGTERM');
    } catch { job.child.kill('SIGTERM'); }
    const timer = setTimeout(() => {
      try {
        if (process.platform !== 'win32') process.kill(-job.child.pid, 'SIGKILL');
        else job.child.kill('SIGKILL');
      } catch { /* already finished */ }
    }, 1000);
    timer.unref();
  }

  function cancel(job, message = '已停止渲染') {
    if (['done', 'error', 'cancelled'].includes(job.status)) return;
    job.status = 'cancelled'; job.message = message; job.completedAt = Date.now();
    terminate(job);
  }

  function mappedBlock(job, line) {
    if (!line) return undefined;
    const closest = Object.keys(job.sourceMap).map(Number).filter(n => n <= line).sort((a, b) => b - a)[0];
    return closest == null ? undefined : job.sourceMap[closest];
  }

  async function cleanup() {
    const finished = [...jobs.values()].filter(job => ['done', 'error', 'cancelled'].includes(job.status)).sort((a, b) => b.createdAt - a.createdAt);
    let retainedBytes = 0;
    for (const [index, job] of finished.entries()) {
      let bytes = 0;
      for (const name of ['video.mp4', 'video.webm', 'poster.png', 'preview.png', 'scene.py', 'render.log', 'job.json']) {
        bytes += await stat(path.join(job.directory, name)).then(value => value.size, () => 0);
      }
      // Keep the newest output even if it alone exceeds the soft cache budget.
      if (index >= 18 || (index > 0 && retainedBytes + bytes > 512 * 1024 * 1024)) {
        jobs.delete(job.id);
        await rm(job.directory, { recursive: true, force: true }).catch(() => {});
      } else retainedBytes += bytes;
    }
  }

  function schedule() {
    if (stopped || running) return;
    let job;
    while (pending.length && !job) {
      const candidate = pending.shift();
      if (candidate.status === 'queued') job = candidate;
    }
    if (!job) return;
    running = job; job.status = 'running'; job.message = '正在启动 Manim…'; job.progress = 0.01;
    const child = spawn(health.python, [WORKER, job.directory], { cwd: job.directory, env: workerEnvironment(health.python), detached: process.platform !== 'win32', windowsHide: true });
    job.child = child;
    let buffer = ''; let logs = ''; let finalized = false;
    const timeoutMs = job.quality === 'final' ? 600_000 : 120_000;
    const timeout = setTimeout(() => {
      if (job.status === 'running') {
        job.status = 'error'; job.error = `渲染超过 ${timeoutMs / 1000} 秒。请减少曲线采样或缩短场景后重试。`; job.message = '渲染超时'; terminate(job);
      }
    }, timeoutMs);
    timeout.unref();
    const handle = event => {
      if (job.status !== 'running') return;
      if (event.event === 'progress') {
        job.progress = Math.max(job.progress, Math.min(0.99, Number(event.progress) || 0));
        job.message = event.message || job.message;
      } else if (event.event === 'preview') {
        job.posterUrl = `/api/media/${job.id}/preview.png?frame=${Number(event.frame) || 0}`;
      } else if (event.event === 'error') {
        job.status = 'error'; job.error = event.error; job.message = '渲染遇到问题'; job.details = event.details;
        job.blockId = mappedBlock(job, event.line);
      } else if (event.event === 'done') {
        if (!['video.mp4', 'video.webm'].includes(event.filename) || event.poster !== 'poster.png') return;
        job.status = 'done'; job.progress = 1; job.message = '预览已更新'; job.duration = event.duration;
        job.videoUrl = `/api/media/${job.id}/${event.filename}`; job.posterUrl = `/api/media/${job.id}/poster.png`;
        job.format = event.filename.endsWith('.mp4') ? 'mp4' : 'webm'; job.width = event.width; job.height = event.height; job.fps = event.fps;
      }
    };
    child.stdout.on('data', data => {
      const text = data.toString(); logs = (logs + text).slice(-32_000); buffer += text;
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
        if (line.startsWith(EVENT_PREFIX)) { try { handle(JSON.parse(line.slice(EVENT_PREFIX.length))); } catch { /* keep ordinary render logs */ } }
      }
      if (buffer.length > 64_000) buffer = buffer.slice(-32_000);
    });
    child.stderr.on('data', data => { logs = (logs + data.toString()).slice(-32_000); });
    const finish = async error => {
      if (finalized) return; finalized = true; clearTimeout(timeout);
      if (job.status === 'running') { job.status = 'error'; job.error = error || '渲染进程提前退出。'; job.message = '渲染未完成'; job.details = logs.slice(-12_000); }
      job.completedAt = Date.now(); job.child = null;
      await writeFile(path.join(job.directory, 'render.log'), logs).catch(() => {});
      await rm(path.join(job.directory, 'media'), { recursive: true, force: true }).catch(() => {});
      running = null; schedule(); void cleanup();
    };
    child.on('error', error => void finish(error.message));
    child.on('close', code => void finish(code ? `Manim 退出码：${code}` : undefined));
  }

  async function submit(body) {
    await healthPromise;
    if (!health.available) throw Object.assign(new Error(health.error || 'Manim 尚不可用。'), { status: 503 });
    const { validateProject } = await import('../src/studio/core/project.ts');
    const { compileProject } = await import('../src/studio/core/compiler.ts');
    const project = validateProject(body.project);
    const compiled = compileProject(project);
    const errors = compiled.diagnostics.filter(d => d.severity === 'error');
    if (errors.length) throw Object.assign(new Error(errors.map(d => d.message).join('\n')), { status: 422, blockId: errors[0].blockId, diagnostics: errors });
    if (compiled.requiresTrust && body.trustCode !== true) throw Object.assign(new Error('这个项目含有 Python 扩展。请先阅读代码，再明确启用。'), { status: 403, requiresTrust: true });
    const quality = body.quality === 'final' ? 'final' : 'preview';
    const revision = String(body.revision ?? '').slice(0, 128);
    const scene = project.scene;
    const scale = quality === 'preview' ? Math.min(1, 960 / scene.width, 540 / scene.height) : 1;
    const width = Math.max(2, Math.round(scene.width * scale / 2) * 2);
    const height = Math.max(2, Math.round(scene.height * scale / 2) * 2);
    const digest = createHash('sha256').update(JSON.stringify({ code: compiled.code, width, height, fps: scene.fps, background: scene.background, version: health.version })).digest('hex');
    const cached = [...jobs.values()].find(job => job.status === 'done' && job.digest === digest);
    if (cached && existsSync(path.join(cached.directory, `video.${cached.format}`))) {
      cached.revision = revision; cached.cached = true; cached.quality = quality; return cached;
    }
    for (const job of jobs.values()) {
      if (quality === 'preview' && job.quality === 'preview' && job.projectId === project.id && ['queued', 'running'].includes(job.status)) cancel(job, '新的修改已替代此预览');
    }
    if (pending.filter(job => job.status === 'queued').length >= 3) throw Object.assign(new Error('已有多个渲染任务，请等待或停止当前任务。'), { status: 429 });
    const id = randomUUID(); const directory = path.join(cacheRoot, id);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'scene.py'), compiled.code, 'utf8');
    await writeFile(path.join(directory, 'job.json'), JSON.stringify({ width, height, frameAspect: scene.width / scene.height, fps: scene.fps, background: scene.background, duration: compiled.duration }), 'utf8');
    const job = { id, directory, digest, projectId: project.id, status: 'queued', progress: 0, message: running ? '等待前一个任务完成…' : '准备渲染…', revision, quality, createdAt: Date.now(), code: compiled.code, sourceMap: compiled.sourceMap, duration: compiled.duration, width, height, fps: scene.fps };
    jobs.set(id, job); pending.push(job); schedule(); return job;
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (!validOrigin(req)) return json(res, 403, { error: '仅允许本机 AnyVis 页面访问。' });
      let url;
      try { url = new URL(req.url, 'http://127.0.0.1'); } catch { return json(res, 400, { error: '无效地址。' }); }
      const pathname = url.pathname;
      if (pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD', 'POST', 'DELETE'].includes(req.method)) return json(res, 405, { error: '不支持的请求方式。' });
        if (['POST', 'DELETE'].includes(req.method) && !authorized(req)) return json(res, 403, { error: '会话已过期，请刷新页面。' });
        if (pathname === '/api/session' && req.method === 'GET') return json(res, 200, { token });
        if (pathname === '/api/health' && req.method === 'GET') return json(res, 200, health);
        if (pathname === '/api/render' && req.method === 'POST') return json(res, 202, publicJob(await submit(await readJson(req))));
        if (pathname === '/api/ai' && req.method === 'POST') {
          const body = await readJson(req);
          const { generateProject } = await import('../desktop/ai-proxy.mjs');
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 90_000);
          res.once('close', () => { if (!res.writableEnded) controller.abort(); });
          try { return json(res, 200, await generateProject(body, { signal: controller.signal })); }
          finally { clearTimeout(timer); }
        }
        const jobMatch = /^\/api\/jobs\/([\w-]+)$/.exec(pathname);
        if (jobMatch) {
          const job = jobs.get(jobMatch[1]);
          if (!job) return json(res, 404, { error: '任务不存在，请重新预览。' });
          if (req.method === 'DELETE') cancel(job);
          else if (req.method !== 'GET') return json(res, 405, { error: '不支持的请求方式。' });
          return json(res, 200, publicJob(job));
        }
        const mediaMatch = /^\/api\/media\/([\w-]+)\/(video\.(?:mp4|webm)|poster\.png|preview\.png)$/.exec(pathname);
        if (mediaMatch && ['GET', 'HEAD'].includes(req.method)) {
          const job = jobs.get(mediaMatch[1]);
          if (!job || (job.status !== 'done' && !(mediaMatch[2] === 'preview.png' && ['running', 'error', 'cancelled'].includes(job.status)))) return json(res, 404, { error: '画面尚未生成，请先预览。' });
          return await serveFile(req, res, path.join(job.directory, mediaMatch[2]), undefined, url.searchParams.has('download'));
        }
        return json(res, 404, { error: '接口不存在。' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: '不支持的请求方式。' });
      const dist = path.join(ROOT, 'dist');
      let decoded;
      try { decoded = decodeURIComponent(pathname); } catch { return json(res, 400, { error: '无效地址。' }); }
      const candidate = path.resolve(dist, '.' + decoded);
      if (!candidate.startsWith(dist + path.sep) && candidate !== dist) return json(res, 403, { error: '路径不允许。' });
      const filename = existsSync(candidate) && (await stat(candidate)).isFile() ? candidate : path.join(dist, 'index.html');
      if (!existsSync(filename)) return json(res, 503, { error: '前端尚未构建。请运行 npm run build，或使用开发启动器。' });
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
      return await serveFile(req, res, filename);
    } catch (error) {
      return json(res, Number.isInteger(error.status) ? error.status : 400, { error: error.message || '请求失败。', blockId: error.blockId, requiresTrust: error.requiresTrust, diagnostics: error.diagnostics });
    }
  });
  server.requestTimeout = 130_000;
  server.headersTimeout = 10_000;
  if (options.listen !== false) {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(requestedPort, '127.0.0.1', resolve); });
    actualPort = server.address().port;
  }
  async function close() {
    stopped = true;
    const live = [...jobs.values()].map(job => job.child).filter(child => child && child.exitCode === null);
    for (const job of jobs.values()) cancel(job, '服务正在关闭');
    await Promise.all(live.map(child => new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
      const timer = setTimeout(resolve, 1800);
      child.once('close', () => { clearTimeout(timer); resolve(); });
    })));
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
  return { server, port: actualPort, close, healthPromise, cacheRoot };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const app = await createAnyVisServer();
  console.log(`AnyVis engine: http://127.0.0.1:${app.port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
