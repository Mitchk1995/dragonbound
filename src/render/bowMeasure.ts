import * as THREE from 'three';
import { COMBAT_TUNING } from '../data/tuning';
import { BOW_TURN } from './anim';

/**
 * Where the bow in the hero's right hand is and which way it faces, read from the scene graph in world space every
 * frame (tests/bow-audit.test.ts in CI, the `bow` inspect suite in the running game). Nothing here trusts how the bow
 * was authored: the tips come from the string's ends, the riser from the bow's own vertices round its middle, and the
 * back of the bow is the way from the string's line out through the riser.
 */
export interface BowMeasure {
  /** Unit, bottom tip to top tip. */
  axis: THREE.Vector3;
  top: THREE.Vector3;
  bottom: THREE.Vector3;
  /** The string's middle: its nock, where the draw hand holds it when drawn. */
  string: THREE.Vector3;
  /** The middle of the bow's body round its grip (the riser), halfway between the tips. */
  riser: THREE.Vector3;
  /** The riser's half width across the bow (square to its axis and its back), and how far its back face lies out
   * from its middle along `back`. */
  riserHalfWidth: number;
  riserBack: number;
  /** Unit, from the line between the tips out through the riser: the way the back of the bow faces. */
  back: THREE.Vector3;
  /** How far each tip's end lies out along `back` from the line between the tips (negative: curled toward the
   * string's side). */
  tipCurl: [number, number];
  /** How far the middle of each limb lies out along `back` from the line between the tips. */
  limbBulge: [number, number];
  /** The bow hand's hole (sock_handR) and the grip it holds (the bow's mesh named bow_grip, gear.py): how far the
   * grip runs below and above the hole along the bow (null: the bow has no grip) and how far the hole lies off the
   * grip's centre line. */
  hand: THREE.Vector3;
  grip: { below: number; above: number } | null;
  handOffAxis: number;
  /** The nocked arrow while it shows: its nock, its direction and the point of its head. */
  arrow: { nock: THREE.Vector3; dir: THREE.Vector3; tip: THREE.Vector3 } | null;
}

const V = new THREE.Vector3();
/** How far the bow hand's C closes round the grip either side of its hole (tools/blender/_common.py clip_hand: 0.22
 * deep). */
const HAND_HALF = 0.11;

