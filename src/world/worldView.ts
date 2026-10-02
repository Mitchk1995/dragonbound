import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng';
import type { ZoneTheme } from '../data/zones';
import { Cell, Fluid, Ground, Lawn, type ZoneLayout } from './layout';
import { buildLawn } from './lawn';
import { buildProp, OCCLUDING_PROPS, TRIM_D, type Prop } from './props';
import { setWaterSky } from './water';
import { buildBuilding, buildFitProp, type BuildingProp } from './buildingModel';
import { addPatch, applyGrade, applyHeightShade, applySurface, type Grade } from '../render/surface';
import { applyPaint, isPaintKind, type PaintKind } from '../render/paint';
import { buildTerrain, isRelief, smoothNoise, WATER_Y } from './terrain';
import { chamferBox, cragColumn, hash01, rockBlock, slabBlock, taper } from '../render/blocks';
import { useStrataRock } from '../render/rock';

import type { SurfaceKind } from '../render/textures';
import { treeSet, type TreeKind, type TreeSet, type TreeStyle } from './trees';

// ─── See-through occlusion ──────────────────────────────────────────────────

/** Shared uniforms: the game updates these every frame with the camera and player positions. */
export const OCCLUDE = {
  uOccPlayer: { value: new THREE.Vector3() },
  uOccCam: { value: new THREE.Vector3() },
  uOccRadius: { value: 0.16 },
  /** 1 during gameplay; 0 on the title/creation screens where nothing should be cut away. */
  uOccOn: { value: 0 },
  /** Direction toward the sun (game.ts keeps the sun at this offset from the hero). */
  uOccSun: { value: new THREE.Vector3(14, 28, 10).normalize() },
};

/**
 * Patch a material so fragments between the camera and the player, inside a small
 * screen-space circle around the player and above the hero's knees, are cut away (no dither
 * stipple). The rim of the opening fades out over its last fifth through alpha-to-coverage, so with
 * multisampling the edge is a soft feathered ring, not a hard disc. Trees and walls never hide the
 * hero; a low stub of what was cut stays in place.
 */
export function makeOccludable(mat: THREE.Material, shadow = false) {
  if (!shadow && !mat.transparent) mat.alphaToCoverage = true;
  addPatch(mat, { key: shadow ? 'occlude:shadow' : 'occlude', slot: 'occlude', apply: (shader) => {
    Object.assign(shader.uniforms, OCCLUDE);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOccWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 occWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          occWp = instanceMatrix * occWp;
        #endif
        vOccWorld = (modelMatrix * occWp).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vOccWorld;
        uniform vec3 uOccPlayer;
        uniform vec3 uOccCam;
        uniform float uOccRadius;
        uniform float uOccOn;
        uniform vec3 uOccSun;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float occFade = 1.0;
        {
          vec3 target = uOccPlayer + vec3(0.0, 1.0, 0.0);
          vec3 toP = target - uOccCam;
          float lenP = length(toP);
          vec3 dirP = toP / lenP;
          vec3 toF = vOccWorld - uOccCam;
          float along = dot(toF, dirP);
          // A clean cut-away: whatever stands in front of the hero inside the circle is removed
          // down to a low stub with a hard edge.
          ${shadow ? `// Shadow pass: follow the sun ray down to the ground; a part whose shadow would land
          // in the opening (in front of the hero) casts none, so the ground seen through the cut
          // is never smeared with the shadow of what was cut away.
          float lift = vOccWorld.y - uOccPlayer.y;
          toF = vOccWorld - uOccSun * (lift / max(uOccSun.y, 0.05)) - uOccCam;
          along = dot(toF, dirP);
          float feet = dot(uOccPlayer - uOccCam, dirP);
          if (uOccOn > 0.5 && lift > 0.4 && along > 0.5 && along < feet + 0.3) {` : `if (uOccOn > 0.5 && along > 0.5 && along < lenP - 0.8 && vOccWorld.y > uOccPlayer.y + 0.4) {`}
            float perp = length(toF - dirP * along);
            if (perp / along * 1.25 < uOccRadius * 0.85) discard;
            occFade = smoothstep(0.8, 1.0, perp / along / (uOccRadius * 0.85));
          }
        }`,
      )
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= occFade;\n#include <opaque_fragment>');
  } });
}

/** Shadow-pass depth material with the same cut-away (see makeOccludable). */
let occDepth: THREE.MeshDepthMaterial | null = null;
function occludedDepth() {
  if (!occDepth) {
    occDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    makeOccludable(occDepth, true);
  }
  return occDepth;
}

/** Make every material under an object cut away between the camera and the hero (shadows too). */
function occludeAll(root: THREE.Object3D) {
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.castShadow && !(o.material instanceof THREE.ShaderMaterial)) o.customDepthMaterial = occludedDepth();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (seen.has(m) || m instanceof THREE.ShaderMaterial || m.userData.noOcclude) continue;
      seen.add(m);
      makeOccludable(m);
    }
  });
}

// ─── Sky ────────────────────────────────────────────────────────────────────

/**
 * The Veil's sky at the golden hour (one time of day with the warm, low sun that lights the island):
 * soft blue-lilac overhead warming to peach at the horizon, a few long cloud bands high up, and below
 * the horizon a sea of soft cloud lit from above, deepening into lilac haze, so a view out from the
 * island's edge looks over cloud, never into darkness. No stars: it is day.
 */
function voidSky(group: THREE.Group) {
  const skyGeo = new THREE.SphereGeometry(180, 48, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x6c7ab8) }, mid: { value: new THREE.Color(0xf2b48e) },
      low: { value: new THREE.Color(0xdcaaa6) }, sea: { value: new THREE.Color(0x86729e) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sea;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main() {
        float h = vP.y;
        vec3 c;
        if (h > 0.0) {
          c = mix(mid, top, pow(clamp(h * 1.6, 0.0, 1.0), 0.55));
          vec2 q = vP.xz / (h + 0.3);
          float cl = smoothstep(0.58, 0.86, vn(q * vec2(0.7, 2.2)) * 0.65 + vn(q * 3.1) * 0.35);
          c = mix(c, vec3(1.0, 0.88, 0.8), cl * 0.32 * smoothstep(0.03, 0.3, h));
        } else {
          vec2 q = vP.xz / max(-h, 0.06) * 0.7;
          float n = vn(q) * 0.55 + vn(q * 2.7 + 3.1) * 0.3 + vn(q * 6.3 + 7.7) * 0.15;
          float d = clamp(-h * 2.0, 0.0, 1.0);
          vec3 deep = mix(low, sea, d);
          c = mix(deep, mix(mid, vec3(1.0, 0.93, 0.88), 0.35), smoothstep(0.42, 0.78, n) * (1.0 - d * 0.7));
        }
        c = mix(c, mid * 1.06, exp(-pow(h * 8.0, 2.0)) * 0.55);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  sky.name = 'sky';
  group.add(sky);
}

// ─── Grass ──────────────────────────────────────────────────────────────────

/** Shared wind clock (advanced by WorldView.tick). */
const WIND = { uWindT: { value: 0 } };

/** Sway instanced geometry with its height (y = 0 stays planted), out of phase per instance. */
function applyWind(mat: THREE.Material) {
  addPatch(mat, { key: 'wind', apply: (shader) => {
    Object.assign(shader.uniforms, WIND);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindT;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float sway = sin(uWindT * 1.7 + ip.x * 0.45 + ip.z * 0.3) + 0.5 * sin(uWindT * 2.9 + ip.z * 0.8);
          transformed.xz += vec2(0.06, 0.035) * sway * transformed.y;
        }`,
      );
  } });
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

