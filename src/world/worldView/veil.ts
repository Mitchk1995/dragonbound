import * as THREE from 'three';
import { Cell, Ground } from '../layout';
import { applyPaint } from '../../render/paint';
import { smoothNoise } from '../terrain';
import { hash01, ROCK_MASSES, rockMass } from '../../render/blocks';
import { skyDome } from '../../render/sky';
import { underTones, type Scatter, type Scene } from './scene';

/** The masses hanging under the island's rim and the solid core under it all. */
export function hangUnderside(scene: Scene, sets: Scatter) {
  const { theme, seed, w, h, group, inst } = scene;
  const { under, underCols } = sets;
  const underB = underTones(theme)[1];
  if (!under.length) return;
  // Hanging masses: the cliffs' rock masses turned upside down (broad at the top, rounding off
  // below), the whole kit so neighbours never repeat.
  for (let v = 0; v < ROCK_MASSES; v++) {
    const hang = rockMass(v).clone().rotateX(Math.PI).translate(0, 0.5, 0).scale(1.5, 1, 1.5);
    inst(hang, under.filter((_, i) => i % ROCK_MASSES === v), underCols.filter((_, i) => i % ROCK_MASSES === v), 0, false, 'rock');
  }
  // A solid core under the whole island so it reads as one mass, in the same rock as its side.
  const coreMat = new THREE.MeshStandardMaterial({ color: underB.clone(), flatShading: true });
  applyPaint(coreMat, 'rock', 'world', 0.5);
  // Many broken facets (radius and height wandering round it), never a few big flat planes.
  // (Kept inside the island's outline and falling steeply, an inverted mountain under it: a broad
  // shallow cone pushed out past the edge and read from above as a flat dark slab.)
  const CR = Math.min(w, h) * 0.36, CH = 46;
  const coreGeo = new THREE.ConeGeometry(CR, CH, 36, 8).rotateX(Math.PI).toNonIndexed();
  {
    const cp = coreGeo.getAttribute('position') as THREE.BufferAttribute, cn = smoothNoise(seed + 77);
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
      if (r < 1e-3) continue;
      const f = 0.84 + 0.3 * cn(Math.cos(a) * 3 + 9, Math.sin(a) * 3 + y * 0.12);
      cp.setXYZ(i, x * f, y - cn(Math.cos(a) * 5, Math.sin(a) * 5) * 6 * (r / CR), z * f);
    }
    coreGeo.computeVertexNormals();
  }
  const core = new THREE.Mesh(coreGeo, coreMat);
  // Top at y = -1.2: below the deepest pond bed, or it would cap the water.
  core.position.set(w / 2, -1.2 - CH / 2, h / 2);
  group.add(core);
}

