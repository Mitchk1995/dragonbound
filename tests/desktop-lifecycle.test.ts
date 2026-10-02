import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function desktop(ownsSave = true) {
  const appEvents = new Map<string, (...args: any[]) => any>();
  const windowEvents = new Map<string, (...args: any[]) => any>();
  const app = {
    requestSingleInstanceLock: vi.fn(() => ownsSave), quit: vi.fn(), getPath: () => 'unused-save-directory',
    whenReady: vi.fn(() => ({ then: (ready: () => void) => ready() })),
    on: (event: string, handler: (...args: any[]) => any) => appEvents.set(event, handler),
  };
  const win = {
    on: (event: string, handler: (...args: any[]) => any) => windowEvents.set(event, handler),
    loadFile: vi.fn(), isMinimized: () => true, restore: vi.fn(), focus: vi.fn(), destroy: vi.fn(),
    webContents: { isDestroyed: () => false, isCrashed: () => false, executeJavaScript: vi.fn() },
  };
  const BrowserWindow = vi.fn(function () { return win; });
  const modules: Record<string, unknown> = {
    electron: { app, BrowserWindow, ipcMain: { handle: vi.fn() } }, path,
    fs: {}, os: {}, './save-store.cjs': { createSaveStore: () => ({ read: vi.fn(), write: vi.fn() }) },
  };
  runInNewContext(readFileSync('electron/main.cjs', 'utf8'), {
    require: (name: string) => { if (!(name in modules)) throw Error(`Unexpected module: ${name}`); return modules[name]; },
    process: { env: {} }, __dirname: path.resolve('electron'), console, setTimeout,
  });
  return { app, win, BrowserWindow, appEvents, windowEvents };
}

describe('desktop save ownership and close', () => {
  it('refuses to open a second save-writing instance', () => {
    const { app, BrowserWindow } = desktop(false);
    expect(app.quit).toHaveBeenCalledOnce();
    expect(BrowserWindow).not.toHaveBeenCalled();
  });
  it('brings the existing game forward when it is launched again', () => {
    const { win, appEvents } = desktop();
    appEvents.get('second-instance')!();
    expect(win.restore).toHaveBeenCalledOnce();
    expect(win.focus).toHaveBeenCalledOnce();
  });
  it('waits for progress to finish saving before closing', async () => {
    const { win, windowEvents } = desktop();
    let finish!: (saved: boolean) => void;
    win.webContents.executeJavaScript.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const event = { preventDefault: vi.fn() };
    windowEvents.get('close')!(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(win.destroy).not.toHaveBeenCalled();
    // Repeated close clicks must not trigger another concurrent final save.
    windowEvents.get('close')!(event);
    expect(win.webContents.executeJavaScript).toHaveBeenCalledOnce();
    finish(true);
    await new Promise(resolve => setImmediate(resolve));
    expect(win.destroy).toHaveBeenCalledOnce();
  });
  it('keeps play open after a failed save and allows a later close to retry', async () => {
    const { win, windowEvents } = desktop();
    win.webContents.executeJavaScript.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const event = { preventDefault: vi.fn() };
    windowEvents.get('close')!(event);
    await new Promise(resolve => setImmediate(resolve));
    expect(win.destroy).not.toHaveBeenCalled();
    windowEvents.get('close')!(event);
    await new Promise(resolve => setImmediate(resolve));
    expect(win.destroy).toHaveBeenCalledOnce();
  });
});
