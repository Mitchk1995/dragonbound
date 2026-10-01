/**
 * A small deterministic combat simulation for balance work (no renderer, no DOM, seeded RNG).
 *
 * It clears a zone's real packs (positions from the zone builder, compositions from data/zones)
 * with a hero of a given style and level wearing the tier-appropriate weapon, and reports kills
 * per minute, XP per hour and how mana behaves. Fights are stepped at 30 Hz on a flat plane:
 * enemies move with their real behaviours (chasers close in, kiters and casters keep their
 * distance, lungers wind up and dash), the hero follows a simple greedy policy (cast every useful
 * skill it can afford, otherwise basic-attack the nearest enemy), and hits roll through the
 * game's own `rollHit` / `mitigate` / `computeStats`.
 *
 * Besides XP it counts what the hero would face: the raw damage enemies' attacks would deal
 * (chasers and Cinderwing always connect, a lunge connects if it reaches, a kobold's stone and a
 * cultist's fire circle are partly dodged: KITER_HITS / CASTER_HITS), which sets how much Defence
 * XP armour absorption is worth, and melee swings that whiffed on the enemy they were aimed at.
 *
 * Deliberately left out: the hero never dies or drinks (damage is counted, not applied), projectile
 * flight time, knockback, terrain. Those change absolute numbers a little, not the conclusions.
 */
import { computeStats, castTime, swingConnects, swingTiming, swingTrackStep, type CastSkill, type PlayerStats } from '../../src/combat/stats';
import { mitigate, rollHit } from '../../src/combat/damage';
import { mulberry32, type Rng } from '../../src/core/rng';
import { abilitiesFor, type AbilityDef } from '../../src/data/abilities';
import { ENEMIES, type EnemyDef } from '../../src/data/enemies';
import { BASES } from '../../src/data/items';
import { COMBAT_TUNING, MANA_TUNING } from '../../src/data/tuning';
import { shapeContains } from '../../src/fx/telegraph';
import { makeItem } from '../../src/loot/itemGen';
import type { SkillId, Style } from '../../src/types';

const HERO_R = 0.45;
const DT = 1 / 30;
/** Walking paths wind around trees and cliffs: route length vs the straight line. */
const PATH_FACTOR = 1.25;
/** The hero stops walking and the pack wakes at about this distance (enemy aggro is 9-12). */
const ENGAGE = 9;
/** Pack clearings are about this wide (Gen.pack `clear`); a retreating enemy stops at the edge. */
const CLEARING = 7;
/** Units walked per kill to pick up its drops. */
const LOOT_WALK = 1.5;
/** Seconds to portal out and back in (the keep round trip) after a full clear. */
const RESET_SECS = 20;
/** Share of kobold stones and cultist fire circles that land on a hero who mostly keeps attacking. */
const KITER_HITS = 0.6;
const CASTER_HITS = 0.35;
/**
 * Cinderwing (ai/boss.ts): an attack every telegraph plus 1.3-2.0 s (x0.7 in phase 2), and each one
 * costs the hero about this long stepping out of its shape instead of attacking. Below half life it
 * takes to the sky every 22 s for the flight and landing, out of reach.
 */
const BOSS_TELEGRAPH = 1.35;
const BOSS_DODGE = 0.6;
const BOSS_FLIGHT_EVERY = 22;

export interface Pacing {
  name: string;
  mana: boolean;
  stagger: boolean;
  heroMove: number;
  weaponSpeed: (baseId: string) => number;
  swing: (atkSpeed: number) => { dur: number; hitAt: number; interval: number };
  /** Skill animation length (s) and when it lands (s). */
  cast: (id: CastSkill) => { dur: number; hitAt: number };
  leapDur: number;
  enemySpeed: (e: EnemyDef) => number;
  lunge: { windup: number; dash: number; speed: number; recover: number };
}

