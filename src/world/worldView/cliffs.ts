import * as THREE from 'three';
import { Ground } from '../layout';
import { smoothNoise } from '../terrain';
import type { Scatter, Scene } from './scene';
import { rockKit } from './rockMasses';

/**
 * Natural rock outdoors. Along every outdoor cliff: great weathered masses of rock standing out of
 * the faces (a kit of rounded, faceted lumps overlapped at very different sizes and turns, moss over their crowns, a
 * pine or ferns rooted on the odd shoulder), boulders fallen at the foot and scree spilling from it
 * over the ground below, and plants rooted wherever the rock lies flat: grass and moss on the
 * ledges and along the top lip, the odd pine on a broad ledge. Nothing is set on a road or paving,
 * or near a prop (the parapets and the falls keep their own faces).
 */
export function dressCliffs(scene: Scene, sets: Scatter, rockCells: number[]) {
  if (!rockCells.length) return;
  const { rng, layout, theme, seed, w, h, terrain, heightAt, floorAt, m, q, s, p, e, walkable, leafPal, rockBase, addTree } = scene;
  const { rocks, rockCols, debris, debrisCols, ledgeTufts, ledgeTuftCols, cushions, cushionCols } = sets;
  const { propNear, massAt, cliffA, grassy, grassPal0, looseOk, treeP, seatMass } = rockKit(scene, sets);
  const pocketNoise = smoothNoise(seed + 91);
  for (let n = 0; n < rockCells.length; n += 2) {
    const x = rockCells[n], z = rockCells[n + 1], i = z * w + x;
    const cx = x + 0.5, cz = z + 0.5, top = heightAt(cx, cz);
    // Which way the face looks: toward the ground below it (the lower the ground, the more it counts).
    let ox = 0, oz = 0, foot = Infinity, fx = -1, fz = -1;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (!walkable(x + dx, z + dz) || layout.fluid[(z + dz) * w + x + dx]) continue;
      const fl = floorAt(x + dx + 0.5, z + dz + 0.5), drop = top - fl, d2 = dx * dx + dz * dz;
      if (drop <= 0.5) continue;
      ox += (dx / d2) * drop;
      oz += (dz / d2) * drop;
      if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1 && fl < foot) [foot, fx, fz] = [fl, x + dx, z + dz];
    }
    const ol = Math.hypot(ox, oz);
    if (fx >= 0 && ol > 0.01 && !propNear[i]) {
      ox /= ol;
      oz /= ol;
      // The face's real height runs from its foot to the lip behind the cell (a cliff cell's own
      // centre lies halfway down the drop), so the rock masses can rise to the top of the rock.
      const lip = Math.max(top, heightAt(cx - ox * 0.75, cz - oz * 0.75));
      const tx = -oz, tz = ox, faceH = lip - foot;
      // Rock masses out of the faces, none crowding the last: a broad mix of sizes (a few huge
      // shoulders, many middling lumps, small knuckles between), every one turned its own way, so
      // they overlap into one irregular massif. Most stand on the foot (their tops following a
      // broad noise along the rock, some rounding off right under the lip, others stopping well
      // short); on the taller faces more sit higher up, bedded in the face, so the whole height
      // breaks up into masses.
      let near = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) near += massAt[(z + dz) * w + x + dx];
      const low = faceH <= 2.4;
      if (faceH > 1.0 && near < 2 && rng() < 0.55) {
        massAt[i] = 1;
        const swell = pocketNoise(cx * 0.13 + 11.3, cz * 0.13 - 4.7);
        const big = !low && rng() < 0.2 + swell * 0.15;
        const f = big ? 0.88 + rng() * 0.2 : low ? 0.7 + rng() * 0.4 : 0.42 + swell * 0.35 + rng() * 0.33;
        const H = Math.min(faceH + 0.2, Math.max(low ? 0.8 : 1.4, faceH * f));
        const W = Math.max(H * (0.95 + rng() * 0.5), big ? 4.5 + rng() * 3.5 : low ? 1.4 + rng() * 1.6 : 1.8 + rng() * 2.6);
        seatMass(cx, cz, ox, oz, foot, foot - 0.4, H, W, (rng() - 0.5) * 0.6, 1.1, low);
        // A smaller mass slumped against its foot to one side.
        if (rng() < 0.4) {
          const h2 = H * (0.45 + rng() * 0.3), w2 = Math.max(h2 * 1.1, W * 0.7);
          seatMass(cx, cz, ox, oz, foot, foot - 0.4, h2, w2, (rng() < 0.5 ? -1 : 1) * W * (0.5 + rng() * 0.3), 1.4, low);
        }
        // Higher up a tall face, a mass bedded in it, its crown near the lip or well short of it.
        if (faceH > 5 && rng() < 0.55) {
          const b0 = foot + faceH * (0.22 + rng() * 0.4), h3 = (lip - b0) * (0.7 + rng() * 0.45);
          seatMass(cx, cz, ox, oz, foot, b0, h3, Math.max(h3 * 1.1, 2.4 + rng() * 3.5), (rng() - 0.5) * 2, 0.8, false);
        }
      }
      // Boulders fallen at the foot, bigger under taller faces.
      if (rng() < 0.3 + Math.min(0.25, faceH * 0.03)) {
        for (let k = 0, nk = 1 + Math.floor(rng() * 2.4); k < nk; k++) {
          const sc = 0.4 + Math.min(faceH, 10) * 0.08 + rng() * 0.5;
          const bx = cx + ox * (0.3 + rng() * 0.5) + tx * (rng() - 0.5) * 1.4, bz = cz + oz * (0.3 + rng() * 0.5) + tz * (rng() - 0.5) * 1.4;
          const bxi = Math.floor(bx), bzi = Math.floor(bz);
          if (bxi < 0 || bzi < 0 || bxi >= w || bzi >= h || propNear[bzi * w + bxi]) continue;
          if (walkable(bxi, bzi) && !looseOk(bxi, bzi)) continue;
          p.set(bx, foot - sc * 0.22, bz);
          q.setFromEuler(e.set((rng() - 0.5) * 0.5, rng() * 6.3, (rng() - 0.5) * 0.5));
          const mm = m.compose(p, q, s.set(sc * (0.9 + rng() * 0.4), sc * (0.55 + rng() * 0.4), sc)).clone();
          const col = cliffA.clone().lerp(rockBase, 0.2).offsetHSL(0, 0, -0.03 + (rng() - 0.5) * 0.1);
          // (Only where the ground lies at the face's foot under the whole boulder: none is left
          // hanging out over a lower drop beside it, as by a road carried up past the rock.)
          if (Array.from({ length: 9 }, (_, j) => (j ? heightAt(bx + Math.cos(j * 0.785) * sc * 0.5, bz + Math.sin(j * 0.785) * sc * 0.5) : heightAt(bx, bz))).some((y) => y < foot - 0.35)) continue;
          rocks.push(mm);
          rockCols.push(col);
        }
      }
      // Scree spilling out over the ground below.
      if (faceH > 1.6 && looseOk(fx, fz) && rng() < 0.75) {
        for (let k = 0, nk = 2 + Math.floor(rng() * 4); k < nk; k++) {
          const sc = 0.07 + rng() * 0.2, u = rng();
          const px = fx + 0.5 - ox * (0.5 - u) * 0.9 + tx * (rng() - 0.5), pz = fz + 0.5 - oz * (0.5 - u) * 0.9 + tz * (rng() - 0.5);
          p.set(px, heightAt(px, pz) - sc * 0.2, pz);
          q.setFromEuler(e.set((rng() - 0.5) * 0.6, rng() * 6.3, (rng() - 0.5) * 0.6));
          debris.push(m.compose(p, q, s.set(sc * (1 + rng() * 0.5), sc * (0.6 + rng() * 0.4), sc)).clone());
          debrisCols.push(cliffA.clone().lerp(rockBase, 0.3).offsetHSL(0, -0.02, (rng() - 0.5) * 0.12));
        }
      }
    }
    // Plants rooted on the rock wherever it lies flat (grassy country only).
    if (!grassy) continue;
    // Where a lawn or meadow meets the top of the rock, the turf rolls over the lip: a ragged
    // fringe of tufts along the edge leaning out over the drop, so no lawn ends in a crisp cut
    // (not where the land is carpeted in lawn: its own blades run to the lip).
    if (!layout.lawn) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!walkable(nx, nz)) continue;
      const j = nz * w + nx;
      if (layout.ground[j] !== Ground.Grass || layout.fluid[j] || propNear[j]) continue;
      const fl = floorAt(nx + 0.5, nz + 0.5);
      // (Only on the high side: the lawn the face drops away from.)
      if (!(fl > foot + 1.0)) continue;
      for (let k = 0, nk = 2 + Math.floor(rng() * 3); k < nk; k++) {
        const t = (rng() - 0.5) * 0.9, px = cx + dx * 0.42 + (dz ? t : 0), pz = cz + dz * 0.42 + (dx ? t : 0);
        const sc = 0.8 + rng() * 0.7, lean = 0.3 + rng() * 0.35;
        p.set(px, Math.max(fl, heightAt(px, pz)) - 0.05, pz);
        q.setFromEuler(e.set(-dz * lean, rng() * 0.4 - 0.2, dx * lean));
        ledgeTufts.push(m.compose(p, q, s.set(sc, sc * (0.9 + rng() * 0.5), sc)).clone());
        ledgeTuftCols.push(new THREE.Color(grassPal0[0]).lerp(new THREE.Color(grassPal0[1]), rng()).multiplyScalar(1.1).offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.05));
      }
    }
    /**
     * Whether the ledge at height y under (px, pz) carries a plant `R` across where it is drawn at
     * (wx, wz): the same bed all round it, out past its edge, and the weathered face (the cliff's
     * warp) leaving at least `R` of that ledge round it, so nothing hangs out over the lip.
     */
    const seated = (px: number, pz: number, y: number, wx: number, wz: number, R: number) => {
      for (let j = 0; j < 8; j++) for (const f of [0.8, 1.6]) {
        const a = (j / 8) * Math.PI * 2, sx = px + Math.cos(a) * R * f, sz = pz + Math.sin(a) * R * f, ly = terrain.ledge(sx, sz, 0.01);
        if (ly === null || Math.abs(ly - y) > 0.3) return false;
        const [ax, az] = terrain.warp(sx, y, sz);
        if (Math.hypot(ax - wx, az - wz) < R * f * 0.6) return false;
      }
      return true;
    };
    for (let k = 0; k < 3; k++) {
      const px = x + 0.1 + rng() * 0.8, pz = z + 0.1 + rng() * 0.8;
      const y = terrain.ledge(px, pz, 0.4);
      if (y === null || y - floorAt(px, pz) < 0.7) continue;
      const [wx, wz] = terrain.warp(px, y, pz);
      const r = rng();
      // (Only where the ledge runs on well round it, so no pad or tuft hangs out over its lip.)
      if (terrain.ledge(px, pz, 0.9) === null) continue;
      // Trees only in a few pockets (where a broad noise is high), bare rock between: never a row
      // of trees along every ledge.
      if (r < treeP(i) * 6 && pocketNoise(px * 0.07, pz * 0.07) > 0.62 && terrain.ledge(px, pz, 1.1) !== null) addTree(wx, wz, 0.65 + rng() * 0.25, y);
      else if (r < 0.22 && pocketNoise(px * 0.07, pz * 0.07) > 0.5) {
        // In the planted pockets, moss: low soft cushions moulded to the ledge (sunk into it, of
        // different sizes and turned every way), never blocky shrubs or tiles along a crest.
        const sc = 0.35 + rng() * 0.55;
        p.set(wx, y - 0.06 - sc * 0.05, wz);
        q.setFromEuler(e.set((rng() - 0.5) * 0.25, rng() * 6.3, (rng() - 0.5) * 0.25));
        const sx = sc * (0.9 + rng() * 0.6), sz = sc * (0.8 + rng() * 0.4), mm = m.compose(p, q, s.set(sx, sc * (0.7 + rng() * 0.4), sz)).clone();
        const col = new THREE.Color(grassPal0[0]).lerp(new THREE.Color(leafPal[theme.trees][Math.floor(rng() * 3)]), 0.3 + rng() * 0.4).offsetHSL((rng() - 0.5) * 0.03, 0.02, (rng() - 0.5) * 0.06);
        // (Only where the ledge runs on under the whole cushion: none hangs out over its lip.)
        if (!seated(px, pz, y, wx, wz, Math.max(sx, sz) * 0.6)) continue;
        cushions.push(mm);
        cushionCols.push(col);
      } else if (r < 0.85 && layout.lawn) {
        // Where the land is carpeted in lawn, the ledges carry low pads of the same short turf
        // (no loose tufts of long blades).
        const sc = 0.4 + rng() * 0.45;
        p.set(wx, y - 0.05, wz);
        q.setFromEuler(e.set((rng() - 0.5) * 0.15, rng() * 6.3, (rng() - 0.5) * 0.15));
        const sx = sc * (1.1 + rng() * 0.6), mm = m.compose(p, q, s.set(sx, sc * 0.32, sc * (0.9 + rng() * 0.5))).clone();
        const col = new THREE.Color(grassPal0[0]).lerp(new THREE.Color(grassPal0[1]), rng()).multiplyScalar(1.05).offsetHSL((rng() - 0.5) * 0.02, 0, (rng() - 0.5) * 0.04);
        // (Only where the ledge runs on under the whole pad: none hangs out over its lip as a loose plate.)
        if (!seated(px, pz, y, wx, wz, sx * 0.6)) continue;
        cushions.push(mm);
        cushionCols.push(col);
      } else if (r < 0.85) {
        const sc = 0.7 + rng() * 0.6;
        p.set(wx, y - 0.03, wz);
        q.setFromEuler(e.set((rng() - 0.5) * 0.2, rng() * 6.3, (rng() - 0.5) * 0.2));
        ledgeTufts.push(m.compose(p, q, s.set(sc, sc * (0.85 + rng() * 0.4), sc)).clone());
        ledgeTuftCols.push(new THREE.Color(grassPal0[0]).lerp(new THREE.Color(grassPal0[1]), rng()).multiplyScalar(1.15).offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.05));
      }
    }
  }
}