/** World instancing tile size in cells (see inst()). */
const CHUNK = 24;

// ─── Scenery materials ──────────────────────────────────────────────────────

/**
 * The material every instanced scenery set uses: flat shaded, painted albedo (or an old surface),
 * an optional shade toward the foot, cut away around the hero when `occlude`.
 */
function sceneryMaterial(instanceColors: boolean, color: number, occlude: boolean, surface?: SurfaceKind | PaintKind, grade?: Grade, setup?: (m: THREE.MeshStandardMaterial) => void) {
  const mat = new THREE.MeshStandardMaterial({ color: instanceColors ? 0xffffff : color, flatShading: true, roughness: 0.9 });
  // Painted albedo (hand-painted look) wherever a paint exists; the old surfaces otherwise.
  if (surface && isPaintKind(surface)) applyPaint(mat, surface, 'world');
  else if (surface) applySurface(mat, surface, 'world');
  setup?.(mat);
  if (grade) applyGrade(mat, grade, 'local');
  if (occlude) makeOccludable(mat);
  return mat;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], cols: THREE.Color[] | null, shadow: boolean) {
  const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((mm, i) => {
    mesh.setMatrixAt(i, mm);
    if (cols) mesh.setColorAt(i, cols[i]);
  });
  mesh.computeBoundingSphere();
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** Block canopies carry a painted vertex shade (trees.ts) under the instance colour. */
const withVertexShade = (m: THREE.MeshStandardMaterial) => {
  m.vertexColors = true;
};

type SceneryArgs = [color: number, occlude: boolean, surface?: SurfaceKind | PaintKind, shadow?: boolean, grade?: Grade, setup?: (m: THREE.MeshStandardMaterial) => void];

/** Material arguments for a tree's trunk and canopy (shared by the world and the dev lineup). */
function treeArgs(ts: TreeSet, k: TreeKind): [SceneryArgs, SceneryArgs] {
  return [
    [k === 'ash' ? 0x2a2420 : 0x4a3020, true, 'bark'],
    [0, true, ts.paint[k], true, ts.grade, ts.shaded && k !== 'ash' ? withVertexShade : undefined],
  ];
}

/**
 * Dev only: trees of one style as plain instanced meshes with the world's own materials (the
 * inspect harness lines the styles up side by side).
 */
export function treeMeshes(style: TreeStyle, kind: TreeKind, mats: THREE.Matrix4[], cols: THREE.Color[], variant = 0) {
  const ts = treeSet(style);
  const [trunk, crown] = treeArgs(ts, kind);
  const mk = (geo: THREE.BufferGeometry, c: THREE.Color[] | null, [color, occlude, surface, shadow = true, grade, setup]: SceneryArgs) =>
    instanced(geo, sceneryMaterial(!!c, color, occlude, surface, grade, setup), mats, c, shadow);
  const vs = ts.canopy[kind];
  return [mk(ts.trunk[kind], null, trunk), mk(vs[variant % vs.length], cols, crown)];
}

// ─── Builder ────────────────────────────────────────────────────────────────

export interface WorldView {
  group: THREE.Group;
  /** Objects that follow the camera (sky). */
  followers: THREE.Object3D[];
  props: Prop[];
  /** Enterable buildings (roofs lift while the hero is inside). */
  buildings: BuildingProp[];
  /** Terrain height at a world point (scenery and props stand on it). */
  heightAt(x: number, z: number): number;
  /** Height of the walkable ground level at a world point (units, stations and buildings stand on it). */
  floorAt(x: number, z: number): number;
  /** Advance animated surfaces (water, lava). */
  tick(t: number): void;
}

export function buildWorldView(layout: ZoneLayout, theme: ZoneTheme, seed = 99): WorldView {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  const followers: THREE.Object3D[] = [];
  const { w, h } = layout;
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= w || z >= h ? Cell.Void : layout.cells[z * w + x]);

  // Terrain: continuous height grid (relief rises out of it), fluids, and a height query for scenery.
  const terrain = buildTerrain(layout, theme, seed);
  // Pools and basins on props reflect this zone's sky.
  setWaterSky(theme.hemi[0], theme.bg);
  for (const tm of terrain.meshes) group.add(tm);
  if (terrain.relief) makeOccludable(terrain.relief.material as THREE.Material);
  const heightAt = terrain.heightAt, floorAt = terrain.floorAt;

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  const inst = (geo: THREE.BufferGeometry, mats: THREE.Matrix4[], cols: THREE.Color[] | null, color: number, occlude: boolean, surface?: SurfaceKind | PaintKind, shadow = true, grade?: Grade, setup?: (m: THREE.MeshStandardMaterial) => void) => {
    if (!mats.length) return;
    const mat = sceneryMaterial(!!cols, color, occlude, surface, grade, setup);
    // Bucket instances into CHUNK×CHUNK-cell tiles so off-screen tiles are frustum-culled
    // (one map-wide InstancedMesh is always drawn in full, shadows included).
    const buckets = new Map<string, number[]>();
    const tp = new THREE.Vector3();
    mats.forEach((mm, i) => {
      tp.setFromMatrixPosition(mm);
      const key = `${Math.floor(tp.x / CHUNK)},${Math.floor(tp.z / CHUNK)}`;
      const b = buckets.get(key) ?? [];
      b.push(i);
      buckets.set(key, b);
    });
    const made: THREE.InstancedMesh[] = [];
    for (const ids of buckets.values()) made.push(instanced(geo, mat, ids.map((id) => mats[id]), cols && ids.map((id) => cols[id]), shadow));
    group.add(...made);
    return made;
  };

  // ─── Scenery: trees, boulders, walls, undergrowth ─────────────────────────
  // Foliage is flat-shaded facets, painted albedo and per-instance colour; undersides sit in shade.
  // The tree models come from the active style (trees.ts).
  const ts = treeSet();
  const leafPal: Record<TreeKind, number[]> = {
    pine: [0x3f6b34, 0x4b7a3a, 0x355c2e, 0x7a6a2a, 0x8a4a2a],
    grove: [0x5a9a44, 0x6aa84a, 0x4a8a3c, 0xc8a040, 0xb86a8a],
    ash: [0x2a2420, 0x3a3028, 0x1e1a18],
  };
  // Species mix: patches of each kind (noise), weighted by the theme.
  const mix: Partial<Record<TreeKind, number>> = theme.forest ?? { [theme.trees]: 1 };
  const kinds = (Object.keys(mix) as TreeKind[]).filter((k) => (mix[k] ?? 0) > 0);
  const totalW = kinds.reduce((a, k) => a + (mix[k] ?? 0), 0);
  const speciesNoise = smoothNoise(seed + 71);
  const speciesAt = (x: number, z: number): TreeKind => {
    let v = speciesNoise(x * 0.06, z * 0.06) * 0.8 + rng() * 0.2;
    for (const k of kinds) {
      v -= (mix[k] ?? 0) / totalW;
      if (v <= 0) return k;
    }
    return kinds[kinds.length - 1];
  };
  const trees: Record<TreeKind, { m: THREE.Matrix4[]; c: THREE.Color[] }> = { pine: { m: [], c: [] }, grove: { m: [], c: [] }, ash: { m: [], c: [] } };
  const addTree = (x: number, z: number, scale = 1, y?: number) => {
    const kind = speciesAt(x, z);
    const sc = (0.8 + rng() * 0.6) * scale;
    if (y === undefined) p.set(x + (rng() - 0.5) * 0.3, heightAt(x, z) - 0.05, z + (rng() - 0.5) * 0.3);
    else p.set(x, y - 0.05, z);
    q.setFromEuler(e.set((rng() - 0.5) * 0.1, rng() * Math.PI * 2, (rng() - 0.5) * 0.1));
    s.set(sc, sc * (0.9 + rng() * 0.3), sc);
    trees[kind].m.push(m.compose(p, q, s).clone());
    const pal = leafPal[kind];
    const tc = new THREE.Color(pal[rng() < 0.15 ? Math.min(pal.length - 1, 3 + Math.floor(rng() * 2)) : Math.floor(rng() * Math.min(3, pal.length))]);
    tc.offsetHSL(0, 0, (rng() - 0.5) * 0.05);
    trees[kind].c.push(tc);
  };
  const rocks: THREE.Matrix4[] = [], rockCols: THREE.Color[] = [];
  const rims: THREE.Matrix4[] = [], rimCols: THREE.Color[] = [];
  const walls: THREE.Matrix4[] = [], wallCols: THREE.Color[] = [];
  const under: THREE.Matrix4[] = [], underCols: THREE.Color[] = [];
  // The island's underside in its own rock (the cliff's darker tone), never a dead brown-black.
  const underA = new THREE.Color(theme.cliff?.[1] ?? 0x5e544a).multiplyScalar(0.85), underB = new THREE.Color(theme.cliff?.[0] ?? 0x7a6e62).multiplyScalar(0.8);
  const bushes: THREE.Matrix4[] = [], bushCols: THREE.Color[] = [];
  const flowers: THREE.Matrix4[] = [], flowerCols: THREE.Color[] = [];
  const reeds: THREE.Matrix4[] = [];
  const wallColor = { castle: 0x8a8478, cave: 0x5e5044, ruin: 0x6a7070 }[theme.wall];
  // Loose rocks take the zone's own stone (basalt in the lair, blue-grey in the ruin), not one grey.
  const rockBase = theme.cliff ? new THREE.Color(theme.cliff[0]).lerp(new THREE.Color(0x8a8478), 0.35) : new THREE.Color(0x8a8478);
  const walkable = (x: number, z: number) => {
    const n = at(x, z);
    return n === Cell.Ground || n === Cell.Blocked;
  };
  const nearWalkable = (x: number, z: number) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (walkable(x + dx, z + dz)) return true;
    return false;
  };
  const nearFluid = (x: number, z: number) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, zz = z + dz;
      if (xx >= 0 && zz >= 0 && xx < w && zz < h && layout.fluid[zz * w + xx]) return true;
    }
    return false;
  };
  // Cave walls (mine): the foot of every wall is built from layered rock slabs, stacked in strata
  // that step back as they rise, their heights varying along the wall, with the odd dark crevice.
  // Walls on the camera side of the floor stay low. The terrain behind climbs on into darkness.
  const strata: THREE.Matrix4[] = [], strataCols: THREE.Color[] = [];
  const crevices: THREE.Matrix4[] = [];
  const strataPal = [0x7a6650, 0x5c4a3a, 0x6c5a48, 0x4c3e32].map((c) => new THREE.Color(c));
  const strataNoise = smoothNoise(seed + 17);
  const addStrata = (x: number, z: number) => {
    let nx = 0, nz = 0, open = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && at(x + dx, z + dz) === Cell.Ground) {
      nx += dx;
      nz += dz;
      open++;
    }
    const nl = Math.hypot(nx, nz);
    // Rock pillars (floor on several sides) rise straight; only true walls step back as they climb.
    const step = open >= 5 || nl < 1.2 ? 0.02 : 0.2;
    if (nl < 0.01) [nx, nz] = [0, 1];
    else [nx, nz] = [nx / nl, nz / nl];
    const face = Math.atan2(nx, nz);
    const camSide = nz < -0.5;
    const hn = strataNoise(x * 0.16, z * 0.16);
    const H = camSide ? 0.7 + hn * 0.7 : 1.3 + hn * 3.2 + rng() * 0.5;
    if (!camSide && rng() < 0.06) {
      // A crevice: a dark cleft recessed between the rock masses (lower than its neighbours, so it
      // reads as a gap in the rock, not a post).
      p.set(x + 0.5 - nx * 0.55, -0.1, z + 0.5 - nz * 0.55);
      q.setFromEuler(e.set(0, face, 0));
      crevices.push(m.compose(p, q, s.set(0.8, 0.9 + rng() * 0.6, 0.9)).clone());
      return;
    }
    let y = -0.2, layer = 0;
    while (y < H) {
      const th = 0.42 + rng() * 0.4, inset = layer * step + rng() * 0.1;
      p.set(x + 0.5 - nx * inset + (rng() - 0.5) * 0.14, y, z + 0.5 - nz * inset + (rng() - 0.5) * 0.14);
      q.setFromEuler(e.set((rng() - 0.5) * 0.04, face + (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.04));
      strata.push(m.compose(p, q, s.set(1.2 + rng() * 0.45 - layer * 0.04, th, 1.25)).clone());
      // Bands follow height (with a slow wander), so neighbouring stacks line up into strata.
      const band = Math.floor((y + 0.2 + strataNoise(x * 0.05 + 3, z * 0.05) * 0.9) / 0.6);
      strataCols.push(strataPal[((band % 4) + 4) % 4].clone().offsetHSL(0, 0, (rng() - 0.5) * 0.04));
      y += th * 0.9;
      layer++;
    }
  };
  // Loose rock on cave and caldera floors: rubble heaped at the foot of the walls, pebbles between.
  const debris: THREE.Matrix4[] = [], debrisCols: THREE.Color[] = [];
  const debrisBase = new THREE.Color(theme.cliff?.[0] ?? 0x6e5c4a);
  const debrisFloor = theme.wall === 'cave' && (!!theme.wallRise || !!theme.lava);
  const nearRelief = (x: number, z: number) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (isRelief(at(x + dx, z + dz), theme)) return true;
    return false;
  };
  const addDebris = (x: number, z: number) => {
    const wallFoot = nearRelief(x, z);
    // Pebbles between the walls only underground; outdoors (the caldera) rubble stays at the wall foot.
    const n = wallFoot ? (rng() < (theme.wallRise ? 0.18 : 0.3) ? 1 + Math.floor(rng() * 2) : 0) : theme.wallRise && rng() < 0.025 ? 2 + Math.floor(rng() * 2) : 0;
    const cx = x + 0.2 + rng() * 0.6, cz = z + 0.2 + rng() * 0.6;
    for (let k = 0; k < n; k++) {
      const sc = wallFoot ? 0.16 + rng() * 0.36 : 0.07 + rng() * 0.12;
      const spread = wallFoot ? 0.5 : 0.35;
      p.set(cx + (rng() - 0.5) * spread * 2, heightAt(cx, cz) - sc * 0.15, cz + (rng() - 0.5) * spread * 2);
      q.setFromEuler(e.set((rng() - 0.5) * 0.4, rng() * 6.3, (rng() - 0.5) * 0.4));
      debris.push(m.compose(p, q, s.set(sc * (1 + rng() * 0.5), sc * (0.6 + rng() * 0.4), sc)).clone());
      debrisCols.push(debrisBase.clone().offsetHSL(0, -0.02, (rng() - 0.5) * 0.12));
    }
  };
  const rockCells: number[] = [];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const cell = at(x, z);
      const i = z * w + x;
      if (cell === Cell.Tree) addTree(x + 0.5, z + 0.5);
      else if (cell === Cell.Wall && theme.wallRise && nearWalkable(x, z)) addStrata(x, z);
      else if (cell === Cell.Rock) {
        const sc = 0.6 + rng() * 0.7;
        p.set(x + 0.5, heightAt(x + 0.5, z + 0.5) - 0.12, z + 0.5);
        q.setFromEuler(e.set((rng() - 0.5) * 0.3, rng() * 6.3, (rng() - 0.5) * 0.3));
        s.set(sc, sc * (0.6 + rng() * 0.5), sc * (0.8 + rng() * 0.4));
        rocks.push(m.compose(p, q, s).clone());
        rockCols.push(rockBase.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.1));
      } else if (isRelief(cell, theme)) {
        const edge = nearWalkable(x, z);
        if (edge && cell === Cell.Wall && theme.wallRise) {
          // Cave walls: the stacked strata at their foot do this job (no tilted boulders).
        } else if (!theme.wallRise) {
          // Outdoor rock: boulders, crags, scree and plants are set along it below (rockFoot).
          rockCells.push(x, z);
        } else if (edge && rng() < (cell === Cell.Wall ? 0.6 : 0.3)) {
          // Cave country: fallen ledges at the foot of cliffs, one or two flat-topped slabs stepping back in the
          // cliff's own rock (the same stacked-ledge language as the terraces above, never a
          // tilted boulder with big sloped facets).
          const wc = new THREE.Color(theme.cliff?.[0] ?? 0x6a5e52);
          const big = 1.2 + rng() * 1.0, face = Math.floor(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.4;
          let y = -0.3;
          for (let k = 0, n = rng() < 0.5 ? 2 : 1; k < n; k++) {
            const th = 0.55 + rng() * 0.4, sc = big * (1 - k * 0.3);
            p.set(x + 0.5 + (rng() - 0.5) * 0.4, y, z + 0.5 + (rng() - 0.5) * 0.4);
            q.setFromEuler(e.set(0, face + (rng() - 0.5) * 0.3, 0));
            strata.push(m.compose(p, q, s.set(sc, th, sc * (0.8 + rng() * 0.3))).clone());
            strataCols.push(wc.clone().offsetHSL(0, 0, (k ? 0.03 : -0.02) + (rng() - 0.5) * 0.06));
            y += th * 0.9;
          }
        }
      } else if (cell === Cell.Wall) {
        if (!nearWalkable(x, z)) continue;
        const hgt = theme.wall === 'castle' ? 2.4 : 1.6 + rng() * 1.8;
        p.set(x + 0.5, hgt / 2, z + 0.5);
        q.setFromEuler(e.set(0, Math.floor(rng() * 4) * (Math.PI / 2), 0));
        s.set(1, hgt, 1);
        walls.push(m.compose(p, q, s).clone());
        wallCols.push(new THREE.Color(wallColor).offsetHSL(0, 0, (rng() - 0.5) * 0.08));
      } else if (layout.fluid[i] === Fluid.Lava && cell !== Cell.Ground) {
        // Basalt rim: pools and rivers of lava sit in blocky crater edges, not on flat ground.
        let shore = false, bridge = false;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, zz = z + dz;
          if (xx < 0 || zz < 0 || xx >= w || zz >= h) continue;
          const j = zz * w + xx;
          if (layout.cells[j] === Cell.Ground && layout.fluid[j]) bridge = true;
          else if (!layout.fluid[j] && layout.cells[j] !== Cell.Void && (dx === 0 || dz === 0)) shore = true;
        }
        if (shore && !bridge && rng() < 0.8) {
          const sc = 0.7 + rng() * 0.55;
          p.set(x + 0.5 + (rng() - 0.5) * 0.5, WATER_Y - 0.2, z + 0.5 + (rng() - 0.5) * 0.5);
          q.setFromEuler(e.set((rng() - 0.5) * 0.25, rng() * 6.3, (rng() - 0.5) * 0.25));
          s.set(sc, 0.5 + rng() * 0.6, sc * (0.8 + rng() * 0.4));
          rims.push(m.compose(p, q, s).clone());
          rimCols.push(new THREE.Color(0x2c2624).offsetHSL(0, 0, (rng() - 0.5) * 0.05));
        }
      } else if (cell === Cell.Void && theme.ambient === 'void') {
        // Rocky underside beneath the island rim.
        let rim = false;
        for (let dz = -1; dz <= 1 && !rim; dz++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, z + dz) !== Cell.Void) rim = true;
        if (rim) {
          // Hanging under the island's side (terrain.ts drops a sheer skirt from the edge itself):
          // from well below the lowest land beside it down into the void, so no column ever stands
          // up past the edge as a plate or a spike.
          let top = Infinity;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, z + dz) !== Cell.Void) top = Math.min(top, floorAt(x + dx + 0.5, z + dz + 0.5));
          top -= 3.2;
          const bot = Math.min(top, 0) - 3 - rng() * 6;
          p.set(x + 0.5, (top + bot) / 2, z + 0.5);
          q.setFromEuler(e.set(0, rng() * 3, 0));
          s.set(1.6 + rng(), top - bot, 1.6 + rng());
          under.push(m.compose(p, q, s).clone());
          underCols.push(underA.clone().lerp(underB, rng()).offsetHSL(0, 0, (rng() - 0.5) * 0.06));
        }
      } else if (cell === Cell.Ground && !layout.fluid[i]) {
        const g = layout.ground[i];
        const green = g === Ground.Grass || g === Ground.Dirt;
        if (debrisFloor) addDebris(x, z);
        // Reeds along shores (water only, never lava), bushes where the forest thins out, flowers
        // in open meadows.
        if (nearFluid(x, z) && !theme.lava && !theme.wallRise && rng() < 0.35) {
          // A clump of reeds rooted on the bank (never standing out in the open water).
          const cx = x + 0.2 + rng() * 0.6, cz = z + 0.2 + rng() * 0.6;
          for (let k = 0; k < 6; k++) {
            const rx = cx + (rng() - 0.5) * 0.45, rz = cz + (rng() - 0.5) * 0.45, ry = heightAt(rx, rz);
            if (ry < WATER_Y + 0.04) continue;
            p.set(rx, ry, rz);
            q.setFromEuler(e.set((rng() - 0.5) * 0.4, rng() * 3, (rng() - 0.5) * 0.4));
            const sc = 0.7 + rng() * 0.6;
            reeds.push(m.compose(p, q, s.set(sc, sc * 1.3, sc)).clone());
          }
        } else if (green && rng() < 0.05) {
          let treesNear = 0;
          for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (at(x + dx, z + dz) === Cell.Tree) treesNear++;
          if (treesNear > 1) {
            const sc = 0.5 + rng() * 0.5;
            p.set(x + 0.5 + (rng() - 0.5) * 0.6, heightAt(x + 0.5, z + 0.5), z + 0.5 + (rng() - 0.5) * 0.6);
            q.setFromEuler(e.set(0, rng() * 3, 0));
            bushes.push(m.compose(p, q, s.set(sc, sc * 0.75, sc)).clone());
            bushCols.push(new THREE.Color(leafPal[theme.trees][Math.floor(rng() * 3)]).offsetHSL(0, 0.04, -0.03));
          }
        } else if (g === Ground.Grass && theme.flowers && layout.lawn?.[i] !== Lawn.Clipped && layout.lawn?.[i] !== Lawn.Garden && rng() < 0.06) {
          const fc = new THREE.Color(theme.flowers[Math.floor(rng() * theme.flowers.length)]);
          for (let k = 0; k < 4; k++) {
            p.set(x + rng(), heightAt(x + 0.5, z + 0.5), z + rng());
            q.setFromEuler(e.set(0, rng() * 3, 0));
            const sc = 0.7 + rng() * 0.5;
            flowers.push(m.compose(p, q, s.set(sc, sc, sc)).clone());
            flowerCols.push(fc);
          }
        }
      }
    }
  }
  // ─── Natural rock outdoors ───────────────────────────────────────────────────
  // Along every outdoor cliff: crags standing out of the taller faces (buttresses and pillars of
  // different sizes, in clusters, leaning a little), boulders fallen at the foot and scree spilling
  // from it over the ground below, and plants rooted wherever the rock lies flat: grass and shrubs
  // on the ledges and along the top lip, the odd small tree on a broad ledge. Nothing is set on a
  // road or paving, or near a prop (the parapets and the falls keep their own faces).
  const crags: THREE.Matrix4[] = [], cragCols: THREE.Color[] = [];
  const ledgeTufts: THREE.Matrix4[] = [], ledgeTuftCols: THREE.Color[] = [];
  if (rockCells.length) {
    const propNear = new Uint8Array(w * h), cragAt = new Uint8Array(w * h);
    // Room kept round props by kind (parapets and lamps stand above the rock, not in front of it).
    const room: Record<string, number> = { spring_fall: 3, edge_fall: 3, parapet: -1, lamp_post: -1 };
    for (const pr of layout.props) {
      const r = room[pr.kind] ?? 1;
      if (r < 0) continue;
      const px = Math.floor(pr.x), pz = Math.floor(pr.z);
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const xx = px + dx, zz = pz + dz;
        if (xx >= 0 && zz >= 0 && xx < w && zz < h) propNear[zz * w + xx] = 1;
      }
    }
    const cliffA = new THREE.Color(theme.cliff?.[0] ?? 0x7a6e62), cliffB = new THREE.Color(theme.cliff?.[1] ?? 0x5e544a);
    const grassy = theme.mesaTop !== undefined;
    const grassPal0 = theme.ground[Ground.Grass] ?? [0x5a7a3a, 0x6a8a44];
    /** Bare ground where loose rock may lie (not road, paving, water or a kept lawn). */
    const looseOk = (x: number, z: number) => {
      if (x < 0 || z < 0 || x >= w || z >= h) return false;
      const j = z * w + x, g = layout.ground[j];
      if (layout.cells[j] !== Cell.Ground || layout.fluid[j] || propNear[j]) return false;
      if (g === Ground.Stone || g === Ground.Path || g === Ground.Arena) return false;
      return !layout.lawn || layout.lawn[j] === Lawn.None || layout.lawn[j] === Lawn.Meadow;
    };
    const treeP = (i: number) => (layout.canopy ? layout.canopy[i] / 100 : theme.reliefTrees ?? 0);
    for (let n = 0; n < rockCells.length; n += 2) {
      const x = rockCells[n], z = rockCells[n + 1], i = z * w + x;
      const cx = x + 0.5, cz = z + 0.5, top = heightAt(cx, cz);
      // Which way the face looks: toward the ground below it (the lower the ground, the more it counts).
      let ox = 0, oz = 0, foot = Infinity, fx = -1, fz = -1;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        if (!walkable(x + dx, z + dz) || layout.fluid[(z + dz) * w + x + dx]) continue;
        const fl = floorAt(x + dx + 0.5, z + dz + 0.5), drop = top - fl, d2 = dx * dx + dz * dz;
        if (drop <= 0.5) continue;
        ox += (dx / d2) * drop;
        oz += (dz / d2) * drop;
        if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1 && fl < foot) [foot, fx, fz] = [fl, x + dx, z + dz];
      }
      const ol = Math.hypot(ox, oz);
      if (fx >= 0 && ol > 0.01 && !propNear[i]) {
        ox /= ol;
        oz /= ol;
        const tx = -oz, tz = ox, faceH = top - foot;
        // Crags out of the taller faces, in clusters, none crowding the last.
        let clear = true;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (cragAt[(z + dz) * w + x + dx]) clear = false;
        if (faceH > 2.4 && clear && rng() < 0.5) {
          cragAt[i] = 1;
          const tall = rng() < 0.3;
          for (let k = 0, nk = rng() < 0.45 ? 2 : 1; k < nk; k++) {
            const H = Math.min(faceH - 0.5, Math.max(1.6, faceH * (tall && !k ? 0.86 + rng() * 0.08 : 0.38 + rng() * 0.45) * (k ? 0.75 : 1)));
            // Stout masses, never needles: at least about half as broad (the column is ~0.9 across) as tall.
            const W = Math.max(Math.min(3.6, 1.2 + faceH * 0.14 + rng() * 1.2) * (k ? 0.7 : 1), H * 0.62), D = W * (0.75 + rng() * 0.35);
            const along = k ? (rng() < 0.5 ? -1 : 1) * W * 0.75 : (rng() - 0.5) * 0.4;
            const back = W / 2 - 0.7 + (k ? 0.25 : 0);
            p.set(cx - ox * back + tx * along, foot - 0.3, cz - oz * back + tz * along);
            q.setFromEuler(e.set((rng() - 0.5) * 0.08, rng() * 6.3, (rng() - 0.5) * 0.08));
            crags.push(m.compose(p, q, s.set(W, H + 0.3, D)).clone());
            cragCols.push(cliffA.clone().lerp(cliffB, rng() * 0.5).offsetHSL((rng() - 0.5) * 0.02, 0, (rng() - 0.45) * 0.08));
          }
        }
        // Boulders fallen at the foot, bigger under taller faces.
        if (rng() < 0.3 + Math.min(0.25, faceH * 0.03)) {
          for (let k = 0, nk = 1 + Math.floor(rng() * 2.4); k < nk; k++) {
            const sc = 0.4 + Math.min(faceH, 10) * 0.08 + rng() * 0.5;
            const bx = cx + ox * (0.3 + rng() * 0.5) + tx * (rng() - 0.5) * 1.4, bz = cz + oz * (0.3 + rng() * 0.5) + tz * (rng() - 0.5) * 1.4;
            const bxi = Math.floor(bx), bzi = Math.floor(bz);
            if (bxi < 0 || bzi < 0 || bxi >= w || bzi >= h || propNear[bzi * w + bxi]) continue;
            if (walkable(bxi, bzi) && !looseOk(bxi, bzi)) continue;
            p.set(bx, foot - sc * 0.22, bz);
            q.setFromEuler(e.set((rng() - 0.5) * 0.5, rng() * 6.3, (rng() - 0.5) * 0.5));
            rocks.push(m.compose(p, q, s.set(sc * (0.9 + rng() * 0.4), sc * (0.55 + rng() * 0.4), sc)).clone());
            rockCols.push(cliffA.clone().lerp(rockBase, 0.2).offsetHSL(0, 0, -0.03 + (rng() - 0.5) * 0.1));
          }
        }
        // Scree spilling out over the ground below.
        if (faceH > 1.6 && looseOk(fx, fz) && rng() < 0.75) {
          for (let k = 0, nk = 2 + Math.floor(rng() * 4); k < nk; k++) {
            const sc = 0.07 + rng() * 0.2, u = rng();
            const px = fx + 0.5 - ox * (0.5 - u) * 0.9 + tx * (rng() - 0.5), pz = fz + 0.5 - oz * (0.5 - u) * 0.9 + tz * (rng() - 0.5);
            p.set(px, heightAt(px, pz) - sc * 0.2, pz);
            q.setFromEuler(e.set((rng() - 0.5) * 0.6, rng() * 6.3, (rng() - 0.5) * 0.6));
            debris.push(m.compose(p, q, s.set(sc * (1 + rng() * 0.5), sc * (0.6 + rng() * 0.4), sc)).clone());
            debrisCols.push(cliffA.clone().lerp(rockBase, 0.3).offsetHSL(0, -0.02, (rng() - 0.5) * 0.12));
          }
        }
      }
      // Plants rooted on the rock wherever it lies flat (grassy country only).
      if (!grassy) continue;
      for (let k = 0; k < 3; k++) {
        const px = x + 0.1 + rng() * 0.8, pz = z + 0.1 + rng() * 0.8;
        const y = terrain.ledge(px, pz, 0.4);
        if (y === null || y - floorAt(px, pz) < 0.7) continue;
        const [wx, wz] = terrain.warp(px, y, pz);
        const r = rng();
        if (r < treeP(i) * 4 && terrain.ledge(px, pz, 1.1) !== null) addTree(wx, wz, 0.65 + rng() * 0.25, y);
        else if (r < 0.2) {
          const sc = 0.35 + rng() * 0.45;
          p.set(wx, y - 0.05, wz);
          q.setFromEuler(e.set(0, rng() * 6.3, 0));
          bushes.push(m.compose(p, q, s.set(sc, sc * 0.75, sc)).clone());
          bushCols.push(new THREE.Color(leafPal[theme.trees][Math.floor(rng() * 3)]).offsetHSL(0, 0.04, -0.03));
        } else if (r < 0.85) {
          const sc = 0.7 + rng() * 0.6;
          p.set(wx, y - 0.03, wz);
          q.setFromEuler(e.set((rng() - 0.5) * 0.2, rng() * 6.3, (rng() - 0.5) * 0.2));
          ledgeTufts.push(m.compose(p, q, s.set(sc, sc * (0.85 + rng() * 0.4), sc)).clone());
          ledgeTuftCols.push(new THREE.Color(grassPal0[0]).lerp(new THREE.Color(grassPal0[1]), rng()).multiplyScalar(1.15).offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.05));
        }
      }
    }
  }
  // Behind the foot of the cave walls the same slabs climb on: bigger blocks stacked on the rock
  // mass in rings further back, each column topped at the rock's own height, so the wall reads as
  // one body of layered stone from the floor up into the dark (the bare relief only shows in the
  // seams between them).
  const mass: THREE.Matrix4[] = [], massCols: THREE.Color[] = [];
  if (theme.wallRise) {
    const floorD = new Float32Array(w * h).fill(1e6);
    for (let i = 0; i < w * h; i++) if (walkable(i % w, Math.floor(i / w))) floorD[i] = 0;
    const relax = (k: number, j: number, c: number) => {
      if (floorD[j] + c < floorD[k]) floorD[k] = floorD[j] + c;
    };
    for (let pass = 0; pass < 2; pass++) {
      for (let z = 1; z < h - 1; z++) for (let x = 1; x < w - 1; x++) {
        const k = z * w + x;
        relax(k, k - 1, 1); relax(k, k - w, 1); relax(k, k - w - 1, 1.414); relax(k, k - w + 1, 1.414);
      }
      for (let z = h - 2; z > 0; z--) for (let x = w - 2; x > 0; x--) {
        const k = z * w + x;
        relax(k, k + 1, 1); relax(k, k + w, 1); relax(k, k + w + 1, 1.414); relax(k, k + w - 1, 1.414);
      }
    }
    for (let z = 1; z < h - 1; z++) for (let x = 1; x < w - 1; x++) {
      const i = z * w + x, d = floorD[i];
      if (at(x, z) !== Cell.Wall || d < 1.9 || d > 7.5) continue;
      // A column every couple of cells (a few left out): big blocks, not a pile of boards.
      if (x % 2 !== 0 || z % 2 !== 0 || rng() < 0.2) continue;
      let nx = floorD[i - 1] - floorD[i + 1], nz = floorD[i - w] - floorD[i + w];
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      // Camera-side walls take them too: the rock there is kept low, so their slabs stay low.
      const top = heightAt(x + 0.5, z + 0.5);
      if (top < 1.2) continue;
      const face = Math.atan2(nx, nz), W = 2.3 + d * 0.18 + rng() * 0.6;
      let y = Math.max(-0.2, top - 2.4 - rng() * 0.8), n = 0;
      while (y < top + 0.1 && n++ < 3) {
        const th = 0.95 + rng() * 0.5;
        p.set(x + 0.5 + (rng() - 0.5) * 0.4, y, z + 0.5 + (rng() - 0.5) * 0.4);
        q.setFromEuler(e.set((rng() - 0.5) * 0.04, face + (rng() - 0.5) * 0.2, (rng() - 0.5) * 0.04));
        mass.push(m.compose(p, q, s.set(W * (0.95 + rng() * 0.2), th, W * 0.9)).clone());
        const band = Math.floor((y + 0.2 + strataNoise(x * 0.05 + 3, z * 0.05) * 0.9) / 0.6);
        massCols.push(strataPal[((band % 4) + 4) % 4].clone().offsetHSL(0, 0, (rng() - 0.5) * 0.04));
        y += th * 0.88;
      }
    }
  }
  for (const k of ['pine', 'grove', 'ash'] as TreeKind[]) {
    if (!trees[k].m.length) continue;
    const [trunk, crown] = treeArgs(ts, k);
    // Painted canopies: leaf clusters on broadleaves, needle tufts on pines, bark on dead ash.
    // Each tree takes one of the style's canopy variants, picked from its position (no pattern
    // along the rows, and the same tree every visit).
    const vs = ts.canopy[k], tp = new THREE.Vector3();
    const variant = trees[k].m.map((mm) => (tp.setFromMatrixPosition(mm), Math.floor(hash01(tp.x, tp.z) * vs.length)));
    const pick = <T>(list: T[], v: number) => list.filter((_, i) => variant[i] === v);
    const made = [...inst(ts.trunk[k], trees[k].m, null, ...trunk)!, ...vs.flatMap((geo, v) => inst(geo, pick(trees[k].m, v), pick(trees[k].c, v), ...crown) ?? [])];
    for (const mesh of made) mesh.name = 'tree';
  }
  // Rocks are chunky faceted blocks (two shapes, alternating) sunk into the ground.
  const half = <T>(list: T[], odd: number) => list.filter((_, i) => i % 2 === odd);
  inst(rockBlock(7, 1.25, 1.0, 1.1), half(rocks, 0), half(rockCols, 0), 0, true, 'rock');
  inst(rockBlock(8, 1.1, 1.05, 1.2), half(rocks, 1), half(rockCols, 1), 0, true, 'rock');
  inst(rockBlock(9, 1.1, 1.0, 1.0), rims, rimCols, 0, false, 'rock');
  // Cave slabs fade into the dark with height exactly like the rock mass behind them.
  const caveShade = (mat: THREE.MeshStandardMaterial) => {
    if (!theme.wallRise) return;
    applyHeightShade(mat, theme.topShade ?? 1, ...(theme.topRange ?? [2.5, 12]));
    useStrataRock(mat);
  };
  inst(slabBlock(31), half(strata, 0), half(strataCols, 0), 0, true, 'rock', true, undefined, caveShade);
  inst(slabBlock(32), half(strata, 1), half(strataCols, 1), 0, true, 'rock', true, undefined, caveShade);
  inst(slabBlock(34), half(mass, 0), half(massCols, 0), 0, true, 'rock', false, undefined, caveShade);
  inst(slabBlock(35), half(mass, 1), half(massCols, 1), 0, true, 'rock', false, undefined, caveShade);
  inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), crevices, null, 0x120e0b, true, undefined, false);
  inst(rockBlock(33, 1, 0.8, 1), debris, debrisCols, 0, false, 'rock', false);
  for (let v = 0; v < 4; v++) inst(cragColumn(41 + v), crags.filter((_, i) => i % 4 === v), cragCols.filter((_, i) => i % 4 === v), 0, true, 'rock');
  // Masonry: stacked, offset courses with a broken top (instances turn in 90° steps for variety).
  const masonry = mergeGeometries([
    new THREE.BoxGeometry(1, 0.45, 1).translate(0, -0.275, 0),
    new THREE.BoxGeometry(0.92, 0.36, 0.94).translate(0.03, 0.125, -0.02),
    new THREE.BoxGeometry(0.52, 0.3, 0.5).translate(-0.22, 0.45, 0.2),
    new THREE.BoxGeometry(0.4, 0.2, 0.44).translate(0.26, 0.4, -0.22),
  ])!;
  inst(masonry, walls, wallCols, 0, true, 'masonry');
  for (const mesh of inst(ts.bush, bushes, bushCols, 0, false, ts.paint.grove, true, ts.bushGrade, ts.shaded ? withVertexShade : undefined) ?? []) mesh.name = 'bush';
  inst(new THREE.ConeGeometry(0.05, 0.7, 3).translate(0, 0.35, 0), reeds, null, 0x7e9446, false, undefined, false);
  const flowerGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.012, 0.012, 0.25, 3).translate(0, 0.125, 0).toNonIndexed(),
    new THREE.OctahedronGeometry(0.06, 0).translate(0, 0.27, 0),
  ])!;
  inst(flowerGeo, flowers, flowerCols, 0, false, undefined, false);
  if (under.length) {
    inst(taper(0.3, 0.3, 1.3, 1.3, 1), under, underCols, 0, false, 'rock');
    // A solid core under the whole island so it reads as one mass, in the same rock as its side.
    const coreMat = new THREE.MeshStandardMaterial({ color: underB.clone(), flatShading: true });
    applyPaint(coreMat, 'rock', 'world', 0.5);
    // Many broken facets (radius and height wandering round it), never a few big flat planes.
    // (Kept inside the island's outline and falling steeply, an inverted mountain under it: a broad
    // shallow cone pushed out past the edge and read from above as a flat dark slab.)
    const CR = Math.min(w, h) * 0.36, CH = 46;
    const coreGeo = new THREE.ConeGeometry(CR, CH, 36, 8).rotateX(Math.PI).toNonIndexed();
    {
      const cp = coreGeo.getAttribute('position') as THREE.BufferAttribute, cn = smoothNoise(seed + 77);
      for (let i = 0; i < cp.count; i++) {
        const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
        if (r < 1e-3) continue;
        const f = 0.84 + 0.3 * cn(Math.cos(a) * 3 + 9, Math.sin(a) * 3 + y * 0.12);
        cp.setXYZ(i, x * f, y - cn(Math.cos(a) * 5, Math.sin(a) * 5) * 6 * (r / CR), z * f);
      }
      coreGeo.computeVertexNormals();
    }
    const core = new THREE.Mesh(coreGeo, coreMat);
    // Top at y = -1.2: below the deepest pond bed, or it would cap the water.
    core.position.set(w / 2, -1.2 - CH / 2, h / 2);
    group.add(core);
  }

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
  for (let i = 0; i < w * h * 0.7; i++) {
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

  let debrisTick: ((t: number) => void) | null = null;
  if (theme.ambient === 'void') {
    const skyGroup = new THREE.Group();
    voidSky(skyGroup);
    followers.push(skyGroup);
    group.add(skyGroup);
    // Drifting islets far out in the Veil: two loose clusters off the island's south-west, well out
    // (never behind the castle from the cameras that look at its crown) and well below its land, so
    // they read as distant sky islands and never stand beside a tower. Each is an inverted cone of the
    // cliff's rock tapering to a jagged point, a domed grass cap with tufts spilling over its rim and
    // roots trailing under it, bobbing slowly.
    const debrisMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.cliff?.[0] ?? 0x8a7a6c), flatShading: true, roughness: 0.95, emissive: 0x241a2c });
    applyPaint(debrisMat, 'rock', 'object', 0.8);
    const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color((theme.ground[Ground.Grass] ?? [0x5a8a44])[0]).multiplyScalar(1.15), flatShading: true, roughness: 0.9 });
    const rootMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, flatShading: true, roughness: 1 });
    const clearOf = (x: number, z: number, r: number) => {
      for (let dz = -r; dz <= r; dz += 3) for (let dx = -r; dx <= r; dx += 3) if (at(Math.floor(x + dx), Math.floor(z + dz)) !== Cell.Void) return false;
      return true;
    };
    /** An inverted rock cone: a ring of `n` sides, its rim and every ring below it jittered, ending in a point. */
    const isletBody = (seed: number, r: number, depth: number) => {
      const geo = new THREE.ConeGeometry(r, depth, 7, 3, false).rotateX(Math.PI).translate(0, -depth / 2, 0);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const k = Math.round(x * 31 + 7) * 131 + Math.round(y * 17 + 3) * 7 + Math.round(z * 29);
        const j = 0.22 * r * (hash01(seed, k) - 0.5), t = 1 + j / Math.max(0.01, r);
        pos.setXYZ(i, x * t, y + (y < -depth * 0.05 ? (hash01(seed, k, 2) - 0.5) * depth * 0.18 : 0), z * t);
      }
      geo.computeVertexNormals();
      return geo;
    };
    const bobbers: { o: THREE.Object3D; y: number; ph: number }[] = [];
    for (const [c, a0] of [[0, 2.2], [1, 2.75]] as const) {
      const a = a0 + (rng() - 0.5) * 0.2;
      let r = 190;
      while (r < 460 && !clearOf(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, 40)) r += 6;
      const cx = w / 2 + Math.cos(a) * r, cz = h / 2 + Math.sin(a) * r, cy = -42 + rng() * 8;
      for (let i = 0, n = 3 + c; i < n; i++) {
        const size = i ? 2.2 + rng() * 2.6 : 6 + rng() * 3;
        const islet = new THREE.Group();
        const ang = rng() * 6.3, d = i ? 9 + rng() * 16 : 0;
        islet.position.set(cx + Math.cos(ang) * d, cy + (rng() - 0.5) * 9, cz + Math.sin(ang) * d);
        islet.rotation.y = rng() * 6.3;
        islet.add(new THREE.Mesh(isletBody(20 + c * 7 + i, size * 0.62, size * (1.3 + rng() * 0.6)), debrisMat));
        const cap = new THREE.Mesh(new THREE.SphereGeometry(size * 0.66, 9, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.28, 1), capMat);
        cap.position.y = -0.05;
        islet.add(cap);
        for (let k = 0; k < 5; k++) {
          const ta = (k / 5) * Math.PI * 2 + rng() * 0.6, tuft = new THREE.Mesh(new THREE.ConeGeometry(size * 0.08, size * 0.16, 4), capMat);
          tuft.position.set(Math.cos(ta) * size * 0.6, -size * 0.05, Math.sin(ta) * size * 0.6);
          tuft.rotation.set(Math.sin(ta) * 1.9, 0, -Math.cos(ta) * 1.9);
          islet.add(tuft);
        }
        for (let k = 0; k < 4; k++) {
          const len = size * (0.4 + rng() * 0.6), root = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.1, len, 4), rootMat);
          const ra = rng() * 6.3, rr = size * (0.25 + rng() * 0.25);
          root.position.set(Math.cos(ra) * rr, -len / 2 - size * 0.1, Math.sin(ra) * rr);
          root.rotation.z = (rng() - 0.5) * 0.3;
          islet.add(root);
        }
        islet.traverse((o) => (o.name = 'debris'));
        group.add(islet);
        bobbers.push({ o: islet, y: islet.position.y, ph: rng() * 6.3 });
      }
    }
    debrisTick = (t) => bobbers.forEach((b) => (b.o.position.y = b.y + Math.sin(t * 0.35 + b.ph) * 0.45));
  }

  // The kerbs edging paving against lawns and gravel (layout.kerbs): one merged mesh of dressed
  // blue-grey slabs standing a hair proud of the ground.
  if (layout.kerbs?.length) {
    const km = new THREE.Matrix4();
    const parts = layout.kerbs.map((kb) => {
      const g = chamferBox(kb.len + 0.02, 0.12, 0.4, 0.03).clone();
      g.applyMatrix4(km.makeRotationY(kb.rot).setPosition(kb.x, Math.max(floorAt(kb.x, kb.z), heightAt(kb.x, kb.z)) + 0.0, kb.z));
      return g;
    });
    const kerbMat = new THREE.MeshStandardMaterial({ color: TRIM_D, roughness: 0.9, flatShading: true });
    applyPaint(kerbMat, 'masonry', 'world');
    const kerbMesh = new THREE.Mesh(mergeGeometries(parts)!, kerbMat);
    kerbMesh.receiveShadow = true;
    kerbMesh.name = 'kerbs';
    group.add(kerbMesh);
  }

  const props: Prop[] = [];
  for (const pr of layout.props) {
    const prop = pr.kind.startsWith('fit_') ? buildFitProp(pr.kind.slice(4), pr.len) : buildProp(pr.kind, pr.v === undefined && pr.bend === undefined ? pr.len : { len: pr.len, v: pr.v, bend: pr.bend });
    prop.obj.position.set(pr.x, Math.max(floorAt(pr.x, pr.z), heightAt(pr.x, pr.z)), pr.z);
    prop.obj.rotation.y = pr.rot ?? 0;
    if (pr.s) prop.obj.scale.setScalar(pr.s);
    if (OCCLUDING_PROPS.has(pr.kind)) occludeAll(prop.obj);
    group.add(prop.obj);
    props.push(prop);
  }
  // Buildings stand on the flat floor they stamped; their walls dissolve around the hero like
  // any other occluder.
  const buildings = (layout.buildings ?? []).map((b) => {
    const bp = buildBuilding(b, floorAt(b.x + b.w / 2, b.z + b.d / 2));
    occludeAll(bp.obj);
    group.add(bp.obj);
    return bp;
  });
  return { group, followers, props, buildings, heightAt, floorAt, tick: (t) => { terrain.tick(t); WIND.uWindT.value = t; debrisTick?.(t); } };
}
