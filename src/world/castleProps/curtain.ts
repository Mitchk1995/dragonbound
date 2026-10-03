/** The castle's curtain: its wall, towers, gates, doors and climbers (src/world/props.ts builds the rest of the world's props). */
import * as THREE from 'three';
import { CURTAIN_WALL } from '../../data/castle';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelKit, PAL, type V3 } from '../../render/kit';
import { studioEnv } from '../../render/env';
import { COURSE, drumStones } from '../../render/masonry';
import { addPatch } from '../../render/surface';
import { chamferBox, hash01, taper } from '../../render/blocks';
import { type Builder, archPane, archRing, ASHLAR, ASHLAR_L, ASHLAR_W, BASE, BASE_COURSE, boardedLeaf, cb, CLIMBER_BLOOM, CLIMBER_IVY, CLIMBER_ROSE_LEAF, crownFoot, DARK, DECK, DOORS, DRESS, dressedArch, drum, flag, GILT, glassMat, INLAY, IRON, LAMP_NAVY, lenOf, limb, livery, PAVE, pointedArch, pointedDoor, roomMat, spandrels, spire, spread, vOf, WOOD_D } from '../props';

/** A climber's leaf card: a flat pointed leaf (a squashed octahedron), lying flat to the wall. */
/** A climber's leaf: a small flat card (five-sided, so a sheet of them reads as foliage, not tiles). */
const CLIMBER_LEAF = new THREE.CircleGeometry(1, 7);

/**
 * A drum's battered base course (two courses of the stone, a metre high), leaning in from radius `foot`
 * to `head`: as many stones as the drum of radius r rising from it, in the same bond, so its joints run
 * on up into the drum's.
 */
function drumFoot(k: ModelKit, g: THREE.Object3D, r: number, foot: number, head: number, x = 0, z = 0) {
  drum(k, g, { r: foot, rTop: head, y0: 0, y1: BASE_COURSE, n: drumStones(r) }, BASE, x, z);
}

/**
 * One course of the dressed stone standing `out` proud of a drum of radius r from the course line y:
 * the drum's own course at that height, its stones a little larger, so the bond runs on through it.
 */
function drumCourse(k: ModelKit, g: THREE.Object3D, r: number, out: number, y: number, x = 0, z = 0) {
  drum(k, g, { r: r + out, y0: y, y1: y + COURSE, n: drumStones(r) }, DRESS, x, z);
}

/**
 * The top of a round tower of radius r centred at (x, z) whose platform is at height P, all in the
 * castle's one stone: the course that carries the parapet, stepped out from the drum and ending on a
 * course line at the platform (crownFoot), the parapet ring standing flush on it two courses high, one
 * continuous coping, and merlons over every other of its N bays. Each is a ring of N flat stones (so a
 * merlon stands square on a stone of the coping), every course turned half a stone on the one under it.
 */
function crown(k: ModelKit, g: THREE.Object3D, x: number, z: number, r: number, P: number, N: number, rose = true) {
  const top = crownFoot(P);
  drum(k, g, { r: r + 0.3, y0: top - COURSE, y1: top, n: N }, DRESS, x, z);
  drum(k, g, { r: r + 0.3, rIn: r - 0.2, y0: top, y1: top + 2 * COURSE, n: N }, ASHLAR, x, z);
  // One continuous coping round the parapet's top under the merlons (never a cap per merlon), its joints
  // between the bays, so each merlon stands on one of its stones.
  drum(k, g, { r: r + 0.36, rIn: r - 0.26, y0: top + 2 * COURSE, y1: top + 2 * COURSE + 0.12, n: N, bond: false }, DRESS, x, z);
  for (let i = 0; i < N; i += 2) {
    const a = ((i + 0.5) / N) * Math.PI * 2, c = 2 * (r + 0.25) * Math.sin(Math.PI / N);
    cb(k, g, [c * 0.82, 0.62, 0.54], [x + Math.sin(a) * (r + 0.05), top + 2 * COURSE + 0.43, z + Math.cos(a) * (r + 0.05)], hash01(i, r) > 0.7 ? ASHLAR_L : ASHLAR, [0, a, 0], 0.05);
  }
  k.cyl(g, r - 0.2, r - 0.2, 0.1, [x, P + 0.05, z], rose ? ASHLAR_W : DECK, undefined, N);
  if (!rose) return;
  // The platform paved as a compass rose inlaid in the castle's own stone: a cream ring round a honey
  // field, a star of eight points (two squares turned against each other) laid in dark slate and
  // outlined by a thin gold inlay (each square laid on a slightly larger one of gilt, so the gold
  // shows only round the star's outline), a cream heart, and a thin gold ring round the slate plinth
  // at its centre (where a flagpole stands).
  const rr = r - 0.2, sq = rr * 0.98;
  k.mesh(g, ringBand(rr * 0.74, rr * 0.86, 0.03, N), ASHLAR_L, [x, P + 0.1, z]);
  k.cyl(g, rr * 0.74, rr * 0.74, 0.03, [x, P + 0.112, z], ASHLAR, undefined, N);
  for (const a of [0, Math.PI / 4]) k.box(g, [sq + 0.12, 0.03, sq + 0.12], [x, P + 0.122, z], GILT, [0, a, 0]);
  for (const a of [0, Math.PI / 4]) k.box(g, [sq, 0.03, sq], [x, P + 0.135, z], INLAY, [0, a, 0]);
  k.cyl(g, rr * 0.36, rr * 0.36, 0.03, [x, P + 0.15, z], ASHLAR_L, undefined, N);
  k.mesh(g, ringBand(0.5, 0.6, 0.03, 16), GILT, [x, P + 0.17, z]);
  k.cyl(g, 0.42, 0.48, 0.16, [x, P + 0.2, z], INLAY, undefined, 10);
}

/**
 * An arrow loop on a face at z (facing +Z), centred at (x, y): a cross loop, its tall slit crossed by a
 * short one, dark within, set in a dressed surround of pale stone, so it reads as a built loop.
 */
export function arrowLoop(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number) {
  // (The surround only just proud of the face, so it reads as dressed into the wall.)
  cb(k, g, [0.5, 1.56, 0.12], [x, y, z - 0.01], ASHLAR_L, undefined, 0.02);
  k.box(g, [0.11, 1.16, 0.04], [x, y, z + 0.055], DARK);
  k.box(g, [0.36, 0.1, 0.04], [x, y + 0.1, z + 0.055], DARK);
}

/**
 * Lays a piece built flat (along X, its face toward +Z, z = 0 lying on a circle of radius R centred on
 * the origin) into that circle as a mason cuts a doorway through a round wall: every point keeps its
 * height and its place across (moved `o` to the side), and goes straight back or out to its own depth
 * in the wall, so the opening's sides stay square to the way through it while its faces follow the
 * curve.
 */
