import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/data/zones';
import { cellRole, isVoid, stairSteps } from '../src/world/building';
import { buildKeep } from '../src/world/castle/keepModel';
import { FRONTISPIECE, GREAT_DOOR, KEEP_H, KEEP_SPEC, KEEP_WINDOWS, TURRET, TURRETS, WALK_DOOR_U } from '../src/world/castle/keepSpec';
import { CROWN_Y, CURTAIN, KEEP, MOAT, RANGE, TERRACE_Y } from '../src/world/castle/plan';
import { Cell } from '../src/world/layout';

/**
 * The great keep's own model (castle v4, stage 2): its heights as the plan gives them, a window
 * scheme that falls storey by storey with every window inside one storey, real windows into the
 * throne hall, the cut that opens it round the hero on either floor, and the masses round it standing
 * on the grid. (The castle's geometry audit tests its blocks against each other and the rest.)
 */
const K = buildKeep(KEEP_SPEC, TERRACE_Y);
K.obj.updateMatrixWorld(true);
const [floorG, built, lifted, , mid] = K.obj.children;
const box = new THREE.Box3().setFromObject(K.obj);

describe('the great keep', () => {
  it('rises to its battlements at +28, its turrets to +34.5 and their spires to +44, its plinth founded on the moat\'s bed', () => {
    // (Heights over the crown, as the plan states them.)
    expect(TERRACE_Y + KEEP_H.coping + 0.9 - CROWN_Y).toBeCloseTo(28, 0);
    expect(TERRACE_Y + TURRET.deck + 1.5 - CROWN_Y).toBeCloseTo(34.5, 0);
    expect(TERRACE_Y + TURRET.spireTip - CROWN_Y).toBe(44);
    // The great flag's finial and the spires' finials over them; the plinth's foot under the bed.
    expect(box.max.y).toBeGreaterThan(TERRACE_Y + TURRET.spireTip);
    expect(box.min.y).toBeLessThanOrEqual(MOAT.bed);
    expect(TERRACE_Y + KEEP_H.walk - CROWN_Y).toBeCloseTo(7.06, 2);
  });

  it('stands on its plan: the turrets on its corners, the frontispiece on the axis, the great door 8 m to its apex', () => {
    expect(TURRETS.map((t) => [KEEP.rect[0] + t.x, KEEP.rect[1] + t.z])).toEqual([[64, 15], [88, 15], [64, 39], [88, 39]]);
    expect(KEEP.rect[0] + (FRONTISPIECE.x0 + FRONTISPIECE.x1) / 2).toBe(KEEP.door.x);
    expect(GREAT_DOOR.apex).toBe(8);
    // The wall walk's door on each flank stands on the walk's middle.
    expect(KEEP.rect[1] + WALK_DOOR_U).toBeCloseTo(CURTAIN.north + 0.445, 6);
  });

  it('every window lies within one storey and lights a room; sizes fall storey by storey; one showpiece', () => {
    expect(KEEP_WINDOWS.filter((w) => w.kind === 'showpiece')).toHaveLength(1);
    for (const w of KEEP_WINDOWS) {
      const head = w.sill + w.h, name = `${w.side}@${w.u} sill ${w.sill}`;
      if (w.chamber) {
        // The great chamber's lights: over its floor, under the machicolations.
        expect(w.sill, name).toBeGreaterThan(KEEP_H.chamber + 1);
        expect(head, name).toBeLessThan(KEEP_H.corbels - 1);
      } else {
        // The throne hall's: under the great chamber's floor (and the course on it), and a low one
        // on the back under the council gallery's floor.
        expect(head, name).toBeLessThan(KEEP_H.chamber - 0.5);
        if (w.side === 'n' && w.sill < KEEP_H.gallery) expect(head, name).toBeLessThan(KEEP_H.gallery - 0.5);
      }
      // Never across a string course.
      for (const c of KEEP_H.courses) expect(head < c - 0.5 || w.sill > c + 0.5, name).toBe(true);
    }
    // On the back, each axis climbs from a small lancet to a tall one, a pair, and a small light.
    const axis = KEEP_WINDOWS.filter((w) => w.side === 'n' && w.u === 6.5).sort((a, b) => a.sill - b.sill).map((w) => w.kind);
    expect(axis).toEqual(['lancet', 'lancet', 'pair', 'square']);
    const tall = KEEP_WINDOWS.filter((w) => w.side === 'n' && w.u === 6.5).sort((a, b) => a.sill - b.sill);
    expect(tall[1].h).toBeGreaterThan(tall[0].h);
    expect(tall[3].h).toBeLessThan(tall[2].h);
  });

  it('the showpiece is a real window: looking in through its glass you see into the throne hall', () => {
    const meshes: THREE.Mesh[] = [];
    K.obj.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    const show = KEEP_WINDOWS.find((w) => w.kind === 'showpiece')!;
    // Through the west light of its tracery, from out over the terrace.
    const from = new THREE.Vector3(KEEP.door.x - 1.0, TERRACE_Y + show.sill + 2, KEEP.rect[3] + 8);
    const hits = new THREE.Raycaster(from, new THREE.Vector3(0, 0, -1)).intersectObjects(meshes, false);
    const glass = hits.find((h) => h.object.name === 'glass');
    expect(glass, 'the showpiece has glass').toBeDefined();
    const solid = hits.find((h) => h.object.name !== 'glass' && h.object.name !== 'room' && !((h.object as THREE.Mesh).material as THREE.Material).transparent);
    // The first solid thing past the glass stands inside the hall, beyond the wall's inner face.
    expect(solid ? solid.point.z : -Infinity).toBeLessThan(KEEP.rect[3] - 1.1);
  });

  it('opens round the hero: the camera side, the galleries and the roof on the ground floor; the roof and the great chamber upstairs', () => {
    expect([mid.visible, lifted.visible]).toEqual([true, true]);
    K.setCut(1, 0);
    expect([built.visible, floorG.visible, mid.visible, lifted.visible]).toEqual([true, true, false, false]);
    K.setCut(1, 1);
    expect([mid.visible, lifted.visible]).toEqual([true, false]);
    K.setCut(0, 0);
    expect([mid.visible, lifted.visible]).toEqual([true, true]);
    // What lifts on the ground floor stands over its base course.
    const liftBox = new THREE.Box3().setFromObject(lifted), midBox = new THREE.Box3().setFromObject(mid);
    expect(Math.min(liftBox.min.y, midBox.min.y)).toBeGreaterThan(TERRACE_Y + 0.9);
    // It opens inside it, and at the great hall's dais and the chapel's west end against it.
    expect(K.contains(KEEP.door.x, 27)).toBe(true);
    expect(K.contains(RANGE.hall[2] - 3, 29)).toBe(true);
    expect(K.contains(RANGE.chapel[0] + 3, 29)).toBe(true);
    expect(K.contains(KEEP.door.x, KEEP.rect[3] + 6)).toBe(false);
    expect(K.contains(RANGE.hall[0] + 4, 29)).toBe(false);
  });

  it('the stairs\' half landings lie open to the hall, their doors into the turrets clear over them', () => {
    for (const st of KEEP_SPEC.stairs!) {
      const [x0, z0, x1, z1] = st.turns![0].landing, top = stairSteps(st, KEEP_SPEC.storeyH!)[1].y0;
      for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) expect(isVoid(KEEP_SPEC, x, z), `${x},${z}`).toBe(true);
      // A turret door (three metres to its apex) fits under nothing.
      expect(top + 3.0).toBeLessThan(KEEP_H.chamber);
    }
  });

  it('builds with finite geometry', () => {
    let bad = 0;
    K.obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const a = o.geometry.getAttribute('position').array as ArrayLike<number>;
      for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) bad++;
    });
    expect(bad).toBe(0);
  });
});

describe('the keep on the grid', () => {
  const L = ZONES.keep.build(1000 + 'keep'.length * 97), at = (x: number, z: number) => L.cells[z * L.w + x];
  it('its front turrets and frontispiece block the terrace they stand on; the great door\'s porch stays open', () => {
    for (const [x, z] of [[62, 41], [90, 41], [65, 41], [72, 39], [79, 40]]) expect(at(x, z), `${x},${z}`).toBe(Cell.Blocked);
    for (let x = KEEP.door.x - KEEP.door.w / 2; x < KEEP.door.x + KEEP.door.w / 2; x++) for (const z of [39, 40]) expect(at(x, z), `porch ${x},${z}`).toBe(Cell.Ground);
    // The side bays' fronts between the turrets and the frontispiece stay terrace.
    expect(at(69, 41)).toBe(Cell.Ground);
    expect(cellRole(KEEP_SPEC, 76, 38)).toBe('door');
  });
});
