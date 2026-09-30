import { blockDisc, Cell, distToSegment, emptyLayout, Ground, makeNoise, mulberry32, type ZoneLayout } from '../world/layout';
import type { Vec2 } from '../types';

export type ZoneKind = 'hub' | 'gather' | 'hunt' | 'quest' | 'lair';

export interface ZoneTheme {
  bg: number;
  fog: [number, number];
  hemi: [number, number, number];
  sun: [number, number];
  exposure: number;
  ambient: 'embers' | 'void' | 'cave' | 'ash' | 'none';
  /** Two shades per ground type, blended with noise. */
  ground: Partial<Record<Ground, [number, number]>>;
  trees: 'pine' | 'ash' | 'grove';
  wall: 'castle' | 'cave' | 'ruin';
  /** Ground texture per ground type (0 dirt, 1 grass, 2 flagstone, 3 rock) when it differs from the default. */
  splat?: Partial<Record<Ground, 0 | 1 | 2 | 3>>;
  /** Glowing lava in the ground's deepest crevices. */
  lava?: number;
}

export interface ZoneDef {
  id: string;
  name: string;
  kind: ZoneKind;
  theme: ZoneTheme;
  build: (seed: number) => ZoneLayout;
  /** Portal-arch colour in the keep. */
  arch: number;
}

// ─── Dragonspire Keep: a floating island in the Veil ────────────────────────

export const KEEP_ARCHES: { id: string; angle: number; dormant?: string }[] = [
  { id: 'mine', angle: -150 },
  { id: 'foothills', angle: -126 },
  { id: 'ruin', angle: -102 },
  { id: 'lair', angle: -78 },
  { id: 'mirefen', angle: -54, dormant: 'Mirefen: Chapter 2' },
  { id: 'frostspire', angle: -30, dormant: 'Frostspire: Chapter 3' },
];

