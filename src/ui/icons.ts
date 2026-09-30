/**
 * Dragonbound icon set: hand-built SVG game icons for the "carved stone & iron" UI.
 *
 * Every icon is drawn on a 64x64 grid with a bold dark outline, 3-tone cel-shaded
 * gradient fills, a small top-left highlight and (for spells) a soft blurred glow.
 * Empty equipment-slot icons (`slot_*`) reuse the item geometry but render as faint
 * single-colour silhouettes.
 *
 * Several icons live in one HTML document at once, so every call gets its own id
 * prefix for gradients / filters / clip paths.
 */
import { BASES } from '../data/items';
import type { Item, Slot, Style } from '../types';

const OUT = '#140c06';
const SW = 2.75; // outline width on the 64 grid
const GHOST = '#cdbb95';
const GHOST_SW = 2.4;

type Tone =
  | 'iron' | 'gold' | 'ember' | 'blood' | 'arcane' | 'poison' | 'wood' | 'bone'
  | 'leather' | 'stone' | 'violet' | 'cloud' | 'spark' | 'darkIron' | 'redLeather';

/** [lit, mid, shadow] */
const TONE: Record<Tone, [string, string, string]> = {
  iron: ['#b9c2cc', '#8d959f', '#5f6670'],
  darkIron: ['#8d959f', '#646b75', '#41464d'],
  gold: ['#f3d98a', '#d8b25a', '#a07a30'],
  ember: ['#ffd070', '#ffb040', '#ff7a1a'],
  blood: ['#d9503a', '#b02a1a', '#6e1409'],
  arcane: ['#bfe0ff', '#5a9cff', '#2c5fc4'],
  poison: ['#a8e27e', '#6cc24a', '#3b7d27'],
  wood: ['#9a6a42', '#6b4426', '#482b17'],
  bone: ['#fbf6ea', '#eee4cc', '#c9b893'],
  leather: ['#b27b4a', '#8a5530', '#5c361a'],
  redLeather: ['#a8412c', '#7e2a1b', '#521509'],
  stone: ['#aea896', '#827b6c', '#57524a'],
  violet: ['#e2bcff', '#a45ee0', '#62279a'],
  cloud: ['#a7afc0', '#6f788c', '#454c5d'],
  spark: ['#ffffff', '#fff3a8', '#f3cd5a'],
};

const HI = '#fffaf0'; // highlight colour
const IRON_LINE = '#4a5058';
const HOLE = '#1f1610';

type Dir = 'd' | 'h' | 'v' | 'a';
const DIRS: Record<Dir, [number, number, number, number]> = {
  d: [0, 0, 1, 1], // top-left light
  h: [0, 0, 1, 0],
  v: [0, 0, 0, 1],
  a: [0.2, 0, 0.8, 1], // mostly vertical, slight diagonal
};

let serial = 0;

const n2 = (v: number) => Math.round(v * 100) / 100;

/** Per-call drawing context: collects <defs> with unique ids. */
class Pen {
  readonly defs: string[] = [];
  private readonly cache = new Map<string, string>();
  private k = 0;
  constructor(readonly pre: string, readonly ghost: boolean) {}

  get sw(): number {
    return this.ghost ? GHOST_SW : SW;
  }

  private id(): string {
    return `${this.pre}${(this.k++).toString(36)}`;
  }

  /** 3-tone cel gradient as a `fill=` attribute ('' in ghost mode so the silhouette colour is inherited). */
  f(t: Tone, dir: Dir = 'd'): string {
    if (this.ghost) return '';
    return `fill="url(#${this.grad(t, dir)})"`;
  }

  /** Solid fill attribute (ignored in ghost mode). */
  solid(color: string): string {
    return this.ghost ? '' : `fill="${color}"`;
  }

  private grad(t: Tone, dir: Dir): string {
    const key = `${t}:${dir}`;
    let id = this.cache.get(key);
    if (!id) {
      id = this.id();
      this.cache.set(key, id);
      const [l, m, d] = TONE[t];
      const [x1, y1, x2, y2] = DIRS[dir];
      this.defs.push(
        `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
          `<stop offset="0" stop-color="${l}"/><stop offset=".34" stop-color="${l}"/>` +
          `<stop offset=".42" stop-color="${m}"/><stop offset=".7" stop-color="${m}"/>` +
          `<stop offset=".78" stop-color="${d}"/><stop offset="1" stop-color="${d}"/></linearGradient>`,
      );
    }
    return id;
  }

  /** Radial gradient fill attribute from explicit stops. */
  rad(stops: [number, string][], cx = 0.38, cy = 0.34, r = 0.72): string {
    if (this.ghost) return '';
    const key = `r:${stops.map((s) => s.join()).join('|')}:${cx},${cy},${r}`;
    let id = this.cache.get(key);
    if (!id) {
      id = this.id();
      this.cache.set(key, id);
      this.defs.push(
        `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">` +
          stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') +
          `</radialGradient>`,
      );
    }
    return `fill="url(#${id})"`;
  }

  /** Free-form linear gradient fill attribute from explicit stops (objectBoundingBox coords). */
  lin(stops: [number, string, number?][], x1 = 0, y1 = 0, x2 = 1, y2 = 1): string {
    if (this.ghost) return '';
    const id = this.id();
    this.defs.push(
      `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
        stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('') +
        `</linearGradient>`,
    );
    return `fill="url(#${id})"`;
  }

  /** Blurred copy of some markup: soft outer glow. */
  glow(markup: string, sd = 3, opacity = 0.85): string {
    if (this.ghost) return '';
    const key = `b:${sd}`;
    let id = this.cache.get(key);
    if (!id) {
      id = this.id();
      this.cache.set(key, id);
      this.defs.push(
        `<filter id="${id}" filterUnits="userSpaceOnUse" x="-16" y="-16" width="96" height="96">` +
          `<feGaussianBlur stdDeviation="${sd}"/></filter>`,
      );
    }
    return `<g filter="url(#${id})" opacity="${opacity}" stroke="none">${markup}</g>`;
  }

  /** Clip path; returns the clip-path attribute. */
  clip(markup: string): string {
    const id = this.id();
    this.defs.push(`<clipPath id="${id}">${markup}</clipPath>`);
    return `clip-path="url(#${id})"`;
  }

  /** Detail / highlight markup that only exists in full-colour mode. */
  hl(markup: string): string {
    return this.ghost ? '' : markup;
  }

  /** Transform group placing local point (ox,oy) at (x,y); outline width is compensated for the scale. */
  at(x: number, y: number, rot: number, s: number, ox = 32, oy = 32): string {
    return `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(rot)}) scale(${s}) translate(${-ox} ${-oy})" stroke-width="${n2(this.sw / s)}">`;
  }

  /** A thick outlined line (bow limbs, shafts, chains): dark outline under a coloured core. */
  rod(d: string, color: string, w: number, outline = SW): string {
    if (this.ghost) return `<path d="${d}" fill="none" stroke-width="${n2(w + 1)}"/>`;
    return (
      `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="${n2(w + outline * 2)}"/>` +
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"/>`
    );
  }
}

// ---------------------------------------------------------------- tiny helpers

const P = (d: string, attrs = '') => `<path d="${d}" ${attrs}/>`;
const C = (cx: number, cy: number, r: number, attrs = '') => `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}" ${attrs}/>`;
const E = (cx: number, cy: number, rx: number, ry: number, attrs = '') =>
  `<ellipse cx="${n2(cx)}" cy="${n2(cy)}" rx="${n2(rx)}" ry="${n2(ry)}" ${attrs}/>`;
