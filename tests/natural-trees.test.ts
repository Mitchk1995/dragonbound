import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BARK_KINDS, coverageMips, LEAF_ATLAS, oakLeafHalfWidth, ovalLeafHalfWidth, paintLeafAtlas, sprayCell, SOURCED_LEAVES, SPRAY_CELLS, type PaintedLeaf } from '../src/render/foliage';
import { mulberry32 } from '../src/core/rng';
import { ZONES } from '../src/data/zones';
import { DEFAULT_WOODS, GROWN, GROWN_KINDS, grownSpecies, grownTrees, grownTriangles, pickGrown, thinWood, treeSet, type GrownKind } from '../src/world/trees';
import { growTree, leafGeometry, OAK, woodGeometry } from '../src/world/treeGrowth';

const tris = (g: THREE.BufferGeometry) => g.index!.count / 3;
const grown = GROWN_KINDS.flatMap((kind) => GROWN[kind].seeds.map((seed, v) => {
  const sk = growTree(grownSpecies(kind, v), seed);
  return { kind, v, seed, sk, wood: woodGeometry(sk), leaves: leafGeometry(sk, seed) };
}));
const oaks = grown.filter((t) => t.kind === 'oak');
const box = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);

/** Connected pieces of an indexed mesh (vertices joined by its triangles), and vertices no triangle uses. */
function pieces(g: THREE.BufferGeometry) {
  const n = g.getAttribute('position').count, idx = g.index!.array;
  const up = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])));
  const used = new Set<number>();
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(idx[t]);
    up[find(idx[t + 1])] = a;
    up[find(idx[t + 2])] = a;
    for (let k = 0; k < 3; k++) used.add(idx[t + k]);
  }
  return { pieces: new Set([...used].map(find)).size, unused: n - used.size };
}

/** How many triangles share each edge. */
function edgeUse(g: THREE.BufferGeometry) {
  const idx = g.index!.array, use = new Map<string, number>();
  for (let t = 0; t < idx.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = idx[t + k], b = idx[t + ((k + 1) % 3)], key = a < b ? `${a},${b}` : `${b},${a}`;
      use.set(key, (use.get(key) ?? 0) + 1);
    }
  }
  return use;
}