/** The bow in the right hand of `root`, measured (null without one, or before BowDraw has rigged its string). */
export function measureBow(root: THREE.Object3D): BowMeasure | null {
  const bow = root.getObjectByName('gear:sock_handR'), sock = root.getObjectByName('sock_handR');
  if (!bow || !sock) return null;
  root.updateWorldMatrix(true, true);
  const strings: THREE.Mesh[] = [];
  const body: THREE.Mesh[] = [];
  bow.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    for (let p: THREE.Object3D | null = o; p && p !== bow; p = p.parent) if (p.name === 'bow_arrow') return;
    (o.name === 'bow_string' ? strings : body).push(o);
  });
  if (strings.length !== 2 || !body.length) return null;
  // Each string half runs from its tip (its origin) to the nock (its local +Y end).
  const top = strings[0].getWorldPosition(new THREE.Vector3()), bottom = strings[1].getWorldPosition(new THREE.Vector3());
  const string = strings[0].localToWorld(new THREE.Vector3(0, 1, 0));
  const axis = top.clone().sub(bottom).normalize();
  const middle = top.clone().add(bottom).multiplyScalar(0.5);
  const length = top.distanceTo(bottom);
  const offLine = (p: THREE.Vector3) => p.clone().sub(middle).projectOnPlane(axis);
  // The riser: every vertex of the bow's body within a tenth of its length of its middle, boxed in the bow's own frame
  // (so mesh density cannot pull its centre about).
  const inv = new THREE.Matrix4().copy(bow.matrixWorld).invert();
  const box = new THREE.Box3();
  const verts: THREE.Vector3[] = [];
  for (const m of body) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const w = V.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).clone();
      verts.push(w);
      if (Math.abs(w.clone().sub(middle).dot(axis)) < length * 0.1) box.expandByPoint(w.clone().applyMatrix4(inv));
    }
  }
  const riser = box.getCenter(new THREE.Vector3()).applyMatrix4(bow.matrixWorld);
  const back = offLine(riser).normalize();
  const side = new THREE.Vector3().crossVectors(axis, back);
  let half = 0, behind = 0;
  for (const w of verts) {
    if (Math.abs(w.clone().sub(middle).dot(axis)) >= length * 0.1) continue;
    half = Math.max(half, Math.abs(w.clone().sub(riser).dot(side)));
    behind = Math.max(behind, w.clone().sub(riser).dot(back));
  }
  // A tip's end: its farthest vertices along the bow; a limb's middle: the vertices halfway out to its tip.
  const along = (w: THREE.Vector3) => w.clone().sub(middle).dot(axis);
  const reach = Math.max(...verts.map((w) => Math.abs(along(w))));
  const outAt = (lo: number, hi: number) => {
    const sel = verts.filter((w) => along(w) >= lo && along(w) <= hi);
    return sel.length ? sel.reduce((s, w) => s + offLine(w).dot(back), 0) / sel.length : NaN;
  };
  // The grip: its vertices along the bow from the hand's hole, and boxed in the bow's own frame for its centre line.
  const hand = sock.getWorldPosition(new THREE.Vector3());
  const gripMesh = body.find((o) => o.name === 'bow_grip');
  let grip: BowMeasure['grip'] = null, handOffAxis = Infinity;
  if (gripMesh) {
    const gripBox = new THREE.Box3();
    let below = 0, above = 0;
    const pos = gripMesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const w = V.fromBufferAttribute(pos, i).applyMatrix4(gripMesh.matrixWorld);
      const a = w.clone().sub(hand).dot(axis);
      below = Math.max(below, -a);
      above = Math.max(above, a);
      gripBox.expandByPoint(w.applyMatrix4(inv));
    }
    grip = { below, above };
    handOffAxis = hand.clone().sub(gripBox.getCenter(new THREE.Vector3()).applyMatrix4(bow.matrixWorld)).projectOnPlane(axis).length();
  }
  // The arrow: from its nock (the group's origin) along its +Y to the farthest point of its head.
  const arrowGroup = bow.getObjectByName('bow_arrow');
  let arrow: BowMeasure['arrow'] = null;
  if (arrowGroup?.visible) {
    const nock = arrowGroup.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 1, 0).transformDirection(arrowGroup.matrixWorld);
    let far = 0;
    arrowGroup.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) far = Math.max(far, V.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).sub(nock).dot(dir));
    });
    arrow = { nock, dir, tip: nock.clone().addScaledVector(dir, far) };
  }
  return {
    axis, top, bottom, string, riser, riserHalfWidth: half, riserBack: behind, back,
    tipCurl: [outAt(reach - 0.04, reach), outAt(-reach, -reach + 0.04)],
    limbBulge: [outAt(length * 0.2, length * 0.3), outAt(-length * 0.3, -length * 0.2)],
    hand, grip, handOffAxis, arrow,
  };
}

/** What the archer is doing, for the checks that only hold then (see bowChecks). */
export type BowState = 'carried' | 'turning' | 'aimed' | 'drawn';

/** One check: its value, the limit it must keep and whether it does. */
export interface BowCheck { value: number; limit: string; ok: boolean }

const at = (value: number, ok: boolean, limit: string): BowCheck => ({ value: +value.toFixed(3), limit, ok });

/**
 * The owner's rules for a held bow, against a measurement (`aim`: unit, toward the target; `forward`: the way the
 * archer faces; `chest`, `head`: world positions, the head's at its pivot on the jaw line; `face`: unit, the way the
 * head looks; `drawHand`: the draw hand's hole):
 * 1. the string lies between the riser and the archer; 2. the limbs bend away from him; 3. aimed, the bow's plane is
 * near upright and holds the aim; 4. the bow hand's hole is on the grip; 5. drawn, the draw hand holds the string's
 * nock, beside the jaw; 6. the arrow's nock is on the string and it points at the target, its head past the riser;
 * 7. carried, the bow is angled down and forward, its back forward; 8. aimed, he stands side-on to the target, the
 * line from his draw shoulder to his bow shoulder (`shoulders`: their pivots) along the aim.
 */
