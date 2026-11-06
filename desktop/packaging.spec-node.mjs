import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareDesktop } from '../scripts/prepare-desktop.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('prepared engine has no source/runtime-package imports and runs from an isolated staged application', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'anyvis-package-test-'));
  try {
    const fixture = path.join(temporary, 'source');
    await mkdir(path.join(fixture, 'dist'), { recursive: true });
    await writeFile(path.join(fixture, 'dist', 'index.html'), '<!doctype html><title>AnyVis staged test</title>');
    await Promise.all(['desktop', 'server', 'src/studio/core', 'src/studio/ai'].map(folder => cp(path.join(root, folder), path.join(fixture, folder), { recursive: true, filter: filename => !filename.includes(`${path.sep}node_modules`) })));
    await cp(path.join(root, 'package.json'), path.join(fixture, 'package.json'));
    const result = await prepareDesktop({ root: fixture, output: path.join(temporary, 'standalone') });
    const metadata = JSON.parse(await readFile(path.join(result.app, 'package.json'), 'utf8'));
    assert.equal(metadata.main, 'main.cjs'); assert.equal(metadata.dependencies, undefined);
    // Removing the entire original tree proves the engine cannot consult .ts sources.
    await rm(fixture, { recursive: true, force: true });
    const module = await import(pathToFileURL(path.join(result.app, 'server.mjs')).href);
    assert.equal(module.parseRange('bytes=0-31', 1000).end, 31);
    const engine = await module.createAnyVisServer({ listen: false, health: { available: false }, cacheRoot: path.join(temporary, 'user-data', 'cache'), staticRoot: path.join(result.app, 'dist'), workerPath: path.join(result.runtime, 'worker.py'), runtimeRoot: result.runtime });
    await engine.healthPromise; await engine.close();
    const bundle = await readFile(path.join(result.app, 'server.mjs'), 'utf8');
    assert.equal(/import\s*\(\s*['"][^'"]+\.ts['"]/.test(bundle), false);
    assert.equal((await readFile(path.join(result.runtime, 'worker.py'), 'utf8')).includes('def health()'), true);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
