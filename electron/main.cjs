const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const saveDir = () => app.getPath('userData');
const savePath = () => path.join(saveDir(), 'save.json');
const backupPath = () => path.join(saveDir(), 'save.backup.json');

ipcMain.handle('save:read', async () => {
  for (const p of [savePath(), backupPath()]) {
    try {
      const text = fs.readFileSync(p, 'utf8');
      JSON.parse(text); // reject a corrupt file and fall through to the backup
      return text;
    } catch {}
  }
  return null;
});

ipcMain.handle('save:write', async (_e, json) => {
  fs.mkdirSync(saveDir(), { recursive: true });
  // Keep the previous good save as a backup, then write atomically.
  if (fs.existsSync(savePath())) fs.copyFileSync(savePath(), backupPath());
  const tmp = savePath() + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, savePath());
  return true;
});

ipcMain.handle('save:path', async () => savePath());

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#1a1410',
    title: 'Dragonbound',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