export function bowChecks(m: BowMeasure, state: BowState, o: {
  aim: THREE.Vector3; forward: THREE.Vector3; chest: THREE.Vector3; head: THREE.Vector3; face: THREE.Vector3;
  drawHand: THREE.Vector3; shoulders: { bow: THREE.Vector3; draw: THREE.Vector3 };
}) {
  const c: Record<string, BowCheck> = {};
  const toChest = o.chest.clone().sub(m.riser).normalize();
  const stringOut = m.string.clone().sub(m.riser).normalize();
  c['1 string toward the chest (cos)'] = at(stringOut.dot(toChest), stringOut.dot(toChest) >= 0.5, '>= 0.5');
  c['2 back away from the chest (cos)'] = at(-m.back.dot(toChest), -m.back.dot(toChest) >= 0.5, '>= 0.5');
  const curl = Math.min(...m.tipCurl), bulge = Math.min(...m.limbBulge);
  c['2 limbs bulge toward the back'] = at(bulge, bulge > 0.01, '> 0.01');
  c['2 tips never curl toward the string'] = at(curl, curl >= -0.06, '>= -0.06');
  // The hand's C closes HAND_HALF either side of its hole along the bow: all of it on the grip, the hole at its middle.
  const onGrip = m.grip ? Math.min(m.grip.below, m.grip.above) - HAND_HALF : -1;
  const offMiddle = m.grip ? Math.abs(m.grip.above - m.grip.below) / 2 : 1;
  c['4 hand on the grip'] = at(onGrip, onGrip >= 0, '>= 0');
  c['4 hand hole at the grip\'s middle'] = at(offMiddle, offMiddle <= 0.02, '<= 0.02');
  c['4 hand hole off the grip\'s centre line'] = at(m.handOffAxis, m.handOffAxis <= 0.03, '<= 0.03');
  if (state === 'aimed' || state === 'drawn') {
    const normal = new THREE.Vector3().crossVectors(m.axis, m.back).normalize();
    const ahead = m.riser.clone().sub(m.string).dot(o.aim);
    c['1 riser on the target side'] = at(ahead, ahead > 0.1, '> 0.1');
    c['2 back toward the target (cos)'] = at(m.back.dot(o.aim), m.back.dot(o.aim) >= 0.9, '>= 0.9');
    c['3 bow upright (cos)'] = at(Math.abs(m.axis.y), Math.abs(m.axis.y) >= 0.94, '>= 0.94');
    c['3 plane off the aim (sin)'] = at(Math.abs(normal.dot(o.aim)), Math.abs(normal.dot(o.aim)) <= 0.17, '<= 0.17');
    const line = o.shoulders.bow.clone().sub(o.shoulders.draw).setY(0).normalize().dot(o.aim);
    c['8 side-on: shoulders along the aim (cos)'] = at(line, line >= 0.87, '>= 0.87');
  }
  if (state === 'drawn') {
    const nockGap = o.drawHand.distanceTo(m.string);
    c['5 draw hand on the nock'] = at(nockGap, nockGap <= 0.03, '<= 0.03');
    // In the head's frame (its pivot is at the jaw line, `face` the way it looks): at the jaw's height, out beside the
    // head and no further back than its back.
    const rel = o.drawHand.clone().sub(o.head);
    const height = rel.y, along = rel.dot(o.face), beside = rel.clone().projectOnPlane(o.face).setY(0).length();
    c['5 draw hand at jaw height'] = at(height, height >= -0.15 && height <= 0.15, '-0.15..0.15');
    c['5 draw hand beside the head'] = at(beside, beside >= 0.3 && beside <= 0.5, '0.3..0.5');
    c['5 draw hand along the face'] = at(along, along >= -0.5 && along <= 0.25, '-0.5..0.25');
    if (m.arrow) {
      const a = m.arrow;
      c['6 arrow nock on the string'] = at(a.nock.distanceTo(m.string), a.nock.distanceTo(m.string) <= 0.01, '<= 0.01');
      c['6 arrow at the target (cos)'] = at(a.dir.dot(o.aim), a.dir.dot(o.aim) >= 0.98, '>= 0.98');
      const past = a.tip.clone().sub(m.riser).dot(m.back) - m.riserBack;
      c['6 arrow head past the back of the riser'] = at(past, past >= 0.03, '>= 0.03');
      // Where the arrow passes the riser, it runs beside it, not through it.
      const t = m.riser.clone().sub(a.nock).dot(a.dir);
      const by = a.nock.clone().addScaledVector(a.dir, t).sub(m.riser).projectOnPlane(m.axis).length();
      c['6 arrow beside the riser'] = at(by, by >= m.riserHalfWidth + 0.01, `>= ${(m.riserHalfWidth + 0.01).toFixed(3)}`);
    } else {
      c['6 arrow nocked'] = at(0, false, 'shown');
    }
  }
  if (state === 'carried') {
    const lean = Math.acos(Math.min(1, Math.abs(m.axis.y))) * (180 / Math.PI);
    const topForward = (m.axis.y >= 0 ? m.axis : m.axis.clone().negate()).dot(o.forward);
    c['7 angled from upright (deg)'] = at(lean, lean >= 20 && lean <= 65, '20..65');
    c['7 top tip forward'] = at(topForward, topForward > 0.3, '> 0.3');
    c['7 back forward (cos)'] = at(m.back.dot(o.forward), m.back.dot(o.forward) >= 0.5, '>= 0.5');
  }
  return c;
}