function buildKeep(seed: number): ZoneLayout {
  const rng = mulberry32(seed);
  const noise = makeNoise(rng);
  const w = 60, h = 58;
  const l = emptyLayout(w, h);
  const C = { x: 30, z: 29 };
  const plaza = { x: 30, z: 27, r: 9.5 };
  const paths: [Vec2, Vec2][] = [
    [{ x: 30, z: 50 }, { x: 30, z: 34 }],
    [{ x: 21, z: 28 }, { x: 16, z: 28 }],
    [{ x: 39, z: 28 }, { x: 43, z: 28 }],
    [{ x: 33, z: 35 }, { x: 41, z: 40 }],
    [{ x: 30, z: 18 }, { x: 30, z: 13 }],
  ];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const cx = x + 0.5, cz = z + 0.5;
      const a = Math.atan2(cz - C.z, cx - C.x);
      const edge = 23 + (noise(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + 10) - 0.5) * 7;
      const d = Math.hypot(cx - C.x, cz - C.z);
      if (d > edge) {
        l.cells[i] = Cell.Void;
        continue;
      }
      let dPath = Infinity;
      for (const [p, q] of paths) dPath = Math.min(dPath, distToSegment(cx, cz, p, q));
      const inPlaza = Math.hypot(cx - plaza.x, cz - plaza.z) < plaza.r;
      l.ground[i] = inPlaza || dPath < 1.6 ? Ground.Stone : Ground.Grass;
      // Scatter trees and boulders around the rim of the island.
      if (d > edge - 3.5 && !inPlaza && dPath > 2.5) {
        const r = rng();
        if (r < 0.28) l.cells[i] = Cell.Tree;
        else if (r < 0.36) l.cells[i] = Cell.Rock;
      }
    }
  }
  l.entry = { x: 30, z: 48 };
  l.props.push({ kind: 'landing', x: 30, z: 49 });
  l.props.push({ kind: 'keep_hall', x: 30, z: 10 });
  blockDisc(l, 30, 9, 6.5);
  for (const a of KEEP_ARCHES) {
    const rad = (a.angle * Math.PI) / 180;
    const x = plaza.x + Math.cos(rad) * 7.2, z = plaza.z + Math.sin(rad) * 7.2;
    l.stations.push({ kind: 'portal', id: a.id, x, z, rot: Math.atan2(plaza.x - x, plaza.z - z) });
    blockDisc(l, x, z, 1.1);
  }
  const station = (kind: any, id: string, x: number, z: number, r: number, rot = 0) => {
    l.stations.push({ kind, id, x, z, rot });
    blockDisc(l, x, z, r);
  };
  station('bank', 'bank', 45.5, 28, 2.2, -Math.PI / 2);
  station('furnace', 'furnace', 14.5, 25, 1.5, Math.PI / 2);
  station('anvil', 'anvil', 16.5, 31, 0.9, Math.PI / 2);
  station('shop', 'shop', 43, 41.5, 1.8, -Math.PI * 0.75);
  station('npc', 'quartermaster', 41.2, 40, 0.5, -Math.PI * 0.75);
  station('npc', 'warden', 33.5, 38, 0.5, Math.PI);
  station('restore', 'board', 26.5, 38.5, 0.8, Math.PI * 0.85);
  // Ruined halls: later chapters and restorations.
  station('restore', 'vault_expanded', 48.5, 21.5, 1.8, -Math.PI / 2);
  station('restore', 'alchemy_lab', 15, 15, 2.6, Math.PI / 4);
  station('restore', 'rune_altar', 45, 15, 2.6, -Math.PI / 4);
  station('restore', 'hatchery', 20, 45, 2.4, Math.PI * 0.8);
  station('restore', 'emberforge', 12.5, 31, 1.3, Math.PI / 2);
  // Keep the rim scenery away from anything the player needs to reach.
  for (const st of l.stations) {
    for (let z = Math.floor(st.z - 3.5); z <= st.z + 3.5; z++) for (let x = Math.floor(st.x - 3.5); x <= st.x + 3.5; x++) {
      const i = z * w + x;
      if (x >= 0 && z >= 0 && x < w && z < h && (l.cells[i] === Cell.Tree || l.cells[i] === Cell.Rock)) l.cells[i] = Cell.Ground;
    }
  }
  for (const [x, z] of [[24, 34], [36, 34], [24, 20], [36, 20], [30, 44]]) {
    l.props.push({ kind: 'lamp', x, z });
    blockDisc(l, x, z, 0.4);
  }
  return l;
}

// ─── Emberdeep Mine: safe gathering caves ───────────────────────────────────

