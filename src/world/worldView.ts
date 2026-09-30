import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng';
import type { ZoneTheme } from '../data/zones';
import { Cell, Ground, type ZoneLayout } from './layout';
import { buildProp, type Prop } from './props';
import { addPatch, applySurface } from '../render/surface';
import { buildTerrain, isRelief, smoothNoise } from './terrain';

type TreeKind = ZoneTheme['trees'];
import type { SurfaceKind } from '../render/textures';

// ─── See-through occlusion ──────────────────────────────────────────────────

/** Shared uniforms: the game updates these every frame with the camera and player positions. */
export const OCCLUDE = {
  uOccPlayer: { value: new THREE.Vector3() },
  uOccCam: { value: new THREE.Vector3() },
  uOccRadius: { value: 0.16 },
  /** 1 during gameplay; 0 on the title/creation screens where nothing should be cut away. */
  uOccOn: { value: 0 },
};

/**
 * Patch a material so fragments between the camera and the player, inside a small
 * screen-space circle around the player, dissolve with an ordered dither. Trees and walls
 * never hide the hero, and nothing pops in or out.
 */
export function makeOccludable(mat: THREE.Material) {
  addPatch(mat, { key: 'occlude', apply: (shader) => {
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
        float occBayer(vec2 p) {
          ivec2 i = ivec2(mod(p, 4.0));
          int idx = i.x + i.y * 4;
          float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
          return (m[idx] + 0.5) / 16.0;
        }`,
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
          if (uOccOn > 0.5 && along > 0.5 && along < lenP - 0.8) {
            float perp = length(toF - dirP * along);
            float screen = perp / along;
            float fade = 1.0 - smoothstep(uOccRadius * 0.55, uOccRadius, screen);
            if (fade > occBayer(gl_FragCoord.xy)) discard;
          }
        }`,
      );
  } });
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

/** World instancing tile size in cells (see inst()). */
const CHUNK = 24;

// ─── Builder ────────────────────────────────────────────────────────────────

export interface WorldView {
  group: THREE.Group;
  /** Objects that follow the camera (sky). */
  followers: THREE.Object3D[];
  props: Prop[];
  /** Terrain height at a world point (scenery and props stand on it). */
  heightAt(x: number, z: number): number;
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
  const heightAt = terrain.heightAt;

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  const inst = (geo: THREE.BufferGeometry, mats: THREE.Matrix4[], cols: THREE.Color[] | null, color: number, occlude: boolean, surface?: SurfaceKind, shadow = true) => {
    if (!mats.length) return;
    const mat = new THREE.MeshStandardMaterial({ color: cols ? 0xffffff : color, flatShading: true, roughness: 0.9 });
    if (surface) applySurface(mat, surface, 'world');
    if (occlude) makeOccludable(mat);
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
    for (const ids of buckets.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, ids.length);
      ids.forEach((id, i) => {
        mesh.setMatrixAt(i, mats[id]);
        if (cols) mesh.setColorAt(i, cols[id]);
      });
      mesh.computeBoundingSphere();
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  };

