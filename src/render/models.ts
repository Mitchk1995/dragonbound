import * as THREE from 'three';
import { ModelKit, PAL, ROLE, type Model } from './kit';

/*
 * Code-built placeholder models. They follow docs/ART_CONTRACT.md exactly (part names,
 * sockets, role materials) so Blender-exported .glb files replace them one for one.
 * Models face +Z; a +Z-facing character's right hand is at -X.
 */

const PI = Math.PI;

function humanoidArm(k: ModelKit, parent: THREE.Object3D, name: string, x: number, y: number, sleeve: number, hand: number, len = 0.55) {
  const arm = k.pivot(parent, name, [x, y, 0]);
  k.box(arm, [0.22, len, 0.24], [0, -len / 2, 0], sleeve);
  k.box(arm, [0.26, 0.24, 0.26], [0, -len - 0.08, 0], hand);
  return arm;
}

function humanoidLeg(k: ModelKit, parent: THREE.Object3D, name: string, x: number, hipY: number, pants: number, boot: number, len = 0.62) {
  const leg = k.pivot(parent, name, [x, hipY, 0]);
  k.box(leg, [0.28, len, 0.3], [0, -len / 2, 0], pants);
  k.box(leg, [0.34, 0.24, 0.44], [0, -hipY + 0.12, 0.06], boot);
  return leg;
}

const model = (k: ModelKit, root: THREE.Group, height: number): Model => ({ root, mats: k.mats, height });

/** Hero base: plain clothes, sockets for gear/hair. */
export function buildHero(): Model {
  const k = new ModelKit();
  const root = new THREE.Group();
  const hip = 0.9;
  for (const [name, x] of [['legL', 0.19], ['legR', -0.19]] as const) {
    const leg = humanoidLeg(k, root, name, x, hip, ROLE.cloth2, ROLE.leather);
    k.pivot(leg, name === 'legL' ? 'sock_footL' : 'sock_footR', [0, -hip + 0.14, 0.05]);
  }
  const body = k.pivot(root, 'body', [0, hip, 0]);
  k.box(body, [0.64, 0.18, 0.4], [0, 0.04, 0], ROLE.leather);
  k.box(body, [0.72, 0.64, 0.42], [0, 0.44, 0], ROLE.cloth);
  k.box(body, [0.3, 0.3, 0.06], [0, 0.56, 0.2], ROLE.cloth2);
  k.pivot(body, 'sock_chest', [0, 0.44, 0]);
  k.pivot(body, 'sock_shoulderL', [0.46, 0.72, 0]);
  k.pivot(body, 'sock_shoulderR', [-0.46, 0.72, 0]);
  const head = k.pivot(body, 'head', [0, 0.78, 0]);
  k.box(head, [0.46, 0.46, 0.46], [0, 0.24, 0], ROLE.skin);
  k.box(head, [0.08, 0.09, 0.02], [-0.1, 0.27, 0.235], PAL.black);
  k.box(head, [0.08, 0.09, 0.02], [0.1, 0.27, 0.235], PAL.black);
  k.pivot(head, 'sock_head', [0, 0.24, 0]);
  const armL = humanoidArm(k, body, 'armL', 0.47, 0.62, ROLE.cloth, ROLE.skin);
  k.pivot(armL, 'sock_handL', [0, -0.63, 0]);
  const armR = humanoidArm(k, body, 'armR', -0.47, 0.62, ROLE.cloth, ROLE.skin);
  k.pivot(armR, 'sock_gloveR', [0, -0.63, 0]);
  k.pivot(armR, 'sock_handR', [0, -0.66, 0.04], [PI / 2, 0, 0]);
  return model(k, root, 2.1);
}

