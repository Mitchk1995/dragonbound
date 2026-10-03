/** The castle's water: the springs, falls, reeds and stepping stones. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type V3 } from '../../render/kit';
import { hash01 } from '../../render/blocks';
import { crossedRibbons, fallingWaterMaterial, mistTexture, pour } from '../water';
import { type Builder, ball, brokenFoam, cb, chunk, lenOf, limb, ROCK_WET, round, softDisc, vOf } from '../props';

/**
 * A broken ring of foam spreading from where water lands (radius 1, scaled as it spreads): a few
 * arcs of soft blobs with gaps between them, wandering in and out a little, never a clean circle.
 */
const ringCache2 = new Map<number, THREE.BufferGeometry>();

export function foamArcs(seed: number) {
  let geo = ringCache2.get(seed);
  if (geo) return geo;
  const parts: THREE.BufferGeometry[] = [];
  let t = hash01(seed, 0) * Math.PI * 2;
  for (let arcN = 0; arcN < 4; arcN++) {
    const span = 0.5 + hash01(seed, arcN, 1) * 0.9, n = Math.round(span * 7);
    for (let i = 0; i < n; i++) {
      const a = t + (span * i) / n, rr = 1 + (hash01(seed, arcN, i) - 0.5) * 0.16;
      const blob = softDisc(seed * 17 + arcN * 7 + i, 0.09 + hash01(seed, i, arcN + 5) * 0.07, [0.92, 0.96, 0.97], 0.55 + 0.3 * hash01(seed, arcN, i + 9));
      parts.push(blob.clone().translate(Math.cos(a) * rr, 0, Math.sin(a) * rr));
    }
    t += span + 0.35 + hash01(seed, arcN, 3) * 0.6;
  }
  geo = mergeGeometries(parts)!;
  ringCache2.set(seed, geo);
  return geo;
}