/** The Veil's sky and the islets drifting in it; returns their bobbing (or null outside the Veil). */
export function veilSky(scene: Scene, followers: THREE.Object3D[]) {
  const { rng, theme, w, h, at, group } = scene;
  let debrisTick: ((t: number) => void) | null = null;
  if (theme.ambient === 'void') {
    // The Veil's sky: clear sky over a sea of soft cloud below the island's edge.
    const skyGroup = new THREE.Group();
    skyGroup.add(skyDome());
    followers.push(skyGroup);
    group.add(skyGroup);
    // Drifting islets far out in the Veil: two loose clusters off the island's south-west, well out
    // (never behind the castle from the cameras that look at its crown) and well below its land, so
    // they read as distant sky islands and never stand beside a tower. Each is an inverted cone of the
    // cliff's rock tapering to a jagged point, a domed grass cap with tufts spilling over its rim and
    // roots trailing under it, bobbing slowly.
    const debrisMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.cliff?.[0] ?? 0x8a7a6c), flatShading: true, roughness: 0.95, emissive: 0x241a2c });
    applyPaint(debrisMat, 'rock', 'object', 0.8);
    const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color((theme.ground[Ground.Grass] ?? [0x5a8a44])[0]).multiplyScalar(1.15), flatShading: true, roughness: 0.9 });
    const rootMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, flatShading: true, roughness: 1 });
    const clearOf = (x: number, z: number, r: number) => {
      for (let dz = -r; dz <= r; dz += 3) for (let dx = -r; dx <= r; dx += 3) if (at(Math.floor(x + dx), Math.floor(z + dz)) !== Cell.Void) return false;
      return true;
    };
    /** An inverted rock cone: a ring of `n` sides, its rim and every ring below it jittered, ending in a point. */
    const isletBody = (seed: number, r: number, depth: number) => {
      const geo = new THREE.ConeGeometry(r, depth, 7, 3, false).rotateX(Math.PI).translate(0, -depth / 2, 0);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const k = Math.round(x * 31 + 7) * 131 + Math.round(y * 17 + 3) * 7 + Math.round(z * 29);
        const j = 0.22 * r * (hash01(seed, k) - 0.5), t = 1 + j / Math.max(0.01, r);
        pos.setXYZ(i, x * t, y + (y < -depth * 0.05 ? (hash01(seed, k, 2) - 0.5) * depth * 0.18 : 0), z * t);
      }
      geo.computeVertexNormals();
      return geo;
    };
    const bobbers: { o: THREE.Object3D; y: number; ph: number }[] = [];
    for (const [c, a0] of [[0, 2.2], [1, 2.75]] as const) {
      const a = a0 + (rng() - 0.5) * 0.2;
      let r = 190;
      while (r < 460 && !clearOf(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, 40)) r += 6;
      const cx = w / 2 + Math.cos(a) * r, cz = h / 2 + Math.sin(a) * r, cy = -42 + rng() * 8;
      for (let i = 0, n = 3 + c; i < n; i++) {
        const size = i ? 2.2 + rng() * 2.6 : 6 + rng() * 3;
        const islet = new THREE.Group();
        const ang = rng() * 6.3, d = i ? 9 + rng() * 16 : 0;
        islet.position.set(cx + Math.cos(ang) * d, cy + (rng() - 0.5) * 9, cz + Math.sin(ang) * d);
        islet.rotation.y = rng() * 6.3;
        islet.add(new THREE.Mesh(isletBody(20 + c * 7 + i, size * 0.62, size * (1.3 + rng() * 0.6)), debrisMat));
        const cap = new THREE.Mesh(new THREE.SphereGeometry(size * 0.66, 9, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.28, 1), capMat);
        cap.position.y = -0.05;
        islet.add(cap);
        for (let k = 0; k < 5; k++) {
          const ta = (k / 5) * Math.PI * 2 + rng() * 0.6, tuft = new THREE.Mesh(new THREE.ConeGeometry(size * 0.08, size * 0.16, 4), capMat);
          tuft.position.set(Math.cos(ta) * size * 0.6, -size * 0.05, Math.sin(ta) * size * 0.6);
          tuft.rotation.set(Math.sin(ta) * 1.9, 0, -Math.cos(ta) * 1.9);
          islet.add(tuft);
        }
        for (let k = 0; k < 4; k++) {
          const len = size * (0.4 + rng() * 0.6), root = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.1, len, 4), rootMat);
          const ra = rng() * 6.3, rr = size * (0.25 + rng() * 0.25);
          root.position.set(Math.cos(ra) * rr, -len / 2 - size * 0.1, Math.sin(ra) * rr);
          root.rotation.z = (rng() - 0.5) * 0.3;
          islet.add(root);
        }
        islet.traverse((o) => (o.name = 'debris'));
        group.add(islet);
        bobbers.push({ o: islet, y: islet.position.y, ph: rng() * 6.3 });
      }
    }
    debrisTick = (t) => bobbers.forEach((b) => (b.o.position.y = b.y + Math.sin(t * 0.35 + b.ph) * 0.45));
  }
  return debrisTick;
}
