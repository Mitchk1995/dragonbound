import { arc, box, cylinder, join, Mesh3, prism, rect, ring, turned, type Turn, type V2 } from '../mesh';
import { half } from '../scale';

/**
 * The house's turned and cast things, in kit units (each standing on y = 0, centred on its footprint):
 * a barrel, bread, sacks, a candle, flames and a rug, each one lathed or extruded shape. The furniture
 * proper is modelled whole in Blender (props.ts).
 */

/** A barrel: its bulging body turned (wood), iron hoops lying on it. Returns [body, hoops]. */
export function barrel(r: number, hU: number): [Mesh3, Mesh3] {
  const prof: Turn[] = [{ r: 0, y: 0 }, { r: r * 0.82, y: 0 }, { r: r * 0.86, y: 0.8 }, { r: r, y: hU / 2, smooth: true }, { r: r * 0.86, y: hU - 0.8 }, { r: r * 0.82, y: hU }, { r: r * 0.7, y: hU }, { r: r * 0.7, y: hU - 1 }, { r: 0, y: hU - 1 }];
  // The body's radius at height y (its sides run straight between the profile's points, as it is turned).
  const side = prof.slice(1, 6);
  const at = (y: number) => {
    const k = side.findIndex((p, i) => i + 1 < side.length && y >= p.y && y <= side[i + 1].y);
    const a = side[k], b = side[k + 1];
    return a.r + ((b.r - a.r) * (y - a.y)) / (b.y - a.y);
  };
  // (Each hoop's inside is the body's surface itself, so it lies on the staves without passing into them.)
  const hoops = [0.12, 0.3, 0.7, 0.88].map((f) => {
    const y0 = hU * f - 1, y1 = hU * f + 1;
    return turned([{ r: at(y0), y: y0 }, { r: at(y0) + 0.45, y: y0 }, { r: at(y1) + 0.45, y: y1 }, { r: at(y1), y: y1 }], 20);
  });
  return [turned(prof, 20), join(...hoops)];
}

/** A round loaf of bread `r` U across: a domed cob with a scored top. */
export const cob = (r: number) => turned([
  { r: 0, y: 0 }, { r: r * 0.92, y: 0 }, { r: r, y: r * 0.3, smooth: true }, { r: r * 0.85, y: r * 0.62, smooth: true }, { r: r * 0.45, y: r * 0.82, smooth: true }, { r: 0, y: r * 0.88 },
], 10);

/** A long loaf, `l` U long along x. */
export function longLoaf(l: number, r: number): Mesh3 {
  const pts: V2[] = arc(0, 0, r, r * 0.85, 0, Math.PI, 10);
  return prism(ring(pts, 0.6, undefined, 0.9), [], l, 1.6, 'x')[0];
}

/** A sack of flour: a lumpy bag tied at its neck. */
export const sack = (r: number, hU: number) => turned([
  { r: 0, y: 0 }, { r: r * 0.85, y: 0 }, { r: r, y: hU * 0.2, smooth: true }, { r: r * 0.95, y: hU * 0.55, smooth: true }, { r: r * 0.6, y: hU * 0.82, smooth: true },
  { r: r * 0.28, y: hU * 0.9 }, { r: r * 0.36, y: hU * 0.97, smooth: true }, { r: 0, y: hU },
], 12, [0, 0, 0], [1, 0.82]);

/** A candle in a dish: [wax, dish]. */
export const candle = (): [Mesh3, Mesh3] => [cylinder(1.6, 6, 0.4, 10, [0, 0.8, 0]), cylinder(3.4, 0.8, 0.3, 14)];

/** A candle's flame: a tongue of fire `hU` tall and `r` thick at its widest. */
export const flame = (r: number, hU: number): Mesh3 => turned([
  { r: 0, y: 0 }, { r: r * 0.85, y: hU * 0.08, smooth: true }, { r: r, y: hU * 0.22, smooth: true }, { r: r * 0.92, y: hU * 0.36, smooth: true },
  { r: r * 0.66, y: hU * 0.55, smooth: true }, { r: r * 0.36, y: hU * 0.74, smooth: true }, { r: r * 0.12, y: hU * 0.9, smooth: true }, { r: 0, y: hU },
], 12);

/** A rug `w` × `d` cells, a hair thick: its field, and the border woven round it, one band. Returns [field, border]. */
export function rug(w: number, d: number): [Mesh3, Mesh3] {
  const W = half(w), D = half(d), b = 3;
  const border = prism(ring(rect(-W, -D, W, D), 0.2), [ring(rect(-W + b, -D + b, W - b, D - b).reverse(), 0)], 0.7, 0.2, 'y', [0, 0.35, 0])[0];
  return [box(-W + b, 0, -D + b, W - b, 0.7, D - b, 0.2), border];
}
