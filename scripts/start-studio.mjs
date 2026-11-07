#!/usr/bin/env node
/** Start AnyVis without changing the user's Python or Conda environment. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
if (args.has('--help')) {
  console.log('AnyVis 启动器\n  node scripts/start-studio.mjs [--production] [--no-open] [--desktop]\n  ANYVIS_PORT：引擎端口，默认 4317\n  ANYVIS_UI_PORT：开发界面端口，默认 5174\n  ANYVIS_PYTHON：可选的 Manim Python 可执行文件');
  process.exit(0);
}
const production = args.has('--production');
const desktop = args.has('--desktop');
if (desktop) {
  // The Electron main process owns its engine; never start a duplicate service.
  const child = spawn(process.execPath, [join(root, 'scripts/launch-desktop.mjs')], { cwd: root, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  const code = await new Promise(resolve => { child.once('error', error => { console.error(error.message); resolve(1); }); child.once('exit', value => resolve(value ?? 1)); });
  process.exit(code);
}
const enginePort = Number(process.env.ANYVIS_PORT || 4317);
const uiPort = Number(process.env.ANYVIS_UI_PORT || 5174);
for (const port of [enginePort, uiPort]) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('端口应为 1024–65535 之间的整数。');
}
const major = Number(process.versions.node.split('.')[0]);
const minor = Number(process.versions.node.split('.')[1]);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error('AnyVis 需要 Node.js 22.18 或更高版本，以直接运行项目编译器。');
  process.exit(1);
}
if (production && !existsSync(join(root, 'dist/index.html'))) {
  console.error('没有找到生产构建。请先运行 npm run build，然后重新启动。');
  process.exit(1);
}
const environment = { ...process.env, ANYVIS_PORT: String(enginePort), ANYVIS_UI_PORT: String(uiPort) };
const children = [];
let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else process.kill(-child.pid, 'SIGTERM');
    } catch { /* Child already exited. */ }
  }
  setTimeout(() => process.exit(exitCode), 250);
}
function start(label, executable, argv, extra = {}) {
  const child = spawn(executable, argv, { cwd: root, env: { ...environment, ...extra }, stdio: 'inherit', detached: process.platform !== 'win32' });
  children.push(child);
  child.on('error', (error) => { console.error(`${label} 启动失败：${error.message}`); stop(1); });
  child.on('exit', (code) => {
    if (!stopping) { if (code) console.error(`${label} 已退出，状态 ${code}`); stop(code || 0); }
  });
  return child;
}
async function responds(url, check) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return response.ok && await check(response);
  } catch { return false; }
}
async function waitReady(url, check, label) {
  const started = Date.now();
  while (Date.now() - started < 30000 && !stopping) {
    if (await responds(url, check)) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (stopping) throw new Error('启动已停止，请查看上方诊断。');
  throw new Error(`${label} 在 30 秒内没有就绪，请查看上方诊断。`);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
try {
  const sessionURL = `http://127.0.0.1:${enginePort}/api/session`;
  const sessionCheck = async response => typeof (await response.json()).token === 'string';
  if (await responds(sessionURL, sessionCheck)) console.log(`复用已运行的 AnyVis 引擎（${enginePort}）。`);
  else start('Manim 引擎服务', process.execPath, [...(production ? [] : ['--watch', '--watch-preserve-output']), 'server/server.mjs']);
  await waitReady(sessionURL, sessionCheck, 'Manim 引擎服务');
  const url = `http://127.0.0.1:${production ? enginePort : uiPort}`;
  if (!production) {
    const uiCheck = async response => (await response.text()).includes('AnyVis');
    if (await responds(url, uiCheck)) console.log(`复用已运行的 AnyVis 界面（${uiPort}）。`);
    else start('编辑器', process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(uiPort), '--strictPort']);
    await waitReady(url, uiCheck, '编辑器');
  }
  console.log(`\nAnyVis 已就绪：${url}\n按 Ctrl+C 关闭本次启动的服务。`);
  if (!args.has('--no-open')) {
    const [executable, argv] = process.platform === 'darwin' ? ['open', [url]]
      : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
    const opener = spawn(executable, argv, { stdio: 'ignore' });
    opener.on('error', () => console.log(`请在浏览器中打开 ${url}`));
    opener.unref();
  }
  // Also keep the launcher alive when reusing both existing services.
  setInterval(() => {}, 60000);
} catch (error) { console.error(error.message); stop(1); }