const R = (x: number, y: number, w: number, h: number, rx: number, attrs = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${attrs}/>`;
/** Highlight stroke (no outline). */
const hiStroke = (d: string, w = 2, op = 0.75, color = HI) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" opacity="${op}"/>`;
/** Highlight blob (no outline). */
const hiFill = (d: string, op = 0.55, color = HI) => `<path d="${d}" fill="${color}" stroke="none" opacity="${op}"/>`;
const line = (d: string, color: string, w: number, op = 1) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"${op < 1 ? ` opacity="${op}"` : ''}/>`;

const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => [
  cx + r * Math.cos(rad(deg)),
  cy + r * Math.sin(rad(deg)),
];
const pts = (list: [number, number][]) => list.map(([x, y], i) => `${i ? 'L' : 'M'}${n2(x)} ${n2(y)}`).join(' ') + ' Z';

/** 4-point sparkle path. */
function star4(cx: number, cy: number, r: number, ri = r * 0.26): string {
  return pts([
    [cx, cy - r], [cx + ri, cy - ri], [cx + r, cy], [cx + ri, cy + ri],
    [cx, cy + r], [cx - ri, cy + ri], [cx - r, cy], [cx - ri, cy - ri],
  ]);
}

/** Sparkle with outline. */
const spark = (c: Pen, cx: number, cy: number, r: number, fill = '#fff6d0') =>
  c.hl(P(star4(cx, cy, r), `fill="${fill}" stroke-width="${r > 5 ? 2 : 1.6}"`));

function gearD(cx: number, cy: number, teeth: number, ro: number, ri: number, hole: number): string {
  const step = 360 / teeth;
  const list: [number, number][] = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step - 90;
    list.push(polar(cx, cy, ri, a - step * 0.3));
    list.push(polar(cx, cy, ro, a - step * 0.17));
    list.push(polar(cx, cy, ro, a + step * 0.17));
    list.push(polar(cx, cy, ri, a + step * 0.3));
  }
  return pts(list) + ` M${cx + hole} ${cy} A${hole} ${hole} 0 1 0 ${cx - hole} ${cy} A${hole} ${hole} 0 1 0 ${cx + hole} ${cy} Z`;
}

function wavyD(cx: number, cy: number, r: number, bumps: number, amp: number): string {
  const list: [number, number][] = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * 360;
    list.push(polar(cx, cy, r + amp * Math.cos(rad(a * bumps)), a));
  }
  return pts(list);
}

function spiralD(cx: number, cy: number, r0: number, r1: number, turns: number, start = 0): string {
  const n = Math.round(turns * 36);
  const out: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, y] = polar(cx, cy, r0 + (r1 - r0) * t, start + t * turns * 360);
    out.push(`${i ? 'L' : 'M'}${n2(x)} ${n2(y)}`);
  }
  return out.join(' ');
}

/** Clockwise arc arrow (screen angles, degrees). */
function arcArrow(c: Pen, cx: number, cy: number, r: number, a0: number, a1: number, w: number, tone: Tone): string {
  const [sx, sy] = polar(cx, cy, r, a0);
  const [ex, ey] = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  const d = `M${n2(sx)} ${n2(sy)} A${r} ${r} 0 ${large} 1 ${n2(ex)} ${n2(ey)}`;
  const t: [number, number] = [-Math.sin(rad(a1)), Math.cos(rad(a1))];
  const nv: [number, number] = [Math.cos(rad(a1)), Math.sin(rad(a1))];
  const hw = w * 1.25;
  const tip: [number, number] = [ex + t[0] * w * 1.5, ey + t[1] * w * 1.5];
  const b1: [number, number] = [ex + nv[0] * hw - t[0], ey + nv[1] * hw - t[1]];
  const b2: [number, number] = [ex - nv[0] * hw - t[0], ey - nv[1] * hw - t[1]];
  const [l, m] = TONE[tone];
  return (
    c.rod(d, m, w) +
    c.hl(`<path d="${d}" fill="none" stroke="${l}" stroke-width="${n2(w * 0.3)}" opacity=".9" transform="translate(-0.8 -0.8)"/>`) +
    P(pts([b1, tip, b2]), c.solid(m))
  );
}

// ---------------------------------------------------------------- shared parts

/** Vertical sword, point up, spanning y 3..63.6 around x=32. */
function swordPart(c: Pen, gem?: string): string {
  return (
    P('M32 3 L37.5 11 V43 H26.5 V11 Z', c.f('iron', 'h')) +
    c.hl(line('M32 13 V40', IRON_LINE, 1.6)) +
    c.hl(hiStroke('M31 6.5 L28.6 10.5 V41', 1.3, 0.8)) +
    R(17, 42, 30, 7, 3.5, c.f('gold', 'v')) +
    c.hl(hiStroke('M20 44 H29', 1.4, 0.8)) +
    R(28.6, 49, 6.8, 8.5, 1.5, c.f('leather', 'h')) +
    c.hl(line('M29.5 52 H34.5 M29.5 55 H34.5', '#3a200e', 1.1)) +
    C(32, 60, 3.6, c.f('gold')) +
    (gem ? c.hl(C(32, 45.5, 2.6, `fill="${gem}" stroke-width="1.4"`)) : '')
  );
}

const SHIELD_OUT = 'M10 9 Q32 3 54 9 V28 Q54 48 32 61 Q10 48 10 28 Z';
const SHIELD_IN = 'M16 13.5 Q32 9 48 13.5 V28 Q48 44 32 54 Q16 44 16 28 Z';

/** Iron-rimmed heater shield with a coloured field and a charge drawn on top. */
function shieldPart(c: Pen, field: Tone, charge: string, dir: Dir = 'd'): string {
  const rivet = (x: number, y: number) => C(x, y, 1.9, `${c.solid('#e6c874')} stroke-width="1.3"`);
  return (
    P(SHIELD_OUT, c.f('iron')) +
    c.hl(hiStroke('M13 11 Q32 5.5 51 11', 1.4, 0.7)) +
    P(SHIELD_IN, c.f(field, dir)) +
    c.hl(hiFill('M18 15.5 Q24 12.8 30 12 V20 Q24 20.5 18 23 Z', 0.28)) +
    charge +
    c.hl(rivet(32, 6.3) + rivet(13, 17) + rivet(51, 17) + rivet(14.2, 37) + rivet(49.8, 37) + rivet(32, 57.6))
  );
}

/** Horizontal arrow, nock at (7,32), tip at (62.5,32). */
function arrowPart(c: Pen, fletch: Tone = 'blood'): string {
  return (
    c.rod('M11 32 H53', '#8e5d34', 3) +
    c.hl(line('M12 31.2 H50', '#c08a58', 1)) +
    P('M50.5 25.5 L62.5 32 L50.5 38.5 L53.5 32 Z', c.f('iron', 'v')) +
    P('M23 32 L15 25 H7.5 L12.5 32 L7.5 39 H15 Z', c.f(fletch, 'v')) +
    c.hl(line('M8 32 H22', '#3a0e06', 1.2))
  );
}

/** Arrow placed with its nock at (nx,ny) pointing at angle deg. */
const arrowAt = (c: Pen, nx: number, ny: number, deg: number, s: number, fletch: Tone = 'blood') =>
  c.at(nx, ny, deg, s, 7, 32) + arrowPart(c, fletch) + '</g>';