function buildMine(seed: number): ZoneLayout {
  const rng = mulberry32(seed);
  const noise = makeNoise(rng);
  const w = 48, h = 50;
  const l = emptyLayout(w, h);
  const rooms = [
    { x: 24, z: 42, r: 5.5 }, // entry
    { x: 12, z: 32, r: 6.5 }, // copper & tin
    { x: 36, z: 31, r: 6.5 }, // iron
    { x: 24, z: 21, r: 5 }, // crossing
    { x: 24, z: 9, r: 7 }, // coal (deep)
  ];
  const tunnels: [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const cx = x + 0.5, cz = z + 0.5;
      const wobble = (noise(cx * 0.25, cz * 0.25) - 0.5) * 2.4;
      let open = false;
      for (const r of rooms) if (Math.hypot(cx - r.x, cz - r.z) < r.r + wobble) open = true;
      for (const [a, b] of tunnels) if (distToSegment(cx, cz, rooms[a], rooms[b]) < 1.6 + wobble * 0.3) open = true;
      l.cells[i] = open ? Cell.Ground : Cell.Wall;
      l.ground[i] = Ground.Cave;
    }
  }
  l.entry = { x: 24, z: 43 };
  l.stations.push({ kind: 'exit', id: 'keep', x: 24, z: 46.5, rot: Math.PI });
  blockDisc(l, 24, 46.5, 1.1);
  l.stations.push({ kind: 'chest', id: 'mine_chest', x: 20.5, z: 43.5, rot: Math.PI / 2 });
  blockDisc(l, 20.5, 43.5, 0.7);
  const ring = (room: (typeof rooms)[number], ores: string[], start: number) => {
    ores.forEach((ore, k) => {
      const a = start + (k / ores.length) * Math.PI * 2;
      for (let rr = room.r - 1.2; rr > 1.5; rr -= 0.5) {
        const x = Math.floor(room.x + Math.cos(a) * rr) + 0.5, z = Math.floor(room.z + Math.sin(a) * rr) + 0.5;
        const i = Math.floor(z) * w + Math.floor(x);
        if (l.cells[i] === Cell.Ground) {
          l.nodes.push({ ore, x, z });
          l.cells[i] = Cell.Blocked;
          break;
        }
      }
    });
  };
  ring(rooms[1], ['copper', 'tin', 'copper', 'tin', 'copper', 'tin', 'copper', 'tin'], 0.3);
  ring(rooms[2], ['iron', 'iron', 'iron', 'iron', 'iron', 'iron'], 0.6);
  ring(rooms[4], ['coal', 'coal', 'iron', 'coal', 'coal', 'coal', 'iron', 'coal'], 0.2);
  for (const r of rooms) l.props.push({ kind: 'lantern', x: r.x + 0.5, z: r.z - r.r + 2.5 });
  for (let k = 0; k < 18; k++) {
    const x = 2 + rng() * (w - 4), z = 2 + rng() * (h - 4);
    const i = Math.floor(z) * w + Math.floor(x);
    if (l.cells[i] === Cell.Ground && Math.hypot(x - 24, z - 43) > 4) {
      l.props.push({ kind: 'crystal', x, z, rot: rng() * 6, s: 0.6 + rng() * 0.6 });
    }
  }
  return l;
}

// ─── Ashen Foothills: the dangerous hunting grounds ─────────────────────────