function cutRound(geo: THREE.BufferGeometry, R: number, o = 0) {
  const g = geo.clone(), p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + o, rad = R + p.getZ(i);
    p.setXYZ(i, x, p.getY(i), Math.sqrt(Math.max(0, rad * rad - x * x)));
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A doorway cut into a drum's wall (onto a wall walk): its surround `L` wide and `top` high, set
 * `back` into the drum and standing only `out` proud of its face, so the stone is cut away for it.
 */
const walkDoor = () => ({ L: DOORS.single.w + 0.6, top: DOORS.single.h + 0.5, back: 0.34, out: 0.05 });

/**
 * A drum's shaft of radius r between heights y0 and y1, laid in rings of flat stones, its wall cut away
 * where doorways onto the wall walk open in it (`doors`: the bearings of their middles and their
 * offsets, sill at `sill`): through each doorway's height the courses are notched straight back along
 * the way through it to a shallow arc behind its surround (the surround is cut the same way: see
 * cutRound), so the doorway stands in the drum's face instead of on it.
 */
function drumShaft(k: ModelKit, g: THREE.Object3D, r: number, y0: number, y1: number, color: number, doors: [number, number][], sill: number) {
  const wd = walkDoor();
  const notches = doors.map(([a, o]) => ({ a, o, half: wd.L / 2 - 0.035, back: r - wd.back + 0.04, y0: sill, y1: sill + wd.top }));
  drum(k, g, { r, y0, y1, n: drumStones(r), notches }, color);
}

/**
 * A doorway in a drum of radius `r` (centred on its group's origin), on the bearing `a` (radians from
 * +Z toward +X), its middle `o` across from the line through the drum's centre and its sill at `y`:
 * a surround of pale dressed stone curved to the drum, the pointed opening cut through it, a
 * blue-grey hood following the arch on its face with label stops, a threshold, and the single blue
 * door at the back of the reveal. A doorway onto a wall walk is cut into the drum (see drumShaft:
 * the shaft is notched for it, the surround flush with the drum's face); one at the drum's foot
 * stands out over the battered plinth and rises to the first band.
 */
export function drumDoorway(k: ModelKit, g: THREE.Object3D, r: number, a: number, o: number, y: number, foot = 0) {
  const { w: W, h } = DOORS.single, rise = Math.min(W * 0.866, h * 0.62);
  const wd = walkDoor(), L = foot ? W + 0.6 : wd.L, top = foot ? CURTAIN_COURSES[0] + 0.4 - y : wd.top, back = foot ? 0.08 : wd.back, deep = foot ? 0.62 : wd.out;
  const R = r + (deep - back) / 2, dep = deep + back;
  // (The doorway faces straight down the walk that comes to it, its middle on the walk's middle: the
  // frame turned to the walk's bearing, everything in it set `o` across.)
  const f = new THREE.Group();
  f.rotation.y = a;
  g.add(f);
  // The surround: the stone round the opening in upright strips, each from the opening's outline (or
  // the sill beside it) to the top, so every face of it lies flat once it follows the curve.
  {
    const { arc } = pointedArch(W, h, 12, rise), jw = (L - W) / 2;
    const edge: [number, number][] = [[-L / 2, 0], [-W / 2 - jw / 2, 0], [-W / 2, 0], ...arc.map(([x, yy]) => [-x, yy] as [number, number]), ...arc.slice(0, -1).reverse(), [W / 2, 0], [W / 2 + jw / 2, 0], [L / 2, 0]];
    const strips = edge.slice(1).flatMap(([xb, yb], i) => {
      if (xb - edge[i][0] < 1e-6) return [];
      const [xa, ya] = edge[i], sh = new THREE.Shape([new THREE.Vector2(xa, ya), new THREE.Vector2(xb, yb), new THREE.Vector2(xb, top), new THREE.Vector2(xa, top)]);
      return new THREE.ExtrudeGeometry(sh, { depth: dep, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -dep / 2);
    });
    const geo = cutRound(mergeGeometries(strips), R, o);
    const zOn = (x: number) => Math.sqrt(R * R - x * x);
    // (For the geometry audit: its two jambs, turned with the curve, and the head over the arch.)
    geo.userData.boxes = [
      ...[-1, 1].map((sx) => o + sx * (W / 2 + jw / 2)).map((x) => ({ c: [x, top / 2, zOn(x)], h: [jw / 2, top / 2, dep / 2], ry: Math.asin(x / R) })),
      { c: [o, (h + top) / 2, zOn(o)], h: [W / 2, (top - h) / 2, dep / 2], ry: Math.asin(o / R) },
    ];
    k.mesh(f, geo, ASHLAR_L, [0, y, 0]);
  }
  // The ring of dressed voussoirs round the arch and down its jambs, laid on the surround's face and
  // bent to the drum's curve with it.
  {
    const Rf = r + deep;
    for (const st of dressedArch({ w: W, h, rise, t: 0.24, p: 0.06, dep: 0.02, n: 3, kw: 0.3, foot: 0, grid: y, seed: Math.floor(hash01(r, a, y) * 97) })) {
      const flat = st.geo.userData.boxes as number[][], geo = cutRound(st.geo, Rf, o);
      // (For the geometry audit: each stone's bounds bent round with it.)
      geo.userData.boxes = flat.map(([x0, y0, z0, x1, y1, z1]) => {
        const xc = (x0 + x1) / 2 + o, rad = Rf + (z0 + z1) / 2;
        return { c: [xc, (y0 + y1) / 2, Math.sqrt(rad * rad - xc * xc)], h: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2], ry: Math.asin(xc / rad) };
      });
      k.mesh(f, geo, DRESS, [0, y, 0]);
    }
  }
  // The leaf stands square across the way at the back of the reveal: on the plinth's face at a drum's
  // foot; in the cut into the drum on a wall walk, as far back as the cut lets it at both its edges.
  const inR = r - back + 0.04, back0 = Math.max(...[-1, 1].map((sx) => Math.sqrt(inR * inR - (o + (sx * W) / 2) ** 2)));
  const zLeaf = foot ? r + 0.53 : back0 + 0.06, sill = y + (foot ? 0 : 0.05);
  // The threshold across the opening, from under the leaf out over the face, a step proud of the
  // walk's deck that runs in to it.
  const rt = r + deep + 0.1, t0 = foot ? r : zLeaf - 0.05, t1 = Math.sqrt(rt * rt - o * o);
  cb(k, f, [W + 0.02, 0.1, t1 - t0], [o, sill - 0.05, (t0 + t1) / 2], DRESS, undefined, 0.02);
  const d = new THREE.Group();
  d.position.set(o, sill, zLeaf);
  f.add(d);
  pointedDoor(k, d, W, h, rise, 'single', false, 0.06);
}

/**
 * A round tower of radius r (the round_tower and corner_tower props), laid in rings of flat stones as
 * a stone tower is (see drum): a deep, battered base course, a drum rising a full storey or more over
 * the wall walk (+9) to its platform at H + 1.4, a string course and the course under the wall walk
 * level with the curtain's (CURTAIN_COURSES), a band under the crown, and the crown (a parapet ring on
 * a course stepped out from the drum, merlons), all in the castle's one stone on the course lines. Each
 * course that stands proud is the drum's own course at that height, the same stones a little larger,
 * so the bond runs on through it. A plain tower's platform is paved as a compass rose; a corner tower
 * (or a stair tower, `spire`) carries a plain band under its crown and a spire. `walks`: where the
 * curtain's wall walks come to it ([bearing, offset] pairs), a doorway onto each; `door`: the bearing
 * of a door at its foot; `out`: the bearing it faces out from the castle, its arrow loops in two rows
 * round that side.
 */
export interface TowerOpts {
  walks?: [number, number][];
  door?: number;
  out?: number;
  spire?: boolean;
}

function drumTower(k: ModelKit, g: THREE.Object3D, r: number, H: number, corner: boolean, opt: TowerOpts = {}) {
  const N = crownBays(r), P = H + 1.4, spired = corner || !!opt.spire, top = crownFoot(P);
  drumFoot(k, g, r, r + 0.5, r + 0.15);
  drumShaft(k, g, r, BASE_COURSE, P, ASHLAR, opt.walks ?? [], DOORS.walk.y);
  for (const y of CURTAIN_COURSES) drumCourse(k, g, r, 0.06, y);
  if (spired) drumBand(k, g, 0, 0, r, top - 1.5 * COURSE);
  else drumCourse(k, g, r, 0.06, top - 2 * COURSE);
  crown(k, g, 0, 0, r, P, N, !spired);
  for (const [a, o] of opt.walks ?? []) drumDoorway(k, g, r, a, o, DOORS.walk.y);
  if (opt.door !== undefined) drumDoorway(k, g, r, opt.door, 0, 0, 0.5);
  // Arrow loops: three to a row across the outward side, evenly spaced, one row in each storey (between
  // the courses), none where a wall or a doorway meets the drum.
  if (opt.out !== undefined) {
    const busy = [...(opt.walks ?? []).map(([a]) => a), ...(opt.door !== undefined ? [opt.door] : [])];
    const step = (Math.PI * 2) / N;
    for (const da of [-0.95, 0, 0.95]) {
      const a = (Math.round((opt.out + da) / step - 0.5) + 0.5) * step;
      if (busy.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.75)) continue;
      const f = new THREE.Group();
      f.rotation.y = a;
      g.add(f);
      for (const y of LOOP_ROWS) arrowLoop(k, f, 0, y, r);
    }
  }
  if (spired) {
    spire(k, g, 0, P + 0.9, 0, r + 0.1, r * 1.75, N, 1, 1.5);
    shadowless(g);
  }
}

