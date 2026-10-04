import * as THREE from 'three';
import type { ZoneTheme } from '../data/zones';
import { abs, atan, attribute, cameraPosition, clamp, cos, dFdx, dFdy, Discard, distance, dot, float, If, length, max, mix, normalize, positionGeometry, pow, select, sin, smoothstep, varying, vec2, vec3 } from 'three/tsl';
import { addPatch, type F, type V2, type V3 } from '../render/patch';
import { noiseTexture } from '../render/textures';
import { Cell, Ground, Lawn, type ZoneLayout } from './layout';
import { strandField } from './strands';
import { isRelief, smoothNoise } from './terrain';

/**
 * A full grass carpet over every lawn cell (layout.lawn): shell layers lifted off the terrain, each
 * cut by a dense field of tapering blades in the fragment shader (about a hundred to a cell on a
 * clipped lawn), dark at the root and light at the tip, swaying with the wind. Each shell traces the
 * view ray down to the next, so a blade reads as one solid blade even from low down. Blades vary in
 * height, lean and hue; clipped castle lawns are short with soft mower stripes, private gardens
 * (Lawn.Garden) are scattered with clover, and the grass grows longer and darker at
 * the foot of hedges, beds and statues; meadows grow taller. The carpet ends exactly on the lawn's
 * own cells (a straight, square edge against paving; a true circle where the layout cuts one), and
 * far away it settles into one layer painted with the blades' own grain.
 */

/** Blade height per lawn kind, in world units. */
const HEIGHT: Record<number, number> = { [Lawn.Meadow]: 0.24, [Lawn.Clipped]: 0.04, [Lawn.Garden]: 0.07 };
/** Shells per graphics preset. */
export const LAWN_SHELLS = { high: 8, medium: 6, low: 4 } as const;
const MAX_SHELLS = 8;
/** Height (0..1 of the blades) of the lowest shell. */
const LOWEST = 0.08;
/** Chunk size in cells (each chunk frustum-culls on its own). */
const CHUNK = 32;
/** Beyond this distance from the camera the blades settle into one flat layer. */
const FADE: [number, number] = [52, 72];

/**
 * Shell heights 0..1 shared by every lawn of a kind; only the first `count` are drawn. Meadows
 * (seen only from the high gameplay camera, and covering whole screens) draw half as many.
 */
const shells = [0, 1].map(() => ({ attr: new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHELLS), 1), count: MAX_SHELLS }));
const [CLIPPED, MEADOW] = shells;
/** Gap between neighbouring shells (0..1 of the blades) on clipped lawns and in meadows. */
const SPACING = { value: new THREE.Vector2() };

/** Draw `n` shells on clipped lawns (the graphics preset's count), half as many in meadows. */
export function setLawnShells(n: number) {
  CLIPPED.count = Math.max(3, Math.min(MAX_SHELLS, n));
  MEADOW.count = Math.max(3, CLIPPED.count - 4);
  for (const set of shells) {
    const a = set.attr.array as Float32Array;
    // Top shell first (the blades' upper layers hide what is under them before it is shaded),
    // down to the lowest at LOWEST (the ground under the lawn is the carpet's dark root layer).
    for (let i = 0; i < MAX_SHELLS; i++) a[i] = i < set.count ? LOWEST + (1 - LOWEST) * (1 - i / (set.count - 1)) : 1;
    set.attr.needsUpdate = true;
  }
  SPACING.value.set((1 - LOWEST) / (CLIPPED.count - 1), (1 - LOWEST) / (MEADOW.count - 1));
}
setLawnShells(MAX_SHELLS);

/**
 * Build the lawn of a zone, or nothing when the layout has none. `heightAt` is the terrain's
 * height query; `wind` the shared wind clock uniform (the tufts and trees sway with the same one).
 */
