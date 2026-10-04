import * as THREE from 'three';
import { Cell, Fluid, Ground, Lawn } from '../layout';
import { isRelief, smoothNoise, WATER_Y } from '../terrain';
import { underTones, type Scatter, type Scene } from './scene';
import type { CaveKit } from './caves';

/**
 * One pass over every cell: trees, boulders, walls, lava rims, the island's underside, reeds, bushes
 * and flowers. Returns the outdoor rock cells (dressCliffs sets them).
 */
export function cellPass(scene: Scene, sets: Scatter, cave: CaveKit) {
  const { rng, layout, theme, seed, w, h, at, heightAt, floorAt, m, q, s, p, e, nearWalkable, leafPal, rockBase, addTree } = scene;
  const { rocks, rockCols, rims, rimCols, walls, wallCols, under, underCols, bushes, bushCols, flowers, flowerCols, reeds, strata, strataCols } = sets;
  const { addStrata, addDebris, debrisFloor } = cave;
  const underNoise = smoothNoise(seed + 83);
  const [underA, underB] = underTones(theme);
  const wallColor = { castle: 0x8a8478, cave: 0x5e5044, ruin: 0x6a7070 }[theme.wall];
  const nearFluid = (x: number, z: number) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, zz = z + dz;
      if (xx >= 0 && zz >= 0 && xx < w && zz < h && layout.fluid[zz * w + xx]) return true;
    }
    return false;
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
          // Outdoor rock: rock masses, boulders, scree and plants are set along it below.
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
        // (None hangs where water spills off the edge: the fall drops clear down the island's side.)
        if (rim && !layout.props.some((pr) => pr.kind === 'edge_fall' && Math.abs(pr.x - x - 0.5) < 3.5 && Math.abs(pr.z - z - 0.5) < 3.5)) {
          // Hanging under the island's side (terrain.ts drops a sheer skirt from the edge itself):
          // from well below the lowest land beside it down into the void, so no column ever stands
          // up past the edge as a plate or a spike.
          let top = Infinity;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, z + dz) !== Cell.Void) top = Math.min(top, floorAt(x + dx + 0.5, z + dz + 0.5));
          top -= 3.2;
          // Their lengths follow a broad noise round the rim, so neighbours merge into a few big
          // tapering masses of clearly different depths (one hanging deep, others short), never a
          // comb of equal prisms; the long ones are the broad ones.
          // (Only every other rim cell or so hangs one, each a broad rounded mass, so they never line
          // up as a row of prisms; the skirt shows between them.)
          const mass = underNoise(x * 0.055, z * 0.055), deep = mass * mass;
          if (rng() < 0.45 - deep * 0.3) continue;
          const bot = Math.min(top, 0) - 2.5 - deep * 16 - rng() * 2.5;
          p.set(x + 0.5 + (rng() - 0.5) * 0.8, (top + bot) / 2, z + 0.5 + (rng() - 0.5) * 0.8);
          q.setFromEuler(e.set((rng() - 0.5) * 0.16, rng() * 6.3, (rng() - 0.5) * 0.16));
          const wd = 2.6 + deep * 3.4 + rng() * 1.6;
          s.set(wd * (0.8 + rng() * 0.4), top - bot, wd * (0.8 + rng() * 0.4));
          under.push(m.compose(p, q, s).clone());
          underCols.push(underA.clone().lerp(underB, rng()).offsetHSL(0, 0, (rng() - 0.5) * 0.06));
        }
      } else if (cell === Cell.Ground && !layout.fluid[i]) {
        const g = layout.ground[i];
        const green = g === Ground.Grass || g === Ground.Dirt;
        if (debrisFloor) addDebris(x, z);
        // Reeds along shores (water only, never lava), bushes where the forest thins out, flowers
        // in open meadows.
        // (On the island of levels, the castle's, never on the moat's paved and masonry banks.)
        if ((green || !layout.level) && nearFluid(x, z) && !theme.lava && !theme.wallRise && rng() < 0.35) {
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
  return rockCells;
}