/** Recurve bow, belly facing left; arrow pointing right when drawn. */
function bowPart(c: Pen, drawn: boolean): string {
  const limb = 'M38 5 Q50 7 53 20 Q56 32 53 44 Q50 57 38 59';
  const str = drawn ? 'M38 5 L13 32 L38 59' : 'M38 5 L38 59';
  return (
    (c.ghost ? P(str, 'fill="none" stroke-width="1.4"') : c.rod(str, '#efe6cf', 1.4, 1.1)) +
    (drawn ? arrowPart(c) : '') +
    c.rod(limb, '#7a4c2a', 4.8) +
    c.hl(hiStroke('M40.5 7.8 Q49.5 10.5 51.2 20.5', 1.5, 0.55, '#e0b07a')) +
    C(38, 5, 2.3, c.f('bone')) +
    C(38, 59, 2.3, c.f('bone')) +
    R(50.5, 25.5, 7.5, 13, 2, c.f('leather', 'h')) +
    c.hl(line('M51.5 29.5 H57 M51.5 34.5 H57', '#3a200e', 1.1))
  );
}

/** Magic staff with glowing orb. */
function staffPart(c: Pen): string {
  const orb = c.rad([[0, '#ffffff'], [0.25, '#e4f2ff'], [0.55, '#8fc0ff'], [0.85, '#5a9cff'], [1, '#2c5fc4']], 0.38, 0.34, 0.7);
  return (
    c.glow(C(44, 20, 17, 'fill="#5a9cff"'), 5, 0.75) +
    c.rod('M9 58 L37 30', '#6b4426', 5) +
    c.hl(line('M10 55.5 L35 30.5', '#a4744a', 1.4)) +
    P('M34 36 Q24 22 34 11 Q30 22 40 30 Z', c.f('gold')) +
    P('M28 30 Q42 40 53 30 Q42 34 34 25 Z', c.f('gold')) +
    C(44, 20, 11, orb) +
    c.hl(E(40, 16, 4, 2.6, `fill="${HI}" stroke="none" opacity=".85" transform="rotate(-35 40 16)"`)) +
    C(36, 32, 3.6, c.f('gold')) +
    spark(c, 56, 7, 5.5) +
    spark(c, 58, 34, 3.2, '#bfe0ff')
  );
}

/** Open-faced iron helm with nasal (front view). */
function helmPart(c: Pen): string {
  const rivet = (x: number) => C(x, 40, 1.4, `${c.solid('#fff0b8')} stroke="none"`);
  return (
    P('M13 40 Q12 10 32 9 Q52 10 51 40 Z', c.f('iron')) +
    c.hl(line('M32 11 V37', IRON_LINE, 1.8)) +
    c.hl(hiStroke('M18 31 Q18.5 18 28 13.5', 2.4, 0.7)) +
    P('M14 43 V55 Q19 58 26 51 V43 Z', c.f('iron', 'v')) +
    P('M50 43 V55 Q45 58 38 51 V43 Z', c.f('iron', 'v')) +
    P('M26 43 H38 V51 Q32 54 26 51 Z', c.solid(HOLE)) +
    R(11, 36, 42, 8, 2.5, c.f('gold', 'v')) +
    c.hl(rivet(17) + rivet(24) + rivet(40) + rivet(47)) +
    P('M29.5 42 V56.5 L32 60 L34.5 56.5 V42 Z', c.f('iron', 'h'))
  );
}

/** Side-view boot, toe right. bbox x 17..60, y 6..57. */
function bootPart(c: Pen): string {
  return (
    P('M20 10 H38 V33 L51 38 Q58 40.5 58 47 V52 H20 Z', c.f('leather')) +
    c.hl(hiStroke('M23.5 14 V44', 2.2, 0.35)) +
    P('M44 36.5 L51 38.5 Q58 41 58 47 V52 H44 Z', c.f('iron')) +
    R(17.5, 51, 43, 6.5, 2.5, c.f('darkIron', 'v')) +
    R(17, 6, 24.5, 9, 2.5, c.f('redLeather', 'v')) +
    c.hl(line('M28 20 L36 23 M28 26 L36 29', '#e8cf8f', 1.6)) +
    c.hl(C(47, 44, 1.5, `fill="#dfe5ea" stroke="none"`))
  );
}

/** Chestplate. */
function bodyPart(c: Pen): string {
  return (
    P('M20 7 L11 11 L5 21 L12 30 L14 28 V55 Q32 62 50 55 V28 L52 30 L59 21 L53 11 L44 7 Q32 17 20 7 Z', c.f('iron')) +
    c.hl(line('M14 28 L19 17 M50 28 L45 17', IRON_LINE, 1.6)) +
    c.hl(line('M32 17 V44', IRON_LINE, 1.6)) +
    c.hl(hiStroke('M9 20 L13 13 L19 10', 2.2, 0.6)) +
    c.hl(hiFill('M20 20 Q25 24 30 24 V36 Q23 36 20 32 Z', 0.3)) +
    P('M20 7 Q32 17 44 7 L41 5 Q32 12 23 5 Z', c.f('gold')) +
    R(13, 43, 38, 7, 2, c.f('leather', 'v')) +
    R(28.5, 42, 7, 9, 1.5, c.f('gold')) +
    c.hl(R(30.5, 44.5, 3, 4, 0.8, `fill="${HOLE}" stroke="none"`))
  );
}

/** Gauntlet (back of hand, fingers up). */
function glovesPart(c: Pen): string {
  return (
    P('M22 40 L11 29.5 Q8 25 12.5 23 L23 29 Z', c.f('iron')) +
    P('M21 44 V15 Q21 8.5 27 8.5 H40 Q46 8.5 46 15 V44 Z', c.f('iron')) +
    c.hl(line('M28 10 V25 M33.5 9.5 V25 M39 10 V25', IRON_LINE, 1.5)) +
    c.hl(hiStroke('M24.5 13 V24', 2, 0.65)) +
    R(19.5, 25, 28, 7, 2.5, c.f('gold', 'v')) +
    P('M17 43 H50 L52 59 H15 Z', c.f('leather')) +
    c.hl(line('M18 49 H49', '#3a200e', 1.2)) +
    c.hl(hiStroke('M19 46 H30', 1.6, 0.45))
  );
}

/** Gold chain with a ruby pendant. */
function amuletPart(c: Pen): string {
  const gem = c.rad([[0, '#ffb3a0'], [0.35, '#e0503a'], [0.75, '#b02a1a'], [1, '#6e1409']], 0.4, 0.32, 0.75);
  return (
    c.rod('M12 5 Q13 31 32 35 Q51 31 52 5', '#d8b25a', 2.6) +
    c.hl(line('M12.6 8 Q14 28 30 33.5', '#f3d98a', 1)) +
    P('M32 29 L45 44 L32 61 L19 44 Z', c.f('gold')) +
    P('M32 35.5 L39.5 44.5 L32 54.5 L24.5 44.5 Z', gem) +
    c.hl(hiFill('M32 38 L28 44 L30.5 44.5 Z', 0.9)) +
    c.hl(C(32, 29.5, 2.6, `${c.f('gold')} stroke-width="1.6"`))
  );
}

/** Gold ring with a sapphire. */
function ringPart(c: Pen): string {
  const gem = c.rad([[0, '#ffffff'], [0.3, '#bfe0ff'], [0.7, '#5a9cff'], [1, '#2c5fc4']], 0.38, 0.32, 0.75);
  return (
    P('M32 22 A19 17 0 1 1 31.99 22 Z M32 29.5 A11.5 10 0 1 0 32.01 29.5 Z', `${c.f('gold')} fill-rule="evenodd"`) +
    c.hl(hiStroke('M17.5 36 Q19 27.5 26 24.5', 2, 0.7)) +
    P('M22 24 L26 12 H38 L42 24 Q32 28 22 24 Z', c.f('gold', 'v')) +
    C(32, 15, 8.5, gem) +
    c.hl(E(29.5, 12.5, 2.8, 1.8, `fill="#fff" stroke="none" opacity=".9" transform="rotate(-30 29.5 12.5)"`))
  );
}