export function buildGoblin(): Model {
  const k = new ModelKit();
  const root = new THREE.Group();
  const hip = 0.55;
  humanoidLeg(k, root, 'legL', 0.15, hip, PAL.goblinDark, PAL.leatherDark, 0.4);
  humanoidLeg(k, root, 'legR', -0.15, hip, PAL.goblinDark, PAL.leatherDark, 0.4);
  const body = k.pivot(root, 'body', [0, hip, 0]);
  k.box(body, [0.56, 0.2, 0.36], [0, 0.02, 0], PAL.leather);
  k.box(body, [0.6, 0.5, 0.4], [0, 0.34, 0.02], PAL.goblin, [0.2, 0, 0]);
  const head = k.pivot(body, 'head', [0, 0.62, 0.1]);
  k.box(head, [0.56, 0.46, 0.5], [0, 0.2, 0], PAL.goblin);
  k.box(head, [0.14, 0.2, 0.16], [0, 0.14, 0.3], PAL.goblinDark);
  for (const s of [-1, 1]) {
    k.cone(head, 0.1, 0.46, [s * 0.4, 0.3, -0.02], PAL.goblin, [0, 0, -s * 1.3], 4);
    k.box(head, [0.1, 0.08, 0.02], [s * 0.13, 0.26, 0.255], PAL.eye, undefined, PAL.eye, 1.2);
  }
  humanoidArm(k, body, 'armL', 0.38, 0.5, PAL.goblin, PAL.goblinDark, 0.42);
  const armR = humanoidArm(k, body, 'armR', -0.38, 0.5, PAL.goblin, PAL.goblinDark, 0.42);
  const weapon = k.pivot(armR, 'weapon', [0, -0.5, 0.04], [PI / 2, 0, 0]);
  k.cyl(weapon, 0.07, 0.05, 0.8, [0, 0.35, 0], PAL.wood);
  k.gem(weapon, 0.16, [0, 0.72, 0], PAL.wood);
  return model(k, root, 1.4);
}

export function buildKobold(): Model {
  const k = new ModelKit();
  const root = new THREE.Group();
  const hip = 0.5;
  humanoidLeg(k, root, 'legL', 0.14, hip, PAL.koboldDark, PAL.koboldDark, 0.36);
  humanoidLeg(k, root, 'legR', -0.14, hip, PAL.koboldDark, PAL.koboldDark, 0.36);
  const body = k.pivot(root, 'body', [0, hip, 0]);
  k.box(body, [0.46, 0.5, 0.36], [0, 0.26, 0], PAL.kobold, [0.15, 0, 0]);
  const t1 = k.pivot(body, 'tail1', [0, 0.05, -0.2]);
  k.box(t1, [0.16, 0.14, 0.4], [0, 0, -0.2], PAL.kobold, [-0.3, 0, 0]);
  const t2 = k.pivot(t1, 'tail2', [0, -0.1, -0.38]);
  k.box(t2, [0.1, 0.1, 0.36], [0, 0, -0.18], PAL.koboldDark, [-0.2, 0, 0]);
  const head = k.pivot(body, 'head', [0, 0.54, 0.06]);
  k.box(head, [0.4, 0.34, 0.38], [0, 0.16, 0], PAL.kobold);
  k.box(head, [0.26, 0.2, 0.34], [0, 0.1, 0.3], PAL.kobold);
  humanoidArm(k, body, 'armL', 0.3, 0.42, PAL.kobold, PAL.koboldDark, 0.36);
  const armR = humanoidArm(k, body, 'armR', -0.3, 0.42, PAL.kobold, PAL.koboldDark, 0.36);
  const weapon = k.pivot(armR, 'weapon', [0, -0.44, 0], [PI / 2, 0, 0]);
  k.box(weapon, [0.12, 0.1, 0.1], [0, 0.42, 0], PAL.leatherDark);
  return model(k, root, 1.2);
}

