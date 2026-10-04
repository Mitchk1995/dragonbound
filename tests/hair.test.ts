/**
 * The hair and beards (tools/blender/hair.py), checked on the committed models. Each is one moulded piece, LEGO hair's
 * way (a subdivided cage, its locks parted by grooves pressed into it), and the tied style's tail a second one on a
 * joint of its own at the tie (src/render/ponytail.ts swings it). Each comes out of the head with its edge set on the
 * skin (on a wall a little above it, or tucked just under it) and none of it sinks into the head (its block, ears and
 * brows); the symmetric styles are mirror images; beards hang in front of every collar; hair at the height of the Ashen
 * Crown's band runs in under it; and each stays within a character's triangle budget. (How each sits under headgear,
 * in armour and in every pose is measured by tools/blender/haircheck.py.)
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';

const HAIR = ['hair_1', 'hair_2', 'hair_3', 'hair_4'];
const BEARDS = ['beard_1', 'beard_2', 'beard_3'];
/** Every style but the short crop, whose fringe is brushed to one side, is authored mirrored left and right. */
const MIRRORED = ['hair_2', 'hair_3', 'hair_4', ...BEARDS];
/** docs/ART_CONTRACT.md, Characters: "Keep each model under about 3k triangles". */
const BUDGET = 3000;
/** Where the edge sits against the skin (hair_cage.py): the foot of a wall SKIN_LIFT above it, or tucked TUCK under. */
const SKIN_LIFT = 0.002, TUCK = 0.004;
const EDGE = { hair_1: SKIN_LIFT, hair_2: -TUCK, hair_3: -TUCK, hair_4: SKIN_LIFT, beard_1: -TUCK, beard_2: -TUCK, beard_3: -TUCK };
const PONYTAIL = 'ponytail';

/** One moulded part of a piece, in sock_head space (the head's centre): welded vertices and triangles. */
interface Part { joint: string; pos: THREE.Vector3[]; tris: number[][]; hairMeshes: number; meshes: THREE.Mesh[] }
const pieces = new Map<string, { parts: Part[]; centre: THREE.Vector3; pivot?: THREE.Vector3 }>();

beforeAll(async () => {
  const loader = new GLTFLoader();
  for (const name of [...HAIR, ...BEARDS]) {
    const buf = readFileSync(`public/models/${name}.glb`);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const scene = (await new Promise<{ scene: THREE.Group }>((res, rej) => loader.parse(ab, '', res as never, rej))).scene;
    scene.updateMatrixWorld(true);
    // The exported scene's world frame is the authored one (three.js axes), so sock_head space is the world less the
    // socket's position. (Blender numbers the socket per scene, sock_head.001 and on: the loader writes sock_head001.)
    let sock: THREE.Object3D | undefined, tail: THREE.Object3D | undefined;
    scene.traverse((o) => {
      if (/^sock_head\d*$/.test(o.name)) sock = o;
      if (o.name === PONYTAIL) tail = o;
    });
    const centre = sock!.getWorldPosition(new THREE.Vector3());
    const parts = new Map<string, Part>();
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      let joint = 'sock_head';
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === tail) joint = PONYTAIL;
      if (!parts.has(joint)) parts.set(joint, { joint, pos: [], tris: [], hairMeshes: 0, meshes: [] });
      const part = parts.get(joint)!, weld = new Map<string, number>();
      part.pos.forEach((v, i) => weld.set(key(v), i));
      part.meshes.push(o);
      if ((o.material as THREE.Material).name === 'ROLE_hair') part.hairMeshes++;
      const g = o.geometry as THREE.BufferGeometry, p = g.attributes.position;
      // Vertices split along UV seams or between colours are one vertex of the moulding: weld them back by position.
      const id = Array.from({ length: p.count }, (_, i) => {
        const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).sub(centre);
        if (!weld.has(key(v))) {
          weld.set(key(v), part.pos.length);
          part.pos.push(v);
        }
        return weld.get(key(v))!;
      });
      const idx = g.index ? Array.from(g.index.array) : id.map((_, i) => i);
      for (let t = 0; t < idx.length; t += 3) part.tris.push([id[idx[t]], id[idx[t + 1]], id[idx[t + 2]]]);
    });
    pieces.set(name, { parts: [...parts.values()], centre, pivot: tail?.getWorldPosition(new THREE.Vector3()).sub(centre) });
  }
});