function orePart(c: Pen): string {
  const fleck = (d: string) => P(d, `${c.f('ember')} stroke-width="1.6"`);
  return (
    P('M8 42 L14 22 L29 11 L46 13 L57 28 L55 46 L41 57 L19 55 Z', c.f('stone')) +
    c.hl(line('M14 22 L25 30 L29 11 M25 30 L46 13 M25 30 L28 48 L55 46 M28 48 L19 55', '#3d3932', 1.4, 0.7)) +
    c.hl(hiFill('M14.5 24 L27 14 L25.5 28 Z', 0.35)) +
    fleck('M34 24 L39 22 L40 27 L35 28 Z') +
    fleck('M42 34 L47 33 L46 38 Z') +
    fleck('M16 40 L21 38 L21 44 Z') +
    fleck('M33 40 L37 39 L36 43 Z')
  );
}

function barPart(c: Pen): string {
  return (
    P('M8 38 L13 50 H51 L56 38 Z', c.f('iron', 'v')) +
    P('M15 22 H49 L56 38 H8 Z', c.f('iron')) +
    c.hl(hiFill('M17 24.5 H33 L30 30 H14.5 Z', 0.5)) +
    c.hl(line('M20 29 H44', '#5f6670', 1.2, 0.6)) +
    c.hl(line('M13 44 H51', '#41464d', 1.2, 0.6))
  );
}

function keyPart(c: Pen): string {
  return (
    c.rod('M25 25 L55 55', '#d8b25a', 5) +
    c.hl(line('M26 24.5 L53 51.5', '#f3d98a', 1.4)) +
    P('M44 51 L50 45 L56 51 L50 57 Z M50 45 L54 41 L58 45 L54 49 Z', c.f('gold')) +
    P('M18 7 A12 12 0 1 1 17.99 7 Z M18 13 A6 6 0 1 0 18.01 13 Z', `${c.f('gold')} fill-rule="evenodd"`) +
    c.hl(hiStroke('M9 16 Q10 10 15 8.5', 1.8, 0.7))
  );
}

function scrollSheet(c: Pen): string {
  return (
    P('M15 12 H49 V52 H15 Z', c.f('bone', 'h')) +
    R(11, 6, 42, 9, 4.5, c.f('wood', 'v')) +
    C(9.5, 10.5, 3.6, c.f('gold')) +
    C(54.5, 10.5, 3.6, c.f('gold')) +
    R(11, 49, 42, 10, 5, c.f('bone', 'v')) +
    c.hl(line('M14 54 H50', '#b8a47c', 1.2))
  );
}

// ---------------------------------------------------------------- icons

type Draw = (c: Pen) => string;

