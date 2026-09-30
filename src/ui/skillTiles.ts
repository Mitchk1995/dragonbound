import { mulberry32 } from '../core/rng';
import { ABILITY_ELEMENT, type Element } from '../data/abilities';
import type { Style } from '../types';

/**
 * Painted skill tiles for the HUD console, generated once at startup (no image files), in the same
 * spirit as the world's hand-painted albedo: a brushy, element-tinted ground lit from the top left,
 * and a bold silhouette glyph with a dark ink outline, soft painted shading and a rim light.
 * The console frames them in iron (style.css `.sk`).
 */

const S = 128;
const OUT = '#120a06';

interface Palette {
  dark: string;
  mid: string;
  light: string;
  glow: string;
}

const PAL: Record<Element, Palette> = {
  physical: { dark: '#210c0a', mid: '#6e2a1e', light: '#c07048', glow: '#ffd8a8' },
  rage: { dark: '#260a04', mid: '#86260a', light: '#e86a24', glow: '#ffc060' },
  nature: { dark: '#0d1a0c', mid: '#2c5226', light: '#86ad52', glow: '#e4f6b0' },
  wind: { dark: '#0a1a1c', mid: '#245452', light: '#7cc4b2', glow: '#e4fff4' },
  fire: { dark: '#240804', mid: '#8e2a0a', light: '#f08a2a', glow: '#ffe488' },
  frost: { dark: '#07131f', mid: '#1c4670', light: '#7ab8ec', glow: '#eef8ff' },
  lightning: { dark: '#110a24', mid: '#3c2a82', light: '#9c8cf4', glow: '#f2eeff' },
  arcane: { dark: '#160920', mid: '#522680', light: '#b686f0', glow: '#f6e6ff' },
};

/** Basic attacks per style (the console's LMB slot). */
export const BASIC_TILE: Record<Style, { id: string; element: Element; name: string }> = {
  melee: { id: 'strike', element: 'physical', name: 'Strike' },
  ranged: { id: 'shoot', element: 'nature', name: 'Shoot' },
  magic: { id: 'spark', element: 'arcane', name: 'Arcane Bolt' },
};

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

// ─── Ground ───────────────────────────────────────────────────────────────

function paintGround(c: Ctx, p: Palette, seed: number) {
  const rng = mulberry32(seed);
  const g = c.createRadialGradient(S * 0.36, S * 0.3, 6, S * 0.5, S * 0.55, S * 0.82);
  g.addColorStop(0, p.light);
  g.addColorStop(0.42, p.mid);
  g.addColorStop(1, p.dark);
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  // Loose diagonal brush strokes: the painted grain.
  c.lineCap = 'round';
  const tones = [p.dark, p.mid, p.light, p.dark];
  for (let i = 0; i < 260; i++) {
    const x = rng() * S, y = rng() * S;
    const a = -0.75 + (rng() - 0.5) * 0.7;
    const len = 8 + rng() * 26;
    c.strokeStyle = hexA(tones[Math.floor(rng() * tones.length)], 0.05 + rng() * 0.12);
    c.lineWidth = 3 + rng() * 8;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (rng() - 0.5) * 6, y + Math.sin(a) * len * 0.5 + (rng() - 0.5) * 6, x + Math.cos(a) * len, y + Math.sin(a) * len);
    c.stroke();
  }
  // A soft glow where the glyph sits, and a heavy vignette so the frame reads.
  const glow = c.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.5);
  glow.addColorStop(0, hexA(p.glow, 0.32));
  glow.addColorStop(1, hexA(p.glow, 0));
  c.fillStyle = glow;
  c.fillRect(0, 0, S, S);
  const v = c.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.74);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.62)');
  c.fillStyle = v;
  c.fillRect(0, 0, S, S);
}

// ─── Glyph painting ───────────────────────────────────────────────────────

