import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng';
import type { ZoneTheme } from '../data/zones';
import { Cell, Ground, type ZoneLayout } from './layout';
import { buildProp, type Prop } from './props';
import { addPatch, applyGround, applySurface } from '../render/surface';
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

// ─── Builder ────────────────────────────────────────────────────────────────

export interface WorldView {
  group: THREE.Group;
  /** Objects that follow the camera (sky). */
  followers: THREE.Object3D[];
  props: Prop[];
}

export function buildWorldView(layout: ZoneLayout, theme: ZoneTheme, seed = 99): WorldView {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  const followers: THREE.Object3D[] = [];
  const { w, h } = layout;
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= w || z >= h ? Cell.Void : layout.cells[z * w + x]);

  // Ground: per-cell quads (void cells skipped) with slightly jittered heights.
  const heights = new Float32Array((w + 1) * (h + 1));
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) heights[z * (w + 1) + x] = (rng() - 0.5) * 0.1;
  const pos: number[] = [];
  const col: number[] = [];
  const splat: number[] = [];
  // Ground-texture weights per grid vertex: the average of the (up to four) cells touching it,
  // so dirt, grass, flagstone and cave rock blend across cell borders.
  const SPLAT: Record<number, number> = {
    [Ground.Dirt]: 0, [Ground.Path]: 0, [Ground.Camp]: 0, [Ground.Grass]: 1,
    [Ground.Arena]: 2, [Ground.Stone]: 2, [Ground.Cave]: 3, [Ground.Scorch]: 3,
  };
  const vSplat = new Float32Array((w + 1) * (h + 1) * 4);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (at(x, z) === Cell.Void) continue;
    const ch = SPLAT[layout.ground[z * w + x]] ?? 0;
    for (const [xx, zz] of [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]]) vSplat[(zz * (w + 1) + xx) * 4 + ch] += 1;
  }
  const c = new THREE.Color(), c2 = new THREE.Color();
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const cell = at(x, z);
      if (cell === Cell.Void) continue;
      const g = layout.ground[z * w + x] as Ground;
      const shades = theme.ground[g] ?? theme.ground[Ground.Dirt] ?? [0x6e6048, 0x5a5040];
      c.setHex(shades[0]).lerp(c2.setHex(shades[1]), 0.5 + Math.sin(x * 0.35) * Math.cos(z * 0.27) * 0.5);
      c.offsetHSL(0, 0, (rng() - 0.5) * 0.05);
      const y = (xx: number, zz: number) => (cell === Cell.Cliff || cell === Cell.Wall ? 0.2 : heights[zz * (w + 1) + xx]);
      const v = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]].map(([xx, zz]) => [xx, y(xx, zz), zz]);
      const corners = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]];
      for (const i of [0, 2, 1, 0, 3, 2]) {
        pos.push(...v[i]);
        col.push(c.r, c.g, c.b);
        const o = (corners[i][1] * (w + 1) + corners[i][0]) * 4;
        splat.push(vSplat[o], vSplat[o + 1], vSplat[o + 2], vSplat[o + 3]);
      }
    }
  }
  const groundGeo = new THREE.BufferGeometry();
  groundGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  groundGeo.setAttribute('aSplat', new THREE.Float32BufferAttribute(splat, 4));
  groundGeo.computeVertexNormals();
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  applyGround(groundMat);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  const inst = (geo: THREE.BufferGeometry, mats: THREE.Matrix4[], cols: THREE.Color[] | null, color: number, occlude: boolean, surface?: SurfaceKind) => {
    if (!mats.length) return;
    const mat = new THREE.MeshStandardMaterial({ color: cols ? 0xffffff : color, flatShading: true, roughness: 0.9 });
    if (surface) applySurface(mat, surface, 'world');
    if (occlude) makeOccludable(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((mm, i) => {
      mesh.setMatrixAt(i, mm);
      if (cols) mesh.setColorAt(i, cols[i]);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  // Trees
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1.2, 5).translate(0, 0.6, 0);
  const canopy: Record<ZoneTheme['trees'], THREE.BufferGeometry> = {
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
  const leafPal: Record<ZoneTheme['trees'], number[]> = {
    pine: [0x3f6b34, 0x4b7a3a, 0x355c2e, 0x7a6a2a, 0x8a4a2a],
    grove: [0x5a9a44, 0x6aa84a, 0x4a8a3c, 0xc8a040, 0xb86a8a],
    ash: [0x2a2420, 0x3a3028, 0x1e1a18],
  };
  const trees: THREE.Matrix4[] = [], treeCols: THREE.Color[] = [];
  const rocks: THREE.Matrix4[] = [], rockCols: THREE.Color[] = [];
  const walls: THREE.Matrix4[] = [], wallCols: THREE.Color[] = [];
  const under: THREE.Matrix4[] = [];
  const wallColor = { castle: 0x8a8478, cave: 0x5e5044, ruin: 0x6a7070 }[theme.wall];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const cell = at(x, z);
      if (cell === Cell.Tree) {
        const sc = 0.8 + rng() * 0.6;
        p.set(x + 0.5 + (rng() - 0.5) * 0.3, 0, z + 0.5 + (rng() - 0.5) * 0.3);
        q.setFromEuler(e.set((rng() - 0.5) * 0.1, rng() * Math.PI * 2, (rng() - 0.5) * 0.1));
        s.set(sc, sc * (0.9 + rng() * 0.3), sc);
        trees.push(m.compose(p, q, s).clone());
        const pal = leafPal[theme.trees];
        const tc = new THREE.Color(pal[rng() < 0.15 ? Math.min(pal.length - 1, 3 + Math.floor(rng() * 2)) : Math.floor(rng() * Math.min(3, pal.length))]);
        tc.offsetHSL(0, 0, (rng() - 0.5) * 0.05);
        treeCols.push(tc);
      } else if (cell === Cell.Rock || (cell === Cell.Cliff && rng() < 0.55)) {
        const big = cell === Cell.Cliff;
        const sc = big ? 1.4 + rng() * 1.6 : 0.6 + rng() * 0.7;
        p.set(x + 0.5, big ? 0.2 : 0.1, z + 0.5);
        q.setFromEuler(e.set(rng() * 3, rng() * 3, rng() * 3));
        s.set(sc, sc * (big ? 1.2 + rng() : 0.6 + rng() * 0.4), sc);
        rocks.push(m.compose(p, q, s).clone());
        rockCols.push(new THREE.Color(big ? 0x6a5e52 : 0x8a8478).offsetHSL(0, 0, (rng() - 0.5) * 0.1));
      } else if (cell === Cell.Wall) {
        // Only draw walls that border walkable space; the rest is hidden under fog/darkness.
        let edge = false;
        for (let dz = -1; dz <= 1 && !edge; dz++) for (let dx = -1; dx <= 1; dx++) {
          const n = at(x + dx, z + dz);
          if (n === Cell.Ground || n === Cell.Blocked) edge = true;
        }
        if (!edge) continue;
        const hgt = theme.wall === 'castle' ? 2.4 : theme.wall === 'ruin' ? 1.6 + rng() * 1.8 : 2.6 + rng() * 1.6;
        p.set(x + 0.5, hgt / 2, z + 0.5);
        q.setFromEuler(e.set(0, theme.wall === 'cave' ? rng() * 0.6 : 0, 0));
        s.set(theme.wall === 'cave' ? 1.15 + rng() * 0.3 : 1, hgt, theme.wall === 'cave' ? 1.15 + rng() * 0.3 : 1);
        walls.push(m.compose(p, q, s).clone());
        wallCols.push(new THREE.Color(wallColor).offsetHSL(0, 0, (rng() - 0.5) * 0.08));
      } else if (cell === Cell.Void && theme.ambient === 'void') {
        // Rocky underside beneath the island rim.
        let rim = false;
        for (let dz = -1; dz <= 1 && !rim; dz++) for (let dx = -1; dx <= 1; dx++) {
          const n = at(x + dx, z + dz);
          if (n !== Cell.Void) rim = true;
        }
        if (rim) {
          const depth = 3 + rng() * 5;
          p.set(x + 0.5, -depth / 2 + 0.1, z + 0.5);
          q.setFromEuler(e.set(0, rng() * 3, 0));
          s.set(1.6 + rng(), depth, 1.6 + rng());
          under.push(m.compose(p, q, s).clone());
        }
      }
    }
  }
  inst(trunkGeo, trees, null, theme.trees === 'ash' ? 0x2a2420 : 0x4a3020, true, 'bark');
  inst(canopy[theme.trees], trees, treeCols, 0, true, theme.trees === 'ash' ? 'bark' : 'leaves');
  inst(new THREE.DodecahedronGeometry(0.62, 0), rocks, rockCols, 0, true, 'stone');
  const wallGeo = theme.wall === 'cave' ? new THREE.DodecahedronGeometry(0.7, 0).scale(1, 0.72, 1) : new THREE.BoxGeometry(1, 1, 1);
  inst(wallGeo, walls, wallCols, 0, true, 'stone');
  if (under.length) {
    inst(new THREE.ConeGeometry(0.7, 1, 6).rotateX(Math.PI).translate(0, 0, 0), under, null, 0x4a3e38, false, 'stone');
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
    if (layout.cells[gi] !== Cell.Ground || (g !== Ground.Dirt && g !== Ground.Grass)) continue;
    p.set(x, 0, z);
    q.setFromEuler(e.set((rng() - 0.5) * 0.4, rng() * 3, (rng() - 0.5) * 0.4));
    const sc = 0.7 + rng() * 0.8;
    tufts.push(m.compose(p, q, s.set(sc, sc, sc)).clone());
  }
  inst(tuftGeo, tufts, null, theme.trees === 'grove' ? 0x7aa84a : 0x6f8a3c, false);

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
    const prop = buildProp(pr.kind);
    prop.obj.position.set(pr.x, 0, pr.z);
    prop.obj.rotation.y = pr.rot ?? 0;
    if (pr.s) prop.obj.scale.setScalar(pr.s);
    group.add(prop.obj);
    props.push(prop);
  }
  return { group, followers, props };
}