function buildFoothills(seed: number): ZoneLayout {
  const rng = mulberry32(seed);
  const noise = makeNoise(rng);
  const w = 80, h = 112;
  const l = emptyLayout(w, h);
  const entry = { x: 40, z: 104 };
  const gate = { x: 40, z: 20 };
  const main: Vec2[] = [entry, { x: 34, z: 88 }, { x: 46, z: 74 }, { x: 36, z: 60 }, { x: 50, z: 46 }, { x: 40, z: 34 }, gate];
  const side: [Vec2, Vec2][] = [
    [{ x: 36, z: 60 }, { x: 18, z: 66 }],
    [{ x: 50, z: 46 }, { x: 66, z: 54 }],
    [{ x: 40, z: 34 }, { x: 22, z: 36 }],
  ];
  const segs: [Vec2, Vec2][] = [...side];
  for (let i = 0; i < main.length - 1; i++) segs.push([main[i], main[i + 1]]);

  const areas = [
    { x: 34, z: 88, r: 7, pack: ['goblin', 'goblin', 'goblin', 'goblin', 'goblin'], deco: 'camp' },
    { x: 46, z: 74, r: 6.5, pack: ['goblin', 'goblin', 'kobold', 'kobold'], deco: 'camp' },
    { x: 18, z: 66, r: 6.5, pack: ['kobold', 'kobold', 'kobold', 'kobold', 'goblin'], deco: 'warren' },
    { x: 36, z: 60, r: 6.5, pack: ['drakeling', 'drakeling', 'goblin', 'kobold'], deco: 'ridge' },
    { x: 66, z: 54, r: 6.5, pack: ['drakeling', 'drakeling', 'drakeling', 'kobold'], deco: 'ridge' },
    { x: 50, z: 46, r: 7, pack: ['cultist', 'cultist', 'drakeling', 'drakeling'], deco: 'shrine' },
    { x: 22, z: 36, r: 6.5, pack: ['cultist', 'cultist', 'cultist', 'drakeling', 'drakeling'], deco: 'shrine' },
    { x: 40, z: 34, r: 6, pack: ['drakeling', 'cultist', 'cultist', 'drakeling', 'kobold', 'kobold'], deco: 'ridge' },
  ];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const cx = x + 0.5, cz = z + 0.5;
      let dPath = Infinity;
      for (const [a, b] of segs) dPath = Math.min(dPath, distToSegment(cx, cz, a, b));
      let dArea = Infinity;
      for (const a of areas) dArea = Math.min(dArea, Math.hypot(cx - a.x, cz - a.z) - a.r);
      const dEntry = Math.hypot(cx - entry.x, cz - entry.z);
      if (dPath < 1.7) l.ground[i] = Ground.Path;
      if (dArea < 0) l.ground[i] = Ground.Scorch;

      const border = 3 + Math.floor(noise(x * 0.15, z * 0.15) * 4);
      // North of the gate is sheer cliff: the lair is a separate place.
      if (x < border || z < border || x >= w - border || z >= h - border || z < gate.z - 1) {
        l.cells[i] = Cell.Cliff;
        continue;
      }
      const open = dPath < 2.4 || dArea < 0 || dEntry < 6;
      if (open) continue;
      const margin = Math.min(dPath - 2.4, dArea);
      const density = Math.min(1, Math.max(0.25, margin / 5));
      const n = noise(x * 0.09, z * 0.09);
      const r = rng();
      if (n > 0.6) {
        if (r < 0.8 * density + 0.1) l.cells[i] = Cell.Tree;
      } else if (n > 0.46) {
        if (r < 0.35 * density) l.cells[i] = Cell.Tree;
      } else if (n < 0.28) {
        if (r < 0.22 * density) l.cells[i] = Cell.Rock;
      } else if (r < 0.1 * density) l.cells[i] = Cell.Tree;
      else if (r < 0.14 * density) l.cells[i] = Cell.Rock;
    }
  }
  // Cliff wall with the sealed gate in it.
  for (let x = 0; x < w; x++) for (let z = gate.z - 2; z < gate.z; z++) if (Math.abs(x + 0.5 - gate.x) > 2.5) l.cells[z * w + x] = Cell.Cliff;
  l.stations.push({ kind: 'gate', id: 'lair', x: gate.x, z: gate.z - 0.5, rot: 0 });
  blockDisc(l, gate.x, gate.z - 1, 2.2);

  l.entry = { x: entry.x, z: entry.z - 2 };
  l.stations.push({ kind: 'exit', id: 'keep', x: entry.x, z: entry.z + 2, rot: Math.PI });
  blockDisc(l, entry.x, entry.z + 2, 1.1);

  for (const a of areas) {
    l.packs.push({ x: a.x, z: a.z, comp: a.pack });
    const deco = a.deco;
    const around = (kind: string, n: number, rr: number, s = 1) => {
      for (let k = 0; k < n; k++) {
        const ang = rng() * Math.PI * 2;
        const x = a.x + Math.cos(ang) * rr, z = a.z + Math.sin(ang) * rr;
        l.props.push({ kind, x, z, rot: rng() * 6, s });
        blockDisc(l, x, z, 0.6 * s);
      }
    };
    if (deco === 'camp') {
      around('tent', 2, a.r - 1.5);
      l.props.push({ kind: 'campfire', x: a.x, z: a.z });
      around('crates', 2, a.r - 2);
    } else if (deco === 'warren') around('burrow', 4, a.r - 1.8);
    else if (deco === 'ridge') around('boulder', 3, a.r - 1.2, 1.3);
    else {
      around('pillar', 4, a.r - 1.5);
      l.props.push({ kind: 'brazier', x: a.x + 1.5, z: a.z - 1 });
    }
  }
  // Emberite veins sit in the most dangerous spots.
  for (const [x, z] of [[53.5, 42.5], [19.5, 33.5], [43.5, 31.5], [69.5, 51.5]]) {
    l.nodes.push({ ore: 'emberite', x, z });
    l.cells[Math.floor(z) * w + Math.floor(x)] = Cell.Blocked;
  }
  return l;
}