/** Ink a shape: drop shadow + dark outline, fill, painted grain inside, rim light and core shade. */
function ink(c: Ctx, path: Path2D, fill: string | CanvasGradient, o: { line?: number; seed?: number; rim?: number } = {}) {
  const line = o.line ?? 6;
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.shadowColor = 'rgba(0,0,0,0.55)';
  c.shadowBlur = 6;
  c.shadowOffsetX = 2;
  c.shadowOffsetY = 3;
  c.strokeStyle = OUT;
  c.lineWidth = line;
  c.stroke(path);
  c.restore();

  c.save();
  c.fillStyle = fill;
  c.fill(path);
  c.clip(path);
  const rng = mulberry32(o.seed ?? 5);
  c.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = rng() * S, y = rng() * S, a = -0.8 + (rng() - 0.5) * 0.6, len = 6 + rng() * 16;
    c.strokeStyle = rng() < 0.5 ? `rgba(255,255,255,${0.04 + rng() * 0.07})` : `rgba(0,0,0,${0.05 + rng() * 0.09})`;
    c.lineWidth = 2 + rng() * 4;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    c.stroke();
  }
  // Rim light on the top-left edges, shade on the bottom-right ones.
  c.lineJoin = 'round';
  c.translate(2.2, 2.2);
  c.strokeStyle = `rgba(255,255,255,${o.rim ?? 0.5})`;
  c.lineWidth = 3;
  c.stroke(path);
  c.translate(-4.4, -4.4);
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 4;
  c.stroke(path);
  c.restore();
}

const lin = (c: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [t, col] of stops) g.addColorStop(t, col);
  return g;
};

const poly = (pts: Pt[]) => {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
};

/** A tapered band along a quadratic curve (horns, bows). */
function tube(p0: Pt, p1: Pt, p2: Pt, w0: number, w1: number, n = 24) {
  const L: Pt[] = [], R: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
    const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
    const dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    const d = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * t) / 2;
    L.push([x - (dy / d) * w, y + (dx / d) * w]);
    R.push([x + (dy / d) * w, y - (dx / d) * w]);
  }
  return poly([...L, ...R.reverse()]);
}

/** A band of an arc from a0 to a1 (radians, clockwise on screen), tapering to a point at the start. */
function arcBand(cx: number, cy: number, r: number, w: number, a0: number, a1: number, taper = true, n = 40) {
  const outer: Pt[] = [], inner: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t;
    const hw = (taper ? Math.min(1, t * 2.2) : 1) * w / 2;
    outer.push([cx + Math.cos(a) * (r + hw), cy + Math.sin(a) * (r + hw)]);
    inner.push([cx + Math.cos(a) * (r - hw), cy + Math.sin(a) * (r - hw)]);
  }
  return poly([...outer, ...inner.reverse()]);
}

/** Draw `fn` in a frame translated to (x, y) and rotated by `ang` radians. */
function at(c: Ctx, x: number, y: number, ang: number, fn: () => void, scale = 1) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.scale(scale, scale);
  fn();
  c.restore();
}

const STEEL = (c: Ctx, x0 = -8, x1 = 8) => lin(c, x0, 0, x1, 0, [[0, '#ffffff'], [0.45, '#d8e0e8'], [1, '#7e8a98']]);
const GOLD = (c: Ctx) => lin(c, -20, -4, 20, 6, [[0, '#ffe7a0'], [0.5, '#d49a3a'], [1, '#7a4a14']]);
const WOOD = '#b98a52';

/** A sword pointing up (−y), grip at the origin's +y side. */
function sword(c: Ctx, len = 1) {
  const tip = -54 * len;
  ink(c, poly([[-7.5, 16], [-7.5, tip + 16], [0, tip], [7.5, tip + 16], [7.5, 16]]), STEEL(c), { seed: 3 });
  c.save();
  c.strokeStyle = 'rgba(90,100,115,0.7)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, 12);
  c.lineTo(0, tip + 18);
  c.stroke();
  c.restore();
  const guard = new Path2D();
  guard.roundRect(-22, 15, 44, 9, 4);
  ink(c, guard, GOLD(c), { line: 5, seed: 4 });
  const grip = new Path2D();
  grip.roundRect(-4.5, 24, 9, 20, 2);
  ink(c, grip, lin(c, -5, 0, 5, 0, [[0, '#8a5230'], [1, '#3e2012']]), { line: 5 });
  const pommel = new Path2D();
  pommel.arc(0, 49, 6.5, 0, Math.PI * 2);
  ink(c, pommel, GOLD(c), { line: 5 });
}

