import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Cell, Ground, Lawn } from '../src/world/layout';
import { KERB_W } from '../src/world/kerbStones';
import { ASHLAR, ASHLAR_B, BASE, DOORS, DRESS, HERO_HEIGHT, type CourseRecord } from '../src/world/props';
import { COURSE, onCourse } from '../src/render/masonry';
import { castleScene, CASTLE_AREA, type Piece } from './castleScene';
import { contains, corners, overlap, type Solid } from './geometry';
import { CURTAIN_WALL } from '../src/data/castle';

/**
 * The castle's geometry audit: the keep is built as the game builds it, every prop and building in
 * and round the castle broken back into its blocks, and the blocks tested against each other. It
 * fails, naming the pieces, wherever one piece clips through another, anything floats, a door or a
 * window is wrong for its wall or the hero, rock rises through a walk, or a building crowds a gate.
 */

const S = castleScene();
const P = S.pieces;
const fmt = (v: THREE.Vector3) => `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`;
const inArea = (x: number, z: number) => x > CASTLE_AREA.x0 && x < CASTLE_AREA.x1 && z > CASTLE_AREA.z0 && z < CASTLE_AREA.z1;
const kindOf = (p: Piece) => (p.kind.startsWith('building:') ? 'building' : p.kind);
/** How deep two pieces' blocks may overlap at any seam (a hair, so blocks laid tight never count). */
const TIGHT = 0.05;

/**
 * Pieces that are built into each other on purpose, and why. A pair not listed here may not overlap
 * at all; a listed pair is held to its rule (when it has one) instead.
 */
const JOINTS: { a: string[]; b: string[]; why: string; rule?: (a: Piece, b: Piece) => string[] }[] = [
  { a: ['castle_wall'], b: ['round_tower', 'corner_tower'], why: 'a curtain run ends inside its tower\'s drum, its wall walk at a doorway', rule: (w, t) => wallIntoTower(w, t) },
  { a: ['castle_wall'], b: ['outer_gatehouse'], why: 'a gate is built across the curtain\'s run; the wall stops at its sides', rule: (w, g) => wallAtGate(w, g) },
  { a: ['castle_wall'], b: ['castle_wall'], why: 'at an inner corner of the curtain the north or south run is built against the inner face of the west or east run' },
  { a: ['ramp_wall'], b: ['castle_wall'], why: 'the terrace\'s retaining wall runs into the curtain that holds the terrace\'s fill at its ends' },
  { a: ['ramp_wall'], b: ['ramp_wall'], why: 'the dressed rock face over the stair\'s upper flights runs into the stair\'s east wall at the turning landing' },
  { a: ['castle_wall', 'round_tower', 'corner_tower', 'building'], b: ['wall_climber'], why: 'ivy and roses lie flat on the masonry, rooted in its foot' },
  { a: ['building'], b: ['castle_wall', 'building'], why: 'built against a building\'s wall (never through it into its rooms)', rule: (b, o) => intoRooms(b, o) },
  { a: ['building'], b: ['great_doors'], why: 'the great door\'s leaves hang in the hall\'s doorway, standing open into the hall' },
  { a: ['parapet', 'balustrade', 'ramp_wall', 'kerb', 'climb_wall'], b: ['parapet', 'balustrade', 'parapet_pier'], why: 'runs of one low wall meet end to end or on their pier (the climb\'s west wall ends in the ledge road\'s pier at the stair\'s head)' },
  { a: ['climb_buttress'], b: ['climb_wall'], why: 'a buttress is bonded into the battered talus of the wall it stands against' },
  { a: ['gate_bastion'], b: ['spring_fall'], why: 'the fall pours down the face of the bastion over it, its rock and moss lying back against the masonry' },
  { a: ['round_tower', 'corner_tower'], b: ['tower_flag'], why: 'the flagpole is stepped into the tower\'s platform' },
  { a: ['fence'], b: ['gate_piers'], why: 'a fence runs into its gate pier' },
  { a: ['stream_stone'], b: ['stream_stone'], why: 'stones heaped together in the stream' },
];

const listed = (a: Piece, b: Piece) => JOINTS.find((j) => (j.a.includes(kindOf(a)) && j.b.includes(kindOf(b))) || (j.a.includes(kindOf(b)) && j.b.includes(kindOf(a))));

/** A piece's frame: world point → its own (local) coordinates. */
const local = (p: Piece, v: THREE.Vector3) => p.obj.worldToLocal(v.clone());