export function buildLawn(layout: ZoneLayout, theme: ZoneTheme, heightAt: (x: number, z: number) => number, wind: { uWindT: { value: number } }): THREE.Object3D[] {
  const lawn = layout.lawn;
  if (!lawn) return [];
  const { w, h } = layout;
  const VW = w + 1;
  // Along a road the carpet runs out over the road's edge cells and is cut back exactly along the
  // road's true edge (strands.ts), and along a stream or pool it stops just short of the waterline;
  // so those edges curve with the road or the water instead of stepping along the cells.
  const sf = strandField(layout);
  const edge = new Uint8Array(w * h);
  if (sf) for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const i = z * w + x;
    if (lawn[i] || layout.cells[i] !== Cell.Ground || layout.fluid[i]) continue;
    const near = [z * VW + x, z * VW + x + 1, (z + 1) * VW + x, (z + 1) * VW + x + 1].some((v) => sf.path[v] > -0.9 && sf.path[v] < 0.9);
    if (!near) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const xx = x + dx, zz = z + dz;
      if (xx < 0 || zz < 0 || xx >= w || zz >= h || !lawn[zz * w + xx]) continue;
      edge[i] = lawn[zz * w + xx];
      break;
    }
  }
  const kind = (x: number, z: number) => (x < 0 || z < 0 || x >= w || z >= h ? 0 : lawn[z * w + x] || edge[z * w + x]);
  const pal = theme.ground[Ground.Grass] ?? [0x5a7a3a, 0x6a8a44];
  const mid = new THREE.Color(pal[0]).lerp(new THREE.Color(pal[1]), 0.5);
  const uniforms = {
    ...wind,
    uLawnRoot: { value: mid.clone().multiplyScalar(0.36).offsetHSL(0, 0.04, 0) },
    uLawnTip: { value: mid.clone().multiplyScalar(1.28).offsetHSL(0.0, 0.02, 0.02) },
    uLawnNoise: { value: noiseTexture() },
    uLawnFade: { value: new THREE.Vector2(...FADE) },
    uLawnGap: SPACING,
  };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  addPatch(mat, {
    key: 'lawn1',
    uniforms,
    nodes(u) {
      const shell = attribute('aShell', 'float') as F, lawnA = attribute('aLawn', 'vec2') as V2, lawnX = attribute('aLawnX', 'vec2') as V2;
      const fadeR = u.v2('uLawnFade');
      // Far away only the bottom layer stays (the upper shells fold down onto it).
      const fade = float(1).sub(smoothstep(fadeR.x, fadeR.y, distance(positionGeometry.xz, cameraPosition.xz)));
      const lift = shell.mul(lawnA.y).mul(fade);
      const noise = (q: V2) => u.tex('uLawnNoise').sample(q).r;
      return {
        position(p) {
          const t = u.f('uWindT');
          const sway = sin(t.mul(1.7).add(positionGeometry.x.mul(0.45)).add(positionGeometry.z.mul(0.3))).add(sin(t.mul(2.9).add(positionGeometry.z.mul(0.8))).mul(0.5));
          const k = sway.mul(shell).mul(shell).mul(lawnA.y).mul(fade);
          return vec3(p.x.add(k.mul(0.3)), p.y.add(lift).add(0.012), p.z.add(k.mul(0.18)));
        },
        color() {
          const vFade = varying(fade) as F;
          const lawnPos = varying(vec3(positionGeometry.x, positionGeometry.y.add(lift).add(0.012), positionGeometry.z)) as V3;
          const root = u.v3('uLawnRoot'), tipC = u.v3('uLawnTip'), gapU = u.v2('uLawnGap');
          const wp = lawnPos.xz.toVar();
          const clipped = lawnA.y.lessThan(0.2);
          // Fine blades on clipped lawns (several hundred to a cell, mown short into a dense turf);
          // in meadows longer, slender blades, two interleaved fields of them so the sward stays full.
          const p1 = wp.mul(select(clipped, float(40), float(8.5))).toVar();
          // How small a blade is on screen (the narrow side of a pixel's footprint on the ground, so a
          // lawn seen low across keeps its blades): tiny blades shimmer, so the far lawn settles into
          // one layer and loses its upper shells.
          const ddx = dFdx(p1).toVar(), ddy = dFdy(p1).toVar();
          const minor = abs(ddx.x.mul(ddy.y).sub(ddx.y.mul(ddy.x))).div(max(max(length(ddx), length(ddy)), 1e-4));
          const lod = max(smoothstep(0.35, 0.9, minor), float(1).sub(vFade)).toVar();
          // aLawn.x: the lawn's outline where the layout cuts a circle from it (else 1); the carpet
          // otherwise covers exactly its own cells. aLawnX: x the share of garden lawn (clover), y how
          // close a hedge, bed or statue stands (the grass grows long at its foot).
          If(lawnA.x.lessThan(0.5), () => {
            Discard();
          });
          const lowest = shell.lessThan(LOWEST + 0.01);
          If(lowest.not().and(shell.greaterThan(float(1).sub(lod))), () => {
            Discard();
          });
          // Soft mower stripes two cells wide, north to south.
          const stripe = select(clipped, clamp(sin(wp.x.mul(1.5708)).mul(2.5), -1, 1), float(0)).toVar();
          const n2 = noise(wp.mul(0.13).add(vec2(0.41, 0.17))).toVar();
          const foot = lawnX.y;
          const tall = n2.mul(0.36).add(0.82).mul(foot.mul(select(clipped, float(0.1), float(0.45))).add(1));
          // Clipped lawns stand up straight (leaning a little with the mower's stripe); meadow grass flops.
          const lean0 = select(clipped, vec3(stripe.mul(0.06), 0.04, 0.32), vec3(0, 0.1, 0.9)).toVar();
          const gap = select(clipped, gapU.x, gapU.y).toVar();
          const ray = lawnPos.sub(cameraPosition);
          const run = ray.xz.div(max(abs(ray.y), length(ray.xz).mul(0.2))).mul(gap).mul(lawnA.y).mul(select(clipped, float(40), float(8.5))).toVar();
          const tint = float(0).toVar();
          const t = lawnBlade(p1, shell, tall, lean0, run, gap, select(clipped, float(2.6), float(4.2)), tint).toVar();
          // (The second field only where the first leaves a gap: the shell shows one blade either way.)
          If(clipped.not().and(t.lessThan(0)), () => {
            t.assign(lawnBlade(p1.add(vec2(37.5, 11.5)), shell, tall, lean0, run, gap, float(4.2), tint));
          });
          // Clover in the private gardens and the paddock: low trefoil leaves under the grass (no white
          // heads, which read as spots strewn on the lawn: the owner, October 3).
          const bloom = vec3(-1).toVar();
          If(lawnX.x.greaterThan(0.5).and(lod.lessThan(0.6)), () => {
            const q = wp.mul(2.4);
            const h = lawnHash(q.floor().add(17)).toVar();
            If(h.z.greaterThan(0.8).and(shell.lessThan(0.45)), () => {
              const o = q.fract().sub(h.yx.mul(0.5).add(0.25)).toVar();
              const a = atan(o.y, o.x);
              If(length(o).lessThan(abs(cos(a.mul(1.5))).mul(0.35).add(0.65).mul(0.17)), () => {
                bloom.assign(root.mul(2.1).mul(vec3(0.92, 1.05, 0.9)));
              });
            });
          });
          // The lowest shell closes up into one layer far away (tiny blades would shimmer) and along
          // the lawn's border, where it is the dark root of the carpet right up to the edge.
          If(t.lessThan(0).and(bloom.x.lessThan(0)).and(lowest.not()), () => {
            Discard();
          });
          // Colour: dark root to a light tip, drifting between a warmer and a cooler green, each blade
          // its own shade and hue.
          const n1 = noise(wp.mul(0.031)).toVar();
          const tip = tipC.mul(mix(vec3(1.07, 1.02, 0.78), vec3(0.88, 1.0, 1.04), smoothstep(0.3, 0.7, n1)))
            .mul(n2.mul(0.28).add(0.86).add(tint.sub(0.5).mul(0.26)))
            .mul(mix(vec3(1.06, 1.02, 0.86), vec3(0.9, 1.0, 1.06), tint.mul(7.13).fract()))
            .mul(float(1).sub(foot.mul(0.22))).toVar();
          // (Mown turf is close and even: its blades shade from a lighter root, so it reads as one
          // velvet surface, not tufts.)
          const col = mix(select(clipped, mix(root, tip, 0.45), root), tip, pow(clamp(t, 0, 1), 0.85)).toVar();
          // The far lawn (one layer): the carpet's average painted with the grain of its blades (two
          // scales of mipmapped noise), never one flat green.
          If(lowest.and(t.lessThan(0)), () => {
            const g1 = noise(wp.mul(0.9).add(vec2(0.3, 0.7))).toVar(), g2 = noise(wp.mul(0.27));
            col.assign(mix(root.mul(g1.mul(0.2).add(0.9)), mix(root, tip, g1.sub(0.5).mul(0.3).add(0.42).add(g2.sub(0.5).mul(0.2))), lod));
          });
          // Mower stripes on clipped lawns; broad lighter and darker drifts across meadows.
          return select(bloom.x.greaterThanEqual(0), bloom, col).mul(select(clipped, stripe.mul(0.2).add(1), smoothstep(0.2, 0.8, n1).mul(0.32).add(0.84)));
        },
      };
    },
  });

  // The carpet covers exactly the lawn's own cells (its mesh is built from them), so its edge is
  // straight and square against paving and beds. At every grid corner: the outline where the
  // layout cuts a disc from the lawn (its border crosses one half exactly on the circle, else 1),
  // the share of garden lawn, and whether a hedge, bed or statue stands on one of its cells (the
  // grass grows long at its foot).
  const weight = new Float32Array(VW * (h + 1)), garden = new Float32Array(VW * (h + 1)), foot = new Float32Array(VW * (h + 1));
  const blocked = (x: number, z: number) => x >= 0 && z >= 0 && x < w && z < h && layout.cells[z * w + x] === Cell.Blocked && !!kind(x, z);
  // On the island of levels (the castle's rock), where the turf meets rock or the island's edge it
  // thins out short of it along a wandering line (a few tens of centimetres here, more than a metre
  // there), never on the cells' square steps.
  const brink = layout.level ? brinkDistance(layout, theme) : null, wander = smoothNoise(91);
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    let wt = brink ? Math.max(0, Math.min(1, 0.5 + (brink[z * VW + x] - 0.3 - 1.1 * wander(x * 0.3, z * 0.3)) * 1.6)) : 1;
    for (const c of layout.lawnCut ?? []) wt = Math.min(wt, Math.max(0, Math.min(1, 0.5 + (Math.hypot(x - c.x, z - c.z) - c.r) * 0.5)));
    if (sf) {
      const v = z * VW + x;
      wt = Math.min(wt, Math.max(0, Math.min(1, 0.5 + sf.path[v] * 1.2)), Math.max(0, Math.min(1, 0.5 + (sf.wet[v] - 0.35) * 1.2)));
    }
    weight[z * VW + x] = wt;
    let gd = 0, ft = 0;
    for (const [ax, az] of [[x - 1, z - 1], [x, z - 1], [x - 1, z], [x, z]]) {
      if (kind(ax, az) === Lawn.Garden) gd += 0.25;
      if (blocked(ax, az)) ft = 1;
    }
    garden[z * VW + x] = gd;
    foot[z * VW + x] = ft;
  }

  const meshes: THREE.InstancedMesh[] = [];
  const ident = new THREE.Matrix4();
  for (let cz = 0; cz < h; cz += CHUNK) for (let cx = 0; cx < w; cx += CHUNK) {
    const x1 = Math.min(w, cx + CHUNK), z1 = Math.min(h, cz + CHUNK);
    const CW = x1 - cx + 1;
    const vid = new Map<number, number>();
    const pos: number[] = [], attr: number[] = [], extra: number[] = [], index: number[] = [];
    let clipped = false;
    const vert = (x: number, z: number) => {
      const key = (z - cz) * CW + (x - cx);
      let v = vid.get(key);
      if (v !== undefined) return v;
      let ht = 0, kinds = 0;
      for (const [ax, az] of [[x - 1, z - 1], [x, z - 1], [x - 1, z], [x, z]]) {
        const k = kind(ax, az);
        if (k) {
          ht += HEIGHT[k];
          kinds++;
        }
      }
      v = pos.length / 3;
      pos.push(x, heightAt(x, z), z);
      attr.push(weight[z * VW + x], kinds ? ht / kinds : 0);
      extra.push(garden[z * VW + x], foot[z * VW + x]);
      vid.set(key, v);
      return v;
    };
    for (let z = cz; z < z1; z++) for (let x = cx; x < x1; x++) {
      if (!kind(x, z)) continue;
      // No carpet on a cell that is really a slope between levels (it would stand up as a wall of grass).
      const hs = [heightAt(x, z), heightAt(x + 1, z), heightAt(x, z + 1), heightAt(x + 1, z + 1)];
      if (Math.max(...hs) - Math.min(...hs) > 0.9) continue;
      if (kind(x, z) === Lawn.Clipped) clipped = true;
      const a = vert(x, z), b = vert(x + 1, z), c = vert(x + 1, z + 1), d = vert(x, z + 1);
      // The terrain's own diagonals, so the carpet lies exactly on the ground.
      index.push(...((x + z) & 1 ? [a, d, b, b, d, c] : [a, d, c, a, c, b]));
    }
    if (!index.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setAttribute('aLawn', new THREE.Float32BufferAttribute(attr, 2));
    geo.setAttribute('aLawnX', new THREE.Float32BufferAttribute(extra, 2));
    const set = clipped ? CLIPPED : MEADOW;
    geo.setAttribute('aShell', set.attr);
    geo.setIndex(index);
    geo.computeBoundingSphere();
    geo.boundingSphere!.radius += 0.4;
    const mesh = new THREE.InstancedMesh(geo, mat, MAX_SHELLS);
    for (let i = 0; i < MAX_SHELLS; i++) mesh.setMatrixAt(i, ident);
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'lawn';
    mesh.onBeforeRender = () => (mesh.count = set.count);
    meshes.push(mesh);
  }
  return meshes;
}

