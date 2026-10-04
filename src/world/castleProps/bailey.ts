/** The castle's bailey: the fountain, kerbs, gardens, statuary, stable and its fittings. */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelKit, PAL, type V3 } from '../../render/kit';
import { KERB_W } from '../kerbStones';
import { COURSE, drumStones, laidRun } from '../../render/masonry';
import { GROW } from '../castle/plan';
import { hash01, octagon, prism, taper, wedge } from '../../render/blocks';
import { GROWN, grownTrees, type GrownKind } from '../trees';
import { shareResource } from '../../render/resources';
import { crossedRibbons, fallingWaterMaterial, mistTexture, planarReflection, pour, poolWater, type Impact } from '../water';
import { type Builder, ASHLAR, ASHLAR_L, ball, BASE, BELLY, brokenFoam, BRONZE, BRONZE_D, BRONZE_L, cb, DRESS, drum, IRON, GILT, HERALD_BLUE, HERALD_BLUE_D, KERB, laidBand, LAMP_NAVY, lenOf, limb, MARBLE, MARBLE_D, MARBLE_L, MEMBRANE, PLANT, pointedArch, spread, STONE, STONE_D, STONE_L, vOf, WOOD, WOOD_D, WOOD_L, WORN } from '../props';

/**
 * A band `w` wide and `h` high along a polyline in plan (points (x, z), closed into a loop when
 * `closed`): one piece per stretch, each mitred to its neighbours so they meet edge to edge, extruded
 * up from y = 0 and merged into one shape (`bevel` rounds its top edges). The audit sees each stretch
 * as its own box along it.
 */
export function mitredBand(pts: THREE.Vector2[], closed: boolean, w: number, h: number, bevel = 0) {
  const pieces = mitredPieces(pts, closed, w, h, bevel);
  const geo = mergeGeometries(pieces)!;
  geo.computeVertexNormals();
  geo.userData.boxes = pieces.flatMap((p) => p.userData.boxes);
  return geo;
}

function mitredPieces(pts: THREE.Vector2[], closed: boolean, w: number, h: number, bevel: number) {
  const n = pts.length, hw = w / 2;
  const dir = (i: number) => pts[(i + 1) % n].clone().sub(pts[i]).normalize();
  const left = (d: THREE.Vector2) => new THREE.Vector2(-d.y, d.x);
  /** The mitre at a corner: the offset to its left edge for a unit half width. */
  const mitre = (i: number) => {
    const open = !closed && (i === 0 || i === n - 1);
    if (open) return left(dir(i === 0 ? 0 : n - 2));
    const d0 = dir((i - 1 + n) % n), d1 = dir(i), m = left(d0).add(left(d1)).normalize();
    return m.divideScalar(Math.max(0.35, m.dot(left(d1))));
  };
  const pieces: THREE.BufferGeometry[] = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const j = (i + 1) % n, a = pts[i], b = pts[j], ma = mitre(i), mb = mitre(j);
    const outA = a.clone().addScaledVector(ma, hw), outB = b.clone().addScaledVector(mb, hw), inA = a.clone().addScaledVector(ma, -hw), inB = b.clone().addScaledVector(mb, -hw);
    const shape = new THREE.Shape([outA, outB, inB, inA].map((p) => new THREE.Vector2(p.x, -p.y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: h - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelOffset: -bevel * 0.6, bevelSegments: 1, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    if (bevel > 0) geo.translate(0, bevel, 0);
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    const d = b.clone().sub(a);
    geo.userData.boxes = [{ c: [(a.x + b.x) / 2, h / 2, (a.y + b.y) / 2], h: [d.length() / 2, h / 2, hw], ry: Math.atan2(-d.y, d.x) }];
    pieces.push(geo);
  }
  return pieces;
}

/**
 * A blocky band lying on y = 0 along a polyline in plan (points (x, z)), each point with its own
 * width and height, mitred at every bend into one solid: a tail curled on a plinth, tapering to its
 * tip. Its end faces are square to the line.
 */
function taperBand(pts: THREE.Vector2[], ws: number[], hs: number[]) {
  const n = pts.length, dir = (i: number) => pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i === n - 1 ? i - 1 : i)]).normalize();
  const side = pts.map((p, i) => {
    const d0 = dir(Math.max(0, i - 1)), d1 = dir(i), m = new THREE.Vector2(-d0.y - d1.y, d0.x + d1.x).normalize();
    const cos = Math.max(0.35, m.dot(new THREE.Vector2(-d1.y, d1.x)));
    return m.multiplyScalar(ws[i] / 2 / cos);
  });
  const v = (i: number, s: number, top: boolean) => new THREE.Vector3(pts[i].x + side[i].x * s, top ? hs[i] : 0, pts[i].y + side[i].y * s);
  const tri: THREE.Vector3[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => tri.push(a, b, c, a, c, d);
  for (let i = 0; i < n - 1; i++) {
    const [lb0, rb0, lt0, rt0, lb1, rb1, lt1, rt1] = [v(i, 1, false), v(i, -1, false), v(i, 1, true), v(i, -1, true), v(i + 1, 1, false), v(i + 1, -1, false), v(i + 1, 1, true), v(i + 1, -1, true)];
    quad(lt0, lt1, rt1, rt0);
    quad(lb0, rb0, rb1, lb1);
    quad(lb0, lb1, lt1, lt0);
    quad(rb0, rt0, rt1, rb1);
  }
  quad(v(0, 1, false), v(0, 1, true), v(0, -1, true), v(0, -1, false));
  quad(v(n - 1, 1, false), v(n - 1, -1, false), v(n - 1, -1, true), v(n - 1, 1, true));
  const geo = new THREE.BufferGeometry().setFromPoints(tri);
  geo.computeVertexNormals();
  return geo;
}

/**
 * The fountain's bronze dragon (pick A, October 2), a sentinel sitting upright like a guardian lion
 * and facing +Z, its base on y = 0, about 3.3 high: a few big blocky castings, the haunches folded
 * under it, the deep chest upright with paler belly plates, jointed forelegs (shoulder, elbow,
 * forearm) planted on broad paws so they plainly carry it, the wings folded flat against its flanks, the tail curled round its
 * side on the plinth, the head held high with a square snout, the jaw open; gold horns, spines,
 * claws, eyes and tail spade. Returns the point in its open mouth the water pours from.
 */
