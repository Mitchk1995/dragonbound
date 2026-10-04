import * as THREE from 'three';
import { Cell } from '../layout';
import { isRelief, smoothNoise } from '../terrain';
import type { Scatter, Scene } from './scene';

/** How cellPass lays the cave walls' stacked strata and the loose rock on cave and caldera floors, cell by cell. */
export type CaveKit = ReturnType<typeof caveKit>;

export function caveKit(scene: Scene, sets: Scatter) {
  const { rng, theme, seed, at, heightAt, m, q, s, p, e } = scene;
  const { strata, strataCols, crevices, debris, debrisCols } = sets;
  // Cave walls (mine): the foot of every wall is built from layered rock slabs, stacked in strata
  // that step back as they rise, their heights varying along the wall, with the odd dark crevice.
  // Walls on the camera side of the floor stay low. The terrain behind climbs on into darkness.
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
  return { addStrata, addDebris, debrisFloor, strataPal, strataNoise };
}

/** Behind the foot of the cave walls, bigger slabs climbing the rock mass into the dark. */
export function caveMass(scene: Scene, sets: Scatter, { strataPal, strataNoise }: CaveKit) {
  const { rng, theme, w, h, at, heightAt, m, q, s, p, e, walkable } = scene;
  const { mass, massCols } = sets;
  // Behind the foot of the cave walls the same slabs climb on: bigger blocks stacked on the rock
  // mass in rings further back, each column topped at the rock's own height, so the wall reads as
  // one body of layered stone from the floor up into the dark (the bare relief only shows in the
  // seams between them).
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
}