const ICONS: Record<string, Draw> = {
  // ------------------------------------------------ skills
  melee: (c) => c.at(32, 32, -45, 0.84) + swordPart(c) + '</g>' + c.at(32, 32, 45, 0.84) + swordPart(c) + '</g>',

  ranged: (c) => c.at(33, 31, -45, 0.84) + bowPart(c, true) + '</g>',

  magic: (c) => staffPart(c),

  defence: (c) =>
    shieldPart(
      c,
      'blood',
      P('M29 12.5 H35 V25 H46.5 V31 H35 V50 L32 52.5 L29 50 V31 H17.5 V25 H29 Z', c.f('gold')) +
        c.hl(hiStroke('M30.5 15 V24 M20 26.5 H28', 1.2, 0.7)),
    ),

  hitpoints: (c) =>
    c.glow(P('M32 56 C14 44 6 34 6 23 C6 14 13 8 21 8 C26 8 30 11 32 15 C34 11 38 8 43 8 C51 8 58 14 58 23 C58 34 50 44 32 56 Z', 'fill="#b02a1a"'), 2.5, 0.5) +
    P(
      'M32 57 C14 45 6 35 6 23.5 C6 14 13 8 21 8 C26 8 30 11 32 15 C34 11 38 8 43 8 C51 8 58 14 58 23.5 C58 35 50 45 32 57 Z',
      c.rad([[0, '#f07a5e'], [0.35, '#d9503a'], [0.62, '#b02a1a'], [1, '#6e1409']], 0.36, 0.3, 0.8),
    ) +
    c.hl(P('M44 50 C50 43 56 36 57 26', `fill="none" stroke="#5a0f06" stroke-width="3" opacity=".5"`)) +
    c.hl(hiFill('M12.5 17 C14 12 19 11 23 12.5 C19 13.5 16 16.5 15 21 C14 22 12 20.5 12.5 17 Z', 0.85)) +
    c.hl(C(24.5, 20, 1.8, `fill="${HI}" stroke="none" opacity=".7"`)),

  mining: (c) =>
    c.at(33, 32, 40, 0.9) +
    R(29, 16, 6, 46, 2.5, c.f('wood', 'h')) +
    c.hl(line('M29.5 50 H34.5 M29.5 53.5 H34.5 M29.5 57 H34.5', '#3a200e', 1.3)) +
    P('M3 27 Q16 8.5 32 7.5 Q48 8.5 61 27 Q47 18.5 32 18.5 Q17 18.5 3 27 Z', c.f('iron', 'v')) +
    c.hl(hiStroke('M7 22.5 Q17 12 30 10.5', 1.6, 0.8)) +
    R(26, 5, 12, 16, 2.5, c.f('darkIron', 'h')) +
    c.hl(C(32, 13, 1.8, `fill="#e6c874" stroke-width="1.2"`)) +
    '</g>',

  smithing: (c) =>
    spark(c, 44, 28, 4.2, '#ffd070') +
    spark(c, 52, 20, 2.8, '#ffb040') +
    spark(c, 38, 21, 2.6, '#ffe39a') +
    P('M4 31 H57 V38.5 H43 V43 Q43 47 49 50 L51 58 H15 L17 50 Q23 47 23 43 V38.5 H19 Q9.5 37 4 31 Z', c.f('darkIron', 'a')) +
    c.hl(hiFill('M8 32.4 H55.5 V34.4 H10 Z', 0.55)) +
    c.hl(line('M23 43 H43', '#2b2f35', 1.2, 0.8)) +
    c.at(27, 22, -135, 0.72, 32, 10) +
    R(29.5, 14, 5, 34, 2, c.f('wood', 'h')) +
    R(19, 3, 26, 13, 2.5, c.f('iron', 'h')) +
    R(29, 2, 6, 15, 1.5, c.f('darkIron', 'h')) +
    '</g>',

  herblore: (c) => {
    const body = 'M27 10 V24 L12 51 Q9.5 58 17 58 H47 Q54.5 58 52 51 L37 24 V10 Z';
    return (
      P(body, `${c.solid('#cfe3ea')} fill-opacity=".45" stroke="none"`) +
      P('M18.4 40 Q25 37 32 40 T45.6 40 L52 51 Q54.5 58 47 58 H17 Q9.5 58 12 51 Z', c.f('poison', 'd') + ' stroke="none"') +
      c.hl(C(24, 50, 2.2, 'fill="#c8f2a6" stroke="none" opacity=".9"') + C(30, 45, 1.5, 'fill="#c8f2a6" stroke="none" opacity=".8"') + C(38, 51, 1.3, 'fill="#c8f2a6" stroke="none" opacity=".8"')) +
      P(body, 'fill="none"') +
      c.hl(hiStroke('M29.6 13 V25.5 L19 44', 2, 0.75)) +
      R(24.5, 4, 15, 8, 2.5, c.f('wood', 'v')) +
      P('M38 17 Q41 4 60 3 Q57 18 38 17 Z', c.f('poison')) +
      c.hl(line('M40 15.5 Q48 9 56 6', '#2d5e1d', 1.3))
    );
  },

  runecrafting: (c) => {
    const rune = 'M26 16 V48 M26 17 L39 24.5 L26 32 L40 47';
    return (
      P('M20 6 L45 5 Q52 6 53 13 L57 50 Q57 58 49 59 H15 Q8 58 8 50 L13 13 Q14 7 20 6 Z', c.f('stone')) +
      c.hl(hiFill('M16 10 L26 8.5 L22 20 L13.5 24 Z', 0.3)) +
      c.hl(line('M49 12 L53 40 M12 42 L16 55', '#3d3932', 1.3, 0.6)) +
      c.glow(`<path d="${rune}" fill="none" stroke="#5a9cff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`, 3, 0.9) +
      c.hl(line(rune, OUT, 6.2)) +
      c.hl(line(rune, '#bfe0ff', 2.8))
    );
  },

  enchanting: (c) =>
    c.glow(P('M20 12 H44 L56 26 L32 56 L8 26 Z', 'fill="#a45ee0"'), 4, 0.65) +
    P('M20 12 H44 L56 26 L32 56 L8 26 Z', c.f('violet')) +
    c.hl(P('M20 12 L26 26 L32 12 L38 26 L44 12 M8 26 H56 M26 26 L32 56 L38 26', `fill="none" stroke="#3d1464" stroke-width="1.3" opacity=".75"`)) +
    c.hl(hiFill('M20 12 L8 26 H26 Z', 0.55) + hiFill('M26 26 L32 12 L38 26 Z', 0.3) + hiFill('M8 26 L26 26 L32 56 Z', 0.18)) +
    c.hl(P('M38 26 H56 L32 56 Z', 'fill="#2a0b4a" stroke="none" opacity=".35"')) +
    spark(c, 52, 9, 6.5, '#fff3c4') +
    spark(c, 11, 44, 4.5, '#f3d98a') +
    spark(c, 50, 46, 3.4, '#fff'),

  beastmastery: (c) => {
    const egg = 'M32 4 C45 4 54 24 54 38 C54 52 45 60 32 60 C19 60 10 52 10 38 C10 24 19 4 32 4 Z';
    let scales = '';
    for (let row = 0; row < 7; row++) {
      const y = 14 + row * 7;
      const off = row % 2 ? 4.5 : 0;
      for (let x = 4 + off; x < 62; x += 9) scales += `M${x - 4.5} ${y} Q${x} ${y + 6} ${x + 4.5} ${y} `;
    }
    const crack = 'M41 9 L36 19 L43 24 L36 33 L40 38';
    return (
      c.glow(P('M36 14 L42 24 L36 34 Z', 'fill="#ffb040"'), 4, 0.9) +
      P(egg, c.f('blood')) +
      c.hl(`<g ${c.clip(P(egg))}>${line(scales, '#5a0f06', 1.5, 0.7)}</g>`) +
      c.hl(hiFill('M18 18 C21 11 25 8 29 7.5 C24 12 21 18 20 25 Z', 0.55)) +
      c.hl(line(crack, OUT, 4.4) + line(crack, '#ffd070', 2) + line('M36 19 L30 22 M43 24 L48 26', OUT, 3.2) + line('M36 19 L30 22 M43 24 L48 26', '#ffb040', 1.3)) +
      P('M20 60 Q32 54 44 60 Z', c.f('stone', 'v')) +
      P('M8 61 Q16 52 22 57 Q32 51 42 57 Q48 52 56 61 Z', c.f('stone', 'v'))
    );
  },

  // ------------------------------------------------ abilities
  cleave: (c) => {
    // wide swoosh trailing the swing, sword at its leading edge
    const swoosh = 'M55 8 A44 44 0 0 0 5 54 A52 52 0 0 1 49 15 Z';
    return (
      c.glow(P(swoosh, 'fill="#ff7a1a"'), 3, 0.5) +
      P(swoosh, c.lin([[0, '#6e1409', 0.35], [0.45, '#d9503a', 0.85], [0.8, '#fbf6ea'], [1, '#ffffff']], 0, 1, 1, 0) + ' stroke-width="2"') +
      c.hl(P('M51 11.5 A46 46 0 0 0 10 47', `fill="none" stroke="${HI}" stroke-width="1.6" opacity=".8"`)) +
      c.hl(line('M14 58 A40 40 0 0 1 36 30 M24 60 A34 34 0 0 1 40 40', '#eee4cc', 1.8, 0.45)) +
      c.at(39, 27, 45, 0.8) + swordPart(c, '#d9503a') + '</g>'
    );
  },

  leap_slam: (c) =>
    c.glow(E(32, 53, 22, 7, 'fill="#ff7a1a"'), 3, 0.85) +
    E(32, 54, 28, 8, c.f('stone', 'v')) +
    E(32, 53.5, 18, 4.4, c.solid('#2d2822')) +
    c.hl(line('M19 53 L25 51.5 L29 54 M37 52 L44 54.5', '#ffb040', 1.8)) +
    c.rod('M3 51 Q4 41 11 36', '#ffb040', 2.8) +
    c.rod('M61 51 Q60 41 53 36', '#ffb040', 2.8) +
    P('M5 27 L10 24 L13 29 L8 31 Z', c.f('stone')) +
    P('M52 22 L58 21 L58 27 L53 28 Z', c.f('stone')) +
    c.hl(line('M15 4 V13 M49 4 V13', '#eee4cc', 2.2, 0.75)) +
    c.at(32.5, 27, -10, 0.74, 38, 32) +
    bootPart(c) +
    '</g>',

  war_cry: (c) => {
    const horn = (d: string) => P(d, c.f('bone'));
    const shout = (d: string) => c.rod(d, '#ffb040', 2.6);
    return (
      shout('M9 44 L2 42') + shout('M10 51 L3 53') + shout('M13 57 L8 62') +
      shout('M55 44 L62 42') + shout('M54 51 L61 53') + shout('M51 57 L56 62') +
      horn('M13 31 Q1 25 5 4 Q9 17 19 21 Z') +
      horn('M51 31 Q63 25 59 4 Q55 17 45 21 Z') +
      c.hl(line('M8 12 L10.5 13.6 M8.5 18 L12 20 M56 12 L53.5 13.6 M55.5 18 L52 20', '#9f8a62', 1.3)) +
      helmPart(c)
    );
  },

  multishot: (c) =>
    arrowAt(c, 7, 55, -72, 0.78, 'poison') +
    arrowAt(c, 7, 55, -45, 0.84) +
    arrowAt(c, 7, 55, -18, 0.78, 'poison') +
    spark(c, 55, 11, 4, '#fff3c4'),

  evasive_roll: (c) =>
    c.hl(line('M4 22 H13 M2 28 H10 M5 34 H12', '#eee4cc', 2, 0.7)) +
    c.at(33, 33, -18, 0.6, 38, 32) +
    bootPart(c) +
    '</g>' +
    arcArrow(c, 32, 32, 25, 150, 400, 5, 'poison'),

  arrow_rain: (c) =>
    arrowAt(c, 12, 29, 104, 0.5) +
    arrowAt(c, 30, 30, 104, 0.56) +
    arrowAt(c, 48, 29, 104, 0.5) +
    P('M9 29 Q3 22 10 17 Q10 8 21 9 Q25 2 35 4 Q43 1 48 9 Q58 8 57 17 Q63 22 56 29 Z', c.f('cloud', 'v')) +
    c.hl(hiFill('M13 16 Q14 11 21 12 Q24 6.5 32 7.5 Q26 10 24 15 Q18 13 13 16 Z', 0.5)) +
    c.hl(line('M12 25 H54', '#2e3442', 1.2, 0.6)),

  fireball: (c) => {
    const flame = 'M26 59 C12 59 5 48 7 36 C9 24 19 18 30 13 C37 10 45 6 59 4 C53 10 51 14 53 19 C56 17 59 17 62 15 C60 25 55 31 51 35 C55 35 57 35 60 33 C56 50 44 59 26 59 Z';
    const inner = 'M26 54 C16 54 11 46 13 37 C15 28 24 24 33 19 C38 17 43 14 50 12 C46 17 45 21 47 25 C50 24 52 23 54 22 C52 30 48 34 44 37 C48 38 50 38 52 38 C48 48 38 54 26 54 Z';
    return (
      c.glow(P(flame, 'fill="#ff7a1a"'), 4, 0.85) +
      P(flame, c.f('ember', 'd')) +
      P(inner, c.solid('#ffd070') + ' stroke="none"') +
      C(25, 41, 11, c.rad([[0, '#ffffff'], [0.4, '#fff3c0'], [0.8, '#ffd070'], [1, '#ffb040']], 0.4, 0.38, 0.7) + ' stroke="#c2410c" stroke-width="1.6"') +
      c.hl(E(21, 37, 3.6, 2.4, `fill="#fff" stroke="none" opacity=".9" transform="rotate(-35 21 37)"`))
    );
  },

  frost_nova: (c) => {
    let shards = '';
    let glowShape = '';
    for (let i = 0; i < 8; i++) {
      const long = i % 2 === 0;
      const L = long ? 29.5 : 21;
      const m = long ? 17 : 13.5;
      const w = long ? 5.6 : 4.4;
      const d = `M32 ${32 - L} L${32 + w} ${32 - m} L32 ${32 - 7} L${32 - w} ${32 - m} Z`;
      const tf = `transform="rotate(${i * 45 + 22.5} 32 32)"`;
      shards += P(d, `${c.f('arcane', 'h')} ${tf}`);
      shards += c.hl(P(`M32 ${32 - L + 3} L${32 - w + 1.8} ${32 - m} L32 ${32 - m + 3} Z`, `fill="#fff" stroke="none" opacity=".75" ${tf}`));
      glowShape += P(d, `fill="#8fc0ff" ${tf}`);
    }
    return (
      c.glow(C(32, 32, 20, 'fill="#5a9cff"') + glowShape, 4, 0.8) +
      shards +
      C(32, 32, 8.5, c.rad([[0, '#ffffff'], [0.45, '#e4f2ff'], [1, '#8fc0ff']], 0.4, 0.38, 0.7)) +
      c.hl(P(star4(32, 32, 6, 1.6), 'fill="#5a9cff" stroke="none" opacity=".75"'))
    );
  },

  chain_lightning: (c) => {
    const bolt = 'M37 2 L15 35 H28 L19 62 L50 24 H35.5 L46 2 Z';
    const b1 = 'M45 28 L51 33 L48 39 L58 45';
    const b2 = 'M24 44 L15 46 L12 53 L4 57';
    return (
      c.glow(P(bolt, 'fill="#5a9cff"') + line(b1 + ' ' + b2, '#5a9cff', 6), 4, 0.95) +
      c.rod(b1, '#fff3a8', 2.4) +
      c.rod(b2, '#fff3a8', 2.4) +
      P(bolt, c.f('spark', 'h') + ' stroke-linejoin="miter" stroke-miterlimit="3"') +
      c.hl(P('M37.5 5 L20 32.5 H25 Z', 'fill="#fff" stroke="none" opacity=".9"')) +
      spark(c, 58, 45, 4.5, '#fff3a8') +
      spark(c, 4.5, 57, 4.5, '#fff3a8')
    );
  },

  // ------------------------------------------------ UI
  bag: (c) =>
    P('M13 24 Q13 17 20 17 H44 Q51 17 51 24 V54 Q51 60 45 60 H19 Q13 60 13 54 Z', c.f('leather')) +
    c.hl(hiStroke('M16.5 26 V51', 2.2, 0.35)) +
    P('M19 43 H45 V53 Q45 57 41 57 H23 Q19 57 19 53 Z', c.f('leather', 'v')) +
    c.hl(`<path d="M22 46.5 H42" fill="none" stroke="#e8cf8f" stroke-width="1.1" stroke-dasharray="2 2" opacity=".7"/>`) +
    P('M13 25 Q13 19 20 19 H44 Q51 19 51 25 V35 Q32 42 13 35 Z', c.f('redLeather', 'v')) +
    c.hl(`<path d="M16 34 Q32 40.5 48 34" fill="none" stroke="#e8cf8f" stroke-width="1.1" stroke-dasharray="2 2" opacity=".7"/>`) +
    R(9, 6, 46, 12, 6, c.f('bone', 'v')) +
    c.hl(line('M20 7 V17 M44 7 V17', '#8a5530', 3)) +
    c.hl(hiStroke('M14 9.5 H30', 1.6, 0.8)) +
    R(27.5, 33, 9, 10, 2, c.f('gold')) +
    c.hl(R(30.5, 36, 3, 4, 0.8, `fill="${HOLE}" stroke="none"`)),

  skills: (c) =>
    scrollSheet(c) +
    c.hl(line('M20 21 H44 M20 27 H40 M20 33 H44 M20 39 H36', '#8a6a44', 2)) +
    c.hl(hiStroke('M13 8.5 H30', 1.4, 0.55)),

  quest: (c) =>
    P('M21 42 L14 62 L20 58.5 L25 62 L30 45 Z', c.f('blood', 'v')) +
    P('M43 42 L50 62 L44 58.5 L39 62 L34 45 Z', c.f('blood', 'v')) +
    P(wavyD(32, 29, 22, 12, 1.6), c.rad([[0, '#e0664a'], [0.5, '#b02a1a'], [1, '#6e1409']], 0.38, 0.32, 0.75)) +
    c.hl(C(32, 29, 16, 'fill="none" stroke="#5a0f06" stroke-width="1.6" opacity=".7"')) +
    c.hl(hiStroke('M16.5 22 Q19 14 27 11', 2.2, 0.6)) +
    P('M28.5 12 H35.5 L34.2 35 H29.8 Z', c.f('gold')) +
    C(32, 42, 3.8, c.f('gold')),

  diary: (c) =>
    P('M14 9 H52 Q55 9 55 12 V55 Q55 58 52 58 H14 Z', c.f('bone', 'h')) +
    c.hl(line('M51 13 V54 M14 55 H51', '#b8a47c', 1.1)) +
    P('M10 6 H47 Q51 6 51 10 V51 Q51 55 47 55 H10 Z', c.f('redLeather')) +
    R(7, 5, 8, 51.5, 2.5, c.f('blood', 'h')) +
    c.hl(line('M8 13 H14 M8 48 H14', '#d8b25a', 2)) +
    P('M51 10 L44 6 H47 Q51 6 51 10 Z M51 51 L44 55 H47 Q51 55 51 51 Z', c.f('gold')) +
    P('M31 18 L39 30 L31 42 L23 30 Z', c.f('gold')) +
    c.hl(P('M31 24 L35 30 L31 36 L27 30 Z', `fill="#7e2a1b" stroke="none"`)) +
    c.hl(hiStroke('M18 10 H36', 1.6, 0.4)) +
    P('M38 55 V63 L41.5 60 L45 63 V55 Z', c.f('gold', 'v')),

  collection: (c) =>
    P('M3 20 V55 Q18 51 32 57 Q46 51 61 55 V20 Z', c.f('redLeather', 'v')) +
    P('M32 17 Q19 10 5 14 V50 Q19 46 32 53 Z', c.f('bone', 'h')) +
    P('M32 17 Q45 10 59 14 V50 Q45 46 32 53 Z', c.f('bone', 'v')) +
    c.hl(line('M5 50 Q19 46 32 53 Q45 46 59 50', '#b8a47c', 1)) +
    c.hl(line('M10 22 Q18 19 27 22 M10 28 Q18 25 27 28 M10 34 Q18 31 27 34 M10 40 Q17 37.5 24 40', '#8a6a44', 1.6)) +
    P('M45.5 21 L52 30 L45.5 40 L39 30 Z', c.f('arcane')) +
    c.hl(hiFill('M45.5 23.5 L41.5 30 H45.5 Z', 0.8)) +
    c.hl(line('M32 17 V53', '#8a7a5a', 1.4)) +
    P('M30.5 52 V62 L32.5 60 L34.5 62 V52 Z', c.f('gold', 'v')),

  keep: (c) =>
    c.rod('M32 17 V3', '#6b4426', 1.8) +
    P('M33 3.5 L47 7 L33 11 Z', c.f('blood')) +
    P('M16 25 H48 L50 58 H14 Z', c.f('stone')) +
    P('M11 15 H19 V19 H24.5 V15 H39.5 V19 H45 V15 H53 V26 H11 Z', c.f('stone', 'v')) +
    c.hl(line('M16 32 H48.4 M15.6 40 H48.9 M15.2 48 H49.4 M24 25 V32 M40 25 V32 M32 32 V40 M22 40 V48 M42 40 V48', '#4a453d', 1.2, 0.7)) +
    c.hl(hiFill('M13 16.5 H17.5 V24.5 H13 Z', 0.4)) +
    P('M25 58 V48 Q32 39 39 48 V58 Z', c.f('wood', 'v')) +
    c.hl(line('M32 44 V58', '#2b170a', 1.2)) +
    R(29.5, 30, 5, 8, 2.5, c.solid(HOLE)) +
    R(10, 57, 44, 5, 2, c.f('stone', 'v')),

  settings: (c) =>
    P(gearD(32, 32, 8, 28.5, 22, 0), c.f('iron')) +
    c.hl(hiStroke('M14 22 Q19 13 29 10.5', 2, 0.6)) +
    C(32, 32, 12.5, c.f('gold')) +
    C(32, 32, 5.5, c.solid(HOLE)) +
    c.hl(hiStroke('M23.5 29 Q25 23.5 30 22', 1.6, 0.7)),

  help: (c) =>
    shieldPart(
      c,
      'arcane',
      c.rod('M24.5 23 Q24.5 15.5 32 15.5 Q39.5 15.5 39.5 22.5 Q39.5 27.5 32 30.5 V35', '#e8c46a', 4.4) +
        c.hl(line('M25.5 21 Q27 17 31 16.8', '#fff3c4', 1.2)) +
        C(32, 43, 3.4, c.f('gold')),
    ),

  potion: (c) => {
    const body = 'M27 11 V23.7 A18 18 0 1 0 37 23.7 V11 Z';
    return (
      c.glow(C(32, 42, 15, 'fill="#b02a1a"'), 3, 0.35) +
      P(body, `${c.solid('#e4c8c0')} fill-opacity=".45" stroke="none"`) +
      P('M15.4 34 Q24 31 32 34 T48.6 34 A18 18 0 1 1 15.4 34 Z', c.rad([[0, '#f07a5e'], [0.45, '#d9503a'], [0.8, '#b02a1a'], [1, '#6e1409']], 0.4, 0.3, 0.8) + ' stroke="none"') +
      c.hl(C(38, 45, 2, 'fill="#ffb3a0" stroke="none" opacity=".8"') + C(28, 50, 1.4, 'fill="#ffb3a0" stroke="none" opacity=".7"')) +
      P(body, 'fill="none"') +
      c.hl(hiStroke('M19 38 Q19.5 30 26.5 27', 2.4, 0.8)) +
      R(25.5, 18.5, 13, 5, 2, c.f('gold', 'v')) +
      R(26, 4, 12, 9, 2.5, c.f('wood', 'v'))
    );
  },

  gold: (c) => {
    const coin = (cx: number, cy: number) =>
      P(`M${cx - 12} ${cy} V${cy + 4} A12 4.5 0 0 0 ${cx + 12} ${cy + 4} V${cy} Z`, c.f('gold', 'h')) +
      E(cx, cy, 12, 4.5, c.f('gold', 'v')) +
      c.hl(E(cx - 1, cy - 0.5, 7, 2, `fill="none" stroke="#a07a30" stroke-width="1" opacity=".8"`));
    let s = '';
    for (let i = 0; i < 5; i++) s += coin(20, 53 - i * 6);
    for (let i = 0; i < 3; i++) s += coin(44, 55 - i * 6);
    return (
      s +
      C(40, 29, 13, c.f('gold')) +
      C(40, 29, 9, `${c.solid('none')} stroke="#a07a30" stroke-width="1.6"`) +
      P(star4(40, 29, 6.5, 2), c.solid('#a07a30') + ' stroke="none"') +
      c.hl(hiStroke('M30 25 Q32 19 38 17.5', 2, 0.8)) +
      spark(c, 55, 13, 4.5, '#fff6d0')
    );
  },

  recall: (c) =>
    c.glow(C(32, 30, 16, 'fill="#5a9cff"'), 4, 0.9) +
    P('M18 61 Q32 50 46 61 Z', c.f('stone', 'v')) +
    P('M32 4 A26 26 0 1 1 31.99 4 Z M32 13 A17 17 0 1 0 32.01 13 Z', `${c.f('stone')} fill-rule="evenodd"`) +
    C(32, 30, 17, c.rad([[0, '#ffffff'], [0.3, '#bfe0ff'], [0.7, '#5a9cff'], [1, '#1d3f8a']], 0.5, 0.5, 0.55) + ' stroke="none"') +
    c.hl(line(spiralD(32, 30, 1.5, 15, 1.6, 0), '#1d3f8a', 2.4, 0.75)) +
    c.hl(line(spiralD(32, 30, 1.5, 14, 1.6, 180), '#e4f2ff', 1.8, 0.9)) +
    c.hl(hiStroke('M11 20 Q15 10 26 6', 2.2, 0.35)) +
    c.hl(line('M32 6.5 V9.5 M12 30 H15 M52 30 H49 M18 45 L20 43 M46 45 L44 43', '#f3d98a', 2)),

  lock: (c) =>
    c.rod('M20 30 V21 Q20 8 32 8 Q44 8 44 21 V30', '#8d959f', 5) +
    c.hl(line('M21.6 28 V21 Q21.6 11 30 9.6', '#dfe5ea', 1.4)) +
    R(11, 28, 42, 31, 5, c.f('gold')) +
    c.hl(hiFill('M14.5 31 H30 V34 H14.5 Z', 0.55)) +
    P('M32 36 A4.5 4.5 0 0 1 34.5 44.2 L36 51 H28 L29.5 44.2 A4.5 4.5 0 0 1 32 36 Z', c.solid(HOLE) + ' stroke="none"') +
    c.hl([15.5, 48.5].map((x) => C(x, 33, 1.6, 'fill="#8d959f" stroke-width="1.2"') + C(x, 54, 1.6, 'fill="#8d959f" stroke-width="1.2"')).join('')),

  close: (c) => {
    const bar = (deg: number) => R(6, 25.5, 52, 13, 4, `${c.f('blood', 'v')} transform="rotate(${deg} 32 32)"`);
    const stud = (deg: number, x: number) => {
      const [px, py] = polar(32, 32, x, deg);
      return C(px, py, 3.2, c.f('iron')) + c.hl(C(px - 0.9, py - 0.9, 1, `fill="${HI}" stroke="none" opacity=".8"`));
    };
    return (
      bar(45) +
      bar(-45) +
      c.hl(`<path d="M10.5 12.5 L20 22" fill="none" stroke="#f07a5e" stroke-width="1.6" opacity=".8"/><path d="M44 20.5 L51.5 13" fill="none" stroke="#f07a5e" stroke-width="1.6" opacity=".8"/>`) +
      stud(45, 19.5) + stud(135, 19.5) + stud(225, 19.5) + stud(315, 19.5) +
      C(32, 32, 4.6, c.f('iron')) +
      c.hl(C(31, 31, 1.4, `fill="${HI}" stroke="none" opacity=".8"`))
    );
  },

  aggressive: (c) =>
    c.glow(P('M12 52 L50 14', 'stroke="#b02a1a" stroke-width="9" fill="none"'), 4, 0.7) +
    c.at(32, 32, 45, 0.96) + swordPart(c, '#d9503a') + '</g>',

  defensive: (c) =>
    shieldPart(
      c,
      'wood',
      c.hl(line('M24 11 V50 M32 9.5 V54 M40 11 V50', '#3a200e', 1.3, 0.8)) +
        C(32, 30, 8, c.f('iron')) +
        c.hl(C(30, 28, 2.2, `fill="${HI}" stroke="none" opacity=".7"`)),
      'h',
    ),

  shared: (c) =>
    c.at(35, 30, -45, 0.9) + swordPart(c) + '</g>' +
    c.at(22, 40, 0, 0.6) +
    shieldPart(c, 'blood', P('M29 13 H35 V25 H46.5 V31 H35 V50 L32 52.5 L29 50 V31 H17.5 V25 H29 Z', c.f('gold'))) +
    '</g>',

  // ------------------------------------------------ equipment (items; slot_* are their ghosts)
  item_sword: (c) => c.at(32, 32, 45, 0.96) + swordPart(c) + '</g>',
  item_bow: (c) => c.at(29, 32, -45, 0.9) + bowPart(c, false) + '</g>',
  item_staff: (c) => staffPart(c),
  item_helm: (c) => helmPart(c),
  item_body: (c) => bodyPart(c),
  item_gloves: (c) => glovesPart(c),
  item_boots: (c) => c.at(32, 32, 0, 1, 38.5, 31.5) + bootPart(c) + '</g>',
  item_amulet: (c) => amuletPart(c),
  item_ring: (c) => ringPart(c),
  item_ore: (c) => orePart(c),
  item_bar: (c) => c.at(32, 35, 0, 1.05) + barPart(c) + '</g>',
  item_key: (c) => keyPart(c),

  slot_weapon: (c) => c.at(32, 32, 45, 0.92) + swordPart(c) + '</g>',
  slot_helm: (c) => helmPart(c),
  slot_body: (c) => bodyPart(c),
  slot_gloves: (c) => glovesPart(c),
  slot_boots: (c) => c.at(32, 32, 0, 1, 38.5, 31.5) + bootPart(c) + '</g>',
  slot_amulet: (c) => amuletPart(c),
  slot_ring: (c) => ringPart(c),

  // ------------------------------------------------ fallback
  rune: (c) => {
    const glyph = 'M32 17 V47 M22 24 L32 32 L42 24 M24 42 L32 36 L40 42';
    return (
      P(wavyD(32, 33, 26, 7, 1.4), c.f('stone')) +
      c.hl(hiFill('M13 24 Q18 13 30 9 Q22 16 19 27 Z', 0.35)) +
      c.glow(line(glyph, '#ffb040', 6), 2.5, 0.8) +
      c.hl(line(glyph, OUT, 6) + line(glyph, '#f3d98a', 2.6))
    );
  },
};

