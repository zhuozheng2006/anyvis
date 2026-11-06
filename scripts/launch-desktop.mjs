#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const application = path.join(root, 'desktop-build', 'app');
if (!existsSync(path.join(application, 'server.mjs'))) {
  console.error('桌面文件尚未准备。请先运行 npm run desktop:prepare。'); process.exit(1);
}
let electron;
try { electron = createRequire(path.join(root, 'desktop', 'package.json'))('electron'); }
catch {
  console.error('未安装 Electron 桌面工具。请运行 npm run desktop:install；浏览器版仍可用 npm run studio。'); process.exit(1);
}
const child = spawn(electron, [application, ...process.argv.slice(2)], { stdio: 'inherit', cwd: root });
child.once('error', error => { console.error(`桌面启动失败：${error.message}`); process.exitCode = 1; });
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
