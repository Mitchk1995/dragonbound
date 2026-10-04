import { Mesh3 } from '../mesh';

/**
 * Plants, as the game's trees carry their leaves: painted sprays (public/textures/kit/plants.webp, made
 * by tools/kit_textures.py from sourced paintings) on upright cards crossed round a plant's middle,
 * cut out by their alpha. The cards' normals lean up and out from the plant's middle, so it is lit as a
 * rounded clump, not as flat cards.
 */

/** The atlas's sprays, in its order: a 3 × 2 grid, the first row on top. */
const PLANTS = ['bush', 'poppies', 'buttercups', 'cornflowers', 'fern', 'grass'] as const;
export type Plant = (typeof PLANTS)[number];

/**
 * A plant: `n` upright cards crossed round (x, y, z), each `w` U wide and `hU` tall, showing spray
 * `kind`, the first turned `turn` radians; its foot at y. `deep` narrows its spread along z (to fit a
 * window box).
 */
export function plantCards(kind: Plant, x: number, y: number, z: number, w: number, hU: number, n = 3, turn = 0, deep = 1): Mesh3 {
  const cell = PLANTS.indexOf(kind), cx = cell % 3, cy = Math.floor(cell / 3);
  const u0 = cx / 3, u1 = (cx + 1) / 3, v0 = 1 - (cy + 1) / 2, v1 = 1 - cy / 2;
  const m = new Mesh3();
  for (let k = 0; k < n; k++) {
    const a = turn + (k * Math.PI) / n, dx = Math.cos(a) * (w / 2), dz = Math.sin(a) * (w / 2) * deep;
    const corners: [number, number, number, number][] = [[-1, 0, u0, v0], [1, 0, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]];
    const idx = corners.map(([s, t, u, v]) => {
      // (Leaning up and out from the plant's middle line.)
      const ox = s * dx, oz = s * dz, len = Math.hypot(ox, oz) || 1;
      const nx = (ox / len) * 0.55, nz = (oz / len) * 0.55, ny = 0.6 + t * 0.4, nl = Math.hypot(nx, ny, nz);
      const i = m.vert(x + ox, y + t * hU, z + oz, nx / nl, ny / nl, nz / nl);
      m.uv.push(u, v);
      return i;
    });
    m.idx.push(idx[0], idx[1], idx[2], idx[0], idx[2], idx[3]);
  }
  return m;
}
