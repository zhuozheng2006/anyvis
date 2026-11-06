#!/usr/bin/env node
/** Bundle the engine, then stage a dependency-free Electron application. */
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function prepareDesktop({ root = projectRoot, output = path.join(root, 'desktop-build') } = {}) {
  try { await access(path.join(root, 'dist', 'index.html')); }
  catch { throw new Error('前端尚未构建。请先运行 npm run build。'); }
  const app = path.join(output, 'app');
  await rm(output, { recursive: true, force: true });
  await mkdir(app, { recursive: true });
  const result = await build({
    entryPoints: [path.join(root, 'server', 'server.mjs')], outfile: path.join(app, 'server.mjs'),
    bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'bundle',
    sourcemap: false, metafile: true, logLevel: 'warning',
  });
  for (const outputInfo of Object.values(result.metafile.outputs)) for (const dependency of outputInfo.imports) {
    if (!dependency.path.startsWith('node:')) throw new Error(`桌面引擎存在未打包依赖：${dependency.path}`);
  }
  const files = ['main.cjs', 'host.mjs', 'preload.cjs', 'settings.html', 'settings.js', 'settings.css'];
  await Promise.all(files.map(file => cp(path.join(root, 'desktop', file), path.join(app, file))));
  await cp(path.join(root, 'dist'), path.join(app, 'dist'), { recursive: true });
  await mkdir(path.join(output, 'runtime'), { recursive: true });
  await cp(path.join(root, 'server', 'worker.py'), path.join(output, 'runtime', 'worker.py'));
  const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  await writeFile(path.join(app, 'package.json'), JSON.stringify({
    name: 'anyvis-desktop', productName: 'AnyVis', version: metadata.version,
    description: 'Create Manim animations with visual blocks.',
    author: 'AnyVis contributors', homepage: 'https://github.com/zhuozheng2006/anyvis',
    main: 'main.cjs', private: true,
  }, null, 2) + '\n');
  await writeFile(path.join(output, 'bundle-metafile.json'), JSON.stringify(result.metafile, null, 2));
  return { app, runtime: path.join(output, 'runtime') };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const result = await prepareDesktop(); console.log(`AnyVis 桌面文件已准备：${result.app}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