/**
 * The distance (in metres, along the grid) from every grid corner to the nearest corner of a cell of
 * rock or of the void beyond the land's edge, out to a few metres (beyond that, far).
 */
function brinkDistance(layout: ZoneLayout, theme: ZoneTheme) {
  const { w, h } = layout, VW = w + 1, d = new Float32Array(VW * (h + 1)).fill(8);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const c = layout.cells[z * w + x];
    if (c === Cell.Void || isRelief(c, theme)) for (const v of [z * VW + x, z * VW + x + 1, (z + 1) * VW + x, (z + 1) * VW + x + 1]) d[v] = 0;
  }
  const relax = (k: number, j: number, c: number) => {
    if (d[j] + c < d[k]) d[k] = d[j] + c;
  };
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    const k = z * VW + x;
    if (x > 0) relax(k, k - 1, 1);
    if (z > 0) {
      relax(k, k - VW, 1);
      if (x > 0) relax(k, k - VW - 1, Math.SQRT2);
      if (x < w) relax(k, k - VW + 1, Math.SQRT2);
    }
  }
  for (let z = h; z >= 0; z--) for (let x = w; x >= 0; x--) {
    const k = z * VW + x;
    if (x < w) relax(k, k + 1, 1);
    if (z < h) {
      relax(k, k + VW, 1);
      if (x < w) relax(k, k + VW + 1, Math.SQRT2);
      if (x > 0) relax(k, k + VW - 1, Math.SQRT2);
    }
  }
  return d;
}

