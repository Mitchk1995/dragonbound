const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readSave: () => ipcRenderer.invoke('save:read'),
  writeSave: (json) => ipcRenderer.invoke('save:write', json),
  savePath: () => ipcRenderer.invoke('save:path'),
});