export function buildCultist(): Model {
  const k = new ModelKit();
  const root = new THREE.Group();
  const body = k.pivot(root, 'body', [0, 0, 0]);
  k.cyl(body, 0.3, 0.55, 1.2, [0, 0.6, 0], PAL.robe, undefined, 7);
  k.box(body, [0.64, 0.3, 0.5], [0, 1.28, 0], PAL.robe);
  const head = k.pivot(body, 'head', [0, 1.42, 0]);
  k.cone(head, 0.34, 0.7, [0, 0.3, -0.04], PAL.robeDark, undefined, 6);
  k.box(head, [0.34, 0.26, 0.1], [0, 0.16, 0.2], PAL.black);
  for (const [name, x] of [['armL', 0.4], ['armR', -0.4]] as const) {
    const a = k.pivot(body, name, [x, 1.32, 0]);
    k.box(a, [0.24, 0.6, 0.26], [0, -0.3, 0], PAL.robe);
    k.gem(a, 0.13, [0, -0.66, 0], PAL.fire, PAL.fire, 1.8);
    if (name === 'armR') {
      const w = k.pivot(a, 'weapon', [0, -0.66, 0]);
      k.cyl(w, 0.04, 0.05, 1.7, [0, 0.2, 0], PAL.black);
    }
  }
  return model(k, root, 2.0);
}

interface DragonOpts {
  scale: number;
  main: number;
  dark: number;
  belly: number;
  glow: number;
  neck: number;
  tail: number;
  wingSpan: number;
}

/** Quadruped dragon; used for drakelings, Cinderwing and the Ember Whelp pet. */
export function buildDragon(o: DragonOpts): Model {
  const k = new ModelKit();
  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(o.scale);
  root.add(inner);
  const legH = 0.62;
  for (const [name, x, z] of [['legFL', 0.38, 0.42], ['legFR', -0.38, 0.42], ['legBL', 0.4, -0.45], ['legBR', -0.4, -0.45]] as const) {
    const leg = k.pivot(inner, name, [x, legH + 0.08, z]);
    k.box(leg, [0.26, 0.5, 0.3], [0, -0.22, 0], o.main);
    k.box(leg, [0.3, 0.1, 0.36], [0, -0.68, 0.1], o.dark);
  }
  const body = k.pivot(inner, 'body', [0, legH + 0.3, 0]);
  k.box(body, [0.9, 0.7, 1.3], [0, 0.05, 0], o.main);
  k.box(body, [0.7, 0.2, 1.1], [0, -0.32, 0.05], o.belly);
  let parent: THREE.Object3D = body;
  let z = 0.8;
  let y = 0.3;
  for (let i = 1; i <= o.neck; i++) {
    const n = k.pivot(parent, `neck${i}`, [0, y, z], [-0.35, 0, 0]);
    k.box(n, [0.4, 0.4, 0.44], [0, 0, 0.18], o.main);
    parent = n;
    z = 0.4;
    y = 0;
  }
  const head = k.pivot(parent, 'head', [0, 0.02, 0.42], [0.4, 0, 0]);
  k.box(head, [0.5, 0.4, 0.5], [0, 0.08, 0.1], o.main);
  k.box(head, [0.38, 0.22, 0.5], [0, 0.04, 0.5], o.main);
  const jaw = k.pivot(head, 'jaw', [0, -0.1, 0.24]);
  k.box(jaw, [0.34, 0.1, 0.46], [0, -0.04, 0.22], o.belly);
  parent = body;
  z = -0.62;
  for (let i = 1; i <= o.tail; i++) {
    const t = k.pivot(parent, `tail${i}`, [0, 0, z], [i === 1 ? 0.2 : 0.05, 0, 0]);
    const w = Math.max(0.1, 0.46 - i * 0.07);
    k.box(t, [w, w, 0.5], [0, 0, -0.24], o.main);
    parent = t;
    z = -0.48;
  }
  for (const sx of [1, -1]) {
    const wing = k.pivot(body, sx > 0 ? 'wingL' : 'wingR', [sx * 0.4, 0.36, 0.3], [0, 0, sx * 0.35]);
    const span = o.wingSpan;
    k.box(wing, [span, 0.08, 0.1], [sx * span / 2, 0.02, 0], o.dark);
    k.membrane(wing, [[0, 0], [sx * span, 0], [sx * span * 1.15, -span * 0.65], [sx * 0.1, -0.7]], 0x7a2418);
  }
  return model(k, root, (legH + 1.2) * o.scale);
}

export const buildDrakeling = () =>
  buildDragon({ scale: 0.8, main: PAL.drake, dark: PAL.drakeDark, belly: PAL.belly, glow: PAL.fire, neck: 2, tail: 3, wingSpan: 0.8 });
