const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createSaveStore } = require('./save-store.cjs');

// Inspect mode (npm run inspect): the dev build drives itself through every zone, model, pose
// and panel and saves full-window captures + a metrics report to inspect/. It uses a throwaway
// save directory so the real save is never touched.
const INSPECT = process.env.DRAGONBOUND_INSPECT || '';
const ownsSave = !!INSPECT || app.requestSingleInstanceLock();
const inspectDir = path.join(__dirname, '..', 'inspect');
if (INSPECT) {
  // One temp profile per run so parallel inspect runs (separate checkouts) never wipe each other.
  const tmp = path.join(os.tmpdir(), `dragonbound-inspect-${process.pid}`);
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
  // Lets the UI suite check smaller windows (e.g. 1280×720) in the same run.
  ipcMain.handle('inspect:resize', (e, w, h) => {
    BrowserWindow.fromWebContents(e.sender)?.setContentSize(w, h);
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
const saves = createSaveStore(saveDir);
ipcMain.handle('save:read', () => saves.read());
ipcMain.handle('save:write', (_e, json) => saves.write(json));

ipcMain.handle('save:path', async () => savePath());

/**
 * Inspect window position: just past the left edge of the leftmost display, level with it. Close
 * enough that Windows keeps that display's DPI (a window parked far away gets a different scale and
 * the captures change size), yet nothing of it is visible.
 */
function offscreen() {
  const ds = screen.getAllDisplays();
  const left = ds.reduce((a, d) => (d.bounds.x < a.bounds.x ? d : a), ds[0]);
  return [left.bounds.x - 1700, left.bounds.y];
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#1a1410',
    title: 'Dragonbound',
    autoHideMenuBar: true,
    // Inspect captures must be pixel-identical run to run: fixed content size, no DPI scaling.
    useContentSize: !!INSPECT,
    // Inspect runs stay out of the owner's way: the window is shown without taking focus, has no
    // taskbar button and sits just off-screen. It is still a real, shown window, so WebGL renders
    // and capturePage returns full frames (background throttling is off below). Frameless with no
    // thick frame, so the window is exactly 1600×900 of content (a hidden-then-shown framed window
    // on Windows reports its outer size as content and the captures grow).
    ...(INSPECT ? { show: false, frame: false, thickFrame: false, resizable: false, skipTaskbar: true, x: offscreen()[0], y: offscreen()[1] } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: !INSPECT,
      zoomFactor: 1,
    },
  });
  if (!INSPECT) {
    app.on('second-instance', () => { if (win.isMinimized()) win.restore(); win.focus(); });
    let closing = false;
    win.on('close', (event) => {
      if (win.webContents.isDestroyed() || win.webContents.isCrashed()) return;
      event.preventDefault();
      if (closing) return;
      closing = true;
      win.webContents.executeJavaScript('window.__game ? window.__game.flushSave() : true')
        .then((saved) => { if (saved) win.destroy(); })
        .catch((error) => console.error('Could not finish saving:', error.message))
        .finally(() => { closing = false; });
    });
  }
  if (INSPECT) {
    // Shown without activation (no focus steal), then parked off-screen again in case the OS
    // clamped the initial position onto a display.
    win.once('ready-to-show', () => {
      win.showInactive();
      win.setPosition(...offscreen());
      win.setContentSize(1600, 900);
    });
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

if (ownsSave) app.whenReady().then(createWindow);
else app.quit();
app.on('window-all-closed', () => app.quit());
