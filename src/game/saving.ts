import { newSave, type SaveBackend, type SaveData } from '../save/save';
import type { SaveWriter } from '../save/writer';

/** What saving reads and writes on the game (tests run these on stand-ins for it). */
export interface SaveHost {
  save: SaveData;
  backend: SaveBackend;
  saveWriter: SaveWriter;
  /** False once another window has taken over the save (browser only), so stale windows can't overwrite it. */
  ownsSave: boolean;
  savesInFlight: number;
  saveWarned: boolean;
  dirty: boolean;
  saveT: number;
  persist(): Promise<boolean>;
  announce(text: string, kind: string): void;
}

/** In the browser, the newest window owns the save; older windows stop writing. */
export function claimSave(g: SaveHost) {
  if (window.electronAPI) return;
  const key = 'dragonbound.session';
  const id = Math.random().toString(36).slice(2);
  try {
    localStorage.setItem(key, id);
  } catch {
    return;
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== key || e.newValue === id || !g.ownsSave) return;
    g.ownsSave = false;
    g.announce('Dragonbound was opened in another window. This window will no longer save.', 'deny');
  });
}

export async function persist(g: SaveHost): Promise<boolean> {
  g.saveT = 20;
  g.dirty = false;
  if (!g.save.character || !g.ownsSave) return true;
  g.savesInFlight++;
  try {
    const json = JSON.stringify(g.save);
    // Browser storage writes synchronously, including the beforeunload handler.
    await (window.electronAPI ? g.saveWriter.write(json) : g.backend.write(json));
    g.saveWarned = false;
    return true;
  } catch {
    g.dirty = true;
    g.saveT = 20; // The normal dirty-save grace retries after three seconds, not every frame.
    if (!g.saveWarned) g.announce('Your progress could not be saved. Keep the game open; it will try again.', 'deny');
    g.saveWarned = true;
    return false;
  } finally { g.savesInFlight--; }
}

/** Finish saving any progress earned while an earlier close-time snapshot was being written. */
export async function flushSave(g: Pick<SaveHost, 'persist' | 'dirty'>): Promise<boolean> {
  do { if (!await g.persist()) return false; } while (g.dirty);
  return true;
}

export async function resetSave(g: SaveHost) {
  const previous = g.save;
  g.save = newSave();
  try {
    await g.saveWriter.write(JSON.stringify(g.save));
    location.reload();
  } catch {
    g.save = previous;
    g.announce('Your progress could not be reset. Please try again.', 'deny');
  }
}