/** Every icon name `icon()` knows. */
export const ICON_NAMES: string[] = Object.keys(ICONS);

/**
 * Render an icon as a complete `<svg>` string (viewBox 0 0 64 64, width/height = size).
 * Unknown names fall back to a generic rune icon; never throws.
 */
export function icon(name: string, size = 32): string {
  const key = typeof name === 'string' && Object.prototype.hasOwnProperty.call(ICONS, name) ? name : 'rune';
  const px = typeof size === 'number' && Number.isFinite(size) && size > 0 ? n2(size) : 32;
  const ghost = key.startsWith('slot_');
  const pen = new Pen(`dbi${(serial++).toString(36)}_`, ghost);
  let body = '';
  try {
    body = ICONS[key](pen);
  } catch {
    body = '';
  }
  const root = ghost
    ? `<g fill="${GHOST}" fill-opacity=".2" stroke="${GHOST}" stroke-opacity=".6" stroke-width="${GHOST_SW}" stroke-linejoin="round" stroke-linecap="round">`
    : `<g stroke="${OUT}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round">`;
  const defs = pen.defs.length ? `<defs>${pen.defs.join('')}</defs>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 64 64" class="dbi dbi-${key}" aria-hidden="true" focusable="false">` +
    `${defs}${root}${body}</g></svg>`
  );
}

