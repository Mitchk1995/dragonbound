import * as THREE from 'three';
import { abs, diffuseColor, dot, float, normalize, normalView, positionView, pow, saturate } from 'three/tsl';
import { hash01, taper } from '../../render/blocks';
import { studioEnv } from '../../render/env';
import { ModelKit, PAL, type V3 } from '../../render/kit';
import { bondPhases, COURSE, type DrumOpts, laidDrum, STONE as STONE_LEN } from '../../render/masonry';
import { addPatch } from '../../render/surface';
import { cb } from './core';
import { archPane, archRing, archShape } from './legacyCastleArches';
import { DRESS, GILT, HERALD_BLUE, IRON, SLATE_BLUE, WOOD_D } from './palette';

// The castle's and the buildings' trim (base courses, spires, friezes, quoins, lancets, window glass and the lord's cloth).
// Legacy: replaced by the modular kit (src/world/kit) and deleted with the old building code.

/** The castle's base course: two courses of its walling's own stone, standing a hand proud round every foot. */
export const BASE_COURSE = 1.0;
/** Mark a part as cut from one stone (a lintel): painted whole, its mortar only round its edges. */
export function oneStone<T extends THREE.Object3D>(m: T): T {
  m.userData.oneStone = true;
  return m;
}

/**
 * Where a crown begins over a platform at height P: the course line at P (or the one just over it),
 * so the course that carries the parapet ends on a course line and the parapet stands on it.
 */
export const crownFoot = (P: number) => COURSE * Math.ceil((P - 0.2) / COURSE - 1e-6);

/**
 * A tapered beam from `a` to `b`: `size` is [width, depth] at `a` then at `b`. Limbs, horns, wing
 * bones and tails on statues.
 */
export function limb(k: ModelKit, g: THREE.Object3D, a: V3, b: V3, size: [number, number, number, number], color: number) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = d.length();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return k.mesh(g, taper(size[0], size[1], size[2], size[3], L), color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [e.x, e.y, e.z]);
}

/**
 * A rounded tapered segment from `a` to `b` (an eight-sided frustum, radius `r0` at `a`, `r1` at
 * `b`), squashed front to back by `flat`: bodies, necks and tails on statues.
 */
export function round(k: ModelKit, g: THREE.Object3D, a: V3, b: V3, r0: number, r1: number, color: number, flat = 1) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = d.length();
  // Turned an eighth so a flat face (not an edge) looks forward.
  const geo = new THREE.CylinderGeometry(r1, r0, L, 8, 1).rotateY(Math.PI / 8).scale(1, 1, flat);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return k.mesh(g, geo, color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [e.x, e.y, e.z]);
}

/** A faceted ball of radius `r` scaled by `size` (joints, haunches, a skull's dome). */
export function ball(k: ModelKit, g: THREE.Object3D, r: number, pos: V3, color: number, size: V3 = [1, 1, 1], rot?: V3) {
  const m = k.mesh(g, new THREE.IcosahedronGeometry(r, 1), color, pos, rot);
  m.scale.set(...size);
  return m;
}

/**
 * A drum of stone laid in rings of flat stones round the axis at (x, z) of its group (masonry.ts,
 * laidDrum), in the colour given: a tower's shaft, a course standing proud round it, a parapet ring.
 */
export function drum(k: ModelKit, g: THREE.Object3D, o: Omit<DrumOpts, 'seed'>, color: number, x = 0, z = 0) {
  return k.mesh(g, laidDrum({ ...o, seed: Math.floor(hash01(o.r, o.y0, o.n, color) * 97) }), color, [x, 0, z]);
}

/**
 * A blue-slate spire whose foot (radius r) stands at y over (x, z), `h` tall, on a stone eave:
 * two thin gilt bands round it (at the foot and two thirds up), a gilt ball-and-spike finial on the
 * point and, when `pennant` is ±1, a small house pennant on the spike flying that way along X.
 */