/**
 * The flags flying high over the walls cast no shadow: seen from the play camera they fly above the
 * top of the screen, and their shadows would cross the bailey from nothing in sight.
 */
function shadowless(g: THREE.Object3D) {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name === 'cloth') (o.material as THREE.Material).userData.decal = true;
  });
}

/**
 * The band under a spired drum's crown, round a drum of radius r centred at (x, z), its course
 * centred at height y: the drum's own course standing proud, plain (the gold diamond is kept for the
 * banners and flags).
 */
export function drumBand(k: ModelKit, g: THREE.Object3D, x: number, z: number, r: number, y: number) {
  drum(k, g, { r: r + 0.1, y0: y - COURSE / 2, y1: y + COURSE / 2, n: drumStones(r) }, DRESS, x, z);
}

/**
 * A flat ring (an annulus `h` thick from radius rIn to rOut, base on y = 0) with `n` straight sides,
 * its corners at the same angles as a kit cylinder's: copings and eave rings round round towers.
 */
const ringCache = new Map<string, THREE.BufferGeometry>();

export function ringBand(rIn: number, rOut: number, h: number, n: number) {
  const key = `${rIn},${rOut},${h},${n}`;
  let geo = ringCache.get(key);
  if (geo) return geo;
  const poly = (r: number) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    // Laid flat below, the shape's -y becomes +z: (sin a, cos a) round the plan like a cylinder's.
    return new THREE.Vector2(Math.sin(a) * r, -Math.cos(a) * r);
  });
  const shape = new THREE.Shape(poly(rOut));
  shape.holes.push(new THREE.Path(poly(rIn)));
  // Extruded along +Z, then laid flat (+Z becomes +Y).
  geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2);
  geo.userData.ring = [rIn, rOut];
  ringCache.set(key, geo);
  return geo;
}

/**
 * A round window (an oculus) of radius `r` on a face at z (facing +Z), centred at (x, y): a ring of
 * the castle's dressed stone round it with a keystone at each quarter, and one clear pane over the lit
 * room behind.
 */
export function oculus(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number, r: number) {
  const n = 16, t = 0.18, ro = r + t;
  const ring = (a: number, b: number, d: number) => {
    const geo = ringBand(a, b, d, n).clone().rotateX(Math.PI / 2);
    delete geo.userData.ring;
    // (For the geometry audit: the ring as four boxes round the opening.)
    geo.userData.boxes = [[-b, a, 0, b, b, d], [-b, -b, 0, b, -a, d], [-b, -a, 0, -a, a, d], [a, -a, 0, b, a, d]];
    return geo;
  };
  // (Only just proud of the face, and hugging a drum's curve.)
  k.mesh(g, ring(r, ro, 0.1), DRESS, [x, y, z - 0.02]);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    cb(k, g, [0.2, t + 0.06, 0.12], [x + Math.sin(a) * (r + t / 2), y + Math.cos(a) * (r + t / 2), z + 0.05], DRESS, [0, 0, -a], 0.02);
  }
  const room = new THREE.Mesh(new THREE.CircleGeometry(r, n), roomMat(k, true));
  room.name = 'room';
  room.position.set(x, y, z + 0.012);
  g.add(room);
  const pane = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape().absarc(0, 0, r, 0, Math.PI * 2, false), { depth: 0.02, bevelEnabled: false, curveSegments: n }).translate(0, 0, -0.01), glassMat(k));
  pane.name = 'glass';
  pane.position.set(x, y, z + 0.04);
  g.add(pane);
}

// ─── The glazing kit ─────────────────────────────────────────────────────────

/**
 * The castle's window glass (the owner, October 3: see-through glass with a cool blue tint): two thin
 * sheets in one opening. The first filters what lies behind it, each colour multiplied by the glass's
 * cool blue as tinted glass does, so the room shows through it clear and cooled, never hazed over.
 */
const GLASS_TINT = new THREE.Color().setRGB(0.62, 0.8, 0.96, THREE.LinearSRGBColorSpace);

const tintMats = new WeakMap<ModelKit, THREE.MeshBasicMaterial>();

function glassTint(k: ModelKit) {
  let m = tintMats.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: GLASS_TINT, transparent: true, depthWrite: false, fog: false, toneMapped: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
    });
    m.userData.decal = true;
    tintMats.set(k, m);
  }
  return m;
}

/**
 * The glass's face, over the tint: it gives back only what glass gives back. A faint blue body, the
 * sky's sheen growing at a glancing look (where less of the room shows through, as on real glass), and
 * the leading: diamond quarries a quarter of a metre across in thin lead cames, with an iron saddle bar
 * every three quarters of a metre up.
 */
const faceMats = new WeakMap<ModelKit, THREE.MeshStandardMaterial>();

function glassFace(k: ModelKit) {
  let m = faceMats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: 0x000000, roughness: 0.06, metalness: 0, envMap: studioEnv(), envMapIntensity: 0.4,
      transparent: true, depthWrite: false, premultipliedAlpha: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    addPatch(m, { key: 'glass-face', apply: (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPane;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPane = position.xy;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPane;')
        .replace('#include <opaque_fragment>', `{
          // (The cames' and bars' distances in metres, antialiased over the pixel.)
          vec2 q = vec2(vPane.x / 0.25, vPane.y / 0.4);
          float came = (0.5 - max(abs(fract(q.x + q.y) - 0.5), abs(fract(q.x - q.y) - 0.5))) / length(vec2(4.0, 2.5));
          float bar = abs(fract(vPane.y / 0.75 + 0.5) - 0.5) * 0.75, fw = max(fwidth(vPane.x), fwidth(vPane.y));
          float lead = max(1.0 - smoothstep(0.007, 0.007 + fw, came), 1.0 - smoothstep(0.012, 0.012 + fw, bar));
          float fres = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 5.0);
          outgoingLight = mix(outgoingLight + vec3(0.006, 0.016, 0.04), vec3(0.03, 0.03, 0.035) + outgoingLight * 0.4, lead);
          diffuseColor.a = max(lead, fres * 0.85);
        }
        #include <opaque_fragment>`);
    } });
    m.userData.cloth = true;
    m.userData.decal = true;
    m.userData.baseEmissive = new THREE.Color(0);
    m.userData.baseIntensity = 1;
    faceMats.set(k, m);
    k.mats.push(m);
  }
  return m;
}

/** The lit room behind a glazed window: its light is laid into its colours (see litRoom). */
const roomBoxMats = new WeakMap<ModelKit, THREE.MeshBasicMaterial>();

function roomBoxMat(k: ModelKit) {
  let m = roomBoxMats.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ vertexColors: true });
    m.userData.decal = true;
    roomBoxMats.set(k, m);
  }
  return m;
}

/** A glazed window's room: `w` wide and `d` deep behind its wall, its floor `floor` under the sill and its ceiling `ceil` over the opening's apex. */
export interface WindowRoom {
  w: number;
  d: number;
  floor: number;
  ceil: number;
}

/**
 * The room seen through a glazed window (see glazedWindow), built in the window's frame (x across, y
 * up from the sill, z out of the wall's face, the wall `T` thick, the opening `h` high): a plastered
 * chamber behind the wall, a boarded floor and a dark ceiling, a crimson tapestry hung on its back wall
 * over a trestle table with a lit candle on it, a rug under the table and a chest against one wall.
 * Its light is laid into it as it is built: every surface lit warm by the candle and falling off with
 * the distance, a little cool daylight from the window on what faces it, the corners dim, so it needs
 * no light of its own in the scene.
 */