const key = (v: THREE.Vector3) => v.toArray().map((x) => Math.round(x * 1e4)).join();
const at = (p: THREE.Vector3) => p.toArray().map((x) => x.toFixed(3)).join(', ');

/** Signed distance from a box (half sizes h, centre c) with its edges chamfered back b along each face, rolled by
 * `roll` about Z (hero.py's boxes): negative inside. */
function boxDistance(p: THREE.Vector3, c: number[], h: number[], b: number, roll = 0) {
  const q = p.clone().sub(new THREE.Vector3(...c)).applyAxisAngle(new THREE.Vector3(0, 0, 1), -roll);
  const a = [Math.abs(q.x), Math.abs(q.y), Math.abs(q.z)];
  let d = Math.max(a[0] - h[0], a[1] - h[1], a[2] - h[2]);
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) d = Math.max(d, (a[i] + a[j] - (h[i] + h[j] - b)) / Math.SQRT2);
  return d;
}

/** Signed distance from the hero's head as the moulding is fitted to it (hair_cage.py Head): the 0.46 cube with 0.06
 * chamfers, the ears and the brows. */
function headDistance(p: THREE.Vector3) {
  let d = boxDistance(p, [0, 0, 0], [0.23, 0.23, 0.23], 0.06);
  for (const s of [-1, 1]) {
    d = Math.min(d, boxDistance(p, [s * 0.245, -0.02, -0.01], [0.025, 0.065, 0.05], 0.015));
    d = Math.min(d, boxDistance(p, [s * 0.1, 0.105, 0.232], [0.055, 0.015, 0.015], 0.008, s * 0.08));
  }
  return d;
}