export const WATER_PROPS: Record<string, Builder> = {
  /** Reeds in a clump at the waterline: slim leaning blades, a few with brown cattail heads. */
  reeds: (k, g) => {
    for (let i = 0; i < 11; i++) {
      const a = hash01(i, 1) * Math.PI * 2, r = hash01(i, 2) * 0.6, h = 0.9 + hash01(i, 3) * 0.8;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, lean = (hash01(i, 4) - 0.5) * 0.4;
      limb(k, g, [x, -0.1, z], [x + lean, h, z + lean * 0.6], [0.06, 0.04, 0.01, 0.01], i % 3 ? 0x5a7a34 : 0x6e8a3e);
      if (i % 4 === 0) cb(k, g, [0.08, 0.26, 0.08], [x + lean * 0.8, h * 0.82, z + lean * 0.5], 0x6a4a2a, [lean * 0.4, 0, 0], 0.02);
    }
  },
  /**
   * A rounded stone breaking a stream's surface (the water flowing toward +Z), a smaller one beside
   * it, and a short trail of broken foam drifting downstream from them.
   */
  stream_stone: (k, g, arg) => {
    const sd = Math.round((lenOf(arg) ?? 1) * 7);
    chunk(k, g, 980 + sd, [0.75, 0.62, 0.62], [0, -0.66, 0], 0x7a7470, hash01(sd, 1) * 3);
    chunk(k, g, 981 + sd, [0.42, 0.42, 0.38], [0.5 * (hash01(sd, 2) > 0.5 ? 1 : -1), -0.7, 0.25], 0x6a6466, hash01(sd, 3) * 3);
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    m.userData.decal = m.userData.noOcclude = true;
    const f = new THREE.Mesh(brokenFoam(200 + sd, 0.55, 6, 0.6), m);
    f.position.set(0, -0.255, 0.55);
    f.scale.set(0.8, 1, 1.5);
    f.renderOrder = 3;
    g.add(f);
  },
  /**
   * Water spilling off the island's edge (flowing toward +Z): it curls over the lip in a widening sheet
   * and falls away into the Veil, fading as it drops, mist drifting up off it. `v` 0: the end of a
   * stream; 1: a spring breaking out at the brink of the castle rock from a mossy cleft between
   * rounded masses of the rock, ferns and moss over them, falling the rock's whole height.
   */
  edge_fall: (k, g, arg) => {
    const time = { value: 0 }, spring = vOf(arg) === 1;
    const ROCK = 0x5e6572, ROCK_D = 0x4e5462, MOSS = [0x5a7a34, 0x66863a, 0x4e6e30];
    const pts = pour(new THREE.Vector3(0, -0.25, -0.6), new THREE.Vector3(0, spring ? -26 : -18, spring ? 5.5 : 4.5), 0.05, 30);
    const { geo, len } = crossedRibbons(pts, spring ? 1.6 : 2.2, 4.2);
    const fall = new THREE.Mesh(geo, fallingWaterMaterial(time, 83, len, 4.2, true));
    fall.name = 'waterfall';
    fall.renderOrder = 2;
    g.add(fall);
    if (spring) {
      // The cleft: rounded masses either side of the spout and a broad one over its head, wet and
      // dark round the water, moss over their crowns and ferns along the lip.
      for (const sx of [-1, 1]) {
        chunk(k, g, 980 + sx, [1.8, 1.7, 2.0], [sx * 1.45, -0.5, -0.9], sx < 0 ? ROCK : ROCK_D, sx * 0.4);
        chunk(k, g, 982 + sx, [1.1, 0.9, 1.2], [sx * 2.4, -0.4, -0.1], ROCK_D, -sx * 0.5);
        ball(k, g, 0.55, [sx * 1.45, 1.15, -0.95], MOSS[(sx + 1) / 2], [1.4, 0.4, 1.3]);
        ball(k, g, 0.3, [sx * 2.4, 0.45, -0.1], MOSS[2], [1.3, 0.45, 1.2]);
      }
      chunk(k, g, 984, [2.4, 1.3, 1.6], [0, 0.2, -1.9], ROCK, 0.1);
      chunk(k, g, 985, [1.2, 0.5, 0.9], [0, -0.45, -0.75], ROCK_WET, 0);
      ball(k, g, 0.7, [0, 1.42, -1.9], MOSS[1], [1.6, 0.4, 1.1]);
      for (const [x, z, r] of [[-0.8, -0.35, 0.22], [0.75, -0.3, 0.2], [-2.0, 0.35, 0.18], [1.9, 0.4, 0.2]]) ball(k, g, r, [x, 0.0, z], MOSS[Math.abs(Math.round(x * 3)) % 3], [1.5, 0.5, 1.3]);
    } else for (const sx of [-1, 1]) chunk(k, g, 970 + sx, [0.9, 0.5, 0.8], [sx * 1.5, -0.35, -0.2], ROCK, sx);
    const mist: THREE.Sprite[] = [];
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTexture(), color: 0xf2f4f8, transparent: true, depthWrite: false, opacity: 0.3 }));
      sp.name = 'spray';
      sp.renderOrder = 4;
      g.add(sp);
      mist.push(sp);
    }
    return {
      obj: g,
      tick: (t) => {
        time.value = t;
        mist.forEach((sp, i) => {
          const p = (t * 0.12 + i / mist.length) % 1;
          sp.position.set(Math.sin(i * 2.3) * 1.2, -3 - i * (spring ? 3.6 : 2.2) + p * 2.5, 1.2 + i * (spring ? 0.7 : 0.5));
          sp.scale.setScalar(2.5 + p * 3);
          sp.material.opacity = 0.32 * Math.sin(p * Math.PI);
        });
      },
    };
  },
  /**
   * The spring's fall (`len` above the pool, its back to -Z against the castle rock): the water
   * breaks out of a mossy cleft in a shoulder of rock partway down the face, ferns and moss round its
   * lip and the rock dark and wet below it, falls onto a ledge where it splashes, and drops again in
   * a wider, fraying sheet into the pool, churning foam that spreads in rings, mist rising off it.
   */
  spring_fall: (k, g, arg) => {
    const Y = lenOf(arg) ?? 10, time = { value: 0 };
    const ROCK = 0x5e6572, ROCK_D = 0x4e5462, WET = ROCK_WET, FERN = [0x5e7e34, 0x6c8c3c, 0x7a9a46];
    /**
     * A cushion of moss draped over a ledge: broad flat lobes run together along it, sunk into the
     * rock and spilling a little over its front, never a row of round buttons.
     */
    const cushion = (x: number, y: number, z: number, w: number, seed: number) => {
      const n = Math.max(2, Math.round(w / 0.32));
      for (let i = 0; i < n; i++) {
        const u = x - w / 2 + (w * (i + 0.5)) / n + (hash01(seed, i, 4) - 0.5) * 0.12, r = 0.2 + hash01(seed, i) * 0.12;
        ball(k, g, r, [u, y - 0.04 + (hash01(seed, i, 2) - 0.6) * 0.06, z + (hash01(seed, i, 3) - 0.5) * 0.14], FERN[Math.abs(i + seed) % 3], [1.5, 0.45, 1.2]);
        if (hash01(seed, i, 5) > 0.55) ball(k, g, r * 0.7, [u + 0.05, y - 0.2, z + 0.26], FERN[Math.abs(i + seed + 1) % 3], [1.1, 0.9, 0.5]);
      }
    };
    /** Ivy trailing down a face from a crack: a few lumps at its root and a strand of small leaves hugging the rock below. */
    const trail = (x: number, y: number, z: number, len: number, seed: number) => {
      cushion(x, y, z, 0.35, seed);
      for (let j = 0; j < Math.round(len / 0.16); j++) {
        const dx = (hash01(seed, j, 7) - 0.5) * 0.12 + Math.sin(j * 1.3 + seed) * 0.05;
        k.box(g, [0.15, 0.15, 0.04], [x + dx, y - 0.12 - j * 0.16, z + 0.02], FERN[Math.abs(j + seed) % 3], [0, 0, hash01(seed, j) * 1.5]);
      }
    };
    const cY = Y * 0.6, ledge = Y * 0.3;
    // The shoulder of rock the spring breaks out of: big blocks either side running up to the road's
    // lip, overhanging rock over the cleft, and down the middle a band of wet, dark rock half again
    // as wide as the fall, mossy along its edges.
    for (const sx of [-1, 1]) {
      chunk(k, g, 930 + sx, [1.7, Y - 0.5, 2.8], [sx * 1.7, -0.3, -1.6], sx < 0 ? ROCK : ROCK_D, sx * 0.12);
      chunk(k, g, 934 + sx, [1.2, cY * 0.7, 1.6], [sx * 1.35, -0.3, -0.5], ROCK_D, sx * 0.3);
    }
    chunk(k, g, 937, [2.4, Y - cY - 1.6, 2.2], [0.1, cY + 1.1, -1.8], ROCK_D, 0.08);
    chunk(k, g, 938, [2.2, cY + 0.6, 1.4], [0, -0.3, -1.85], WET, 0);
    for (const [x, y0, y1, z] of [[-0.75, 0, cY, -1.15], [0.75, ledge, cY + 0.6, -1.15], [0, cY + 1.0, Y - 1.2, -1.0]]) chunk(k, g, 960 + Math.round(x * 10 + y0), [1.0, y1 - y0, 0.6], [x, y0, z], WET, x * 0.3);
    // The wet band runs on up behind the upper fall to the top of the face, about half again as wide
    // as the fall, moss and ferns along its edges.
    chunk(k, g, 942, [3.0, Y - cY - 1.0, 0.5], [0, cY + 0.7, -1.25], WET, 0.1);
    for (const sx of [-1, 1]) for (const y of [ledge + 0.7, cY - 0.5]) trail(sx * 1.05, y, -0.72, 0.9, 970 + Math.round(y * 10) + sx);
    // The cleft: an irregular V-shaped fissure under overlapping lips of rock, darkening inward (wet
    // rock, then deep shadow at its back, no straight edge anywhere); the water spills over a rounded
    // mossy lip, ferns hanging over its edges.
    for (const sx of [-1, 1]) {
      chunk(k, g, 950 + sx, [0.9, 1.5, 1.0], [sx * 0.62, cY - 0.25, -0.95], ROCK, sx * 0.55);
      chunk(k, g, 952 + sx, [0.7, 0.9, 0.8], [sx * 0.35, cY + 0.75, -1.0], ROCK_D, -sx * 0.4);
    }
    // Inside it the wet rock only darkens by steps (no black box), and spurs of rock stand into the
    // gap from both sides at different heights, so its outline is ragged from the cleft to the ledge.
    chunk(k, g, 954, [0.7, 1.0, 0.5], [0, cY + 0.05, -1.35], 0x3e3a40, 0.2);
    chunk(k, g, 955, [0.4, 0.6, 0.4], [0.05, cY + 0.2, -1.5], 0x302c32, -0.3);
    for (const [x, y, sy, sd] of [[-0.62, ledge + 1.0, 1.3, 957], [0.66, ledge + 1.8, 1.0, 958], [-0.58, cY - 1.5, 0.8, 959], [0.6, ledge + 0.45, 0.7, 961]]) {
      chunk(k, g, sd, [0.62, sy, 0.9], [x, y, -1.1], x < 0 ? ROCK : ROCK_D, x * 0.8);
    }
    chunk(k, g, 956, [1.1, 1.0, 0.9], [0, cY + 1.05, -0.95], ROCK, 0.35);
    // The lip the water spills over: a rounded, water-worn stone with moss draped over its ends.
    chunk(k, g, 939, [1.0, 0.42, 0.9], [0, cY - 0.32, -0.85], WET, 0.1);
    cushion(0, cY + 0.06, -0.66, 0.5, 939);
    // Ivy trailing from the cleft's cracks either side of the spout, flat on the wet rock.
    for (const [x, y, z, l] of [[-0.75, cY + 0.9, -0.5, 1.1], [0.72, cY + 1.0, -0.52, 1.3], [-0.9, cY + 0.15, -0.42, 0.8], [0.88, cY + 0.1, -0.45, 0.9]] as number[][]) trail(x, y, z, l, Math.round(x * 100 + y * 10));
    // Moss seated on the tops of the rock masses over the cleft and at the head of the face (each on
    // the top of the block it grows on, half sunk into it, never floating clear of the stone).
    for (const [x, y, z, w] of [[-0.38, cY + 1.15, -1.0, 0.55], [0.36, cY + 1.15, -1.0, 0.55], [0, Y - 0.75, -1.5, 1.1], [-1.65, Y - 1.08, -1.55, 0.9], [1.65, Y - 1.08, -1.55, 0.9]]) cushion(x, y, z, w, Math.round(x * 10 + y));
    // The ledge the first fall lands on: a chunky shelf of the cliff's own rock, a metre thick, run
    // across between the shoulders and merged into them (their masses lap over its ends), wet and dark
    // on top, its lip rounded and water-worn where the water sheets off it.
    chunk(k, g, 945, [3.3, ledge + 0.3, 1.6], [0, -0.3, -0.55], ROCK_D, 0.05);
    chunk(k, g, 946, [2.9, 1.7, 1.9], [0, ledge - 1.6, 0.1], WET, 0.12);
    round(k, g, [-1.1, ledge - 0.42, 0.5], [1.15, ledge - 0.4, 0.46], 0.44, 0.4, WET, 0.8);
    for (const sx of [-1, 1]) {
      chunk(k, g, 947 + sx, [1.2, ledge + 0.9, 1.7], [sx * 1.35, -0.3, -0.1], ROCK, sx * 0.4);
      chunk(k, g, 941 + sx, [1.1, 1.3, 1.5], [sx * 1.2, ledge - 0.9, 0.1], ROCK_D, -sx * 0.3);
      cushion(sx * 1.2, ledge + 0.38, 0.1, 0.6, 941 + sx);
    }
    // The two drops of one stream: the spout off the cleft's lip falls onto the ledge right at its
    // worn lip and runs straight on over it as the lower fall, the same water the same width where the
    // two meet, spreading only a little as it drops to the pool.
    const brink = new THREE.Vector3(0, ledge + 0.06, 1.04);
    const sheets: [THREE.Vector3[], number, number, number][] = [
      [pour(new THREE.Vector3(0, cY - 0.05, -0.55), brink, 0.25, 18), 0.75, 1.1, 71],
      [pour(brink, new THREE.Vector3(0, -0.2, 1.6), 0.12, 22), 1.1, 1.6, 72],
    ];
    for (const [pts, w0, w1, seed] of sheets) {
      const { geo, len } = crossedRibbons(pts, w0, w1);
      const fall = new THREE.Mesh(geo, fallingWaterMaterial(time, seed, len, w1));
      fall.name = 'waterfall';
      fall.renderOrder = 2;
      g.add(fall);
    }
    // Churning water where the fall lands: patches of broken foam that heave out of step, and broken
    // arcs of foam spreading from the landing and fading, each at its own pace, drifting downstream.
    const foam: THREE.Mesh[] = [];
    const foamAt: [V3, number, number][] = [[[0, -0.22, 1.6], 0.85, 18], [[0.1, -0.215, 2.05], 0.65, 12], [[0, ledge + 0.1, 0.62], 0.45, 8]];
    foamAt.forEach(([at, r, n], i) => {
      const f = new THREE.Mesh(brokenFoam(80 + i, r, n, 0.6), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
      f.position.set(...at);
      f.material.userData.decal = f.material.userData.noOcclude = true;
      f.renderOrder = 3;
      f.name = 'foam';
      g.add(f);
      foam.push(f);
    });
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 0.5 });
      m.userData.decal = m.userData.noOcclude = true;
      const ring = new THREE.Mesh(foamArcs(90 + i), m);
      ring.position.set(0, -0.21 + i * 0.002, 1.6);
      ring.rotation.y = i * 2.1;
      ring.name = 'foam-ring';
      ring.renderOrder = 3;
      g.add(ring);
      rings.push(ring);
    }
    const mist: THREE.Sprite[] = [];
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTexture(), color: 0xeef6f8, transparent: true, depthWrite: false, opacity: 0.3 }));
      sp.name = 'spray';
      sp.renderOrder = 4;
      g.add(sp);
      mist.push(sp);
    }
    return {
      obj: g,
      tick: (t) => {
        time.value = t;
        foam.forEach((f, i) => {
          f.scale.setScalar(0.9 + 0.15 * Math.sin(t * 3.3 + i * 1.9));
          f.rotation.y = 0.2 * Math.sin(t * 0.7 + i);
        });
        rings.forEach((r, i) => {
          const speed = [0.31, 0.24, 0.37][i], p = (t * speed + i * 0.37) % 1;
          r.scale.setScalar(0.8 + p * (1.8 + i * 0.35));
          r.position.z = 1.6 + p * 0.6;
          (r.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - p) * (1 - p) * Math.min(1, p * 5);
        });
        // A low mist hugging the rock off the foot (big, slow, faint), and a thin fan of spray off
        // the ledge's lip.
        mist.forEach((sp, i) => {
          const foot = i < 5, p = (t * (foot ? 0.25 : 0.6) + i / mist.length) % 1;
          sp.position.set(Math.sin(i * 2.3) * (foot ? 0.8 : 0.35 * (1 + p)), (foot ? -0.1 : ledge - 0.1) + p * (foot ? 1.8 : 0.5), (foot ? 1.35 : 0.95 + p * 0.4) + Math.cos(i * 2.3) * 0.3);
          sp.scale.setScalar((foot ? 1.6 : 0.35) + p * (foot ? 2.2 : 0.5));
          sp.material.opacity = (foot ? 0.22 : 0.14) * Math.sin(p * Math.PI);
        });
      },
    };
  },
};