/** How deep a world point lies inside a closed mesh (0: outside it): a ray from it crosses the surface an odd number of
 * times when it is inside, and then its depth is its distance to the nearest of the surface's triangles. */
function depthIn(mesh: THREE.Mesh, point: THREE.Vector3) {
  const local = point.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
  const ray = new THREE.Ray(local, new THREE.Vector3(1, 0.0013, 0.0007).normalize());
  const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
  const count = index ? index.count : pos.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
  const corner = (i: number, v: THREE.Vector3) => v.fromBufferAttribute(pos, index ? index.getX(i) : i);
  let crossings = 0;
  for (let i = 0; i < count; i += 3) if (ray.intersectTriangle(corner(i, a), corner(i + 1, b), corner(i + 2, c), false, hit)) crossings++;
  if (crossings % 2 === 0) return 0;
  const tri = new THREE.Triangle(), w = mesh.matrixWorld;
  let depth = Infinity;
  for (let i = 0; i < count; i += 3) {
    tri.set(corner(i, a).applyMatrix4(w), corner(i + 1, b).applyMatrix4(w), corner(i + 2, c).applyMatrix4(w));
    depth = Math.min(depth, tri.closestPointToPoint(point, hit).distanceTo(point));
  }
  return depth;
}

/** How near the bow hand's hole the grip runs through that hand (and a gauntlet's cuff closes round it)... */
const GRIP_ZONE = 0.2;
/** ...and how deep the bow may lie in that hand and forearm there and still be held, not cut in: as deep as
 * tools/blender/bowcheck.py allows (a grip's band tucked under a gauntlet's rim reaches 0.025). */
const GRIP_DEPTH = 0.03;
/** How deep a point may lie inside the archer and only touch him: the bow's surface 2 cm (a graze), the string's middle
 * line its own half thickness. */
const GRAZE = 0.02, STRING_GRAZE = 0.009;
/** How far apart the points tested along the bow's edges, its string and the arrow lie. */
const STEP = 0.03;
/** The parts of the archer a clip is reported against. */
const PARTS = ['legL', 'legR', 'head', 'handR', 'elbowR', 'armR', 'elbowL', 'armL', 'sock_hips', 'sock_chest', 'body'];

