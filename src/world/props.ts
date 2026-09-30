import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelKit, PAL } from '../render/kit';
import { hasModel, makeModel } from '../render/registry';
import { applyFinish } from '../render/env';
import { applySurface, propSurface } from '../render/surface';

export interface Prop {
  obj: THREE.Group;
  /** Per-frame animation (flames, portal swirl…). */
  tick?: (t: number) => void;
  light?: THREE.PointLight;
  /** Swap between states, e.g. ruined/restored or full/depleted. */
  setState?: (state: string) => void;
}

const STONE = 0x8a8478, STONE_D = 0x5e5850, ROOF = 0x4a3a5a, IRON = 0x4a4a52;
const METALS = new Set([IRON, PAL.gold]);

function flame(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number, s = 1) {
  const a = k.cone(g, 0.3 * s, 0.7 * s, [x, y + 0.35 * s, z], PAL.fire, undefined, 5, PAL.fire);
  const b = k.cone(g, 0.18 * s, 0.5 * s, [x, y + 0.35 * s, z], PAL.ember, undefined, 5, PAL.ember);
  return (t: number) => {
    const f = 1 + Math.sin(t * 13 + x) * 0.1 + Math.sin(t * 7.3 + z) * 0.08;
    a.scale.set(1, f, 1);
    b.scale.set(1, 2 - f, 1);
  };
}

function light(g: THREE.Object3D, color: number, intensity: number, dist: number, y: number) {
  const l = new THREE.PointLight(color, intensity, dist, 1.6);
  l.position.set(0, y, 0);
  g.add(l);
  return l;
}

