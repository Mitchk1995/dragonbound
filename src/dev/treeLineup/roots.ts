import * as THREE from 'three';
import type { Game } from '../../game';
import { GROWN, GROWN_KINDS, grownTrees, grownTriangles, TREE_STYLE, type GrownKind } from '../../world/trees';
import { OCCLUDE } from '../../world/worldView';
import { closeUp, LADDER_NAMES, ladderLineup } from './ladder';
import { CLOSE_DIR, frames, freeShot, gameplayCamera, plantTree, restore, sheetShot, standHero, type SheetView, type Shot } from './stage';

/** Where the zone's grown trees stand, each with its kind, how steeply the ground falls away round its foot (the most it drops within 2 m, per metre) and toward which way. */
function grownInZone(g: Game) {
  const trunks = new Map<THREE.BufferGeometry, GrownKind>();
  for (const k of GROWN_KINDS) for (const geo of grownTrees(k).trunk) trunks.set(geo, k);
  const out: { p: THREE.Vector3; k: GrownKind; fall: number; down: number }[] = [];
  const m = new THREE.Matrix4(), hAt = g.zone.view.heightAt;
  g.zone.group.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh) || !trunks.has(o.geometry)) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      const p = new THREE.Vector3().setFromMatrixPosition(m);
      let fall = 0, down = 0;
      for (let a = 0; a < 16; a++) {
        for (const r of [1, 2]) {
          const f = (p.y + 0.05 - hAt(p.x + Math.cos((a / 8) * Math.PI) * r, p.z + Math.sin((a / 8) * Math.PI) * r)) / r;
          if (f > fall) [fall, down] = [f, (a / 8) * Math.PI];
        }
      }
      out.push({ p, k: trunks.get(o.geometry)!, fall, down });
    }
  });
  return out;
}

/**
 * The roots and crowns of every grown kind (`trees:roots`), after the owner's first tree notes:
 * - trees-ladder, and trees-<kind>-close for the magic tree, the yew and the willow (the pictures he
 *   pinned), as the ladder takes them;
 * - trees-roots-<kind>: each of the kind's shapes low at its foot, from the front and from behind;
 * - trees-crowns-<kind>: each shape from the side at the hero's eye height, from two sides (bare
 *   limbs poking out of the crown show against the sky);
 * - trees-slope-<n> / trees-slope-<n>-low: grown trees of the Foothills as they ship where the ground
 *   falls away steepest round them, through the gameplay camera and low beside the trunk.
 */
export async function rootsSuite(g: Game, shot: Shot) {
  const out: Record<string, unknown> = {};
  const shipped = TREE_STYLE.value;
  out.triangles = Object.fromEntries(GROWN_KINDS.map((k) => [k, grownTriangles(k)]));
  const stage = new THREE.Group();
  try {
    const { c, hidden } = await ladderLineup(g, shot, stage);
    hidden.forEach((o) => (o.visible = true));
    for (const kind of ['magic', 'yew', 'willow'] as GrownKind[]) await closeUp(g, shot, stage, kind, c);

    // Each kind's shapes on their own in the meadow, the wood round them hidden.
    hidden.forEach((o) => (o.visible = false));
    g.player.obj.visible = false;
    const az = Math.atan2(CLOSE_DIR.z, CLOSE_DIR.x);
    for (const kind of GROWN_KINDS) {
      const n = grownTrees(kind).canopy.length;
      const planted = Array.from({ length: n }, (_, v) => plantTree(g, stage, kind, c.x, c.z, v, 0.9, GROWN[kind].look.palette[0]));
      const solo = (v: number) => () => planted.forEach((p, i) => p.meshes.forEach((mesh) => (mesh.visible = i === v)));
      const pos = planted[0].pos, sp = GROWN[kind].species, d = 3.2 + sp.trunk * 7;
      const around = (a: number, r: number, y: number) => pos.clone().add(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      const roots: SheetView[] = [], crowns: SheetView[] = [];
      for (const [side, a] of [['front', az], ['back', az + Math.PI]] as const) {
        for (let v = 0; v < n; v++) roots.push({ label: `${LADDER_NAMES[kind]} ${v + 1}, ${side}`, prepare: solo(v), eye: around(a, d, 1.1), look: pos.clone().add(new THREE.Vector3(0, 0.35, 0)) });
        const h = sp.height[1];
        for (let v = 0; v < n; v++) crowns.push({ label: `${LADDER_NAMES[kind]} ${v + 1}, ${side}`, prepare: solo(v), eye: around(a + Math.PI / 2, h * 1.9, 1.7), look: pos.clone().add(new THREE.Vector3(0, h * 0.5, 0)) });
      }
      await sheetShot(g, shot, `trees-roots-${kind}`, roots, n);
      await sheetShot(g, shot, `trees-crowns-${kind}`, crowns, n);
      stage.clear();
    }
    g.player.obj.visible = true;

    // Grown trees where the ground falls away round them, as the Foothills ship.
    hidden.forEach((o) => (o.visible = true));
    const trees = grownInZone(g);
    /** Walkable ground 3 to 7 m from a tree, nearest first (where the hero stands beside it). */
    const near = (p: THREE.Vector3) => {
      for (let d = 3; d <= 7; d += 1) for (let a = 0; a < 12; a++) {
        const x = p.x + Math.cos((a / 6) * Math.PI) * d, z = p.z + Math.sin((a / 6) * Math.PI) * d;
        if (g.zone.nav.isWalkable(x, z)) return { x, z };
      }
      return null;
    };
    const pickFall = (lo: number, hi: number) => trees.filter((t) => t.fall >= lo && t.fall < hi && near(t.p)).sort((a, b) => b.fall - a.fall)[0];
    const slopes = [pickFall(0.25, 0.45), pickFall(0.45, 0.8), pickFall(0.8, 1.5), pickFall(1.5, 9)].filter((t) => t);
    out.slopes = slopes.map((t) => ({ kind: t.k, at: [t.p.x, t.p.z], fall: t.fall }));
    for (let i = 0; i < slopes.length; i++) {
      const t = slopes[i], spot = near(t.p)!;
      standHero(g, spot.x, spot.z);
      g.debug.hold = () => {
        OCCLUDE.uOccOn.value = 0;
        gameplayCamera(g, t.p.x, t.p.y, t.p.z, 0.7);
        return false;
      };
      await frames(4);
      await shot(`trees-slope-${i + 1}`);
      g.debug.hold = null;
      // (On its downhill side, a little above its foot and looking at it: where a root would hang out of the ground.)
      const r = 3.5 + GROWN[t.k].species.trunk * 6, eye = t.p.clone().add(new THREE.Vector3(Math.cos(t.down) * r, 0, Math.sin(t.down) * r));
      eye.y = Math.max(g.zone.view.heightAt(eye.x, eye.z), t.p.y) + 1.6;
      await freeShot(g, shot, `trees-slope-${i + 1}-low`, eye, t.p.clone().add(new THREE.Vector3(0, 0.2, 0)), 12);
    }
  } finally {
    g.player.obj.visible = true;
    restore(g, stage, shipped);
  }
  return out;
}