describe('grown trees: every kind', () => {
  it('the same seed grows the same tree, another seed another', () => {
    for (const kind of GROWN_KINDS) {
      const [a, b] = grown.filter((t) => t.kind === kind);
      const again = growTree(grownSpecies(kind, 0), a.seed);
      expect(Array.from(woodGeometry(again).getAttribute('position').array)).toEqual(Array.from(a.wood.getAttribute('position').array));
      expect(Array.from(leafGeometry(again, a.seed).getAttribute('position').array)).toEqual(Array.from(a.leaves.getAttribute('position').array));
      expect(Array.from(b.wood.getAttribute('position').array)).not.toEqual(Array.from(a.wood.getAttribute('position').array));
    }
  });

  it('its trunk, roots, limbs and branches are one connected surface, welded at every fork', () => {
    for (const { wood } of grown) {
      expect(pieces(wood)).toEqual({ pieces: 1, unused: 0 });
      // Manifold: no edge carries more than two faces, and the only open edges are round the
      // trunk's foot, under the ground (every tip, collar and step is closed).
      const pos = wood.getAttribute('position');
      for (const [key, n] of edgeUse(wood)) {
        expect(n).toBeLessThanOrEqual(2);
        if (n === 1) for (const v of key.split(',').map(Number)) expect(pos.getY(v)).toBeLessThan(-0.4);
      }
    }
  });

  it('its wood faces outward from every limb', () => {
    // (Judged against the nearest point of any limb's centreline, which misjudges a few triangles in
    // the crotch of each fork; the roots' tips under the ground are left out.)
    for (const { sk, wood } of grown) {
    const pts = sk.limbs.flatMap((L) => L.path);
    const pos = wood.getAttribute('position'), idx = wood.index!.array;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), mid = new THREE.Vector3();
    let out = 0, total = 0;
    for (let t = 0; t < idx.length; t += 3) {
      a.fromBufferAttribute(pos, idx[t]);
      b.fromBufferAttribute(pos, idx[t + 1]);
      c.fromBufferAttribute(pos, idx[t + 2]);
      n.subVectors(b, a).cross(c.clone().sub(a));
      if (n.lengthSq() < 1e-12) continue;
      mid.copy(a).add(b).add(c).divideScalar(3);
      if (mid.y < 0) continue;
      let near = pts[0], best = Infinity;
      for (const p of pts) {
        const d = p.distanceToSquared(mid);
        if (d < best) { best = d; near = p; }
      }
      total++;
      if (n.dot(mid.clone().sub(near)) > 0) out++;
    }
    expect(out / total, `${sk.species.leaf} ${sk.height}`).toBeGreaterThan(0.955);
    }
  });

  it('keeps every main limb and root, and almost every branch, welded on', () => {
    for (const { kind, v, sk } of grown) {
      const sp = grownSpecies(kind, v), count = (order: number) => sk.limbs.filter((L) => L.order === order).length;
      expect(count(0)).toBe(1);
      expect(count(-1)).toBe(sp.roots);
      expect(count(1)).toBeGreaterThanOrEqual(sp.limbs[0]);
      expect(count(1)).toBeLessThanOrEqual(sp.limbs[1]);
      expect(count(2)).toBeGreaterThan(15);
      expect(sk.dropped).toBeLessThanOrEqual(Math.max(3, sk.limbs.length * 0.12));
      expect(sk.limbs.slice(1).every((L) => L.joint !== null)).toBe(true);
    }
  });

  it('stays within its triangle budget (wood and leaves together)', () => {
    for (const { wood, leaves } of grown) {
      expect(tris(wood) + tris(leaves)).toBeLessThanOrEqual(8000);
      expect(tris(leaves)).toBeGreaterThan(800);
    }
    for (const kind of GROWN_KINDS) expect(Math.max(...grownTriangles(kind))).toBeLessThanOrEqual(8000);
  });

  it('wraps whole bark tiles round each limb, its angle carried as a unit cosine and sine', () => {
    for (const { wood } of grown) {
      for (const name of ['aBarkA', 'aBarkB']) {
        const a = wood.getAttribute(name);
        for (let i = 0; i < a.count; i++) {
          expect(Math.hypot(a.getX(i), a.getY(i))).toBeCloseTo(1, 4);
          expect(Number.isInteger(a.getZ(i)) && a.getZ(i) >= 1).toBe(true);
        }
      }
    }
  });

  it("carries the parent's bark into every collar: round the rim's half facing down the parent the branch's wrap lands on the parent's bark", () => {
    const u = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, off: number) => (Math.atan2(a.getY(i), a.getX(i)) / (Math.PI * 2)) * a.getZ(i) + off;
    for (const { sk, wood } of grown) {
      const A = wood.getAttribute('aBarkA'), B = wood.getAttribute('aBarkB'), w = wood.getAttribute('aWood'), idx = wood.index!.array;
      // A collar triangle is drawn last from its branch's first ring (aWood.w = 1); its other corners on the rim.
      const rim = new Set<number>(), kept = new Set<number>();
      let collars = 0, first = 0;
      for (let i = 0; i < w.count; i++) if (w.getW(i) === 1) first++;
      for (let t = 0; t < idx.length; t += 3) {
        const foot = idx[t + 2];
        if (w.getW(foot) !== 1) continue;
        collars++;
        for (const i of [idx[t], idx[t + 1]]) {
          if (w.getW(i) === 1) continue;
          rim.add(i);
          // The branch's wrap, turned at the rim point, lands on the parent's bark (whole tiles apart).
          const d = u(B, i, A.getW(foot) + B.getW(i)) - u(A, i, A.getW(i));
          if (Math.abs(d - Math.round(d)) < 1e-3) kept.add(i);
        }
      }
      expect(first).toBeGreaterThanOrEqual((sk.limbs.length - 1) * 3);
      expect(collars).toBeGreaterThanOrEqual(first);
      expect(rim.size).toBeGreaterThanOrEqual((sk.limbs.length - 1) * 4);
      expect(kept.size).toBeGreaterThan(rim.size * 0.4);
      // Everywhere else the two wraps are one (a first ring's turn is none).
      for (let i = 0; i < w.count; i++) {
        if (rim.has(i)) continue;
        for (const c of ['getX', 'getY', 'getZ'] as const) expect(B[c](i)).toBe(A[c](i));
        expect(B.getW(i)).toBe(w.getW(i) === 1 ? 0 : A.getW(i));
      }
    }
  });

  it('leaf cards: each shows one painted spray, lies flat about its midline, and is lit by unit normals turned toward the sky', () => {
    const cells = Array.from({ length: SPRAY_CELLS * SPRAY_CELLS }, (_, i) => sprayCell(i));
    for (const { leaves } of grown) {
      const uv = leaves.getAttribute('uv'), nrm = leaves.getAttribute('normal'), face = leaves.getAttribute('aCard'), spine = leaves.getAttribute('aSpine'), pos = leaves.getAttribute('position');
      const used = new Set<number>();
      for (let i = 0; i < uv.count; i += 4) {
        const us = [0, 1, 2, 3].map((k) => uv.getX(i + k)), vs = [0, 1, 2, 3].map((k) => uv.getY(i + k));
        const c = cells.findIndex((r) => Math.min(...us) >= r.u0 && Math.max(...us) <= r.u1 && Math.min(...vs) >= r.v0 && Math.max(...vs) <= r.v1);
        expect(c).toBeGreaterThanOrEqual(0);
        used.add(c);
        // Every corner lies in the plane through the card's midline, square to its face.
        const f = new THREE.Vector3().fromBufferAttribute(face, i);
        expect(f.length()).toBeCloseTo(1, 4);
        for (let k = 0; k < 4; k++) {
          const off = new THREE.Vector3().fromBufferAttribute(pos, i + k).sub(new THREE.Vector3().fromBufferAttribute(spine, i + k));
          expect(Math.abs(off.dot(f))).toBeLessThan(1e-4);
        }
      }
      // Every spray design shows up in each tree.
      expect(used.size).toBe(cells.length);
      let up = 0;
      for (let i = 0; i < nrm.count; i++) {
        expect(Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i))).toBeCloseTo(1, 4);
        up += nrm.getY(i);
      }
      expect(up / nrm.count).toBeGreaterThan(0.25);
    }
  });
});

