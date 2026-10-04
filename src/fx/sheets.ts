/**
 * Where the effects' painted frames lie in their textures (public/textures/fx/, packed by tools/blender/vfx.py from the
 * Codex library's effect sheets): which texture, and which of its cells.
 *
 * A page is a square texture cut into a grid of cells. A sheet is a run of frames on a page, four to a row, read left
 * to right and top to bottom from its first cell (a flipbook of 16, or a few still variants). Cells count from the
 * page's top left.
 */

/** How a page is drawn: adding its light (painted on black), or over what lies behind (colour premultiplied by coverage). */
export type Blend = 'add' | 'alpha';

export interface Page {
  file: string;
  blend: Blend;
  /** Cells across (and down). */
  grid: number;
}

export const PAGES = {
  impact: { file: 'fx-impact.jpg', blend: 'add', grid: 4 },
  crit: { file: 'fx-crit.jpg', blend: 'add', grid: 4 },
  explosion: { file: 'fx-explosion.jpg', blend: 'add', grid: 4 },
  frost: { file: 'fx-frost.jpg', blend: 'add', grid: 4 },
  teleport: { file: 'fx-teleport.jpg', blend: 'add', grid: 4 },
  a: { file: 'fx-page-a.jpg', blend: 'add', grid: 8 },
  b: { file: 'fx-page-b.jpg', blend: 'add', grid: 8 },
  c: { file: 'fx-page-c.webp', blend: 'alpha', grid: 8 },
} as const satisfies Record<string, Page>;

export type PageId = keyof typeof PAGES;

export interface Sheet {
  page: PageId;
  /** The first frame's cell. */
  col: number;
  row: number;
  frames: number;
}

const sheet = (page: PageId, col: number, row: number, frames = 16): Sheet => ({ page, col, row, frames });

/**
 * Every sheet. Flipbooks (16 frames) play once over a sprite's life or loop at a rate; the shapes (single cells, and
 * the four-frame flame) are the particles' own.
 */
export const SHEETS = {
  // 256 px frames, one sheet a page.
  impact: sheet('impact', 0, 0),
  crit: sheet('crit', 0, 0),
  explosion: sheet('explosion', 0, 0),
  frostBurst: sheet('frost', 0, 0),
  teleport: sheet('teleport', 0, 0),
  // Page A: fire, and the particles' shapes in its bottom right quarter.
  torch: sheet('a', 0, 0),
  bonfire: sheet('a', 4, 0),
  fireball: sheet('a', 0, 4),
  mote: sheet('a', 4, 4, 1),
  glint: sheet('a', 5, 4, 1),
  shard: sheet('a', 6, 4, 1),
  flame: sheet('a', 4, 5, 4),
  // Page B.
  electric: sheet('b', 0, 0),
  sparkle: sheet('b', 4, 0),
  arcane: sheet('b', 0, 4),
  heal: sheet('b', 4, 4),
  // Page C, drawn over what lies behind.
  smoke: sheet('c', 0, 0),
  dust: sheet('c', 4, 0),
  poof: sheet('c', 0, 4),
  /** Four blood drops and splashes in grey, each creature's blood tinting them. */
  blood: sheet('c', 4, 4, 4),
  /** Four puffs of smoke. */
  puff: sheet('c', 4, 6, 4),
} as const satisfies Record<string, Sheet>;

export type SheetId = keyof typeof SHEETS;

/** The cell of a sheet's frame `i` (frames run four to a row). */
export function frameCell(s: Sheet, i: number): { col: number; row: number } {
  const f = Math.min(Math.max(0, Math.floor(i)), s.frames - 1);
  return { col: s.col + (f % 4), row: s.row + Math.floor(f / 4) };
}

/** A frame's rectangle on its page as fractions of the page, top left first: [u0, v0, u1, v1] (v down). */
export function frameRect(s: Sheet, i: number): [number, number, number, number] {
  const { col, row } = frameCell(s, i);
  const g = PAGES[s.page].grid;
  return [col / g, row / g, (col + 1) / g, (row + 1) / g];
}
