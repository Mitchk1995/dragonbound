/**
 * The drawing kit behind the icon set: the palette, the per-icon Pen that collects gradients, glows and clip
 * paths under unique ids, and the small shape helpers every drawing uses.
 */
export const OUT = '#140c06';
export const SW = 2.75; // outline width on the 64 grid
export const GHOST = '#cdbb95';
export const GHOST_SW = 2.4;

export type Tone =
  | 'iron' | 'gold' | 'blood' | 'poison' | 'wood' | 'bone'
  | 'leather' | 'stone' | 'violet' | 'darkIron' | 'redLeather';

/** [lit, mid, shadow] */
const TONE: Record<Tone, [string, string, string]> = {
  iron: ['#b9c2cc', '#8d959f', '#5f6670'],
  darkIron: ['#8d959f', '#646b75', '#41464d'],
  gold: ['#f3d98a', '#d8b25a', '#a07a30'],
  blood: ['#d9503a', '#b02a1a', '#6e1409'],
  poison: ['#a8e27e', '#6cc24a', '#3b7d27'],
  wood: ['#9a6a42', '#6b4426', '#482b17'],
  bone: ['#fbf6ea', '#eee4cc', '#c9b893'],
  leather: ['#b27b4a', '#8a5530', '#5c361a'],
  redLeather: ['#a8412c', '#7e2a1b', '#521509'],
  stone: ['#aea896', '#827b6c', '#57524a'],
  violet: ['#e2bcff', '#a45ee0', '#62279a'],
};

export const HI = '#fffaf0'; // highlight colour
export const IRON_LINE = '#4a5058';
export const HOLE = '#1f1610';

export type Dir = 'd' | 'h' | 'v' | 'a';
const DIRS: Record<Dir, [number, number, number, number]> = {
  d: [0, 0, 1, 1], // top-left light
  h: [0, 0, 1, 0],
  v: [0, 0, 0, 1],
  a: [0.2, 0, 0.8, 1], // mostly vertical, slight diagonal
};

export const n2 = (v: number) => Math.round(v * 100) / 100;

/** Per-call drawing context: collects <defs> with unique ids. */
export class Pen {
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

/** One icon's drawing: its SVG body, drawn with the given pen. */
export type Draw = (c: Pen) => string;

// ---------------------------------------------------------------- tiny helpers

export const P = (d: string, attrs = '') => `<path d="${d}" ${attrs}/>`;
export const C = (cx: number, cy: number, r: number, attrs = '') => `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}" ${attrs}/>`;
export const E = (cx: number, cy: number, rx: number, ry: number, attrs = '') =>
  `<ellipse cx="${n2(cx)}" cy="${n2(cy)}" rx="${n2(rx)}" ry="${n2(ry)}" ${attrs}/>`;
export const R = (x: number, y: number, w: number, h: number, rx: number, attrs = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${attrs}/>`;
/** Highlight stroke (no outline). */
export const hiStroke = (d: string, w = 2, op = 0.75, color = HI) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" opacity="${op}"/>`;
/** Highlight blob (no outline). */
export const hiFill = (d: string, op = 0.55, color = HI) => `<path d="${d}" fill="${color}" stroke="none" opacity="${op}"/>`;
export const line = (d: string, color: string, w: number, op = 1) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"${op < 1 ? ` opacity="${op}"` : ''}/>`;

const rad = (deg: number) => (deg * Math.PI) / 180;
export const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => [
  cx + r * Math.cos(rad(deg)),
  cy + r * Math.sin(rad(deg)),
];
const pts = (list: [number, number][]) => list.map(([x, y], i) => `${i ? 'L' : 'M'}${n2(x)} ${n2(y)}`).join(' ') + ' Z';

/** 4-point sparkle path. */
export function star4(cx: number, cy: number, r: number, ri = r * 0.26): string {
  return pts([
    [cx, cy - r], [cx + ri, cy - ri], [cx + r, cy], [cx + ri, cy + ri],
    [cx, cy + r], [cx - ri, cy + ri], [cx - r, cy], [cx - ri, cy - ri],
  ]);
}

/** Sparkle with outline. */
export const spark = (c: Pen, cx: number, cy: number, r: number, fill = '#fff6d0') =>
  c.hl(P(star4(cx, cy, r), `fill="${fill}" stroke-width="${r > 5 ? 2 : 1.6}"`));

export function wavyD(cx: number, cy: number, r: number, bumps: number, amp: number): string {
  const list: [number, number][] = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * 360;
    list.push(polar(cx, cy, r + amp * Math.cos(rad(a * bumps)), a));
  }
  return pts(list);
}

export function spiralD(cx: number, cy: number, r0: number, r1: number, turns: number, start = 0): string {
  const n = Math.round(turns * 36);
  const out: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, y] = polar(cx, cy, r0 + (r1 - r0) * t, start + t * turns * 360);
    out.push(`${i ? 'L' : 'M'}${n2(x)} ${n2(y)}`);
  }
  return out.join(' ');
}
