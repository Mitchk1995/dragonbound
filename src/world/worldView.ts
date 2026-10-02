import * as THREE from 'three';
import { shareResource } from '../render/resources';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng';
import type { ZoneTheme } from '../data/zones';
import { Cell, Fluid, Ground, type ZoneLayout } from './layout';
import { buildProp, OCCLUDING_PROPS, type Prop } from './props';
import { buildBuilding, buildFitProp, type BuildingProp } from './buildingModel';
import { addPatch, applyGrade, applyHeightShade, applySurface, type Grade } from '../render/surface';
import { applyPaint, isPaintKind, type PaintKind } from '../render/paint';
import { buildTerrain, isRelief, smoothNoise, WATER_Y } from './terrain';
import { hash01, rockBlock, slabBlock, taper } from '../render/blocks';

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
 * screen-space circle around the player and above the hero's knees, are cut away cleanly (no
 * dither). Trees and walls never hide the hero; a low stub of what was cut stays in place.
 */
export function makeOccludable(mat: THREE.Material, shadow = false) {
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
            if (perp / along < uOccRadius * 0.85) discard;
          }
        }`,
      );
  } });
}

/** Shadow-pass depth material with the same cut-away (see makeOccludable). */
let occDepth: THREE.MeshDepthMaterial | null = null;
function occludedDepth() {
  if (!occDepth) {
    occDepth = shareResource(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
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

function voidSky(group: THREE.Group, rng: () => number) {
  const skyGeo = new THREE.SphereGeometry(180, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(0x1a1040) }, mid: { value: new THREE.Color(0x3a1a4a) }, bot: { value: new THREE.Color(0x050510) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
      void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, h) : mix(mid, bot, -h * 1.5);
      float band = exp(-pow((h + 0.05) * 6.0, 2.0)); c += vec3(0.35, 0.18, 0.4) * band * 0.6; gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  sky.name = 'sky';
  group.add(sky);
  const starPos: number[] = [];
  for (let i = 0; i < 1500; i++) {
    const u = rng() * 2 - 1, a = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    starPos.push(Math.cos(a) * r * 170, u * 170, Math.sin(a) * r * 170);
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.9 }),
  );
  stars.name = 'sky';
  group.add(stars);
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
  const addTree = (x: number, z: number, scale = 1) => {
    const kind = speciesAt(x, z);
    const sc = (0.8 + rng() * 0.6) * scale;
    p.set(x + (rng() - 0.5) * 0.3, heightAt(x, z) - 0.05, z + (rng() - 0.5) * 0.3);
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
  const under: THREE.Matrix4[] = [];
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
        } else if (edge && rng() < (cell === Cell.Wall ? 0.6 : 0.3)) {
          // Fallen ledges at the foot of cliffs: one or two flat-topped slabs, stepping back, in the
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
        } else if (!edge && cell === Cell.Cliff && rng() < (layout.canopy ? layout.canopy[i] / 100 : theme.reliefTrees ?? 0)) addTree(x + 0.5, z + 0.5, 1.1);
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
          // From the land's own level (a raised edge gets a taller face) down into the void.
          let top = 0;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, z + dz) !== Cell.Void) top = Math.max(top, floorAt(x + dx + 0.5, z + dz + 0.5));
          const depth = 3 + rng() * 5;
          p.set(x + 0.5, (top - depth) / 2 + 0.1, z + 0.5);
          q.setFromEuler(e.set(0, rng() * 3, 0));
          s.set(1.6 + rng(), top + depth, 1.6 + rng());
          under.push(m.compose(p, q, s).clone());
        }
      } else if (cell === Cell.Ground && !layout.fluid[i]) {
        const g = layout.ground[i];
        const green = g === Ground.Grass || g === Ground.Dirt;
        if (debrisFloor) addDebris(x, z);
        // Reeds along shores (water only, never lava), bushes where the forest thins out, flowers
        // in open meadows.
        if (nearFluid(x, z) && !theme.lava && !theme.wallRise && rng() < 0.5) {
          for (let k = 0; k < 3; k++) {
            p.set(x + rng(), heightAt(x + 0.5, z + 0.5), z + rng());
            q.setFromEuler(e.set((rng() - 0.5) * 0.3, rng() * 3, (rng() - 0.5) * 0.3));
            const sc = 0.8 + rng() * 0.7;
            reeds.push(m.compose(p, q, s.set(sc, sc * 1.4, sc)).clone());
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
        } else if (g === Ground.Grass && theme.flowers && rng() < 0.06) {
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
    if (theme.wallRise) applyHeightShade(mat, theme.topShade ?? 1, ...(theme.topRange ?? [2.5, 12]));
  };
  inst(slabBlock(31), half(strata, 0), half(strataCols, 0), 0, true, 'rock', true, undefined, caveShade);
  inst(slabBlock(32), half(strata, 1), half(strataCols, 1), 0, true, 'rock', true, undefined, caveShade);
  inst(slabBlock(34), half(mass, 0), half(massCols, 0), 0, true, 'rock', false, undefined, caveShade);
  inst(slabBlock(35), half(mass, 1), half(massCols, 1), 0, true, 'rock', false, undefined, caveShade);
  inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), crevices, null, 0x120e0b, true, undefined, false);
  inst(rockBlock(33, 1, 0.8, 1), debris, debrisCols, 0, false, 'rock', false);
  // Masonry: stacked, offset courses with a broken top (instances turn in 90° steps for variety).
  const masonry = mergeGeometries([
    new THREE.BoxGeometry(1, 0.45, 1).translate(0, -0.275, 0),
    new THREE.BoxGeometry(0.92, 0.36, 0.94).translate(0.03, 0.125, -0.02),
    new THREE.BoxGeometry(0.52, 0.3, 0.5).translate(-0.22, 0.45, 0.2),
    new THREE.BoxGeometry(0.4, 0.2, 0.44).translate(0.26, 0.4, -0.22),
  ])!;
  inst(masonry, walls, wallCols, 0, true, 'masonry');
  for (const mesh of inst(ts.bush, bushes, bushCols, 0, false, ts.paint.grove, true, ts.bushGrade, ts.shaded ? withVertexShade : undefined) ?? []) mesh.name = 'bush';
  inst(new THREE.ConeGeometry(0.035, 0.7, 3).translate(0, 0.35, 0), reeds, null, 0x6a7a3a, false, undefined, false);
  const flowerGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.012, 0.012, 0.25, 3).translate(0, 0.125, 0).toNonIndexed(),
    new THREE.OctahedronGeometry(0.06, 0).translate(0, 0.27, 0),
  ])!;
  inst(flowerGeo, flowers, flowerCols, 0, false, undefined, false);
  if (under.length) {
    inst(taper(0.3, 0.3, 1.3, 1.3, 1), under, null, 0x4a3e38, false, 'rock');
    // A solid core under the whole island so it reads as one mass.
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x3a302c, flatShading: true });
    applyPaint(coreMat, 'rock', 'world', 0.5);
    const core = new THREE.Mesh(new THREE.ConeGeometry(w * 0.38, 16, 9).rotateX(Math.PI), coreMat);
    // Top at y = -1.2: below the deepest pond bed, or it would cap the water.
    core.position.set(w / 2, -9.2, h / 2);
    group.add(core);
  }

  // Grass: clumps of thin blades fanning out (dark at the root, light at the tip), coloured from
  // the zone's own grass, thick in meadows, sparse on dirt, none on paths; they sway in the wind.
  const tufts: THREE.Matrix4[] = [], tuftCols: THREE.Color[] = [];
  const grassPal = theme.ground[Ground.Grass] ?? [0x5a7a3a, 0x6a8a44];
  const tuftNoise = smoothNoise(seed + 91);
  for (let i = 0; i < w * h * 0.7; i++) {
    const x = rng() * w, z = rng() * h;
    const gi = Math.floor(z) * w + Math.floor(x);
    const g = layout.ground[gi];
    if (layout.cells[gi] !== Cell.Ground || layout.fluid[gi] || (g !== Ground.Dirt && g !== Ground.Grass)) continue;
    const meadow = tuftNoise(x * 0.08, z * 0.08);
    if (rng() > (g === Ground.Grass ? 0.4 + meadow * 0.6 : 0.15)) continue;
    p.set(x, heightAt(x, z) - 0.02, z);
    q.setFromEuler(e.set((rng() - 0.5) * 0.2, rng() * 6.3, (rng() - 0.5) * 0.2));
    const sc = 0.75 + rng() * 0.6 + meadow * 0.3;
    tufts.push(m.compose(p, q, s.set(sc, sc * (0.85 + rng() * 0.4), sc)).clone());
    tuftCols.push(new THREE.Color(grassPal[0]).lerp(new THREE.Color(grassPal[1]), rng()).multiplyScalar(g === Ground.Dirt ? 1.05 : 1.22).offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.04));
  }
  inst(grassClump(), tufts, tuftCols, 0, false, undefined, false, undefined, (mat) => {
    mat.vertexColors = true;
    mat.flatShading = false;
    applyWind(mat);
  });

  if (theme.ambient === 'void') {
    const skyGroup = new THREE.Group();
    voidSky(skyGroup, rng);
    followers.push(skyGroup);
    group.add(skyGroup);
    // Drifting debris islands in the distance: painted rock like the island's own underside, lit
    // a little by the void's glow so they read as stone, not black blobs.
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x8a7a6c, flatShading: true, roughness: 0.95, emissive: 0x241a2c });
    applyPaint(debrisMat, 'rock', 'object', 0.8);
    // Each drifts out over the void: on a big island it is pushed out past the shore, never left
    // half-sunk in the fields.
    const overLand = (x: number, z: number, r: number) => {
      for (let dz = -r; dz <= r; dz += 2) for (let dx = -r; dx <= r; dx += 2) if (at(Math.floor(x + dx), Math.floor(z + dz)) !== Cell.Void) return true;
      return false;
    };
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      let r = 55 + rng() * 50;
      const size = 2 + rng() * 5;
      while (r < 400 && overLand(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, size + 4)) r += 4;
      const rock = new THREE.Mesh(rockBlock(20 + i, size, size * 0.8, size * 0.9), debrisMat);
      rock.position.set(w / 2 + Math.cos(a) * r, -10 + rng() * 25, h / 2 + Math.sin(a) * r);
      // Mostly upright (a flat top catching the light), turned freely about the vertical.
      rock.rotation.set((rng() - 0.5) * 0.6, rng() * 6.3, (rng() - 0.5) * 0.6);
      rock.name = 'debris';
      group.add(rock);
    }
  }

  const props: Prop[] = [];
  for (const pr of layout.props) {
    const prop = pr.kind.startsWith('fit_') ? buildFitProp(pr.kind.slice(4), pr.len) : buildProp(pr.kind, pr.v === undefined ? pr.len : { len: pr.len, v: pr.v });
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
  return { group, followers, props, buildings, heightAt, floorAt, tick: (t) => { terrain.tick(t); WIND.uWindT.value = t; } };
}
