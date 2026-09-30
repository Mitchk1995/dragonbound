import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newSave } from '../src/save/save';

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
      app: { getPath: () => dir, whenReady: () => ({ then: vi.fn() }), on: vi.fn() },
      BrowserWindow: vi.fn(), ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => handlers.set(name, fn) },
    };
    const modules: Record<string, unknown> = { electron, path, fs, os };
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

  it.each(['{"character":', '', 'null', '[]', '42', 'true', '"invalid"'])('recovers from an invalid primary and preserves its good backup on the next write (%j)', async bad => {
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
});
