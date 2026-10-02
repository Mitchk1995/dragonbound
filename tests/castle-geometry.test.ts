import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Cell, Ground, Lawn } from '../src/world/layout';
import { DOORS, HERO_HEIGHT } from '../src/world/props';
import { castleScene, CASTLE_AREA, type Piece } from './castleScene';
import { contains, corners, overlap, type Solid } from './geometry';

/**
 * The castle's geometry audit: the keep is built as the game builds it, every prop and building in
 * and round the castle broken back into its blocks, and the blocks tested against each other. It
 * fails, naming the pieces, wherever one piece clips through another, anything floats, a door or a
 * window is wrong for its wall or the hero, rock rises through a walk, or a building crowds a gate.
 */

const S = castleScene();
const P = S.pieces;
const fmt = (v: THREE.Vector3) => `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`;
const kindOf = (p: Piece) => (p.kind.startsWith('building:') ? 'building' : p.kind);
/** How deep two pieces' blocks may overlap at any seam (a hair, so blocks laid tight never count). */
const TIGHT = 0.05;

/**
 * Pieces that are built into each other on purpose, and why. A pair not listed here may not overlap
 * at all; a listed pair is held to its rule (when it has one) instead.
 */
const JOINTS: { a: string[]; b: string[]; why: string; rule?: (a: Piece, b: Piece) => string[] }[] = [
  { a: ['castle_wall'], b: ['round_tower', 'corner_tower'], why: 'a curtain run ends inside its tower\'s drum, its wall walk at a doorway', rule: (w, t) => wallIntoTower(w, t) },
  { a: ['castle_wall'], b: ['outer_gatehouse', 'ward_gate', 'postern'], why: 'a gate is built across the curtain\'s run; the wall stops at its sides', rule: (w, g) => wallAtGate(w, g) },
  { a: ['castle_wall'], b: ['outer_gate'], why: 'the outer gate\'s north wing is bonded into the curtain\'s outer face' },
  { a: ['castle_wall', 'round_tower', 'corner_tower', 'donjon', 'building'], b: ['wall_climber'], why: 'ivy and roses lie flat on the masonry, rooted in its foot' },
  { a: ['building'], b: ['pavilion', 'door_turret', 'donjon', 'castle_wall', 'building'], why: 'built against a building\'s wall (never through it into its rooms)', rule: (b, o) => intoRooms(b, o) },
  { a: ['building'], b: ['great_doors'], why: 'the great door\'s leaves hang in the hall\'s doorway, standing open into the hall' },
  { a: ['parapet', 'balustrade', 'ramp_wall', 'kerb'], b: ['parapet', 'balustrade', 'parapet_pier'], why: 'runs of one low wall meet end to end or on their pier' },
  { a: ['outer_gate'], b: ['parapet', 'parapet_pier'], why: 'the landing\'s parapet starts at the outer gate\'s jamb' },
  { a: ['ramp_paving'], b: ['ramp_wall', 'parapet_pier'], why: 'the climb\'s paving runs in under the feet of its kerb walls and their piers' },
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
    expect(P.length).toBeGreaterThan(300);
    expect(S.solids.length).toBeGreaterThan(20000);
    expect(S.solids.filter((s) => s.part.tag === 'door-leaf').length).toBeGreaterThan(40);
    expect(S.solids.filter((s) => s.part.tag === 'glass').length).toBeGreaterThan(40);
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
        if (overlap(hd, leaf) < -0.03) bad.push(`${p.name}: a door handle at ${fmt(hd.c)} stands off its leaf`);
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
      const solid = p.solids.filter((s) => s !== g && !s.part.thin && !s.part.hollow);
      const set = [-1, 1].some((sg) => solid.some((s) => contains(s, g.c.clone().addScaledVector(N, sg * (g.e[n] + 0.12)), 0.02)));
      if (!set && !solid.some((s) => overlap(s, g) > -0.03)) bad.push(`${p.name}: a window pane at ${fmt(g.c)} hangs in the air, in no wall`);
      // From at least one side the whole pane shows: no block in front of its middle or across it.
      const side = [1, -1].find((sg) => [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.3], [0, -0.3]].every(([a, b]) => {
        const across = [0, 1, 2].filter((k) => k !== n);
        const q = g.c.clone().addScaledVector(g.u[across[0]], a * 2 * g.e[across[0]]).addScaledVector(g.u[across[1]], b * 2 * g.e[across[1]]).addScaledVector(N, sg * (g.e[n] + 0.04));
        return !solid.some((s) => contains(s, q, -0.005));
      }));
      if (side === undefined) bad.push(`${p.name}: a window pane at ${fmt(g.c)} is crossed or covered by a block`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
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
        if (s.part.thin || s.part.hollow || P[s.piece].kind === 'wall_climber') continue;
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
    for (const g of P.filter((p) => ['ward_gate', 'postern', 'outer_gate', 'outer_gatehouse'].includes(p.kind))) {
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
    const ARCH = /^(castle_wall|round_tower|corner_tower|donjon|outer_gatehouse|ward_gate|postern|outer_gate|door_turret|pavilion|parapet|parapet_pier|balustrade|ramp_wall|kerb|kerb_ring|box_border|round_terrace|field_shelter|gate_piers|fence|building:.*)$/;
    const bad: string[] = [];
    for (const p of P.filter((q) => ARCH.test(q.kind))) {
      const ss = p.solids.filter((s) => !s.part.thin && !s.part.hollow && !s.part.fit && s.e[0] * s.e[1] * s.e[2] * 8 > 0.004);
      const by = new Map<number, Solid[]>();
      for (const s of ss) by.set(s.part.color, [...(by.get(s.part.color) ?? []), s]);
      const seen = new Set<string>();
      for (const list of by.values()) for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
        const A = list[a], B = list[b];
        if (A.part.mesh === B.part.mesh || Math.abs(A.hi.y - B.hi.y) > 0.006 || overlap(A, B) < 0.03) continue;
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

  it('every lawn is kerbed all round where it meets paving, and no kerb runs on past its lawn', () => {
    const { layout: L } = S, bad: string[] = [];
    // The kerbs in plan: the layout's (laid along cell edges) and the kerb props' blocks.
    const strips: { x: number; z: number; ux: number; uz: number; hl: number; hw: number }[] = (L.kerbs ?? []).map((k) => ({ x: k.x, z: k.z, ux: Math.cos(k.rot), uz: -Math.sin(k.rot), hl: k.len / 2 + 0.01, hw: 0.2 }));
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
    expect([...new Set(bad)], [...new Set(bad)].slice(0, 40).join('\n')).toEqual([]);
  });
});
