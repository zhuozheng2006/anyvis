#!/usr/bin/env node
/** Launch the actual ASAR application produced by electron-builder. */
import { spawn } from 'node:child_process';
import { access, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = process.platform === 'darwin'
  ? [path.join('release', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'AnyVis.app', 'Contents', 'MacOS', 'AnyVis')]
  : process.platform === 'win32'
    ? [path.join('release', 'win-unpacked', 'AnyVis.exe')]
    : ['anyvis-desktop', 'anyvis', 'AnyVis'].map(name => path.join('release', 'linux-unpacked', name));
let executable;
for (const candidate of candidates) {
  const absolute = path.join(root, candidate);
  if (await access(absolute).then(() => true, () => false)) { executable = absolute; break; }
}
if (!executable) throw new Error(`Packaged application not found: ${candidates.join(', ')}`);
const report = path.join(root, 'desktop-build', 'packaged-smoke-result.json');
await rm(report, { force: true });
const child = spawn(executable, ['--smoke-test', `--smoke-result=${report}`], { cwd: root, stdio: 'inherit' });
const timer = setTimeout(() => child.kill(), 60_000);
try {
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Packaged smoke exited ${code ?? signal}`)));
  });
  const result = JSON.parse(await readFile(report, 'utf8'));
  if (!result.ok || !result.packaged || !result.appPath.endsWith('app.asar') || !result.workerExists ||
      !result.apiCatalog?.search || !result.apiCatalog?.addBlock || !result.storageAcrossRestart) {
    throw new Error(`Incomplete packaged application check: ${JSON.stringify(result)}`);
  }
  console.log(`Packaged ASAR application verified (${process.platform}/${process.arch}): API search/add, worker path, video and restart storage.`);
} finally { clearTimeout(timer); }
