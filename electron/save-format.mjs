/** Shared structural checks for browser and desktop recovery. Save layout remains v3. */
export const SAVE_VERSION = 3;

const record = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const numericRecord = (value) => record(value) && Object.values(value).every(nonnegative);
const item = (value) => record(value) && typeof value.uid === 'string' && typeof value.base === 'string'
  && ['normal', 'magic', 'rare', 'unique'].includes(value.rarity) && nonnegative(value.ilvl)
  && Array.isArray(value.affixes) && value.affixes.every((a) => record(a) && typeof a.id === 'string' && typeof a.value === 'number' && Number.isFinite(a.value))
  && (value.qty === undefined || (Number.isInteger(value.qty) && value.qty > 0));

export function isSaveCandidate(raw) {
  // An arbitrary object such as {} must never hide a real backup. Older partial saves still work.
  if (!record(raw) || !numericRecord(raw.skills) || !Object.keys(raw.skills).length) return false;
  const version = raw.version ?? 1;
  if (!Number.isInteger(version) || version < 1 || version > SAVE_VERSION) return false;
  if (raw.character != null && (!record(raw.character) || typeof raw.character.name !== 'string'
    || !['skin', 'hair', 'hairColor', 'beard', 'cloth', 'cloth2'].every((key) => nonnegative(raw.character[key])))) return false;
  for (const key of ['gold', 'potions', 'potionMax']) if (raw[key] !== undefined && !nonnegative(raw[key])) return false;
  for (const key of ['collection', 'kc', 'counters']) if (raw[key] !== undefined && !numericRecord(raw[key])) return false;
  for (const key of ['keep', 'diary', 'diaryClaimed', 'portals']) {
    if (raw[key] !== undefined && (!record(raw[key]) || !Object.values(raw[key]).every((value) => typeof value === 'boolean'))) return false;
  }
  if (raw.quests !== undefined && (!record(raw.quests) || !Object.values(raw.quests).every((q) => record(q) && Number.isInteger(q.stage) && q.stage >= 0 && typeof q.done === 'boolean'))) return false;
  if (raw.stats !== undefined && (!record(raw.stats) || !Object.entries(raw.stats).every(([key, value]) => key === 'bestBossTime' && value === null || nonnegative(value)))) return false;
  if (raw.settings !== undefined && !record(raw.settings)) return false;
  if (raw.pets !== undefined && (!Array.isArray(raw.pets) || !raw.pets.every((pet) => typeof pet === 'string'))) return false;
  // v1 gear is retired by migration and need not follow the current item contract.
  if (version >= 2) {
    if (raw.inventory !== undefined && (!Array.isArray(raw.inventory) || !raw.inventory.every((it) => it === null || item(it)))) return false;
    if (raw.bank !== undefined && (!Array.isArray(raw.bank) || !raw.bank.every(item))) return false;
    if (raw.equipment !== undefined && (!record(raw.equipment) || !Object.values(raw.equipment).every((it) => it === null || item(it)))) return false;
  }
  return true;
}

export function parseSave(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return null; }
  // Never replace a save from a newer game with an older backup or fresh character.
  if (record(raw) && typeof raw.version === 'number' && raw.version > SAVE_VERSION) {
    throw new Error('This progress was saved by a newer Dragonbound. Update the game to continue.');
  }
  return isSaveCandidate(raw) ? raw : null;
}