describe('grown trees: true to size', () => {
  it('the common tree stands about 7.5 m tall beside the 2 m hero, its rounded crown taller than wide, on a slim trunk', () => {
    const sp = GROWN.tree.species;
    for (const { sk, wood, leaves } of grown.filter((t) => t.kind === 'tree')) {
      const l = new THREE.Box3().setFromBufferAttribute(leaves.getAttribute('position') as THREE.BufferAttribute);
      const w = new THREE.Box3().setFromBufferAttribute(wood.getAttribute('position') as THREE.BufferAttribute);
      expect(sk.height).toBeGreaterThanOrEqual(sp.height[0]);
      expect(sk.height).toBeLessThanOrEqual(sp.height[1]);
      expect(l.max.y).toBeGreaterThan(sk.height - 1.2);
      expect(l.max.y).toBeLessThan(sk.height + 0.6);
      expect(w.max.y).toBeLessThan(l.max.y);
      const spread = Math.max(l.max.x - l.min.x, l.max.z - l.min.z);
      expect(spread).toBeGreaterThan(5);
      expect(spread).toBeLessThan(l.max.y - l.min.y + 3);
      expect(l.min.y).toBeGreaterThan(2.1);
      const trunk = sk.limbs[0], breast = trunk.path.findIndex((p) => p.y >= 1.3);
      expect(trunk.radius[breast]).toBeGreaterThan(sp.trunk * 0.95);
      expect(trunk.radius[breast]).toBeLessThan(sp.trunk * 1.15);
      // Smaller than every oak.
      for (const o of oaks) expect(sk.height).toBeLessThan(o.sk.height);
    }
  });

  it('the oak stands true to size beside the 2 m hero: about 11 m tall, a crown wider than it is tall, a massive trunk', () => {
    for (const { sk, wood, leaves } of oaks) {
      const w = new THREE.Box3().setFromBufferAttribute(wood.getAttribute('position') as THREE.BufferAttribute);
      const l = new THREE.Box3().setFromBufferAttribute(leaves.getAttribute('position') as THREE.BufferAttribute);
      expect(sk.height).toBeGreaterThanOrEqual(OAK.height[0]);
      expect(sk.height).toBeLessThanOrEqual(OAK.height[1]);
      // The topmost sprays reach the tree's height, not past it by much.
      expect(l.max.y).toBeGreaterThan(sk.height - 1.2);
      expect(l.max.y).toBeLessThan(sk.height + 0.6);
      expect(w.max.y).toBeLessThan(l.max.y);
      const spread = Math.min(l.max.x - l.min.x, l.max.z - l.min.z);
      expect(spread).toBeGreaterThan(sk.height);
      expect(spread).toBeLessThan(17);
      // The crown's lowest leaves hang above the hero's head.
      expect(l.min.y).toBeGreaterThan(2.1);
      const trunk = sk.limbs[0], breast = trunk.path.findIndex((p) => p.y >= 1.3);
      expect(trunk.radius[breast]).toBeGreaterThan(OAK.trunk * 0.95);
      expect(trunk.radius[breast]).toBeLessThan(OAK.trunk * 1.15);
    }
  });


  it('every grown tree keeps its leaves above the hero\'s head and its wood under its leaves', () => {
    for (const { kind, sk, wood, leaves } of grown) {
      const l = box(leaves), w = box(wood);
      expect(l.min.y, kind).toBeGreaterThan(2.1);
      expect(w.max.y, kind).toBeLessThan(l.max.y);
      expect(sk.height, kind).toBeGreaterThanOrEqual(grownSpecies(kind, 0).height[0] - 1.5);
    }
  });

  it('each species keeps to its own size: the ladder climbs from the common tree to the tall magic tree, the willow broadest', () => {
    const tallest = (kind: GrownKind) => Math.max(...grown.filter((t) => t.kind === kind).map((t) => box(t.leaves).max.y));
    const widest = (kind: GrownKind) => Math.max(...grown.filter((t) => t.kind === kind).map((t) => { const b = box(t.leaves); return Math.min(b.max.x - b.min.x, b.max.z - b.min.z); }));
    for (const kind of GROWN_KINDS.filter((k) => k !== 'tree')) expect(tallest(kind), kind).toBeGreaterThan(tallest('tree'));
    expect(tallest('magic')).toBeGreaterThan(tallest('yew'));
    for (const kind of ['tree', 'maple', 'yew', 'magic'] as GrownKind[]) expect(widest('willow')).toBeGreaterThan(widest(kind));
  });

  it("a willow weeps: strands of leaves hang plumb from its outer branches, as one chain each, down to just above the hero's head", () => {
    for (const { sk, leaves } of grown.filter((t) => t.kind === 'willow')) {
      const hanging = sk.sprays.filter((s) => s.hang);
      expect(hanging.length).toBeGreaterThan(sk.sprays.length * 0.4);
      for (const s of hanging) {
        expect(s.dir.y).toBeLessThan(-0.99);
        // Each card of a strand starts where the one above it ends (a little overlap), swaying from the strand's top.
        expect(s.at.y).toBeCloseTo(s.hang!.top.y + s.dir.y * (s.size / 1.08) * s.hang!.drop, 5);
        expect(s.hang!.top.y - s.hang!.hem).toBeGreaterThan(0.6);
        expect(s.hang!.hem).toBeGreaterThanOrEqual(2.35);
      }
      // The curtain falls well below the crown's foot.
      expect(box(leaves).min.y).toBeLessThan(sk.crown.centre.y - sk.crown.down);
    }
    // No other species weeps.
    for (const { kind, sk } of grown) if (kind !== 'willow') expect(sk.sprays.some((s) => s.hang)).toBe(false);
  });

  it('a yew is dense and dark on a massive fluted trunk; a magic tree slim and open', () => {
    const per = (kind: GrownKind, f: (t: (typeof grown)[number]) => number) => grown.filter((t) => t.kind === kind).map(f);
    const girth = (t: (typeof grown)[number]) => { const T = t.sk.limbs[0]; return T.radius[T.path.findIndex((p) => p.y >= 1.3)]; };
    const density = (t: (typeof grown)[number]) => { const b = box(t.leaves); return t.sk.sprays.length / ((b.max.x - b.min.x) * (b.max.z - b.min.z) * (b.max.y - b.min.y)); };
    for (const d of per('yew', density)) for (const m of per('magic', density)) expect(d).toBeGreaterThan(m);
    for (const g of per('yew', girth)) expect(g).toBeGreaterThan(0.45);
    for (const g of per('magic', girth)) expect(g).toBeLessThan(0.4);
    for (const kind of GROWN_KINDS) expect(new Set(GROWN[kind].seeds.map((_, v) => JSON.stringify(grownSpecies(kind, v)))).size, kind).toBeGreaterThanOrEqual(GROWN[kind].forms ? 3 : 1);
  });
});

