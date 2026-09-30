const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readSave: () => ipcRenderer.invoke('save:read'),
  writeSave: (json) => ipcRenderer.invoke('save:write', json),
  savePath: () => ipcRenderer.invoke('save:path'),
  inspect: {
    config: () => ipcRenderer.invoke('inspect:config'),
    capture: (name) => ipcRenderer.invoke('inspect:capture', name),
    write: (name, text) => ipcRenderer.invoke('inspect:write', name, text),
    log: (text) => ipcRenderer.invoke('inspect:log', text),
    done: (code) => ipcRenderer.invoke('inspect:done', code),
    resize: (w, h) => ipcRenderer.invoke('inspect:resize', w, h),
  },
});
