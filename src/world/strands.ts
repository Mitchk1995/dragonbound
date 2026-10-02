import type { ZoneLayout } from './layout';

/**
 * Distance fields round a layout's strands (roads and streams kept as centre lines) and pools, at
 * every grid corner, so the ground, the grass carpet and the water can draw their edges along the
 * true curves instead of the cell grid. Negative inside: `path` is the signed distance from the
 * nearest road's edge (with that road's ground in `pathGround`), `wet` from the nearest stream's or
 * pool's waterline, and `deep` how far toward the middle of that water a corner lies (0 at the
 * waterline, 1 on the centre line or at a pool's heart).
 */
export interface StrandField {
  path: Float32Array;
  pathGround: Int16Array;
  wet: Float32Array;
  deep: Float32Array;
}

const FAR = 1e6;
const cache = new WeakMap<ZoneLayout, StrandField | null>();

/** How far out from a strand the field is worked out (beyond it every corner reads FAR). */
const REACH = 3;

export function strandField(layout: ZoneLayout): StrandField | null {
  if (cache.has(layout)) return cache.get(layout)!;
  if (!layout.strands?.length && !layout.pools?.length) {
    cache.set(layout, null);
    return null;
  }
  const { w, h } = layout, VW = w + 1, n = VW * (h + 1);
  const f: StrandField = { path: new Float32Array(n).fill(FAR), pathGround: new Int16Array(n).fill(-1), wet: new Float32Array(n).fill(FAR), deep: new Float32Array(n) };
  for (const s of layout.strands ?? []) {
    for (let k = 0; k < s.pts.length - 1; k++) {
      const a = s.pts[k], b = s.pts[k + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - s.hw - REACH)), x1 = Math.min(w, Math.ceil(Math.max(a.x, b.x) + s.hw + REACH));
      const z0 = Math.max(0, Math.floor(Math.min(a.z, b.z) - s.hw - REACH)), z1 = Math.min(h, Math.ceil(Math.max(a.z, b.z) + s.hw + REACH));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
        const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t) - s.hw, i = z * VW + x;
        if (s.kind === 'path') {
          if (d < f.path[i]) {
            f.path[i] = d;
            f.pathGround[i] = s.ground;
          }
        } else if (d < f.wet[i]) {
          f.wet[i] = d;
          f.deep[i] = Math.max(0, Math.min(1, -d / s.hw));
        }
      }
    }
  }
  for (const p of layout.pools ?? []) {
    for (let z = Math.max(0, Math.floor(p.z - p.r - REACH)); z <= Math.min(h, Math.ceil(p.z + p.r + REACH)); z++) for (let x = Math.max(0, Math.floor(p.x - p.r - REACH)); x <= Math.min(w, Math.ceil(p.x + p.r + REACH)); x++) {
      const r = Math.hypot(x - p.x, z - p.z), d = r - p.r, i = z * VW + x;
      if (d < f.wet[i]) {
        f.wet[i] = d;
        f.deep[i] = Math.max(0, 1 - (r / p.r) ** 2);
      }
    }
  }
  cache.set(layout, f);
  return f;
}
