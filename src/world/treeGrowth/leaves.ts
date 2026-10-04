import * as THREE from 'three';
import { clamp, mulberry32 } from '../../core/rng';
import { SPRAY_CELLS, sprayCell } from '../../render/foliage';
import { packAttributes } from '../../render/patch';
import { crownDepth, crownNormal } from './crown';
import { along, around, perpendicular, range, UP, type Skeleton, type Spray } from './skeleton';

/** No leaf card reaches lower than this (m): it would brush the 2 m hero's head. */
const HEAD = 2.15;

/**
 * The crown's leaf cards (see treeGrowth.ts). Attributes besides position, normal and uv:
 * `color` (the crown's painted shade), `aWind` (the spray's anchor on its twig and its sway weight:
 * the whole card moves with its twig), `aFlutter` (0 at the card's foot, 1 at its far edge), and
 * `aCard` and `aSpine` (the card's face and the point on its midline level with the vertex: seen
 * edge on, the leaf shader narrows a card onto its midline).
 */
export function leafGeometry(sk: Skeleton, seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed * 104729 + 7);
  const { crown } = sk;
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [], wind: number[] = [], flutter: number[] = [], card3: number[] = [], spine: number[] = [], idx: number[] = [];
  const out = new THREE.Vector3(), cn = new THREE.Vector3(), n = new THREE.Vector3(), p = new THREE.Vector3(), tmp = new THREE.Vector3();
  // Leaf masses: the sprays of one branch light together as one soft lobe of the crown, lit on top
  // and shaded under, the way a painter blocks in a tree's masses before its leaves.
  const masses = new Map<number, { c: THREE.Vector3; r: number; n: number }>();
  for (const s of sk.sprays) {
    const m = masses.get(s.limb) ?? { c: new THREE.Vector3(), r: 0, n: 0 };
    m.c.add(s.at);
    m.n++;
    masses.set(s.limb, m);
  }
  for (const m of masses.values()) m.c.divideScalar(m.n);
  for (const s of sk.sprays) {
    const m = masses.get(s.limb)!;
    m.r = Math.max(m.r, s.at.distanceTo(m.c) + s.size * 0.5);
  }
  const card = (s: Spray, foot: THREE.Vector3, up: THREE.Vector3, face: THREE.Vector3, w: number, h: number) => {
    const side = new THREE.Vector3().crossVectors(up, face).normalize();
    // (A card that would reach down past the hero's head is lifted clear.)
    const base = foot.clone();
    base.y += Math.max(0, HEAD - (base.y + Math.min(0, up.y * h) - Math.abs(side.y) * w * 0.5));
    const { u0, u1, v0, v1 } = sprayCell(Math.floor(rng() * SPRAY_CELLS * SPRAY_CELLS));
    const flip = rng() < 0.5, pad = 0.003;
    // The spray's own tone: lighter or darker, warmer or cooler, than its neighbours.
    const tone = 0.86 + rng() * 0.28, warm = (rng() - 0.5) * 0.1;
    const mass = masses.get(s.limb)!;
    const first = pos.length / 3;
    for (const [sx, sy] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]] as const) {
      p.copy(base).addScaledVector(up, sy * h);
      spine.push(p.x, p.y, p.z);
      card3.push(face.x, face.y, face.z);
      p.addScaledVector(side, sx * w);
      pos.push(p.x, p.y, p.z);
      // Normals swell out of the leaf mass (from a little under its middle) and the crown as a whole;
      // a hanging strand's out of the curtain and up, so the curtain lights as one soft, rounded face.
      crownNormal(crown, p, cn);
      tmp.copy(mass.c).addScaledVector(UP, -0.35 * mass.r);
      if (s.hang) n.set(face.x, 0, face.z).normalize().multiplyScalar(0.6).addScaledVector(UP, 0.55).addScaledVector(cn, 0.2).normalize();
      else n.subVectors(p, tmp).normalize().multiplyScalar(0.5).addScaledVector(cn, 0.35).addScaledVector(UP, 0.15).normalize();
      nrm.push(n.x, n.y, n.z);
      uv.push(u0 + pad + (flip ? 0.5 - sx : 0.5 + sx) * (u1 - u0 - 2 * pad), v0 + pad + sy * (v1 - v0 - 2 * pad));
      // The painted shade: darker deep in the crown, under it and under each mass, so the crown
      // reads as lit masses over shadowed hollows; the light warm and yellow, the shade cool and grey.
      const depth = crownDepth(crown, p);
      const inner = 1 - 0.45 * (1 - THREE.MathUtils.smoothstep(depth, 0.5, 1.0));
      const under = 0.68 + 0.32 * THREE.MathUtils.smoothstep(cn.y, -0.8, 0.35);
      const lobe = 0.74 + 0.32 * clamp((p.y - mass.c.y) / mass.r * 0.5 + 0.5, 0, 1);
      const top = THREE.MathUtils.smoothstep(cn.y, -0.2, 0.9) * THREE.MathUtils.smoothstep(0.55, 0.95, depth);
      // (A strand lit from its top, a little darker toward its hem.)
      const k = s.hang ? (0.98 - 0.22 * ((s.hang.drop + sy) / s.hang.of)) * Math.max(inner, 0.8) * tone : inner * under * lobe * tone;
      // (Shade drifts toward grey-blue: the green is strongest only where the light falls.)
      const grey = (1 - top) * 0.12;
      col.push(k * (0.92 + top * 0.16 + warm + grey * 0.2), k * (0.97 + top * 0.06 - grey * 0.15), k * (1.04 - top * 0.2 - warm + grey * 0.5));
      const anchor = s.hang?.top ?? s.at;
      wind.push(anchor.x, anchor.y, anchor.z, s.sway);
      flutter.push(sy);
    }
    idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
  };
  const face = new THREE.Vector3(), up = new THREE.Vector3(), base = new THREE.Vector3();
  const weep = sk.species.weep;
  for (const s of sk.sprays) {
    crownNormal(crown, s.at, out);
    if (s.hang && weep) {
      // A strand's card hangs from its top, facing out of the crown, with a second crossing it; at
      // its top a spray arches out over the branch before the strand falls (so from above the
      // curtain's head is leafy too).
      face.set(out.x, 0, out.z).add(new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5).multiplyScalar(0.6));
      if (face.lengthSq() < 1e-4) face.set(1, 0, 0);
      face.normalize();
      const away = face.clone();
      up.copy(s.dir).addScaledVector(face, -s.dir.dot(face)).normalize();
      face.crossVectors(new THREE.Vector3().crossVectors(up, face), up).normalize();
      const w = weep.width * range(rng, [0.8, 1.0]);
      base.copy(s.at).addScaledVector(face, 0.03);
      card(s, base, up, face, w, s.size);
      if (s.hang.drop === 0) {
        const arch = away.clone().multiplyScalar(0.8).addScaledVector(UP, -0.25).normalize();
        const lie = new THREE.Vector3().crossVectors(arch, new THREE.Vector3().crossVectors(UP, arch)).normalize();
        card(s, s.at.clone().addScaledVector(away, -0.35), arch, lie, w * 1.15, weep.card * 0.85);
      }
      card(s, base, up, face.clone().applyAxisAngle(up, (rng() < 0.5 ? 1 : -1) * range(rng, [1.1, 1.45])), w * 0.9, s.size * 0.97);
      continue;
    }
    // Sprays face the sky and the outside of the crown, as leaves turn to the light; each runs out
    // along its twig, laid into that face.
    face.copy(UP).multiplyScalar(0.75).addScaledVector(out, 0.55).add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.5)).normalize();
    up.copy(s.dir).addScaledVector(face, -s.dir.dot(face));
    if (up.lengthSq() < 1e-4) up.copy(around(face, s.dir, 0));
    up.normalize();
    face.crossVectors(new THREE.Vector3().crossVectors(up, face), up).normalize();
    const w = s.size * range(rng, [0.85, 1.0]), h = s.size * range(rng, [1.0, 1.15]);
    // The card starts a little behind where the spray leaves its branch and lies just over the
    // branch, so its leaves cover the branch there (and a tip's pair closes over the tip).
    const L = sk.limbs[s.limb];
    base.copy(s.at).addScaledVector(up, -0.3 * h).addScaledVector(face, along(L.radius, L, s.s) + 0.04);
    card(s, base, up, face, w, h);
    // A second card crossing the first, so the spray has body from the side.
    const turn = (rng() < 0.5 ? 1 : -1) * range(rng, [0.95, 1.4]);
    card(s, base, up, face.clone().applyAxisAngle(up, turn), w * 0.92, h * 0.95);
    if (rng() < 0.06) {
      // Now and then a smaller one turned outward, filling the spray.
      const f3 = out.clone().addScaledVector(perpendicular(out, rng), 0.5).normalize();
      const u3 = up.clone().addScaledVector(f3, -up.dot(f3)).normalize();
      card(s, base.clone().addScaledVector(up, h * 0.25), u3, f3, w * 0.7, h * 0.7);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 4));
  g.setAttribute('aFlutter', new THREE.Float32BufferAttribute(flutter, 1));
  g.setAttribute('aCard', new THREE.Float32BufferAttribute(card3, 3));
  g.setAttribute('aSpine', new THREE.Float32BufferAttribute(spine, 3));
  packAttributes(g, ['aWind', 'aFlutter', 'aCard', 'aSpine']);
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