  // ─── Scenery: trees, boulders, walls, undergrowth ─────────────────────────
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1.2, 5).translate(0, 0.6, 0);
  const canopy: Record<TreeKind, THREE.BufferGeometry> = {
    pine: mergeGeometries([
      new THREE.ConeGeometry(0.95, 1.3, 6).translate(0, 1.5, 0),
      new THREE.ConeGeometry(0.75, 1.1, 6).translate(0, 2.2, 0),
      new THREE.ConeGeometry(0.5, 0.9, 6).translate(0, 2.8, 0),
    ])!,
    grove: mergeGeometries([
      new THREE.IcosahedronGeometry(1.0, 0).translate(0, 2.1, 0),
      new THREE.IcosahedronGeometry(0.7, 0).translate(0.5, 2.6, 0.2),
      new THREE.IcosahedronGeometry(0.6, 0).translate(-0.5, 2.5, -0.3),
    ])!,
    ash: mergeGeometries([
      new THREE.ConeGeometry(0.12, 1.2, 4).rotateZ(0.8).translate(0.45, 1.6, 0),
      new THREE.ConeGeometry(0.1, 1.0, 4).rotateZ(-0.9).translate(-0.4, 1.8, 0.1),
      new THREE.ConeGeometry(0.08, 0.8, 4).rotateX(0.9).translate(0, 2.0, 0.35),
    ])!,
  };
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
  const walls: THREE.Matrix4[] = [], wallCols: THREE.Color[] = [];
  const under: THREE.Matrix4[] = [];
  const bushes: THREE.Matrix4[] = [], bushCols: THREE.Color[] = [];
  const flowers: THREE.Matrix4[] = [], flowerCols: THREE.Color[] = [];
  const reeds: THREE.Matrix4[] = [];
  const wallColor = { castle: 0x8a8478, cave: 0x5e5044, ruin: 0x6a7070 }[theme.wall];
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
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const cell = at(x, z);
      const i = z * w + x;
      if (cell === Cell.Tree) addTree(x + 0.5, z + 0.5);
      else if (cell === Cell.Rock) {
        const sc = 0.6 + rng() * 0.7;
        p.set(x + 0.5, heightAt(x + 0.5, z + 0.5) + 0.1, z + 0.5);
        q.setFromEuler(e.set(rng() * 3, rng() * 3, rng() * 3));
        s.set(sc, sc * (0.6 + rng() * 0.4), sc);
        rocks.push(m.compose(p, q, s).clone());
        rockCols.push(new THREE.Color(0x8a8478).offsetHSL(0, 0, (rng() - 0.5) * 0.1));
      } else if (isRelief(cell, theme)) {
        const edge = nearWalkable(x, z);
        if (edge && rng() < (cell === Cell.Wall ? 0.6 : 0.35)) {
          // Boulders at the foot of cliffs / cave walls break up the faces.
          const big = cell === Cell.Wall ? 1.4 + rng() * 1.2 : 1.1 + rng() * 1.3;
          p.set(x + 0.5 + (rng() - 0.5) * 0.4, 0.15, z + 0.5 + (rng() - 0.5) * 0.4);
          q.setFromEuler(e.set(rng() * 3, rng() * 3, rng() * 3));
          s.set(big, big * (0.9 + rng() * 0.8), big);
          rocks.push(m.compose(p, q, s).clone());
          rockCols.push(new THREE.Color(cell === Cell.Wall ? 0x5e5044 : 0x6a5e52).offsetHSL(0, 0, (rng() - 0.5) * 0.1));
        } else if (!edge && cell === Cell.Cliff && rng() < (theme.reliefTrees ?? 0)) addTree(x + 0.5, z + 0.5, 1.1);
      } else if (cell === Cell.Wall) {
        if (!nearWalkable(x, z)) continue;
        const hgt = theme.wall === 'castle' ? 2.4 : 1.6 + rng() * 1.8;
        p.set(x + 0.5, hgt / 2, z + 0.5);
        q.setFromEuler(e.set(0, Math.floor(rng() * 4) * (Math.PI / 2), 0));
        s.set(1, hgt, 1);
        walls.push(m.compose(p, q, s).clone());
        wallCols.push(new THREE.Color(wallColor).offsetHSL(0, 0, (rng() - 0.5) * 0.08));
      } else if (cell === Cell.Void && theme.ambient === 'void') {
        // Rocky underside beneath the island rim.
        let rim = false;
        for (let dz = -1; dz <= 1 && !rim; dz++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, z + dz) !== Cell.Void) rim = true;
        if (rim) {
          const depth = 3 + rng() * 5;
          p.set(x + 0.5, -depth / 2 + 0.1, z + 0.5);
          q.setFromEuler(e.set(0, rng() * 3, 0));
          s.set(1.6 + rng(), depth, 1.6 + rng());
          under.push(m.compose(p, q, s).clone());
        }
      } else if (cell === Cell.Ground && !layout.fluid[i]) {
        const g = layout.ground[i];
        const green = g === Ground.Grass || g === Ground.Dirt;
        // Reeds along shores, bushes where the forest thins out, flowers in open meadows.
        if (nearFluid(x, z) && rng() < 0.5) {
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
  for (const k of ['pine', 'grove', 'ash'] as TreeKind[]) {
    if (!trees[k].m.length) continue;
    inst(trunkGeo, trees[k].m, null, k === 'ash' ? 0x2a2420 : 0x4a3020, true, 'bark');
    inst(canopy[k], trees[k].m, trees[k].c, 0, true, k === 'ash' ? 'bark' : 'leaves');
  }
  inst(new THREE.DodecahedronGeometry(0.62, 0), rocks, rockCols, 0, true, 'stone');
  // Masonry: stacked, offset courses with a broken top (instances turn in 90° steps for variety).
  const masonry = mergeGeometries([
    new THREE.BoxGeometry(1, 0.45, 1).translate(0, -0.275, 0),
    new THREE.BoxGeometry(0.92, 0.36, 0.94).translate(0.03, 0.125, -0.02),
    new THREE.BoxGeometry(0.52, 0.3, 0.5).translate(-0.22, 0.45, 0.2),
    new THREE.BoxGeometry(0.4, 0.2, 0.44).translate(0.26, 0.4, -0.22),
  ])!;
  inst(masonry, walls, wallCols, 0, true, 'stone');
  inst(new THREE.IcosahedronGeometry(0.7, 0).translate(0, 0.45, 0), bushes, bushCols, 0, false, 'leaves');
  inst(new THREE.ConeGeometry(0.035, 0.7, 3).translate(0, 0.35, 0), reeds, null, 0x6a7a3a, false, undefined, false);
  const flowerGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.012, 0.012, 0.25, 3).translate(0, 0.125, 0).toNonIndexed(),
    new THREE.OctahedronGeometry(0.06, 0).translate(0, 0.27, 0),
  ])!;
  inst(flowerGeo, flowers, flowerCols, 0, false, undefined, false);
  if (under.length) {
    inst(new THREE.ConeGeometry(0.7, 1, 6).rotateX(Math.PI), under, null, 0x4a3e38, false, 'stone');
    // A solid core under the whole island so it reads as one mass.
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x3a302c, flatShading: true });
    applySurface(coreMat, 'stone', 'world', 0.5);
    const core = new THREE.Mesh(new THREE.ConeGeometry(w * 0.38, 16, 9).rotateX(Math.PI), coreMat);
    core.position.set(w / 2, -8.2, h / 2);
    group.add(core);
  }

  // Grass tufts
  const tuftGeo = new THREE.ConeGeometry(0.08, 0.35, 3).translate(0, 0.17, 0);
  const tufts: THREE.Matrix4[] = [];
  for (let i = 0; i < w * h * 0.4; i++) {
    const x = rng() * w, z = rng() * h;
    const gi = Math.floor(z) * w + Math.floor(x);
    const g = layout.ground[gi];
    if (layout.cells[gi] !== Cell.Ground || layout.fluid[gi] || (g !== Ground.Dirt && g !== Ground.Grass)) continue;
    p.set(x, heightAt(x, z), z);
    q.setFromEuler(e.set((rng() - 0.5) * 0.4, rng() * 3, (rng() - 0.5) * 0.4));
    const sc = 0.7 + rng() * 0.8;
    tufts.push(m.compose(p, q, s.set(sc, sc, sc)).clone());
  }
  inst(tuftGeo, tufts, null, theme.trees === 'grove' ? 0x7aa84a : 0x6f8a3c, false, undefined, false);

  if (theme.ambient === 'void') {
    const skyGroup = new THREE.Group();
    voidSky(skyGroup, rng);
    followers.push(skyGroup);
    group.add(skyGroup);
    // Drifting debris islands in the distance.
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2, r = 55 + rng() * 50;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + rng() * 3, 0), new THREE.MeshStandardMaterial({ color: 0x5a4e48, flatShading: true }));
      rock.position.set(w / 2 + Math.cos(a) * r, -10 + rng() * 25, h / 2 + Math.sin(a) * r);
      rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      rock.name = 'debris';
      group.add(rock);
    }
  }

  const props: Prop[] = [];
  for (const pr of layout.props) {
    const prop = buildProp(pr.kind, pr.len);
    prop.obj.position.set(pr.x, Math.max(0, heightAt(pr.x, pr.z)), pr.z);
    prop.obj.rotation.y = pr.rot ?? 0;
    if (pr.s) prop.obj.scale.setScalar(pr.s);
    group.add(prop.obj);
    props.push(prop);
  }
  return { group, followers, props, heightAt, tick: terrain.tick };
}