/** An arrow pointing along +x from the origin. */
function arrow(c: Ctx, len: number, fletch: string, w = 1) {
  const shaft = new Path2D();
  shaft.rect(0, -2.4 * w, len - 14 * w, 4.8 * w);
  ink(c, shaft, WOOD, { line: 4.5, rim: 0.35 });
  ink(c, poly([[len - 17 * w, -7.5 * w], [len, 0], [len - 17 * w, 7.5 * w], [len - 13 * w, 0]]), lin(c, len - 16, -7, len, 7, [[0, '#ffffff'], [1, '#8a96a4']]), { line: 4.5 });
  ink(c, poly([[-2, -9 * w], [12 * w, -2.4 * w], [12 * w, 2.4 * w], [-2, 9 * w], [3 * w, 0]]), fletch, { line: 4, rim: 0.3 });
}

/** A four-point star (sparkles). */
function star4(cx: number, cy: number, r: number, ri = r * 0.24) {
  const pts: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 4, rr = i % 2 ? ri : r;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return poly(pts);
}

/** A teardrop: a ball of radius r at (cx, cy) trailing to a point at (tx, ty). */
function teardrop(cx: number, cy: number, r: number, tx: number, ty: number) {
  const d = Math.hypot(tx - cx, ty - cy);
  const th = Math.atan2(ty - cy, tx - cx), b = Math.acos(Math.min(1, r / d));
  const p = new Path2D();
  p.moveTo(tx, ty);
  p.arc(cx, cy, r, th + b, th - b + Math.PI * 2);
  p.closePath();
  return p;
}

/** A fireball: a ball trailing scalloped tongues of flame to a point. */
function flame(cx: number, cy: number, r: number, tx: number, ty: number, phase: number) {
  const th = Math.atan2(ty - cy, tx - cx), d = Math.hypot(tx - cx, ty - cy);
  const ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
  const n = 36;
  const side = (sgn: number) => {
    const out: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const w = r * Math.pow(1 - t, 0.9) * (1 - 0.32 * Math.max(0, Math.sin(t * Math.PI * 3.2 + phase + (sgn > 0 ? 0 : 1.6))));
      out.push([cx + ux * d * t + nx * w * sgn, cy + uy * d * t + ny * w * sgn]);
    }
    return out;
  };
  const back: Pt[] = [];
  for (let i = 1; i < 18; i++) {
    const a = th + Math.PI / 2 + (i / 18) * Math.PI;
    back.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return poly([...side(1).reverse(), ...back, ...side(-1)]);
}

function glowStroke(c: Ctx, path: Path2D, color: string, core: string, w: number) {
  c.save();
  c.lineJoin = 'miter';
  c.lineCap = 'round';
  c.shadowColor = color;
  c.shadowBlur = 14;
  c.strokeStyle = OUT;
  c.lineWidth = w + 6;
  c.stroke(path);
  c.shadowBlur = 0;
  c.strokeStyle = color;
  c.lineWidth = w;
  c.stroke(path);
  c.strokeStyle = core;
  c.lineWidth = Math.max(2, w * 0.38);
  c.stroke(path);
  c.restore();
}

// ─── Glyphs ───────────────────────────────────────────────────────────────