function litRoom(h: number, T: number, r: WindowRoom) {
  const P: number[] = [], Cl: number[] = [];
  const x0 = -r.w / 2, x1 = r.w / 2, y0 = -r.floor, y1 = h + r.ceil, z0 = -T - r.d, z1 = -T;
  const tz = z0 + Math.min(0.5, r.d * 0.4), flame = new THREE.Vector3(0.18, y0 + 0.96, tz);
  type C3 = [number, number, number];
  const pv = new THREE.Vector3(), nv = new THREE.Vector3(), lv = new THREE.Vector3();
  /** A surface's light at a point: the candle's warmth, the window's cool daylight, a dim fill. */
  const lit = (p: THREE.Vector3, n: THREE.Vector3, a: C3): C3 => {
    const d = lv.subVectors(flame, p).length(), warm = (3.0 * Math.max(0, n.dot(lv) / Math.max(1e-4, d))) / (1 + (d / 0.7) ** 2);
    const day = (Math.max(0, n.z) * 0.12) / (1 + (z1 - p.z) ** 2);
    return [a[0] * (0.04 + warm + day * 0.8), a[1] * (0.035 + warm * 0.6 + day * 0.9), a[2] * (0.04 + warm * 0.28 + day)];
  };
  /** A flat face from corner `a` along `u` and `v` (its front where u × v points), cut into cells about a fifth of a metre across so its light falls off smoothly; `glow` lights itself. */
  const face = (a: C3, u: C3, v: C3, col: C3, glow = false) => {
    const lu = Math.hypot(...u), lv2 = Math.hypot(...v), nu = Math.max(1, Math.ceil(lu / 0.2)), nw = Math.max(1, Math.ceil(lv2 / 0.2));
    nv.set(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]).normalize();
    const at = (i: number, j: number): C3 => [a[0] + (u[0] * i) / nu + (v[0] * j) / nw, a[1] + (u[1] * i) / nu + (v[1] * j) / nw, a[2] + (u[2] * i) / nu + (v[2] * j) / nw];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nw; j++) {
      const q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      for (const t of [0, 1, 2, 0, 2, 3]) {
        P.push(...q[t]);
        Cl.push(...(glow ? col : lit(pv.set(...q[t]), nv, col)));
      }
    }
  };
  /** A box from `lo` to `hi`, every face out. */
  const box = (lo: C3, hi: C3, col: C3, glow = false) => {
    const [ax, ay, az] = lo, [bx, by, bz] = hi, dx = bx - ax, dy = by - ay, dz = bz - az;
    face([ax, ay, bz], [dx, 0, 0], [0, dy, 0], col, glow);
    face([bx, ay, az], [-dx, 0, 0], [0, dy, 0], col, glow);
    face([bx, ay, bz], [0, 0, -dz], [0, dy, 0], col, glow);
    face([ax, ay, az], [0, 0, dz], [0, dy, 0], col, glow);
    face([ax, by, bz], [dx, 0, 0], [0, 0, -dz], col, glow);
    face([ax, ay, az], [dx, 0, 0], [0, 0, dz], col, glow);
  };
  const PLASTER_IN: C3 = [0.5, 0.43, 0.33], OAK: C3 = [0.22, 0.13, 0.07], CRIMSON: C3 = [0.34, 0.045, 0.04], GOLD: C3 = [0.62, 0.42, 0.12];
  // The chamber: back wall, side walls, ceiling, and a floor of boards running back from the window.
  face([x0, y0, z0], [r.w, 0, 0], [0, y1 - y0, 0], PLASTER_IN);
  face([x0, y0, z1], [0, 0, z0 - z1], [0, y1 - y0, 0], PLASTER_IN);
  face([x1, y0, z0], [0, 0, z1 - z0], [0, y1 - y0, 0], PLASTER_IN);
  face([x0, y1, z0], [r.w, 0, 0], [0, 0, z1 - z0], [0.09, 0.06, 0.04]);
  const boards = Math.max(1, Math.round(r.w / 0.22));
  for (let i = 0; i < boards; i++) {
    const tone = 0.85 + 0.3 * hash01(i, r.w);
    face([x0 + (i * r.w) / boards, y0, z1], [r.w / boards, 0, 0], [0, 0, z0 - z1], [OAK[0] * tone, OAK[1] * tone, OAK[2] * tone]);
  }
  // The tapestry on the back wall on its rod: a gold border round a crimson field and a gold lozenge.
  const ty = y0 + 1.0, tw = Math.min(1.1, r.w * 0.45), th = Math.min(1.45, y1 - ty - 0.25);
  box([-tw / 2, ty, z0], [tw / 2, ty + th, z0 + 0.02], GOLD);
  box([-tw / 2 + 0.07, ty + 0.07, z0 + 0.02], [tw / 2 - 0.07, ty + th - 0.07, z0 + 0.035], CRIMSON);
  box([-0.12, ty + th / 2 - 0.16, z0 + 0.035], [0.12, ty + th / 2 + 0.16, z0 + 0.045], GOLD);
  box([-tw / 2 - 0.08, ty + th, z0], [tw / 2 + 0.08, ty + th + 0.05, z0 + 0.06], [0.12, 0.07, 0.04]);
  // The rug, the trestle table on it, and the candle in its holder (its flame lights the room).
  box([-0.75, y0, tz - 0.42], [0.75, y0 + 0.012, tz + 0.48], GOLD);
  box([-0.68, y0, tz - 0.35], [0.68, y0 + 0.018, tz + 0.41], CRIMSON);
  box([-0.55, y0 + 0.72, tz - 0.26], [0.55, y0 + 0.78, tz + 0.26], OAK);
  for (const sx of [-1, 1]) box([sx * 0.42 - 0.04, y0, tz - 0.2], [sx * 0.42 + 0.04, y0 + 0.72, tz + 0.2], OAK);
  box([flame.x - 0.05, y0 + 0.78, tz - 0.05], [flame.x + 0.05, y0 + 0.8, tz + 0.05], GOLD);
  box([flame.x - 0.025, y0 + 0.8, tz - 0.025], [flame.x + 0.025, y0 + 0.93, tz + 0.025], [0.9, 0.82, 0.62], true);
  box([flame.x - 0.016, y0 + 0.93, tz - 0.016], [flame.x + 0.016, y0 + 1.0, tz + 0.016], [3.2, 2.1, 0.8], true);
  // A chest against the left wall.
  box([x0, y0, z0 + 0.15], [x0 + 0.42, y0 + 0.46, z0 + 0.8], [0.18, 0.1, 0.05]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(Cl, 3));
  geo.computeVertexNormals();
  return geo;
}

