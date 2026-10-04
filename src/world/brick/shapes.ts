import { arc, box, cylinder, join, Mesh3, prism, rect, ring, turned, type V2 } from './mesh';
import { BR_LDU, EDGE, PL_LDU, PLAY, STUD_H, STUD_R } from './scale';

/**
 * The shapes of the basic elements, in LDU, each standing on y = 0 centred on its footprint with its
 * front (the face a wall shows outside, the low edge of a slope) toward +z. Studs are not part of
 * these shapes: every exposed stud is drawn by one shared stud shape (see view.ts).
 */

/** Half the length of `n` studs, less the play at each end. */
export const half = (n: number) => n * 10 - PLAY;

/** The plain body of a w × d element `hL` LDU tall. */
export const body = (w: number, d: number, hL: number) => box(-half(w), 0, -half(d), half(w), hL, half(d), EDGE);

/** A tile: smooth on top, with the small groove round its foot that tells it from a plate. */
export function tile(w: number, d: number): Mesh3 {
  return join(
    box(-half(w), 1, -half(d), half(w), PL_LDU, half(d), EDGE),
    box(-half(w) + 0.7, 0, -half(d) + 0.7, half(w) - 0.7, 1.4, half(d) - 0.7, 0),
  );
}

/** The stud: Ø 4.8 mm, 1.7 mm tall, its top edge rounded; no lettering. */
export function stud(seg = 20): Mesh3 {
  return turned([
    { r: STUD_R, y: -0.4 },
    { r: STUD_R, y: STUD_H - 0.7, round: true },
    { r: STUD_R - 0.7, y: STUD_H },
    { r: 0, y: STUD_H },
  ], seg);
}

/**
 * A raised panel on a face: a rectangle (x0, y0)–(x1, y1) standing `depth` proud of z = z0, its
 * front edges bevelled and its back left open (it is set into the face). The corners of its shallow
 * sides are left square: on a stone a stud long they are too small to see, and a wall has hundreds.
 */
function raised(x0: number, y0: number, x1: number, y1: number, z0: number, depth: number, bevel: number) {
  const r = ring(rect(x0, y0, x1, y1), 0);
  return prismOpenBack(r, depth, bevel, z0);
}

/** A prism whose back cap and back bevel are left off (its back is buried in another face). */
function prismOpenBack(r: ReturnType<typeof ring>, depth: number, bevel: number, z0: number): Mesh3 {
  // Built as a full prism twice as deep, then cut to its front half: the back half's faces dropped.
  const full = prism(r, [], depth * 2, bevel, 'z', [0, 0, z0])[0];
  const out = new Mesh3();
  const keep = new Map<number, number>();
  for (let t = 0; t < full.idx.length; t += 3) {
    const tri = [full.idx[t], full.idx[t + 1], full.idx[t + 2]];
    if (tri.some((i) => full.pos[i * 3 + 2] < z0 - 1e-6)) {
      // A side face reaching back past the face is kept, pulled forward to stop at it.
      if (!tri.every((i) => Math.abs(full.nor[i * 3 + 2]) < 0.2)) continue;
    }
    for (const i of tri) {
      if (!keep.has(i)) keep.set(i, out.vert(full.pos[i * 3], full.pos[i * 3 + 1], Math.max(z0, full.pos[i * 3 + 2]), full.nor[i * 3], full.nor[i * 3 + 1], full.nor[i * 3 + 2]));
      out.idx.push(keep.get(i)!);
    }
  }
  return out;
}

/**
 * A masonry brick, 1 × w: its front face carries courses of small dressed stones, two to a brick,
 * a stone a stud long and each course of stones broken half a stone on the one below, so a wall laid
 * in running bond reads as one continuous coursed stone face. Its back and ends are plain.
 */
export function masonry(w: number): Mesh3 {
  const rec = 1.5, j = 2.2, hd = half(1), x0 = -w * 10;
  const parts = [box(-half(w), 0, -hd, half(w), BR_LDU, hd - rec, EDGE)];
  const row = (a0: number, y0: number, y1: number) => {
    for (let a = a0; a < w * 20; a += 20) {
      const s = Math.max(0, a), e = Math.min(w * 20, a + 20);
      if (e - s < 4) continue;
      parts.push(raised(x0 + s + j / 2, y0 + j / 2, x0 + e - j / 2, y1 - j / 2, hd - rec, rec, 0.7));
    }
  };
  row(0, 0, BR_LDU / 2);
  row(-10, BR_LDU / 2, BR_LDU);
  return join(...parts);
}