// ─── Sunken Ruin: quest area for The Cinder Seal ────────────────────────────

function buildRuin(seed: number): ZoneLayout {
  const rng = mulberry32(seed);
  const noise = makeNoise(rng);
  const w = 44, h = 56;
  const l = emptyLayout(w, h);
  const halls = [
    { x: 22, z: 48, r: 5 },
    { x: 11, z: 36, r: 5.5 },
    { x: 33, z: 34, r: 5.5 },
    { x: 22, z: 24, r: 4.5 },
    { x: 22, z: 11, r: 8 },
  ];
  const links: [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const cx = x + 0.5, cz = z + 0.5;
      let open = false;
      for (const r of halls) if (Math.abs(cx - r.x) < r.r && Math.abs(cz - r.z) < r.r) open = true;
      for (const [a, b] of links) if (distToSegment(cx, cz, halls[a], halls[b]) < 1.7) open = true;
      l.cells[i] = open ? Cell.Ground : Cell.Wall;
      l.ground[i] = noise(cx * 0.3, cz * 0.3) > 0.62 ? Ground.Grass : Ground.Stone;
    }
  }
  l.entry = { x: 22, z: 49 };
  l.stations.push({ kind: 'exit', id: 'keep', x: 22, z: 52, rot: Math.PI });
  blockDisc(l, 22, 52, 1.1);
  const ped = (idx: number, x: number, z: number) => {
    l.stations.push({ kind: 'pedestal', id: String(idx), x, z });
    blockDisc(l, x, z, 0.6);
  };
  ped(0, 8, 33);
  ped(1, 36, 31);
  ped(2, 22, 6);
  l.packs.push({ x: 11, z: 37, comp: ['cultist', 'cultist', 'kobold', 'kobold'] });
  l.packs.push({ x: 33, z: 35, comp: ['cultist', 'drakeling', 'drakeling'] });
  l.packs.push({ x: 22, z: 24, comp: ['cultist', 'cultist', 'goblin', 'goblin'] });
  l.packs.push({ x: 22, z: 12, comp: ['cinder_priest', 'cultist', 'cultist'] });
  for (const r of halls) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = r.x + dx * (r.r - 1), z = r.z + dz * (r.r - 1);
      l.props.push({ kind: rng() < 0.4 ? 'pillar_broken' : 'pillar', x, z, rot: rng() * 6 });
      blockDisc(l, x, z, 0.5);
    }
  }
  l.props.push({ kind: 'altar', x: 22, z: 4.5 });
  return l;
}

// ─── Cinderwing's Lair ──────────────────────────────────────────────────────

function buildLair(seed: number): ZoneLayout {
  const rng = mulberry32(seed);
  const noise = makeNoise(rng);
  const w = 48, h = 52;
  const l = emptyLayout(w, h);
  const A = { x: 24, z: 22, r: 15 };
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const cx = x + 0.5, cz = z + 0.5;
      const d = Math.hypot(cx - A.x, cz - A.z);
      const inTunnel = Math.abs(cx - A.x) < 2.2 && cz > A.z && cz < h - 3;
      const edge = A.r + (noise(cx * 0.2, cz * 0.2) - 0.5) * 2;
      l.cells[i] = d < edge || inTunnel ? Cell.Ground : Cell.Cliff;
      l.ground[i] = d < edge ? Ground.Arena : Ground.Path;
    }
  }
  l.entry = { x: 24, z: 44 };
  l.stations.push({ kind: 'exit', id: 'keep', x: 24, z: 47.5, rot: Math.PI });
  blockDisc(l, 24, 47.5, 1.1);
  l.boss = { id: 'cinderwing', x: A.x, z: A.z - 2, r: A.r };
  for (let k = 0; k < 24; k++) {
    const a = rng() * Math.PI * 2, r = 3 + rng() * (A.r - 4);
    l.props.push({ kind: k % 2 ? 'bones' : 'crack', x: A.x + Math.cos(a) * r, z: A.z + Math.sin(a) * r, rot: rng() * 6 });
  }
  l.props.push({ kind: 'hoard', x: A.x - 5, z: A.z - 9 });
  return l;
}

