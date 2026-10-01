import { describe, expect, it } from 'vitest';
import { levelForXp, levelProgress, xpForLevel } from '../src/progression/skills';
import { mulberry32 } from '../src/core/rng';
import { rollDrops } from '../src/loot/drops';
import { generateItem, makeMasterwork, rollAffixes, stacksInBank, makeItem } from '../src/loot/itemGen';
import { combatLevel, combatXpSplit, computeStats, swingConnects, swingTrackStep } from '../src/combat/stats';
import { mitigate, rollHit } from '../src/combat/damage';
import { migrate, newSave, SAVE_VERSION } from '../src/save/save';
import { AFFIXES } from '../src/data/affixes';
import { BASES, PIECES, TIERS, TIER_ORDER, UNIQUES, pieceId } from '../src/data/items';
import { ORES, mineChance } from '../src/data/ores';
import { RECIPE_LIST, masterworkChance } from '../src/data/recipes';
import { RESTORATIONS, RESTORATION_BY_ID } from '../src/data/keep';
import { DIARY_TASKS } from '../src/data/diary';
import { ENEMIES } from '../src/data/enemies';
import { DROP_TABLES } from '../src/data/dropTables';
import { KEEP_STAGE, ZONES } from '../src/data/zones';
import { STAGE_CAMERAS } from '../src/data/zoneMaps';
import { XP_TUNING } from '../src/data/tuning';
import { Cell } from '../src/world/layout';
import { NavGrid } from '../src/world/navgrid';

const LV = (o: Partial<Record<string, number>> = {}) => ({ melee: 1, ranged: 1, magic: 1, defence: 1, hitpoints: 10, mining: 1, smithing: 1, ...o });

describe('xp curve', () => {
  it('matches the OSRS table', () => {
    expect(xpForLevel(2)).toBe(83);
    expect(xpForLevel(10)).toBe(1154);
    expect(xpForLevel(50)).toBe(101333);
    expect(xpForLevel(99)).toBe(13034431);
  });
  it('maps xp back to levels', () => {
    expect(levelForXp(82)).toBe(1);
    expect(levelForXp(83)).toBe(2);
    expect(levelForXp(200_000_000)).toBe(99);
    expect(levelProgress(xpForLevel(10) + 10).level).toBe(10);
  });
});

describe('combat', () => {
  it('rolls within range and crits multiply', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 500; i++) {
      const h = rollHit(rng, 3, 6, 1, 0, 1.5);
      expect(h.amount).toBeGreaterThanOrEqual(3);
      expect(h.amount).toBeLessThanOrEqual(6);
    }
    expect(rollHit(rng, 10, 10, 1, 0, 2, true).amount).toBe(20);
  });
  it('armour has diminishing returns and never zeroes damage', () => {
    expect(mitigate(10, 50)).toBe(5);
    expect(mitigate(1, 1000)).toBe(1);
  });
  it('a fresh hero fights with fists and no armour', () => {
    const st = computeStats(LV(), newSave().equipment);
    expect(st.style).toBe('melee');
    expect(st.maxHp).toBe(100);
    expect(st.armor).toBe(0);
    expect(st.dmgMax).toBe(3);
  });
  it('defence level and armour pieces add armour', () => {
    const eq = { body: makeItem('iron_platebody') };
    const st = computeStats(LV({ defence: 21 }), eq);
    expect(st.armor).toBe(10 + BASES.iron_platebody.armor!);
  });
  it('combat xp goes to the weapon style, with fixed shares for Hitpoints and Defence (no stance)', () => {
    for (const style of ['melee', 'ranged', 'magic'] as const) {
      const split = Object.fromEntries(combatXpSplit(style, 60));
      expect(split[style]).toBe(60);
      expect(split.hitpoints).toBeCloseTo(60 * XP_TUNING.hitpointsShare);
      expect(split.defence).toBeCloseTo(60 * XP_TUNING.defenceShare);
      // The other two styles get nothing.
      expect(Object.keys(split).sort()).toEqual([style, 'defence', 'hitpoints'].sort());
    }
    // Defence trails the weapon style but keeps up: armour tiers ask the same levels as weapons.
    expect(XP_TUNING.defenceShare).toBeGreaterThanOrEqual(0.3);
    expect(XP_TUNING.defenceShare).toBeLessThan(1);
  });
  it('combat level sits on the 1-99 scale: 3 for a new hero, 99 when maxed', () => {
    expect(combatLevel(LV({ hitpoints: 10 }))).toBe(3);
    expect(combatLevel(LV({ melee: 99, ranged: 99, magic: 99, defence: 99, hitpoints: 99 }))).toBe(99);
    // Only the best weapon style counts.
    expect(combatLevel(LV({ melee: 40, ranged: 10, defence: 30, hitpoints: 30 }))).toBe(35);
  });
  it('a melee swing steps after a target backing out of reach, and still lands a little past reach', () => {
    const reach = 2.3;
    expect(swingTrackStep(1.8, reach, 1 / 60)).toBe(0);
    const step = swingTrackStep(2.6, reach, 1 / 60);
    expect(step).toBeGreaterThan(0);
    // Faster than a kobold backs off (85% of its walk), so the gap closes during the wind-up.
    expect(step * 60).toBeGreaterThan(ENEMIES.kobold.speed * 0.85);
    expect(swingConnects(2.3 + 0.7, 1.9, 0.4)).toBe(true);
    expect(swingConnects(2.3 + 1.2, 1.9, 0.4)).toBe(false);
  });
});