export function spire(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number, r: number, h: number, N: number, pennant = 0, size = 1) {
  k.cyl(g, r + 0.12, r + 0.12, 0.16, [x, y + 0.08, z], DRESS, undefined, N);
  const y0 = y + 0.16;
  k.cone(g, r, h, [x, y0 + h / 2, z], SLATE_BLUE, undefined, N);
  for (const f of [0.04, 0.64]) {
    const t = 0.035;
    k.cyl(g, r * (1 - f - t) + 0.05, r * (1 - f) + 0.05, h * t, [x, y0 + h * (f + t / 2), z], GILT, undefined, N);
  }
  const tip = y0 + h, b = Math.max(0.22, r * 0.11);
  k.cyl(g, b * 0.5, b * 0.5, b * 0.7, [x, tip - b * 0.1, z], PAL.gold, undefined, 8);
  k.mesh(g, new THREE.OctahedronGeometry(b, 1), PAL.gold, [x, tip + b * 0.9, z]);
  k.cone(g, b * 0.3, b * 3, [x, tip + b * 3.2, z], PAL.gold, undefined, 6);
  if (pennant) {
    cb(k, g, [0.08, 1.6 * size, 0.08], [x, tip + b * 2 + 0.8 * size, z], IRON, undefined, 0.01);
    flag(k, g, x, tip + b * 2 + 1.55 * size, z, 1.1 * size, 0.6 * size, pennant);
  }
}

/** A gilt frieze one course high on a face (along local X, facing +Z), centred at y: a course of dressed stone, a row of gold diamonds on it. */
export function frieze(k: ModelKit, g: THREE.Object3D, len: number, x: number, y: number, z: number) {
  cb(k, g, [len, COURSE, 0.16], [x, y, z], DRESS, undefined, 0.02);
  for (let u = -len / 2 + 0.4; u <= len / 2 - 0.38; u += 0.8) k.box(g, [0.2, 0.2, 0.05], [x + u, y, z + 0.09], GILT, [0, 0, Math.PI / 4]);
}

/**
 * The castle's window glass: clear panes with a cool tint, plainly see-through to the dim room (or
 * recess) behind (the tint a dark cool grey, so it cools and deepens what shows through it rather than
 * lying over it as a lit film); polished, so the sky's light sheens across a pane only at a glancing
 * look (a reflection that grows with the angle, as real glass does), never a painted streak. One
 * material per kit, so a building's cut takes it with its walls; it casts no shadow.
 */
export function windowGlass() {
  const m = new THREE.MeshStandardMaterial({
    color: 0x24363e, transparent: true, opacity: 0.2, depthWrite: false, roughness: 0.04, metalness: 0.0,
    envMap: studioEnv(), envMapIntensity: 1.6, flatShading: true,
  });
  // (Clear face on, the sky over it at a slant: the pane grows more reflective and less see-through
  // the more glancing the look.)
  addPatch(m, { key: 'glass-fresnel', nodes: () => ({
    output(light) {
      const fres = pow(float(1).sub(saturate(abs(dot(normalize(positionView), normalView)))), 5);
      diffuseColor.a.assign(saturate(diffuseColor.a.add(fres.mul(0.6))));
      return light;
    },
  }) });
  m.userData.decal = true;
  m.userData.cloth = true;
  m.userData.baseEmissive = new THREE.Color(0);
  m.userData.baseIntensity = 1;
  return m;
}
const glassMats = new WeakMap<ModelKit, THREE.MeshStandardMaterial>();
export function glassMat(k: ModelKit) {
  let m = glassMats.get(k);
  if (!m) {
    glassMats.set(k, (m = windowGlass()));
    k.mats.push(m);
  }
  return m;
}
/**
 * The room seen through a window, painted on a plate a little behind the glass: dim and warm, the light
 * of a hearth or a candle pooled low in its middle and falling away into shadow toward the frame, the
 * far wall a touch lighter where it catches the glow. No walls or floor are drawn in it (a chamber
 * drawn in depth reads as a corridor through the glass). Unlit rooms show the same dim depth, cooler.
 */
