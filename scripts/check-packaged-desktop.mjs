#!/usr/bin/env node
/** Launch the actual ASAR application produced by electron-builder. */
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packagedDesktopExecutable } from './packaged-desktop-executable.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = packagedDesktopExecutable();
const report = path.join(root, 'desktop-build', 'packaged-smoke-result.json');
await rm(report, { force: true });
const timeoutArg = process.argv.find(value => value.startsWith('--smoke-timeout='))?.slice('--smoke-timeout='.length);
const smokeTimeoutMs = Number(process.env.ANYVIS_SMOKE_TIMEOUT) || (timeoutArg ? Number(timeoutArg) : 120_000);
const timeoutMs = smokeTimeoutMs + 30_000;
const child = spawn(executable, ['--smoke-test', `--smoke-result=${report}`, `--smoke-timeout=${smokeTimeoutMs}`], { cwd: root, stdio: 'inherit' });
const timer = setTimeout(() => child.kill(), timeoutMs);
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
