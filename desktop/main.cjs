/** Thin optional desktop host. Rendering and files stay behind the local service. */
const { app, BrowserWindow, Menu, shell } = require('electron');
app.setName('AnyVis');
const rawURL = process.env.ANYVIS_DESKTOP_URL || 'http://127.0.0.1:4317';
const url = new URL(rawURL);
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password) {
  throw new Error('AnyVis desktop only opens its local engine service.');
}
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
let window;
function createWindow() {
  window = new BrowserWindow({
    width: 1512, height: 982, minWidth: 1060, minHeight: 720,
    title: 'AnyVis', backgroundColor: '#f5f6f8',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    try { if (new URL(target).protocol === 'https:') shell.openExternal(target); } catch { /* Ignore malformed URLs. */ }
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, target) => {
    if (new URL(target).origin !== url.origin) event.preventDefault();
  });
  window.webContents.session.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: '保存 AnyVis 导出文件' });
  });
  window.loadURL(url.toString());
}
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: 'AnyVis', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '视图', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ]));
  createWindow();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => app.quit());
