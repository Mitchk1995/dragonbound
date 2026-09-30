const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Inspect mode (npm run inspect): the dev build drives itself through every zone, model, pose
// and panel and saves full-window captures + a metrics report to inspect/. It uses a throwaway
// save directory so the real save is never touched.
const INSPECT = process.env.DRAGONBOUND_INSPECT || '';
const inspectDir = path.join(__dirname, '..', 'inspect');
if (INSPECT) {
  const tmp = path.join(os.tmpdir(), 'dragonbound-inspect');
  fs.rmSync(tmp, { recursive: true, force: true });
  app.setPath('userData', tmp);
  fs.mkdirSync(inspectDir, { recursive: true });
  const safe = (name) => String(name).replace(/[^A-Za-z0-9._+-]+/g, '_');
  ipcMain.handle('inspect:config', () => INSPECT);
  ipcMain.handle('inspect:capture', async (e, name) => {
    const img = await e.sender.capturePage();
    fs.writeFileSync(path.join(inspectDir, safe(name) + '.png'), img.toPNG());
    return true;
  });
  ipcMain.handle('inspect:write', (_e, name, text) => {
    fs.writeFileSync(path.join(inspectDir, safe(name)), text, 'utf8');
    return true;
  });
  ipcMain.handle('inspect:log', (_e, text) => {
    console.log('[inspect]', text);
    return true;
  });
  ipcMain.handle('inspect:done', (_e, code) => {
    setTimeout(() => app.exit(code || 0), 50);
    return true;
  });
} else {
  ipcMain.handle('inspect:config', () => null);
}

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
    // Inspect captures must be pixel-identical run to run: fixed content size, no DPI scaling.
    useContentSize: !!INSPECT,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: !INSPECT,
      zoomFactor: 1,
    },
  });
  if (INSPECT) {
    win.webContents.on('console-message', (e) => {
      const { level, message } = e;
      if (level === 'error' || level === 'warning' || level === 3 || level === 2) console.log('[renderer]', message);
    });
    win.webContents.on('render-process-gone', (_e, d) => console.log('[renderer gone]', d.reason));
  }
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