/** A box in a prop's space. */
export interface Span {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** A glazed window: the opening `w` wide, its pointed head's apex `h` over the sill, through a wall `T` thick built in the stone `stone`; `room` behind it where the building has no room of its own there. */
export interface WindowSpec {
  w: number;
  h: number;
  T: number;
  stone: number;
  room?: WindowRoom;
}

/**
 * The castle's window, built as a real window (the owner, October 3: "windows to be windows, see
 * through, blue tint"; every earlier pass painted a room on a plate, which read as a niche or a
 * corridor): a real opening through the wall's whole thickness, so its reveal shows how thick the wall
 * is, framed by a dressed ring of the castle's stone round its pointed head and down its jambs on the
 * walling's courses, with a projecting sill; set back in the reveal, the leaded glass with its cool blue
 * tint (glassTint, glassFace); and behind it, where the building has no room of its own there, a small
 * lit chamber (litRoom), so what shows through the glass is real depth seen in parallax. Built on a face
 * at z (facing +Z), its sill at (x, y). The opening's head is filled with the wall's stone down to the
 * arch; the caller lays its walling round the opening and the chamber's cavity, both returned as boxes
 * in its space (see `carved`).
 */
export function glazedWindow(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number, o: WindowSpec) {
  const { w, h, T } = o;
  k.mesh(g, spandrels(w, h, T), o.stone, [x, y, z - T / 2]);
  archRing(k, g, x, y, z, w, h, { n: 3, t: 0.3, p: 0.1, dep: 0.14, jamb: true });
  // The sill stone runs in under the glass, a hair proud of the reveal's floor behind it.
  cb(k, g, [w + 0.5, 0.14, 0.43], [x, y - 0.07, z + 0.005], DRESS, undefined, 0.02);
  // The glass set back in the reveal behind the ring: the tint, and over it the face.
  for (const [mat, order, back] of [[glassTint(k), 1, 0.2], [glassFace(k), 2, 0.197]] as const) {
    const pane = new THREE.Mesh(archPane(w, h, 0.004), mat);
    pane.name = 'glass';
    pane.renderOrder = order;
    pane.position.set(x, y, z - back);
    g.add(pane);
  }
  const hole: Span = { x0: x - w / 2, x1: x + w / 2, y0: y - 0.006, y1: y + h, z0: z - T, z1: z + 0.01 };
  if (!o.room) return { hole, cavity: null };
  const r = o.room, room = new THREE.Mesh(litRoom(h, T, r), roomBoxMat(k));
  room.name = 'room';
  room.position.set(x, y, z);
  g.add(room);
  // (The cavity a hair larger than the chamber all round, so their faces never lie in one plane.)
  const cavity: Span = { x0: x - r.w / 2 - 0.01, x1: x + r.w / 2 + 0.01, y0: y - r.floor - 0.01, y1: y + h + r.ceil + 0.01, z0: z - T - r.d - 0.01, z1: z - T };
  return { hole, cavity };
}

/**
 * A block of walling `size` big, centred at `pos`, with `voids` left open in it (a glazed window's
 * opening and the chamber behind it), built as the boxes that fill it round them. Every box is laid as
 * part of the block's whole face (masonLayout reads `face`), so the courses and the bond run on round
 * the opening unbroken, and the boxes meet each other square.
 */
export function carved(k: ModelKit, g: THREE.Object3D, size: V3, pos: V3, color: number, voids: (Span | null)[]) {
  type B = [number, number, number, number, number, number];
  const lo = [0, 1, 2].map((i) => pos[i] - size[i] / 2), hi = [0, 1, 2].map((i) => pos[i] + size[i] / 2);
  /** A box less a void: the slabs under and over it, then beside it, then before and behind it. */
  const minus = (b: B, v: Span): B[] => {
    const [x0, y0, z0, x1, y1, z1] = b;
    if (v.x0 >= x1 || v.x1 <= x0 || v.y0 >= y1 || v.y1 <= y0 || v.z0 >= z1 || v.z1 <= z0) return [b];
    const vx0 = Math.max(x0, v.x0), vx1 = Math.min(x1, v.x1), vy0 = Math.max(y0, v.y0), vy1 = Math.min(y1, v.y1), vz0 = Math.max(z0, v.z0), vz1 = Math.min(z1, v.z1);
    const out: B[] = [[x0, y0, z0, x1, vy0, z1], [x0, vy1, z0, x1, y1, z1], [x0, vy0, z0, vx0, vy1, z1], [vx1, vy0, z0, x1, vy1, z1], [vx0, vy0, z0, vx1, vy1, vz0], [vx0, vy0, vz1, vx1, vy1, z1]];
    return out.filter((q) => q[3] - q[0] > 1e-4 && q[4] - q[1] > 1e-4 && q[5] - q[2] > 1e-4);
  };
  let boxes: B[] = [[lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]]];
  for (const v of voids) if (v) boxes = boxes.flatMap((b) => minus(b, v));
  const face = { x0: lo[0], x1: hi[0], z0: lo[2], z1: hi[2] };
  for (const [x0, y0, z0, x1, y1, z1] of boxes) k.box(g, [x1 - x0, y1 - y0, z1 - z0], [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], color).userData.face = face;
}

/** A wall lantern on a face (facing +Z) at x, its lamp at y: a navy bracket, a warm lantern and a gold finial. */
function wallLamp(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number) {
  cb(k, g, [0.2, 0.3, 0.08], [x, y + 0.3, z + 0.04], LAMP_NAVY, undefined, 0.01);
  cb(k, g, [0.07, 0.07, 0.42], [x, y + 0.4, z + 0.25], LAMP_NAVY, undefined, 0.01);
  k.box(g, [0.24, 0.32, 0.24], [x, y, z + 0.46], 0xffcf86, undefined, 0xffa038, 1.4);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(g, [0.04, 0.36, 0.04], [x + dx * 0.13, y, z + 0.46 + dz * 0.13], LAMP_NAVY);
  k.mesh(g, taper(0.36, 0.36, 0.08, 0.08, 0.16), LAMP_NAVY, [x, y + 0.24, z + 0.46]);
  k.mesh(g, new THREE.OctahedronGeometry(0.06, 1), PAL.gold, [x, y + 0.38, z + 0.46]);
}

/**
 * One leaf of a gate, `w` wide and `h` tall, hinged on its left edge at the origin and standing along
 * +X (facing +Z): boarded in the stained oak and strapped in iron like every castle door, a ring
 * handle at the hero's hand on each face, so an open leaf reads from either side.
 */
export function royalLeaf(k: ModelKit, g: THREE.Object3D, w: number, h: number, cls: keyof typeof DOORS, dep = 0.1) {
  boardedLeaf(k, g, {
    key: `r${w},${h}`, core: chamferBox(w, h, dep, 0.02), corePos: [w / 2, h / 2, 0], x0: 0, x1: w,
    top: () => h, dep, cls, hinge: -1, latch: w - 0.22, spring: h,
  });
}

/**
 * A gate through a stretch of full-height curtain (built along local X, outer face toward -Z like
 * the curtain): the passage `P` wide under a pointed arch, dressed voussoirs and a hood mould on both
 * faces, pale jambs, the wall walk carried over it. Options: `door` hangs two blue leaves just inside
 * the arch on that face (-1 outer, 1 inner), swung open against the passage's sides, `steps` lays a stone stoop out from the outer face, `head` raises a crenellated
 * head over the gate with the lord's crest on its inner face, `lanterns` hangs a lantern either side
 * of the arch on the faces listed (-1 outer, 1 inner).
 */
/**
 * The feet of the curtain's string course and of the course under its wall walk: on both its faces,
 * round every tower and across its gates, so the lines run on unbroken (each one course of the
 * castle's dressed stone, on the course lines).
 */
export const CURTAIN_COURSES = [4.5, 8.5];

/** How far in from a corner of the curtain the inner parapet's first merlon stands (clear of the turning run's parapet). */
const CORNER_CLEAR = 2.1;

/** The heights of a tower's two rows of arrow loops, one in each storey between its courses. */
const LOOP_ROWS = [6.75, 12.0];

/** How many bays a round crown of radius r has: as many as keep its merlons each about a metre across. */
const crownBays = (r: number) => 2 * Math.round((Math.PI * (r + 0.25)) / 1.3);

/** Mark a part as paving: laid on its top in the castle paving's own rows (a third of a metre deep) of stones two thirds long. */
export function paved<T extends THREE.Object3D>(m: T): T {
  m.userData.course = 1 / 3;
  m.userData.stone = 2 / 3;
  return m;
}

/**
 * The curtain's crown along local X (outer face toward -Z), `L` long, its inner side `LL` long centred
 * on `uc` (it runs on into a tower's drum): on the outer face a course standing a hand proud under the
 * parapet and the parapet flush on it; on the inner face the parapet carried out over the bailey on two
 * courses stepping out from the wall (a corbelled crown cut from the same stone, no corbel blocks); the
 * walk's deck between them, a coping on each parapet and merlons spread evenly along both, `clear` in
 * from the ends (the inner ones `inner` = [-X end, +X end] in, clear of the next run's parapet where the
 * walk turns a corner). All in the castle's stone on the course lines over the wall's top.
 */
function curtainCrown(k: ModelKit, g: THREE.Object3D, L: number, LL: number, uc: number, clear: number, inner: [number, number] = [clear, clear]) {
  const { T, H } = CURTAIN_WALL, fi = T / 2 + 0.85, cp = H + COURSE;
  k.box(g, [L, 0.06, fi - 0.56 + 0.52], [0, H + 0.03, (fi - 0.56 - 0.52) / 2], DECK);
  cb(k, g, [L, COURSE, 0.2], [0, H - COURSE / 2, -T / 2 + 0.02], DRESS, undefined, 0.02);
  cb(k, g, [L, COURSE, 0.68], [0, H + COURSE / 2, -T / 2 + 0.26], ASHLAR, undefined, 0.03);
  cb(k, g, [L, 0.12, 0.8], [0, cp + 0.06, -T / 2 + 0.26], DRESS, undefined, 0.02);
  cb(k, g, [LL, COURSE, 0.52], [uc, H - 1.5 * COURSE, T / 2 + 0.16], DRESS, undefined, 0.02);
  cb(k, g, [LL, COURSE, fi - T / 2 + 0.1], [uc, H - COURSE / 2, (fi + T / 2 - 0.1) / 2], DRESS, undefined, 0.02);
  cb(k, g, [LL, COURSE, 0.56], [uc, H + COURSE / 2, fi - 0.28], ASHLAR, undefined, 0.03);
  cb(k, g, [LL, 0.12, 0.66], [uc, cp + 0.06, fi - 0.28], DRESS, undefined, 0.02);
  for (const u of spread(L, 1.4, clear)) cb(k, g, [0.72, 0.6, 0.6], [u, cp + 0.42, -T / 2 + 0.3], hash01(u, T) > 0.7 ? ASHLAR_L : ASHLAR, undefined, 0.05);
  const [i0, i1] = inner;
  for (const u of spread(L - i0 - i1 + 2 * clear, 1.4, clear)) cb(k, g, [0.72, 0.56, 0.54], [u + (i0 - i1) / 2, cp + 0.4, fi - 0.28], hash01(u, T) > 0.7 ? ASHLAR_L : ASHLAR, undefined, 0.05);
}