export const buildCinderwing = () =>
  buildDragon({ scale: 2.4, main: 0x8e2618, dark: 0x3c1410, belly: 0xe08a3a, glow: PAL.fire, neck: 3, tail: 5, wingSpan: 2.0 });
export const buildWhelp = () =>
  buildDragon({ scale: 0.42, main: 0xff8a2a, dark: 0xb04a14, belly: 0xffd070, glow: 0xffe070, neck: 2, tail: 3, wingSpan: 0.9 });

/** Pebble the rock golem (mining pet). */
export function buildGolem(): Model {
  const k = new ModelKit();
  const root = new THREE.Group();
  for (const [name, x] of [['legL', 0.14], ['legR', -0.14]] as const) {
    const l = k.pivot(root, name, [x, 0.25, 0]);
    k.box(l, [0.18, 0.25, 0.2], [0, -0.12, 0], 0x6a6258);
  }
  const body = k.pivot(root, 'body', [0, 0.25, 0]);
  k.gem(body, 0.3, [0, 0.25, 0], 0x7a7266);
  k.gem(body, 0.08, [0.1, 0.35, 0.22], PAL.fire, PAL.fire, 2);
  const head = k.pivot(body, 'head', [0, 0.5, 0.05]);
  k.box(head, [0.26, 0.22, 0.24], [0, 0.1, 0], 0x8a8276);
  k.box(head, [0.05, 0.05, 0.02], [0.06, 0.12, 0.125], PAL.eye, undefined, PAL.eye, 2);
  k.box(head, [0.05, 0.05, 0.02], [-0.06, 0.12, 0.125], PAL.eye, undefined, PAL.eye, 2);
  for (const [name, x] of [['armL', 0.3], ['armR', -0.3]] as const) {
    const a = k.pivot(body, name, [x, 0.35, 0]);
    k.box(a, [0.14, 0.3, 0.14], [0, -0.15, 0], 0x6a6258);
  }
  return model(k, root, 0.8);
}

function npc(robe: number, trim: number, hood: boolean, beard: number | null): Model {
  const k = new ModelKit();
  const root = new THREE.Group();
  const hip = 0.9;
  humanoidLeg(k, root, 'legL', 0.19, hip, robe, PAL.leatherDark);
  humanoidLeg(k, root, 'legR', -0.19, hip, robe, PAL.leatherDark);
  const body = k.pivot(root, 'body', [0, hip, 0]);
  k.cyl(body, 0.36, 0.46, 0.9, [0, 0.2, 0], robe, undefined, 8);
  k.box(body, [0.74, 0.62, 0.44], [0, 0.44, 0], robe);
  k.box(body, [0.12, 0.6, 0.06], [0, 0.44, 0.23], trim);
  const head = k.pivot(body, 'head', [0, 0.78, 0]);
  k.box(head, [0.46, 0.46, 0.46], [0, 0.24, 0], PAL.skin);
  k.box(head, [0.08, 0.09, 0.02], [-0.1, 0.27, 0.235], PAL.black);
  k.box(head, [0.08, 0.09, 0.02], [0.1, 0.27, 0.235], PAL.black);
  if (beard !== null) k.box(head, [0.4, 0.36, 0.14], [0, 0.02, 0.22], beard);
  if (hood) k.cone(head, 0.4, 0.7, [0, 0.46, -0.04], robe, undefined, 6);
  humanoidArm(k, body, 'armL', 0.47, 0.62, robe, PAL.skin);
  const armR = humanoidArm(k, body, 'armR', -0.47, 0.62, robe, PAL.skin);
  const w = k.pivot(armR, 'weapon', [0, -0.66, 0.04]);
  if (hood) {
    k.cyl(w, 0.05, 0.06, 2.0, [0, 0.4, 0], PAL.wood);
    k.gem(w, 0.14, [0, 1.45, 0], PAL.arcane, PAL.arcane, 2);
  }
  return model(k, root, 2.2);
}

export const buildWarden = () => npc(0x3a4a6a, PAL.gold, true, 0xd8d8d0);
export const buildQuartermaster = () => npc(0x6a4a2a, 0xc8a060, false, 0x6a3a1a);

