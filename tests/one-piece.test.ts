/**
 * One object, one shape (AGENTS.md): something meant to read as one solid object is one continuous mesh, never
 * primitives pushed into each other. The check (tools/check-one-piece.cjs) is proven on small made-up shapes, then
 * run over every committed model, which must be clean or no worse than its allowlisted depth.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type Mesh = { name: string; chain: string[]; tris: Float64Array };
type Piece = { tris: Float64Array; names: string[]; min: number[]; max: number[]; closed: boolean };
type Pair = { joint: string; a: string; b: string; depth: number };
type Result = { model: string; pieces: number; open: number; pairs: Pair[]; worst: number };

const load = createRequire(import.meta.url);
const geometry = load('../tools/one-piece-geometry.cjs') as {
  TOUCH: number;
  pieces: (meshes: { name: string; tris: Float64Array }[]) => Piece[];
  depthInside: (a: Piece, b: Piece) => number;
};
const check = load('../tools/check-one-piece.cjs') as {
  ALLOWED: Record<string, number>;
  groups: (meshes: Mesh[]) => Map<string, Mesh[]>;
  measure: (root: string) => Result[];
  summary: (results: Result[]) => string[];
  problems: (results: Result[], allowed?: Record<string, number>) => string[];
};

/** A closed box's 12 triangles between corners lo and hi. */
function box(lo: number[], hi: number[]): number[] {
  const c = (i: number) => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  return quads.flatMap(([a, b, d, e]) => [...c(a), ...c(b), ...c(d), ...c(a), ...c(d), ...c(e)]);
}
const mesh = (name: string, tris: number[]) => ({ name, chain: ['root', name], tris: Float64Array.from(tris) });
/** The deepest either of two pieces runs inside the other. */
const overlap = (a: Piece, b: Piece) => Math.max(geometry.depthInside(a, b), geometry.depthInside(b, a));
const twoPieces = (a: number[], b: number[]) => {
  const list = geometry.pieces([mesh('a', a), mesh('b', b)]);
  expect(list).toHaveLength(2);
  return list;
};

describe('one object, one shape: the measure', () => {
  it('welds a continuous surface split across meshes back into one closed piece', () => {
    // One box's faces exported as two meshes (as a material split would) is still one piece.
    const all = box([0, 0, 0], [1, 1, 1]);
    const list = geometry.pieces([mesh('top', all.slice(0, 36)), mesh('rest', all.slice(36))]);
    expect(list).toHaveLength(1);
    expect(list[0].closed).toBe(true);
    expect(list[0].names).toEqual(['top', 'rest']);
  });

  it('passes separate parts that rest on or sit apart from each other', () => {
    const [a, b] = twoPieces(box([0, 0, 0], [1, 1, 1]), box([0.2, 1, 0.2], [0.8, 1.5, 0.8]));
    expect(overlap(a, b)).toBe(0);
    const [c, d] = twoPieces(box([0, 0, 0], [1, 1, 1]), box([2, 0, 0], [3, 1, 1]));
    expect(overlap(c, d)).toBe(0);
    // Overlapping by less than the touch tolerance (rounding in an export) still counts as resting.
    const [e, f] = twoPieces(box([0, 0, 0], [1, 1, 1]), box([0.2, 1 - geometry.TOUCH / 2, 0.2], [0.8, 1.5, 0.8]));
    expect(overlap(e, f)).toBe(0);
  });

  it('measures how far a rod pushed into a block runs inside it', () => {
    const [block, rod] = twoPieces(box([0, 0, 0], [1, 1, 1]), box([0.45, 0.7, 0.45], [0.55, 2, 0.55]));
    // The rod's end is 0.3 inside the block's top; its sides are 0.45 from the block's sides.
    expect(overlap(block, rod)).toBeCloseTo(0.3, 2);
  });

  it('catches two bars crossed through each other, though no corner of either is inside the other', () => {
    const [x, z] = twoPieces(box([-1, -0.1, -0.1], [1, 0.1, 0.1]), box([-0.05, -0.05, -1], [0.05, 0.05, 1]));
    expect(overlap(x, z)).toBeGreaterThan(0.03);
  });

  it('only tests points against closed pieces: an open sheet has no inside', () => {
    const sheet = [-1, 0.5, -1, 1, 0.5, -1, 1, 0.5, 1, -1, 0.5, -1, 1, 0.5, 1, -1, 0.5, 1];
    const [block, plane] = geometry.pieces([mesh('block', box([0, 0, 0], [1, 1, 1])), mesh('sheet', sheet)]);
    expect(plane.closed).toBe(false);
    expect(geometry.depthInside(block, plane)).toBe(0);
    // A sheet cut through the middle of a closed block still runs inside it.
    expect(geometry.depthInside(plane, block)).toBeCloseTo(0.5, 1);
  });

  it('compares pieces only within one joint: limbs overlap and turn where they meet', () => {
    const at = (name: string, ...chain: string[]) => ({ name, chain: [...chain, name], tris: new Float64Array() });
    const meshes = [
      at('torso', 'DB_hero_root', 'body'),
      at('belt', 'DB_hero_root', 'body', 'outfit_body_belt'),
      at('upper_arm', 'DB_hero_root', 'body', 'armL'),
      at('blade', 'DB_x_root', 'sock_handR.003', 'bowbody.001'),
      at('loose', 'DB_x_root'),
      at('jaw', 'DB_x_root', 'head'),
    ];
    const g = check.groups(meshes);
    expect([...g.keys()]).toEqual([
      'DB_hero_root/body', 'DB_hero_root/body/armL', 'DB_x_root/sock_handR.003/bowbody.001', 'DB_x_root', 'DB_x_root/head/jaw',
    ]);
    expect(g.get('DB_hero_root/body')!.map((m) => m.name)).toEqual(['torso', 'belt']);
  });
});

describe('one object, one shape: the allowlist', () => {
  const result = (model: string, worst: number): Result => ({
    model, pieces: 2, open: 0, worst,
    pairs: worst ? [{ joint: 'root', a: 'p1', b: 'p2', depth: worst }] : [],
  });

  it('passes clean models and allowlisted ones at their depth', () => {
    expect(check.problems([result('anvil', 0), result('sword', 0.035)], { sword: 35 })).toEqual([]);
  });

  it('fails a new offender, a model past its depth, one below it and stale entries', () => {
    const bad = check.problems(
      [result('anvil', 0.01), result('sword', 0.036), result('bow', 0.02), result('staff', 0)],
      { sword: 35, bow: 30, staff: 10, gone: 5 },
    );
    expect(bad).toHaveLength(5);
    expect(bad[0]).toMatch(/^anvil: 1 pairs of pieces pass inside one another, worst 10 mm/);
    expect(bad[1]).toMatch(/^sword: pieces pass 36 mm inside one another, past its allowlisted 35 mm/);
    expect(bad[2]).toMatch(/^bow: worst overlap now 20 mm, below its allowlisted 30 mm; lower its entry/);
    expect(bad[3]).toMatch(/^staff: now one piece throughout; remove it from the allowlist/);
    expect(bad[4]).toMatch(/^gone: allowlisted but missing/);
  });
});

describe('one object, one shape: every committed model', () => {
  it('is one shape per object, or no worse than its allowlisted depth', () => {
    const results = check.measure(path.resolve(__dirname, '..'));
    console.log(check.summary(results).join('\n'));
    expect(check.problems(results)).toEqual([]);
  }, 60000);
});
