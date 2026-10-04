import type { Vec2 } from '../../types';
import { Gen, distToPoly, pointAt } from '../../world/gen';
import { blockDisc, Cell, Fluid, Ground, type ZoneLayout } from '../../world/layout';

// ─── Emberdeep Mine: a cave network (safe gathering) ────────────────────────

export function buildMine(seed: number): ZoneLayout {
  const w = 120, h = 120;
  const G = new Gen(w, h, seed, Cell.Wall, Ground.Cave);
  // Caverns are lobed (a few overlapping chambers of different sizes), strung on winding tunnels
  // with two loops (entry ↔ copper gallery ↔ tin pocket, and hall ↔ iron works ↔ grotto ↔ deep
  // workings) and a couple of dead-end pockets. Ore runs in veins along the cavern walls.
  type Lobe = [number, number, number];
  const caverns: Record<string, { x: number; z: number; r: number; lobes: Lobe[] }> = {
    entry: { x: 60, z: 104, r: 7, lobes: [[60, 104, 7], [53.5, 100, 4.5], [66.5, 107.5, 3.8]] },
    hall: { x: 57, z: 75, r: 11, lobes: [[57, 76, 10.5], [67.5, 70, 7.5], [47.5, 69, 6], [52, 85, 4.5]] },
    west: { x: 27, z: 65, r: 8, lobes: [[27, 66, 7.5], [21, 74, 5.5], [33, 58, 4.5]] },
    tin: { x: 21, z: 92, r: 6, lobes: [[20, 91, 5.5], [27, 96, 4.2], [15, 97, 3.5]] },
    east: { x: 94, z: 61, r: 8, lobes: [[94, 61, 8], [101, 69, 5.5], [88, 53, 4.5]] },
    east2: { x: 101, z: 89, r: 5.5, lobes: [[101, 88, 5.5], [95, 93, 4]] },
    deep: { x: 57, z: 29, r: 10, lobes: [[58, 30, 10], [45.5, 25, 6.5], [68, 37, 5.5], [62, 20, 5]] },
    grotto: { x: 98, z: 22, r: 6.5, lobes: [[98, 22, 6.5], [104, 28, 3.8]] },
  };
  const tunnels: Vec2[][] = [
    [{ x: 58, z: 98 }, { x: 55, z: 92 }, { x: 53, z: 86 }],
    [{ x: 43, z: 69 }, { x: 37, z: 64 }, { x: 33, z: 64 }],
    [{ x: 22, z: 78 }, { x: 17, z: 84 }, { x: 19, z: 88 }],
    [{ x: 29, z: 97 }, { x: 38, z: 101 }, { x: 49, z: 100 }],
    [{ x: 74, z: 70 }, { x: 81, z: 64 }, { x: 87, z: 61 }],
    [{ x: 102, z: 74 }, { x: 105, z: 80 }, { x: 102, z: 84 }],
    [{ x: 58, z: 65 }, { x: 61, z: 55 }, { x: 57, z: 46 }, { x: 60, z: 40 }],
    [{ x: 88, z: 50 }, { x: 94, z: 40 }, { x: 99, z: 30 }],
    [{ x: 72, z: 36 }, { x: 80, z: 30 }, { x: 88, z: 22 }, { x: 93, z: 21 }],
  ];
  const tunnelPolys = tunnels.map((t, i) => G.road(t, i === 3 || i === 8 ? 3.2 : 4.0, Ground.Cave, 0.7));
  for (const c of Object.values(caverns)) for (const [x, z, r] of c.lobes) G.clearing(x, z, r, Ground.Cave, 2.0);
  // The great hall's underground lake (in its east lobe) and the lava rift before the deep workings.
  G.lake(70, 68, 4.8, Fluid.Water, 1.4, true);
  G.river([{ x: 30, z: 52 }, { x: 48, z: 48 }, { x: 64, z: 51 }, { x: 84, z: 46 }], 3.0, Fluid.Lava, tunnelPolys);
  // A few rock pillars where the halls are widest (never in a line).
  for (const [x, z, r] of [[51, 72, 1.5], [60, 81, 1.2], [53, 31, 1.4], [26, 69, 1.0]]) {
    G.blob(x, z, r, 0.4, (i) => {
      G.l.cells[i] = Cell.Wall;
      G.l.elev[i] = 4.5;
    });
  }
  G.l.entry = { x: 60, z: 103 };
  G.station('exit', 'keep', 60, 111, Math.PI, 1.4);
  G.station('chest', 'mine_chest', 53, 102.5, Math.PI / 2, 0.7);
  // Open, dry floor within `r` of a point (no wall, fluid, prop or station cells).
  const clear = (x: number, z: number, r: number) => {
    for (let zz = Math.floor(z - r); zz <= z + r; zz++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
      if (Math.hypot(xx + 0.5 - x, zz + 0.5 - z) > r + 0.3) continue;
      if (!G.inside(xx, zz)) return false;
      const i = G.idx(xx, zz);
      if (G.l.cells[i] !== Cell.Ground || G.l.fluid[i]) return false;
    }
    return true;
  };
  const onRoute = (x: number, z: number) => tunnelPolys.some((p) => distToPoly(x, z, p).d < 3.5);
  // A vein: ore rocks strung along the cavern wall from angle `a0` (radians about the cavern's
  // centre), each set just off the rock face (never inside it, and with open floor on the camera
  // side, so the hero never mines from inside a rock).
  const vein = (c: { x: number; z: number; r: number }, ores: string[], a0: number) => {
    let a = a0, placed = 0;
    // Rocks sit about three units apart along the wall (whatever the cavern's size); where one
    // won't fit, the vein creeps on a little and tries again.
    for (let tries = 0; placed < ores.length && tries < ores.length * 8; tries++) {
      const was = placed;
      let wall = 0;
      for (let r = 1; r < c.r + 8; r += 0.25) {
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (!G.inside(Math.floor(x), Math.floor(z)) || G.l.cells[G.idx(Math.floor(x), Math.floor(z))] === Cell.Wall) {
          wall = r;
          break;
        }
      }
      let rr = wall - 1.6;
      for (; wall && rr > Math.max(1.5, wall - 3.4); rr -= 0.4) {
        const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
        if (!clear(x, z, 1.3) || !clear(x, z + 1.9, 0.8) || onRoute(x, z)) continue;
        if (G.l.nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 2.8)) continue;
        G.ore(ores[placed++], x, z);
        break;
      }
      a += placed > was ? 3.0 / Math.max(2.5, rr) : 0.12;
    }
  };
  const C = caverns;
  vein(C.west, ['copper', 'copper', 'copper', 'tin'], -2.3);
  vein(C.west, ['tin', 'copper', 'copper'], 0.5);
  vein({ x: 21, z: 74, r: 5.5 }, ['copper', 'tin', 'copper'], 1.9);
  vein(C.tin, ['tin', 'tin', 'tin', 'copper'], -2.0);
  vein({ x: 27, z: 96, r: 4.2 }, ['tin', 'tin'], -0.6);
  vein(C.hall, ['copper', 'tin', 'copper'], 2.6);
  vein({ x: 47.5, z: 69, r: 6 }, ['tin', 'iron'], 2.6);
  vein(C.east, ['iron', 'iron', 'iron', 'iron'], -1.9);
  vein({ x: 101, z: 69, r: 5.5 }, ['iron', 'iron', 'iron'], 0.2);
  vein(C.east2, ['iron', 'coal', 'iron'], -1.2);
  vein(C.deep, ['coal', 'coal', 'coal', 'iron'], -1.9);
  vein({ x: 45.5, z: 25, r: 6.5 }, ['coal', 'coal', 'iron'], 2.4);
  vein({ x: 68, z: 37, r: 5.5 }, ['coal', 'coal'], -0.4);
  vein({ x: 62, z: 20, r: 5 }, ['coal', 'iron', 'coal'], -1.4);
  const used: Vec2[] = [...G.l.nodes, ...G.l.stations];
  const free = (x: number, z: number, r: number, gap = 2.6) => clear(x, z, r) && !used.some((u) => Math.hypot(u.x - x, u.z - z) < gap);
  const put = (kind: string, x: number, z: number, rot = 0, s = 1, block = 0) => {
    used.push({ x, z });
    return G.prop(kind, x, z, rot, s, block);
  };
  // Timber support sets across the tunnels (every ~7 units where the passage is narrow), each
  // with a hanging lantern; a few of them light the way.
  let lit = 0;
  tunnelPolys.forEach((poly, ti) => {
    let last = -99, acc = 0;
    for (let k = 1; k < poly.length - 1; k++) {
      acc += Math.hypot(poly[k].x - poly[k - 1].x, poly[k].z - poly[k - 1].z);
      if (acc - last < 7) continue;
      const p = poly[k], dx = poly[k + 1].x - poly[k - 1].x, dz = poly[k + 1].z - poly[k - 1].z, dl = Math.hypot(dx, dz) || 1;
      const ux = dx / dl, uz = dz / dl, px = uz, pz = -ux;
      const reach = (sgn: number) => {
        for (let s = 0; s < 6; s += 0.25) {
          const x = Math.floor(p.x + px * s * sgn), z = Math.floor(p.z + pz * s * sgn);
          if (!G.inside(x, z) || G.l.cells[G.idx(x, z)] !== Cell.Ground) return s;
        }
        return 6;
      };
      const sR = reach(1), sL = reach(-1), span = sR + sL;
      if (span < 2.6 || span > 6.2) continue;
      const cx = p.x + px * (sR - sL) / 2, cz = p.z + pz * (sR - sL) / 2;
      if (!clear(cx, cz, 1.0) || used.some((u) => Math.hypot(u.x - cx, u.z - cz) < 3)) continue;
      let nearFluid = false;
      for (let zz = Math.floor(cz - 3); zz <= cz + 3; zz++) for (let xx = Math.floor(cx - 3); xx <= cx + 3; xx++) if (G.inside(xx, zz) && G.l.fluid[G.idx(xx, zz)]) nearFluid = true;
      if (nearFluid) continue;
      last = acc;
      const litHere = lit < 5 && (ti + k) % 2 === 0;
      if (litHere) lit++;
      G.prop(litHere ? 'mine_frame_lit' : 'mine_frame', cx, cz, Math.atan2(ux, uz), 1).len = span - 0.3;
      for (const sgn of [-1, 1]) blockDisc(G.l, cx + px * sgn * (span / 2 - 0.35), cz + pz * sgn * (span / 2 - 0.35), 0.45);
      used.push({ x: cx, z: cz });
    }
  });
  // Rails down the main galleries (following each tunnel), a cart on some, a tipped cart
  // spilling ore in the iron works and the deep workings.
  const rail = (poly: Vec2[], t: number, len: number, cart: number | null) => {
    const { p, dir } = pointAt(poly, t);
    G.prop('rails', p.x, p.z, Math.atan2(dir.x, dir.z), 1).len = len;
    used.push(p);
    if (cart === null) return;
    const q = pointAt(poly, cart).p;
    put('minecart', q.x, q.z, Math.atan2(dir.x, dir.z), 1, 0.8);
  };
  rail(tunnelPolys[0], 0.5, 11, 0.8);
  rail(tunnelPolys[1], 0.55, 8, 0.3);
  rail(tunnelPolys[6], 0.2, 8, null);
  rail(tunnelPolys[4], 0.5, 8, null);
  for (const [c, a] of [[C.east, 2.5], [C.deep, 0.7]] as [typeof C.east, number][]) {
    for (let r = 3; r < c.r; r += 0.5) {
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (free(x, z, 1.6, 3.2)) {
        put('minecart_tipped', x, z, a + Math.PI / 2, 1, 0.9);
        break;
      }
    }
  }
  // Miners' camp by the entry: crates by the deposit chest.
  put('crates', 51, 105.5, 0.4, 1, 0.6);
  put('crates', 67.5, 104.5, -0.3, 1, 0.6);
  // Miners' lamps set against the rock: one on each cavern's far wall (the face the camera looks
  // at), a second on a side wall in the big halls, each throwing a warm pool over the wall and
  // the ore in front of it.
  const wallLamp = (c: { x: number; z: number; r: number }, a: number) => {
    for (const da of [0, 0.25, -0.25, 0.5, -0.5]) {
      const dx = Math.cos(a + da), dz = Math.sin(a + da);
      let r = 1;
      for (; r < c.r + 8; r += 0.25) {
        const xx = Math.floor(c.x + dx * r), zz = Math.floor(c.z + dz * r);
        if (!G.inside(xx, zz) || G.l.cells[G.idx(xx, zz)] !== Cell.Ground) break;
      }
      const xx = Math.floor(c.x + dx * r), zz = Math.floor(c.z + dz * r);
      if (!G.inside(xx, zz) || G.l.cells[G.idx(xx, zz)] !== Cell.Wall) continue;
      const x = c.x + dx * (r - 0.75), z = c.z + dz * (r - 0.75);
      if (!free(x, z, 0.5, 2.4) || onRoute(x, z)) continue;
      put('wall_lantern', x, z, Math.atan2(-dx, -dz), 1, 0.45);
      return;
    }
  };
  for (const [name, c] of Object.entries(caverns)) {
    wallLamp(c, -Math.PI / 2 + (name === 'hall' ? 0.5 : 0.15));
    if (c.r >= 8) wallLamp(c, name === 'east' ? -0.2 : Math.PI + 0.2);
  }
  for (const [name, c] of Object.entries(caverns)) {
    if (name === 'grotto') continue;
    for (const a0 of [-Math.PI / 2 - 0.7, -Math.PI / 2 + 0.8, Math.PI + 0.3, 0.2]) {
      let wx = 0, wz = 0, hit = false;
      for (let r = 2; r < c.r + 6; r += 0.25) {
        wx = c.x + Math.cos(a0) * r;
        wz = c.z + Math.sin(a0) * r;
        const cell = G.l.cells[G.idx(Math.floor(wx), Math.floor(wz))];
        if (cell !== Cell.Ground) {
          // Only against rock (never a lake shore or another prop).
          hit = cell === Cell.Wall;
          break;
        }
      }
      if (!hit) continue;
      const x = wx - Math.cos(a0) * 0.9, z = wz - Math.sin(a0) * 0.9;
      if (!free(x, z, 0.6, 3) || onRoute(x, z)) continue;
      put('shoring', x, z, Math.atan2(-Math.cos(a0), -Math.sin(a0)), 1, 0.6);
      break;
    }
  }
  // Seep puddles and loose ore chips on the floors.
  for (const [c, n] of [[C.hall, 2], [C.west, 1], [C.deep, 2], [C.east, 1], [C.entry, 1]] as [typeof C.hall, number][]) {
    let placed = 0;
    for (let t = 0; t < 40 && placed < n; t++) {
      const a = G.rng() * Math.PI * 2, r = 2 + G.rng() * (c.r - 2);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (!free(x, z, 1.5, 3)) continue;
      G.prop('puddle', x, z, G.rng() * 6, 0.65 + G.rng() * 0.35).len = placed++;
      used.push({ x, z });
    }
  }
  const chipKind: Record<string, number> = { copper: 0, tin: 1, iron: 2, coal: 3 };
  G.l.nodes.forEach((n, i) => {
    if (i % 2) return;
    for (let t = 0; t < 8; t++) {
      const a = G.rng() * Math.PI * 2, x = n.x + Math.cos(a) * 1.9, z = n.z + Math.sin(a) * 1.9;
      if (!clear(x, z, 0.5)) continue;
      G.prop('ore_chips', x, z, G.rng() * 6).len = chipKind[n.ore] ?? 0;
      break;
    }
  });
  // The crystal grotto: clusters grown out of its walls, not a ring.
  for (const [x, z, s] of [[93.5, 18.5, 1.1], [102.5, 18, 0.9], [96, 16.5, 0.8], [104.5, 25, 1.0], [92.5, 25.5, 0.8], [107, 30, 0.9]]) {
    if (clear(x, z, 0.6)) G.prop('crystal_big', x, z, x * 0.7, s, 0.7);
  }
  for (let k = 0; k < 40; k++) {
    const x = 4 + G.rng() * (w - 8), z = 4 + G.rng() * (h - 8);
    if (free(x, z, 0.5, 2.2) && !onRoute(x, z)) G.prop(G.rng() < 0.3 ? 'mushrooms' : 'crystal', x, z, G.rng() * 6, 0.6 + G.rng() * 0.6);
  }
  G.connect();
  return G.l;
}
