/**
 * One object, one shape (AGENTS.md): something meant to read as one solid object is one continuous mesh, never
 * primitives pushed into each other. The check (tools/check-one-piece.cjs) is proven on small made-up shapes, then
 * run over every committed model, which must be clean or no worse than its allowlisted depth.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type Mesh = { name: string; chain: string[]; tris: Float64Array };
type Piece = { tris: Float64Array; names: string[]; min: number[]; max: number[]; closed: boolean };
type Pair = { joint: string; a: string; b: string; depth: number };
type Result = { model: string; pieces: number; open: number; pairs: Pair[]; worst: number };

const load = createRequire(import.meta.url);
const geometry = load('../tools/one-piece-geometry.cjs') as {
  TOUCH: number;
  meshNodes: (file: string) => Mesh[];
  pieces: (meshes: { name: string; tris: Float64Array }[]) => Piece[];
  oddCrossings: (piece: Piece, axis: number, p: number[]) => boolean;
  depthInside: (a: Piece, b: Piece) => number;
};
const check = load('../tools/check-one-piece.cjs') as {
  groups: (meshes: Mesh[]) => Map<string, Mesh[]>;
  measure: (root: string) => Result[];
  summary: (results: Result[]) => string[];
  problems: (results: Result[], allowed?: Record<string, [number, number]>) => string[];
};

/**
 * A .glb holding one triangle: positions interleaved with normals (a 24-byte stride), 16-bit indices, its mesh
 * node `child` (moved 1 up) under `parent` (scaled 2, turned a quarter about Z, moved to 1, 2, 3).
 */
function oneTriangleGlb(): Buffer {
  const vertices = new Float32Array([0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const bin = Buffer.alloc(80);
  Buffer.from(vertices.buffer).copy(bin, 0);
  Buffer.from(new Uint16Array([0, 1, 2]).buffer).copy(bin, 72);
  const s = Math.SQRT1_2;
  const json = Buffer.from(JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'parent', children: [1], translation: [1, 2, 3], rotation: [0, 0, s, s], scale: [2, 2, 2] },
      { name: 'child', mesh: 0, translation: [0, 1, 0] },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: 80 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 72, byteStride: 24 }, { buffer: 0, byteOffset: 72, byteLength: 6 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
  }));
  const jsonChunk = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + bin.length, 8);
  const chunk = (body: Buffer, type: number) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(body.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, body]);
  };
  return Buffer.concat([header, chunk(jsonChunk, 0x4e4f534a), chunk(bin, 0x004e4942)]);
}

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
  it('reads a model\'s triangles where its nodes put them', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-piece-'));
    try {
      const file = path.join(dir, 'tri.glb');
      fs.writeFileSync(file, oneTriangleGlb());
      const [m] = geometry.meshNodes(file);
      expect(m.chain).toEqual(['parent', 'child']);
      // (0,0,0), (1,0,0), (0,0,1): up 1, doubled, turned so +X points to +Y, then moved to (1, 2, 3).
      const want = [-1, 2, 3, -1, 4, 3, -1, 2, 5];
      expect([...m.tris].map((x, i) => x - want[i]).every((d) => Math.abs(d) < 1e-6)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('counts a ray along a face\'s diagonal, where two triangles meet, once', () => {
    // Every face of the box is split along a diagonal through x = y = z, so each of these rays runs exactly down
    // a shared edge on the faces it crosses.
    const [b] = geometry.pieces([mesh('box', box([0, 0, 0], [1, 1, 1]))]);
    for (const axis of [0, 1, 2]) {
      expect(geometry.oddCrossings(b, axis, [0.5, 0.5, 0.5])).toBe(true);
      expect(geometry.oddCrossings(b, axis, [0.25, 0.25, 0.25])).toBe(true);
      expect(geometry.oddCrossings(b, axis, [-0.5, -0.5, -0.5])).toBe(false);
      expect(geometry.oddCrossings(b, axis, [0, 0, 0].map((_, d) => (d === axis ? -0.5 : 0.5)))).toBe(false);
    }
  });

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

  it('passes clean models and allowlisted ones at their entry, float noise included', () => {
    expect(check.problems([result('anvil', 0), result('sword', 0.035), result('axe', 0.04000001)], { sword: [35, 1], axe: [40, 1] }))
      .toEqual([]);
  });

  it('fails a new offender, a model deeper or with more pairs, one better than its entry and stale entries', () => {
    const more = { ...result('mace', 0.02), pairs: [...result('mace', 0.02).pairs, ...result('mace', 0.01).pairs] };
    const bad = check.problems(
      [result('anvil', 0.01), result('sword', 0.036), more, result('bow', 0.02), result('staff', 0)],
      { sword: [35, 1], mace: [20, 1], bow: [30, 1], staff: [10, 1], gone: [5, 1] },
    );
    expect(bad).toHaveLength(6);
    expect(bad[0]).toMatch(/^anvil: pieces pass inside one another 10 mm deep in 1 pairs/);
    expect(bad[1]).toMatch(/^sword: pieces pass inside one another 36 mm deep in 1 pairs, worse than its allowlisted 35 mm/);
    expect(bad[2]).toMatch(/^mace: pieces pass inside one another 20 mm deep in 2 pairs, worse than/);
    expect(bad[3]).toMatch(/^bow: now 20 mm deep in 1 pairs, better than its allowlisted 30 mm .*to \[20, 1\]$/);
    expect(bad[4]).toMatch(/^staff: now one piece throughout; remove it from the allowlist/);
    expect(bad[5]).toMatch(/^gone: allowlisted but missing/);
  });
});

describe('one object, one shape: every committed model', () => {
  it('is one shape per object, or no worse than its allowlisted depth', () => {
    const results = check.measure(path.resolve(__dirname, '..'));
    console.log(check.summary(results).join('\n'));
    expect(check.problems(results)).toEqual([]);
  }, 60000);
});