export const NOW: Pacing = {
  name: 'now',
  mana: true,
  stagger: true,
  heroMove: COMBAT_TUNING.hero.moveSpeed,
  weaponSpeed: (id) => BASES[id].speed!,
  swing: (s) => {
    const t = swingTiming(s);
    return { dur: t.dur, hitAt: t.impactAt, interval: t.interval };
  },
  cast: (id) => {
    const dur = castTime(id, 1);
    return { dur, hitAt: dur * COMBAT_TUNING.impact };
  },
  leapDur: COMBAT_TUNING.leapDur,
  enemySpeed: (e) => e.speed,
  lunge: { windup: COMBAT_TUNING.enemy.lungeWindup, dash: COMBAT_TUNING.enemy.lungeDash, speed: COMBAT_TUNING.enemy.lungeSpeed, recover: COMBAT_TUNING.enemy.lungeRecover },
};

/** The weapon a hero of this style and level would carry (the best one they can wield). */
export function weaponFor(style: Style, level: number): string {
  if (style === 'melee') {
    const tier = level >= 30 ? 'ember' : level >= 20 ? 'steel' : level >= 10 ? 'iron' : 'bronze';
    return `${tier}_${level >= 10 ? 'longsword' : 'sword'}`;
  }
  if (style === 'ranged') return level >= 30 ? 'drakebone_bow' : level >= 20 ? 'recurve_bow' : level >= 10 ? 'hunter_bow' : 'worn_bow';
  return level >= 30 ? 'ember_staff' : level >= 20 ? 'runed_staff' : level >= 10 ? 'oak_staff' : 'apprentice_staff';
}

interface Foe {
  def: EnemyDef;
  x: number;
  z: number;
  hp: number;
  dead: boolean;
  stagger: number;
  slowT: number;
  atkCd: number;
  lunge: { t: number; dx: number; dz: number; hit?: boolean } | null;
  recover: number;
  /** Cinderwing: seconds left in the air (untouchable), phase 2 reached, time to the next flight. */
  away: number;
  phase2: boolean;
  flightCd: number;
}

interface Action {
  t: number;
  dur: number;
  hitAt: number;
  fired: boolean;
  onHit: () => void;
  /** Melee swings follow their target through the wind-up (Player.update). */
  track?: { f: Foe; reach: number };
}

export interface PackResult {
  comp: string[];
  fightSecs: number;
  travelSecs: number;
  xp: number;
  kills: number;
  manaAtStart: number;
}

export interface ClearResult {
  style: Style;
  level: number;
  pacing: string;
  weapon: string;
  packs: PackResult[];
  /** Raw damage enemies' attacks would deal per hour (before armour). */
  incomingPerHour: number;
  /** Melee basic attacks, and how many missed the enemy they were aimed at. */
  swings: number;
  whiffs: number;
  totalSecs: number;
  fightSecs: number;
  kills: number;
  xp: number;
  killsPerMin: number;
  xpPerHour: number;
  /** Skill casts per minute of fighting. */
  castsPerMin: number;
  /** Mana spent per minute of fighting. */
  manaPerMin: number;
  /** Share of wanted skill casts that were refused for lack of mana. */
  manaBlocked: number;
  /** Share of fighting time spent with less mana than the cheapest damaging skill costs. */
  dryTime: number;
  maxMana: number;
  manaRegen: number;
}

export interface SimOptions {
  pacing: Pacing;
  style: Style;
  level: number;
  /** Pack positions and compositions, in visiting order; `x`,`z` in zone units. */
  packs: { x: number; z: number; comp: string[] }[];
  /** Where the hero enters (and returns to, to reset the instance). */
  entry: { x: number; z: number };
  seed?: number;
  /** Skip the walk between packs (back-to-back fights: the sustained-spam case). */
  noTravel?: boolean;
  /** Override MANA_TUNING-derived pool / regen (for exploring). */
  mana?: { max: number; regen: number; ooc: number; costs?: Record<string, number> };
  /** Per-enemy XP to use instead of data/enemies.ts (the values from before a retune, say). */
  xp?: Record<string, number>;
  /** No clearing edge: a retreating enemy can back off as far as it likes (open ground). */
  openGround?: boolean;
  /** Leave out the wind-up step after a retreating target (how melee swings worked before). */
  noTrack?: boolean;
}

const levelsAt = (style: Style, level: number): Record<SkillId, number> => ({
  melee: style === 'melee' ? level : 1, ranged: style === 'ranged' ? level : 1, magic: style === 'magic' ? level : 1,
  defence: level, hitpoints: Math.max(10, level), mining: 1, smithing: 1,
});