/** Portal arch. `color` null = dormant (no swirl). */
function arch(k: ModelKit, g: THREE.Group, color: number | null): Prop {
  for (const sx of [-1, 1]) {
    k.box(g, [0.55, 3.2, 0.7], [sx * 1.25, 1.6, 0], STONE, undefined, 0, 1);
    k.box(g, [0.7, 0.3, 0.85], [sx * 1.25, 0.15, 0], STONE_D);
    k.box(g, [0.65, 0.25, 0.8], [sx * 1.25, 3.25, 0], STONE_D);
  }
  k.box(g, [3.2, 0.5, 0.8], [0, 3.55, 0], STONE);
  k.box(g, [0.5, 0.5, 0.2], [0, 3.55, 0.42], color ?? 0x3a3a44, [0, 0, Math.PI / 4], color ?? 0, color ? 2 : 1);
  if (color === null) return { obj: g };
  const geo = new THREE.PlaneGeometry(2.0, 3.0, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const plane = new THREE.Mesh(geo, mat);
  plane.position.set(0, 1.7, 0);
  g.add(plane);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.8, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  inner.position.set(0, 1.7, 0.01);
  g.add(inner);
  const l = light(g, color, 8, 7, 1.8);
  return {
    obj: g,
    light: l,
    tick: (t) => {
      mat.opacity = 0.45 + Math.sin(t * 2.2) * 0.12;
      inner.scale.setScalar(1 + Math.sin(t * 3.1) * 0.15);
      inner.rotation.z = t * 0.8;
      l.intensity = 7 + Math.sin(t * 2.2) * 2;
    },
  };
}

function oreRock(k: ModelKit, g: THREE.Group, color: number): Prop {
  const rock = new THREE.Group();
  g.add(rock);
  k.gem(rock, 0.55, [0, 0.4, 0], 0x6a6258);
  k.gem(rock, 0.4, [0.3, 0.3, 0.2], 0x5a5248);
  k.gem(rock, 0.35, [-0.3, 0.25, -0.1], 0x625a50);
  const ore = new THREE.Group();
  g.add(ore);
  for (const [x, y, z] of [[0.1, 0.8, 0.25], [-0.25, 0.55, 0.3], [0.35, 0.5, -0.2], [0, 0.7, -0.3]]) {
    k.gem(ore, 0.13, [x, y, z], color, color, 0.35);
  }
  return {
    obj: g,
    setState: (s) => {
      ore.visible = s !== 'depleted';
      rock.scale.setScalar(s === 'depleted' ? 0.8 : 1);
    },
  };
}

type Builder = (k: ModelKit, g: THREE.Group, arg?: any) => Prop | void;

const BUILDERS: Record<string, Builder> = {
  // ─── Landmarks & world dressing (zone redesign) ───────────────────────────
  /** Plank bridge along local +Z; `arg` = span length in cells. */
  bridge: (k, g, arg) => {
    const len = Math.max(4, arg ?? 6);
    const n = Math.round(len / 0.5);
    for (let i = 0; i < n; i++) {
      const z = -len / 2 + (i + 0.5) * (len / n);
      k.box(g, [2.4, 0.12, len / n - 0.04], [0, 0.02 + Math.sin((i / (n - 1)) * Math.PI) * 0.12, z], i % 3 ? PAL.wood : 0x5a3a20, [0, 0, (i % 2 - 0.5) * 0.02]);
    }
    for (const sx of [-1, 1]) {
      for (let i = 0; i <= Math.floor(len / 2); i++) {
        const z = -len / 2 + i * (len / Math.floor(len / 2));
        k.box(g, [0.14, 1.1, 0.14], [sx * 1.15, -0.1 + Math.sin(((z + len / 2) / len) * Math.PI) * 0.12, z], 0x4a3020);
      }
      k.box(g, [0.1, 0.1, len], [sx * 1.15, 0.72, 0], PAL.wood);
      // Piers going down into the water.
      for (const z of [-len / 2 + 0.3, len / 2 - 0.3]) k.box(g, [0.3, 1.4, 0.3], [sx * 1.1, -0.6, z], 0x3a2618);
    }
  },
  /** Basalt-slab bridge along local +Z (lava crossings); `arg` = span. */
  bridge_stone: (k, g, arg) => {
    const len = Math.max(4, arg ?? 6);
    const n = Math.round(len / 0.9);
    for (let i = 0; i < n; i++) {
      const z = -len / 2 + (i + 0.5) * (len / n);
      k.box(g, [2.8, 0.35, len / n - 0.05], [0, -0.1 + Math.sin((i / Math.max(1, n - 1)) * Math.PI) * 0.18, z], i % 2 ? 0x3a3232 : 0x2e2828);
    }
    for (const sx of [-1, 1]) {
      k.box(g, [0.35, 0.5, len], [sx * 1.4, 0.2, 0], 0x241e1e);
      for (const z of [-len / 2 + 0.4, 0, len / 2 - 0.4]) k.box(g, [0.6, 2, 0.6], [sx * 1.2, -0.9, z], 0x1e1818);
    }
  },
  tower_ruin: (k, g) => {
    // A broken round watchtower: stepped stone courses, one side collapsed, rubble around.
    for (let i = 0; i < 7; i++) {
      const y = i * 0.9 + 0.45;
      const segs = 10;
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        if (i > 2 && a > 0.4 && a < 0.4 + (i - 2) * 0.55) continue; // the breach widens upward
        k.box(g, [1.46, 0.92, 0.85], [Math.cos(a) * 2.2, y, Math.sin(a) * 2.2], i % 2 ? STONE : STONE_D, [0, -a + Math.PI / 2, 0]);
      }
    }
    k.box(g, [2.4, 0.3, 0.3], [0.2, 5.2, -1.2], PAL.wood, [0, 0.4, 0.2]);
    for (let i = 0; i < 9; i++) k.gem(g, 0.35 + (i % 3) * 0.12, [Math.cos(i * 1.3 + 0.8) * (2.8 + (i % 2)), 0.25, Math.sin(i * 1.3 + 0.8) * (2.8 + (i % 2))], STONE_D);
    k.box(g, [0.8, 1.2, 0.08], [0, 3.4, -2.25], 0x7a2020); // tattered banner
  },
  dragon_bones: (k, g) => {
    // A long-dead dragon: spine arc, ribs, skull and a horn, half sunk in the ground.
    const bone = PAL.bone, dark = 0xb8ae98;
    for (let i = 0; i < 16; i++) {
      const z = -7 + i * 0.9;
      const y = Math.sin((i / 15) * Math.PI) * 1.4 + 0.4;
      k.box(g, [0.5, 0.45, 0.7], [0, y, z], i % 2 ? bone : dark, [0.15, 0, 0]);
      if (i > 3 && i < 12) {
        for (const sx of [-1, 1]) {
          k.cone(g, 0.16, 3.2, [sx * 1.3, y - 0.2, z], bone, [0, 0, sx * 2.1], 4);
        }
      }
    }
    k.box(g, [1.3, 1, 2.2], [0.3, 0.55, 8.4], bone, [0.1, 0.3, 0.1]);
    k.box(g, [1.1, 0.4, 1.6], [0.3, 0.2, 9.4], dark, [0.2, 0.3, 0]);
    k.cone(g, 0.25, 1.6, [-0.2, 1.3, 7.6], dark, [-0.9, 0.3, 0.3], 5);
    k.cone(g, 0.25, 1.6, [0.9, 1.3, 7.8], dark, [-0.9, 0.3, -0.3], 5);
    for (let i = 0; i < 8; i++) k.cone(g, 0.12, 1.2 - i * 0.1, [0, 0.2, -7.5 - i * 0.7], bone, [Math.PI / 2 - 0.1, 0, 0], 4);
  },
  standing_stone: (k, g) => {
    k.box(g, [0.9, 3.2, 0.6], [0, 1.4, 0], 0x6e6a66, [0.04, 0, 0.05]);
    k.box(g, [0.7, 0.05, 0.62], [0, 2.2, 0.01], 0x6aa8ff, undefined, 0x3a6ad0, 1.2);
  },
  rails: (k, g, arg) => {
    const len = Math.max(2, arg ?? 6);
    for (const sx of [-0.35, 0.35]) k.box(g, [0.08, 0.1, len], [sx, 0.06, 0], IRON);
    for (let z = -len / 2 + 0.3; z < len / 2; z += 0.7) k.box(g, [1.1, 0.08, 0.22], [0, 0.03, z], PAL.wood);
  },
  minecart: (k, g) => {
    k.box(g, [1, 0.6, 1.4], [0, 0.55, 0], 0x5a4a3a);
    k.box(g, [0.9, 0.2, 1.3], [0, 0.8, 0], 0xb4743a, undefined, 0x3a1a00, 0.3);
    for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) k.cyl(g, 0.18, 0.18, 0.1, [x, 0.2, z], IRON, [0, 0, Math.PI / 2], 8);
  },
  dummy: (k, g) => {
    k.cyl(g, 0.08, 0.08, 1.8, [0, 0.9, 0], PAL.wood);
    k.box(g, [1.2, 0.1, 0.1], [0, 1.4, 0], PAL.wood);
    k.cyl(g, 0.32, 0.36, 0.8, [0, 1.25, 0], 0xc8b070, undefined, 7);
    k.gem(g, 0.24, [0, 1.85, 0], 0xc8b070);
    k.box(g, [0.3, 0.3, 0.06], [0, 1.3, 0.34], 0xa03030);
  },
  palisade: (k, g, arg) => {
    const len = Math.max(2, arg ?? 6);
    for (let x = -len / 2; x <= len / 2; x += 0.42) {
      const hgt = 2 + ((x * 7.3) % 1 + 1) % 1 * 0.5;
      k.cyl(g, 0.2, 0.22, hgt, [x, hgt / 2, 0], 0x5a3a22, [0, 0, ((x * 3.1) % 1) * 0.06], 5);
      k.cone(g, 0.2, 0.4, [x, hgt + 0.2, 0], 0x4a2e18, undefined, 5);
    }
    k.box(g, [len, 0.12, 0.12], [0, 1.2, 0.22], 0x4a2e18);
  },
  signpost: (k, g) => {
    k.cyl(g, 0.07, 0.08, 2.2, [0, 1.1, 0], PAL.wood);
    k.box(g, [1.1, 0.26, 0.06], [0.4, 1.8, 0], 0x8a6a44, [0, 0, 0.08]);
    k.box(g, [0.9, 0.24, 0.06], [-0.3, 1.45, 0.02], 0x8a6a44, [0, 0.4, -0.06]);
  },
  well: (k, g) => {
    k.cyl(g, 0.9, 1, 0.8, [0, 0.4, 0], STONE, undefined, 10);
    k.cyl(g, 0.72, 0.72, 0.05, [0, 0.72, 0], 0x2a5a6a, undefined, 10);
    for (const sx of [-0.8, 0.8]) k.box(g, [0.12, 1.6, 0.12], [sx, 1.4, 0], PAL.wood);
    k.cone(g, 1.3, 0.8, [0, 2.5, 0], ROOF, undefined, 4);
  },
  log: (k, g) => {
    k.cyl(g, 0.3, 0.34, 3, [0, 0.3, 0], 0x4a3020, [0, 0, Math.PI / 2], 7);
    k.cyl(g, 0.28, 0.28, 0.05, [1.52, 0.3, 0], 0xa08058, [0, 0, Math.PI / 2], 7);
    k.gem(g, 0.15, [0.4, 0.62, 0.1], 0x5a8a3a);
  },
  mushrooms: (k, g) => {
    for (let i = 0; i < 5; i++) {
      const x = Math.cos(i * 2.4) * 0.4, z = Math.sin(i * 2.4) * 0.4, s = 0.6 + (i % 3) * 0.25;
      k.cyl(g, 0.04 * s, 0.05 * s, 0.35 * s, [x, 0.17 * s, z], 0xe8dcc0);
      k.cone(g, 0.18 * s, 0.14 * s, [x, 0.38 * s, z], 0xb03a2a, undefined, 7, 0x2a0800);
    }
  },
  obsidian: (k, g) => {
    k.cone(g, 0.8, 4.2, [0, 2.1, 0], 0x1a1418, [0.05, 0, 0.08], 5);
    k.cone(g, 0.5, 2.6, [0.8, 1.3, 0.3], 0x241c22, [-0.2, 0, -0.25], 5);
    k.cone(g, 0.4, 1.8, [-0.6, 0.9, -0.4], 0x1a1418, [0.25, 0, 0.3], 5);
  },
  crystal_big: (k, g) => {
    k.cone(g, 0.5, 2.6, [0, 1.3, 0], 0x7ad0ff, [0.15, 0, 0.1], 5, 0x2a8ad0);
    k.cone(g, 0.35, 1.8, [0.6, 0.9, 0.2], 0x7ad0ff, [-0.3, 0, -0.35], 5, 0x2a8ad0);
    k.cone(g, 0.3, 1.4, [-0.5, 0.7, -0.3], 0xa0e0ff, [0.35, 0, 0.3], 5, 0x2a8ad0);
    return { obj: g, light: light(g, 0x6ac0ff, 10, 9, 1.6) };
  },
  statue: (k, g) => {
    // A weathered dragon-knight statue on a plinth.
    k.box(g, [2, 1, 2], [0, 0.5, 0], STONE_D);
    k.box(g, [0.8, 1.4, 0.5], [0, 1.9, 0], 0x7a7870);
    k.box(g, [0.5, 0.5, 0.5], [0, 2.85, 0], 0x7a7870);
    k.box(g, [0.18, 2.6, 0.14], [0.55, 2.4, 0.2], 0x6a6860, [0, 0, -0.1]);
    k.box(g, [0.5, 1, 0.12], [-0.6, 1.9, 0.3], 0x6a6860, [0, 0.2, 0]);
  },
  landing: (k, g) => {
    // Arrival circle: a stone dais with an inlaid dark floor and two glowing rune rings.
    k.cyl(g, 3, 3.2, 0.25, [0, 0.1, 0], STONE, undefined, 16);
    k.cyl(g, 2.7, 2.7, 0.05, [0, 0.24, 0], 0x2e3240, undefined, 24);
    const glow = 0x6ab0ff;
    for (const [r, t] of [[2.35, 0.05], [1.35, 0.04]]) {
      k.mesh(g, new THREE.TorusGeometry(r, t, 5, 48), 0x9ac8ff, [0, 0.27, 0], [Math.PI / 2, 0, 0], glow, 1.6);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.box(g, [0.34, 0.03, 0.12], [Math.cos(a) * 1.85, 0.27, Math.sin(a) * 1.85], 0x9ac8ff, [0, -a, 0], glow, 1.8);
      k.box(g, [0.08, 0.03, 0.3], [Math.cos(a + 0.2) * 1.85, 0.27, Math.sin(a + 0.2) * 1.85], 0x9ac8ff, [0, -a, 0], glow, 1.8);
    }
    return { obj: g, light: light(g, glow, 2.2, 6, 0.8) };
  },
  keep_hall: (k, g) => {
    // The ruined main hall of Dragonspire Keep.
    k.box(g, [12, 5, 7], [0, 2.5, 0], STONE, undefined);
    k.box(g, [12.4, 0.6, 7.4], [0, 5.2, 0], STONE_D);
    k.box(g, [3, 3.4, 0.4], [0, 1.7, 3.55], 0x2a2018);
    k.box(g, [3.6, 0.5, 0.6], [0, 3.6, 3.6], STONE_D);
    for (const sx of [-1, 1]) {
      k.cyl(g, 1.6, 1.8, 9, [sx * 6.5, 4.5, 0], STONE, undefined, 8);
      k.cone(g, 2.1, 3.2, [sx * 6.5, 10.6, 0], ROOF, undefined, 8);
      k.box(g, [0.4, 1, 0.1], [sx * 6.5, 6, 1.75], 0xffc870, undefined, 0xffa040, 1.5);
    }
    // Collapsed section of roof: the keep is still a ruin.
    k.box(g, [5, 2.2, 3], [-2.5, 6.2, 0], ROOF, [0, 0, 0.35]);
    k.box(g, [1.6, 1, 1.4], [3.8, 0.5, 4.4], STONE_D, [0.3, 0.6, 0.2]);
    k.box(g, [1.1, 0.8, 1], [5, 0.4, 3.6], STONE_D, [0.1, 1.2, 0.4]);
    k.box(g, [2.2, 1.4, 0.2], [-3.2, 3.2, 3.6], 0x6a2020, undefined);
    k.box(g, [2.2, 1.4, 0.2], [3.2, 3.2, 3.6], 0x6a2020, undefined);
  },
  lamp: (k, g) => {
    k.cyl(g, 0.08, 0.1, 2.6, [0, 1.3, 0], IRON);
    k.box(g, [0.34, 0.4, 0.34], [0, 2.7, 0], IRON);
    k.box(g, [0.24, 0.3, 0.24], [0, 2.7, 0], 0xffd080, undefined, 0xffb040, 2.5);
    return { obj: g, light: light(g, 0xffb060, 6, 9, 2.7) };
  },
  bank: (k, g) => {
    k.box(g, [4, 3.2, 3.6], [0, 1.6, 0], STONE);
    k.box(g, [4.4, 0.5, 4], [0, 3.4, 0], STONE_D);
    k.box(g, [1.6, 2.2, 0.2], [0, 1.1, 1.85], IRON);
    k.cyl(g, 0.45, 0.45, 0.12, [0, 1.3, 1.98], PAL.gold, [Math.PI / 2, 0, 0], 10, 0x6a4a00);
    for (const sx of [-1, 1]) k.box(g, [0.5, 3.6, 0.5], [sx * 2.1, 1.8, 1.8], STONE_D);
    k.box(g, [2, 0.5, 0.2], [0, 2.8, 1.9], PAL.gold);
  },
  furnace: (k, g) => {
    k.cyl(g, 1.3, 1.5, 1.6, [0, 0.8, 0], 0x6a5a50, undefined, 8);
    k.cone(g, 1.3, 1.4, [0, 2.3, 0], 0x5a4a40, undefined, 8);
    k.cyl(g, 0.3, 0.35, 1.6, [0.3, 3.2, -0.3], 0x4a3a30, undefined, 6);
    k.box(g, [0.9, 0.7, 0.3], [0, 0.6, 1.3], 0x1a0c08);
    const f = flame(k, g, 0, 0.35, 1.2, 0.9);
    const l = light(g, 0xff7a30, 10, 8, 1);
    l.position.set(0, 1, 1.8);
    return { obj: g, light: l, tick: (t) => { f(t); l.intensity = 9 + Math.sin(t * 11) * 1.5; } };
  },
  anvil: (k, g) => {
    k.cyl(g, 0.45, 0.5, 0.6, [0, 0.3, 0], PAL.wood, undefined, 7);
    k.box(g, [0.9, 0.3, 0.45], [0, 0.75, 0], IRON);
    k.box(g, [0.4, 0.3, 0.3], [0, 0.55, 0], IRON);
    k.cone(g, 0.15, 0.4, [0.62, 0.78, 0], IRON, [0, 0, -Math.PI / 2], 4);
    k.box(g, [0.1, 0.06, 0.5], [-0.3, 0.92, 0.1], 0x3a2a1a, [0, 0.4, 0]);
  },
  shop: (k, g) => {
    k.box(g, [3.2, 1, 1.2], [0, 0.5, 0.4], PAL.wood);
    for (const [x, z] of [[-1.5, -0.6], [1.5, -0.6], [-1.5, 1], [1.5, 1]]) k.cyl(g, 0.07, 0.07, 2.6, [x, 1.3, z], PAL.wood);
    k.box(g, [3.6, 0.12, 2.2], [0, 2.65, 0.2], 0xa03030, [0.18, 0, 0]);
    k.box(g, [0.5, 0.35, 0.35], [-0.8, 1.2, 0.4], 0x6a4a2a);
    k.box(g, [0.3, 0.3, 0.3], [0.5, 1.15, 0.5], 0x3a6aa0);
    k.gem(g, 0.15, [1, 1.2, 0.3], 0xff5a7a, 0xff3a5a, 0.5);
  },
  board: (k, g) => {
    for (const sx of [-1, 1]) k.cyl(g, 0.08, 0.08, 2.2, [sx * 0.8, 1.1, 0], PAL.wood);
    k.box(g, [1.9, 1.2, 0.1], [0, 1.4, 0], PAL.wood);
    k.box(g, [0.5, 0.6, 0.02], [-0.4, 1.45, 0.06], 0xe8dcc0, [0, 0, 0.05]);
    k.box(g, [0.5, 0.5, 0.02], [0.35, 1.35, 0.06], 0xe8dcc0, [0, 0, -0.08]);
    k.box(g, [2.1, 0.12, 0.3], [0, 2.1, 0], 0x4a3a5a);
  },
  ruin: (k, g) => {
    // Generic ruined hall: broken walls and rubble. Restoration swaps to the finished state.
    const ruined = new THREE.Group();
    const built = new THREE.Group();
    g.add(ruined, built);
    k.box(ruined, [4, 2.2, 0.5], [0, 1.1, -1.8], STONE);
    k.box(ruined, [0.5, 1.4, 3.6], [-2, 0.7, 0], STONE);
    k.box(ruined, [0.5, 2.8, 1.6], [2, 1.4, -1], STONE);
    for (let i = 0; i < 6; i++) k.box(ruined, [0.7, 0.5, 0.6], [(i - 3) * 0.7, 0.25, 1 + (i % 2) * 0.6], STONE_D, [0.3 * i, i, 0.2]);
    k.box(built, [4.4, 3, 4], [0, 1.5, 0], STONE);
    k.cone(built, 3.2, 1.8, [0, 3.9, 0], ROOF, [0, Math.PI / 4, 0], 4);
    k.box(built, [1.2, 1.8, 0.2], [0, 0.9, 2.02], 0x3a2418);
    k.box(built, [0.5, 0.5, 0.1], [0, 2.4, 2.02], 0xffc870, undefined, 0xffa040, 1.5);
    return { obj: g, setState: (s) => { ruined.visible = s !== 'restored'; built.visible = s === 'restored'; } };
  },
  forgeheart: (k, g) => {
    const cold = new THREE.Group();
    const hot = new THREE.Group();
    g.add(cold, hot);
    k.cyl(cold, 0.9, 1.1, 0.8, [0, 0.4, 0], STONE_D, undefined, 8);
    k.gem(cold, 0.4, [0, 1, 0], 0x3a3030);
    k.cyl(hot, 0.9, 1.1, 0.8, [0, 0.4, 0], STONE_D, undefined, 8);
    k.gem(hot, 0.45, [0, 1.1, 0], PAL.fire, PAL.fire, 2.5);
    const f = flame(k, hot, 0, 1.1, 0, 1.3);
    return { obj: g, tick: f, setState: (s) => { cold.visible = s !== 'restored'; hot.visible = s === 'restored'; } };
  },
  tent: (k, g) => {
    k.cone(g, 1.5, 2, [0, 1, 0], [0x8a3a2a, 0x6a5a3a, 0x5a4a3a][Math.floor(Math.random() * 3)], undefined, 4);
    k.box(g, [0.5, 1, 0.05], [0, 0.5, 1.05], PAL.black);
  },
  campfire: (k, g) => {
    for (let i = 0; i < 4; i++) k.box(g, [0.18, 0.18, 1.1], [0, 0.1, 0], PAL.wood, [0, (i * Math.PI) / 4, 0]);
    const f = flame(k, g, 0, 0.1, 0, 1);
    const l = light(g, 0xff8a3a, 14, 10, 1.2);
    return { obj: g, light: l, tick: (t) => { f(t); l.intensity = 13 + Math.sin(t * 13) * 2; } };
  },
  crates: (k, g) => {
    k.box(g, [0.8, 0.7, 0.8], [0, 0.35, 0], PAL.wood, [0, 0.3, 0]);
    k.box(g, [0.6, 0.5, 0.6], [0.7, 0.25, 0.3], PAL.leather, [0, -0.2, 0]);
  },
  burrow: (k, g) => {
    k.cyl(g, 0.9, 1.2, 0.5, [0, 0.25, 0], 0x6a5a40, undefined, 7);
    k.cyl(g, 0.45, 0.5, 0.1, [0, 0.5, 0], PAL.black, undefined, 7);
  },
  boulder: (k, g) => {
    k.gem(g, 0.9, [0, 0.5, 0], 0x7a7068);
    k.gem(g, 0.5, [0.7, 0.3, 0.3], 0x6a6058);
  },
  pillar: (k, g) => {
    k.box(g, [0.7, 0.3, 0.7], [0, 0.15, 0], STONE_D);
    k.cyl(g, 0.28, 0.3, 2.6, [0, 1.5, 0], STONE, undefined, 8);
    k.box(g, [0.7, 0.3, 0.7], [0, 2.9, 0], STONE_D);
  },
  pillar_broken: (k, g) => {
    k.box(g, [0.7, 0.3, 0.7], [0, 0.15, 0], STONE_D);
    k.cyl(g, 0.28, 0.3, 1.2, [0, 0.8, 0], STONE, undefined, 8);
    k.cyl(g, 0.28, 0.3, 1.1, [0.8, 0.28, 0.3], STONE, [0, 0.5, Math.PI / 2], 8);
  },
  brazier: (k, g) => {
    k.cyl(g, 0.4, 0.15, 0.9, [0, 0.45, 0], IRON, undefined, 6);
    const f = flame(k, g, 0, 0.9, 0, 0.8);
    const l = light(g, 0xff6a2a, 8, 8, 1.4);
    return { obj: g, light: l, tick: f };
  },
  altar: (k, g) => {
    k.box(g, [3, 1, 1.6], [0, 0.5, 0], STONE_D);
    k.box(g, [3.2, 0.2, 1.8], [0, 1.1, 0], STONE);
    k.box(g, [1, 0.05, 0.8], [0, 1.22, 0], PAL.fire, undefined, PAL.fire, 1.2);
  },
  bones: (k, g) => {
    k.box(g, [0.12, 0.12, 0.9], [0, 0.06, 0], PAL.bone);
    k.gem(g, 0.18, [0.3, 0.12, 0.3], PAL.bone);
  },
  crack: (k, g) => {
    k.box(g, [0.1, 0.03, 1.8], [0, 0.02, 0], PAL.fire, undefined, PAL.fire, 1.5);
  },
  hoard: (k, g) => {
    for (let i = 0; i < 14; i++) k.cyl(g, 0.3, 0.3, 0.05, [Math.sin(i) * 1.2, 0.05 + (i % 4) * 0.08, Math.cos(i * 1.7) * 1], PAL.gold, undefined, 8, 0x5a3a00);
    k.gem(g, 0.2, [0.2, 0.4, 0], 0xe0304a, 0xa01a2a, 0.6);
    k.box(g, [0.8, 0.6, 0.6], [-0.9, 0.3, -0.4], PAL.wood, [0, 0.4, 0]);
  },
  lantern: (k, g) => {
    k.box(g, [0.3, 0.4, 0.3], [0, 2.2, 0], IRON);
    k.box(g, [0.2, 0.28, 0.2], [0, 2.2, 0], 0xffd080, undefined, 0xffb040, 2.5);
    k.cyl(g, 0.05, 0.05, 2.2, [0, 1.1, 0], PAL.wood);
    return { obj: g, light: light(g, 0xffa050, 12, 12, 2.2) };
  },
  crystal: (k, g) => {
    k.cone(g, 0.2, 0.9, [0, 0.45, 0], 0xff8a3a, [0.2, 0, 0.1], 4, 0xff5a1a);
    k.cone(g, 0.14, 0.6, [0.25, 0.3, 0.1], 0xff8a3a, [-0.3, 0, -0.3], 4, 0xff5a1a);
  },
  chest: (k, g) => {
    const on = new THREE.Group();
    g.add(on);
    k.box(on, [1, 0.6, 0.7], [0, 0.3, 0], PAL.wood);
    k.box(on, [1.04, 0.2, 0.74], [0, 0.7, 0], PAL.leather);
    k.box(on, [0.2, 0.2, 0.06], [0, 0.5, 0.37], PAL.gold);
    return { obj: g, setState: (s) => (on.visible = s === 'restored') };
  },
  pedestal: (k, g) => {
    k.cyl(g, 0.45, 0.55, 1, [0, 0.5, 0], STONE, undefined, 6);
    const frag = new THREE.Group();
    g.add(frag);
    k.box(frag, [0.3, 0.06, 0.24], [0, 1.1, 0], 0x3a2a24, [0, 0.4, 0]);
    k.box(frag, [0.14, 0.03, 0.1], [0, 1.14, 0], PAL.fire, [0, 0.4, 0], PAL.fire, 2);
    return { obj: g, setState: (s) => (frag.visible = s !== 'taken'), tick: (t) => (frag.position.y = Math.sin(t * 2) * 0.05) };
  },
  gate: (k, g) => {
    k.box(g, [5, 5, 1.2], [0, 2.5, 0], STONE_D);
    const door = new THREE.Group();
    g.add(door);
    k.box(door, [3, 3.8, 0.4], [0, 1.9, 0.5], IRON);
    const seal = k.cyl(door, 0.8, 0.8, 0.1, [0, 2, 0.75], PAL.fire, [Math.PI / 2, 0, 0], 12, PAL.fire);
    const l = light(g, 0xff5a1a, 6, 8, 2);
    l.position.z = 1.5;
    return {
      obj: g, light: l,
      tick: (t) => ((seal.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + Math.sin(t * 2) * 0.5),
      setState: (s) => {
        door.visible = s !== 'open';
        l.color.setHex(s === 'open' ? 0xff2a1a : 0xff5a1a);
      },
    };
  },
};