describe('grown trees: painted surfaces', () => {
  it('an oak leaf has rounded lobes: its outline swells and dips three or more times a side', () => {
    for (const left of [true, false]) {
      const w = Array.from({ length: 400 }, (_, i) => oakLeafHalfWidth((i + 0.5) / 400, left));
      let dips = 0;
      for (let i = 1; i < w.length - 1; i++) if (w[i] < w[i - 1] && w[i] <= w[i + 1]) dips++;
      expect(dips).toBeGreaterThanOrEqual(3);
      expect(oakLeafHalfWidth(0, left)).toBe(0);
      expect(oakLeafHalfWidth(1, left)).toBe(0);
    }
  });

  it('an oval leaf swells once to its widest below the middle and draws out to a point', () => {
    const w = Array.from({ length: 400 }, (_, i) => ovalLeafHalfWidth((i + 0.5) / 400, true));
    const widest = w.indexOf(Math.max(...w)) / 400;
    expect(widest).toBeGreaterThan(0.3);
    expect(widest).toBeLessThan(0.55);
    expect(w[396]).toBeLessThan(Math.max(...w) * 0.25);
  });

  it.each(['oak', 'oval'] as PaintedLeaf[])('the %s leaf atlas: sprays on clear ground, and mipmaps that keep the leaves as full at a distance', (kind) => {
    const levels = coverageMips(paintLeafAtlas(kind), LEAF_ATLAS);
    expect(levels[0].width).toBe(LEAF_ATLAS);
    expect(levels[levels.length - 1].width).toBe(1);
    const passing = (l: (typeof levels)[number]) => {
      let p = 0;
      for (let i = 3; i < l.data.length; i += 4) if (l.data[i] >= 128) p++;
      return p / (l.width * l.height);
    };
    const full = passing(levels[0]);
    expect(full).toBeGreaterThan(0.2);
    expect(full).toBeLessThan(0.7);
    // Each cell's corners are clear (the sprays never touch a neighbour's).
    const a = (x: number, y: number) => levels[0].data[(y * LEAF_ATLAS + x) * 4 + 3];
    for (let i = 0; i < SPRAY_CELLS * SPRAY_CELLS; i++) {
      const { u0, u1, v0, v1 } = sprayCell(i), x0 = u0 * LEAF_ATLAS, x1 = u1 * LEAF_ATLAS - 1, y0 = v0 * LEAF_ATLAS, y1 = v1 * LEAF_ATLAS - 1;
      for (const [x, y] of [[x0, y1], [x1, y1], [x0, y0]]) expect(a(x, y)).toBe(0);
    }
    for (const l of levels.filter((l) => l.width >= 16)) {
      expect(passing(l) / full).toBeGreaterThan(0.85);
      expect(passing(l) / full).toBeLessThan(1.15);
    }
    // Clear texels carry the leaves' colour (no dark fringe where an edge is filtered).
    let dark = 0, clear = 0;
    for (let i = 0; i < levels[0].data.length; i += 4) {
      if (levels[0].data[i + 3] > 0) continue;
      clear++;
      if (levels[0].data[i + 1] < 40) dark++;
    }
    expect(dark / clear).toBeLessThan(0.01);
  });

  it.each(BARK_KINDS)('the %s bark ships as a 1K colour map and normal map, each listed with its source', (kind) => {
    const notes = readFileSync('public/textures/bark/LICENSES.md', 'utf8');
    for (const file of [`${kind}.jpg`, `${kind}-normal.jpg`]) {
      const jpg = readFileSync(`public/textures/bark/${file}`);
      expect(jpg.readUInt16BE(0)).toBe(0xffd8);
      expect(jpegSize(jpg)).toEqual({ width: 1024, height: 1024 });
      expect(jpg.length).toBeLessThan(450_000);
      expect(notes).toContain(`\`${file}\``);
    }
  });

  it.each(SOURCED_LEAVES)('the %s leaves ship as a 1K WebP atlas with its alpha, listed with its source', (kind) => {
    const notes = readFileSync('public/textures/leaves/LICENSES.md', 'utf8');
    const webp = readFileSync(`public/textures/leaves/${kind}.webp`);
    expect(webp.toString('ascii', 0, 4)).toBe('RIFF');
    expect(webp.toString('ascii', 8, 12)).toBe('WEBP');
    // An extended WebP (VP8X): its alpha flag set, and its canvas size (each less one, 24 bits).
    expect(webp.toString('ascii', 12, 16)).toBe('VP8X');
    expect(webp[20] & 0x10).toBe(0x10);
    expect(webp.readUIntLE(24, 3) + 1).toBe(1024);
    expect(webp.readUIntLE(27, 3) + 1).toBe(1024);
    expect(webp.length).toBeLessThan(450_000);
    expect(notes).toContain(`\`${kind}.webp\``);
  });
});

