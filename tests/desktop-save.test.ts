import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newSave } from '../src/save/save';

const { createSaveStore } = createRequire(import.meta.url)('../electron/save-store.cjs');

describe('desktop save recovery', () => {
  let dir: string;
  let handlers: Map<string, (...args: any[]) => any>;
  let primary: string, backup: string;
  const json = JSON.stringify({ ...newSave(), gold: 1234 });

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'dragonbound-save-test-'));
    primary = path.join(dir, 'save.json');
    backup = path.join(dir, 'save.backup.json');
    handlers = new Map();
    const electron = {
      app: { getPath: () => dir, requestSingleInstanceLock: () => true, whenReady: () => ({ then: vi.fn() }), on: vi.fn() },
      BrowserWindow: vi.fn(), ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => handlers.set(name, fn) },
    };
    const modules: Record<string, unknown> = { electron, path, fs, os, './save-store.cjs': { createSaveStore } };
    runInNewContext(readFileSync('electron/main.cjs', 'utf8'), {
      require: (name: string) => {
        if (!(name in modules)) throw Error(`Unexpected module: ${name}`);
        return modules[name];
      },
      process: { env: {} }, __dirname: path.resolve('electron'), console, setTimeout,
    });
  });

  afterEach(() => {
    const tempRoot = path.resolve(os.tmpdir()) + path.sep;
    if (!path.resolve(dir).startsWith(tempRoot) || !path.basename(dir).startsWith('dragonbound-save-test-')) throw Error('Unexpected test directory');
    rmSync(dir, { recursive: true, force: true });
  });

  it.each(['{"character":', '', 'null', '[]', '42', 'true', '"invalid"', '{}', '{"skills":[]}'])('recovers from an invalid primary and preserves its good backup on the next write (%j)', async bad => {
    writeFileSync(primary, bad);
    writeFileSync(backup, json);
    expect(await handlers.get('save:read')!()).toBe(json);
    const updated = JSON.stringify({ ...newSave(), gold: 4321 });
    expect(await handlers.get('save:write')!(null, updated)).toBe(true);
    expect(readFileSync(backup, 'utf8')).toBe(json);
    expect(await handlers.get('save:read')!()).toBe(updated);
  });

  it('backs up valid existing progress before an atomic write', async () => {
    writeFileSync(primary, json);
    const updated = JSON.stringify({ ...newSave(), gold: 4321 });
    await handlers.get('save:write')!(null, updated);
    expect(readFileSync(backup, 'utf8')).toBe(json);
    expect(readFileSync(primary, 'utf8')).toBe(updated);
  });

  it('serialises overlapping writes and keeps the immediately previous progress as backup', async () => {
    const first = JSON.stringify({ ...newSave(), gold: 1 });
    const second = JSON.stringify({ ...newSave(), gold: 2 });
    const third = JSON.stringify({ ...newSave(), gold: 3 });
    await Promise.all([first, second, third].map(json => handlers.get('save:write')!(null, json)));
    expect(readFileSync(primary, 'utf8')).toBe(third);
    expect(readFileSync(backup, 'utf8')).toBe(second);
    expect(fs.existsSync(primary + '.tmp')).toBe(false);
  });

  it('does not damage primary or backup when a supplied snapshot is invalid', async () => {
    writeFileSync(primary, json);
    writeFileSync(backup, json);
    await expect(handlers.get('save:write')!(null, '{}')).rejects.toThrow('safely');
    expect(readFileSync(primary, 'utf8')).toBe(json);
    expect(readFileSync(backup, 'utf8')).toBe(json);
    // A rejected write must not poison the queue.
    await expect(handlers.get('save:write')!(null, json)).resolves.toBe(true);
  });

  it('protects a save from a newer game instead of substituting an old backup', async () => {
    const future = JSON.stringify({ ...newSave(), version: 999, gold: 999 });
    writeFileSync(primary, future);
    writeFileSync(backup, json);
    await expect(handlers.get('save:read')!()).rejects.toThrow('newer Dragonbound');
    await expect(handlers.get('save:write')!(null, json)).rejects.toThrow('newer Dragonbound');
    expect(readFileSync(primary, 'utf8')).toBe(future);
    expect(readFileSync(backup, 'utf8')).toBe(json);
  });
});
