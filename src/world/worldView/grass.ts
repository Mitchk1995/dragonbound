import * as THREE from 'three';
import { sin, vec3 } from 'three/tsl';
import { instanceOrigin } from '../../render/patch';
import { mulberry32 } from '../../core/rng';
import { Cell, Ground, Lawn } from '../layout';
import { buildLawn } from '../lawn';
import { addPatch } from '../../render/surface';
import { smoothNoise } from '../terrain';
import { WIND } from './materials';
import type { Scatter, Scene } from './scene';

/** Sway instanced geometry with its height (y = 0 stays planted), out of phase per instance. */
function applyWind(mat: THREE.Material) {
  addPatch(mat, {
    key: 'wind',
    uniforms: WIND,
    nodes(u, b) {
      return {
        position(p) {
          const t = u.f('uWindT');
          const ip = instanceOrigin(b);
          const sway = sin(t.mul(1.7).add(ip.x.mul(0.45)).add(ip.z.mul(0.3))).add(sin(t.mul(2.9).add(ip.z.mul(0.8))).mul(0.5));
          return vec3(p.x.add(sway.mul(p.y).mul(0.06)), p.y, p.z.add(sway.mul(p.y).mul(0.035)));
        },
      };
    },
  });
}

/**
 * One grass clump: eleven thin tapered blades fanning out from a small root, each leaning away from
 * the centre. Vertex colour darkens the root into the ground and lightens the tip; normals point
 * up so the blades light like the ground they grow from (no dark backsides).
 */
let clumpGeo: THREE.BufferGeometry | null = null;
function grassClump() {
  if (clumpGeo) return clumpGeo;
  const rng = mulberry32(4242);
  const pos: number[] = [], col: number[] = [], nrm: number[] = [];
  const blades = 11;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rng() * 0.5;
    const r = 0.02 + rng() * 0.08;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const h = 0.3 + rng() * 0.28;
    const lean = 0.06 + rng() * 0.14;
    const tx = bx + Math.cos(a) * lean, tz = bz + Math.sin(a) * lean;
    const half = 0.026 + rng() * 0.018;
    const px = -Math.sin(a) * half, pz = Math.cos(a) * half;
    // Both windings, front-faced: a double-sided material would flip the normal on the back and
    // turn half the blades black.
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz, bx + px, 0, bz + pz, bx - px, 0, bz - pz, tx, h, tz);
    const tip = 1.2 + rng() * 0.18;
    for (let side = 0; side < 2; side++) {
      col.push(0.72, 0.74, 0.66, 0.72, 0.74, 0.66, tip, tip, tip * 0.92);
      nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
  }
  clumpGeo = new THREE.BufferGeometry();
  clumpGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  clumpGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  clumpGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return clumpGeo;
}

/** The lawn carpet and loose grass tufts (the rock ledges' own tufts with them). */
export function sowGrass(scene: Scene, sets: Scatter) {
  const { rng, layout, theme, seed, w, h, heightAt, group, m, q, s, p, e, inst } = scene;
  const { ledgeTufts, ledgeTuftCols } = sets;
  // A full grass carpet where the layout lays one (lawn.ts).
  for (const mesh of buildLawn(layout, theme, heightAt, WIND)) group.add(mesh);
  // Grass: clumps of thin blades fanning out (dark at the root, light at the tip), coloured from
  // the zone's own grass, thick in meadows, sparse on dirt, none on paths; they sway in the wind.
  // Over a lawn they only break up its edges: along meadow borders and at the foot of trees and
  // walls, never on clipped lawns or on the castle's swept ground.
  const lawn = layout.lawn;
  const lawnEdge = (x: number, z: number) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, zz = z + dz;
      if (xx < 0 || zz < 0 || xx >= w || zz >= h) return true;
      const j = zz * w + xx;
      if (lawn![j] === Lawn.None || layout.cells[j] !== Cell.Ground) return true;
    }
    return false;
  };
  const tufts: THREE.Matrix4[] = [], tuftCols: THREE.Color[] = [];
  const grassPal = theme.ground[Ground.Grass] ?? [0x5a7a3a, 0x6a8a44];
  const tuftNoise = smoothNoise(seed + 91);
  // (Loose tufts only where the land has no lawn carpet: where it has one, its blades are the grass.)
  for (let i = 0; i < (lawn ? 0 : w * h * 0.7); i++) {
    const x = rng() * w, z = rng() * h;
    const gi = Math.floor(z) * w + Math.floor(x);
    const g = layout.ground[gi];
    if (layout.cells[gi] !== Cell.Ground || layout.fluid[gi] || (g !== Ground.Dirt && g !== Ground.Grass)) continue;
    if (lawn && (lawn[gi] !== Lawn.Meadow || !lawnEdge(Math.floor(x), Math.floor(z)))) continue;
    const meadow = tuftNoise(x * 0.08, z * 0.08);
    if (rng() > (g === Ground.Grass ? 0.4 + meadow * 0.6 : 0.15)) continue;
    p.set(x, heightAt(x, z) - 0.02, z);
    q.setFromEuler(e.set((rng() - 0.5) * 0.2, rng() * 6.3, (rng() - 0.5) * 0.2));
    const sc = 0.75 + rng() * 0.6 + meadow * 0.3;
    tufts.push(m.compose(p, q, s.set(sc, sc * (0.85 + rng() * 0.4), sc)).clone());
    tuftCols.push(new THREE.Color(grassPal[0]).lerp(new THREE.Color(grassPal[1]), rng()).multiplyScalar(g === Ground.Dirt ? 1.05 : 1.22).offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.04));
  }
  inst(grassClump(), [...tufts, ...ledgeTufts], [...tuftCols, ...ledgeTuftCols], 0, false, undefined, false, undefined, (mat) => {
    mat.vertexColors = true;
    mat.flatShading = false;
    applyWind(mat);
  });
}