// ---------------------------------------------------------------- item helpers (used by ui.ts)

const MODEL_ICON: Record<string, string> = {
  sword: 'item_sword',
  longsword: 'item_sword',
  bow: 'item_bow',
  staff: 'item_staff',
  helm_full: 'item_helm',
  helm_open: 'item_helm',
  body_chain: 'item_body',
  body_plate: 'item_body',
  gloves: 'item_gloves',
  boots: 'item_boots',
  amulet: 'item_amulet',
  ring: 'item_ring',
  pickaxe: 'mining',
  ore: 'item_ore',
  bar: 'item_bar',
  gem: 'enchanting',
  key: 'item_key',
  fragment: 'runecrafting',
};

const SLOT_ITEM: Record<Slot, string> = {
  weapon: 'item_sword',
  helm: 'item_helm',
  body: 'item_body',
  gloves: 'item_gloves',
  boots: 'item_boots',
  amulet: 'item_amulet',
  ring: 'item_ring',
};

/** Faint silhouette for an empty equipment slot (style kept for API compatibility). */
export function slotIcon(slot: Slot, _style?: Style, size = 32): string {
  return icon(`slot_${slot}`, size);
}

/** Full-colour icon for an item, picked from its base's model / slot / style. */
export function itemIcon(item: Item, size = 32): string {
  const b = BASES[item.base];
  if (!b) return icon('rune', size);
  if (b.slot === 'weapon') {
    if (b.style === 'ranged') return icon('item_bow', size);
    if (b.style === 'magic') return icon('item_staff', size);
  }
  const byModel = b.model ? MODEL_ICON[b.model] : undefined;
  if (byModel) return icon(byModel, size);
  if (b.slot) return icon(SLOT_ITEM[b.slot], size);
  return icon('rune', size);
}