describe('items & loot', () => {
  it('every tier has every piece, with requirements that climb', () => {
    for (const t of TIER_ORDER) for (const p of PIECES) expect(BASES[pieceId(t, p.key)], pieceId(t, p.key)).toBeDefined();
    expect(BASES.steel_sword.req).toEqual({ skill: 'melee', level: TIERS.steel.req });
    expect(BASES.steel_platebody.req).toEqual({ skill: 'defence', level: TIERS.steel.req });
    expect(BASES.bronze_pickaxe.kind).toBe('tool');
  });
  it('steel trim is a lighter steel tone, not gold', () => {
    const rgb = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
    const { main, trim } = TIERS.steel.palette;
    const [r, g, b] = rgb(trim);
    expect((Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b)).toBeLessThan(0.15);
    expect(r + g + b).toBeGreaterThan(rgb(main).reduce((a, c) => a + c, 0));
  });
  it('uniques reference real bases', () => {
    for (const u of Object.values(UNIQUES)) expect(BASES[u.base], u.id).toBeDefined();
  });
  it('generated gear is valid with the right affix counts', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const rarity = (['normal', 'magic', 'rare'] as const)[i % 3];
      const item = generateItem(rng, 1 + (i % 20), rarity);
      const base = BASES[item.base];
      expect(base.kind).toBe('gear');
      expect(base.minIlvl!).toBeLessThanOrEqual(item.ilvl);
      const n = item.affixes.length;
      if (rarity === 'normal') expect(n).toBe(0);
      if (rarity === 'magic') expect(n >= 1 && n <= 2).toBe(true);
      if (rarity === 'rare') expect(n >= 3 && n <= 4).toBe(true);
      for (const a of item.affixes) expect(AFFIXES[a.id].slots).toContain(base.slot);
    }
  });
  it('affix values grow with item level', () => {
    const rng = mulberry32(3);
    const sum = (ilvl: number) => Array.from({ length: 300 }, () => rollAffixes(rng, 'body', ilvl, 6).find((a) => a.id === 'life')?.value ?? 0).reduce((a, b) => a + b, 0);
    expect(sum(20)).toBeGreaterThan(sum(1));
  });
  it('boss uniques and pet drop at their listed rates (statistical)', () => {
    const rng = mulberry32(42);
    const kills = 200_000;
    let uniques = 0, pets = 0;
    for (let i = 0; i < kills; i++) {
      const d = rollDrops(rng, 'cinderwing', 20);
      uniques += d.items.filter((it) => it.rarity === 'unique').length;
      if (d.pet) pets++;
    }
    expect(Math.abs(uniques - kills * (5 / 64)) / (kills * (5 / 64))).toBeLessThan(0.03);
    expect(Math.abs(pets - kills / 1000) / (kills / 1000)).toBeLessThan(0.2);
  }, 60_000);
  it('drop tables only reference real items', () => {
    for (const t of Object.values(DROP_TABLES)) {
      for (const m of t.materials ?? []) expect(BASES[m.id], m.id).toBeDefined();
      for (const u of t.uniques ?? []) expect(UNIQUES[u.id], u.id).toBeDefined();
    }
    for (const e of Object.values(ENEMIES)) expect(DROP_TABLES[e.drop], e.id).toBeDefined();
  });
  it('plain items stack in the bank; rolled items do not', () => {
    expect(stacksInBank(makeItem('iron_ore'))).toBe(true);
    expect(stacksInBank(makeItem('bronze_sword'))).toBe(true);
    expect(stacksInBank(makeMasterwork(mulberry32(1), 'bronze_sword', 30))).toBe(false);
  });
});