/** Points every STEP along each edge of a mesh's triangles, its corners included, in world space. */
function edgePoints(mesh: THREE.Mesh, out: THREE.Vector3[]) {
  const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
  const count = index ? index.count : pos.count;
  const corner = (i: number) => (index ? index.getX(i) : i);
  const seen = new Set<string>();
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
  for (let t = 0; t < count; t += 3) {
    for (const [p, q] of [[t, t + 1], [t + 1, t + 2], [t + 2, t]]) {
      const i = corner(p), j = corner(q), key = i < j ? `${i},${j}` : `${j},${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      a.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(pos, j).applyMatrix4(mesh.matrixWorld);
      const n = Math.ceil(a.distanceTo(b) / STEP);
      for (let k = 1; k < n; k++) out.push(a.clone().lerp(b, k / n));
    }
  }
}

/**
 * Points of the bow cutting into the archer: its limbs and riser (every corner and every STEP along every edge), its
 * string (every STEP from each tip to the nock) and the nocked arrow (every STEP from the nock to its point), tested
 * against every mesh of the archer but the bow's own and the draw hand (the string runs through its hole). A point
 * counts when it lies deeper inside than a graze (GRAZE, STRING_GRAZE); within GRIP_ZONE of the bow hand's hole, where
 * the grip runs through that hand and forearm, only deeper than GRIP_DEPTH. `deepest` is the deepest point found
 * anywhere but that hold, `held` the deepest in it.
 */
export function bowClips(root: THREE.Object3D, m: BowMeasure) {
  root.updateWorldMatrix(true, true);
  const solid: { mesh: THREE.Mesh; part: string; grip: boolean; box: THREE.Box3 }[] = [];
  const bow: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    const chain: string[] = [];
    for (let p: THREE.Object3D | null = o; p && p !== root.parent; p = p.parent) chain.push(p.name);
    if (chain.includes('gear:sock_handR')) {
      if (o.name !== 'bow_string' && !chain.includes('bow_arrow')) bow.push(o);
      return;
    }
    if (chain.includes('handL')) return;
    solid.push({ mesh: o, part: PARTS.find((n) => chain.includes(n)) ?? 'body', grip: chain.includes('elbowR'), box: new THREE.Box3().setFromObject(o) });
  });
  const body: THREE.Vector3[] = [];
  for (const b of bow) edgePoints(b, body);
  const points: [THREE.Vector3, number][] = body.map((p) => [p, GRAZE]);
  const along = (from: THREE.Vector3, to: THREE.Vector3) => {
    const n = Math.max(1, Math.ceil(from.distanceTo(to) / STEP));
    for (let i = 0; i <= n; i++) points.push([from.clone().lerp(to, i / n), STRING_GRAZE]);
  };
  along(m.top, m.string);
  along(m.bottom, m.string);
  if (m.arrow) along(m.arrow.nock, m.arrow.tip);
  let count = 0, deepest = 0, held = 0;
  const into = new Set<string>();
  for (const [q, graze] of points) {
    for (const x of solid) {
      if (!x.box.containsPoint(q)) continue;
      const d = depthIn(x.mesh, q), hold = x.grip && q.distanceTo(m.hand) < GRIP_ZONE;
      if (hold) held = Math.max(held, d);
      else deepest = Math.max(deepest, d);
      if (d <= (hold ? GRIP_DEPTH : graze)) continue;
      count++;
      into.add(x.part);
      break;
    }
  }
  return { count, deepest: +deepest.toFixed(3), held: +held.toFixed(3), into: [...into] };
}

/**
 * One frame of the bow, measured and judged (bowChecks, bowClips) from the scene graph as it stands: what the archer
 * is doing (carried, turning into or out of the shot, aimed, or drawn while the draw hand holds the nocked arrow), the
 * rules for it and every point of the bow inside him. `attack` is the attack's progress (-1: none); the archer faces,
 * and aims, along his parent's +Z (Unit.obj in the game).
 */
export function auditBow(root: THREE.Object3D, attack: number) {
  const m = measureBow(root);
  if (!m) return null;
  const yaw = root.rotation.y;
  const state: BowState = Math.abs(yaw) < 1e-6 && attack < 0 ? 'carried' : Math.abs(yaw - BOW_TURN) > 1e-6 ? 'turning'
    : attack >= 0.3 && attack < COMBAT_TUNING.impact ? 'drawn' : 'aimed';
  const at = (n: string) => root.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
  const forward = new THREE.Vector3(0, 0, 1);
  if (root.parent) forward.transformDirection(root.parent.matrixWorld).setY(0).normalize();
  const checks = bowChecks(m, state, {
    aim: forward, forward, chest: at('sock_chest'), head: at('head'), drawHand: at('sock_handL'),
    face: new THREE.Vector3(0, 0, 1).transformDirection(root.getObjectByName('head')!.matrixWorld),
    shoulders: { bow: at('armR'), draw: at('armL') },
  });
  return { state, measure: m, checks, clips: bowClips(root, m) };
}