const GLYPHS: Record<string, (c: Ctx, p: Palette) => void> = {
  strike(c) {
    at(c, 60, 66, Math.PI / 4, () => sword(c, 1.05));
  },

  cleave(c, p) {
    // The blade mid-swing, riding the bright arc of a wide sweep.
    c.save();
    c.globalAlpha = 0.55;
    ink(c, arcBand(64, 70, 50, 6, Math.PI * 0.95, Math.PI * 1.75), p.glow, { line: 3, rim: 0.2 });
    c.restore();
    ink(c, arcBand(64, 70, 38, 20, Math.PI * 0.9, Math.PI * 1.98), lin(c, 20, 90, 110, 40, [[0, hexA(p.light, 0.25)], [0.55, '#ffe6c0'], [1, '#ffffff']]), { seed: 8, line: 5 });
    at(c, 76, 70, Math.PI * 0.36, () => sword(c, 1), 0.9);
  },

  leap_slam(c, p) {
    // A heavy downward blow cracking the ground.
    const crack = new Path2D();
    for (const [x, y] of [[20, 106], [40, 116], [88, 116], [110, 104], [64, 122]] as Pt[]) {
      crack.moveTo(64, 100);
      crack.lineTo((64 + x) / 2 + 3, (100 + y) / 2 - 2);
      crack.lineTo(x, y);
    }
    c.save();
    c.strokeStyle = OUT;
    c.lineWidth = 4;
    c.lineCap = 'round';
    c.stroke(crack);
    c.restore();
    const burst: Pt[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = i % 2 ? 12 : 30;
      burst.push([64 + Math.cos(a) * r * 1.35, 98 + Math.sin(a) * r * 0.5]);
    }
    ink(c, poly(burst), lin(c, 64, 80, 64, 112, [[0, '#ffffff'], [0.5, p.glow], [1, p.light]]), { line: 5 });
    for (const [x, y, s] of [[26, 82, 7], [100, 78, 8], [36, 66, 5], [92, 62, 5]] as [number, number, number][])
      ink(c, poly([[x - s, y], [x - s * 0.2, y - s], [x + s, y - s * 0.3], [x + s * 0.4, y + s * 0.8]]), '#8a7a66', { line: 4, rim: 0.4 });
    ink(c, poly([[54, 12], [74, 12], [74, 52], [92, 52], [64, 88], [36, 52], [54, 52]]), lin(c, 40, 10, 90, 88, [[0, '#ffffff'], [0.5, '#dfe6ee'], [1, '#7e8a98']]), { seed: 11 });
  },

  war_cry(c, p) {
    // A war horn blasting sound waves.
    for (const [r, a] of [[14, 0.95], [25, 0.75], [36, 0.55]] as Pt[]) {
      c.save();
      c.globalAlpha = a;
      ink(c, arcBand(42, 74, r, 5.5, Math.PI * 0.8, Math.PI * 1.25, false, 16), p.glow, { line: 3.5, rim: 0.2 });
      c.restore();
    }
    const horn = tube([46, 76], [84, 104], [110, 38], 30, 5);
    ink(c, horn, lin(c, 40, 90, 110, 40, [[0, '#fff2d6'], [0.55, '#dcc08a'], [1, '#8a6a3a']]), { seed: 13 });
    for (const t of [0.3, 0.6]) {
      const u = 1 - t;
      const x = u * u * 46 + 2 * u * t * 84 + t * t * 110, y = u * u * 76 + 2 * u * t * 104 + t * t * 38;
      const dx = 2 * u * 38 + 2 * t * 26, dy = 2 * u * 28 + 2 * t * -66;
      const band = new Path2D();
      band.ellipse(x, y, 3.5, 15 - t * 14, Math.atan2(dy, dx), 0, Math.PI * 2);
      ink(c, band, lin(c, x - 8, y - 8, x + 8, y + 8, [[0, '#ffe7a0'], [0.5, '#d49a3a'], [1, '#7a4a14']]), { line: 4 });
    }
    // The bell: a brass rim around a dark throat, facing the sound waves.
    const rim = new Path2D();
    rim.ellipse(46, 76, 8.5, 16.5, Math.PI * 0.2, 0, Math.PI * 2);
    ink(c, rim, lin(c, 38, 60, 54, 92, [[0, '#ffe7a0'], [0.5, '#d49a3a'], [1, '#7a4a14']]), { line: 5 });
    const throat = new Path2D();
    throat.ellipse(45, 76, 5, 11.5, Math.PI * 0.2, 0, Math.PI * 2);
    c.save();
    c.fillStyle = '#1e0e06';
    c.fill(throat);
    c.restore();
  },

  shoot(c, p) {
    at(c, 60, 68, -Math.PI / 4, () => {
      // Recurve limbs: two tapered curves meeting at a thick grip.
      ink(c, tube([-6, -50], [28, -34], [12, 0], 4, 10), '#9a6a36', { line: 5, seed: 31 });
      ink(c, tube([12, 0], [28, 34], [-6, 50], 10, 4), '#9a6a36', { line: 5, seed: 32 });
      c.save();
      c.strokeStyle = '#efe6d0';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-6, -48);
      c.lineTo(-24, 0);
      c.lineTo(-6, 48);
      c.stroke();
      c.restore();
      at(c, -26, 0, 0, () => arrow(c, 86, p.glow));
    });
  },

  multishot(c, p) {
    for (const deg of [-36, -18, 0, 18, 36]) at(c, 64, 116, (-90 + deg) * (Math.PI / 180), () => arrow(c, deg === 0 ? 96 : 84, p.glow, 0.95));
  },

  evasive_roll(c, p) {
    for (const [y, x0, x1] of [[40, 8, 30], [58, 4, 24], [76, 10, 28]]) {
      c.save();
      c.strokeStyle = hexA(p.glow, 0.75);
      c.lineWidth = 4;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(x1, y);
      c.stroke();
      c.restore();
    }
    const a1 = Math.PI * 2.3;
    ink(c, arcBand(70, 64, 34, 16, Math.PI * 0.75, a1), lin(c, 30, 30, 110, 100, [[0, '#ffffff'], [0.5, p.glow], [1, p.light]]), { seed: 17 });
    const hx = 70 + Math.cos(a1) * 34, hy = 64 + Math.sin(a1) * 34;
    const tang = a1 + Math.PI / 2;
    at(c, hx, hy, tang, () => ink(c, poly([[-4, -19], [22, 0], [-4, 19]]), lin(c, -4, 0, 22, 0, [[0, p.glow], [1, '#ffffff']]), { line: 5 }));
  },

  arrow_rain(c, p) {
    // A target ring on the ground and a volley coming down into it.
    const ring = new Path2D();
    ring.ellipse(64, 108, 42, 11, 0, 0, Math.PI * 2);
    c.save();
    c.strokeStyle = hexA(p.glow, 0.5);
    c.lineWidth = 3;
    c.setLineDash([8, 6]);
    c.stroke(ring);
    c.restore();
    const ang = Math.PI * 0.4;
    for (const [x, y] of [[22, 8], [56, -2], [90, 10], [38, 42], [74, 36]] as Pt[]) {
      c.save();
      c.strokeStyle = hexA(p.glow, 0.4);
      c.lineWidth = 2.5;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x - Math.cos(ang) * 22, y - Math.sin(ang) * 22);
      c.lineTo(x - Math.cos(ang) * 6, y - Math.sin(ang) * 6);
      c.stroke();
      c.restore();
      at(c, x, y, ang, () => arrow(c, 62, p.glow, 0.95));
    }
  },

  fireball(c) {
    ink(c, flame(74, 54, 30, 12, 118, 0), lin(c, 90, 30, 20, 110, [[0, '#ff6a1a'], [1, '#7a1606']]), { seed: 21, rim: 0.3 });
    const mid = flame(76, 52, 22, 30, 100, 1.3);
    c.save();
    c.fillStyle = lin(c, 90, 30, 30, 100, [[0, '#ffc23a'], [1, '#e2520e']]);
    c.fill(mid);
    c.restore();
    const core = teardrop(79, 49, 13, 52, 80);
    c.save();
    c.fillStyle = lin(c, 86, 40, 50, 82, [[0, '#fffbe6'], [1, '#ffd24a']]);
    c.shadowColor = '#fff0b0';
    c.shadowBlur = 12;
    c.fill(core);
    c.restore();
    for (const [x, y, r] of [[36, 50, 4], [104, 88, 3.5], [22, 80, 3]] as [number, number, number][]) {
      const e = new Path2D();
      e.arc(x, y, r, 0, Math.PI * 2);
      ink(c, e, '#ffb03a', { line: 3, rim: 0.3 });
    }
  },

  frost_nova(c, p) {
    const ring = new Path2D();
    ring.arc(64, 64, 52, 0, Math.PI * 2);
    c.save();
    c.strokeStyle = hexA(p.glow, 0.35);
    c.lineWidth = 3;
    c.setLineDash([10, 7]);
    c.stroke(ring);
    c.restore();
    const shards = new Path2D();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      const pt = (r: number, off: number): Pt => [64 + Math.cos(a) * r - Math.sin(a) * off, 64 + Math.sin(a) * r + Math.cos(a) * off];
      shards.addPath(poly([pt(8, -7), pt(38, -7), pt(50, 0), pt(38, 7), pt(8, 7)]));
      shards.addPath(poly([pt(26, -3), pt(34, -15), pt(39, -12), pt(32, 0)]));
      shards.addPath(poly([pt(26, 3), pt(34, 15), pt(39, 12), pt(32, 0)]));
    }
    ink(c, shards, lin(c, 20, 20, 110, 110, [[0, '#ffffff'], [0.5, p.glow], [1, p.light]]), { line: 5, seed: 23 });
    const hex: Pt[] = [];
    for (let i = 0; i < 6; i++) hex.push([64 + Math.cos((i * Math.PI) / 3) * 13, 64 + Math.sin((i * Math.PI) / 3) * 13]);
    ink(c, poly(hex), lin(c, 52, 52, 76, 76, [[0, '#ffffff'], [1, p.light]]), { line: 5 });
  },

  chain_lightning(c, p) {
    const main = new Path2D();
    main.moveTo(16, 18);
    main.lineTo(48, 44);
    main.lineTo(38, 58);
    main.lineTo(74, 76);
    main.lineTo(64, 88);
    main.lineTo(112, 110);
    const fork = new Path2D();
    fork.moveTo(48, 44);
    fork.lineTo(84, 38);
    fork.lineTo(78, 26);
    fork.lineTo(112, 20);
    fork.moveTo(74, 76);
    fork.lineTo(100, 66);
    fork.moveTo(38, 58);
    fork.lineTo(22, 84);
    glowStroke(c, fork, p.light, p.glow, 5);
    glowStroke(c, main, p.light, '#ffffff', 9);
    for (const [x, y] of [[112, 20], [112, 110], [22, 84]] as Pt[]) {
      const s = star4(x, y, 9);
      ink(c, s, '#ffffff', { line: 3 });
    }
  },

  spark(c, p) {
    const star = star4(64, 64, 52, 9);
    c.save();
    c.shadowColor = p.glow;
    c.shadowBlur = 16;
    c.fillStyle = hexA(p.glow, 0.85);
    c.fill(star);
    c.restore();
    const orb = new Path2D();
    orb.arc(64, 64, 20, 0, Math.PI * 2);
    const g = c.createRadialGradient(58, 57, 2, 64, 64, 22);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, p.glow);
    g.addColorStop(1, p.light);
    ink(c, orb, g, { line: 5 });
    for (const [x, y, r] of [[26, 30, 7], [102, 96, 8], [98, 30, 5]] as [number, number, number][]) ink(c, star4(x, y, r), '#ffffff', { line: 3 });
  },
};

const cache = new Map<string, string>();

/** Element of any tile id (abilities and the per-style basic attacks). */
export function tileElement(id: string): Element {
  return ABILITY_ELEMENT[id] ?? Object.values(BASIC_TILE).find((b) => b.id === id)?.element ?? 'physical';
}

/** Data URL of a painted tile for an ability id or a basic-attack id (strike / shoot / spark). */
export function skillTileUrl(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d')!;
  const pal = PAL[tileElement(id)];
  let seed = 0;
  for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  paintGround(c, pal, seed);
  GLYPHS[id]?.(c, pal);
  const url = cv.toDataURL();
  cache.set(id, url);
  return url;
}

export const SKILL_TILE_IDS = Object.keys(GLYPHS);