describe('mining', () => {
  it('success chance rises with level and is zero below the requirement', () => {
    expect(mineChance(ORES.iron, 14)).toBe(0);
    expect(mineChance(ORES.iron, 15)).toBeGreaterThan(0.3);
    expect(mineChance(ORES.iron, 60)).toBeGreaterThan(mineChance(ORES.iron, 30));
    expect(mineChance(ORES.copper, 99)).toBeCloseTo(ORES.copper.high);
  });
  it('XP/hour lands in an OSRS-like range', () => {
    // Bronze pickaxe (5 ticks/swing), copper at level 1; iron pickaxe (4 ticks), iron at 30. Walking ignored.
    const perHour = (ore: keyof typeof ORES, lvl: number, ticks: number) => (3600 / (ticks * 0.6)) * mineChance(ORES[ore], lvl) * ORES[ore].xp * XP_TUNING.mining;
    const early = perHour('copper', 1, 5), mid = perHour('iron', 30, 4);
    expect(early).toBeGreaterThan(3_000);
    expect(early).toBeLessThan(10_000);
    expect(mid).toBeGreaterThan(early);
  });
});

describe('pacing', () => {
  it('early combat levels take real effort (per-enemy XP, not per-damage)', () => {
    const goblin = ENEMIES.goblin.xp;
    // Kills are slower since the Diablo 2 pacing, so each is worth a little more (tests/balance.test.ts
    // keeps XP per hour where it was); the kill counts still make early levels a real grind.
    expect(xpForLevel(10) / goblin).toBeGreaterThan(80);
    expect(xpForLevel(30) / ENEMIES.drakeling.xp).toBeGreaterThan(450);
    // Enemy XP stays well below the old 4-XP-per-hitpoint rate.
    for (const e of Object.values(ENEMIES)) expect(e.xp, e.id).toBeLessThan(e.hp * 4 * 0.5);
  });
  it('a Cinderwing kill is a meaningful chunk but not a level skip at 30', () => {
    const at30 = xpForLevel(31) - xpForLevel(30);
    expect(ENEMIES.cinderwing.xp).toBeLessThan(at30);
  });
});

describe('smithing', () => {
  it('every recipe uses real items and outputs a real item', () => {
    for (const r of RECIPE_LIST) {
      expect(BASES[r.out], r.id).toBeDefined();
      for (const id of Object.keys(r.inputs)) expect(BASES[id], `${r.id} input ${id}`).toBeDefined();
      if (r.needs) expect(RESTORATION_BY_ID[r.needs], r.id).toBeDefined();
    }
  });
  it('every smithable piece has exactly one recipe and costs its tier bar', () => {
    for (const t of TIER_ORDER) for (const p of PIECES) {
      const rs = RECIPE_LIST.filter((r) => r.out === pieceId(t, p.key));
      expect(rs.length).toBe(1);
      expect(rs[0].inputs[TIERS[t].bar]).toBe(p.bars);
    }
  });
  it('masterwork odds are zero at the requirement and capped', () => {
    const r = RECIPE_LIST.find((x) => x.out === 'iron_sword')!;
    expect(masterworkChance(r.level, r)).toBe(0);
    expect(masterworkChance(99, r)).toBeLessThanOrEqual(0.06);
    expect(masterworkChance(99, RECIPE_LIST.find((x) => x.out === 'iron_bar')!)).toBe(0);
  });
});

describe('keep, quests & diary data', () => {
  it('restorations reference real items and prerequisites', () => {
    for (const r of RESTORATIONS) {
      for (const id of Object.keys(r.cost)) expect(BASES[id], `${r.id} cost ${id}`).toBeDefined();
      for (const a of r.after ?? []) expect(RESTORATION_BY_ID[a], `${r.id} after ${a}`).toBeDefined();
    }
  });
  it('diary counters reference things that exist', () => {
    for (const t of DIARY_TASKS) {
      if (t.check.type !== 'count') continue;
      const [kind, id] = t.check.key.split(':');
      if (kind === 'kill') expect(ENEMIES[id], t.id).toBeDefined();
      if (kind === 'mine' || kind === 'smith') expect(BASES[id], t.id).toBeDefined();
    }
  });
});