let roomTex: THREE.DataTexture | null = null;
function roomGlow() {
  if (roomTex) return roomTex;
  const W = 32, H = 64, data = new Uint8Array(W * H * 4), c = new THREE.Color(), s = { r: 0, g: 0, b: 0 };
  const dark = new THREE.Color(0x1c140f), wall = new THREE.Color(0x4e3a29), warm = new THREE.Color(0xc4874c);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W, v = (y + 0.5) / H;
    // (The glow broad and low, the wall a little lit all across, shading off toward the frame and up.)
    const glow = Math.exp(-(((u - 0.5) / 0.45) ** 2 + ((v - 0.3) / 0.4) ** 2)), frame = Math.min(1, Math.min(u, 1 - u) * 5);
    c.copy(dark).lerp(wall, (0.35 + 0.5 * frame) * (1 - 0.45 * v)).lerp(warm, 0.5 * glow);
    // (Written in sRGB, the space the texture is read in.)
    c.getRGB(s, THREE.SRGBColorSpace);
    const i = (y * W + x) * 4;
    data[i] = Math.round(s.r * 255);
    data[i + 1] = Math.round(s.g * 255);
    data[i + 2] = Math.round(s.b * 255);
    data[i + 3] = 255;
  }
  roomTex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  roomTex.magFilter = THREE.LinearFilter;
  roomTex.minFilter = THREE.LinearFilter;
  roomTex.colorSpace = THREE.SRGBColorSpace;
  roomTex.needsUpdate = true;
  return roomTex;
}
/** The room behind a window (see roomGlow): one material per kit and lighting, so cuts take it. */
export function roomMaterial(lit = true) {
  // (Its own light only: black under the sun, the painted room as emission.)
  const glow = new THREE.Color(lit ? 0xffffff : 0xaab0bc);
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1, metalness: 0, emissive: glow, emissiveMap: roomGlow() });
  m.userData.baseEmissive = glow.clone();
  m.userData.baseIntensity = 1;
  // (Left as painted: no stone or metal finish.)
  m.userData.cloth = true;
  return m;
}
const roomMats = new WeakMap<ModelKit, Map<boolean, THREE.MeshStandardMaterial>>();
export function roomMat(k: ModelKit, lit: boolean) {
  let by = roomMats.get(k);
  if (!by) roomMats.set(k, (by = new Map()));
  let m = by.get(lit);
  if (!m) {
    by.set(lit, (m = roomMaterial(lit)));
    k.mats.push(m);
  }
  return m;
}
/** The plate a room is painted on, filling a pointed opening `w` by `h` (facing +Z, sill at y = 0). */
const roomPlates = new Map<string, THREE.BufferGeometry>();
export function roomPlate(w: number, h: number) {
  const key = `${w},${h}`;
  let g = roomPlates.get(key);
  if (!g) {
    g = new THREE.ShapeGeometry(archShape(w, h));
    const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / h);
    roomPlates.set(key, g);
  }
  return g;
}

/**
 * The lord's cloth (banners and flags): one painted texture per shape, its colours, gold edging and
 * the gold dragon diamond all in the one cloth, and its swallowtail cut out of it by alpha, so each
 * banner or flag is a single cohesive piece. `paint(x, y)` takes cloth coordinates in world units
 * (x across, y down from the top edge) and returns a colour, or null where the cloth is cut away.
 */
const clothTextures = new Map<string, THREE.DataTexture>();
function clothTexture(key: string, w: number, h: number, paint: (x: number, y: number) => number | null) {
  let tex = clothTextures.get(key);
  if (tex) return tex;
  const PX = 56, W = Math.max(8, Math.round(w * PX)), H = Math.max(8, Math.round(h * PX)), data = new Uint8Array(W * H * 4);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    // (Row 0 is the cloth's bottom edge: v runs up the texture.)
    const col = paint(((c + 0.5) / W) * w, (1 - (r + 0.5) / H) * h), i = (r * W + c) * 4;
    if (col === null) continue;
    data[i] = (col >> 16) & 255;
    data[i + 1] = (col >> 8) & 255;
    data[i + 2] = col & 255;
    data[i + 3] = 255;
  }
  tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  clothTextures.set(key, tex);
  return tex;
}

