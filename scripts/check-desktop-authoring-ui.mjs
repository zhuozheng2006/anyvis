#!/usr/bin/env node
/** Exercise the same authoring workflow as the web editor against a packaged ASAR. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { loadPlaywright, runAuthoringUI } from './check-authoring-ui.mjs';
import { packagedDesktopExecutable } from './packaged-desktop-executable.mjs';

async function waitForEditor(electron) {
  const deadline = Date.now() + 60_000;
  const context = electron.context();
  // The settings window opens first; startup creates a separate editor window.
  while (Date.now() < deadline && electron.process().exitCode === null) {
    const page = context.pages().find(page => page.url().startsWith('anyvis://studio/'));
    if (page) return page;
    await delay(100);
  }
  throw new Error(`Desktop editor did not open. Windows: ${context.pages().map(page => page.url()).join(', ')}`);
}

const executablePath = process.argv[2] ? path.resolve(process.argv[2]) : packagedDesktopExecutable();
const directory = path.resolve(process.env.ANYVIS_UI_OUTPUT || 'artifacts/authoring-ui/desktop');
const { _electron } = await loadPlaywright();
await mkdir(directory, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), 'anyvis-authoring-profile-'));
let electron;
try {
  electron = await _electron.launch({
    executablePath,
    args: [`--user-data-dir=${profile}`],
    chromiumSandbox: true,
    acceptDownloads: true,
    timeout: 60_000,
  });
  const window = await waitForEditor(electron);
  const host = await electron.evaluate(({ app, BrowserWindow }) => {
    const editor = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().startsWith('anyvis://studio/'));
    return {
      packaged: app.isPackaged,
      appPath: app.getAppPath(),
      profile: app.getPath('userData'),
      sandbox: editor?.webContents.getLastWebPreferences()?.sandbox,
      sandboxDisabled: app.commandLine.hasSwitch('no-sandbox'),
      electron: process.versions.electron,
      version: app.getVersion(),
    };
  });
  assert.ok(host.packaged && host.appPath.endsWith('app.asar'), 'Expected a packaged ASAR');
  assert.ok(host.sandbox && !host.sandboxDisabled, 'Expected the editor renderer sandbox');
  assert.equal(await realpath(host.profile), await realpath(profile), 'Expected an isolated test profile');
  await runAuthoringUI(window, { directory, mode: 'desktop' });
  await writeFile(path.join(directory, 'packaged-host.json'), JSON.stringify(host, null, 2));
  console.log(`Packaged AnyVis ${host.version} passed the authoring flow with Electron ${host.electron}.`);
} finally {
  try { await electron?.close(); }
  finally { await rm(profile, { recursive: true, force: true }); }
}