/** The open edge of a part: its vertices on an edge with one triangle, gathered into loops. */
function rims(tris: number[][]) {
  const count = new Map<string, number>();
  for (const t of tris) for (let e = 0; e < 3; e++) {
    const a = t[e], b = t[(e + 1) % 3], k = a < b ? `${a}_${b}` : `${b}_${a}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const next = new Map<number, number[]>();
  for (const [k, n] of count) if (n === 1) {
    const [a, b] = k.split('_').map(Number);
    next.set(a, [...(next.get(a) ?? []), b]);
    next.set(b, [...(next.get(b) ?? []), a]);
  }
  const loops: number[][] = [], seen = new Set<number>();
  for (const v of next.keys()) {
    if (seen.has(v)) continue;
    const loop: number[] = [], stack = [v];
    seen.add(v);
    while (stack.length) {
      const x = stack.pop()!;
      loop.push(x);
      for (const y of next.get(x)!) if (!seen.has(y)) seen.add(y), stack.push(y);
    }
    loops.push(loop);
  }
  return loops;
}

/**
 * How much a piece's surface ripples across its locks (metres, RMS): rays out from `from(k)` along `dir(k)` for each
 * sample k round a ring that crosses the locks, the furthest hit on the piece, less its own average over the 13 samples
 * (degrees) round it. A groove pressed in between two locks dips under that average; a smooth moulding barely does.
 */
function ripple(meshes: THREE.Mesh[], ring: { from: (k: number) => THREE.Vector3; dir: (k: number) => THREE.Vector3 }, n: number, wrap: boolean) {
  const ray = new THREE.Raycaster(), r: number[] = [];
  for (let k = 0; k < n; k++) {
    ray.set(ring.from(k), ring.dir(k));
    const hits = ray.intersectObjects(meshes, false);
    r.push(hits.length ? hits[hits.length - 1].distance : NaN);
  }
  let sum = 0, count = 0;
  for (let k = 0; k < n; k++) {
    const near = Array.from({ length: 13 }, (_, j) => k + j - 6);
    if (!wrap && near.some((i) => i < 0 || i >= n)) continue;
    const vals = near.map((i) => r[(i + n) % n]);
    if (vals.some(Number.isNaN)) continue;
    sum += (r[k] - vals.reduce((a, b) => a + b) / vals.length) ** 2;
    count++;
  }
  return { rms: Math.sqrt(sum / Math.max(1, count)), count };
}

describe('hair and beards: one moulded piece each', () => {
  for (const name of [...HAIR, ...BEARDS]) {
    it(`${name} is one hair mesh to a joint whose surface is all one piece, within a character's triangle budget`, () => {
      const { parts } = pieces.get(name)!;
      // The tied style's tail hangs on its own joint at the tie; everything else rides the head's socket.
      expect(parts.map((p) => p.joint).sort(), name).toEqual(name === 'hair_3' ? [PONYTAIL, 'sock_head'] : ['sock_head']);
      for (const { joint, pos, tris, hairMeshes } of parts) {
        // (A tie, a mouth or beads are faces of the same moulding in their own colour: the export splits them off.)
        expect(hairMeshes, `${name} ${joint}`).toBe(1);
        // Every triangle is reached from the first across shared corners.
        const parent = pos.map((_, i) => i);
        const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
        for (const [a, b, c] of tris) parent[find(b)] = parent[find(c)] = find(a);
        expect(new Set(tris.map((t) => find(t[0]))).size, `${name} ${joint}`).toBe(1);
      }
      expect(parts.reduce((n, p) => n + p.tris.length, 0), name).toBeLessThan(BUDGET);
    });

    it(`${name} comes out of the head: its edge set on the skin, nothing of it inside the head`, () => {
      const head = pieces.get(name)!.parts.find((p) => p.joint === 'sock_head')!;
      // Its one open edge runs along the hairline (the tied style's band is closed at its end: below).
      const [edge, ...rest] = rims(head.tris);
      expect(edge.length, name).toBeGreaterThan(20);
      expect(rest.length, name).toBe(0);
      for (const v of edge) expect(headDistance(head.pos[v]), `${name} edge at ${at(head.pos[v])}`).toBeCloseTo(EDGE[name as keyof typeof EDGE], 3);
      for (const { joint, pos } of pieces.get(name)!.parts) {
        for (const p of pos) expect(headDistance(p), `${name} ${joint} at ${at(p)}`).toBeGreaterThan(-TUCK - 0.0005);
      }
    });

    if (MIRRORED.includes(name)) {
      it(`${name} is a mirror image left and right`, () => {
        for (const { joint, pos } of pieces.get(name)!.parts) {
          let worst = 0;
          for (const p of pos) {
            let best = Infinity;
            for (const q of pos) best = Math.min(best, (q.x + p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2);
            worst = Math.max(worst, Math.sqrt(best));
          }
          expect(worst, `${name} ${joint}`).toBeLessThan(0.0005);
        }
      });
    }
  }

  it('the tied style\'s tail turns at the tie on a pivot of its own, a ball in a socket inside the band', () => {
    const { parts, pivot } = pieces.get('hair_3')!;
    // hair.py BAND_RINGS: the leather band round the tie, from its top into its foot, where the pivot is.
    const top = new THREE.Vector3(0, 0, -0.34), foot = new THREE.Vector3(0, -0.008, -0.382), BALL = 0.068;
    expect(pivot!.distanceTo(foot)).toBeLessThan(1e-4);
    const cap = parts.find((p) => p.joint === 'sock_head')!, tail = parts.find((p) => p.joint === PONYTAIL)!;
    // The tail is closed all round and hangs well clear of the head.
    expect(rims(tail.tris)).toEqual([]);
    for (const p of tail.pos) expect(headDistance(p), at(p)).toBeGreaterThan(0.05);
    // Inside the band the tail is a ball round its pivot (hair.py TAIL_BALL), and the band turns in at its rim and back
    // into a dome round the ball: however the tail turns, the ball turns inside it without touching it, and nothing
    // shows through the band's mouth but the hair inside.
    const out = foot.clone().sub(top).normalize();
    const back = (p: THREE.Vector3) => p.clone().sub(foot).dot(out) < 0;
    const ball = tail.pos.filter(back).map((p) => p.distanceTo(foot));
    const socket = cap.pos.filter((p) => back(p) && p.distanceTo(foot) < 0.11).map((p) => p.distanceTo(foot));
    expect(ball.length).toBeGreaterThan(20);
    expect(Math.max(...ball)).toBeLessThan(BALL);
    expect(Math.min(...socket) - Math.max(...ball)).toBeGreaterThan(0.005);
  });

  // The flow lines a style's locks run along (hair.py Cap): from the hairline to a pole, the crown's whorl or the tie,
  // its columns turned round the pole from `ref`. Rings at a fixed angle from the pole cross every lock.
  const POLES: Record<string, { pole: number[]; ref: number[]; rings: number[] }> = {
    hair_1: { pole: [0, 0.33, -0.1], ref: [0, 0, 1], rings: [55, 70, 85] },
    hair_2: { pole: [0, 0.3, -0.2], ref: [0, 0, 1], rings: [55, 70, 85] },
    hair_3: { pole: [0, 0, -0.34], ref: [0, 1, 0], rings: [70, 85, 100] },
    hair_4: { pole: [0, 0.33, -0.04], ref: [0, 0, 1], rings: [55, 70, 85] },
  };
  // (Built without its locks, each style measures 0.9 to 1.3 mm here, and 2.3 to 4.5 mm with them.)
  const RIPPLE = 0.0018;
  for (const name of HAIR) {
    it(`${name} is carved into locks: grooves pressed in between them all round`, () => {
      const { parts, centre } = pieces.get(name)!;
      const meshes = parts.find((p) => p.joint === 'sock_head')!.meshes;
      const { pole, ref, rings } = POLES[name];
      const a = new THREE.Vector3(...pole).normalize(), r = new THREE.Vector3(...ref);
      const e1 = r.clone().addScaledVector(a, -r.dot(a)).normalize(), e2 = a.clone().cross(e1);
      let sum = 0;
      for (const deg of rings) {
        const phi = THREE.MathUtils.degToRad(deg), rad = (k: number) => THREE.MathUtils.degToRad(k);
        const dir = (k: number) => a.clone().multiplyScalar(Math.cos(phi))
          .addScaledVector(e1, Math.cos(rad(k)) * Math.sin(phi)).addScaledVector(e2, Math.sin(rad(k)) * Math.sin(phi)).normalize();
        const { rms, count } = ripple(meshes, { from: () => centre, dir }, 360, true);
        expect(count, `${name} ${deg} degrees from the pole`).toBeGreaterThan(100);
        sum += rms;
      }
      expect(sum / rings.length, name).toBeGreaterThan(RIPPLE);
    });
  }
  for (const name of ['beard_2', 'beard_3']) {
    it(`${name} is carved into locks: grooves pressed in down its front`, () => {
      // Level rings round the head's upright axis, through the beard where it hangs below the jaw, cross its locks.
      const { parts, centre } = pieces.get(name)!;
      const meshes = parts[0].meshes, rms: number[] = [];
      for (const y of [-0.18, -0.2, -0.22]) {
        const from = () => centre.clone().add(new THREE.Vector3(0, y, 0));
        const dir = (k: number) => new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(k - 90)), 0, Math.cos(THREE.MathUtils.degToRad(k - 90)));
        const r = ripple(meshes, { from, dir }, 181, false);
        if (r.count > 20) rms.push(r.rms);
      }
      expect(rms.length, name).toBeGreaterThan(0);
      expect(rms.reduce((s, x) => s + x) / rms.length, name).toBeGreaterThan(RIPPLE);
    });
  }
});