function sentinelDragon(k: ModelKit, g: THREE.Object3D): THREE.Vector3 {
  const B = BRONZE, BD = BRONZE_D, BL = BRONZE_L, GOLD = PAL.gold;
  /** A gold claw pointing forward from a foot whose toes are at `z`. */
  const claws = (x: number, z: number) => {
    for (const c of [-1, 0, 1]) k.mesh(g, taper(0.09, 0.12, 0.05, 0.02, 0.14), GOLD, [x + c * 0.11, 0.06, z + 0.05], [Math.PI / 2, 0, 0]);
  };
  // The haunches, folded under at the back, and the hind feet planted beside the forepaws.
  for (const s of [-1, 1]) {
    cb(k, g, [0.44, 0.88, 0.98], [s * 0.5, 0.48, -0.36], B, [-0.12, 0, 0], 0.1);
    cb(k, g, [0.3, 0.2, 0.46], [s * 0.58, 0.1, 0.02], BD, undefined, 0.05);
    claws(s * 0.58, 0.25);
  }
  // The body: one deep upright casting, leaning back a little, its belly plates down the front.
  cb(k, g, [0.82, 1.4, 0.8], [0, 1.22, -0.22], B, [-0.16, 0, 0], 0.1);
  for (let i = 0; i < 4; i++) {
    const y = 0.72 + i * 0.3;
    cb(k, g, [0.2, 0.27, 0.12], [0, y + 0.1, 0.24 - (y - 0.72) * 0.16], i % 2 ? BELLY : BL, [-0.16, 0, 0], 0.03);
  }
  // The forelegs carrying the chest as a seated guardian lion's do, jointed like a beast's leg: a
  // heavy shoulder on the chest's flank, the upper arm running down and back to an elbow tucked at
  // the body's side, the forearm coming forward and down from it to the wrist, and a broad paw with
  // gold claws planted in front of the haunches.
  for (const s of [-1, 1]) {
    cb(k, g, [0.34, 0.62, 0.56], [s * 0.39, 1.4, -0.02], B, [-0.1, 0, s * 0.08], 0.1);
    limb(k, g, [s * 0.41, 1.36, 0.02], [s * 0.4, 0.84, -0.08], [0.3, 0.36, 0.25, 0.3], B);
    cb(k, g, [0.27, 0.26, 0.3], [s * 0.4, 0.84, -0.08], BD, undefined, 0.09);
    limb(k, g, [s * 0.38, 0.9, -0.04], [s * 0.32, 0.18, 0.36], [0.25, 0.29, 0.2, 0.24], B);
    cb(k, g, [0.34, 0.2, 0.5], [s * 0.32, 0.1, 0.46], BD, undefined, 0.05);
    claws(s * 0.32, 0.71);
  }
  // The neck rising high and a little forward, its front plated.
  cb(k, g, [0.5, 0.62, 0.5], [0, 2.02, -0.04], B, [0.12, 0, 0], 0.08);
  cb(k, g, [0.44, 0.52, 0.44], [0, 2.5, 0.06], B, [0.2, 0, 0], 0.07);
  for (const [y, z] of [[1.95, 0.22], [2.42, 0.3]]) cb(k, g, [0.32, 0.36, 0.08], [0, y, z], BELLY, [0.18, 0, 0], 0.02);
  // The head held high: a squared skull, a long square snout, the lower jaw dropped open over a dark
  // mouth, a heavy brow, gold eyes, and gold horns sweeping back.
  const head = new THREE.Group();
  head.position.set(0, 2.92, 0.2);
  head.rotation.x = -0.08;
  g.add(head);
  cb(k, head, [0.58, 0.46, 0.58], [0, 0, 0], B, undefined, 0.07);
  cb(k, head, [0.46, 0.24, 0.52], [0, 0.04, 0.5], B, undefined, 0.05);
  cb(k, head, [0.62, 0.12, 0.2], [0, 0.22, 0.2], BD, undefined, 0.03);
  k.box(head, [0.36, 0.14, 0.38], [0, -0.12, 0.48], 0x2a1a10);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.12, 0.2);
  jaw.rotation.x = 0.42;
  head.add(jaw);
  cb(k, jaw, [0.4, 0.12, 0.52], [0, -0.04, 0.26], BD, undefined, 0.03);
  for (const s of [-1, 1]) {
    k.mesh(head, taper(0.05, 0.05, 0.01, 0.01, 0.1), GOLD, [s * 0.15, -0.14, 0.66], [Math.PI, 0, 0]);
    k.box(head, [0.1, 0.07, 0.04], [s * 0.2, 0.12, 0.29], GOLD);
    k.box(head, [0.06, 0.05, 0.03], [s * 0.11, 0.08, 0.765], 0x2a1a10);
    k.mesh(head, new THREE.OctahedronGeometry(0.08, 0), BL, [s * 0.3, -0.04, 0.04]);
    limb(k, head, [s * 0.17, 0.18, -0.12], [s * 0.34, 0.52, -0.5], [0.13, 0.13, 0.02, 0.02], GOLD);
    limb(k, head, [s * 0.26, 0.04, -0.18], [s * 0.52, 0.14, -0.46], [0.1, 0.1, 0.02, 0.02], GOLD);
  }
  limb(k, head, [0, 0.2, -0.24], [0, 0.46, -0.56], [0.1, 0.14, 0.02, 0.02], GOLD);
  // Gold spines down the back of the neck and the body.
  // (Each set into the casting's back, so none stands off it.)
  for (const [y, z, h] of [[2.42, -0.15, 0.22], [2.0, -0.27, 0.24], [1.66, -0.64, 0.26], [1.3, -0.6, 0.24], [0.94, -0.55, 0.2]]) {
    k.mesh(g, prism(0.11, h, 0.55), GOLD, [0, y, z], [-1.2, 0, 0]);
  }
  // The wings folded flat against the flanks: a heavy leading bone up to a gold-capped wrist over
  // the shoulder, the membrane falling from it in one long kite-shaped panel to the haunch.
  for (const s of [-1, 1]) {
    const x = s * 0.64;
    limb(k, g, [s * 0.5, 1.55, -0.2], [s * 0.62, 2.58, -0.5], [0.14, 0.16, 0.1, 0.12], BD);
    k.mesh(g, new THREE.OctahedronGeometry(0.12, 0), WORN, [s * 0.62, 2.66, -0.52]);
    const pts = [[2.56, -0.5], [1.15, -0.1], [1.55, -1.12], [0.62, -0.7]].flatMap(([y, z]) => [new THREE.Vector3(x - 0.03, y, z), new THREE.Vector3(x + 0.03, y, z)]);
    k.mesh(g, new ConvexGeometry(pts), MEMBRANE, [0, 0, 0]);
    limb(k, g, [x + s * 0.04, 2.5, -0.52], [x + s * 0.04, 1.58, -1.08], [0.06, 0.06, 0.05, 0.05], BD);
    limb(k, g, [x + s * 0.04, 2.5, -0.52], [x + s * 0.04, 0.68, -0.7], [0.06, 0.06, 0.05, 0.05], BD);
  }
  // The tail curled round its right side, lying on the plinth: one squared casting from its root
  // under the rump, mitred round each turn and tapering to a flat gold spade on the stone, all well
  // inside the plinth's edge.
  {
    const tail = [[0, -0.6], [0.42, -0.9], [0.78, -0.66], [0.88, -0.26], [0.86, 0.02]].map(([x, z]) => new THREE.Vector2(x, z));
    k.mesh(g, taperBand(tail, [0.34, 0.28, 0.22, 0.17, 0.13], [0.5, 0.3, 0.24, 0.19, 0.15]), BD, [0, 0, 0]);
    const a = tail[tail.length - 2], e = tail[tail.length - 1], d = e.clone().sub(a).normalize(), w = 0.13 / 2;
    const at = (f: number, l: number) => new THREE.Vector3(e.x + d.x * f - d.y * l, 0, e.y + d.y * f + d.x * l);
    // (A flat blade lying on the stone, thinner than the tail's tip, clear of the hind paw.)
    const outline = [at(0, w), at(0.1, 0.13), at(0.36, 0), at(0.1, -0.13), at(0, -w)];
    const spade = new ConvexGeometry([...outline, ...outline.map((q) => q.clone().setY(0.06))]);
    k.mesh(g, spade, GOLD, [0, 0, 0]);
  }
  head.updateMatrix();
  // (The water leaves from inside the dark mouth, so it is first seen pouring over the lower jaw.)
  return new THREE.Vector3(0, -0.11, 0.5).applyMatrix4(head.matrix);
}

/** The garden trees' wind clock (ticked by each tree, the world's time). */
const TREE_WIND = { uWindT: { value: 0 } };
const treeParts = new Map<string, THREE.BufferGeometry>(), treeMats = new Map<string, THREE.MeshStandardMaterial>();

/**
 * One shape of a grown kind's wood or leaves for a garden tree: the woods' own buffers (shared, never
 * copied), in a geometry of its own that the geometry audit passes over (a tree is no masonry).
 */
function treeGeometry(kind: GrownKind, part: 'trunk' | 'canopy', v: number) {
  const key = `${kind}:${part}:${v}`;
  let geo = treeParts.get(key);
  if (!geo) {
    const src = grownTrees(kind)[part][v];
    geo = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(src.attributes)) geo.setAttribute(name, attr);
    geo.setIndex(src.index);
    geo.userData.boxes = [];
    treeParts.set(key, shareResource(geo));
  }
  return geo;
}

/** A grown kind's bark or leaves, as the woods wear them (one material for every garden tree of a kind). */
function treeMaterial(kind: GrownKind, part: 'trunk' | 'canopy') {
  const key = `${kind}:${part}`;
  let mat = treeMats.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 });
    GROWN[kind].look[part](mat, TREE_WIND);
    treeMats.set(key, shareResource(mat));
  }
  return mat;
}

/** The still water in a small basin or trough (the colour props.ts finishes as still water, with a sheen). */
const BASIN_WATER = 0x1a3238;

/** A disc of still water of radius `r` lying flat, its underside on y = 0, 2 cm thick. */
const waterDisc = (r: number) => new THREE.ExtrudeGeometry(new THREE.Shape().absarc(0, 0, r, 0, Math.PI * 2, false), { depth: 0.02, bevelEnabled: false, curveSegments: 24 }).rotateX(-Math.PI / 2);

/**
 * A garden wall's pier at (x, z), a metre square, on a base course, rising over the wall (`h` high)
 * to a moulded cap and a ball finial.
 */
function gardenPier(k: ModelKit, g: THREE.Object3D, x: number, z: number, h: number) {
  const shaft = h + 0.2 - 0.24;
  cb(k, g, [1.24, 0.24, 1.24], [x, 0.12, z], BASE, undefined, 0.03);
  cb(k, g, [1.04, shaft, 1.08], [x, 0.24 + shaft / 2, z], ASHLAR, undefined, 0.04);
  cb(k, g, [1.22, 0.18, 1.24], [x, h + 0.29, z], DRESS, undefined, 0.03);
  cb(k, g, [0.5, 0.16, 0.5], [x, h + 0.46, z], DRESS, undefined, 0.03);
  ball(k, g, 0.25, [x, h + 0.78, z], ASHLAR_L);
}

/**
 * The champion's knight standing on his plinth's cap (y = 0, facing +Z): plate armour and an open-faced
 * plumed helm, a cloak down the back, hands folded on the pommel of a sword planted point down before
 * him, a kite shield leaning at his side, in warm marble (S, its shade SD and light SL).
 */
