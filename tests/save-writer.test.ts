import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaveWriter } from '../src/save/writer';
import { Game } from '../src/game';
import { newSave } from '../src/save/save';

afterEach(() => vi.unstubAllGlobals());

describe('save completion', () => {
  it('waits for an older pending snapshot before writing the latest one', async () => {
    let finish!: () => void;
    const calls: string[] = [];
    const writer = new SaveWriter(async json => {
      calls.push(json);
      if (json === 'older') await new Promise<void>(resolve => { finish = resolve; });
    });
    const older = writer.write('older');
    const latest = writer.write('latest');
    await Promise.resolve();
    expect(calls).toEqual(['older']);
    finish();
    await Promise.all([older, latest]);
    expect(calls).toEqual(['older', 'latest']);
  });

  it('keeps retrying after a rejected snapshot', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValue(undefined);
    const writer = new SaveWriter(write);
    await expect(writer.write('first')).rejects.toThrow('Disk full');
    await expect(writer.write('retry')).resolves.toBeUndefined();
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('keeps unsaved progress dirty, warns once, and reports that quitting is unsafe', async () => {
    vi.stubGlobal('window', {});
    const save = newSave();
    save.character = { name: 'Test', skin: 1, hair: 1, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 };
    const write = vi.fn().mockRejectedValue(new Error('Storage full'));
    const game = { save, ownsSave: true, backend: { write }, savesInFlight: 0, saveWarned: false, announce: vi.fn(), dirty: true, saveT: 0 } as any;
    expect(await Game.prototype.persist.call(game)).toBe(false);
    expect(game.dirty).toBe(true);
    expect(game.saveT).toBe(20);
    expect(await Game.prototype.persist.call(game)).toBe(false);
    expect(game.announce).toHaveBeenCalledTimes(1);
    write.mockResolvedValue(undefined);
    expect(await Game.prototype.persist.call(game)).toBe(true);
    expect(game.dirty).toBe(false);
    expect(game.savesInFlight).toBe(0);
  });

  it('writes browser progress synchronously before its unload handler returns', () => {
    vi.stubGlobal('window', {});
    const save = newSave();
    save.character = { name: 'Test', skin: 1, hair: 1, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 };
    const write = vi.fn().mockResolvedValue(undefined);
    const game = { save, ownsSave: true, backend: { write }, savesInFlight: 0 } as any;
    void Game.prototype.persist.call(game);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('flushes progress earned while the final snapshot was still being written', async () => {
    vi.stubGlobal('window', {});
    const save = newSave();
    save.character = { name: 'Test', skin: 1, hair: 1, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 };
    const snapshots: number[] = [];
    const game = { save, ownsSave: true, savesInFlight: 0, announce: vi.fn(), persist: Game.prototype.persist } as any;
    game.backend = { write: async (json: string) => {
      snapshots.push(JSON.parse(json).gold);
      if (snapshots.length === 1) { game.save.gold = 42; game.dirty = true; }
    } };
    expect(await Game.prototype.flushSave.call(game)).toBe(true);
    expect(snapshots).toEqual([0, 42]);
  });
});
