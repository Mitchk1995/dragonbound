/**
 * One simulated pack fight (see sim.ts), stepped at 30 Hz: the hero's greedy policy (cast every useful skill it
 * can afford, otherwise basic-attack the nearest enemy) against the pack's behaviours in simEnemies.ts.
 */
import { swingConnects, swingTrackStep, type CastSkill } from '../../src/combat/stats';
import { mitigate, rollHit } from '../../src/combat/damage';
import type { AbilityDef } from '../../src/data/abilities';
import { ENEMIES } from '../../src/data/enemies';
import { COMBAT_TUNING } from '../../src/data/tuning';
import { shapeContains } from '../../src/fx/telegraph';
import { BOSS_DODGE, separate, stepEnemies } from './simEnemies';
import { DT, HERO_R, type Foe, type Kit, type Tally } from './simKit';

interface Action {
  t: number;
  dur: number;
  hitAt: number;
  fired: boolean;
  onHit: () => void;
  /** Melee swings follow their target through the wind-up (Player.update). */
  track?: { f: Foe; reach: number };
}

/**
 * Fight the pack at `pk` until it is dead (or three minutes pass), the hero starting at `hero` and left where the
 * fight ends. Mana and the running counts go to `tally`; returns the fight's length, XP and kills.
 */
export function fightPack(kit: Kit, tally: Tally, pk: { x: number; z: number; comp: string[] }, hero: { x: number; z: number }) {
  const { o, P, rng, plain, cried, skills, maxMana, regen, cheapest } = kit;
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
  const rains: { x: number; z: number; t: number; next: number }[] = [];
  let t = 0, xp = 0, kills = 0;
  const alive = () => foes.filter((f) => !f.dead);
  const dist = (f: { x: number; z: number }) => Math.hypot(f.x - hero.x, f.z - hero.z);

  const hit = (f: Foe, mult: number, tick = false) => {
    if (f.dead || f.away > 0) return;
    const st = warCryT > 0 ? cried : plain;
    const h = rollHit(rng, st.dmgMin, st.dmgMax, mult, st.critChance, st.critMult);
    const dealt = Math.min(f.hp, mitigate(h.amount, f.def.armor));
    f.hp -= dealt;
    xp += (f.def.xp * dealt) / f.def.hp;
    if (!tick && f.hp > 0 && f.def.behavior !== 'boss' && (dealt >= f.def.hp * COMBAT_TUNING.stagger.frac || (h.crit && !f.def.elite))) {
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
  /** The enemies an arrow along `dir` would hit (the first `pierce + 1` on its line), nearest first. */
  const onLine = (dir: number, pierce: number, reach: number) => {
    const cx = Math.cos(dir), cz = Math.sin(dir);
    return alive()
      .map((f) => ({ f, along: (f.x - hero.x) * cx + (f.z - hero.z) * cz, off: Math.abs(-(f.x - hero.x) * cz + (f.z - hero.z) * cx) }))
      .filter((c) => c.along > 0 && c.along < reach && c.off < c.f.def.radius + 0.35)
      .sort((p, q) => p.along - q.along)
      .slice(0, pierce + 1)
      .map((c) => c.f);
  };
  /** How many enemies a fan of five arrows 0.16 apart would hit, each piercing one. */
  const fanHits = (dir: number, reach: number) => {
    let n = 0;
    for (let i = -2; i <= 2; i++) n += onLine(dir + i * 0.16, 1, reach).length;
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
      want('multishot', d < range && many(fanHits(dir, range + 4)), () => start('multishot', () => {
        for (let i = -2; i <= 2; i++) onLine(dir + i * 0.16, 1, range + 4).forEach((f) => hit(f, 0.75));
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
      const cost = w.def.mana;
      if (tally.mana + 1e-6 < cost) {
        // Count a refusal once per second per skill (a held key would retry every 0.3 s).
        if ((blockedAt[w.def.id] ?? -9) + 1 <= t) {
          blockedAt[w.def.id] = t;
          tally.wanted++;
          tally.blocked++;
        }
        continue;
      }
      tally.wanted++;
      tally.casts++;
      tally.mana -= cost;
      tally.spent += cost;
      cds[w.def.id] = w.def.cooldown;
      w.go();
      return true;
    }
    return false;
  };

  /** Basic-attack the nearest enemy in reach, or walk at it. */
  const attackOrApproach = () => {
    const tg = nearest();
    if (!tg) return;
    const reach = plain.range + tg.def.radius;
    if (dist(tg) <= reach) {
      if (attackCd > 0) return;
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
            tally.swings++;
            if (!tg.dead && !hits.includes(tg)) tally.whiffs++;
            hits.forEach((f) => hit(f, 1));
          } else if (!tg.dead) hit(tg, 1);
        },
        track: o.style === 'melee' ? { f: tg, reach } : undefined,
      };
    } else {
      // Walk straight at it, as Player.approach does (stopping short at the edge of
      // reach would let a retreating kiter stay just out of it forever).
      const d = dist(tg), step = Math.min(d - tg.def.radius - HERO_R, P.heroMove * DT);
      hero.x += ((tg.x - hero.x) / d) * step;
      hero.z += ((tg.z - hero.z) / d) * step;
    }
  };

  while (alive().length && t < 180) {
    t += DT;
    attackCd -= DT;
    warCryT -= DT;
    for (const k in cds) cds[k] -= DT;
    tally.mana = Math.min(maxMana, tally.mana + regen * DT);
    if (tally.mana < cheapest) tally.dry += DT;
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
      if ((!busy || busy.fired) && !trySkill() && !busy) attackOrApproach();
    }
    // ── Enemies ──
    if (stepEnemies(alive(), hero, pk, P, !!o.openGround, tally)) dodgeT = BOSS_DODGE;
    separate(alive(), hero);
  }
  return { t, xp, kills };
}