/** A JPEG's size, from its frame header. */
function jpegSize(jpg: Buffer) {
  for (let i = 2; i < jpg.length;) {
    const marker = jpg.readUInt16BE(i), len = jpg.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffc2) return { width: jpg.readUInt16BE(i + 7), height: jpg.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return null;
}

describe('grown trees in the world', () => {
  it('the natural style grows each grown kind as its shapes, each its own wood paired with its own leaves', () => {
    const natural = treeSet('natural'), block = treeSet('block');
    expect(natural.natural).toBe(true);
    expect(block.natural).toBe(false);
    // (Kinds a zone gives no grown species keep the block models, the very same ones.)
    expect(natural.canopy.ash).toBe(block.canopy.ash);
    expect(natural.bush).toBe(block.bush);
    for (const kind of GROWN_KINDS) {
      const set = grownTrees(kind);
      expect(set.trunk.length).toBe(GROWN[kind].seeds.length);
      expect(set.canopy.length).toBe(GROWN[kind].seeds.length);
      expect(GROWN[kind].seeds.length).toBeGreaterThanOrEqual(3);
      expect(GROWN[kind].seeds.length).toBeLessThanOrEqual(4);
    }
  });

  it("every zone's woods name grown species with weights, and every living tree kind it grows has some", () => {
    for (const zone of Object.values(ZONES)) {
      const woods = zone.theme.woods ?? DEFAULT_WOODS;
      const kinds = Object.keys(zone.theme.forest ?? { [zone.theme.trees]: 1 }).filter((k) => k !== 'ash');
      for (const k of kinds) expect(Object.values(woods.kinds[k as keyof typeof woods.kinds] ?? {}).some((w) => w! > 0), `${zone.id} ${k}`).toBe(true);
      for (const weights of Object.values(woods.kinds)) for (const [g, w] of Object.entries(weights!)) {
        expect(GROWN_KINDS).toContain(g);
        expect(w).toBeGreaterThan(0);
      }
      for (const g of woods.autumn ?? []) expect(GROWN[g].look.autumn, g).toBeDefined();
    }
  });

  it('picks a species by its weight, and a waterside one by the water', () => {
    const count = (wet: boolean) => {
      const n: Partial<Record<GrownKind, number>> = {};
      for (let i = 0; i < 1000; i++) {
        const g = pickGrown({ oak: 1, maple: 1, willow: 1 }, (i + 0.5) / 1000, wet)!;
        n[g] = (n[g] ?? 0) + 1;
      }
      return n;
    };
    const dry = count(false), wet = count(true);
    expect(dry.oak).toBeCloseTo(dry.maple!, -1);
    expect(dry.willow!).toBeLessThan(dry.oak! * 0.5);
    expect(wet.willow!).toBeGreaterThan(wet.oak! * 3);
    expect(pickGrown({}, 0.5, false)).toBeNull();
    expect(pickGrown({ yew: 1 }, 1, false)).toBe('yew');
  });

  it('a wood of grown trees is thinned to their spacing, and nothing smaller stands under a kept crown', () => {
    const rng = mulberry32(5);
    const pts = (n: number, spacing?: number) => Array.from({ length: n }, () => ({ x: rng() * 60, z: rng() * 60, spacing }));
    const oaks = pts(400, GROWN.oak.look.spacing), willows = pts(100, GROWN.willow.look.spacing), pines = pts(150), bushes = pts(80);
    const trees = [...oaks, ...willows, ...pines];
    const thin = thinWood(trees, bushes);
    const kept = trees.filter((t, i) => t.spacing !== undefined && thin.trees[i]);
    expect(kept.length).toBeGreaterThan(20);
    expect(kept.some((t) => t.spacing === GROWN.willow.look.spacing)).toBe(true);
    for (const p of kept) for (const q of kept) if (p !== q) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(Math.max(p.spacing!, q.spacing!));
    // Every grown tree left out stood too close to one kept (the wood is as full as its spacing allows).
    trees.forEach((p, i) => p.spacing === undefined || thin.trees[i] || expect(kept.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < Math.max(p.spacing!, q.spacing!))).toBe(true));
    const underCrown = (p: { x: number; z: number }) => kept.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < q.spacing! * 0.5);
    trees.forEach((p, i) => p.spacing === undefined && expect(thin.trees[i]).toBe(!underCrown(p)));
    bushes.forEach((p, i) => expect(thin.under[i]).toBe(!underCrown(p)));
    // The same wood thins the same way every visit.
    expect(thinWood(trees, bushes)).toEqual(thin);
  });
});
