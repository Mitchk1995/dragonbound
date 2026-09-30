import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBackend, loadSave, newSave } from '../src/save/save';

const PRIMARY = 'dragonbound.save';
const BACKUP = PRIMARY + '.backup';

function characterSave(name: string) {
  const save = newSave();
  save.character = { name, skin: 1, hair: 2, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 };
  save.gold = 1234;
  save.skills.mining = 5000;
  return JSON.stringify(save);
}

describe('browser save recovery', () => {
  let stored: Map<string, string>;

  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('prefers a valid primary save over an older backup', async () => {
    stored.set(PRIMARY, characterSave('Current'));
    stored.set(BACKUP, characterSave('Older'));
    expect((await loadSave(getBackend()))?.character?.name).toBe('Current');
  });

  it.each(['{"character":', ''])('recovers the character and progress when the primary is corrupt or empty (%j)', async (bad) => {
    stored.set(PRIMARY, bad);
    stored.set(BACKUP, characterSave('Recovered'));
    const recovered = await loadSave(getBackend());
    expect(recovered?.character?.name).toBe('Recovered');
    expect(recovered?.gold).toBe(1234);
    expect(recovered?.skills.mining).toBe(5000);
  });

  it('loads a backup when the primary is absent', async () => {
    stored.set(BACKUP, characterSave('Recovered'));
    expect((await loadSave(getBackend()))?.character?.name).toBe('Recovered');
  });

  it('returns no save when neither stored copy is valid', async () => {
    stored.set(PRIMARY, '{');
    stored.set(BACKUP, '{');
    expect(await loadSave(getBackend())).toBeNull();
  });

  it('keeps the last good backup when saving after recovery from corruption', async () => {
    const lastGood = characterSave('Recovered');
    stored.set(PRIMARY, '{"character":');
    stored.set(BACKUP, lastGood);
    await getBackend().write(characterSave('New progress'));
    expect(stored.get(BACKUP)).toBe(lastGood);
    expect((await loadSave(getBackend()))?.character?.name).toBe('New progress');
  });

  it('backs up a valid previous primary before writing new progress', async () => {
    const previous = characterSave('Previous');
    stored.set(PRIMARY, previous);
    await getBackend().write(characterSave('New progress'));
    expect(stored.get(BACKUP)).toBe(previous);
    expect((await loadSave(getBackend()))?.character?.name).toBe('New progress');
  });

  it('returns no save instead of throwing when browser storage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage disabled'); },
      setItem: () => { throw new Error('Storage disabled'); },
    });
    expect(await loadSave(getBackend())).toBeNull();
    await expect(getBackend().write(characterSave('New progress'))).resolves.toBeUndefined();
  });
});