/** The cloth's material in a kit (one per kit and texture, so a building's cut takes it with its walls). */
const clothMats = new WeakMap<ModelKit, Map<THREE.Texture, THREE.MeshStandardMaterial>>();
function clothMat(k: ModelKit, tex: THREE.DataTexture) {
  let byTex = clothMats.get(k);
  if (!byTex) clothMats.set(k, (byTex = new Map()));
  let m = byTex.get(tex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.82, metalness: 0.02 });
    m.userData.cloth = true;
    m.userData.baseEmissive = new THREE.Color(0);
    m.userData.baseIntensity = 1;
    byTex.set(tex, m);
    k.mats.push(m);
  }
  return m;
}

/** A gold diamond on the cloth, centred at (cx, cy), `d` from its centre to each point. */
const diamond = (x: number, y: number, cx: number, cy: number, d: number) => Math.abs(x - cx) + Math.abs(y - cy) <= d;

/**
 * The lord's banner hanging flat on a face (facing +Z) from a rod at height `top`: one long cloth
 * `w` wide, its straight sides running the whole length (`h` to the root of the tail, then the tail)
 * to two points at the corners, a deep swallowtail notch cut up its middle and edged in gold, a thin
 * gold strip down each side and the gold dragon diamond in the field.
 */
export function livery(k: ModelKit, p: THREE.Object3D, x: number, top: number, z: number, w: number, h: number) {
  cb(k, p, [w + 0.4, 0.14, 0.14], [x, top, z - 0.02], WOOD_D, undefined, 0.02);
  const th = w * 0.6, L = h + th, edge = 0.075;
  const tex = clothTexture(`banner:${w.toFixed(2)}:${h.toFixed(2)}`, w, L, (u, y) => {
    const xc = u - w / 2;
    // The notch: from the root of the tail on the centre line out to both corners at the hem.
    const notch = y > h ? (w / 2) * ((y - h) / th) - Math.abs(xc) : -1;
    if (notch > 0) return null;
    // (Gold along the notch's two edges: the perpendicular distance in from each.)
    if (y > h - edge * 2 && (-notch * th) / Math.hypot(th, w / 2) < edge) return PAL.gold;
    if (Math.abs(Math.abs(xc) - (w / 2 - 0.12)) < 0.045) return PAL.gold;
    if (diamond(xc, y, 0, Math.min(h * 0.4, w * 0.9), w * 0.26)) return PAL.gold;
    // (One blue from the rod to the points of the tail.)
    return HERALD_BLUE;
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, L), clothMat(k, tex));
  m.name = 'cloth';
  m.position.set(x, top - 0.07 - L / 2, z + 0.03);
  p.add(m);
}

/**
 * A flag on a pole at x, its top edge at `top`, flying out toward `dir` (±1 along X): one cloth `w`
 * long and `h` high, a broad gold stripe at the hoist, the gold dragon diamond in the field and a
 * forked fly edged in gold (all one blue), rippling in soft waves that grow toward the fly and
 * drooping a little from the hoist, so it reads as cloth from the high camera too.
 */
export function flag(k: ModelKit, p: THREE.Object3D, x: number, top: number, z: number, w: number, h: number, dir = 1) {
  const fork = Math.min(h * 0.5, w * 0.32), hoist = Math.max(0.16, w * 0.1), edge = 0.06;
  const tex = clothTexture(`flag:${w.toFixed(2)}:${h.toFixed(2)}`, w, h, (u, y) => {
    const t = Math.abs((2 * y) / h - 1), cut = w - fork * (1 - t);
    if (u > cut) return null;
    if (u > w - fork && cut - u < edge * Math.hypot(1, fork / (h / 2))) return PAL.gold;
    if (u < hoist) return PAL.gold;
    if (diamond(u, y, w * 0.48, h / 2, h * 0.3)) return PAL.gold;
    return HERALD_BLUE;
  });
  const NX = 12, NY = 3, geo = new THREE.PlaneGeometry(w, h, NX, NY);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    // From the hoist (t = 0) to the fly (t = 1): waves growing along the length, the fly sagging.
    const t = (pos.getX(i) + w / 2) / w, yy = pos.getY(i);
    pos.setXYZ(i, dir * (0.03 + t * w), yy - h / 2 - 0.5 * (h / 1.4) * t * t * 0.55 - t * w * 0.12, Math.sin(t * 7.0 + 0.4) * 0.13 * w * t);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, clothMat(k, tex));
  m.name = 'cloth';
  m.position.set(x, top, z);
  p.add(m);
}