describe('save', () => {
  it('round-trips and fills missing fields', () => {
    const s = newSave();
    s.gold = 123;
    s.character = { name: 'Test', skin: 1, hair: 1, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 };
    expect(migrate(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const partial = migrate({ version: 2, gold: 5, skills: { melee: 500 } });
    expect(partial.skills.hitpoints).toBe(1154);
    expect(partial.skills.mining).toBe(0);
    expect(partial.inventory.length).toBe(28);
  });
  it('drops the old combat stance from a v2 save and keeps everything else', () => {
    const v2 = { ...JSON.parse(JSON.stringify(newSave())), version: 2, stance: 'defensive', gold: 42 };
    const s = migrate(v2);
    expect('stance' in s).toBe(false);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.gold).toBe(42);
  });
  it('migrates a v1 (combat demo) save: keeps levels and logs, retires old gear', () => {
    const v1 = { version: 1, skills: { melee: 5000, ranged: 0, magic: 0, hitpoints: 3000 }, gold: 77, kc: { goblin: 12 }, collection: { cinderfang: 1 }, inventory: [{ uid: 'a', base: 'rusty_sword', rarity: 'normal', ilvl: 1, affixes: [] }], equipment: { weapon: { uid: 'b', base: 'drakesteel_sword', rarity: 'normal', ilvl: 1, affixes: [] } } };
    const s = migrate(v1);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.skills.melee).toBe(5000);
    expect(s.skills.defence).toBe(0);
    expect(s.kc.goblin).toBe(12);
    expect(s.collection.cinderfang).toBe(1);
    expect(s.gold).toBe(77);
    expect(s.equipment.weapon).toBeNull();
    expect(s.inventory.every((i) => i === null)).toBe(true);
    expect(s.character).toBeNull();
    expect(s.tutorial).toBe(0);
  });
});

describe('zones', () => {
  for (const def of Object.values(ZONES)) {
    it(`${def.id}: entry reaches every station, node and pack`, () => {
      const L = def.build(1000 + def.id.length * 97);
      const nav = new NavGrid(L.w, L.h, L.cells);
      const e = L.entry;
      expect(nav.isWalkable(e.x, e.z), 'entry walkable').toBe(true);
      const targets = [...L.stations.map((s) => ({ ...s, what: `${s.kind}:${s.id}` })), ...L.nodes.map((n) => ({ ...n, what: `rock:${n.ore}` })), ...L.packs.map((p) => ({ ...p, what: 'pack' }))];
      if (L.boss) targets.push({ x: L.boss.x, z: L.boss.z, what: 'boss' } as any);
      for (const t of targets) {
        const path = nav.findPath(e.x, e.z, t.x, t.z, 400000);
        expect(path, `${def.id} → ${t.what} at ${t.x},${t.z}`).not.toBeNull();
        const end = path![path!.length - 1];
        expect(Math.hypot(end.x - t.x, end.z - t.z), `${def.id} reach ${t.what}`).toBeLessThan(3.8);
      }
    });
  }
  it('keeps every staging camera spot clear (a prop at the camera gets sliced by the near plane)', () => {
    const L = ZONES.keep.build(1000 + 'keep'.length * 97);
    for (const c of STAGE_CAMERAS) {
      const cx = KEEP_STAGE.x + c.x, cz = KEEP_STAGE.z + c.z;
      for (const o of [...L.props, ...L.stations]) {
        expect(Math.hypot(o.x - cx, o.z - cz), `${'kind' in o ? o.kind : ''} at ${o.x},${o.z} vs camera ${cx},${cz}`).toBeGreaterThan(2.6);
      }
      const cell = L.cells[Math.floor(cz) * L.w + Math.floor(cx)];
      expect(cell === Cell.Tree || cell === Cell.Rock, `scenery at camera ${cx},${cz}`).toBe(false);
    }
  });
  it('the keep island has void around it and walkable ground in the middle', () => {
    const L = ZONES.keep.build(1);
    expect(L.cells[0]).toBe(Cell.Void);
    expect(L.cells[Math.floor(L.entry.z) * L.w + Math.floor(L.entry.x)]).toBe(Cell.Ground);
  });
});
