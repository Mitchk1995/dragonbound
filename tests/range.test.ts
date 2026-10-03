import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CURTAIN_WALL } from '../src/data/castle';
import { cellRole, fitsOf, sideLen, type Side } from '../src/world/building';
import { buildBuilding, type CastleSpec } from '../src/world/buildingModel';
import { KEEP_H } from '../src/world/castle/keepSpec';
import { CROWN_Y, CURTAIN, RANGE, TERRACE_Y } from '../src/world/castle/plan';
import { pitchOf } from '../src/world/castle/rangeParts';
import { RANGE_SPECS } from '../src/world/castle/rangeSpecs';

/**
 * The north range and the bailey's buildings (castle v4, stage 5): their heights as the plan gives
 * them, each building's own window scheme with every window inside one storey and clear of its doors,
 * the north range built hard against the curtain, the stables' stalls each with its horse at its
 * half-door. (The castle's geometry audit tests their blocks against each other and the rest.)
 */
const B = Object.fromEntries(RANGE_SPECS.map((b) => [b.id, b as CastleSpec]));
const floorOf = (b: CastleSpec) => (b.z < 44 ? TERRACE_Y : CROWN_Y);
const UP = TERRACE_Y - CROWN_Y;

describe('the north range and the bailey\'s buildings', () => {
  it('the great hall and the chapel take steep slate roofs: eaves at +12, ridges at +20.9 under the keep\'s lights, the lantern to +24.6 and the flèche to +27', () => {
    for (const id of ['great_hall', 'chapel']) {
      const b = B[id], R = b.look!.roof!;
      expect(b.wallH + UP, id).toBe(12);
      expect(R.ridge + UP, id).toBeCloseTo(20.9, 6);
      // (Under the keep's small lights over them, which start at +21.36.)
      expect(R.ridge + UP, id).toBeLessThan(TERRACE_Y - CROWN_Y + KEEP_H.chamber + 1.36);
      const P = pitchOf(b.d, b.wallH, R.ridge);
      // Steep: over fifty degrees.
      expect((Math.atan(P.t) * 180) / Math.PI, id).toBeGreaterThan(50);
      // The model reaches its ridge and what stands on it, no higher.
      const box = new THREE.Box3().setFromObject(buildBuilding(b, floorOf(b)).obj);
      const tip = Math.max(R.ridge, R.lantern?.tip ?? 0, R.fleche?.tip ?? 0);
      expect(box.max.y - floorOf(b), id).toBeGreaterThan(tip - 0.3);
      expect(box.max.y - floorOf(b), id).toBeLessThan(tip + 0.6);
    }
    expect(B.great_hall.look!.roof!.lantern!.tip + UP).toBeCloseTo(24.6, 6);
    expect(B.chapel.look!.roof!.fleche!.tip + UP).toBeCloseTo(27, 6);
    // The lantern stands over the open hearth, on the ridge.
    const hearth = fitsOf(B.great_hall).find((f) => f.kind === 'open_hearth')!, R = B.great_hall.look!.roof!;
    expect(hearth.x).toBe(R.lantern!.u);
    expect(hearth.z).toBeCloseTo(pitchOf(B.great_hall.d, B.great_hall.wallH, R.ridge).zr, 6);
    // The flèche stands over the chapel's south door.
    const door = B.chapel.doors.find((d) => d.side === 's')!;
    expect(R && B.chapel.look!.roof!.fleche!.u).toBe(door.at + door.w / 2);
  });

  it('the kitchen, the solar, the stables and the barracks keep flat roofs behind battlements, the stables and barracks under the wall walk', () => {
    for (const id of ['kitchen', 'solar', 'stables', 'barracks']) expect(B[id].look!.roof, id).toBeUndefined();
    // (Their parapets, 1.88 over their walls, stay under the walk where the curtain is their back wall.)
    for (const id of ['stables', 'barracks']) expect(B[id].wallH + 1.88, id).toBeLessThan(CURTAIN_WALL.walkY);
  });

  it('every building has its own window scheme, every window inside one storey, clear of the doors and of each other', () => {
    const schemes = RANGE_SPECS.map((b) => new Set(((b as CastleSpec).look?.windows ?? []).map((w) => w.kind)));
    for (const s of schemes) expect(s.size).toBeGreaterThan(0);
    // No two buildings share the same set of kinds.
    const keys = schemes.map((s) => [...s].sort().join('+'));
    expect(new Set(keys).size).toBe(keys.length);
    for (const b of RANGE_SPECS as CastleSpec[]) {
      const ws = b.look?.windows ?? [];
      for (const w of ws) {
        const name = `${b.id} ${w.kind} ${w.side}@${w.u}`, L = sideLen(b, w.side);
        expect(w.u - w.w / 2, name).toBeGreaterThan(1);
        expect(w.u + w.w / 2, name).toBeLessThan(L - 1);
        // Within one storey: a ground-floor window under the upper floor, an upper one over it, and
        // every head under the eaves' course.
        const head = w.sill + w.h, up = b.storeyH && b.storeyH < b.wallH && !b.look?.gallery ? b.storeyH : undefined;
        if (up !== undefined) expect(head < up - 0.3 || w.sill > up, name).toBe(true);
        const lr = b.look?.loft?.rect, under = lr && (w.side === 'n' || w.side === 's') && w.u > lr[0] && w.u < lr[2];
        if (under && w.kind !== 'stall' && w.kind !== 'loft') expect(head < b.look!.loft!.y - 0.2 || w.sill >= b.look!.loft!.y, name).toBe(true);
        expect(head, name).toBeLessThan(b.wallH - 0.5);
        // Clear of the doors in its wall (a window over a door stands over its arch).
        for (const d of b.doors.filter((dr) => dr.side === w.side)) {
          const across = w.u + w.w / 2 > d.at - 0.4 && w.u - w.w / 2 < d.at + d.w + 0.4;
          if (across) expect(w.sill - (w.kind === 'oriel' ? 0.9 : 0), name).toBeGreaterThan(4.55);
        }
        for (const o of ws) if (o !== w && o.side === w.side && Math.abs(o.u - w.u) < (o.w + w.w) / 2 + 0.3) {
          expect(o.sill > head || w.sill > o.sill + o.h, `${name} and ${o.kind}@${o.u}`).toBe(true);
        }
      }
    }
  });

  it('the north range stands hard against the curtain: its back walls walled up to the curtain\'s inner face under the walk', () => {
    const face = CURTAIN.north + CURTAIN.T / 2;
    for (const id of ['kitchen', 'great_hall', 'chapel', 'solar']) {
      const b = B[id], fill = b.look!.fill!.find((f) => f.side === 'n')!;
      expect(b.z + 0.05 - fill.steps[0].out, id).toBeCloseTo(face, 6);
      // Up to the walk's corbels, and a slip up past its deck to its inner coping.
      expect(fill.steps.at(-1)!.top + UP, id).toBeGreaterThan(CURTAIN_WALL.walkY);
    }
    expect(B.kitchen.look!.fill!.some((f) => f.side === 'w')).toBe(true);
    expect(B.solar.look!.fill!.some((f) => f.side === 'e')).toBe(true);
    // The range runs end to end between the curtain's side runs, the keep between the hall and the chapel.
    expect(RANGE.kitchen[0] - 1 + 0.05).toBeCloseTo(CURTAIN.west + CURTAIN.T / 2 - 0.05, 6);
  });

  it('the stables: six stalls either side of the aisle, a horse in each looking out over its half-door; the barracks their mirror', () => {
    const s = B.stables, stalls = fitsOf(s).filter((f) => f.kind === 'horse_stall'), doors = s.look!.windows!.filter((w) => w.kind === 'stall');
    expect(stalls).toHaveLength(6);
    expect(doors).toHaveLength(6);
    for (const f of stalls) {
      // Its half-door in the wall it faces (north for the north row, south for the south).
      const side: Side = f.z < s.d / 2 ? 'n' : 's';
      expect(doors.some((d) => d.side === side && Math.abs(d.u - f.x) < 0.01), `stall at ${f.x},${f.z}`).toBe(true);
      expect(Math.abs(((f.rot ?? 0) - (side === 'n' ? Math.PI : 0)) % (2 * Math.PI))).toBeLessThan(1e-6);
    }
    // The aisle between the rows runs from the feed bay to the tack room, every cell of it floor.
    for (let x = s.x + 5; x < s.x + 15; x++) for (const z of [s.z + 4, s.z + 5]) expect(cellRole(s, x, z), `${x},${z}`).toBe('floor');
    // The barracks mirror the stables: the gable doors face each other, the lofts at one height.
    expect(B.barracks.look!.loft!.y).toBe(s.look!.loft!.y);
    expect(B.barracks.wallH).toBe(s.wallH);
  });
});