export const CURTAIN_PROPS: Record<string, Builder> = {
  // ─── Castle v2 (docs/blueprints/castle-v2): curtain, towers, gates ─────────────
  // Every wall piece is built along local X with its outer face toward -Z (the inner face, the wall
  // walk's rail side, toward +Z). They stand full height and fade round the hero like any tall wall.
  /** A curtain wall `len` long. */
  castle_wall: (k, g, arg) => {
    // `v` flags: 1 / 2 a tower's drum at the -X / +X end (the wall walk's parapets run on into it),
    // 4 / 8 a small gate (postern or ward gate) at that end (no banner crowds the gate).
    const L = lenOf(arg) ?? 10, { T, H } = CURTAIN_WALL, ends = vOf(arg);
    const e0 = ends & 1 ? 0.7 : 0, e1 = ends & 2 ? 0.7 : 0, LL = L + e0 + e1, uc = (e1 - e0) / 2;
    // Cream ashlar on a deep base course of the same stone, a string course of its dressed stone on
    // both faces level with the towers' (CURTAIN_COURSES), and the crown that carries the wall walk.
    cb(k, g, [L, BASE_COURSE, T + 0.5], [0, BASE_COURSE / 2, 0], BASE, undefined, 0.06);
    cb(k, g, [L, H - BASE_COURSE, T], [0, BASE_COURSE + (H - BASE_COURSE) / 2, 0], ASHLAR, undefined, 0.04);
    cb(k, g, [L, COURSE, T + 0.12], [0, CURTAIN_COURSES[0] + COURSE / 2, 0], DRESS, undefined, 0.03);
    // (Where the walk runs into a tower, the last merlons stand well clear of its doorway; at a corner of
    // the curtain the inner ones stand clear of the turning run's inner parapet.)
    const clear = ends & 3 ? 1.35 : 0.8;
    curtainCrown(k, g, L, LL, uc, clear, [ends & 16 ? CORNER_CLEAR : clear, ends & 32 ? CORNER_CLEAR : clear]);
    // The lord's banner on the outer face, all one size: one centred on every run between towers,
    // two at even spacing on a long run, so every face carries the same navy-and-gold rhythm as the
    // south front; beside a small gate the banner stands a little clear of its lanterns, and a short
    // stub beside one carries none. (The towers carry the arrow loops; the curtain's faces stay plain
    // between its banners.)
    const gate0 = ends & 4 ? 1.2 : 0, gate1 = ends & 8 ? 1.2 : 0;
    const nb = L < 9 || (ends & 12 && L < 12) ? 0 : L > 31 ? 2 : 1;
    const at = Array.from({ length: nb }, (_, i) => -L / 2 + (L * (i + 0.5)) / nb + (gate0 - gate1) / nb);
    for (const b of at) {
      const out = new THREE.Group();
      out.position.set(b, 0, -T / 2 - 0.2);
      out.rotation.y = Math.PI;
      g.add(out);
      livery(k, out, 0, H - 0.6, 0, 1.7, 3.0);
    }
  },
  /**
   * A round wall tower, radius `len`: a deep battered base course, a drum rising a full storey over
   * the wall walk (+9) to its platform, and on top a parapet ring on a course stepped out from the drum,
   * with ten evenly spaced merlons. `v` sets how tall: the platform stands at v + 1.4.
   */
  round_tower: (k, g, arg) => drumTower(k, g, lenOf(arg) ?? 3.2, vOf(arg) || 9, false, arg?.opt),
  /**
   * A corner tower of the curtain: a round tower a stage taller than the wall towers, a band of stone
   * under its parapet and a blue-slate spire with a gilt finial and a pennant standing inside its
   * merlon ring, so the corners step the skyline up round the walls (the wall towers stay flat).
   */
  corner_tower: (k, g, arg) => drumTower(k, g, lenOf(arg) ?? 3.4, vOf(arg) || 12, true, arg?.opt),
  /**
   * A flag on a pole standing on a round tower's platform (the tower `v` tall, as round_tower), flying
   * toward `len` (±1 along local X). The south face's pair flank the gatehouse's three, so the gate
   * front reads as one symmetric composition of five.
   */
  tower_flag: (k, g, arg) => {
    // The pole rises well clear of the merlons (their tops at P + 1.75), so the whole flag flies a
    // full flag's height above the battlements, a gold ball on its top.
    const P = (vOf(arg) || 9) + 1.4, dir = (lenOf(arg) ?? 1) < 0 ? -1 : 1;
    cb(k, g, [0.16, 7.3, 0.16], [0, P + 3.65, 0], LAMP_NAVY, undefined, 0.02);
    k.mesh(g, new THREE.OctahedronGeometry(0.18, 1), PAL.gold, [0, P + 7.42, 0]);
    flag(k, g, 0, P + 7.15, 0, 3.0, 1.8, dir);
    shadowless(g);
  },
  /**
   * The outer gatehouse in the curtain: two drum towers (radius `opt.R`) standing on the curtain's line
   * either side of the passage (`len` wide, their centres `opt.cx` either side of it, so the
   * ceremonial arch and its hood stand clear between them), each rising a stage over the wall walk
   * with a doorway onto it to a flat platform behind battlements, and between them the gatehouse
   * block, through the curtain's thickness and a storey higher than it: the passage under a pointed
   * arch of dressed voussoirs, the portcullis raised in the arch, a machicolated, crenellated parapet,
   * the lord's banner over the arch and a flag flying from each drum. Built along local X, outer face
   * toward -Z.
   */
  outer_gatehouse: (k, g, arg) => {
    // The drums rise a stage over the wall towers either side to 17, each a flat platform behind its
    // battlements flying the lord's flag outward from a pole at its middle, so the keep's spires rise
    // over the gate front seen from below the rock.
    const o = (arg?.opt ?? {}) as { cx?: number; R?: number };
    const P = lenOf(arg) ?? 4, R = o.R ?? 2.6, H = 17, cx = o.cx ?? 6.0, T = CURTAIN_WALL.T, D = T + 0.8, GH = 13.5, N = crownBays(R);
    for (const sx of [-1, 1]) {
      // (Each drum in its own group at its centre, its rings of stone laid round its own axis.)
      const dg = new THREE.Group();
      dg.position.set(sx * cx, 0, 0);
      g.add(dg);
      drumFoot(k, dg, R, R + 0.55, R + 0.2);
      drumShaft(k, dg, R, BASE_COURSE, H, ASHLAR, [[(sx * Math.PI) / 2, -sx * DOORS.walk.off]], DOORS.walk.y);
      for (const y of CURTAIN_COURSES) drumCourse(k, dg, R, 0.06, y);
      drumBand(k, dg, 0, 0, R, crownFoot(H) - 1.5 * COURSE);
      crown(k, dg, 0, 0, R, H, N);
      // (The pole rises well clear of the merlons, as on the wall towers, a gold ball on its top.)
      cb(k, dg, [0.16, 7.3, 0.16], [0, H + 3.65, 0], LAMP_NAVY, undefined, 0.02);
      k.mesh(dg, new THREE.OctahedronGeometry(0.18, 1), PAL.gold, [0, H + 7.42, 0]);
      flag(k, dg, 0, H + 7.15, 0, 3.0, 1.8, sx);
      shadowless(dg);
      // The wall walk comes in from the curtain beyond it (local +X on the right drum) to a doorway.
      drumDoorway(k, dg, R, (sx * Math.PI) / 2, -sx * DOORS.walk.off, DOORS.walk.y);
      // Arrow loops on its outer face, two storeys, set square to the field outside.
      const f = new THREE.Group();
      f.rotation.y = (Math.round((Math.PI + sx * 0.5) / ((Math.PI * 2) / N) - 0.5) + 0.5) * ((Math.PI * 2) / N);
      dg.add(f);
      for (const y of LOOP_ROWS) arrowLoop(k, f, 0, y, R);
    }
    // The gatehouse block in one piece, its passage cut through it as a pointed (two-centred) arch:
    // as wide as the drums' centres up to the wall walk, then rising between the drums to its parapet.
    const spring = 4.7, ra = P * 0.8, off = ra - P / 2, apex = spring + Math.sqrt(ra * ra - off * off);
    const zc = 0.2, bw = cx - R + 0.45, WW = CURTAIN_WALL.H + 1, tA = Math.acos(off / ra);
    const half = (y: number) => Math.max(0, Math.sqrt(Math.max(0, ra * ra - (y - spring) ** 2)) - off);
    {
      const s = new THREE.Shape();
      s.moveTo(-cx, 0);
      s.lineTo(-P / 2, 0);
      for (let i = 0; i <= 12; i++) {
        const t = (tA * i) / 12;
        s.lineTo(-(-off + ra * Math.cos(t)), spring + ra * Math.sin(t));
      }
      for (let i = 11; i >= 0; i--) {
        const t = (tA * i) / 12;
        s.lineTo(-off + ra * Math.cos(t), spring + ra * Math.sin(t));
      }
      for (const [x, y] of [[P / 2, 0], [cx, 0], [cx, WW], [bw, WW], [bw, GH], [-bw, GH], [-bw, WW], [-cx, WW]]) s.lineTo(x, y);
      s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, zc - D / 2);
      geo.computeVertexNormals();
      geo.userData.boxes = [[-cx, 0, zc - D / 2, -P / 2, WW, zc + D / 2], [P / 2, 0, zc - D / 2, cx, WW, zc + D / 2], [-P / 2, apex, zc - D / 2, P / 2, WW, zc + D / 2], [-bw, WW, zc - D / 2, bw, GH, zc + D / 2]];
      k.mesh(g, geo, ASHLAR, [0, 0, 0]);
    }
    // (The deep base course runs a hair into the passage, so the jambs stand on it all across.)
    for (const sx of [-1, 1]) cb(k, g, [cx - P / 2 + 0.02, BASE_COURSE, D + 0.12], [sx * (P / 2 - 0.01 + (cx - P / 2 + 0.02) / 2), BASE_COURSE / 2, zc], BASE, undefined, 0.03);
    // The ceremonial arch, the great door's twin, all in the castle's dressed stone: on both faces a
    // deep ring of voussoirs (0.6 deep, flush on one radius just proud of the face, every other one a
    // hair prouder), springing from moulded imposts on jambs set flush in the same plane, and a big
    // keystone. Outside, over the opening, a plain tympanum of the same stone on a slim lintel, the
    // raised portcullis set back behind it with only its spikes showing.
    const NV = 9, VD = 0.6, VP = 0.16;
    for (const e of [-1, 1]) {
      const fz = zc + e * (D / 2), pz0 = fz + e * (VP / 2 - 0.01);
      for (const sx of [-1, 1]) {
        const put = (rad: number, t: number, size: V3, z: number, color: number) => {
          const x = -off + rad * Math.cos(t), y = spring + rad * Math.sin(t);
          cb(k, g, size, [sx * x, y, z], color, [0, 0, sx > 0 ? t : Math.PI - t], 0.015);
        };
        for (let i = 0; i < NV; i++) {
          const t = (tA * (i + 0.5)) / NV, rr = ra + VD / 2;
          // (Every other stone a hair prouder, so at the joints the stones read one by one.)
          put(rr, t, [VD, (rr * tA) / NV + 0.02, i % 2 ? VP + 0.03 : VP], pz0, DRESS);
        }
        // The impost (a moulded block the ring springs from) on the jamb, the jamb from the base course up.
        cb(k, g, [VD + 0.4, 0.26, VP + 0.14], [sx * (P / 2 + VD / 2 + 0.15), spring - 0.13, fz + e * ((VP + 0.14) / 2 - 0.01)], DRESS, undefined, 0.02);
        cb(k, g, [VD, spring - 0.26 - BASE_COURSE, VP], [sx * (P / 2 + VD / 2), BASE_COURSE + (spring - 0.26 - BASE_COURSE) / 2, pz0], DRESS, undefined, 0.02);
      }
      // (One stone: no taller than a course and a half.)
      cb(k, g, [0.62, 0.8, VP + 0.1], [0, apex + 0.31, fz + e * ((VP + 0.1) / 2 - 0.01)], DRESS, undefined, 0.03);
    }
    {
      // The tympanum over the opening outside, set a little back in the arch, on its lintel (whose top
      // lies on a course line).
      const lt = Math.ceil((spring + 0.3) / COURSE) * COURSE;
      const s0 = new THREE.Shape(), y0 = lt - spring, n = 10;
      const x0 = Math.sqrt(ra * ra - y0 * y0) - off;
      s0.moveTo(x0, y0);
      for (let i = 1; i <= n; i++) {
        const t = (tA * i) / n;
        s0.lineTo(-off + ra * Math.cos(t), Math.sin(t) * ra);
      }
      for (let i = n - 1; i >= 1; i--) {
        const t = (tA * i) / n;
        s0.lineTo(off - ra * Math.cos(t), Math.sin(t) * ra);
      }
      s0.lineTo(-x0, y0);
      const tz = zc - D / 2 + 0.24;
      k.mesh(g, new THREE.ExtrudeGeometry(s0, { depth: 0.12, bevelEnabled: false }), DRESS, [0, spring, tz - 0.06]);
      cb(k, g, [P + 0.04, lt - spring + 0.01, 0.34], [0, (spring - 0.01 + lt) / 2, tz], DRESS, undefined, 0.02);
    }
    // The portcullis, raised behind the tympanum: its grid filling the arch head, only the spiked
    // foot showing under the lintel outside.
    const pz = zc - D / 2 + 0.6;
    for (let x = -P / 2 + 0.3; x < P / 2 - 0.2; x += 0.42) {
      const top = spring + Math.sqrt(Math.max(0, ra * ra - (Math.abs(x) + off) ** 2)) - 0.05;
      k.box(g, [0.1, top - spring - 0.12, 0.1], [x, (top + spring + 0.12) / 2, pz], IRON);
      k.mesh(g, taper(0.1, 0.1, 0.01, 0.01, 0.25), IRON, [x, spring, pz], [Math.PI, 0, 0]);
    }
    // (Its rails run into the grooves in the arch's sides, so the grid hangs in the stone.)
    for (const y of [0.33, 1.3, 2.2, 3.1].map((dy) => spring + dy)) {
      const hw = half(y) + 0.12;
      if (hw > 0.3) k.box(g, [hw * 2, 0.09, 0.12], [0, y, pz], IRON);
    }
    // Along the outer face a band of dressed stone and over it the course that carries the parapet,
    // standing out from the face; then the parapet all round the block's top, two courses high, and
    // its coping.
    cb(k, g, [2 * bw + 0.1, COURSE, 0.16], [0, GH - 1.5 * COURSE, zc - D / 2 - 0.02], DRESS, undefined, 0.02);
    cb(k, g, [2 * bw + 0.1, COURSE, 0.4], [0, GH - COURSE / 2, zc - D / 2 - 0.1], DRESS, undefined, 0.02);
    cb(k, g, [2 * bw, 2 * COURSE, 0.6], [0, GH + COURSE, zc - D / 2], ASHLAR, undefined, 0.03);
    cb(k, g, [2 * bw, 2 * COURSE, 0.5], [0, GH + COURSE, zc + D / 2 - 0.25], ASHLAR, undefined, 0.03);
    // (Its sides run between the front and back stretches, not through them.)
    for (const sx of [-1, 1]) cb(k, g, [0.5, 2 * COURSE, D - 0.8], [sx * (bw - 0.25), GH + COURSE, zc - 0.1], ASHLAR, undefined, 0.03);
    cb(k, g, [2 * bw + 0.1, 0.14, 0.74], [0, GH + 2 * COURSE + 0.07, zc - D / 2], DRESS, undefined, 0.02);
    cb(k, g, [2 * bw + 0.1, 0.14, 0.64], [0, GH + 2 * COURSE + 0.07, zc + D / 2 - 0.25], DRESS, undefined, 0.02);
    // The roof deck stands nearly flush with the parapet, so the block reads as one solid mass.
    cb(k, g, [2 * bw - 0.5, 0.7, D - 0.7], [0, GH + 0.35, zc], DECK, undefined, 0.02);
    for (let i = 0; i < 4; i++) {
      const u = -bw + 0.5 + (i * (2 * bw - 1.0)) / 3;
      cb(k, g, [0.8, 0.75, 0.62], [u, GH + 2 * COURSE + 0.515, zc - D / 2], ASHLAR, undefined, 0.04);
      cb(k, g, [0.8, 0.75, 0.52], [u, GH + 2 * COURSE + 0.515, zc + D / 2 - 0.25], ASHLAR, undefined, 0.04);
    }
    // The lord's banner over the arch on the outer face (facing out, -Z): the middle of the gate
    // front's five flags.
    {
      const out = new THREE.Group();
      // (Hung from a rod against the frieze, under the course that carries the parapet, its tail well
      // clear of the arch.)
      out.position.set(0, 0, zc - D / 2 - 0.19);
      out.rotation.y = Math.PI;
      g.add(out);
      livery(k, out, 0, GH - COURSE - 0.08, 0, 1.6, 1.6);
    }
    // The passage floor: the castle's paving laid on through the gate, a dressed threshold stone across
    // each end.
    paved(k.box(g, [P - 0.1, 0.04, D - 0.72], [0, 0.02, zc], PAVE));
    for (const e of [-1, 1]) cb(k, g, [P - 0.05, 0.08, 0.36], [0, 0.04, zc + e * (D / 2 - 0.18)], DRESS, undefined, 0.03);
  },
  /**
   * Ivy or a climbing rose against a wall (its back on z = 0, growing up its +Z face): leafy masses
   * hugging the face, dense at the foot and thinning upward to a ragged top, `len` wide. `v` 0 ivy
   * (up to 4.5 high), 1 roses on a faint trellis (up to 3 high) with pink and white blooms. `bend`
   * the growth round a drum of that radius (the wall curving away behind it).
   */
  wall_climber: (k, g, arg) => {
    const L = Math.max(1.5, lenOf(arg) ?? 4), rose = vOf(arg) === 1, R: number | undefined = typeof arg === 'object' ? arg?.bend : undefined;
    const top = rose ? 5.0 : 4.8, LEAF = rose ? CLIMBER_ROSE_LEAF : CLIMBER_IVY, seed = Math.round(L * 10) + (rose ? 7 : 0);
    // On a straight wall the climber's foot stands clear of the deep base course; above it the sheet
    // steps back to lie on the wall face itself.
    const hug = (y: number) => (R || y < BASE_COURSE ? 0 : -0.2);
    /** How far the face falls back at u along it (round a drum). */
    const sag = (u: number) => (R ? R - Math.sqrt(Math.max(0, R * R - u * u)) : 0);
    const turn = (u: number) => Math.asin(Math.max(-1, Math.min(1, u / (R ?? 1e9))));
    // Woody stems first: a few leaders climbing from the foot, branching out, under the leaves.
    const leaders = Math.max(2, Math.round(L / 1.2));
    for (let i = 0; i < leaders; i++) {
      // (Kept inside the leaf sheet: in its middle and short of its ragged top, so no bare stem shows.)
      const u0 = (-L / 2 + (L * (i + 0.5)) / leaders) * 0.6, h = top * (0.35 + 0.2 * hash01(seed, i, 9));
      const u1 = u0 * 0.8 + (hash01(seed, i, 8) - 0.5) * 0.3;
      limb(k, g, [u0, 0.05, 0.02 - sag(u0)], [u1, h, 0.02 + hug(h) - sag(u1)], [0.07, 0.05, 0.03, 0.02], WOOD_D);
    }
    // The roses' trellis: a few slender posts and two rails fixed to the wall, all inside the sheet.
    if (rose) {
      for (let i = 0; i <= 2; i++) {
        const u = (-L / 2 + 0.3 + (i * (L - 0.6)) / 2) * 0.5;
        cb(k, g, [0.05, top * 0.5, 0.05], [u, top * 0.25, -0.1 - sag(u)], WOOD_D, undefined, 0.01);
      }
      for (const y of [top * 0.2, top * 0.42]) cb(k, g, [L * 0.5, 0.05, 0.05], [0, y, 0.0 + hug(y)], WOOD_D, undefined, 0.01);
    }
    // A sheet of small flat leaf cards laid almost flat on the face, overlapping like ivy gripping
    // masonry: dense and wide at the foot, the sheet narrowing and thinning as it climbs into a
    // ragged top of tendrils (each column of leaves reaching its own height). No bush stands off it.
    const STEP = 0.11, cols = Math.max(12, Math.round(L / STEP));
    for (let c = 0; c < cols; c++) {
      const u0 = -L / 2 + (L * (c + 0.5)) / cols, edge = Math.abs(u0) / (L / 2);
      // (Neighbouring columns reach similar heights, so the top breaks into a few tapering tendrils
      // of unbroken leaves rather than a scatter of loose ones.)
      const wave = 0.5 + 0.5 * Math.sin(c * 0.55 + seed) * Math.cos(c * 0.23 + seed * 0.7);
      const h = top * (0.42 + 0.5 * wave + 0.08 * hash01(seed, c)) * (1 - 0.4 * edge * edge);
      for (let y = 0.15 + (c % 2) * STEP * 0.5, j = 0; y < h; y += STEP, j++) {
        const f = y / h;
        // The sheet tapers: toward its top only the middle carries on.
        if (edge > 1 - 0.45 * f * f) continue;
        if (hash01(seed, c, j) > 0.985 - 0.12 * f * f) continue;
        const u = u0 + (hash01(seed + 2, c, j) - 0.5) * 0.07, yy = y + (hash01(seed + 6, c, j) - 0.5) * 0.05;
        const sz = 0.075 + hash01(seed + 1, c, j) * 0.035;
        const m = k.mesh(g, CLIMBER_LEAF, LEAF[Math.floor(hash01(seed + 3, c, j) * LEAF.length)], [u, yy, 0.03 + hash01(seed + 7, c, j) * 0.03 + hug(yy) - sag(u)], [(hash01(seed + 8, c, j) - 0.5) * 0.18, turn(u) + (hash01(seed + 9, c, j) - 0.5) * 0.18, hash01(seed + 5, c, j) * 3]);
        m.scale.set(sz, sz * 1.2, 1);
        if (rose && hash01(seed + 4, c, j) > 0.86) k.gem(g, 0.07, [u, yy + 0.03, 0.1 + hug(yy) - sag(u)], CLIMBER_BLOOM[(c + j) % 3]);
      }
    }
  },
  /**
   * The great door's two leaves, boarded, studded and iron-strapped, standing open inward from the jambs
   * of an opening `len` wide (hinged at its edges, the prop on the wall's inner face).
   */
  great_doors: (k, g, arg) => {
    // The hall's great door: two leaves standing open into the hall, boarded in the stained oak and
    // strapped in iron like every castle door, a ring at the hero's hand on each face.
    const W = lenOf(arg) ?? 4, hw = DOORS.great.w, H = DOORS.great.h, a = 1.15;
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.position.set(sx * (W / 2 - 0.1), 0, 0);
      leaf.rotation.y = sx < 0 ? a : Math.PI - a;
      g.add(leaf);
      royalLeaf(k, leaf, hw, H, 'great', 0.14);
    }
  },
};