export const MODEL_BUILDERS: Record<string, () => Model> = {
  hero: buildHero,
  goblin: buildGoblin,
  kobold: buildKobold,
  cultist: buildCultist,
  drakeling: buildDrakeling,
  cinderwing: buildCinderwing,
  whelp: buildWhelp,
  golem: buildGolem,
  warden: buildWarden,
  quartermaster: buildQuartermaster,
};

// ─── Placeholder gear (same socket contract as gear_*.glb) ──────────────────

function gear(build: (k: ModelKit, sock: (name: string) => THREE.Group) => void) {
  return () => {
    const k = new ModelKit();
    const root = new THREE.Group();
    build(k, (name) => {
      const g = new THREE.Group();
      g.name = name;
      root.add(g);
      return g;
    });
    return root;
  };
}

export const PLACEHOLDER_GEAR: Record<string, () => THREE.Group> = {
  sword: gear((k, s) => {
    const h = s('sock_handR');
    k.cyl(h, 0.05, 0.05, 0.3, [0, 0, 0], ROLE.leather);
    k.box(h, [0.42, 0.08, 0.12], [0, 0.17, 0], ROLE.trim);
    k.box(h, [0.14, 0.95, 0.05], [0, 0.68, 0], ROLE.metal);
  }),
  longsword: gear((k, s) => {
    const h = s('sock_handR');
    k.cyl(h, 0.05, 0.05, 0.4, [0, 0, 0], ROLE.leather);
    k.box(h, [0.56, 0.1, 0.14], [0, 0.22, 0], ROLE.trim);
    k.box(h, [0.18, 1.35, 0.06], [0, 0.95, 0], ROLE.metal);
  }),
  pickaxe: gear((k, s) => {
    const h = s('sock_handR');
    k.cyl(h, 0.045, 0.05, 1.0, [0, 0.35, 0], PAL.wood);
    k.box(h, [0.7, 0.12, 0.12], [0, 0.82, 0], ROLE.metal, [0, 0, 0.1]);
    k.cone(h, 0.07, 0.2, [0.42, 0.78, 0], ROLE.metal, [0, 0, -PI / 2 - 0.3], 4);
    k.cone(h, 0.07, 0.2, [-0.42, 0.86, 0], ROLE.metal, [0, 0, PI / 2 + 0.1], 4);
  }),
  bow: gear((k, s) => {
    const h = s('sock_handR');
    const b = k.pivot(h, 'bowbody', [0, 0, 0], [-PI / 2, 0, 0]);
    k.box(b, [0.08, 0.7, 0.08], [0, 0.4, 0.12], ROLE.metal, [-0.35, 0, 0]);
    k.box(b, [0.08, 0.7, 0.08], [0, -0.4, 0.12], ROLE.metal, [0.35, 0, 0]);
    k.box(b, [0.1, 0.2, 0.1], [0, 0, 0.02], ROLE.dark);
    k.box(b, [0.02, 1.36, 0.02], [0, 0, -0.03], ROLE.trim);
  }),
  staff: gear((k, s) => {
    const h = s('sock_handR');
    const b = k.pivot(h, 'staffbody', [0, 0, 0], [-PI / 2, 0, 0]);
    k.cyl(b, 0.06, 0.07, 1.9, [0, 0.35, 0], ROLE.metal);
    k.box(b, [0.24, 0.1, 0.1], [0, 1.28, 0], ROLE.dark);
    k.gem(b, 0.17, [0, 1.46, 0], ROLE.glow);
  }),
  helm_open: gear((k, s) => {
    const h = s('sock_head');
    k.box(h, [0.54, 0.24, 0.54], [0, 0.2, 0], ROLE.metal);
    k.box(h, [0.56, 0.06, 0.56], [0, 0.1, 0], ROLE.trim);
    k.box(h, [0.08, 0.24, 0.06], [0, 0.04, 0.26], ROLE.metal);
  }),
  helm_full: gear((k, s) => {
    const h = s('sock_head');
    k.box(h, [0.56, 0.58, 0.56], [0, 0.04, 0], ROLE.metal);
    k.box(h, [0.4, 0.05, 0.04], [0, 0.04, 0.29], PAL.black);
    k.box(h, [0.08, 0.2, 0.4], [0, 0.38, 0], ROLE.trim);
  }),
  body_chain: gear((k, s) => {
    k.box(s('sock_chest'), [0.78, 0.7, 0.48], [0, 0, 0], ROLE.metal);
    k.box(s('sock_chest'), [0.8, 0.06, 0.5], [0, -0.32, 0], ROLE.dark);
    k.box(s('sock_shoulderL'), [0.26, 0.18, 0.4], [0.02, 0, 0], ROLE.metal);
    k.box(s('sock_shoulderR'), [0.26, 0.18, 0.4], [-0.02, 0, 0], ROLE.metal);
  }),
  body_plate: gear((k, s) => {
    const c = s('sock_chest');
    k.box(c, [0.8, 0.72, 0.5], [0, 0, 0], ROLE.metal);
    k.box(c, [0.6, 0.44, 0.08], [0, 0.06, 0.26], ROLE.trim);
    for (const [name, sx] of [['sock_shoulderL', 1], ['sock_shoulderR', -1]] as const) {
      const sh = s(name);
      k.box(sh, [0.38, 0.24, 0.52], [sx * 0.04, 0.02, 0], ROLE.metal, [0, 0, sx * -0.25]);
      k.box(sh, [0.4, 0.06, 0.54], [sx * 0.04, -0.08, 0], ROLE.trim, [0, 0, sx * -0.25]);
    }
  }),
  gloves: gear((k, s) => {
    for (const name of ['sock_handL', 'sock_gloveR']) {
      const g = s(name);
      k.box(g, [0.3, 0.28, 0.3], [0, 0, 0], ROLE.metal);
      k.box(g, [0.32, 0.1, 0.32], [0, 0.18, 0], ROLE.trim);
    }
  }),
  boots: gear((k, s) => {
    for (const name of ['sock_footL', 'sock_footR']) {
      const g = s(name);
      k.box(g, [0.38, 0.3, 0.48], [0, 0, 0.02], ROLE.metal);
      k.box(g, [0.4, 0.08, 0.36], [0, 0.18, -0.02], ROLE.trim);
    }
  }),
  hair_1: gear((k, s) => k.box(s('sock_head'), [0.5, 0.12, 0.5], [0, 0.26, -0.02], ROLE.hair)),
  hair_2: gear((k, s) => {
    k.box(s('sock_head'), [0.5, 0.14, 0.52], [0, 0.26, -0.02], ROLE.hair);
    k.box(s('sock_head'), [0.48, 0.3, 0.1], [0, 0.08, -0.24], ROLE.hair);
  }),
  hair_3: gear((k, s) => {
    k.box(s('sock_head'), [0.5, 0.14, 0.52], [0, 0.26, -0.02], ROLE.hair);
    k.box(s('sock_head'), [0.16, 0.5, 0.12], [0, -0.1, -0.3], ROLE.hair);
  }),
  hair_4: gear((k, s) => {
    k.box(s('sock_head'), [0.58, 0.2, 0.58], [0, 0.26, -0.02], ROLE.hair);
    k.box(s('sock_head'), [0.56, 0.44, 0.14], [0, 0.0, -0.26], ROLE.hair);
  }),
  beard_1: gear((k, s) => k.box(s('sock_head'), [0.42, 0.14, 0.06], [0, -0.14, 0.23], ROLE.hair)),
  beard_2: gear((k, s) => k.box(s('sock_head'), [0.44, 0.3, 0.14], [0, -0.16, 0.22], ROLE.hair)),
  beard_3: gear((k, s) => {
    k.box(s('sock_head'), [0.44, 0.26, 0.14], [0, -0.14, 0.22], ROLE.hair);
    k.box(s('sock_head'), [0.12, 0.3, 0.1], [0, -0.4, 0.26], ROLE.hair);
  }),
};

// ─── Material item models (ground loot + icons) ─────────────────────────────

export { buildMaterialModel } from './materialModels';