/**
 * A tall pointed lancet on a face at z (facing +Z), its sill at y: the opening framed by a dressed ring
 * of the castle's stone (jambs to the springing on the walling's courses, voussoirs round the head),
 * clear glass over the dim room behind it, and a projecting sill.
 */
export function lancet(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, lit = true, dress = 1) {
  // The room behind the glass, then the pane in front of it, both inside the surround's reveal.
  const room = new THREE.Mesh(roomPlate(w, h), roomMat(k, lit));
  room.name = 'room';
  room.position.set(x, y, z + 0.012);
  g.add(room);
  const pane = new THREE.Mesh(archPane(w, h, 0.02), glassMat(k));
  pane.name = 'glass';
  pane.position.set(x, y, z + 0.07);
  g.add(pane);
  // (`dress` narrows the surround, so on a slender drum it hugs the curve.)
  archRing(k, g, x, y, z, w, h, { n: 3, t: 0.3 * dress, p: 0.1, dep: 0.14, jamb: true });
  cb(k, g, [w + 0.5, 0.14, 0.32], [x, y - 0.07, z + 0.06], DRESS, undefined, 0.02);
}

/**
 * Quoins standing proud at a block of walling's outside corners (the owner, October 3: where a wall's
 * outline shows its stones, they are real stones). The block's whole face is `b` in its prop's space
 * (as masonLayout lays it); at each corner in `corners` ([±1, ±1]: toward ±X and ±Z), every course
 * between y0 and y1 (less the bands in `skip`) gets the stone that turns it in the walling's own bond,
 * long on one face and short on the other by turns, as a real chamfered block standing a few
 * centimetres proud of both faces, so the corner's outline shows each stone.
 */
export function quoins(k: ModelKit, g: THREE.Object3D, b: { x0: number; x1: number; z0: number; z1: number }, corners: [number, number][], y0: number, y1: number, color: number, skip: [number, number][] = []) {
  const half = (w: number) => Math.max(1, Math.round((2 * w) / STONE_LEN)) / 2, PROUD = 0.03;
  const nx = half(b.x1 - b.x0), nz = half(b.z1 - b.z0), lx = (b.x1 - b.x0) / nx, lz = (b.z1 - b.z0) / nz, ph = bondPhases(nx, nz);
  // How long the stone is from a face's end back to its last joint, or from its start to its first.
  const ends = (s: number) => s - Math.floor(s - 1e-6), starts = (s: number) => Math.ceil(s + 1e-6) - s;
  for (let row = Math.round(y0 / COURSE); (row + 1) * COURSE <= y1 + 1e-6; row++) {
    const ya = row * COURSE, par = row % 2 ? 0.5 : 0;
    if (skip.some(([a, e]) => ya < e - 1e-6 && ya + COURSE > a + 1e-6)) continue;
    for (const [sx, sz] of corners) {
      // (The faces toward ±Z run their stones along X, those toward ±X along Z: see masonGeometry.)
      const sX = sz > 0 ? (sx > 0 ? ends(ph.pz + nx + par) : starts(ph.pz + par)) : sx > 0 ? starts(ph.mz + par) : ends(ph.mz + nx + par);
      const sZ = sx > 0 ? (sz > 0 ? starts(ph.px + par) : ends(ph.px + nz + par)) : sz > 0 ? ends(ph.mx + nz + par) : starts(ph.mx + par);
      const ax = sX * lx + PROUD, az = sZ * lz + PROUD, cx = sx > 0 ? b.x1 : b.x0, cz = sz > 0 ? b.z1 : b.z0;
      cb(k, g, [ax, COURSE, az], [cx + sx * (PROUD - ax / 2), ya + COURSE / 2, cz + sz * (PROUD - az / 2)], color, undefined, 0.03);
    }
  }
}

/**
 * The floor line of the castle's tall single-storey buildings: the foot of the course that runs round
 * them at one height, so the courses of every castle building run level.
 */
export const BUILDING_FLOOR_LINE = 5.0;