const FOOTHILLS_GROUND: ZoneTheme['ground'] = {
  [Ground.Dirt]: [0x6e6048, 0x5a6a3c], [Ground.Path]: [0x9a8666, 0x8a7656],
  [Ground.Scorch]: [0x5a4a3a, 0x4a3a2e], [Ground.Arena]: [0x3a2a24, 0x5a2a18],
};

export const ZONES: Record<string, ZoneDef> = {
  keep: {
    id: 'keep', name: 'Dragonspire Keep', kind: 'hub', arch: 0xffffff, build: buildKeep,
    theme: {
      bg: 0x0b0a1c, fog: [60, 140], hemi: [0x9a9ad8, 0x4a3a50, 1.25], sun: [0xffd6a8, 2.3], exposure: 1.1,
      ambient: 'void', trees: 'grove', wall: 'castle',
      ground: { [Ground.Grass]: [0x4a7a3a, 0x5a8a44], [Ground.Stone]: [0x8a8478, 0x7a7468] },
    },
  },
  mine: {
    id: 'mine', name: 'Emberdeep Mine', kind: 'gather', arch: 0xffb050, build: buildMine,
    theme: {
      bg: 0x0c0908, fog: [22, 52], hemi: [0xc8b098, 0x4a3828, 1.25], sun: [0xffd0a0, 1.4], exposure: 1.35,
      ambient: 'cave', trees: 'pine', wall: 'cave',
      ground: { [Ground.Cave]: [0x6a5a4a, 0x7a6854] },
    },
  },
  foothills: {
    id: 'foothills', name: 'Ashen Foothills', kind: 'hunt', arch: 0xff6a2a, build: buildFoothills,
    theme: {
      bg: 0x2c2630, fog: [38, 85], hemi: [0xb8c8e8, 0x5a4636, 1.25], sun: [0xffe2b8, 2.6], exposure: 1.05,
      ambient: 'embers', trees: 'pine', wall: 'cave', ground: FOOTHILLS_GROUND,
    },
  },
  ruin: {
    id: 'ruin', name: 'Sunken Ruin', kind: 'quest', arch: 0x6ad0c0, build: buildRuin,
    theme: {
      bg: 0x141a22, fog: [30, 66], hemi: [0xa8c4d8, 0x34443e, 1.35], sun: [0xd8e8ff, 2.1], exposure: 1.2,
      ambient: 'ash', trees: 'grove', wall: 'ruin',
      ground: { [Ground.Stone]: [0x6a7070, 0x5a6060], [Ground.Grass]: [0x3a5a3a, 0x4a6a44] },
    },
  },
  lair: {
    id: 'lair', name: "Cinderwing's Lair", kind: 'lair', arch: 0xff2a1a, build: buildLair,
    theme: {
      bg: 0x1c0a08, fog: [34, 70], hemi: [0xe8b090, 0x4a2418, 1.3], sun: [0xffb07a, 2.6], exposure: 1.2,
      ambient: 'embers', trees: 'ash', wall: 'cave',
      ground: { [Ground.Arena]: [0x5a443c, 0x4a3832], [Ground.Path]: [0x5a4a40, 0x4a3e36] },
      splat: { [Ground.Arena]: 3, [Ground.Path]: 3 },
      lava: 1,
    },
  },
};