/** Order packs as a player would clear them: nearest unvisited first, starting at the entry. */
export function tour<T extends { x: number; z: number }>(entry: { x: number; z: number }, packs: T[]): T[] {
  const left = [...packs];
  const out: T[] = [];
  let at: { x: number; z: number } = entry;
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (Math.hypot(left[i].x - at.x, left[i].z - at.z) < Math.hypot(left[bi].x - at.x, left[bi].z - at.z)) bi = i;
    const next = left.splice(bi, 1)[0];
    out.push(next);
    at = next;
  }
  return out;
}

export function simulateClear(o: SimOptions): ClearResult {
  const P = o.pacing;
  const rng: Rng = mulberry32(o.seed ?? 7);
  const levels = levelsAt(o.style, o.level);
  const weapon = weaponFor(o.style, o.level);
  const baseItem = makeItem(weapon);
  const equip = { weapon: baseItem };
  const speedOverride = (st: PlayerStats) => ({ ...st, atkSpeed: Math.min(COMBAT_TUNING.maxAtkSpeed, P.weaponSpeed(weapon) * (st.atkSpeed / BASES[weapon].speed!)) });
  const plain = speedOverride(computeStats(levels, equip));
  const cried = speedOverride(computeStats(levels, equip, { warCry: true }));
  const maxMana = o.mana?.max ?? plain.maxMana;
  const regen = o.mana?.regen ?? plain.manaRegen;
  const oocRegen = o.mana?.ooc ?? MANA_TUNING.outOfCombatFrac * maxMana;
  const costOf = (a: AbilityDef) => o.mana?.costs?.[a.id] ?? a.mana;
  const skills = abilitiesFor(o.style).filter((a) => a.unlock <= o.level && a.id !== 'evasive_roll');
  const cheapest = Math.min(...skills.map((a) => costOf(a)));

  let mana = maxMana;
  let casts = 0, spent = 0, wanted = 0, blocked = 0, dry = 0;
  let incoming = 0, swings = 0, whiffs = 0;
  const avgDmg = (e: EnemyDef) => (e.dmg[0] + e.dmg[1]) / 2;
  const packs: PackResult[] = [];
  let at = { ...o.entry };
  let fightTotal = 0, travelTotal = 0;

  const walk = (dist: number) => {
    const secs = (dist * PATH_FACTOR) / P.heroMove;
    // Mana refills on the way: combat regen, plus the out-of-combat bonus once a few seconds pass.
    const quiet = Math.max(0, secs - MANA_TUNING.outOfCombatAfter);
    if (P.mana) mana = Math.min(maxMana, mana + regen * secs + oocRegen * quiet);
    return secs;
  };

  for (const pk of o.packs) {
    const leg = Math.max(0, Math.hypot(pk.x - at.x, pk.z - at.z) - ENGAGE);
    const travelSecs = o.noTravel ? 0 : walk(leg);
    const manaAtStart = mana;
    // Place the hero ENGAGE units from the pack centre, on the side they arrived from.
    const ax = at.x - pk.x, az = at.z - pk.z, ad = Math.hypot(ax, az) || 1;
    const hero = { x: pk.x + (ax / ad) * ENGAGE, z: pk.z + (az / ad) * ENGAGE };
    const foes: Foe[] = pk.comp.map((id, i) => {
      const a = (i / pk.comp.length) * Math.PI * 2 + rng() * 0.5;
      const r = 1.5 + rng() * 2.5;
      const def = ENEMIES[id];
      return { def, x: pk.x + Math.cos(a) * r, z: pk.z + Math.sin(a) * r, hp: def.hp, dead: false, stagger: 0, slowT: 0, atkCd: rng() / def.atkSpeed, lunge: null, recover: 0, away: 0, phase2: false, flightCd: 0 };
    });
    let action: Action | null = null;
    // Set from inside the skill closures, so TS can't see it change: keep the declared type.
    let dash = null as { t: number; dur: number; fx: number; fz: number; tx: number; tz: number; onEnd: () => void } | null;
    let attackCd = 0, warCryT = 0, dodgeT = 0;
    const cds: Record<string, number> = {};
    const blockedAt: Record<string, number> = {};
    let t = 0, xp = 0, kills = 0;
    const alive = () => foes.filter((f) => !f.dead);
    const dist = (f: { x: number; z: number }) => Math.hypot(f.x - hero.x, f.z - hero.z);

    const hit = (f: Foe, mult: number, tick = false) => {
      if (f.dead || f.away > 0) return;
      const st = warCryT > 0 ? cried : plain;
      const h = rollHit(rng, st.dmgMin, st.dmgMax, mult, st.critChance, st.critMult);
      const dealt = Math.min(f.hp, mitigate(h.amount, f.def.armor));
      f.hp -= dealt;
      xp += ((o.xp?.[f.def.id] ?? f.def.xp) * dealt) / f.def.hp;
      if (P.stagger && !tick && f.hp > 0 && f.def.behavior !== 'boss' && (dealt >= f.def.hp * COMBAT_TUNING.stagger.frac || (h.crit && !f.def.elite))) {
        f.stagger = COMBAT_TUNING.stagger.secs;
        f.lunge = null;
      }
      if (f.hp <= 0) {
        f.dead = true;
        kills++;
      }
    };
    const inRadius = (x: number, z: number, r: number) => alive().filter((f) => Math.hypot(f.x - x, f.z - z) < r + f.def.radius);
    const inCone = (dir: number, r: number, angle: number) => alive().filter((f) => shapeContains({ kind: 'cone', r, angle, dir }, hero.x, hero.z, f.x, f.z, f.def.radius));
    const nearest = () => alive().sort((a, b) => dist(a) - dist(b))[0];
    const densest = (r: number) => {
      let best: Foe | null = null, bn = 0;
      for (const f of alive()) {
        const n = inRadius(f.x, f.z, r).length;
        if (n > bn) {
          bn = n;
          best = f;
        }
      }
      return { f: best, n: bn };
    };
    /** Enemies each of a fan of arrows would hit (first `pierce + 1` along its line). */
    const fan = (dir: number, count: number, spread: number, pierce: number, reach: number) => {
      let n = 0;
      for (let i = -(count - 1) / 2; i <= (count - 1) / 2; i++) {
        const a = dir + i * spread, cx = Math.cos(a), cz = Math.sin(a);
        const on = alive()
          .map((f) => ({ f, along: (f.x - hero.x) * cx + (f.z - hero.z) * cz, off: Math.abs(-(f.x - hero.x) * cz + (f.z - hero.z) * cx) }))
          .filter((c) => c.along > 0 && c.along < reach && c.off < c.f.def.radius + 0.35)
          .sort((p, q) => p.along - q.along)
          .slice(0, pierce + 1);
        n += on.length;
      }
      return n;
    };
    const faceDir = (f: { x: number; z: number }) => Math.atan2(f.z - hero.z, f.x - hero.x);
    const start = (id: CastSkill, onHit: () => void) => {
      const c = P.cast(id);
      action = { t: 0, dur: c.dur, hitAt: c.hitAt, fired: false, onHit };
    };

    /** Try the style's skills in priority order; true if one was cast. */
    const trySkill = (): boolean => {
      const target = nearest();
      if (!target) return false;
      const d = dist(target);
      const dir = faceDir(target);
      const wants: { def: AbilityDef; go: () => void }[] = [];
      const want = (id: string, ok: boolean, go: () => void) => {
        const def = skills.find((s) => s.id === id);
        if (def && ok && (cds[id] ?? 0) <= 0) wants.push({ def, go });
      };
      const range = plain.range;
      // Area skills want a group; a big single target (mini-boss, Cinderwing) is worth them alone.
      const big = !!target.def.elite || target.def.behavior === 'boss';
      const many = (n: number) => n >= 2 || big;
      if (o.style === 'melee') {
        want('war_cry', warCryT <= 0 && many(inRadius(hero.x, hero.z, 5).length), () => start('war_cry', () => (warCryT = 6)));
        const cl = densest(3);
        want('leap_slam', !!cl.f && many(cl.n) && dist(cl.f) > 3 && dist(cl.f) < 7.5, () => {
          const tx = cl.f!.x, tz = cl.f!.z;
          dash = { t: 0, dur: P.leapDur, fx: hero.x, fz: hero.z, tx, tz, onEnd: () => inRadius(hero.x, hero.z, 3).forEach((f) => hit(f, 2.2)) };
        });
        want('cleave', d < 3.2 + target.def.radius && many(inCone(dir, 3.2, Math.PI * 1.1).length), () => start('cleave', () => inCone(dir, 3.2, Math.PI * 1.1).forEach((f) => hit(f, 1.6))));
      } else if (o.style === 'ranged') {
        const cl = densest(3.2);
        want('arrow_rain', !!cl.f && many(cl.n) && dist(cl.f) < range, () => {
          const x = cl.f!.x, z = cl.f!.z;
          start('arrow_rain', () => rains.push({ x, z, t: 0, next: 0 }));
        });
        want('multishot', d < range && many(fan(dir, 5, 0.16, 1, range + 4)), () => start('multishot', () => {
          for (let i = -2; i <= 2; i++) {
            const a = dir + i * 0.16, cx = Math.cos(a), cz = Math.sin(a);
            alive()
              .map((f) => ({ f, along: (f.x - hero.x) * cx + (f.z - hero.z) * cz, off: Math.abs(-(f.x - hero.x) * cz + (f.z - hero.z) * cx) }))
              .filter((c) => c.along > 0 && c.along < range + 4 && c.off < c.f.def.radius + 0.35)
              .sort((p, q) => p.along - q.along)
              .slice(0, 2)
              .forEach((c) => hit(c.f, 0.75));
          }
        }));
      } else {
        want('frost_nova', inRadius(hero.x, hero.z, 4.2).length >= 2 || (big && d < 4.2 + target.def.radius), () => start('frost_nova', () => inRadius(hero.x, hero.z, 4.2).forEach((f) => {
          hit(f, 1.2);
          f.slowT = 3;
        })));
        want('chain_lightning', d < range + 2 && many(alive().length), () => start('chain_lightning', () => {
          const done = new Set<Foe>();
          let cur: Foe | undefined = target.dead ? nearest() : target;
          for (let i = 0; i < 5 && cur; i++) {
            done.add(cur);
            hit(cur, 1.5 * Math.pow(0.85, i));
            const from: Foe = cur;
            cur = alive().filter((f) => !done.has(f) && Math.hypot(f.x - from.x, f.z - from.z) < 6).sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z))[0];
          }
        }));
        want('fireball', d < range, () => start('fireball', () => {
          const tg = target.dead ? nearest() : target;
          if (tg) inRadius(tg.x, tg.z, 2.6).forEach((f) => hit(f, 2.0));
        }));
      }
      for (const w of wants) {
        const cost = costOf(w.def);
        if (P.mana && mana + 1e-6 < cost) {
          // Count a refusal once per second per skill (a held key would retry every 0.3 s).
          if ((blockedAt[w.def.id] ?? -9) + 1 <= t) {
            blockedAt[w.def.id] = t;
            wanted++;
            blocked++;
          }
          continue;
        }
        wanted++;
        casts++;
        if (P.mana) {
          mana -= cost;
          spent += cost;
        }
        cds[w.def.id] = w.def.cooldown;
        w.go();
        return true;
      }
      return false;
    };
    const rains: { x: number; z: number; t: number; next: number }[] = [];

    while (alive().length && t < 180) {
      t += DT;
      attackCd -= DT;
      warCryT -= DT;
      for (const k in cds) cds[k] -= DT;
      if (P.mana) {
        mana = Math.min(maxMana, mana + regen * DT);
        if (mana < cheapest) dry += DT;
      }
      // Rain of Arrows: a tick every 0.3 s for 2.5 s on everything in the circle.
      for (const r of rains) {
        r.t += DT;
        if (r.t >= r.next && r.t <= 2.5) {
          r.next += 0.3;
          inRadius(r.x, r.z, 3.2).forEach((f) => hit(f, 0.55, true));
        }
      }
      // ── Hero ──
      if (dodgeT > 0) {
        // Stepping out of Cinderwing's telegraph: no attacking meanwhile.
        dodgeT -= DT;
      } else if (dash) {
        dash.t += DT;
        const k = Math.min(1, dash.t / dash.dur);
        hero.x = dash.fx + (dash.tx - dash.fx) * k;
        hero.z = dash.fz + (dash.tz - dash.fz) * k;
        if (k >= 1) {
          const end = dash.onEnd;
          dash = null;
          end();
        }
      } else {
        const act = action as Action | null;
        if (act) {
          if (act.track && !act.fired && !act.track.f.dead && !o.noTrack) {
            const f = act.track.f, d = dist(f), step = swingTrackStep(d, act.track.reach, DT);
            if (step > 0) {
              hero.x += ((f.x - hero.x) / d) * step;
              hero.z += ((f.z - hero.z) / d) * step;
            }
          }
          act.t += DT;
          if (!act.fired && act.t >= act.hitAt) {
            act.fired = true;
            act.onHit();
          }
          if (act.t >= act.dur) action = null;
        }
        const busy = action as Action | null;
        // A skill may cut a finished swing's follow-through short (as useAbility allows).
        if (!busy || busy.fired) {
          if (trySkill()) {
            // started a new action or dash
          } else if (!busy) {
            const tg = nearest();
            if (tg) {
              const reach = plain.range + tg.def.radius;
              if (dist(tg) <= reach) {
                if (attackCd <= 0) {
                  const s = P.swing((warCryT > 0 ? cried : plain).atkSpeed);
                  attackCd = s.interval;
                  const dir = faceDir(tg);
                  action = {
                    t: 0, dur: s.dur, hitAt: s.hitAt, fired: false, onHit: () => {
                      if (o.style === 'melee') {
                        // Same rule as Combat.startBasicAttack: the cone from where the swing was
                        // aimed, plus the target itself if it's still within the leeway.
                        const hits = inCone(dir, plain.range + 0.5, Math.PI * 0.6);
                        if (!tg.dead && !hits.includes(tg) && swingConnects(dist(tg), plain.range, tg.def.radius)) hits.push(tg);
                        swings++;
                        if (!tg.dead && !hits.includes(tg)) whiffs++;
                        hits.forEach((f) => hit(f, 1));
                      } else if (!tg.dead) hit(tg, 1);
                    },
                    track: o.style === 'melee' ? { f: tg, reach } : undefined,
                  };
                }
              } else {
                // Walk straight at it, as Player.approach does (stopping short at the edge of
                // reach would let a retreating kiter stay just out of it forever).
                const d = dist(tg), step = Math.min(d - tg.def.radius - HERO_R, P.heroMove * DT);
                hero.x += ((tg.x - hero.x) / d) * step;
                hero.z += ((tg.z - hero.z) / d) * step;
              }
            }
          }
        }
      }
      // ── Enemies ──
      for (const f of alive()) {
        if (f.stagger > 0) {
          f.stagger -= DT;
          continue;
        }
        f.atkCd -= DT;
        f.slowT -= DT;
        const sp = P.enemySpeed(f.def) * (f.slowT > 0 ? 0.5 : 1);
        const d = dist(f) || 1e-6;
        const ux = (hero.x - f.x) / d, uz = (hero.z - f.z) / d;
        const move = (vx: number, vz: number, s: number, away = false) => {
          const nx = f.x + vx * s * DT, nz = f.z + vz * s * DT;
          // Packs sit in clearings ringed by trees and rock: backing off stops at the edge.
          if (away && !o.openGround && Math.hypot(nx - pk.x, nz - pk.z) > CLEARING && Math.hypot(nx - pk.x, nz - pk.z) > Math.hypot(f.x - pk.x, f.z - pk.z)) return;
          f.x = nx;
          f.z = nz;
        };
        const b = f.def.behavior;
        if (b === 'boss') {
          if (f.away > 0) {
            f.away -= DT;
            continue;
          }
          if (!f.phase2 && f.hp < f.def.hp * 0.5) f.phase2 = true;
          if (f.phase2 && (f.flightCd -= DT) <= 0) {
            f.away = COMBAT_TUNING.boss.flight + COMBAT_TUNING.boss.land;
            f.flightCd = BOSS_FLIGHT_EVERY;
            continue;
          }
        }
        if (b === 'boss') {
          if (d > f.def.atkRange + f.def.radius + HERO_R) move(ux, uz, sp);
          else if (f.atkCd <= 0) {
            f.atkCd = BOSS_TELEGRAPH + 1.65 * (f.phase2 ? 0.7 : 1);
            incoming += avgDmg(f.def);
            dodgeT = BOSS_DODGE;
          }
        } else if (b === 'chaser') {
          if (d > f.def.atkRange + f.def.radius + HERO_R) move(ux, uz, sp);
          else if (f.atkCd <= 0) {
            f.atkCd = 1 / f.def.atkSpeed;
            incoming += avgDmg(f.def);
          }
        } else if (b === 'kiter' || b === 'caster') {
          const tooClose = b === 'kiter' ? 4.5 : 4;
          if (d < tooClose) move(-ux, -uz, sp * (b === 'kiter' ? 0.85 : 0.8), true);
          else if (d > f.def.atkRange) move(ux, uz, sp);
          else if (f.atkCd <= 0) {
            f.atkCd = 1 / f.def.atkSpeed;
            incoming += avgDmg(f.def) * (b === 'kiter' ? KITER_HITS : CASTER_HITS);
          }
        } else if (b === 'lunger') {
          const L = P.lunge;
          if (f.lunge) {
            f.lunge.t += DT;
            if (f.lunge.t > L.windup) {
              if (d > f.def.radius + HERO_R + 0.3) move(f.lunge.dx, f.lunge.dz, L.speed);
              else if (!f.lunge.hit) {
                f.lunge.hit = true;
                incoming += avgDmg(f.def);
              }
              if (f.lunge.t >= L.windup + L.dash) {
                f.lunge = null;
                f.recover = L.recover;
              }
            }
          } else if (f.recover > 0) f.recover -= DT;
          else if (d > 5) move(ux, uz, sp);
          else if (f.atkCd > 0) {
            // Circle-strafe at about 4 units while the next lunge charges.
            if (Math.abs(d - 4) > 0.2) move(d < 4 ? -ux : ux, d < 4 ? -uz : uz, sp * 0.6);
          } else {
            f.lunge = { t: 0, dx: ux, dz: uz };
            f.atkCd = 1 / f.def.atkSpeed;
          }
        }
      }
      // Bodies don't overlap (Combat.separateUnits).
      const live = alive();
      for (let i = 0; i < live.length; i++) {
        const a = live[i];
        for (let j = i + 1; j < live.length; j++) {
          const c = live[j];
          const dx = c.x - a.x, dz = c.z - a.z, min = a.def.radius + c.def.radius, d2 = dx * dx + dz * dz;
          if (d2 < min * min && d2 > 1e-9) {
            const d = Math.sqrt(d2), push = (min - d) / 2;
            a.x -= (dx / d) * push;
            a.z -= (dz / d) * push;
            c.x += (dx / d) * push;
            c.z += (dz / d) * push;
          }
        }
        const dx = a.x - hero.x, dz = a.z - hero.z, min = a.def.radius + HERO_R, d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          a.x += (dx / d) * (min - d);
          a.z += (dz / d) * (min - d);
        }
      }
    }
    fightTotal += t;
    // Walking over to pick up the drops.
    const loot = o.noTravel ? 0 : walk(LOOT_WALK * kills);
    travelTotal += travelSecs + loot;
    packs.push({ comp: pk.comp, fightSecs: t, travelSecs: travelSecs + loot, xp, kills, manaAtStart });
    at = { x: hero.x, z: hero.z };
  }
  // Walk back out and step through the portal to reset the instance (zones don't respawn).
  if (!o.noTravel) travelTotal += walk(Math.hypot(o.entry.x - at.x, o.entry.z - at.z) + ENGAGE) + RESET_SECS;

  const totalSecs = fightTotal + travelTotal;
  const kills = packs.reduce((s, p) => s + p.kills, 0);
  const xp = packs.reduce((s, p) => s + p.xp, 0);
  return {
    style: o.style, level: o.level, pacing: P.name, weapon, packs, totalSecs, fightSecs: fightTotal, kills, xp,
    incomingPerHour: incoming * (3600 / totalSecs), swings, whiffs,
    killsPerMin: kills / (totalSecs / 60),
    xpPerHour: xp * (3600 / totalSecs),
    castsPerMin: casts / (fightTotal / 60),
    manaPerMin: spent / (fightTotal / 60),
    manaBlocked: wanted ? blocked / wanted : 0,
    dryTime: fightTotal ? dry / fightTotal : 0,
    maxMana, manaRegen: regen,
  };
}