function statue(k: ModelKit, g: THREE.Object3D, S: number, SD: number, SL: number) {
  const y = 0;
    // Legs, knee cops and sabatons.
    for (const s of [-1, 1]) {
      cb(k, g, [0.26, 0.98, 0.3], [s * 0.17, y + 0.5, 0], S, undefined, 0.06);
      cb(k, g, [0.22, 0.16, 0.12], [s * 0.17, y + 0.62, 0.16], SL, undefined, 0.04);
      cb(k, g, [0.28, 0.14, 0.44], [s * 0.17, y + 0.07, 0.07], SD, undefined, 0.04);
    }
    // The tasset skirt, belt and breastplate with its ridge.
    k.mesh(g, taper(0.8, 0.52, 0.62, 0.44, 0.46), S, [0, y + 1.1, 0]);
    cb(k, g, [0.68, 0.1, 0.48], [0, y + 1.34, 0], SD, undefined, 0.03);
    k.mesh(g, taper(0.62, 0.44, 0.84, 0.5, 0.78), S, [0, y + 1.78, 0]);
    k.mesh(g, wedge(0.08, 0.06, 0.7), SL, [0, y + 1.78, 0.25], [Math.PI / 2, 0, 0]);
    // The tabard over the breastplate: the lord's blue falling in two folds (the gold diamond is
    // kept for the banners and flags).
    for (const sx of [-1, 1]) cb(k, g, [0.27, 0.95, 0.05], [sx * 0.14, y + 1.5, 0.29], sx < 0 ? HERALD_BLUE : HERALD_BLUE_D, [0.05, 0, 0], 0.01);
    // The cloak hanging down the back from a rolled collar at the shoulders, falling in deep folds
    // (pleats standing out of it at different depths), its hem flaring a little.
    // (Modelled all round: seen from behind on the parterre's walks he shows a full draped cloak in
    // four deep folds over the belt, a clasped collar, the helm's crest and his sword's pommel.)
    k.mesh(g, taper(1.04, 0.24, 0.84, 0.16, 1.9), SD, [0, y + 1.12, -0.32], [-0.06, 0, 0]);
    cb(k, g, [0.92, 0.18, 0.4], [0, y + 2.04, -0.18], S, undefined, 0.08);
    for (const [i, dz, w] of [[-1.5, 0.07, 0.24], [-0.5, 0.16, 0.28], [0.5, 0.1, 0.26], [1.5, 0.18, 0.22]] as const) {
      k.mesh(g, taper(w, 0.2, w * 0.6, 0.12, 1.84), i === -0.5 || i === 1.5 ? SL : S, [i * 0.23, y + 1.08, -0.4 - dz], [-0.08, 0, i * 0.04]);
    }
    k.mesh(g, taper(1.0, 0.16, 1.0, 0.16, 0.12), SD, [0, y + 0.22, -0.5], [-0.06, 0, 0]);
    // (Clasped at the shoulders with round gilt bosses.)
    for (const sx of [-1, 1]) k.cyl(g, 0.07, 0.07, 0.06, [sx * 0.34, y + 2.06, 0.02], PAL.gold, [Math.PI / 2, 0, 0], 10);
    // The sword belt round him, over the cloak at the back, its buckle on the hip.
    cb(k, g, [0.72, 0.1, 0.5], [0, y + 1.3, 0], SL, undefined, 0.03);
    cb(k, g, [0.86, 0.1, 0.16], [0, y + 1.3, -0.52], SD, [-0.06, 0, 0], 0.03);
    // A second sword slung across his back, its pommel and grip over the right shoulder.
    cb(k, g, [0.08, 1.2, 0.06], [0.14, y + 1.5, -0.58], SL, [-0.06, 0, -0.5], 0.02);
    cb(k, g, [0.34, 0.06, 0.08], [0.34, y + 1.96, -0.58], SL, [-0.06, 0, -0.5], 0.02);
    cb(k, g, [0.06, 0.26, 0.06], [0.45, y + 2.09, -0.58], SD, [-0.06, 0, -0.5], 0.01);
    cb(k, g, [0.11, 0.11, 0.11], [0.5, y + 2.24, -0.58], SL, [0, Math.PI / 4, 0], 0.03);
    // Pauldrons, arms bent to the hands on the pommel.
    for (const s of [-1, 1]) {
      cb(k, g, [0.38, 0.26, 0.52], [s * 0.5, y + 2.1, 0], SL, [0, 0, s * -0.3], 0.1);
      limb(k, g, [s * 0.48, y + 2.02, 0.02], [s * 0.4, y + 1.56, 0.24], [0.2, 0.22, 0.18, 0.2], S);
      limb(k, g, [s * 0.4, y + 1.56, 0.24], [s * 0.1, y + 1.42, 0.44], [0.18, 0.2, 0.17, 0.19], S);
    }
    cb(k, g, [0.34, 0.2, 0.22], [0, y + 1.44, 0.46], SD, undefined, 0.05);
    // The sword planted before him: pommel, grip, crossguard, the blade to the plinth.
    cb(k, g, [0.13, 0.13, 0.13], [0, y + 1.62, 0.46], SL, [0, Math.PI / 4, 0], 0.03);
    cb(k, g, [0.66, 0.08, 0.1], [0, y + 1.26, 0.46], SL, undefined, 0.02);
    k.mesh(g, taper(0.05, 0.04, 0.16, 0.05, 1.18), SL, [0, y + 0.64, 0.46]);
    // The helm: an open-faced knight's helm, round as a head is, on a mail collar: a rounded skull
    // with a band round the brow, cheek guards either side of the face and a nasal down its middle,
    // the face under it carved plain, and a stone plume springing from a socket at the crown and
    // falling back over the nape.
    k.cyl(g, 0.15, 0.2, 0.18, [0, y + 2.25, 0.0], SD, undefined, 10);
    cb(k, g, [0.24, 0.26, 0.2], [0, y + 2.42, 0.06], S, undefined, 0.05);
    for (const sx of [-1, 1]) k.box(g, [0.05, 0.025, 0.03], [sx * 0.06, y + 2.47, 0.16], SD);
    ball(k, g, 0.21, [0, y + 2.56, 0.0], SL, [1, 0.92, 1.08]);
    k.cyl(g, 0.215, 0.215, 0.06, [0, y + 2.53, 0.0], S, undefined, 10);
    for (const sx of [-1, 1]) cb(k, g, [0.06, 0.26, 0.22], [sx * 0.16, y + 2.39, 0.05], SL, [0, sx * -0.25, 0], 0.015);
    cb(k, g, [0.05, 0.2, 0.05], [0, y + 2.45, 0.175], SL, undefined, 0.01);
    cb(k, g, [0.08, 0.08, 0.08], [0, y + 2.76, -0.01], SL, [0, Math.PI / 4, 0], 0.02);
    limb(k, g, [0, y + 2.79, 0.0], [0, y + 2.72, -0.3], [0.1, 0.12, 0.08, 0.1], SL);
    limb(k, g, [0, y + 2.72, -0.28], [0, y + 2.44, -0.42], [0.08, 0.1, 0.05, 0.06], SL);
    // A kite shield leaning against his side.
    k.mesh(g, taper(0.1, 0.07, 0.56, 0.07, 0.86), SD, [-0.56, y + 0.46, 0.12], [-0.08, 0.35, 0.1]);
    k.cyl(g, 0.1, 0.1, 0.04, [-0.57, y + 0.62, 0.17], SL, [Math.PI / 2, 0, -0.35], 10);
}

/** The layer a pool's mirror draws (the fountain's own dragon, rock and jets). */
const MIRROR_LAYER = 3;