/** The curtain run `w` ending in tower `t`: the wall dies inside the drum, and a doorway opens onto its walk. */
function wallIntoTower(w: Piece, t: Piece): string[] {
  const out: string[] = [], L = w.spawn!.len!, ends = w.spawn!.v ?? 0, r = t.spawn!.len!;
  const c = t.obj.getWorldPosition(new THREE.Vector3());
  for (const sx of [-1, 1]) {
    if (!(ends & (sx < 0 ? 1 : 2))) continue;
    const end = w.obj.localToWorld(new THREE.Vector3((sx * L) / 2, 0, 0));
    if (Math.hypot(end.x - c.x, end.z - c.z) > r + 0.3) continue;
    // Toward the wall from the tower's centre, and across it.
    const d = w.obj.localToWorld(new THREE.Vector3(-sx, 0, 0)).sub(w.obj.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
    for (const s of w.solids) for (const k of corners(s)) {
      const along = (k.x - c.x) * d.x + (k.z - c.z) * d.z, lat = Math.hypot(k.x - c.x - along * d.x, k.z - c.z - along * d.z);
      if (along < 0.05) out.push(`${w.name}: its ${s.part.color.toString(16)} block reaches past the middle of ${t.name}'s drum at ${fmt(k)}`);
      else if (along < Math.sqrt(Math.max(0, r * r - lat * lat)) - 0.02 && lat > r + 0.12) out.push(`${w.name}: its ${s.part.color.toString(16)} block stands out of ${t.name}'s drum at ${fmt(k)}`);
    }
    const walk = w.obj.localToWorld(new THREE.Vector3((sx * L) / 2, DOORS.walk.y, DOORS.walk.off));
    const door = t.solids.find((s) => s.part.tag === 'door-leaf' && Math.hypot(s.c.x - walk.x, s.c.z - walk.z) < 1.4 && Math.abs(s.lo.y - walk.y) < 0.2);
    if (!door) out.push(`${t.name} has no doorway onto ${w.name}'s wall walk (expected near ${fmt(walk)})`);
  }
  return [...new Set(out)];
}

/** A curtain run meeting a gate: none of the wall stands in the gate's passage. */
function wallAtGate(w: Piece, g: Piece): string[] {
  const out: string[] = [], pass = g.spawn!.len ?? 4;
  for (const s of w.solids) for (const k of corners(s)) {
    const q = local(g, k);
    if (Math.abs(q.x) < pass / 2 + 0.4 && Math.abs(q.z) < 1.6) out.push(`${w.name}: its ${s.part.color.toString(16)} block stands in ${g.name}'s passage at ${fmt(k)}`);
  }
  return [...new Set(out)].slice(0, 4);
}

/** A piece built against a building: nothing of it reaches through the wall into the rooms. */
function intoRooms(b: Piece, o: Piece): string[] {
  const out: string[] = [];
  for (const [bb, other] of [[b, o], [o, b]] as const) {
    const spec = bb.building;
    if (!spec) continue;
    // Buildings of one range (sharing or joined to a wall) are one mass with one roof.
    if (other.building && (spec.shared?.length || spec.joined?.length || other.building.shared?.length || other.building.joined?.length)) continue;
    const y0 = bb.obj.getWorldPosition(new THREE.Vector3()).y, x0 = spec.x + 0.98, x1 = spec.x + spec.w - 0.98, z0 = spec.z + 0.98, z1 = spec.z + spec.d - 0.98;
    for (const s of other.solids) {
      if (s.part.thin) continue;
      for (const k of corners(s)) if (k.x > x0 && k.x < x1 && k.z > z0 && k.z < z1 && k.y < y0 + spec.wallH) {
        out.push(`${other.name}: its ${s.part.color.toString(16)} block reaches through ${bb.name}'s wall into its rooms at ${fmt(k)}`);
        break;
      }
    }
  }
  return [...new Set(out)].slice(0, 6);
}

/** Pairs of solids of different pieces that overlap more than a seam. */
function clashes() {
  const pairs = new Map<string, { a: number; b: number; depth: number; at: THREE.Vector3; what: string }>();
  S.solids.forEach((s, i) => {
    if (s.part.thin || s.part.hollow) return;
    for (const j of S.grid.near(s.lo, s.hi)) {
      const t = S.solids[j];
      if (j <= i || t.piece === s.piece || t.part.thin || t.part.hollow) continue;
      const d = overlap(s, t);
      if (d <= TIGHT) continue;
      const [a, b] = s.piece < t.piece ? [s.piece, t.piece] : [t.piece, s.piece], key = `${a}|${b}`, e = pairs.get(key);
      if (!e || d > e.depth) pairs.set(key, { a, b, depth: d, at: s.c.clone().add(t.c).multiplyScalar(0.5), what: `${s.part.color.toString(16)} / ${t.part.color.toString(16)}` });
    }
  });
  return [...pairs.values()];
}

describe('castle geometry', () => {
  it('builds the whole castle into blocks: its doors, windows and the rock round it among them', () => {
    expect(P.length).toBeGreaterThan(150);
    expect(S.solids.length).toBeGreaterThan(10000);
    expect(S.solids.filter((s) => s.part.tag === 'door-leaf').length).toBeGreaterThan(40);
    expect(S.solids.filter((s) => s.part.tag === 'glass').length).toBeGreaterThan(25);
    let rock = 0;
    S.view.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh && o.userData.rock) rock += o.count;
    });
    expect(rock).toBeGreaterThan(100);
  });

  it('no piece clips through another (pieces built into each other are listed joints, each with its reason)', () => {
    const bad: string[] = [];
    for (const c of clashes()) {
      const a = P[c.a], b = P[c.b];
      if (!listed(a, b)) bad.push(`${a.name} clips ${b.name} by ${c.depth.toFixed(2)} at ${fmt(c.at)} (${c.what})`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('every listed joint meets as designed', () => {
    const bad: string[] = [], seen = new Set<string>();
    for (const c of clashes()) {
      const a = P[c.a], b = P[c.b], j = listed(a, b);
      if (!j?.rule) continue;
      const [x, y] = j.a.includes(kindOf(a)) && j.b.includes(kindOf(b)) ? [a, b] : [b, a];
      for (const m of j.rule(x, y)) if (!seen.has(m)) (seen.add(m), bad.push(m));
    }
    // Every tower a curtain run dies into opens onto its wall walk (whether or not their blocks touch).
    for (const w of P.filter((p) => p.kind === 'castle_wall')) for (const t of P.filter((p) => p.kind === 'round_tower' || p.kind === 'corner_tower')) {
      for (const m of wallIntoTower(w, t)) if (!seen.has(m)) (seen.add(m), bad.push(m));
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('nothing floats: every block is joined, through the blocks it touches, to the ground', () => {
    const parent = S.solids.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    S.solids.forEach((s, i) => {
      for (const j of S.grid.near(s.lo, s.hi, 0.03)) if (j > i && overlap(s, S.solids[j]) > -0.03) parent[find(i)] = find(j);
    });
    const rooted = new Set<number>();
    S.solids.forEach((s, i) => {
      const g = Math.max(...[[s.c.x, s.c.z], [s.lo.x, s.lo.z], [s.hi.x, s.hi.z], [s.lo.x, s.hi.z], [s.hi.x, s.lo.z]].map(([x, z]) => S.ground(x, z)));
      if (s.lo.y <= g + 0.05) rooted.add(find(i));
    });
    const by = new Map<string, Solid[]>();
    S.solids.forEach((s, i) => {
      if (rooted.has(find(i))) return;
      const k = P[s.piece].name;
      by.set(k, [...(by.get(k) ?? []), s]);
    });
    const bad = [...by.entries()].map(([k, l]) => `${k}: ${l.length} block(s) float, e.g. ${l.slice(0, 3).map((s) => `${s.part.tag ?? s.part.color.toString(16)} at ${fmt(s.c)}`).join(', ')}`);
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('doors: one size for one purpose, taller than the hero, the handle at his hand, the leaf hung in its frame', () => {
    const bad: string[] = [];
    const sizes = new Map<string, { w: number; h: number; who: string }>();
    for (const p of P) {
      const leaves = p.solids.filter((s) => s.part.tag === 'door-leaf');
      for (const s of leaves) {
        const cls = (s.part.info?.cls as string) ?? '?', spec = DOORS[cls as keyof typeof DOORS] as { w: number; h: number } | undefined;
        // Height up the leaf, width across it (its thinnest axis is its thickness).
        const up = [0, 1, 2].reduce((a, k) => (Math.abs(s.u[k].y) > Math.abs(s.u[a].y) ? k : a), 0);
        const h = 2 * s.e[up], w = 2 * Math.max(...[0, 1, 2].filter((k) => k !== up).map((k) => s.e[k]));
        if (!spec) bad.push(`${p.name}: a door leaf of unknown purpose '${cls}'`);
        else if (Math.abs(w - spec.w) > 0.03 || Math.abs(h - spec.h) > 0.03) bad.push(`${p.name}: a ${cls} door leaf is ${w.toFixed(2)} × ${h.toFixed(2)}, every ${cls} door's is ${spec.w} × ${spec.h}`);
        const first = sizes.get(cls);
        if (!first) sizes.set(cls, { w, h, who: p.name });
        else if (Math.abs(first.w - w) > 0.03 || Math.abs(first.h - h) > 0.03) bad.push(`${p.name}: its ${cls} door (${w.toFixed(2)} × ${h.toFixed(2)}) differs from ${first.who}'s (${first.w.toFixed(2)} × ${first.h.toFixed(2)})`);
        if (h < HERO_HEIGHT * 1.3) bad.push(`${p.name}: a ${cls} door leaf ${h.toFixed(2)} tall is stubby beside the hero (${HERO_HEIGHT})`);
        // Hung in its frame: the leaf touches a solid block of its own piece.
        if (!p.solids.some((o) => o !== s && o.part.tag !== 'door-leaf' && !o.part.thin && overlap(s, o) > -0.03)) bad.push(`${p.name}: a ${cls} door leaf at ${fmt(s.c)} touches no frame`);
      }
      for (const hd of p.solids.filter((s) => s.part.tag === 'handle')) {
        const leaf = leaves.reduce<Solid | null>((a, s) => (!a || s.c.distanceTo(hd.c) < a.c.distanceTo(hd.c) ? s : a), null);
        if (!leaf) {
          bad.push(`${p.name}: a door handle at ${fmt(hd.c)} with no leaf`);
          continue;
        }
        const at = hd.c.y - leaf.lo.y;
        if (at < 0.9 || at > 1.2) bad.push(`${p.name}: a door handle ${at.toFixed(2)} above the sill (a hand hangs at about 1.0)`);
        // (On the boards facing the leaf, where it has them.)
        const face = [leaf, ...p.solids.filter((s) => s.part.tag === 'door-board' && overlap(s, leaf) > -0.01)];
        if (Math.max(...face.map((s) => overlap(hd, s))) < -0.03) bad.push(`${p.name}: a door handle at ${fmt(hd.c)} stands off its leaf`);
      }
      if (leaves.length && !p.solids.some((s) => s.part.tag === 'handle')) bad.push(`${p.name}: its doors have no handle`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('windows: the glass is set in its wall\'s opening, nothing across it, no wall in front of it', () => {
    const bad: string[] = [];
    for (const p of P) for (const g of p.solids.filter((s) => s.part.tag === 'glass')) {
      // The pane's face: its thinnest axis.
      const n = [0, 1, 2].reduce((a, k) => (g.e[k] < g.e[a] ? k : a), 0), N = g.u[n];
      // (A drum notched for its windows, the keep's turrets' slit lights, is cut away round them: it is
      // set aside only for a pane standing inside its own radius.)
      const solid = p.solids.filter((s) => s !== g && !s.part.thin && !s.part.hollow && !(s.part.notched && s.r && Math.hypot(g.c.x - s.c.x, g.c.z - s.c.z) < s.r + 0.1));
      const set = [-1, 1].some((sg) => solid.some((s) => contains(s, g.c.clone().addScaledVector(N, sg * (g.e[n] + 0.12)), 0.02)));
      if (!set && !solid.some((s) => overlap(s, g) > -0.03)) bad.push(`${p.name}: a window pane at ${fmt(g.c)} hangs in the air, in no wall`);
      // From at least one side the whole pane shows: no block in front of its middle or across it.
      const side = [1, -1].find((sg) => [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.3], [0, -0.3]].every(([a, b]) => {
        const across = [0, 1, 2].filter((k) => k !== n);
        const q = g.c.clone().addScaledVector(g.u[across[0]], a * 2 * g.e[across[0]]).addScaledVector(g.u[across[1]], b * 2 * g.e[across[1]]).addScaledVector(N, sg * (g.e[n] + 0.04));
        return !solid.some((s) => contains(s, q, -0.005));
      }));
      if (side === undefined) {
        const across = [0, 1, 2].filter((k) => k !== n), q = g.c.clone().addScaledVector(N, g.e[n] + 0.04);
        const by = [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.3], [0, -0.3]].flatMap(([a, b]) => solid.filter((s) => contains(s, q.clone().addScaledVector(g.u[across[0]], a * 2 * g.e[across[0]]).addScaledVector(g.u[across[1]], b * 2 * g.e[across[1]]), -0.005)));
        bad.push(`${p.name}: a window pane at ${fmt(g.c)} is crossed or covered by a block (${[...new Set(by.map((s) => `${s.part.color.toString(16)} at ${fmt(s.c)}`))].join(', ')})`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('banners and flags hang clear: nothing crosses the cloth on the side it is seen from', () => {
    const bad: string[] = [];
    for (const s of S.solids.filter((q) => q.part.tag === 'cloth')) {
      const n = [0, 1, 2].reduce((a, k) => (s.e[k] < s.e[a] ? k : a), 0), N = s.u[n], across = [0, 1, 2].filter((k) => k !== n);
      const side = [1, -1].find((sg) => [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0.6, 0.6], [-0.6, -0.6]].every(([a, b]) => {
        const q = s.c.clone().addScaledVector(s.u[across[0]], a * s.e[across[0]]).addScaledVector(s.u[across[1]], b * s.e[across[1]]).addScaledVector(N, sg * (s.e[n] + 0.04));
        return !S.grid.near(q, q).some((j) => {
          const t = S.solids[j];
          return t !== s && !t.part.thin && !t.part.hollow && !t.part.fx && contains(t, q, -0.005);
        });
      }));
      if (side === undefined) bad.push(`${P[s.piece].name}: something crosses its cloth at ${fmt(s.c)}`);
    }
    expect([...new Set(bad)], [...new Set(bad)].join('\n')).toEqual([]);
  });

  it('doorways are clear: nothing stands in the way through a door on the side it is reached from', () => {
    const bad: string[] = [];
    for (const s of S.solids.filter((q) => q.part.tag === 'door-leaf')) {
      const up = [0, 1, 2].reduce((a, k) => (Math.abs(s.u[k].y) > Math.abs(s.u[a].y) ? k : a), 0);
      const rest = [0, 1, 2].filter((k) => k !== up), n = s.e[rest[0]] < s.e[rest[1]] ? rest[0] : rest[1], w = rest[0] === n ? rest[1] : rest[0];
      const y0 = s.c.y - s.e[up];
      const clear = [1, -1].some((sg) => [-0.6, 0, 0.6].every((a) => [0.6, 1.3, 2.0].every((h) => [0.3, 0.7, 1.1].every((d) => {
        const q = s.c.clone().addScaledVector(s.u[w], a * s.e[w]).setY(y0 + h).addScaledVector(s.u[n], sg * (s.e[n] + d));
        return !S.grid.near(q, q).some((j) => {
          const t = S.solids[j];
          // (A drum notched for its doorways is cut away in front of them.)
          return t !== s && t.part.tag !== 'door-leaf' && t.part.tag !== 'handle' && !t.part.thin && !t.part.hollow && !t.part.fx && !t.part.fit && !t.part.notched && contains(t, q, -0.01);
        });
      }))));
      if (!clear) bad.push(`${P[s.piece].name}: the way through its door at ${fmt(s.c)} is blocked on both sides`);
    }
    expect([...new Set(bad)], [...new Set(bad)].join('\n')).toEqual([]);
  });

  it('every door lines up with the path or wall walk that reaches it', () => {
    const bad: string[] = [];
    const { walkY, walkOff } = CURTAIN_WALL;
    /** A door leaf's way through: its middle on the ground and the level direction square to its face. */
    const way = (s: Solid) => {
      const n = [0, 1, 2].filter((k) => Math.abs(s.u[k].y) < 0.5).reduce((a, k) => (s.e[k] < s.e[a] ? k : a));
      return { c: s.c.clone().setY(s.lo.y), n: s.u[n].clone().setY(0).normalize() };
    };
    // A tower's door onto a wall walk faces straight down the walk, its middle on the walk's middle.
    for (const w of P.filter((p) => p.kind === 'castle_wall')) {
      const L = w.spawn!.len!, ends = w.spawn!.v ?? 0;
      for (const sx of [-1, 1]) {
        if (!(ends & (sx < 0 ? 1 : 2))) continue;
        const end = w.obj.localToWorld(new THREE.Vector3((sx * L) / 2, walkY, walkOff));
        const along = w.obj.localToWorld(new THREE.Vector3(sx, 0, 0)).sub(w.obj.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
        const leaf = S.solids.find((s) => s.part.tag === 'door-leaf' && P[s.piece] !== w && Math.abs(s.lo.y - end.y) < 0.2 && Math.hypot(s.c.x - end.x, s.c.z - end.z) < 1.4);
        if (!leaf) continue;
        const { c, n } = way(leaf), off = c.clone().sub(end), across = Math.abs(off.x * along.z - off.z * along.x);
        const turn = (Math.acos(Math.min(1, Math.abs(n.dot(along)))) * 180) / Math.PI;
        if (turn > 2) bad.push(`${P[leaf.piece].name}: its door onto ${w.name}'s walk is turned ${turn.toFixed(1)}° off the walk`);
        if (across > 0.08) bad.push(`${P[leaf.piece].name}: its door onto ${w.name}'s walk stands ${across.toFixed(2)} off the walk's middle`);
      }
    }
    // A door on the ground: where a walk of paving leads away from it (a band no wider than the door
    // and a little either side, not a court or a lane running past), the walk's middle is the door's.
    const L = S.layout, paved = (x: number, z: number) => {
      const gx = Math.floor(x), gz = Math.floor(z);
      if (gx < 0 || gz < 0 || gx >= L.w || gz >= L.h) return false;
      const g = L.ground[gz * L.w + gx];
      return g === Ground.Stone || g === Ground.Path;
    };
    const ways: { who: string; c: THREE.Vector3; n: THREE.Vector3; w: number }[] = [];
    for (const b of (L.buildings ?? []).filter((q) => inArea(q.x + q.w / 2, q.z + q.d / 2))) for (const d of b.doors) {
      const u = d.at + d.w / 2;
      const [c, n] = d.side === 's' ? [[b.x + u, b.z + b.d], [0, 1]] : d.side === 'n' ? [[b.x + u, b.z], [0, -1]] : d.side === 'e' ? [[b.x + b.w, b.z + u], [1, 0]] : [[b.x, b.z + u], [-1, 0]];
      ways.push({ who: `building:${b.id}'s ${d.side} door`, c: new THREE.Vector3(c[0], 0, c[1]), n: new THREE.Vector3(n[0], 0, n[1]), w: d.w });
    }
    for (const s of S.solids.filter((q) => q.part.tag === 'door-leaf' && q.part.info?.cls === 'single' && q.lo.y < S.ground(q.c.x, q.c.z) + 0.3)) {
      const { c, n } = way(s);
      for (const sg of [-1, 1]) ways.push({ who: `${P[s.piece].name}'s door`, c, n: n.clone().multiplyScalar(sg), w: DOORS.single.w });
    }
    for (const g of P.filter((p) => p.kind === 'outer_gatehouse')) {
      const c = g.obj.getWorldPosition(new THREE.Vector3()), n = g.obj.localToWorld(new THREE.Vector3(0, 0, 1)).sub(c).setY(0).normalize();
      for (const sg of [-1, 1]) ways.push({ who: `${g.name}`, c: c.clone().addScaledVector(n, sg * (CURTAIN_WALL.T / 2)), n: n.clone().multiplyScalar(sg), w: g.spawn!.len ?? 4 });
    }
    for (const { who, c, n, w } of ways) {
      const lat = new THREE.Vector3(-n.z, 0, n.x);
      for (const t of [0.7, 1.7, 2.7]) {
        const at = (s: number) => c.clone().addScaledVector(n, t).addScaledVector(lat, s);
        const on = (s: number) => paved(at(s).x, at(s).z);
        if (!on(0)) break;
        let lo = 0, hi = 0;
        while (lo > -w - 3 && on(lo - 0.02)) lo -= 0.02;
        while (hi < w + 3 && on(hi + 0.02)) hi += 0.02;
        // (A court, or a lane running past the door: nothing to line up with.)
        if (hi - lo > w + 2.5) continue;
        const mid = (lo + hi) / 2;
        if (Math.abs(mid) > 0.12) bad.push(`${who}: the walk ${t.toFixed(1)} out from it runs ${mid.toFixed(2)} off its middle (${fmt(at(mid))})`);
      }
    }
    expect([...new Set(bad)], [...new Set(bad)].join('\n')).toEqual([]);
  });

  it('the wall walks are clear: nothing of another piece crosses a curtain\'s walk', () => {
    const bad: string[] = [];
    const { T, H } = CURTAIN_WALL, z0 = -T / 2 + 0.66, z1 = T / 2 + 0.85 - 0.6;
    const own = new Set(['round_tower', 'corner_tower', 'outer_gatehouse']);
    for (const w of P.filter((p) => p.kind === 'castle_wall')) {
      const L = w.spawn!.len!, m = w.obj.matrixWorld;
      const c = new THREE.Vector3(0, H + 1.06, (z0 + z1) / 2).applyMatrix4(m);
      const u = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((a) => a.transformDirection(m));
      const e = [L / 2 - 0.1, 0.9, (z1 - z0) / 2];
      const walk: Solid = { piece: -1, part: w.solids[0].part, c, u, e, r: 0, rIn: 0, lo: c.clone().subScalar(L / 2 + 2), hi: c.clone().addScalar(L / 2 + 2) };
      for (const j of S.grid.near(walk.lo, walk.hi)) {
        const t = S.solids[j], tp = P[t.piece];
        if (tp === w || own.has(tp.kind) || t.part.fx || t.part.hollow) continue;
        // (A run that ends in a building's flank, the keep's, runs on into it at its end; the runs
        // meet at the corners.)
        if (tp.kind === 'castle_wall' || (tp.building && Math.abs(w.obj.worldToLocal(t.c.clone()).x) > L / 2 - 1)) continue;
        if (overlap(walk, t) > 0.12) bad.push(`${tp.name} crosses ${w.name}'s wall walk at ${fmt(t.c)}`);
      }
    }
    expect([...new Set(bad)], [...new Set(bad)].join('\n')).toEqual([]);
  });

  it('flat stones on a drum lie on its face: on a facet of a faceted drum, hugging the curve of a round one', () => {
    const bad: string[] = [];
    for (const p of P) {
      const drums = p.solids.filter((s) => s.r >= 1.5 && s.e[1] >= 1.5 && s.part.sides);
      if (!drums.length) continue;
      for (const s of p.solids) {
        // (A door's leaf and its boards hang square to the way through it, not on the drum's face.)
        if (s.r || s.part.thin || s.part.fx || s.part.hollow || s.part.tag === 'door-leaf' || s.part.tag === 'door-board') continue;
        const n = [0, 1, 2].reduce((a, k) => (s.e[k] < s.e[a] ? k : a), 0), N = s.u[n];
        const wide = [0, 1, 2].filter((k) => k !== n).every((k) => s.e[k] >= 0.1);
        if (!wide || s.e[n] > 0.15 || Math.abs(N.y) > 0.3) continue;
        // (Only a stone laid flat against the drum: its face looks out from the drum's axis.)
        const rad = new THREE.Vector3(s.c.x, 0, s.c.z);
        const d = drums.find((q) => s.c.y > q.c.y - q.e[1] && s.c.y < q.c.y + q.e[1] && Math.abs(Math.hypot(s.c.x - q.c.x, s.c.z - q.c.z) - q.r) < 0.35);
        if (!d) continue;
        rad.sub(new THREE.Vector3(d.c.x, 0, d.c.z)).normalize();
        if (Math.abs(rad.dot(N)) < 0.8) continue;
        if (d.part.round) {
          // A drum laid in rings of flat stones, each course turned half a stone on the next: the
          // stone's back stands inside the round of the corners it lies on (the drum's, or a course's
          // round it at the stone's height) right out to its edges, give or take the depth of a stone's
          // flat face, so no gap opens behind it, and its face stands out of the flats (it is not sunk
          // into the drum).
          const sag = (q: Solid) => q.r * (1 - Math.cos(Math.PI / (q.part.sides ?? 64)));
          const h = new THREE.Vector3(N.x, 0, N.z).normalize(), off = new THREE.Vector3(s.c.x - d.c.x, 0, s.c.z - d.c.z);
          const across = [0, 1, 2].filter((k) => k !== n).reduce((a, k) => (Math.abs(s.u[k].y) < Math.abs(s.u[a].y) ? k : a));
          const along = off.dot(h), side = Math.abs(off.clone().addScaledVector(h, -along).length()) + s.e[across];
          const back = along - s.e[n], front = along + s.e[n];
          const under = p.solids.filter((q) => q.r > 0 && q.r - sag(q) <= back + 0.06 && Math.hypot(q.c.x - d.c.x, q.c.z - d.c.z) < 0.1 && s.c.y > q.c.y - q.e[1] && s.c.y < q.c.y + q.e[1]);
          const top = [d, ...under].reduce((a, q) => (q.r > a.r ? q : a)), R = top.r, curve = Math.sqrt(Math.max(0, R * R - side * side));
          if (back > curve + 0.05) bad.push(`${p.name}: a flat ${s.part.color.toString(16)} stone at ${fmt(s.c)} stands ${(back - curve).toFixed(2)} off the drum's curve at its edge`);
          else if (front < R - sag(top) - 0.02) bad.push(`${p.name}: a flat ${s.part.color.toString(16)} stone at ${fmt(s.c)} is sunk ${(R - sag(top) - front).toFixed(2)} into the drum`);
          continue;
        }
        // The facet under it, in the drum's own turn: its middle's bearing, and the stone's facing.
        const dx = s.c.x - d.c.x, dz = s.c.z - d.c.z, th = Math.atan2(dx * d.u[0].x + dz * d.u[0].z, dx * d.u[2].x + dz * d.u[2].z);
        const step = (Math.PI * 2) / d.part.sides!, mid = (Math.floor(th / step) + 0.5) * step;
        const nx = N.x * d.u[0].x + N.z * d.u[0].z, nz = N.x * d.u[2].x + N.z * d.u[2].z, face = Math.atan2(nx, nz);
        const off = Math.abs(Math.atan2(Math.sin(face - mid), Math.cos(face - mid)));
        if (Math.min(off, Math.PI - off) > 0.06) {
          bad.push(`${p.name}: a flat ${s.part.color.toString(16)} stone (${s.e.map((x) => (2 * x).toFixed(2)).join(' × ')}) at ${fmt(s.c)} lies across the drum's facets`);
          continue;
        }
        // And it lies within its facet: no edge of it runs on past the facet's crease, off the curve.
        const across = [0, 1, 2].filter((k) => k !== n).reduce((a, k) => (Math.abs(s.u[k].y) < Math.abs(s.u[a].y) ? k : a)), half = s.e[across];
        const facet = (q: number) => q * Math.sin(Math.PI / d.part.sides!);
        const lateral = Math.abs(Math.hypot(dx, dz) * Math.sin(th - mid));
        if (lateral + half > facet(d.r) + 0.03) bad.push(`${p.name}: a flat ${s.part.color.toString(16)} stone ${(2 * half).toFixed(2)} wide at ${fmt(s.c)} runs on past its facet of the drum`);
      }
    }
    expect([...new Set(bad)], [...new Set(bad)].join('\n')).toEqual([]);
  });

  it('footings stand on the ground: no base block hangs out over a drop', () => {
    const bad: string[] = [];
    // (Not the climb's kerb walls: each sloping stretch is bounded as a level box from its low end, so
    // its corners stand nowhere near the wall's own foot.)
    const KINDS = /^(parapet|parapet_pier|castle_wall|round_tower|corner_tower|outer_gatehouse|climb_pier|climb_buttress|building:.*)$/;
    for (const p of P.filter((q) => KINDS.test(q.kind))) for (const s of p.solids) {
      if (s.part.thin || s.part.fx || s.part.hollow) continue;
      if (s.lo.y > S.ground(s.c.x, s.c.z) + 0.3) continue;
      const foot = s.r
        ? Array.from({ length: 16 }, (_, i) => [s.c.x + Math.sin((i / 16) * Math.PI * 2) * s.r, s.c.z + Math.cos((i / 16) * Math.PI * 2) * s.r])
        : corners(s).filter((k) => k.y < s.c.y).map((k) => [k.x, k.z]);
      // (A course of a stepped plinth stands on the course under it, founded deeper: on its own masonry.)
      const onOwn = (x: number, z: number) => p.solids.some((o) => o !== s && !o.part.thin && !o.part.hollow && o.lo.y < s.lo.y - 0.05 && contains(o, new THREE.Vector3(x, s.lo.y - 0.05, z), 0.02));
      const under = foot.filter(([x, z]) => S.ground(x, z) < s.lo.y - 0.6 && !onOwn(x, z));
      if (under.length) bad.push(`${p.name}: its ${s.part.color.toString(16)} base at ${fmt(s.c)} hangs out over a drop at (${under[0][0].toFixed(1)}, ${under[0][1].toFixed(1)})`);
    }
    expect([...new Set(bad)], [...new Set(bad)].slice(0, 60).join('\n')).toEqual([]);
  });

  it('garden pieces keep a clear step apart: no planter, bed or tree jammed against another', () => {
    const bad: string[] = [];
    const KINDS = new Set(['topiary', 'flower_bed', 'herb_bed', 'urn', 'garden_tree', 'garden_bench', 'box_border']);
    const gp = P.map((p, i) => [p, i] as const).filter(([p]) => KINDS.has(p.kind));
    for (const [a, ia] of gp) for (const s of a.solids) {
      // (Petals and leaves lying flat on the ground don't count.)
      if (s.part.thin || s.part.fx || s.e[1] < 0.03 || s.lo.y > S.ground(s.c.x, s.c.z) + 0.6) continue;
      for (const j of S.grid.near(s.lo, s.hi, 0.15)) {
        const t = S.solids[j], b = P[t.piece];
        if (t.piece <= ia || !KINDS.has(b.kind) || (a.kind === 'box_border' && b.kind === 'box_border') || t.part.thin || t.part.fx || t.e[1] < 0.03 || t.lo.y > S.ground(t.c.x, t.c.z) + 0.6) continue;
        const near: Solid = { ...s, e: s.e.map((x) => x + 0.12), r: s.r ? s.r + 0.12 : 0, lo: s.lo.clone().subScalar(0.12), hi: s.hi.clone().addScalar(0.12) };
        if (overlap(near, t) > 0) bad.push(`${a.name} and ${b.name} stand jammed together at ${fmt(s.c.clone().add(t.c).multiplyScalar(0.5))}`);
      }
    }
    expect([...new Set(bad)], [...new Set(bad)].join('\n')).toEqual([]);
  });

  it('a course round a drum lies on what is under it, never jutting out over it as a loose lip', () => {
    const bad: string[] = [];
    for (const p of P) {
      const rings = p.solids.filter((s) => s.r > 0 && !s.part.thin && !s.part.fx);
      for (const s of rings) {
        // What it stands on: the drum's pieces on its axis whose tops are at its foot.
        const under = rings.filter((t) => t !== s && Math.hypot(t.c.x - s.c.x, t.c.z - s.c.z) < 0.05 && t.hi.y > s.lo.y - 0.03 && t.hi.y < s.lo.y + 0.12 && t.lo.y < s.lo.y - 0.03);
        if (!under.length) continue;
        const r = Math.max(...under.map((t) => t.r));
        // (A corbelled or battered course steps out a little at a time; a loose lip juts out at once.)
        if (s.r - r > 0.25) bad.push(`${p.name}: a ${s.part.color.toString(16)} course at ${fmt(s.c)} juts ${(s.r - r).toFixed(2)} out over what it stands on`);
      }
    }
    expect([...new Set(bad)], [...new Set(bad)].join('\n')).toEqual([]);
  });

  it('garden pieces and hedges stand on their own ground, never out over a kerb', () => {
    const { layout: L } = S, bad: string[] = [];
    const strips: { x: number; z: number; ux: number; uz: number; hl: number; hw: number }[] = (L.kerbs ?? []).map((k) => ({ x: k.x, z: k.z, ux: Math.cos(k.rot), uz: -Math.sin(k.rot), hl: k.len / 2, hw: KERB_W / 2 }));
    for (const p of P.filter((q) => q.kind === 'kerb_ring' || q.kind === 'kerb')) for (const s of p.solids) {
      const ax = [0, 2].reduce((a, k) => (s.e[k] > s.e[a] ? k : a), 0), across = ax === 0 ? 2 : 0;
      strips.push({ x: s.c.x, z: s.c.z, ux: s.u[ax].x, uz: s.u[ax].z, hl: s.e[ax], hw: s.e[across] });
    }
    const onKerb = (x: number, z: number) => strips.some((k) => {
      const dx = x - k.x, dz = z - k.z;
      return Math.abs(dx * k.ux + dz * k.uz) < k.hl - 0.02 && Math.abs(-dx * k.uz + dz * k.ux) < k.hw - 0.02;
    });
    const KINDS = new Set(['topiary', 'flower_bed', 'herb_bed', 'urn', 'garden_tree', 'box_border']);
    for (const p of P.filter((q) => KINDS.has(q.kind))) for (const s of p.solids) {
      if (s.r || s.part.thin || s.part.fx || s.lo.y > S.ground(s.c.x, s.c.z) + 0.3) continue;
      // Its footprint: the bottom face's corners and edge middles.
      const pts = corners(s).filter((k) => k.y < s.c.y);
      const all = [...pts, ...pts.flatMap((a, i) => pts.slice(i + 1).map((b) => a.clone().add(b).multiplyScalar(0.5)))];
      const hit = all.find((q) => onKerb(q.x, q.z));
      if (hit) bad.push(`${p.name}: its ${s.part.color.toString(16)} block stands out over a kerb at (${hit.x.toFixed(2)}, ${hit.z.toFixed(2)})`);
    }
    expect([...new Set(bad)], [...new Set(bad)].slice(0, 40).join('\n')).toEqual([]);
  });

  it('no two faces of different stones lie in one plane over each other (they would flicker)', () => {
    const bad: string[] = [];
    // (The architecture, where the eye rests on long faces; not the furnishings inside.)
    const ARCH = /^(castle_wall|round_tower|corner_tower|outer_gatehouse|parapet|parapet_pier|balustrade|ramp_wall|kerb|great_doors|building:.*)$/;
    const boxes = S.solids.map((s, i) => [s, i] as const).filter(([s]) => s.part.box && !s.r && !s.part.thin && !s.part.fx && !s.part.hollow && !s.part.fit && ARCH.test(P[s.piece].kind));
    const isBox = new Set(boxes.map(([, i]) => i));
    for (const [A, i] of boxes) for (const j of S.grid.near(A.lo, A.hi, 0.01)) {
      if (j <= i || !isBox.has(j)) continue;
      const B = S.solids[j];
      if (A.part.color === B.part.color) continue;
      for (let ka = 0; ka < 3; ka++) for (const sa of [-1, 1]) {
        const n = A.u[ka].clone().multiplyScalar(sa), da = A.c.dot(n) + A.e[ka];
        const kb = [0, 1, 2].find((k) => Math.abs(B.u[k].dot(n)) > 0.9995);
        if (kb === undefined) continue;
        const sb = B.u[kb].dot(n) > 0 ? 1 : -1, db = B.c.dot(n) + B.e[kb];
        if (Math.abs(da - db) > 0.004 || sb * B.u[kb].dot(n) < 0) continue;
        // How far the two face rectangles overlap in their plane (separating axes in the plane).
        const ia = [0, 1, 2].filter((k) => k !== ka), ib = [0, 1, 2].filter((k) => k !== kb), d = B.c.clone().sub(A.c);
        const over = Math.min(...[...ia.map((k) => A.u[k]), ...ib.map((k) => B.u[k])].map((L) => {
          const ra = ia.reduce((acc, k) => acc + A.e[k] * Math.abs(A.u[k].dot(L)), 0), rb = ib.reduce((acc, k) => acc + B.e[k] * Math.abs(B.u[k].dot(L)), 0);
          return ra + rb - Math.abs(d.dot(L));
        }));
        if (over < 0.05) continue;
        // Only where it shows: in the middle of where the two faces overlap (along each of A's axes in
        // the plane, the middle of the span both cover), just out from the plane, in the open.
        const mid = A.c.clone();
        for (const j of ia) {
          const bc = d.dot(A.u[j]), br = ib.reduce((acc, k) => acc + B.e[k] * Math.abs(B.u[k].dot(A.u[j])), 0);
          mid.addScaledVector(A.u[j], (Math.max(-A.e[j], bc - br) + Math.min(A.e[j], bc + br)) / 2);
        }
        mid.addScaledVector(n, da + 0.01 - mid.dot(n));
        if (mid.y < S.ground(mid.x, mid.z) + 0.02) continue;
        if (S.grid.near(mid, mid).some((m) => !S.solids[m].part.thin && !S.solids[m].part.fx && contains(S.solids[m], mid, -0.002))) continue;
        bad.push(`${P[A.piece].name} / ${P[B.piece].name}: a ${A.part.color.toString(16)} face and a ${B.part.color.toString(16)} face lie in one plane at ${fmt(mid)}`);
      }
    }
    expect([...new Set(bad)], [...new Set(bad)].slice(0, 60).join('\n')).toEqual([]);
  });

  it('rock never rises through a road, a walk, the paving or a lawn, or through the masonry', () => {
    const { layout: L, view } = S, bad = new Set<string>();
    const hard = (i: number) => L.cells[i] === Cell.Ground && !L.fluid[i] && (L.ground[i] === Ground.Stone || L.ground[i] === Ground.Path || L.ground[i] === Ground.Dirt || L.lawn?.[i] === Lawn.Clipped || L.lawn?.[i] === Lawn.Garden);
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), m = new THREE.Matrix4(), box = new THREE.Box3();
    const rock: { mesh: THREE.Mesh; box: THREE.Box3 }[] = [];
    view.group.traverse((o) => {
      if (!(o instanceof THREE.InstancedMesh) || !o.userData.rock) return;
      o.geometry.computeBoundingBox();
      for (let k = 0; k < o.count; k++) {
        o.getMatrixAt(k, m);
        box.copy(o.geometry.boundingBox!).applyMatrix4(m);
        if (box.max.x < CASTLE_AREA.x0 || box.min.x > CASTLE_AREA.x1 || box.max.z < CASTLE_AREA.z0 || box.min.z > CASTLE_AREA.z1) continue;
        const mesh = new THREE.Mesh(o.geometry);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(m);
        mesh.matrixWorld.copy(m);
        rock.push({ mesh, box: box.clone() });
      }
    });
    for (const { mesh, box: b } of rock) {
      for (let z = Math.floor(b.min.z); z <= Math.floor(b.max.z); z++) for (let x = Math.floor(b.min.x); x <= Math.floor(b.max.x); x++) {
        const i = z * L.w + x;
        if (!hard(i)) continue;
        for (const [fx, fz] of [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) {
          const px = x + fx, pz = z + fz, fl = S.view.floorAt(px, pz);
          ray.set(new THREE.Vector3(px, b.max.y + 1, pz), down);
          const hit = ray.intersectObject(mesh, false)[0];
          if (hit && hit.point.y > fl + 0.02) bad.add(`rock rises ${(hit.point.y - fl).toFixed(2)} through the ${Ground[L.ground[i]]?.toLowerCase()} at (${x}, ${z})`);
        }
      }
      // Through the masonry: no block of a built piece stands inside the rock above its own foot.
      for (const j of S.grid.near(b.min, b.max)) {
        const s = S.solids[j];
        // (Ivy lies on the stone; a loose boulder may lie heaped against the rock.)
        if (s.part.thin || s.part.hollow || P[s.piece].kind === 'wall_climber' || P[s.piece].kind === 'boulder') continue;
        for (const k of corners(s)) {
          if (k.y < S.ground(k.x, k.z) + 0.05) continue;
          ray.set(new THREE.Vector3(k.x, b.max.y + 1, k.z), down);
          const hit = ray.intersectObject(mesh, false)[0];
          if (hit && hit.point.y > k.y + 0.05) {
            bad.add(`rock stands through ${P[s.piece].name} at ${fmt(k)}`);
            break;
          }
        }
      }
    }
    expect([...bad], [...bad].join('\n')).toEqual([]);
  });

  it('buildings keep clear of each other and of the gates', () => {
    const bad: string[] = [];
    const bs = P.filter((p) => p.building);
    const rect = (p: Piece) => [p.building!.x, p.building!.z, p.building!.x + p.building!.w, p.building!.z + p.building!.d];
    for (const [i, a] of bs.entries()) for (const b of bs.slice(i + 1)) {
      const [ax0, az0, ax1, az1] = rect(a), [bx0, bz0, bx1, bz1] = rect(b);
      const ox = Math.min(ax1, bx1) - Math.max(ax0, bx0), oz = Math.min(az1, bz1) - Math.max(az0, bz0);
      const range = !!(a.building!.shared?.length || a.building!.joined?.length || b.building!.shared?.length || b.building!.joined?.length);
      // (One range's buildings share the wall between them: one cell, no more.)
      if (ox > 0.01 && oz > 0.01 && !(range && Math.min(ox, oz) <= 1.01)) bad.push(`${a.name} and ${b.name} overlap`);
      else if (!range && ox > -1.5 && oz > -1.5) bad.push(`${a.name} and ${b.name} stand jammed together (less than 1.5 apart)`);
    }
    // Every gate keeps a clear space round its arch on both faces: no building within 1.5 of its ends.
    for (const g of P.filter((p) => p.kind === 'outer_gatehouse')) {
      const L = (g.spawn!.len ?? 4) + 2.4;
      for (const b of bs) {
        const [x0, z0, x1, z1] = rect(b);
        for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, z0], [(x0 + x1) / 2, z1], [x0, (z0 + z1) / 2], [x1, (z0 + z1) / 2]]) {
          const q = local(g, new THREE.Vector3(x, g.obj.position.y, z));
          if (Math.abs(q.x) < L / 2 + 1.5 && Math.abs(q.z) < 2.6) {
            bad.push(`${b.name} stands right up against ${g.name}'s arch`);
            break;
          }
        }
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('one thing is one shape: no two blocks of the same stone overlap face to face in the open', () => {
    // A continuous thing (a parapet ring, a string course round a corner, a kerb round a terrace, a
    // hedge round a bed) laid as separate blocks of one stone overlap with their tops at one height:
    // a seam or a flicker where they cross. Such a thing is built as one shape instead. (Sculpture and
    // planting are left alone: a statue's or a plant's parts may overlap.)
    const ARCH = /^(castle_wall|round_tower|corner_tower|outer_gatehouse|parapet|parapet_pier|balustrade|ramp_wall|kerb|kerb_ring|box_border|round_terrace|gate_piers|fence|climb_wall|climb_pier|climb_buttress|stair_flight|gate_bastion|castle_bridge|building:.*)$/;
    const bad: string[] = [];
    for (const p of P.filter((q) => ARCH.test(q.kind))) {
      const ss = p.solids.filter((s) => !s.part.thin && !s.part.hollow && !s.part.fit && s.e[0] * s.e[1] * s.e[2] * 8 > 0.004);
      const by = new Map<number, Solid[]>();
      for (const s of ss) by.set(s.part.color, [...(by.get(s.part.color) ?? []), s]);
      const seen = new Set<string>();
      for (const list of by.values()) for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
        const A = list[a], B = list[b];
        // (The stones of one band, laid edge to edge on mitred joints, are one shape.)
        const band = A.part.info?.band !== undefined && A.part.info?.band === B.part.info?.band;
        if (A.part.mesh === B.part.mesh || band || Math.abs(A.hi.y - B.hi.y) > 0.006 || overlap(A, B) < 0.03) continue;
        if (corners(A).every((k) => contains(B, k, 0.01)) || corners(B).every((k) => contains(A, k, 0.01))) continue;
        // Where they cross, is the top in the open (nothing of the piece standing on it)?
        const mid = A.c.clone().add(B.c).multiplyScalar(0.5).setY(A.hi.y + 0.02);
        if (ss.some((o) => o !== A && o !== B && contains(o, mid, 0))) continue;
        const m = `${p.name}: two ${A.part.color.toString(16)} blocks overlap face to face at ${fmt(mid)}`;
        if (!seen.has(m)) (seen.add(m), bad.push(m));
      }
    }
    expect(bad, bad.slice(0, 3000).join('\n')).toEqual([]);
  });

  it('string courses lie on the course lines, every course of the castle one height, and clear of the window heads under them', () => {
    const bad: string[] = [];
    for (const p of P) {
      const ss = p.solids.filter((s) => !s.part.thin && !s.part.fx);
      // A string course: a long band of the dressed stone one course high (round a drum, a ring of it).
      const bands = ss.filter((s) => s.part.color === DRESS && Math.abs(s.hi.y - s.lo.y - COURSE) < 0.02 && (s.r >= 1.5 || Math.max(s.hi.x - s.lo.x, s.hi.z - s.lo.z) >= 2));
      // Its foot and head on the course lines counted up from the foot the piece stands on.
      const foot = p.obj.getWorldPosition(new THREE.Vector3()).y;
      for (const b of bands) if (!onCourse(b.lo.y - foot) || !onCourse(b.hi.y - foot)) bad.push(`${p.name}: a string course at ${fmt(b.c)} lies off the course lines (${(b.lo.y - foot).toFixed(2)} to ${(b.hi.y - foot).toFixed(2)} over its foot)`);
      // A window's head (the top of its glass) and the ring over it stand well under the next course.
      for (const g of p.solids.filter((s) => s.part.tag === 'glass')) for (const b of bands.filter((q) => !q.r)) {
        const over = Math.min(b.hi.x, g.hi.x) - Math.max(b.lo.x, g.lo.x) > 0 && Math.min(b.hi.z, g.hi.z) - Math.max(b.lo.z, g.lo.z) > -0.6;
        if (over && b.lo.y > g.hi.y - 0.05 && b.lo.y - g.hi.y < 0.5) bad.push(`${p.name}: a string course at ${fmt(b.c)} runs ${(b.lo.y - g.hi.y).toFixed(2)} over a window's head at ${fmt(g.c)}`);
      }
    }
    expect([...new Set(bad)], [...new Set(bad)].slice(0, 40).join('\n')).toEqual([]);
  });

  it('every wall is laid in whole courses on the course lines: none squeezed or stretched to a band of its own', () => {
    const bad: string[] = [];
    const WALLING = new Set([ASHLAR, ASHLAR_B, BASE]);
    for (const p of P) {
      for (const r of (p.obj.userData.courses ?? []) as CourseRecord[]) {
        // The walling of every wall, tower and building, a storey or a stretch of it (the dressings, a
        // lintel or a tympanum over its own lintel, are laid to the walling's lines by the bands on them,
        // tested above; a statue's pedestal is no wall).
        const lo = r.box.min.y, hi = r.box.max.y, long = Math.max(r.box.max.x - r.box.min.x, r.box.max.z - r.box.min.z);
        if (r.single || r.laid || !WALLING.has(r.color) || hi - lo <= 0.8 || long < 2) continue;
        // Each stretch of courses showing on it (between two breaks, or over the last) starts on a course
        // line and holds a whole number of courses.
        const br = r.breaks;
        for (let i = 0; i < br.length; i++) {
          const a = br[i], e = br[i + 1] ?? Infinity;
          if (Math.min(e, hi) - Math.max(a, lo) < 0.25) continue;
          const n = (e - a) / r.course;
          if (!onCourse(a) || (e < Infinity && Math.abs(n - Math.round(n)) > 0.01)) bad.push(`${p.name}: walling at (${r.box.min.x.toFixed(1)}, ${lo.toFixed(1)}, ${r.box.min.z.toFixed(1)}) is laid in courses ${((e - a) / Math.max(1, Math.round(n))).toFixed(3)} high from ${a.toFixed(2)} (to a band at ${e.toFixed(2)})`);
        }
      }
    }
    expect([...new Set(bad)], [...new Set(bad)].slice(0, 40).join('\n')).toEqual([]);
  });

  it('paving stops at the inside face of every rail: no road shows outside a parapet or a balustrade', () => {
    const { layout: L } = S, bad: string[] = [];
    /** Is the ground at a point laid as a road or a walk (paving, gravel, the climb's earth)? */
    const road = (x: number, z: number) => {
      const i = Math.floor(z) * L.w + Math.floor(x);
      return L.ground[i] === Ground.Stone || L.ground[i] === Ground.Path || L.ground[i] === Ground.Dirt;
    };
    const check = (name: string, x: number, z: number) => {
      if (road(x, z)) bad.push(`${name}: road shows outside its outer face at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    };
    // Parapets and balustrades: built along local X, the outer face toward +Z (the parapet's base 0.9
    // deep, the balustrade's plinth 0.34 deep, set 0.33 out); looked at a hand's breadth beyond it.
    // (Every run on the crown, the ledge and the landing, whether or not it lies in the castle's area.)
    const Y = new THREE.Vector3(0, 1, 0);
    for (const sp of L.props.filter((q) => q.kind === 'parapet' || q.kind === 'balustrade')) {
      const L2 = (sp.len ?? 6) / 2, out = sp.kind === 'parapet' ? 0.6 : 0.65, name = `${sp.kind}@${sp.x.toFixed(1)},${sp.z.toFixed(1)}`;
      for (let u = -L2 + 0.3; u <= L2 - 0.3; u += 0.25) {
        const v = new THREE.Vector3(u, 0, out).applyAxisAngle(Y, sp.rot ?? 0);
        check(name, sp.x + v.x, sp.z + v.z);
      }
    }
    expect([...new Set(bad)], [...new Set(bad)].slice(0, 40).join('\n')).toEqual([]);
  });

  it('a low wall runs square into one face of its pier, its end buried in the pier', () => {
    const bad: string[] = [];
    const Y = new THREE.Vector3(0, 1, 0);
    // Each run's ends: where it stops, the way it runs into the end, and its coping's half width.
    const ends: { name: string; at: number[]; dir: number[]; hw: number }[] = [];
    for (const sp of S.layout.props.filter((q) => q.kind === 'parapet' || q.kind === 'balustrade')) {
      const L = (sp.len ?? 6) / 2, hw = sp.kind === 'parapet' ? 0.39 : 0.09;
      for (const sg of [-1, 1]) {
        const v = new THREE.Vector3(sg * L, 0, 0).applyAxisAngle(Y, sp.rot ?? 0);
        ends.push({ name: `${sp.kind}@${sp.x.toFixed(1)},${sp.z.toFixed(1)}`, at: [sp.x + v.x, sp.z + v.z], dir: [v.x / L, v.z / L], hw });
      }
    }
    for (const sp of S.layout.props.filter((q) => q.kind === 'ramp_wall')) {
      const pts = (sp.opt as { pts: number[][] }).pts.map(([x, z]) => [x + sp.x, z + sp.z]);
      for (const [e, f] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
        const l = Math.hypot(e[0] - f[0], e[1] - f[1]);
        ends.push({ name: `ramp_wall@${sp.x.toFixed(1)},${sp.z.toFixed(1)}`, at: e, dir: [(e[0] - f[0]) / l, (e[1] - f[1]) / l], hw: (((sp.opt as { w?: number }).w ?? 0.62) - 0.02) / 2 });
      }
    }
    for (const pier of P.filter((p) => p.kind === 'parapet_pier')) {
      const c = pier.obj.getWorldPosition(new THREE.Vector3());
      for (const e of ends) {
        if (Math.hypot(e.at[0] - c.x, e.at[1] - c.z) > 0.75) continue;
        // In the pier's own frame: the wall's way in lies within 25° of a face's normal...
        const d = local(pier, new THREE.Vector3(c.x + e.dir[0], c.y, c.z + e.dir[1]));
        const off = Math.atan2(Math.min(Math.abs(d.x), Math.abs(d.z)), Math.max(Math.abs(d.x), Math.abs(d.z)));
        if (off > (25 * Math.PI) / 180) bad.push(`${e.name} runs into ${pier.name} ${((off * 180) / Math.PI).toFixed(0)}° off square, into its corner`);
        // ...and both corners of its coping's end stand inside the pier's shaft (0.95 square).
        for (const sg of [-1, 1]) {
          const q = local(pier, new THREE.Vector3(e.at[0] - e.dir[1] * e.hw * sg, c.y, e.at[1] + e.dir[0] * e.hw * sg));
          if (Math.max(Math.abs(q.x), Math.abs(q.z)) > 0.475 + 0.03) bad.push(`${e.name} stops short of ${pier.name}'s face at (${(c.x + q.x).toFixed(1)}, ${(c.z + q.z).toFixed(1)})`);
        }
      }
    }
    expect([...new Set(bad)], [...new Set(bad)].join('\n')).toEqual([]);
  });

  it('no tree stands out over a drop: ground or rock lies under the whole foot of every trunk', () => {
    const bad: string[] = [];
    const m = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    const trees = new Map<string, { p: THREE.Vector3; s: number }>();
    const solid: THREE.Object3D[] = [];
    S.view.group.traverse((o) => {
      if (o.name === 'relief' || (o instanceof THREE.InstancedMesh && o.userData.rock)) solid.push(o);
      if (!(o instanceof THREE.InstancedMesh) || o.name !== 'tree') return;
      for (let k = 0; k < o.count; k++) {
        o.getMatrixAt(k, m);
        m.decompose(pos, quat, scl);
        if (pos.x > CASTLE_AREA.x0 - 20 && pos.x < CASTLE_AREA.x1 + 20 && pos.z > CASTLE_AREA.z0 - 20 && pos.z < CASTLE_AREA.z1 + 30) trees.set(`${pos.x.toFixed(2)},${pos.z.toFixed(2)}`, { p: pos.clone(), s: scl.x });
      }
    });
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    for (const { p, s } of trees.values()) {
      // (Only trees standing above the land's own ground: on a ledge or a rock's shoulder.)
      const ground = (x: number, z: number) => Math.max(S.view.heightAt(x, z), S.view.floorAt(x, z));
      if (p.y < ground(p.x, p.z) + 0.3) continue;
      const R = 0.25 * s;
      for (let j = 0; j < 8; j++) {
        const x = p.x + Math.cos((j / 8) * Math.PI * 2) * R, z = p.z + Math.sin((j / 8) * Math.PI * 2) * R;
        if (ground(x, z) > p.y - 0.35) continue;
        ray.set(new THREE.Vector3(x, p.y + 1.5, z), down);
        ray.far = 2.0;
        const hit = ray.intersectObjects(solid, false)[0];
        if (!hit || hit.point.y < p.y - 0.35) {
          bad.push(`a tree at ${fmt(p)} stands out over a drop at (${x.toFixed(2)}, ${z.toFixed(2)})`);
          break;
        }
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('every lawn is kerbed all round where it meets paving, and no kerb runs on past its lawn', () => {
    const { layout: L } = S, bad: string[] = [];
    // The kerbs in plan: the layout's (laid along cell edges) and the kerb props' blocks.
    const strips: { x: number; z: number; ux: number; uz: number; hl: number; hw: number }[] = (L.kerbs ?? []).map((k) => ({ x: k.x, z: k.z, ux: Math.cos(k.rot), uz: -Math.sin(k.rot), hl: k.len / 2 + 0.01, hw: KERB_W / 2 }));
    for (const p of P.filter((q) => q.kind === 'kerb_ring' || q.kind === 'kerb')) for (const s of p.solids) {
      const ax = [0, 2].reduce((a, k) => (s.e[k] > s.e[a] ? k : a), 0), across = ax === 0 ? 2 : 0;
      strips.push({ x: s.c.x, z: s.c.z, ux: s.u[ax].x, uz: s.u[ax].z, hl: s.e[ax] + 0.02, hw: s.e[across] });
    }
    const kerbed = (x: number, z: number, pad: number) => strips.some((k) => {
      const dx = x - k.x, dz = z - k.z, along = dx * k.ux + dz * k.uz, across = Math.abs(-dx * k.uz + dz * k.ux);
      return Math.abs(along) <= k.hl + pad && across <= k.hw + pad;
    });
    const cut = (x: number, z: number) => (L.lawnCut ?? []).find((c) => Math.hypot(x - c.x, z - c.z) < c.r);
    const lawnAt = (x: number, z: number) => {
      const i = Math.floor(z) * L.w + Math.floor(x);
      return (L.lawn?.[i] === Lawn.Clipped || L.lawn?.[i] === Lawn.Garden) && !cut(x, z);
    };
    const paved = (x: number, z: number) => {
      const i = Math.floor(z) * L.w + Math.floor(x);
      return L.cells[i] === Cell.Ground && L.ground[i] === Ground.Stone;
    };
    // Along the lawns' curved edges round the fountain: wherever lawn lies just outside the circle and
    // paving just inside it, a kerb runs.
    for (const c of L.lawnCut ?? []) for (let a = 0; a < Math.PI * 2; a += 0.01) {
      const ox = c.x + Math.sin(a) * (c.r + 0.25), oz = c.z + Math.cos(a) * (c.r + 0.25), ix = c.x + Math.sin(a) * (c.r - 0.25), iz = c.z + Math.cos(a) * (c.r - 0.25);
      const edgeHere = lawnAt(ox, oz) && paved(ix, iz);
      const at = `(${(c.x + Math.sin(a) * c.r).toFixed(1)}, ${(c.z + Math.cos(a) * c.r).toFixed(1)})`;
      if (edgeHere && !kerbed(c.x + Math.sin(a) * (c.r - 0.2), c.z + Math.cos(a) * (c.r - 0.2), 0.05)) bad.push(`a lawn's curved edge at ${at} has no kerb`);
    }
    // No kerb runs on beyond its lawn into the open paving: every point along a kerb prop has lawn
    // beside it.
    for (const p of P.filter((q) => q.kind === 'kerb_ring')) for (const s of p.solids) {
      const ax = [0, 2].reduce((a, k) => (s.e[k] > s.e[a] ? k : a), 0);
      for (const t of [-0.6, 0, 0.6]) {
        const x = s.c.x + s.u[ax].x * s.e[ax] * t, z = s.c.z + s.u[ax].z * s.e[ax] * t;
        // (Lawn within a short step of it: at a lawn's sharp corner the kerb runs beside a thin wedge.)
        const near = Array.from({ length: 12 }, (_, j) => (j / 12) * Math.PI * 2).some((a) => [0.5, 0.9].some((d) => lawnAt(x + Math.sin(a) * d, z + Math.cos(a) * d)));
        if (!near) bad.push(`${p.name}: its kerb runs on past the lawn at (${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
    }
    // Where a curved kerb ends it meets a straight kerb end to end, on its line: one edge round the
    // lawn's corner, never a point running on past it or a gap.
    for (const p of P.filter((q) => q.kind === 'kerb_ring')) {
      const bands = new Map<number, Solid[]>();
      // (A band laid in separate stones names its band.)
      for (const s of p.solids) {
        const id = (s.part.info?.band as number | undefined) ?? 100 + s.part.mesh;
        bands.set(id, [...(bands.get(id) ?? []), s]);
      }
      for (const list of bands.values()) for (const [s, nb] of [[list[0], list[1]], [list[list.length - 1], list[list.length - 2]]]) {
        // (A band's blocks run along their own X; its free end is the face away from its neighbour.)
        const u = s.u[0], ends = [1, -1].map((sg) => s.c.clone().addScaledVector(u, sg * s.e[0]));
        const end = ends[0].distanceTo(nb.c) > ends[1].distanceTo(nb.c) ? ends[0] : ends[1];
        const meets = (L.kerbs ?? []).some((k) => {
          const kx = Math.cos(k.rot), kz = -Math.sin(k.rot);
          if (Math.abs(kx * u.x + kz * u.z) < 0.995) return false;
          return [1, -1].some((sg) => Math.hypot(k.x + (kx * sg * k.len) / 2 - end.x, k.z + (kz * sg * k.len) / 2 - end.z) < 0.08);
        });
        if (!meets) bad.push(`${p.name}: its kerb ends at (${end.x.toFixed(2)}, ${end.z.toFixed(2)}) without meeting a straight kerb end to end`);
      }
    }
    expect([...new Set(bad)], [...new Set(bad)].slice(0, 40).join('\n')).toEqual([]);
  });
});
