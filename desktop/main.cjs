'use strict';
/** Self-contained Electron host; the renderer never receives Node privileges. */
const { app, BrowserWindow, Menu, shell, dialog, ipcMain, protocol, net, session } = require('electron');
const { existsSync, mkdtempSync } = require('node:fs');
const { writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

app.setName('AnyVis');
const smoke = process.argv.includes('--smoke-test');
const smokeResult = process.argv.find(value => value.startsWith('--smoke-result='))?.slice('--smoke-result='.length);
const smokeTimeoutArg = process.argv.find(value => value.startsWith('--smoke-timeout='))?.slice('--smoke-timeout='.length);
const smokeTimeoutMs = smokeTimeoutArg ? Math.max(5000, Number(smokeTimeoutArg) || 0) : (app.isPackaged ? 75_000 : 45_000);
if (smoke) app.setPath('userData', mkdtempSync(path.join(tmpdir(), 'anyvis-desktop-smoke-')));
protocol.registerSchemesAsPrivileged([{ scheme: 'anyvis', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
const singleInstance = app.requestSingleInstanceLock();
let editorWindow; let settingsWindow; let engine; let store; let settings = { pythonPath: '' };
let host; let status = { state: 'starting', health: { available: false, checking: true }, error: null }; let quitting = false; let mayQuit = false;
let smokeFinished = false; let editorCrashed = false;

function secureWindow(options, isSettings = false) {
  const win = new BrowserWindow({
    backgroundColor: '#f5f7fa', title: isSettings ? 'AnyVis · 运行环境' : 'AnyVis', ...options,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
      ...(isSettings ? { preload: path.join(__dirname, 'preload.cjs') } : {}) },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    const external = host.externalURL(url);
    if (external) shell.openExternal(external).catch(() => {});
    return { action: 'deny' };
  });
  for (const eventName of ['will-navigate', 'will-redirect']) win.webContents.on(eventName, (event, target) => {
    if (!(isSettings ? host.isSettingsURL(target) : host.isEditorURL(target))) event.preventDefault();
  });
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  return win;
}

function showSettings() {
  if (quitting) return;
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return; }
  settingsWindow = secureWindow({ width: 760, height: 660, minWidth: 620, minHeight: 570, resizable: true }, true);
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.loadURL(host.SETTINGS_URL).catch(error => { if (!quitting) dialog.showErrorBox('AnyVis 无法打开设置', error.message); });
}

async function showEditor(reload = false) {
  if (quitting || !engine?.service) return;
  if (!editorWindow || editorWindow.isDestroyed()) {
    editorWindow = secureWindow({ width: 1512, height: 982, minWidth: 1060, minHeight: 720 });
    editorWindow.on('closed', () => { editorWindow = null; if (settingsWindow) settingsWindow.close(); });
    editorWindow.webContents.on('render-process-gone', () => {
      editorCrashed = true;
      if (!quitting) { status = { ...status, error: '编辑器进程已退出。可返回编辑器重新打开；已保存项目仍保留。' }; showSettings(); }
    });
    await editorWindow.loadURL(host.EDITOR_URL);
  } else if (reload || editorCrashed) await editorWindow.loadURL(host.EDITOR_URL);
  editorCrashed = false;
  editorWindow.show(); editorWindow.focus();
  if (smoke) await finishSmoke();
}

async function restart() {
  try {
    const service = await engine.restart(settings);
    status.health = { available: false, checking: true };
    service.healthPromise.then(health => {
      if (engine.service !== service || quitting) return;
      status.health = health;
      if (!health.available && !smoke) showSettings();
    }).catch(error => { if (engine.service === service) status.health = { available: false, error: error.message }; });
    await showEditor(true);
    if (settingsWindow && !status.health.available && status.health.checking) settingsWindow.hide();
    else if (settingsWindow && status.health.available) settingsWindow.close();
    return { ok: true };
  } catch (error) {
    if (error.name === 'AbortError' || quitting) return { ok: false };
    status = { ...status, state: 'error', error: error.message || '本地引擎无法启动。' };
    showSettings();
    if (smoke) await finishSmoke(error);
    throw error;
  }
}

async function finishSmoke(error) {
  if (smokeFinished) return;
  smokeFinished = true;
  try {
    if (error) throw error;
    const response = await net.fetch(`http://127.0.0.1:${engine.service.port}/api/session`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok || typeof (await response.json()).token !== 'string') throw new Error('Session API failed.');
    let rootReady = false;
    for (let index = 0; index < 160 && !rootReady; index++) {
      rootReady = await editorWindow.webContents.executeJavaScript("Boolean(document.querySelector('.studio-app .studio-header') && document.querySelector('.studio-app .blocklySvg'))");
      if (!rootReady) await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!rootReady) throw new Error('Studio editor or Blockly workspace did not mount.');
    // Exercise the generated API catalog in the actual bundled renderer.
    const apiCatalog = await editorWindow.webContents.executeJavaScript(`(async () => {
      const until = async predicate => {
        for (let i = 0; i < 100; i++) {
          const value = predicate(); if (value) return value;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error('API browser interaction timed out.');
      };
      const opener = document.querySelector('.av-api-open');
      if (!opener || opener.disabled) throw new Error('API browser is unavailable.');
      opener.click();
      const input = await until(() => document.querySelector('.av-api-browser[open] input'));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Wait');
      input.dispatchEvent(new Event('input', {bubbles:true}));
      const entry = await until(() => [...document.querySelectorAll('.av-api-browser-list article')]
        .find(row => /^Wait(?:\\s|$)/.test(row.querySelector('code')?.textContent || '')));
      const before = document.querySelectorAll('.blocklyBlockCanvas .blocklyDraggable').length;
      entry.querySelector('button').click();
      await until(() => !document.querySelector('.av-api-browser[open]') &&
        document.querySelectorAll('.blocklyBlockCanvas .blocklyDraggable').length > before);
      const objectCount = document.querySelectorAll('.om-card').length;
      document.querySelector('[aria-label="添加新对象"]').click();
      const circle = await until(() => document.querySelector('[aria-label="添加 圆"]'));
      circle.click();
      await until(() => document.querySelectorAll('.om-card').length > objectCount);
      [...document.querySelectorAll('[role="tab"]')].find(tab => tab.textContent.includes('时间轴')).click();
      await until(() => document.querySelector('.tl-editor .timeline-editor'));
      document.querySelector('[aria-label="设置默认配乐"]').click();
      const music = await until(() => document.querySelector('[aria-label="默认配乐"]'));
      if (music.value !== 'piano') throw new Error('New projects must default to piano.');
      music.value = 'none'; music.dispatchEvent(new Event('change', {bubbles:true}));
      await until(() => !document.querySelector('[aria-label="配乐音量"]'));
      music.value = 'piano'; music.dispatchEvent(new Event('change', {bubbles:true}));
      await until(() => document.querySelector('[aria-label="配乐音量"]'));
      document.querySelector('[aria-label="关闭对话框"]').click();
      await until(() => !document.querySelector('.studio-modal'));
      [...document.querySelectorAll('[role="tab"]')].find(tab => tab.textContent.includes('代码')).click();
      const code = await until(() => document.querySelector('.generated-code .cm-content'));
      if (code.getAttribute('contenteditable') !== 'false') throw new Error('Generated code must be read-only.');
      return {search:true, addBlock:true, objectManager:true, timeline:true, defaultMusic:true, readOnlyCode:true};
    })()`);
    const browserCheck = await editorWindow.webContents.executeJavaScript(`(async () => {
      const session = await fetch('/api/session').then(r => r.json());
      const result = await fetch('/api/render', {method:'POST',headers:{'Content-Type':'application/json','X-AnyVis-Token':session.token},body:'{'});
      const error = await result.json();
      const range = await fetch('/templates/rendered/first-animation.webm', {headers:{Range:'bytes=0-31'}});
      const bytes = (await range.arrayBuffer()).byteLength;
      const video = document.createElement('video'); video.muted = true; video.preload = 'metadata';
      const videoReady = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Video metadata timed out.')), 6000);
        video.onloadedmetadata = () => {clearTimeout(timer);resolve(video.videoWidth > 0 && video.duration > 0);};
        video.onerror = () => {clearTimeout(timer);reject(new Error('Video decoding failed.'));};
      });
      video.src = '/templates/rendered/first-animation.webm';
      const decoded = await videoReady;
      localStorage.setItem('anyvis-desktop-smoke', 'persisted');
      return {token: typeof session.token === 'string', status: result.status, error: error.error,
        origin: location.origin, range: range.status, bytes, decoded};
    })()`);
    if (!browserCheck.token || browserCheck.status !== 400 || !browserCheck.error?.includes('JSON') || browserCheck.origin !== 'anyvis://studio') throw new Error('Desktop protocol or session forwarding failed.');
    if (browserCheck.range !== 206 || browserCheck.bytes !== 32 || !browserCheck.decoded) throw new Error('Desktop video or range request failed.');
    const previousPort = engine.service.port;
    await engine.restart(settings);
    await editorWindow.loadURL(host.EDITOR_URL);
    const storage = await editorWindow.webContents.executeJavaScript("localStorage.getItem('anyvis-desktop-smoke')");
    if (storage !== 'persisted') throw new Error('Desktop storage failed to persist.');
    if (smokeResult) await writeFile(smokeResult, JSON.stringify({ ok: true, origin: browserCheck.origin, rootReady, apiCatalog, packaged: app.isPackaged, appPath: app.getAppPath(), workerExists: existsSync(path.join(app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..'), 'runtime', 'worker.py')), session: true, videoRange: true, videoDecoded: true, storageAcrossRestart: true, ports: [previousPort, engine.service.port], health: status.health, electron: process.versions.electron }, null, 2));
    process.exitCode = 0;
  } catch (failure) {
    if (smokeResult) await writeFile(smokeResult, JSON.stringify({ ok: false, error: failure.message, electron: process.versions.electron }, null, 2)).catch(() => {});
    console.error(`AnyVis desktop smoke failed: ${failure.message}`); process.exitCode = 1;
  }
  app.quit();
}

function installIPC() {
  const handle = (name, handler) => ipcMain.handle(`anyvis:settings:${name}`, async (event, payload) => {
    if (!settingsWindow || event.sender !== settingsWindow.webContents || event.senderFrame !== settingsWindow.webContents.mainFrame || !host.isSettingsURL(event.senderFrame.url)) throw new Error('此操作只允许在 AnyVis 运行环境窗口中执行。');
    return handler(payload);
  });
  handle('status', () => ({ ...status, pythonPath: settings.pythonPath }));
  handle('choose-python', async () => {
    const result = await dialog.showOpenDialog(settingsWindow, { title: '选择安装了 Manim 的 Python', properties: ['openFile'], ...(process.platform === 'win32' ? { filters: [{ name: 'Python', extensions: ['exe'] }] } : {}) });
    return result.canceled ? null : result.filePaths[0] || null;
  });
  handle('save', async value => { settings = await store.save(value); status.warning = undefined; await restart(); return { ok: true }; });
  handle('retry', () => restart());
  handle('editor', async () => { await showEditor(true); settingsWindow?.hide(); return { ok: true }; });
}

async function initialize() {
  host = await import(pathToFileURL(path.join(__dirname, 'host.mjs')).href);
  const userData = app.getPath('userData');
  store = host.createSettingsStore(userData);
  const stored = await store.read(); settings = stored.settings; status.warning = stored.warning;
  const runtimeRoot = app.isPackaged ? path.join(process.resourcesPath, 'runtime') : path.resolve(__dirname, '..', 'runtime');
  const serverModule = path.join(__dirname, 'server.mjs');
  if (!existsSync(serverModule)) throw new Error('桌面引擎尚未构建。请运行 npm run desktop:prepare 后重试。');
  const { createAnyVisServer } = await import(pathToFileURL(serverModule).href);
  engine = host.createEngineController({ createServer: createAnyVisServer,
    paths: { cacheRoot: path.join(userData, 'render-cache'), staticRoot: path.join(__dirname, 'dist'), runtimeRoot, workerPath: path.join(runtimeRoot, 'worker.py') },
    onState: value => { status = { ...status, ...value }; },
  });
  protocol.handle('anyvis', host.createProtocolHandler({ getServiceURL: () => engine.service ? `http://127.0.0.1:${engine.service.port}` : null, desktopRoot: __dirname, fetchLocal: (url, options) => net.fetch(url, options) }));
  installIPC();
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(host.allowClipboardWrite(permission, contents.getURL(), details.requestingUrl)));
  session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin) => host.allowClipboardWrite(permission, contents?.getURL(), requestingOrigin));
  session.defaultSession.on('will-download', (_event, item) => { item.setSaveDialogOptions({ title: '保存 AnyVis 导出文件' }); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: 'AnyVis', submenu: [{ role: 'about' }, { type: 'separator' }, { label: '运行环境…', click: showSettings }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: '文件', submenu: [{ label: '运行环境…', click: showSettings }, { type: 'separator' }, { role: process.platform === 'darwin' ? 'close' : 'quit' }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '视图', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ]));
  showSettings();
  await restart();
}

app.on('second-instance', () => { const win = editorWindow || settingsWindow; if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
app.on('activate', () => { if (host && !quitting) { if (engine?.service) showEditor().catch(() => showSettings()); else showSettings(); } });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (mayQuit) return;
  event.preventDefault(); if (quitting) return; quitting = true;
  // Closing normally flushes renderer drafts and aborts in-flight AI fetches.
  // Waiting for server.close first could keep those requests alive for 120 s.
  if (!smoke) for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.close();
  Promise.resolve(engine?.close()).catch(error => console.error('AnyVis engine shutdown:', error.message)).finally(() => { mayQuit = true; if (smoke) app.exit(process.exitCode || 0); else app.quit(); });
});
if (!singleInstance) { mayQuit = true; app.quit(); }
else app.whenReady().then(initialize).catch(async error => {
  if (smoke) await finishSmoke(error);
  else if (host && engine) { status = { ...status, state: 'error', error: error.message }; showSettings(); }
  else { dialog.showErrorBox('AnyVis 无法启动', `${error.message}\n请重新构建或安装桌面应用。`); app.quit(); }
});
if (smoke) setTimeout(async () => {
  const error = `Desktop smoke timed out after ${Math.round(smokeTimeoutMs / 1000)} seconds.`;
  console.error(error); process.exitCode = 1;
  if (smokeResult) await writeFile(smokeResult, JSON.stringify({ ok: false, error })).catch(() => {});
  app.quit(); setTimeout(() => app.exit(1), 3000).unref();
}, smokeTimeoutMs).unref();