export const BAILEY_PROPS: Record<string, Builder> = {
  /**
   * A kerb along local X, `len` long: one border of stones 0.5 wide standing 0.05 proud of the paving,
   * edging a walk, the paving's stone a shade darker. `v` 1: an inlay band instead, of the castle's
   * dressed stone and flush, laid across a walk.
   */
  kerb: (k, g, arg) => {
    const L = Math.max(0.5, lenOf(arg) ?? 4), inlay = vOf(arg) === 1;
    if (inlay) k.mesh(g, laidRun(L, 0.6, 0.1, Math.max(1, Math.round(L / 0.9)), 11), DRESS, [0, -0.03, 0]);
    else k.mesh(g, laidRun(L, 0.5, 0.12, Math.max(1, Math.round(L / (2 * KERB_W))), 13), KERB, [0, -0.01, 0]);
  },
  /**
   * The kerbs round a round plaza, radius `len`: in each quarter one continuous kerb (like a walk's,
   * flush with the paving) that comes in along the straight kerb at `opt.d0` off the X axis (from
   * `opt.x0` off the Z axis, where that kerb stops), turns onto the circle and follows it round to `opt.xc` off
   * the Z axis, turns square across to the straight kerb at `opt.d1` and runs out along it to `opt.x1`,
   * where that kerb takes over: each lawn's edge one kerb, its corners square, never a sharp wedge.
   * Where the circle meets the second straight kerb on its own line (`opt.x1` equal to `opt.xc`), it
   * runs on along that line from the circle to `opt.d1`, where that kerb takes over.
   */
  kerb_ring: (k, g, arg) => {
    const r = lenOf(arg) ?? 10, o = (arg?.opt ?? {}) as { d0?: number; d1?: number; x0?: number; xc?: number; x1?: number };
    const d0 = o.d0 ?? 2, d1 = o.d1 ?? 9, x0 = o.x0 ?? r + 0.5, xc = o.xc ?? 5, x1 = o.x1 ?? xc + 0.6, n = 16;
    const a0 = Math.asin(d0 / r), a1 = Math.acos(xc / r);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pts = [
        new THREE.Vector2(sx * x0, sz * d0),
        ...Array.from({ length: n + 1 }, (_, i) => {
          const a = a0 + ((a1 - a0) * i) / n;
          return new THREE.Vector2(sx * r * Math.cos(a), sz * r * Math.sin(a));
        }),
        new THREE.Vector2(sx * xc, sz * d1),
        ...(x1 === xc ? [] : [new THREE.Vector2(sx * x1, sz * d1)]),
      ];
      // (Laid in the walks' kerb stones, one continuous border round the curve; for the audit, each
      // quarter's stretches are one kerb.)
      k.mesh(g, laidBand(pts, KERB_W, 0.12, 2 * KERB_W, sx * 2 + sz + 5), KERB, [0, -0.06, 0]).userData.audit = { band: sx * 2 + sz };
    }
  },
  // ─── Castle gardens ───────────────────────────────────────────────────────────
  /**
   * A flower bed `len` long: a low stone kerb round dark soil, planted in tidy rows of one kind of
   * plant (`v`): 0 tulips in drifts of red, gold and white; 1 rose bushes in pink, red and white; 2
   * lavender; 3 a border of blue delphiniums behind white daisies.
   */
  flower_bed: (k, g, arg) => {
    const L = lenOf(arg) ?? 3.2, v = vOf(arg) % 4, W = 1.3;
    cb(k, g, [L, 0.24, W], [0, 0.12, 0], STONE_L, undefined, 0.04);
    k.box(g, [L - 0.24, 0.06, W - 0.24], [0, 0.25, 0], 0x3a2a1e);
    const soil = new THREE.Group();
    soil.position.y = 0.28;
    g.add(soil);
    if (v === 0) {
      const drift = [0xd8323a, 0xf0b828, 0xf4ece0];
      spread(L, 0.3, 0.25).forEach((x, i, all) => {
        const c = drift[Math.min(2, Math.floor((i / all.length) * 3))];
        [-0.32, 0, 0.32].forEach((z, j) => {
          const xx = x + (j === 1 ? 0.15 : 0);
          if (xx < L / 2 - 0.2) PLANT.tulip(k, soil, xx, z, c, 0.34 + hash01(i, j) * 0.08, i + j);
        });
      });
    } else if (v === 1) {
      const cols = [0xe0507a, 0xc8283a, 0xf4ece0];
      spread(L, 0.62, 0.35).forEach((x, i) => {
        for (const z of [-0.26, 0.26]) {
          const xx = x + (z > 0 ? 0.31 : 0);
          if (xx < L / 2 - 0.3) PLANT.rose(k, soil, xx, z, cols[(i + (z > 0 ? 1 : 0)) % 3], 0.95, i * 1.7 + z);
        }
      });
    } else if (v === 2) {
      spread(L, 0.46, 0.28).forEach((x, i) => {
        for (const z of [-0.25, 0.25]) {
          const xx = x + (z > 0 ? 0.23 : 0);
          if (xx < L / 2 - 0.25) PLANT.lavender(k, soil, xx, z, i * 1.3 + z);
        }
      });
    } else {
      spread(L, 0.48, 0.3).forEach((x, i) => PLANT.delphinium(k, soil, x, -0.24, i % 3 ? 0x4a6ad8 : 0x8a7ae0, 0.62 + hash01(i, 5) * 0.12));
      spread(L, 0.36, 0.25).forEach((x, i) => PLANT.daisy(k, soil, x, 0.3, i * 1.9));
    }
  },
  /**
   * Clipped topiary in a square stone planter (`len`): 0 a ball, 1 a cone, 2 a standard (a round
   * head on a clean stem), 3 a spiral (a cone clipped into a corkscrew of five turns), 4 a tiered
   * standard (three balls, smaller up the stem), 5 a tall clipped yew (a squared obelisk with a ball
   * on its point, for an avenue).
   */
  topiary: (k, g, arg) => {
    const kind = lenOf(arg) ?? 0, cone = kind === 1, standard = kind === 2;
    cb(k, g, [0.95, 0.7, 0.95], [0, 0.35, 0], STONE_L, undefined, 0.05);
    if (kind >= 3) {
      cb(k, g, [1.05, 0.12, 1.05], [0, 0.72, 0], DRESS, undefined, 0.03);
      k.box(g, [0.75, 0.05, 0.75], [0, 0.76, 0], 0x3a2a1e);
      const DARK_LEAF = 0x3e6e2e, LIGHT_LEAF = 0x4a7a34;
      if (kind === 3) {
        // The corkscrew: one clipped cone cut into a spiral, each turn a cushion swelling out and
        // turned a little further round than the one under it, a thin stem of leaf showing between.
        k.mesh(g, taper(0.34, 0.34, 0.12, 0.12, 2.1), DARK_LEAF, [0, 0.78 + 1.05, 0]);
        for (let i = 0; i < 5; i++) {
          const s = 0.92 - i * 0.15, a = i * 0.62;
          cb(k, g, [s, 0.3, s], [Math.sin(a) * 0.05, 0.98 + i * 0.4, Math.cos(a) * 0.05], i % 2 ? LIGHT_LEAF : DARK_LEAF, [0, a, 0], Math.min(0.13, s * 0.3));
        }
        ball(k, g, 0.13, [0, 2.92, 0], LIGHT_LEAF);
      } else if (kind === 4) {
        cb(k, g, [0.12, 2.2, 0.12], [0, 1.85, 0], WOOD_D, undefined, 0.02);
        for (const [r, y] of [[0.5, 1.3], [0.38, 2.2], [0.27, 2.9]]) ball(k, g, r, [0, y, 0], y > 2 ? LIGHT_LEAF : DARK_LEAF, [1, 0.88, 1]);
      } else {
        k.mesh(g, taper(0.82, 0.82, 0.3, 0.3, 2.6), DARK_LEAF, [0, 0.78 + 1.3, 0]);
        ball(k, g, 0.24, [0, 3.28, 0], LIGHT_LEAF);
      }
      return;
    }
    if (standard) {
      // A clipped standard: a tall clean stem through a smaller clipped ball to a round head.
      cb(k, g, [1.05, 0.12, 1.05], [0, 0.72, 0], DRESS, undefined, 0.03);
      k.box(g, [0.75, 0.05, 0.75], [0, 0.76, 0], 0x3a2a1e);
      cb(k, g, [0.14, 2.2, 0.14], [0, 1.85, 0], WOOD_D, undefined, 0.02);
      k.mesh(g, new THREE.IcosahedronGeometry(0.42, 1), 0x4a7a34, [0, 1.45, 0]).scale.set(1, 0.85, 1);
      k.mesh(g, new THREE.IcosahedronGeometry(0.78, 1), 0x3e6e2e, [0, 2.95, 0]);
      return;
    }
    cb(k, g, [1.05, 0.12, 1.05], [0, 0.72, 0], STONE, undefined, 0.03);
    k.box(g, [0.75, 0.05, 0.75], [0, 0.76, 0], 0x3a2a1e);
    if (cone) {
      k.mesh(g, taper(0.95, 0.95, 0.12, 0.12, 1.9), 0x3e6e2e, [0, 0.78 + 0.95, 0]);
      cb(k, g, [0.7, 0.5, 0.7], [0, 1.05, 0], 0x4a7a34, [0, 0.4, 0], 0.2);
    } else {
      cb(k, g, [0.18, 0.5, 0.18], [0, 1.0, 0], WOOD_D, undefined, 0.02);
      cb(k, g, [1.05, 1.0, 1.05], [0, 1.65, 0], 0x4a7a34, [0, 0.4, 0], 0.32);
      cb(k, g, [0.9, 0.9, 0.9], [0, 1.68, 0], 0x3e6e2e, [0, 1.2, 0], 0.3);
    }
  },
  /**
   * The bailey's centrepiece (facing +Z, toward the gate): a round basin, its wall and moulded coping
   * each one continuous ring of stone (outer radius 7.3) on a low plinth step round a clear pool, a
   * pedestal at its heart and the bronze dragon sitting guard on it, its open jaws pouring the one
   * stream of water into the pool; foam, spray and rings spread where the water lands.
   */
  dragon_fountain: (k, g) => {
    // (Grown with the castle round it: the basin wider and the dragon taller, its stones their own size.)
    const F = GROW, RO = 5.6 * F, RI = 4.9 * F, H = 0.75, WY = 0.8, S = 2.35 * F, DROP = 4.4 * F, time = { value: 0 };
    // The plinth step, the basin's wall and its coping, each one course laid round the pool in flat
    // stones (a basin's wall is no more bent than a tower's), the coping's joints over the wall's.
    const basin = new THREE.Group(), n = drumStones(RO);
    basin.position.y = 0.2;
    g.add(basin);
    drum(k, g, { r: RO + 0.5, y0: 0, y1: 0.2, n: drumStones(RO + 0.5), course: 0.2 }, STONE_D);
    drum(k, basin, { r: RO, rIn: RI, y0: 0, y1: H, n, course: H }, STONE);
    drum(k, basin, { r: RO + 0.1, rIn: RI - 0.1, y0: H, y1: H + 0.14, n, course: H, turn: Math.PI / n, bond: false }, STONE_L);
    // The basin floor, dark under the water so the pool has depth.
    k.cyl(g, RI, RI, 0.1, [0, 0.15, 0], 0x1a2e30, undefined, 48);
    // The dragon's pedestal, carved in the castle's own stone: an octagonal drum of cream ashlar
    // rising out of the water from a blue-grey plinth, a plain gilt band round it and a moulded
    // blue-grey coping under the dragon's feet.
    k.cyl(g, 2.75 * F, 2.95 * F, 1.0, [0, 0.5, 0], BASE, [0, Math.PI / 8, 0], 8);
    k.cyl(g, 2.45 * F, 2.45 * F, 0.5, [0, 1.25, 0], ASHLAR, [0, Math.PI / 8, 0], 8);
    k.cyl(g, 2.45 * F + 0.02, 2.45 * F + 0.02, 0.14, [0, 1.12, 0], GILT, [0, Math.PI / 8, 0], 8);
    k.cyl(g, 2.7 * F, 2.62 * F, 0.16, [0, 1.56, 0], DRESS, [0, Math.PI / 8, 0], 8);
    // The dragon sitting guard on the pedestal, its jaws open over the front of the pool.
    const beast = new THREE.Group();
    beast.position.y = 1.64;
    beast.scale.setScalar(S);
    const jaw = sentinelDragon(k, beast).multiplyScalar(S).add(beast.position);
    g.add(beast);
    // The one stream, from the jaws into the pool.
    const impacts: Impact[] = [[0, DROP, 1]];
    const sheets: [THREE.Vector3[], number, number, number][] = [[pour(jaw, new THREE.Vector3(0, WY, DROP), 0.7, 28), 0.16 * F, 0.42 * F, 51]];
    for (const [pts, w0, w1, seed] of sheets) {
      const { geo, len } = crossedRibbons(pts, w0, w1);
      const m = new THREE.Mesh(geo, fallingWaterMaterial(time, seed, len, w1));
      m.name = 'fountain-stream';
      m.renderOrder = 2;
      g.add(m);
    }
    // The pool mirrors the dragon and its rock over it (a mirror of only the fountain's own layer).
    const at = new THREE.Vector3();
    const refl = planarReflection(() => water.getWorldPosition(at).y, MIRROR_LAYER);
    const water = new THREE.Mesh(new THREE.CircleGeometry(RI + 0.02, 48).rotateX(-Math.PI / 2), poolWater(time, RI, impacts, refl));
    water.position.y = WY;
    water.name = 'fountain-pool';
    water.renderOrder = 1;
    g.add(water);
    let layered = false;
    water.onBeforeRender = (renderer, scene, camera) => {
      if (!layered) {
        g.traverse((o) => o !== water && (o as THREE.Mesh).isMesh && o.layers.enable(MIRROR_LAYER));
        layered = true;
      }
      refl.render(renderer, scene, camera, water);
    };
    // Where the jaw stream lands: a churn of foam on the water, heaving foam, drifting spray.
    const foamDisc = new THREE.Mesh(brokenFoam(91, 1.0, 11, 0.75), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    foamDisc.position.set(0, WY + 0.03, DROP);
    foamDisc.name = 'foam-spread';
    foamDisc.material.userData.decal = foamDisc.material.userData.noOcclude = true;
    foamDisc.renderOrder = 3;
    g.add(foamDisc);
    const spray: THREE.Sprite[] = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.SpriteMaterial({ map: mistTexture(), color: 0xe8f2f4, transparent: true, depthWrite: false, opacity: 0.3 });
      const sp = new THREE.Sprite(m);
      sp.name = 'spray';
      sp.renderOrder = 4;
      g.add(sp);
      spray.push(sp);
    }
    return {
      obj: g,
      tick: (t) => {
        time.value = t;
        foamDisc.scale.setScalar(1 + 0.08 * Math.sin(t * 2.3));
        foamDisc.rotation.y = 0.25 * Math.sin(t * 0.6);
        // Spray puffs rise from the landing, swell and fade, one after another.
        spray.forEach((sp, i) => {
          const p = (t * 0.55 + i / spray.length) % 1;
          sp.position.set(Math.sin(i * 2.1) * 0.25, WY + 0.25 + p * 0.9, DROP + Math.cos(i * 2.1) * 0.2);
          sp.scale.setScalar(0.7 + p * 1.1);
          sp.material.opacity = 0.32 * Math.sin(p * Math.PI);
        });
      },
    };
  },
  /**
   * A field gate between two square stone piers (2.5 apart, centred on x = 0) with ball finials; the
   * timber gate stands open, swung a quarter turn into the field (toward -Z).
   */
  gate_piers: (k, g) => {
    for (const sx of [-1, 1]) {
      cb(k, g, [0.7, 0.2, 0.7], [sx * 1.25, 0.1, 0], STONE_D, undefined, 0.03);
      cb(k, g, [0.56, 1.5, 0.56], [sx * 1.25, 0.95, 0], STONE_L, undefined, 0.04);
      cb(k, g, [0.7, 0.14, 0.7], [sx * 1.25, 1.75, 0], STONE, undefined, 0.03);
      ball(k, g, 0.24, [sx * 1.25, 2.02, 0], STONE_L);
    }
    const leaf = new THREE.Group();
    // Swung open a quarter turn into the field (toward -Z), standing square to the fence, clear of its rails.
    leaf.position.set(-0.95, 0, -0.12);
    leaf.rotation.y = Math.PI / 2;
    g.add(leaf);
    for (const y of [0.35, 0.75, 1.1]) cb(k, leaf, [1.9, 0.1, 0.07], [0.95, y, 0], WOOD, undefined, 0.02);
    for (const x of [0.05, 1.85]) cb(k, leaf, [0.1, 1.2, 0.09], [x, 0.7, 0], WOOD_D, undefined, 0.02);
    cb(k, leaf, [0.1, 1.9, 0.07], [0.95, 0.72, 0], WOOD, [0, 0, Math.atan2(0.75, 1.8)], 0.02);
  },
  /**
   * A rose pergola over a seat (facing +Z): three pointed timber arches on posts, joined by rails and
   * slats, climbing roses in pink and white clusters over the top and down the posts, a lantern hung
   * under the middle arch, a seat inside at the back with a trellis behind it.
   */
  pergola: (k, g) => {
    const W = 3.2, D = 1.6, H = 2.3, LEAF = [0x3e6e2e, 0x4a7a34, 0x56883c], ROSE = [0xe0507a, 0xf08aa8, 0xf6eee2];
    // Each arch springs from its posts' tops and rises a unit to its point.
    const { arc, ys } = pointedArch(W, 1 / 0.62, 6), lift = H - ys;
    for (const z of [-D / 2, 0, D / 2]) {
      for (const sx of [-1, 1]) {
        cb(k, g, [0.3, 0.14, 0.3], [sx * W / 2, 0.07, z], STONE_L, undefined, 0.03);
        cb(k, g, [0.14, H + 0.02, 0.14], [sx * W / 2, H / 2, z], WOOD_D, undefined, 0.02);
        for (let i = 0; i < arc.length - 1; i++) {
          const a = arc[i], b = arc[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          cb(k, g, [len + 0.05, 0.13, 0.13], [sx * (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + lift, z], WOOD_D, [0, 0, sx > 0 ? ang : Math.PI - ang], 0.01);
        }
      }
    }
    const top = (x: number) => lift + (() => {
      const ax = Math.abs(x);
      for (let i = 0; i < arc.length - 1; i++) if (ax <= arc[i][0] && ax >= arc[i + 1][0]) {
        const t = (arc[i][0] - ax) / (arc[i][0] - arc[i + 1][0] || 1);
        return arc[i][1] + (arc[i + 1][1] - arc[i][1]) * t;
      }
      return arc[arc.length - 1][1];
    })();
    for (let i = 0; i < 7; i++) {
      const x = -W / 2 + 0.2 + (i * (W - 0.4)) / 6;
      cb(k, g, [0.07, 0.07, D + 0.3], [x, top(x) + 0.06, 0], WOOD, undefined, 0.01);
    }
    for (const sx of [-1, 1]) cb(k, g, [0.08, 0.08, D], [sx * W / 2, H - 0.05, 0], WOOD, undefined, 0.01);
    // The seat at the back and a trellis behind it.
    for (const z of [-0.5, -0.32]) cb(k, g, [2.3, 0.08, 0.16], [0, 0.48, z], WOOD_L, undefined, 0.02);
    for (const x of [-1.05, 1.05]) cb(k, g, [0.12, 0.46, 0.4], [x, 0.23, -0.4], WOOD_D, undefined, 0.02);
    for (let i = 0; i < 7; i++) cb(k, g, [0.05, H - 0.3, 0.05], [-W / 2 + 0.3 + (i * (W - 0.6)) / 6, (H - 0.3) / 2 + 0.15, -D / 2], WOOD, undefined, 0.01);
    for (const y of [0.9, 1.5, 2.0]) cb(k, g, [W - 0.2, 0.05, 0.05], [0, y, -D / 2], WOOD, undefined, 0.01);
    // Roses: soft leafy masses along the arches' crowns and twining up the posts, bloom clusters in them.
    // (Every bloom sits in a leafy mass, so none hangs in the air.)
    for (let i = 0; i < 9; i++) {
      const x = -W / 2 + 0.15 + (i * (W - 0.3)) / 8, z = (hash01(i, 3) - 0.5) * (D + 0.2), r = 0.42 + hash01(i, 5) * 0.12;
      ball(k, g, r, [x, top(x) + 0.2, z], LEAF[i % 3], [1.2, 0.7, 1.1]);
      for (let j = 0; j < 3; j++) {
        const a = hash01(i, j + 9) * Math.PI * 2;
        k.gem(g, 0.075, [x + Math.cos(a) * r * 0.6, top(x) + 0.2 + r * 0.45, z + Math.sin(a) * r * 0.55], ROSE[(i + j) % 3]);
      }
    }
    for (const sx of [-1, 1]) for (const z of [-D / 2, D / 2]) for (let j = 0; j < 3; j++) {
      ball(k, g, 0.24, [sx * (W / 2 + 0.06), 0.5 + j * 0.62, z + 0.05], LEAF[j % 3], [1, 1.4, 1]);
      k.gem(g, 0.08, [sx * (W / 2 + 0.2), 0.58 + j * 0.62, z + 0.16], ROSE[(j + (sx > 0 ? 1 : 0)) % 3]);
    }
    // The lantern hung under the middle arch on a short chain: warm glass in a navy cage under a
    // little hood, a gold cap and finial.
    const ly = top(0) - 0.72;
    for (let i = 0; i < 4; i++) k.box(g, [0.035, 0.09, 0.035], [0, top(0) - 0.06 - i * 0.09, 0], LAMP_NAVY, [0, (i % 2) * (Math.PI / 2), 0]);
    k.mesh(g, new THREE.OctahedronGeometry(0.05, 0), PAL.gold, [0, ly + 0.36, 0]);
    k.mesh(g, taper(0.32, 0.32, 0.08, 0.08, 0.14), LAMP_NAVY, [0, ly + 0.25, 0]);
    cb(k, g, [0.3, 0.05, 0.3], [0, ly + 0.16, 0], PAL.gold, undefined, 0.01);
    k.box(g, [0.2, 0.26, 0.2], [0, ly, 0], 0xffcf86, undefined, 0xffa038, 1.4);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(g, [0.04, 0.3, 0.04], [dx * 0.11, ly, dz * 0.11], LAMP_NAVY);
    cb(k, g, [0.26, 0.05, 0.26], [0, ly - 0.15, 0], LAMP_NAVY, undefined, 0.01);
  },
  /** A low clipped box hedge along local X, `len` long, 0.5 high and 0.5 thick (parterre edging). */
  /**
   * A clipped box border along an outline (`opt.pts`: [x, z] corners relative to the prop, closed into
   * a loop when `opt.closed`): one continuous low hedge, mitred at every corner and ending square, its
   * clipped top a shade lighter, each laid as one extruded shape so no two pieces of box ever overlap.
   */
  box_border: (k, g, arg) => {
    const o = (arg?.opt ?? {}) as { pts?: number[][]; closed?: boolean };
    const pts = (o.pts ?? [[-1, 0], [1, 0]]).map(([x, z]) => new THREE.Vector2(x, z));
    k.mesh(g, mitredBand(pts, !!o.closed, 0.5, 0.44, 0.05), 0x3e6a2e, [0, 0, 0]);
    k.mesh(g, mitredBand(pts, !!o.closed, 0.4, 0.08), 0x4a7a34, [0, 0.44, 0]);
  },
  /**
   * A garden tree: one of the island's grown trees (trees.ts, the woodcutting ladder's species) set
   * by hand, `opt.kind` in its shape `opt.v`, `opt.s` its size (1: the species' true size), turned
   * `opt.turn`, its leaves tinted `opt.tint` (a blossom's pink or white, or the species' own green);
   * petals fallen round its foot when `opt.petals` gives their colour. It sways with the wind and,
   * like the woods, is cut away round the hero (it is an occluding prop).
   */
  garden_tree: (k, g, arg) => {
    const o = (arg?.opt ?? {}) as { kind?: GrownKind; v?: number; s?: number; turn?: number; tint?: number; petals?: number };
    const kind = o.kind ?? 'tree', set = grownTrees(kind), v = (o.v ?? 0) % set.canopy.length, s = o.s ?? 1;
    // (Each tree's instance stands at its own offset, its mesh moved back by it: the wind's phase,
    // read from the instance's place, differs from tree to tree while the tree stays at the prop.)
    const off = new THREE.Vector3(hash01(s, v, 3) * 40 - 20, 0, hash01(v, s, 5) * 40 - 20);
    const m = new THREE.Matrix4().compose(off, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.turn ?? 0), new THREE.Vector3(s, s, s));
    const tint = new THREE.Color(o.tint ?? GROWN[kind].look.palette[0]);
    for (const part of ['trunk', 'canopy'] as const) {
      const mesh = new THREE.InstancedMesh(treeGeometry(kind, part, v), treeMaterial(kind, part), 1);
      mesh.setMatrixAt(0, m);
      if (part === 'canopy') mesh.setColorAt(0, tint);
      mesh.position.copy(off).negate();
      mesh.computeBoundingSphere();
      mesh.name = `garden-tree-${part}`;
      g.add(mesh);
    }
    if (o.petals !== undefined) {
      for (let i = 0; i < 14; i++) {
        const a = hash01(i, 21) * Math.PI * 2, r = (0.6 + hash01(i, 22) * 1.4) * s;
        k.box(g, [0.12, 0.02, 0.09], [Math.cos(a) * r, 0.03, Math.sin(a) * r], o.petals, [0, a, 0]);
      }
    }
    // (The leaves' shadows are cut to their outline by their own atlas, as the woods' are.)
    return {
      obj: g,
      tick: (t) => {
        TREE_WIND.uWindT.value = t;
      },
    };

  },
  /** A garden bench (facing +Z): an oak seat and back on stone ends. */
  garden_bench: (k, g) => {
    for (const x of [-0.9, 0.9]) {
      cb(k, g, [0.22, 0.44, 0.5], [x, 0.22, 0], STONE_L, undefined, 0.04);
      cb(k, g, [0.16, 0.5, 0.12], [x, 0.7, -0.2], STONE_L, undefined, 0.03);
    }
    for (const z of [-0.12, 0.08]) cb(k, g, [2.1, 0.08, 0.18], [0, 0.48, z], WOOD_L, undefined, 0.02);
    for (const y of [0.72, 0.9]) cb(k, g, [2.0, 0.12, 0.06], [0, y, -0.22], WOOD_L, [-0.12, 0, 0], 0.02);
  },
  /** A great stone urn on a square pedestal, spilling flowers over its rim. */
  urn: (k, g) => {
    // In the castle's stone: a blue-grey plinth, a cream pedestal and bowl, blue-grey mouldings; a
    // clipped box ball standing in the bowl (like the cour's topiary), a ring of flowers round it.
    cb(k, g, [1.0, 0.18, 1.0], [0, 0.09, 0], BASE, undefined, 0.03);
    cb(k, g, [0.78, 0.7, 0.78], [0, 0.53, 0], ASHLAR, undefined, 0.04);
    cb(k, g, [0.92, 0.12, 0.92], [0, 0.94, 0], DRESS, undefined, 0.03);
    k.mesh(g, taper(0.32, 0.32, 0.5, 0.5, 0.18), ASHLAR_L, [0, 1.09, 0]);
    k.mesh(g, taper(0.5, 0.5, 1.0, 1.0, 0.62), ASHLAR_L, [0, 1.49, 0]);
    cb(k, g, [1.08, 0.12, 1.08], [0, 1.84, 0], DRESS, undefined, 0.03);
    ball(k, g, 0.52, [0, 2.36, 0], 0x4a7a34);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      cb(k, g, [0.14, 0.12, 0.14], [Math.sin(a) * 0.44, 1.97, Math.cos(a) * 0.44], [0xd8486a, 0xf4ece0, 0xe86aa8][i % 3], [0, a, 0], 0.04);
    }
  },
  /** A sundial: a dressed stone baluster with a bronze dial and its gnomon. */
  sundial: (k, g) => {
    cb(k, g, [1.1, 0.2, 1.1], [0, 0.1, 0], STONE_D, undefined, 0.03);
    k.mesh(g, taper(0.56, 0.56, 0.36, 0.36, 0.7), STONE_L, [0, 0.55, 0]);
    k.mesh(g, taper(0.36, 0.36, 0.6, 0.6, 0.2), STONE_L, [0, 1.0, 0]);
    cb(k, g, [0.78, 0.1, 0.78], [0, 1.15, 0], STONE, undefined, 0.02);
    k.mesh(g, octagon(0.32, 0.04), 0x8c6a3e, [0, 1.22, 0], [0, 0, Math.PI / 2]);
    k.mesh(g, wedge(0.04, 0.24, 0.42), 0x8c6a3e, [0, 1.36, 0]);
  },
  /**
   * A horse in the castle's blocky style (facing +Z, `v` its coat: chestnut, bay or grey): a deep
   * squared barrel, four straight block legs on dark hooves, a thick neck carried up and forward, a
   * long squared head with a dark muzzle, ears, eyes, a dark mane and forelock and a tail falling
   * from the rump; `len` 1 grazing, its neck and head down to the grass.
   */
  horse: (k, g, arg) => {
    const graze = lenOf(arg) === 1, v = vOf(arg) % 3, coat = [0x8a5430, 0x4a3024, 0xb8aea2][v], dark = 0x231812;
    const shade = new THREE.Color(coat).multiplyScalar(0.84).getHex(), muzzle = v === 2 ? 0x6a625a : 0x2e2018;
    // The barrel, the chest and the rump, squared and chunky.
    cb(k, g, [0.6, 0.6, 1.5], [0, 1.28, 0], coat, undefined, 0.1);
    cb(k, g, [0.56, 0.5, 0.34], [0, 1.24, 0.74], shade, undefined, 0.08);
    cb(k, g, [0.64, 0.56, 0.5], [0, 1.34, -0.6], coat, undefined, 0.1);
    // Four straight legs, a darker shade below the knee, on dark hooves.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * 0.19, z = sz * 0.58;
      cb(k, g, [0.17, 0.5, 0.2], [x, 0.78, z], coat, undefined, 0.03);
      cb(k, g, [0.14, 0.5, 0.16], [x, 0.32, z], shade, undefined, 0.02);
      cb(k, g, [0.18, 0.12, 0.22], [x, 0.06, z + 0.02], dark, undefined, 0.02);
    }
    // The neck, carried up and forward from the shoulders (or down to the grass), the mane along it.
    const nb: V3 = [0, 1.48, 0.66], nt: V3 = graze ? [0, 0.82, 1.18] : [0, 2.12, 1.02];
    const nl = Math.hypot(nt[1] - nb[1], nt[2] - nb[2]), na = Math.atan2(nt[2] - nb[2], nt[1] - nb[1]);
    const nc: V3 = [0, (nb[1] + nt[1]) / 2, (nb[2] + nt[2]) / 2];
    cb(k, g, [0.3, nl + 0.2, 0.42], nc, coat, [na, 0, 0], 0.08);
    const back = graze ? 1 : -1;
    cb(k, g, [0.1, nl + 0.05, 0.12], [0, nc[1] + 0.16 * (graze ? -0.6 : 0.6), nc[2] + back * 0.2], dark, [na, 0, 0], 0.02);
    // The head: long and squared, tilted nose-down, a dark muzzle, ears, eyes and forelock.
    const hd = new THREE.Group();
    hd.position.set(0, nt[1] + (graze ? -0.18 : 0.04), nt[2] + (graze ? 0.12 : 0.2));
    hd.rotation.x = graze ? 1.25 : 0.5;
    g.add(hd);
    cb(k, hd, [0.28, 0.3, 0.64], [0, 0, 0.12], coat, undefined, 0.06);
    cb(k, hd, [0.26, 0.24, 0.18], [0, -0.03, 0.47], muzzle, undefined, 0.05);
    if (v === 0) k.box(hd, [0.08, 0.02, 0.36], [0, 0.155, 0.2], 0xf0e6d8);
    for (const sx of [-1, 1]) {
      cb(k, hd, [0.07, 0.16, 0.06], [sx * 0.08, 0.21, -0.12], coat, [0, 0, sx * 0.15], 0.02);
      k.box(hd, [0.03, 0.05, 0.06], [sx * 0.145, 0.06, 0.02], dark);
      k.box(hd, [0.03, 0.03, 0.03], [sx * 0.06, -0.06, 0.565], dark);
    }
    cb(k, hd, [0.14, 0.06, 0.16], [0, 0.17, -0.02], dark, undefined, 0.02);
    // The tail falling from the rump.
    cb(k, g, [0.13, 0.78, 0.15], [0, 1.16, -0.86], dark, [0.26, 0, 0], 0.03);
  },
  /**
   * A knight in stone on a stepped plinth (facing +Z), the lord's champion: plate armour and an
   * open-faced plumed helm, a cloak down the back, hands folded on the pommel of a sword planted point down
   * before him, a kite shield leaning at his side.
   */
  champion: (k, g) => {
    // Warm marble on a carved plinth in the castle's stone, the lord's blue on his tabard; grown with the
    // grand stair (the plinth laid on the course lines, the knight half as tall again as the hero).
    const S = MARBLE, SD = MARBLE_D, SL = MARBLE_L;
    cb(k, g, [2.6, COURSE, 2.6], [0, COURSE / 2, 0], BASE, undefined, 0.06);
    cb(k, g, [2.1, 2 * COURSE + 0.02, 2.1], [0, 2 * COURSE - 0.01, 0], ASHLAR, undefined, 0.06);
    cb(k, g, [1.2, 0.5, 0.05], [0, 1.0, 1.065], ASHLAR_L, undefined, 0.02);
    cb(k, g, [2.3, 0.16, 2.3], [0, 3 * COURSE + 0.08, 0], DRESS, undefined, 0.03);
    const knight = new THREE.Group();
    knight.position.y = 3 * COURSE + 0.16;
    knight.scale.setScalar(GROW);
    g.add(knight);
    statue(k, knight, S, SD, SL);
  },
  // ─── The walled gardens ────────────────────────────────────────────────────────
  /**
   * A gateway through a garden wall (the way through along local Z), `len` wide between its piers: a
   * pier either side a metre square, standing a little proud of the wall's faces and over its coping
   * (`opt.h`, the wall's height), on a base course, under a moulded cap and a ball finial; a pair of
   * navy iron gates hung on the piers' inner faces, standing open a quarter turn toward -Z (into the
   * garden) against the gateway's sides.
   */
  garden_gate: (k, g, arg) => {
    const W = lenOf(arg) ?? 3, H = (arg?.opt as { h?: number } | undefined)?.h ?? 2.6;
    for (const sx of [-1, 1]) {
      gardenPier(k, g, sx * (W / 2 + 0.52), 0, H);
      // The leaf: a stile at its hinge against the pier, bars between top and bottom rails, gilt
      // spear heads over the top rail, swung open along Z to lie beside the gateway's side.
      const leaf = new THREE.Group(), L = W / 2 - 0.06;
      leaf.position.set(sx * (W / 2 - 0.04), 0, 0);
      leaf.rotation.y = -sx * (Math.PI / 2);
      g.add(leaf);
      // (Its height in proportion to the wall's, so a gate in a taller wall stands taller than the hero.)
      const u = -sx, f = H / 2.6;
      cb(k, leaf, [0.07, 1.95 * f, 0.07], [0, 0.98 * f, 0], LAMP_NAVY, undefined, 0.01);
      cb(k, leaf, [0.07, 1.8 * f, 0.07], [u * L, 0.9 * f, 0], LAMP_NAVY, undefined, 0.01);
      for (const y of [0.18, 0.95, 1.72]) k.box(leaf, [L, 0.06, 0.05], [(u * L) / 2, y * f, 0], LAMP_NAVY);
      const n = Math.max(3, Math.round(L / 0.14));
      for (let i = 1; i < n; i++) {
        const xb = (u * L * i) / n;
        k.box(leaf, [0.035, 1.6 * f, 0.035], [xb, 0.95 * f, 0], LAMP_NAVY);
        k.mesh(leaf, taper(0.07, 0.07, 0.01, 0.01, 0.14), PAL.gold, [xb, 1.82 * f, 0]);
      }
    }
  },
  /**
   * A fruit tree trained flat against a wall (facing +Z, its back on the wall's face at z = 0): a
   * short trunk and three tiers of arms either side along the wall, `len` across, leafy spurs along
   * every arm and fruit hanging from them (`v`: 0 apples, 1 pears).
   */
  espalier: (k, g, arg) => {
    const L = lenOf(arg) ?? 2.6, pear = vOf(arg) === 1, z = 0.16, LEAF = [0x3e6e2e, 0x4a7a34, 0x56883c];
    k.mesh(g, taper(0.16, 0.16, 0.1, 0.1, 2.0), WOOD_D, [0, 1.0, z]);
    cb(k, g, [0.26, 0.14, 0.24], [0, 0.07, z], WOOD_D, undefined, 0.04);
    [0.7, 1.25, 1.8].forEach((y, t) => {
      const reach = L / 2 - t * 0.15;
      for (const sx of [-1, 1]) {
        k.mesh(g, taper(0.07, 0.07, 0.05, 0.05, reach), WOOD_D, [(sx * reach) / 2, y, z], [0, 0, Math.PI / 2]);
        for (let i = 0, x = 0.3; x < reach - 0.05; i++, x += 0.34) {
          ball(k, g, 0.13 + hash01(i, t, sx) * 0.05, [sx * x, y + 0.07, z + 0.02], LEAF[(i + t) % 3], [1.2, 0.8, 0.7]);
          if ((i + t) % 2 === 0) k.gem(g, 0.06, [sx * x + 0.05, y - 0.08, z + 0.09], pear ? 0xc8b040 : i % 4 ? 0xc8342a : 0xe8a030);
        }
      }
    });
    ball(k, g, 0.16, [0, 2.02, z], LEAF[1], [1, 0.9, 0.7]);
  },
  /**
   * A kitchen bed `opt.w` by `opt.d` (along X and Z) of dark tilled soil, planted in rows along X of
   * one crop (`v`): 0 cabbages, 1 lettuces, 2 carrots, 3 leeks, 4 red cabbages, 5 runner beans on
   * cane wigwams in red flower.
   */
  kitchen_bed: (k, g, arg) => {
    const o = (arg?.opt ?? {}) as { w?: number; d?: number }, W = o.w ?? 4, D = o.d ?? 3, v = vOf(arg) % 6;
    cb(k, g, [W, 0.14, D], [0, 0.07, 0], 0x4a3624, undefined, 0.05);
    const soil = new THREE.Group();
    soil.position.y = 0.14;
    g.add(soil);
    spread(D, v === 5 ? 1.1 : 0.55, 0.35).forEach((z, r) => {
      k.box(soil, [W - 0.3, 0.05, 0.32], [0, 0.0, z], 0x3a2a1c);
      if (v === 5) {
        // Bean wigwams: four canes leaning in to a tie, leaves climbing them, red flowers.
        spread(W, 1.0, 0.5).forEach((x, i) => {
          for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) limb(k, soil, [x + dx * 0.3, 0, z + dz * 0.3], [x, 1.7, z], [0.035, 0.035, 0.03, 0.03], WOOD_L);
          for (let j = 0; j < 4; j++) {
            const a = j * 1.7 + i, rr = 0.24 - j * 0.04;
            ball(k, soil, 0.14, [x + Math.cos(a) * rr, 0.35 + j * 0.34, z + Math.sin(a) * rr], j % 2 ? 0x4a7a34 : 0x3e6e2e, [1, 1.2, 1]);
            k.gem(soil, 0.05, [x + Math.cos(a) * (rr + 0.1), 0.42 + j * 0.34, z + Math.sin(a) * (rr + 0.1)], 0xd8322e);
          }
        });
        return;
      }
      spread(W, v === 2 || v === 3 ? 0.3 : 0.48, 0.3).forEach((x, i) => {
        const seed = i * 1.37 + r * 5.1;
        if (v === 0 || v === 4) PLANT.cabbage(k, soil, x, z, seed, v === 4);
        else if (v === 1) PLANT.lettuce(k, soil, x, z, seed);
        else if (v === 2) PLANT.carrot(k, soil, x, z, seed);
        else PLANT.leek(k, soil, x, z, seed);
      });
    });
  },
  /**
   * The privy garden's basin: a round pool in a ring of dressed stone (radius 1.3), a baluster rising
   * from it to a shallow bowl brimming with water, the water still and dark.
   */
  garden_basin: (k, g) => {
    const R = 1.3;
    drum(k, g, { r: R, rIn: R - 0.3, y0: 0, y1: 0.5, n: drumStones(R), course: 0.5 }, DRESS);
    k.mesh(g, waterDisc(R - 0.3), BASIN_WATER, [0, 0.3, 0]);
    k.cyl(g, 0.34, 0.42, 0.3, [0, 0.15, 0], STONE, undefined, 8);
    k.cyl(g, 0.16, 0.22, 0.9, [0, 0.75, 0], STONE_L, undefined, 8);
    k.cyl(g, 0.6, 0.2, 0.22, [0, 1.31, 0], STONE_L, undefined, 12);
    k.mesh(g, waterDisc(0.5), BASIN_WATER, [0, 1.42, 0]);
  },
  /** Two straw bee skeps on a stone shelf (facing +Z): coiled domes with a dark entrance at the foot. */
  skeps: (k, g) => {
    for (const x of [-0.7, 0.7]) cb(k, g, [0.3, 0.55, 0.5], [x, 0.275, 0], STONE_L, undefined, 0.04);
    cb(k, g, [1.9, 0.12, 0.62], [0, 0.61, 0], DRESS, undefined, 0.03);
    for (const x of [-0.5, 0.5]) {
      for (let i = 0; i < 5; i++) k.cyl(g, 0.3 - i * 0.055, 0.32 - i * 0.055, 0.11, [x, 0.725 + i * 0.1, 0], i % 2 ? 0xc8a050 : 0xb89040, undefined, 12);
      k.box(g, [0.12, 0.07, 0.06], [x, 0.71, 0.28], 0x2a1e14);
    }
  },
  /** A paddock's water trough (along local X): a long timber trough on trestle legs, water standing in it. */
  field_trough: (k, g) => {
    for (const x of [-0.8, 0.8]) for (const z of [-0.22, 0.22]) cb(k, g, [0.1, 0.42, 0.1], [x, 0.21, z], WOOD_D, undefined, 0.02);
    cb(k, g, [2.1, 0.08, 0.66], [0, 0.46, 0], WOOD, undefined, 0.02);
    for (const z of [-0.3, 0.3]) cb(k, g, [2.1, 0.34, 0.06], [0, 0.67, z], WOOD, undefined, 0.02);
    for (const x of [-1.02, 1.02]) cb(k, g, [0.06, 0.34, 0.54], [x, 0.67, 0], WOOD_D, undefined, 0.02);
    k.box(g, [1.98, 0.02, 0.54], [0, 0.76, 0], BASIN_WATER);
  },
  /** A hay rack on its legs (along local X): a slatted manger of timber filled with hay. */
  hay_rack: (k, g) => {
    for (const x of [-0.9, 0.9]) for (const z of [-0.3, 0.3]) cb(k, g, [0.12, 1.3, 0.12], [x, 0.65, z], WOOD_D, undefined, 0.02);
    cb(k, g, [1.9, 0.08, 0.7], [0, 0.66, 0], WOOD, undefined, 0.02);
    for (const z of [-0.3, 0.3]) for (let i = 0; i < 7; i++) cb(k, g, [0.05, 0.6, 0.05], [-0.84 + i * 0.28, 0.98, z], WOOD_L, undefined, 0.01);
    for (const z of [-0.3, 0.3]) cb(k, g, [1.9, 0.07, 0.07], [0, 1.27, z], WOOD, undefined, 0.01);
    cb(k, g, [1.7, 0.42, 0.54], [0, 0.91, 0], 0xc8a858, undefined, 0.15);
    for (let i = 0; i < 6; i++) cb(k, g, [0.4, 0.2, 0.36], [-0.65 + i * 0.26, 1.16 + hash01(i, 3) * 0.06, (hash01(i, 4) - 0.5) * 0.2], i % 2 ? 0xd8b868 : 0xb8984a, [0, hash01(i, 5), 0.2], 0.08);
  },
  /** A mounting block (climbed toward +Z): three stone steps up to a rider's stirrup. */
  mounting_block: (k, g) => {
    for (let i = 0; i < 3; i++) cb(k, g, [1.0, 0.25 * (i + 1), 0.4], [0, 0.125 * (i + 1), -0.4 + i * 0.4], i === 2 ? STONE : STONE_L, undefined, 0.03);
  },
  // ─── The training yard ────────────────────────────────────────────────────────
  /** A pell: a stout post set on a stone block for sword practice, bound with iron, hacked about. */
  pell: (k, g) => {
    cb(k, g, [0.6, 0.18, 0.6], [0, 0.09, 0], STONE, undefined, 0.03);
    cb(k, g, [0.26, 1.85, 0.26], [0, 1.1, 0], WOOD, [0, 0.2, 0], 0.03);
    for (const y of [0.5, 1.75]) cb(k, g, [0.3, 0.06, 0.3], [0, y, 0], IRON, [0, 0.2, 0], 0.01);
    // (Notches cut in it by the blows, pale wood showing.)
    for (const [y, a] of [[1.15, 0.2], [1.35, 1.6], [0.95, 3.0], [1.5, 4.3]]) k.box(g, [0.14, 0.03, 0.04], [Math.sin(a) * 0.12, y, Math.cos(a) * 0.12], WOOD_L, [0, a, 0.15]);
  },
  /**
   * A yard's arms rack (along local X, its front toward +Z): a timber A-frame with spears and a
   * halberd leaning on its top rail, and practice swords and a bow hung along a lower rail.
   */
  arms_rack: (k, g) => {
    for (const x of [-0.95, 0.95]) for (const e of [-1, 1]) cb(k, g, [0.1, 1.5, 0.1], [x, 0.7, e * 0.22], WOOD_D, [e * -0.3, 0, 0], 0.02);
    cb(k, g, [2.1, 0.1, 0.1], [0, 1.35, 0], WOOD, undefined, 0.02);
    cb(k, g, [2.1, 0.08, 0.08], [0, 0.62, 0.3], WOOD, undefined, 0.02);
    for (const [x, tilt] of [[-0.75, 0.12], [-0.4, -0.08], [-0.05, 0.1], [0.3, -0.12]]) {
      cb(k, g, [0.06, 1.9, 0.06], [x, 0.95, 0.12], WOOD_L, [0.25, 0, tilt], 0.01);
      const top = new THREE.Vector3(0, 0.92, 0).applyEuler(new THREE.Euler(0.25, 0, tilt)).add(new THREE.Vector3(x, 0.95, 0.12));
      k.mesh(g, prism(0.12, 0.35, 0.6), 0x6e7280, [top.x, top.y, top.z], [0.25, 0, tilt]);
    }
    // The halberd: its blade and spike at the top of a longer shaft.
    cb(k, g, [0.07, 2.2, 0.07], [0.7, 1.08, 0.14], WOOD_D, [0.24, 0, -0.06], 0.01);
    const hb = new THREE.Vector3(0, 0.95, 0).applyEuler(new THREE.Euler(0.24, 0, -0.06)).add(new THREE.Vector3(0.7, 1.08, 0.14));
    cb(k, g, [0.3, 0.32, 0.04], [hb.x + 0.12, hb.y, hb.z], IRON, [0.24, 0, -0.06], 0.02);
    // Wooden practice swords and a short bow hung on the lower rail.
    for (const x of [-0.7, -0.45, -0.2]) {
      cb(k, g, [0.08, 0.72, 0.03], [x, 0.3, 0.36], WOOD_L, [0.05, 0, 0], 0.01);
      cb(k, g, [0.24, 0.05, 0.05], [x, 0.66, 0.36], WOOD_D, undefined, 0.01);
    }
    limb(k, g, [0.3, 0.6, 0.37], [0.55, 0.15, 0.37], [0.04, 0.04, 0.03, 0.03], WOOD_D);
    limb(k, g, [0.3, 0.6, 0.37], [0.6, 0.98, 0.37], [0.04, 0.04, 0.03, 0.03], WOOD_D);
  },
  /**
   * The archery yard's shooting line (along local X), `len` long: a timber sill laid in the earth,
   * a white peg marking each archer's place every 2.5 metres.
   */
  shooting_line: (k, g, arg) => {
    const L = lenOf(arg) ?? 12;
    cb(k, g, [L, 0.08, 0.2], [0, 0.02, 0], WOOD_D, undefined, 0.02);
    for (const x of spread(L, 2.5, 1.25)) cb(k, g, [0.12, 0.3, 0.12], [x, 0.15, -0.16], 0xe8e2d4, undefined, 0.02);
  },
  /**
   * A lozenge bed in a parterre's lawn, `opt.w` across along X and `opt.d` along Z: one clipped box
   * edging round its four sides, the soil inside planted with flowers in rings of colour (`v`: 0
   * tulips gold to red, 1 roses white to pink, 2 white tulips ringed with lavender).
   */
  parterre_bed: (k, g, arg) => {
    const o = (arg?.opt ?? {}) as { w?: number; d?: number }, W = o.w ?? 5, D = o.d ?? 3.6, v = vOf(arg) % 3;
    const pts = [[-W / 2, 0], [0, -D / 2], [W / 2, 0], [0, D / 2]].map(([x, z]) => new THREE.Vector2(x, z));
    const soil = new THREE.Shape(pts.map((q) => new THREE.Vector2(q.x, -q.y)));
    k.mesh(g, new THREE.ExtrudeGeometry(soil, { depth: 0.1, bevelEnabled: false }).rotateX(-Math.PI / 2), 0x3a2a1e, [0, 0, 0]);
    k.mesh(g, mitredBand(pts, true, 0.42, 0.4, 0.05), 0x3e6a2e, [0, 0, 0]);
    k.mesh(g, mitredBand(pts, true, 0.32, 0.07), 0x4a7a34, [0, 0.4, 0]);
    // Planted in staggered rows across the lozenge, every plant a hand's breadth clear of the box.
    const ringOf = (x: number, z: number) => Math.abs(x) / (W / 2) + Math.abs(z) / (D / 2);
    const bed = new THREE.Group();
    bed.position.y = 0.1;
    g.add(bed);
    for (let r = 0, z = -D / 2 + 0.4; z <= D / 2 - 0.4; r++, z += 0.34) for (let x = -W / 2 + 0.4; x <= W / 2 - 0.4; x += 0.32) {
      const xx = x + (r % 2 ? 0.16 : 0), ring = ringOf(xx, z), seed = xx * 3.1 + z * 7.7;
      if (ring > 0.74) continue;
      if (v === 0) PLANT.tulip(k, bed, xx, z, ring < 0.3 ? 0xf0b828 : ring < 0.52 ? 0xe86a2a : 0xd8323a, 0.32 + hash01(xx, z) * 0.08, seed);
      else if (v === 1) {
        if (Math.round(x / 0.32) % 2 === 0) PLANT.rose(k, bed, xx, z, ring < 0.4 ? 0xf4ece0 : 0xe0507a, 0.8, seed);
      } else if (ring < 0.45) PLANT.tulip(k, bed, xx, z, 0xf4ece0, 0.34, seed);
      else PLANT.lavender(k, bed, xx, z, seed);
    }
  },
};
