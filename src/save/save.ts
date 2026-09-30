import { xpForLevel } from '../progression/skills';
import { SKILLS, type Item, type SkillId, type Slot, type Stance } from '../types';

export const SAVE_VERSION = 2;
export const INVENTORY_SIZE = 28;
export const BANK_BASE_SIZE = 120;

export interface Appearance {
  name: string;
  skin: number;
  hair: number;
  hairColor: number;
  beard: number;
  cloth: number;
  cloth2: number;
}

export interface QuestState {
  stage: number;
  done: boolean;
}

/** Render quality preset (see Game.applyGraphics). */
export type Graphics = 'high' | 'medium' | 'low';

export interface SaveData {
  version: number;
  /** Null until character creation is finished. */
  character: Appearance | null;
  skills: Record<SkillId, number>;
  stance: Stance;
  inventory: (Item | null)[];
  equipment: Record<Slot, Item | null>;
  bank: Item[];
  gold: number;
  potions: number;
  potionMax: number;
  /** Unique id / pet id / rare find → times obtained. */
  collection: Record<string, number>;
  /** Enemy id → kill count. */
  kc: Record<string, number>;
  pets: string[];
  activePet: string | null;
  /** Generic counters for diary tasks: "kill:goblin", "mine:iron_ore", "smith:bronze_platebody"… */
  counters: Record<string, number>;
  /** Completed keep restorations. */
  keep: Record<string, boolean>;
  quests: Record<string, QuestState>;
  diary: Record<string, boolean>;
  diaryClaimed: Record<string, boolean>;
  /** Unlocked portal arches. */
  portals: Record<string, boolean>;
  /** Tutorial step index; -1 when finished or skipped. */
  tutorial: number;
  stats: { deaths: number; kills: number; playtime: number; bestBossTime: number | null };
  settings: { volume: number; graphics?: Graphics };
}

export const emptyEquipment = (): Record<Slot, Item | null> => ({
  weapon: null, helm: null, body: null, gloves: null, boots: null, amulet: null, ring: null,
});

export function newSave(): SaveData {
  return {
    version: SAVE_VERSION,
    character: null,
    // Hitpoints starts at level 10, as in OSRS.
    skills: { melee: 0, ranged: 0, magic: 0, defence: 0, hitpoints: xpForLevel(10), mining: 0, smithing: 0 },
    stance: 'aggressive',
    inventory: Array(INVENTORY_SIZE).fill(null),
    equipment: emptyEquipment(),
    bank: [],
    gold: 0,
    potions: 3,
    potionMax: 3,
    collection: {},
    kc: {},
    pets: [],
    activePet: null,
    counters: {},
    keep: {},
    quests: {},
    diary: {},
    diaryClaimed: {},
    portals: {},
    tutorial: 0,
    stats: { deaths: 0, kills: 0, playtime: 0, bestBossTime: null },
    settings: { volume: 0.6 },
  };
}

/** Upgrade any older save to the current shape. Unknown/missing fields fall back to defaults. */
export function migrate(raw: any): SaveData {
  const fresh = newSave();
  if (!raw || typeof raw !== 'object') return fresh;
  const data: SaveData = {
    ...fresh,
    ...raw,
    skills: { ...fresh.skills, ...(raw.skills ?? {}) },
    equipment: { ...fresh.equipment, ...(raw.equipment ?? {}) },
    stats: { ...fresh.stats, ...(raw.stats ?? {}) },
    settings: { ...fresh.settings, ...(raw.settings ?? {}) },
  };
  for (const key of ['collection', 'kc', 'counters', 'keep', 'quests', 'diary', 'diaryClaimed', 'portals'] as const) {
    (data as any)[key] = raw[key] && typeof raw[key] === 'object' ? raw[key] : {};
  }
  for (const s of SKILLS) if (typeof data.skills[s] !== 'number') data.skills[s] = fresh.skills[s];
  data.pets = Array.isArray(raw.pets) ? raw.pets : [];
  data.bank = Array.isArray(raw.bank) ? raw.bank : [];
  const inv: (Item | null)[] = Array.isArray(raw.inventory) ? raw.inventory.slice(0, INVENTORY_SIZE) : fresh.inventory;
  while (inv.length < INVENTORY_SIZE) inv.push(null);
  data.inventory = inv;

  if ((raw.version ?? 1) < 2) {
    // v1 (the combat demo) had no character, keep or bases compatible with Chapter 1.
    // Keep levels, kill counts and the collection log; gear from the demo is retired.
    data.character = null;
    data.inventory = fresh.inventory;
    data.equipment = emptyEquipment();
    data.bank = [];
    data.tutorial = 0;
    data.potionMax = 3;
    data.stance = 'aggressive';
  }
  data.version = SAVE_VERSION;
  return data;
}

export interface SaveBackend {
  read(): Promise<string | null>;
  write(json: string): Promise<void>;
  describe(): string;
}

declare global {
  interface Window {
    electronAPI?: {
      readSave(): Promise<string | null>;
      writeSave(json: string): Promise<boolean>;
      savePath(): Promise<string>;
      inspect?: {
        config(): Promise<string | null>;
        capture(name: string): Promise<boolean>;
        write(name: string, text: string): Promise<boolean>;
        log(text: string): Promise<boolean>;
        done(code?: number): Promise<boolean>;
      };
    };
  }
}

const LS_KEY = 'dragonbound.save';

export function getBackend(): SaveBackend {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (api) {
    return {
      read: () => api.readSave(),
      write: async (json) => void (await api.writeSave(json)),
      describe: () => 'save file',
    };
  }
  // A damaged primary must not hide a usable backup or replace it on the next save.
  const readStoredJson = (key: string): string | null => {
    try {
      const text = localStorage.getItem(key);
      if (!text) return null;
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return text;
    } catch {
      return null;
    }
  };
  return {
    read: async () => readStoredJson(LS_KEY) ?? readStoredJson(LS_KEY + '.backup'),
    write: async (json) => {
      try {
        const prev = readStoredJson(LS_KEY);
        if (prev) localStorage.setItem(LS_KEY + '.backup', prev);
        localStorage.setItem(LS_KEY, json);
      } catch {}
    },
    describe: () => 'browser storage',
  };
}

export async function loadSave(backend: SaveBackend): Promise<SaveData | null> {
  const text = await backend.read();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return migrate(parsed);
  } catch {
    return null;
  }
}
