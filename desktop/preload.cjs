'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// This bridge is installed only on the local settings window. The main process
// additionally verifies the sending frame and exact URL for every invocation.
contextBridge.exposeInMainWorld('anyvisDesktop', Object.freeze({
  status: () => ipcRenderer.invoke('anyvis:settings:status'),
  choosePython: () => ipcRenderer.invoke('anyvis:settings:choose-python'),
  save: pythonPath => ipcRenderer.invoke('anyvis:settings:save', { pythonPath }),
  retry: () => ipcRenderer.invoke('anyvis:settings:retry'),
  editor: () => ipcRenderer.invoke('anyvis:settings:editor'),
}));