describe('hair and beards with headgear and armour', () => {
  it('beards hang in front of every collar and gorget, and stop at the top of the chest', () => {
    // Collars and gorgets rise round the head to 0.145 below its centre, their faces at most 0.23 out (gear.py); a
    // beard's back edge is tucked under the jaw's front face (TUCK), so in front of them.
    for (const name of BEARDS) {
      for (const p of pieces.get(name)!.parts[0].pos) {
        expect(p.y, `${name} at ${at(p)}`).toBeGreaterThan(-0.265);
        if (p.y < -0.15) expect(p.z, `${name} at ${at(p)}`).toBeGreaterThan(0.23 - TUCK - 0.001);
      }
    }
  });

  it('hair at the height of the Ashen Crown\'s band runs in under it, never out through it', () => {
    // The band (uniques.py u_ashen_crown): y 0.09 to 0.21, its outer faces at x +-0.3275, z 0.3325 and -0.3425. Hair
    // pressed in under it (inside its walls) is hidden by it, and above it may spring out; in front of it, it shows.
    const out: string[] = [];
    for (const name of HAIR) {
      for (const { joint, pos } of pieces.get(name)!.parts) {
        if (joint !== 'sock_head') continue;
        for (const p of pos) {
          if (p.y > 0.09 && p.y < 0.21 && (Math.abs(p.x) > 0.3275 || p.z > 0.3325 || p.z < -0.3425)) out.push(`${name} at ${at(p)}`);
        }
      }
    }
    expect(out).toEqual([]);
  });
});
