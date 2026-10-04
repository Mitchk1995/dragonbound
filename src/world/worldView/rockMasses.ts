import * as THREE from 'three';
import { Cell, Ground, Lawn } from '../layout';
import { MOSS_TALL, ROCK_MASSES, rockMass, rockMassMoss } from '../../render/blocks';
import type { Scatter, Scene } from './scene';

/** What the outdoor rock is set with: the ground kept round props, the cliff's tones and how one rock mass is seated against a face. */
export function rockKit(scene: Scene, sets: Scatter) {
  const { rng, layout, theme, w, h, heightAt, floorAt, m, q, s, p, e, walkable, addTree } = scene;
  const { rockMasses, rockMassCols, mossMats, mossCols, ferns, fernCols, cushions, cushionCols } = sets;
  const propNear = new Uint8Array(w * h), massAt = new Uint8Array(w * h);
  /** Round every prop, the height it stands at: no rock mass may rise over it there. */
  const propFoot = new Float32Array(w * h).fill(-Infinity);
  /** Where a prop stands: its middle, and all along the plan points a wall is laid on (kinds whose `opt.pts` are plan offsets). */
  const PLAN_RUNS = new Set(['ramp_wall', 'moat_bank', 'moat_plinth_run']);
  const standsAt = (pr: (typeof layout.props)[number]) => {
    const pts = PLAN_RUNS.has(pr.kind) ? ((pr.opt?.pts as number[][] | undefined) ?? []) : [], at = [[0, 0]];
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
      for (let j = 0; j <= n; j++) at.push([ax + ((bx - ax) * j) / n, az + ((bz - az) * j) / n]);
    }
    return at.map(([ox, oz]) => [pr.x + ox, pr.z + oz]);
  };
  for (const pr of layout.props) {
    const py = pr.y ?? Math.max(floorAt(pr.x, pr.z), heightAt(pr.x, pr.z));
    for (const [ax, az] of standsAt(pr)) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.floor(ax) + dx, zz = Math.floor(az) + dz;
      if (xx >= 0 && zz >= 0 && xx < w && zz < h) propFoot[zz * w + xx] = Math.max(propFoot[zz * w + xx], py);
    }
  }
  // Room kept round props by kind (parapets and lamps stand above the rock, not in front of it).
  const room: Record<string, number> = { moat_outfall: 3, edge_fall: 3, parapet: -1, lamp_post: -1 };
  for (const pr of layout.props) {
    const r = room[pr.kind] ?? 1;
    if (r < 0) continue;
    for (const [ax, az] of standsAt(pr)) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const xx = Math.floor(ax) + dx, zz = Math.floor(az) + dz;
      if (xx >= 0 && zz >= 0 && xx < w && zz < h) propNear[zz * w + xx] = Math.max(propNear[zz * w + xx], r > 1 ? 2 : 1);
    }
  }
  const cliffA = new THREE.Color(theme.cliff?.[0] ?? 0x7a6e62), cliffB = new THREE.Color(theme.cliff?.[1] ?? 0x5e544a);
  const grassy = theme.mesaTop !== undefined;
  const grassPal0 = theme.ground[Ground.Grass] ?? [0x5a7a3a, 0x6a8a44];
  const mossA = new THREE.Color(grassPal0[0]).lerp(new THREE.Color(0x6e8a3c), 0.4), mossB = new THREE.Color(grassPal0[1]).lerp(new THREE.Color(0x46642c), 0.5);
  const addFern = (x: number, y: number, z: number, sc: number, keep = true) => {
    p.set(x, y - 0.04, z);
    q.setFromEuler(e.set((rng() - 0.5) * 0.3, rng() * 6.3, (rng() - 0.5) * 0.3));
    const mm = m.compose(p, q, s.set(sc, sc * (0.8 + rng() * 0.4), sc)).clone();
    const col = mossA.clone().lerp(mossB, rng()).offsetHSL((rng() - 0.5) * 0.03, 0.04, (rng() - 0.5) * 0.06);
    if (!keep) return;
    ferns.push(mm);
    fernCols.push(col);
  };
  /** The rock mass's height at a fraction `f` of its radius out from the middle (at most, as a share of its own). */
  const prof = (f: number) => (f <= 0.45 ? 1 : 1 - 0.85 * ((f - 0.45) / 0.6) ** 2);
  /** Bare ground where loose rock may lie (not road, paving, water or a kept lawn). */
  const looseOk = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= w || z >= h) return false;
    const j = z * w + x, g = layout.ground[j];
    if (layout.cells[j] !== Cell.Ground || layout.fluid[j] || propNear[j]) return false;
    if (g === Ground.Stone || g === Ground.Path || g === Ground.Arena) return false;
    return !layout.lawn || layout.lawn[j] === Lawn.None || layout.lawn[j] === Lawn.Meadow;
  };
  const treeP = (i: number) => (layout.canopy ? layout.canopy[i] / 100 : theme.reliefTrees ?? 0);
  /**
   * Seat one rock mass against a face looking out along (ox, oz) from the cell centre (cx, cz):
   * standing on `base`, its crown `H` above the face's foot level, `W` across, slid `along` the face
   * and standing `front` proud of the cell centre. It is fitted to the ground round it (shrunk until
   * it never stands out over a road, paving or a lawn at the foot, and lowered until it never rises
   * through the ground on top; a meadow's turf may roll over its crown) and dropped if too little is
   * left. Its crown takes moss, and its front shoulder, where it stands clear of the face, may root
   * a pine, ferns or a moss cushion.
   */
  const fitRay = new THREE.Raycaster(), fitDown = new THREE.Vector3(0, -1, 0), fitMesh = new THREE.Mesh();
  fitMesh.matrixAutoUpdate = false;
  /**
   * The height (scale) a rock mass of variant `v` placed at p/q (W across, `dr` deep) may keep so
   * its top, moss and all, never stands above the walkable ground it reaches over: under paving,
   * walks, kept lawns and the cells a building or prop stands on by a hair, over a meadow by its turf.
   */
  const fitUnder = (v: number, W: number, T: number, dr: number, reach: (R: number) => number) => {
    fitMesh.geometry = rockMassMoss(v);
    const R = reach((W * Math.max(1, dr)) / 2);
    for (let pass = 0; pass < 3; pass++) {
      fitMesh.matrix.compose(p, q, s.set(W, T, W * dr));
      fitMesh.matrixWorld.copy(fitMesh.matrix);
      let worst = 1;
      for (let zi = Math.floor(p.z - R); zi <= Math.floor(p.z + R); zi++) for (let xi = Math.floor(p.x - R); xi <= Math.floor(p.x + R); xi++) {
        const j = zi * w + xi, foot = xi >= 0 && zi >= 0 && xi < w && zi < h ? propFoot[j] : -Infinity;
        if (!walkable(xi, zi) && foot === -Infinity) continue;
        const soft = layout.cells[j] === Cell.Ground && layout.ground[j] === Ground.Grass && (!layout.lawn || layout.lawn[j] === Lawn.None || layout.lawn[j] === Lawn.Meadow) && foot === -Infinity;
        for (const [fx, fz] of [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) {
          const sx = xi + fx, sz = zi + fz, cap = (walkable(xi, zi) ? Math.max(floorAt(sx, sz), foot) : foot) + (soft ? 0.15 : -0.05);
          fitRay.set(new THREE.Vector3(sx, p.y + T * 1.5 + 2, sz), fitDown);
          const hit = fitRay.intersectObject(fitMesh, false)[0];
          if (!hit || hit.point.y <= cap) continue;
          if (cap - p.y < 0.05) return 0;
          worst = Math.max(worst, (hit.point.y - p.y) / (cap - p.y));
        }
      }
      if (worst <= 1) return T;
      T /= worst * 1.01;
    }
    return 0;
  };
  const seatMass = (cx: number, cz: number, ox: number, oz: number, foot: number, base: number, H: number, W: number, along: number, front: number, low: boolean) => {
    const dr = 0.75 + rng() * 0.3, yaw = rng() * 6.3, tx = -oz, tz = ox, T0 = foot + H - base;
    let T = T0, ok = false, px = 0, pz = 0;
    for (let tries = 0; tries < 3 && !ok; tries++, W *= 0.72) {
      // (R reaches the mass's widest jittered point.)
      const R = (W * Math.max(1, dr) * 1.1) / 2, back = R * 0.86 - front;
      px = cx - ox * back + tx * along;
      pz = cz - oz * back + tz * along;
      ok = true;
      T = T0;
      for (const [ff, nA] of [[0, 1], [0.35, 6], [0.65, 12], [0.9, 18]] as const) for (let j = 0; j < nA && ok; j++) {
        const ang = (j / nA) * Math.PI * 2 + yaw, sx = px + Math.cos(ang) * R * ff, sz = pz + Math.sin(ang) * R * ff;
        const xi = Math.floor(sx), zi = Math.floor(sz);
        // (No mass reaches into the room kept round a fall.)
        if (xi >= 0 && zi >= 0 && xi < w && zi < h && propNear[zi * w + xi] === 2) ok = false;
        if (!walkable(xi, zi)) continue;
        const fl = floorAt(xi + 0.5, zi + 0.5);
        if (fl < foot + 0.5) {
          // Ground at the foot: a skirt may lap onto loose ground, never a road or a lawn.
          if (ff > 0.6 && base < foot + 0.5 && !looseOk(xi, zi)) ok = false;
          continue;
        }
        const j2 = zi * w + xi, soft = layout.ground[j2] === Ground.Grass && (!layout.lawn || layout.lawn[j2] === Lawn.None || layout.lawn[j2] === Lawn.Meadow);
        T = Math.min(T, (fl + (soft ? 0.15 : -0.12) - base) / prof(ff));
      }
      if (T < (low ? 1.1 : 1.6)) ok = false;
    }
    if (!ok) return;
    W /= 0.72;
    const v = Math.floor(rng() * ROCK_MASSES);
    p.set(px, base, pz);
    q.setFromEuler(e.set((rng() - 0.5) * 0.14, yaw, (rng() - 0.5) * 0.14));
    // The mass as it will stand (its moss included), tested where it reaches over the ground round
    // it: wherever it would rise through a walk, paving, a lawn or a building's foot, it is lowered
    // until it stays under them (a meadow's turf may still roll over its crown), or left out.
    T = fitUnder(v, W, T, dr, (R) => R * 1.15 + 0.5);
    if (T < (low ? 1.1 : 1.6)) return;
    const mm = m.compose(p, q, s.set(W, T, W * dr)).clone(), tall = T / (W * Math.sqrt(dr));
    rockMasses[v].push(mm);
    const tb = MOSS_TALL.reduce((a, t, i) => (Math.abs(Math.log(t / tall)) < Math.abs(Math.log(MOSS_TALL[a] / tall)) ? i : a), 0);
    mossMats[v][tb].push(mm);
    rockMassCols[v].push(cliffA.clone().lerp(cliffB, rng() * 0.6).offsetHSL((rng() - 0.5) * 0.02, 0, (rng() - 0.45) * 0.07));
    mossCols[v][tb].push(mossA.clone().lerp(mossB, rng()).offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.06));
    if (!grassy || T < 2.2) return;
    // What grows on its shoulder roots in the stone it stands on: the rock under the plant's
    // whole foot is found (straight down onto this mass, at its middle and all round its foot),
    // and it is left out unless rock lies under every point of it and the shoulder there is near
    // level, so no trunk hangs out past a ledge and no fern or cushion stands off a slope.
    fitMesh.geometry = rockMass(v);
    fitMesh.matrix.compose(p, q, s.set(W, T, W * dr));
    fitMesh.matrixWorld.copy(fitMesh.matrix);
    const rockUnder = (x: number, z: number, R: number, spread: number) => {
      let lo = Infinity, hi = -Infinity;
      for (let j = -1; j < 8; j++) {
        const sx = j < 0 ? x : x + Math.cos((j / 8) * Math.PI * 2) * R, sz = j < 0 ? z : z + Math.sin((j / 8) * Math.PI * 2) * R;
        fitRay.set(new THREE.Vector3(sx, base + T * 2 + 2, sz), fitDown);
        const hit = fitRay.intersectObject(fitMesh, false)[0];
        if (!hit) return null;
        lo = Math.min(lo, hit.point.y);
        hi = Math.max(hi, hit.point.y);
      }
      return hi - lo <= spread ? lo : null;
    };
    // (Each plant's draws are made whether or not it is kept, so the rest of the rock keeps its shapes.)
    const sf = 0.4, fy = base + T * prof(sf) - 0.1, fx0 = px + ox * W * 0.5 * sf, fz0 = pz + oz * W * 0.5 * sf;
    if (heightAt(fx0, fz0) > fy - 0.3) return;
    const r = rng();
    if (T > 3.4 && r < 0.3) {
      const sc = 0.55 + rng() * 0.35, y = rockUnder(fx0, fz0, 0.3 * sc * 1.4, 0.3);
      addTree(fx0, fz0, sc, y ?? fy, 'pine', y !== null);
    } else if (r < 0.65) {
      // A moss cushion bedded in the shoulder, sunk into the stone.
      const sc = 0.4 + Math.min(W, 6) * 0.1;
      e.set((rng() - 0.5) * 0.25, rng() * 6.3, (rng() - 0.5) * 0.25);
      const sx = sc * (0.9 + rng() * 0.6), sy = sc * (0.6 + rng() * 0.3), sz = sc * (0.8 + rng() * 0.4);
      const col = mossA.clone().lerp(mossB, rng()).offsetHSL((rng() - 0.5) * 0.03, 0.02, (rng() - 0.5) * 0.06);
      const y = rockUnder(fx0, fz0, Math.max(sx, sz) * 0.5, 0.12 + sc * 0.15);
      if (y !== null) {
        // (Laid level with the stone, not tipped: it follows the shoulder it is bedded in.)
        e.x *= 0.4;
        e.z *= 0.4;
        p.set(fx0, y - sy * 0.12, fz0);
        cushions.push(m.compose(p, q.setFromEuler(e), s.set(sx, sy, sz)).clone());
        cushionCols.push(col);
      }
    }
    // Ferns rooted in the stone round it, never standing off it.
    for (let j = 0, nj = Math.floor(rng() * 3); j < nj; j++) {
      const fx = fx0 + (rng() - 0.5) * W * 0.3, fz = fz0 + (rng() - 0.5) * W * 0.3, sc = 0.7 + rng() * 0.6, y = rockUnder(fx, fz, 0.22 * sc, 0.1);
      addFern(fx, y ?? fy, fz, sc, y !== null);
    }
  };
  return { propNear, massAt, cliffA, grassy, grassPal0, looseOk, treeP, seatMass };
}