/** A hash of a cell to three values in 0..1. */
function lawnHash(p: V2): V3 {
  const q = vec3(p.x, p.y, p.x).mul(vec3(0.1031, 0.103, 0.0973)).fract().toVar();
  q.addAssign(dot(q, q.yzx.add(33.33)));
  return q.xxy.add(q.yzz).mul(q.zyx).fract();
}

/**
 * One field of jittered blades at grid scale p: is this shell (height `s`) inside a blade? Each blade
 * has its own height, thickness and lean, and tapers to a point at its tip. Returns the height along
 * the blade (0 root .. 1 tip) where covered, else -1; `tint` takes its shade. `seg`: how far the view
 * ray runs across the gap down to the next shell (grid units); the blade is tested along it, so from a
 * low camera the slices of a blade join up into one solid blade instead of a stack of thin slivers.
 * `thin`: how many times longer than wide.
 */
function lawnBlade(p: V2, s: F, tall: F, lean0: V3, seg: V2, gap: F, thin: F, tint: F): F {
  const r = lawnHash(p.floor()).toVar();
  const f = p.fract();
  const hb = r.z.mul(0.45).add(0.55).mul(tall).toVar();
  tint.assign(r.x);
  const out = float(-1).toVar();
  If(s.lessThanEqual(hb), () => {
    const t = s.div(max(hb, 1e-3)).toVar();
    // Flat, narrow blades, each turned its own way, curving over as they rise and narrowing to a
    // point near the tip.
    const c = r.xy.sub(0.5).mul(0.78).add(0.5).add(r.yz.sub(0.5).mul(lean0.z).add(lean0.xy).mul(t.mul(t)));
    const dir = normalize(r.zx.mul(7.31).fract().sub(0.5).add(1e-3)).toVar();
    const o = f.sub(c).toVar(), side = vec2(dir.y.negate(), dir.x);
    const rad = float(1).sub(t.mul(t).mul(t)).mul(r.y.mul(0.2).add(0.7)).toVar();
    // The first (highest) point along the ray inside the blade gives the height seen there.
    const hit = (ok: V2) => length(vec2(dot(ok, dir), dot(ok, side).mul(thin))).mul(2).lessThan(rad);
    const h0 = clamp(s.div(max(hb, 1e-3)), 0, 1), h1 = clamp(s.sub(gap.mul(0.5)).div(max(hb, 1e-3)), 0, 1);
    out.assign(select(hit(o), h0, select(hit(o.add(seg.mul(0.5))), h1, float(-1))));
  });
  return out;
}
