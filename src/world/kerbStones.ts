/** A run of kerb as the layout lays it: its centre, turn about Y (0 along X) and length. */
export interface KerbRun {
  x: number;
  z: number;
  rot: number;
  len: number;
}

/** A run of kerb as it is laid: `n` stones end to end, one continuous border. */
export interface LaidKerb extends KerbRun {
  n: number;
}

/**
 * How wide a kerb is: a third of a cell, the paving's own row (see the ground's laid paving), so the
 * paving beside it starts on whole stones.
 */
export const KERB_W = 1 / 3;
/** The length a kerb's stones are cut to as near as fits: the paving's own stone, two thirds of a cell. */
const STONE = 2 * KERB_W;
/**
 * How far a kerb's middle stands in from its cell edge on the harder side: laid flush on that side, it
 * takes the paving's first row exactly, so the paving beside it starts on whole stones, and the
 * softer ground (a lawn, a gravel walk) runs right up to its side.
 */
export const KERB_SET = KERB_W / 2;

/**
 * A layout's kerb runs laid the way a mason sets a kerb: each run along its cell edge, KERB_SET toward
 * the harder side, one continuous border of whole stones (the paving's own length, as near as fits);
 * where two runs turn a corner one square corner stone fills the angle, the two runs stopping against
 * it (no gap and no overlap); where a run meets the side of another (a T) it stops against that run's
 * side.
 */
export function kerbStones(runs: KerbRun[]): LaidKerb[] {
  const H = KERB_W / 2, near = H + 0.1;
  const seg = runs.map((r) => {
    const ux = Math.cos(r.rot), uz = -Math.sin(r.rot), alongX = Math.abs(ux) > 0.5;
    // Ends along the run's own axis (x for a run along X, z for one along Z), low end first.
    const c = alongX ? r.x : r.z, lo = c - r.len / 2, hi = c + r.len / 2;
    // (The layout sets a run KERB_SET off its cell edge toward the harder side.)
    const at = alongX ? r.z : r.x, edge = Math.round(at), line = edge + Math.sign(at - edge || 1) * KERB_SET;
    return { alongX, line, lo, hi, a: lo, b: hi };
  });
  const corners = new Map<string, [number, number]>();
  for (const s of seg) for (const end of ['lo', 'hi'] as const) {
    const at = s[end];
    for (const q of seg) {
      if (q.alongX === s.alongX) continue;
      // q crosses s's end: its line is at s's end, and s's line within q's reach.
      if (Math.abs(q.line - at) > near || s.line < q.lo - near || s.line > q.hi + near) continue;
      // s stops against the side of q's band.
      if (end === 'lo') s.a = q.line + H;
      else s.b = q.line - H;
      // Where s's line is at q's end too, the two turn a corner: a corner stone fills the square.
      const qEnd = Math.abs(s.line - q.lo) <= near ? 'lo' : Math.abs(s.line - q.hi) <= near ? 'hi' : null;
      if (!qEnd) continue;
      const cx = s.alongX ? q.line : s.line, cz = s.alongX ? s.line : q.line;
      corners.set(`${cx.toFixed(3)},${cz.toFixed(3)}`, [cx, cz]);
      if (qEnd === 'lo') q.a = Math.max(q.a, s.line + H);
      else q.b = Math.min(q.b, s.line - H);
    }
  }
  const out: LaidKerb[] = [];
  for (const s of seg) {
    const L = s.b - s.a, m = s.a + L / 2;
    if (L < 0.05) continue;
    const n = Math.max(1, Math.round(L / STONE));
    out.push(s.alongX ? { x: m, z: s.line, rot: 0, len: L, n } : { x: s.line, z: m, rot: Math.PI / 2, len: L, n });
  }
  for (const [x, z] of corners.values()) out.push({ x, z, rot: 0, len: KERB_W, n: 1 });
  return out;
}