/** A log brick, 1 × w: each long side rounded into two logs a course, the ends cut square. */
export function log(w: number): Mesh3 {
  // (Each log is an arc through its two edges, standing `dip` proud of them at its middle.)
  const hd = half(1), dip = 2.4, R = (36 + dip * dip) / (2 * dip), zc = hd - R;
  const side = (s: number): V2[] => {
    const pts: V2[] = [];
    for (const yc of s > 0 ? [6, 18] : [18, 6]) {
      for (let i = 0; i <= 6; i++) {
        const y = s > 0 ? yc - 6 + i * 2 : yc + 6 - i * 2;
        const z = zc + Math.sqrt(Math.max(0, R * R - (y - yc) ** 2));
        if (i === 0 && pts.length) continue;
        pts.push([s * z, y]);
      }
    }
    return pts;
  };
  const prof: V2[] = [...side(1), ...side(-1)];
  return prism(ring(prof, EDGE), [], half(w) * 2, EDGE, 'x')[0];
}

/** A round brick or plate: Ø one or two studs. */
export function round(studs: 1 | 2, hL: number): Mesh3 {
  return cylinder(half(studs), hL, EDGE, studs === 1 ? 24 : 36);
}

/** A round tile, with its foot groove. */
export function roundTile(studs: 1 | 2): Mesh3 {
  return join(cylinder(half(studs), PL_LDU - 1, EDGE, studs === 1 ? 24 : 36, [0, 1, 0]), cylinder(half(studs) - 0.7, 1.4, 0, studs === 1 ? 24 : 36, [0, 0, 0], false));
}

// ─── Slopes ─────────────────────────────────────────────────────────────────

/** The real system's slope angles: 45° on two-stud slopes, 33° on three-stud ones. */
export const SLOPES = {
  45: { depth: 2, toe: 4, deg: 45 },
  33: { depth: 3, toe: 2, deg: 33 },
} as const;
export type SlopeDeg = keyof typeof SLOPES;

const run = (deg: SlopeDeg) => (BR_LDU - SLOPES[deg].toe) / Math.tan((SLOPES[deg].deg * Math.PI) / 180);

/**
 * A slope, w wide: a flat strip at the back carrying one row of studs, then the slope falling
 * toward the front to a short upright toe. The sloped face is moulded with a fine grain (its own
 * mesh, drawn matte); the rest is smooth. Returns [smooth, grained].
 */
export function slope(deg: SlopeDeg, w: number): [Mesh3, Mesh3] {
  const D = half(SLOPES[deg].depth), t = SLOPES[deg].toe, top = D - run(deg);
  const prof: V2[] = [[-D, 0], [D, 0], [D, t], [top, BR_LDU], [-D, BR_LDU]];
  const [a, b] = prism(ring(prof, EDGE, [0, 0, 1, 0, 0]), [], half(w) * 2, EDGE, 'x');
  return [a, b ?? new Mesh3()];
}

/** A double slope (a ridge), w wide: two slopes back to back; 45° ridges are two studs deep, 33° four. */
export function ridge(deg: SlopeDeg, w: number): [Mesh3, Mesh3] {
  const t = SLOPES[deg].toe, r = run(deg), D = deg === 45 ? half(2) : half(4);
  const peak = D - r;
  const prof: V2[] = peak > 0.5
    ? [[-D, 0], [D, 0], [D, t], [peak, BR_LDU], [-peak, BR_LDU], [-D, t]]
    : [[-D, 0], [D, 0], [D, t], [0, t + D * Math.tan((SLOPES[deg].deg * Math.PI) / 180)], [-D, t]];
  const groups = peak > 0.5 ? [0, 0, 1, 0, 1, 0] : [0, 0, 1, 1, 0];
  const [a, b] = prism(ring(prof, EDGE, groups), [], half(w) * 2, EDGE, 'x');
  return [a, b ?? new Mesh3()];
}

/** An inverted slope, w wide: flat on top (studs all over), falling away underneath to a narrow foot at the back. */
export function invSlope(deg: SlopeDeg, w: number): Mesh3 {
  const D = half(SLOPES[deg].depth), t = SLOPES[deg].toe, foot = D - run(deg);
  const prof: V2[] = [[-D, 0], [foot, 0], [D, BR_LDU - t], [D, BR_LDU], [-D, BR_LDU]];
  return prism(ring(prof, EDGE), [], half(w) * 2, EDGE, 'x')[0];
}

// ─── Arches ─────────────────────────────────────────────────────────────────

/**
 * An arch, 1 × w and `hL` tall: a leg a stud wide at each end, the opening between them under a
 * round head (a half circle on the tall arches, flattened on the one-brick ones), studs along the top.
 */
export function archShape(w: number, hL: number): Mesh3 {
  const W = half(w), leg = W - 19.5, tall = hL > BR_LDU;
  const spring = tall ? 0 : 3, rise = tall ? leg : 13;
  const head = arc(0, spring, leg, rise, Math.PI, 0, tall ? 18 : 12);
  // (A head springing from the foot shares its first and last points with the legs' inner feet.)
  const prof: V2[] = [[-W, 0], [-leg, 0], ...(spring > 0 ? head : head.slice(1, -1)), [leg, 0], [W, 0], [W, hL], [-W, hL]];
  return prism(ring(prof, EDGE), [], half(1) * 2, EDGE, 'z')[0];
}