/**
 * Merge a kit-built prop's static meshes: within each parent group, unnamed non-glowing meshes
 * sharing a material become one mesh. A palisade drops from ~60 draw calls to 2, a tent camp
 * from dozens to a handful. Groups toggled by setState and emissive parts animated by tick
 * (flames, seals) stay separate, so behaviour is unchanged.
 */
function mergeStatic(root: THREE.Object3D) {
  const parents = new Set<THREE.Object3D>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.parent && !o.children.length) parents.add(o.parent);
  });
  for (const parent of parents) {
    const groups = new Map<THREE.Material, THREE.Mesh[]>();
    for (const c of parent.children) {
      if (!(c instanceof THREE.Mesh) || c.children.length || c.name || Array.isArray(c.material)) continue;
      const m = c.material;
      if (!(m instanceof THREE.MeshStandardMaterial) || (m.emissive.getHex() !== 0 && m.emissiveIntensity > 0)) continue;
      const list = groups.get(m) ?? [];
      list.push(c);
      groups.set(m, list);
    }
    for (const [mat, meshes] of groups) {
      if (meshes.length < 2) continue;
      const merged = mergeGeometries(meshes.map((m) => {
        m.updateMatrix();
        let geo = m.geometry.clone().applyMatrix4(m.matrix);
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
        if (geo.index) geo = geo.toNonIndexed();
        return geo;
      }));
      if (!merged) continue;
      for (const m of meshes) m.removeFromParent();
      parent.add(new THREE.Mesh(merged, mat));
    }
  }
}

/** Build a prop by kind. GLB `prop_<kind>` overrides the placeholder when present. */
export function buildProp(kind: string, arg?: any): Prop {
  if (hasModel(`prop_${kind}`)) {
    const m = makeModel(`prop_${kind}`);
    const g = new THREE.Group();
    g.add(m.root);
    return { obj: g };
  }
  const k = new ModelKit();
  const g = new THREE.Group();
  let res: Prop | void;
  if (kind === 'arch') res = arch(k, g, arg ?? null);
  else if (kind.startsWith('rock_')) res = oreRock(k, g, arg ?? 0x888888);
  else res = BUILDERS[kind]?.(k, g, arg);
  mergeStatic(g);
  for (const m of k.mats) {
    // Iron and gold fittings shine; grey masonry gets a gentle stone detail (lined up in world
    // space); everything else stays clean flat colour.
    if (METALS.has(m.color.getHex())) applyFinish(m, 'metal');
    else if (m.emissive.getHex() === 0 || m.emissiveIntensity === 0) {
      const surface = propSurface(m.color);
      if (surface) applySurface(m, surface, 'world');
    }
  }
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return res ?? { obj: g };
}
