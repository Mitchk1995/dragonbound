import * as THREE from 'three';
import { clamp, mulberry32 } from '../../core/rng';
import { along, normalOn, pointOn, tangentOn, type Limb } from './skeleton';

// A snapped limb's end (Limb.broken, a dead tree's: deadwood.ts), as the wood mesh builds it (wood.ts).

/** How far a snapped limb's splinters stand past its last ring (m): about two of its radii, never more than a quarter of it. */
export const breakLength = (L: Limb, len: number) => Math.min(len * 0.25, Math.max(0.05, L.radius[L.radius.length - 1] * 2));

/**
 * The break: from the limb's last ring (`last`, at arc length `s0`) a ragged crown of splinters, one
 * over each side of the ring, drawn in toward the heartwood and standing to heights of their own (the
 * break slants, the side that tore last standing tallest, one splinter reaching the limb's end), and a
 * rough face across them sunk below their tips. `vertex` adds a point of the wood (its place, its angle
 * round the limb, its radius and its arc length) and returns its index; the triangles go in `idx`.
 */
export function brokenEnd(L: Limb, last: number[], s0: number, len: number, vertex: (p: THREE.Vector3, a: number, r: number, s: number) => number, idx: number[]) {
  const rng = mulberry32((L.broken ?? 0) * 7451 + 3);
  const S = last.length, h = len - s0, r0 = along(L.radius, L, s0);
  const P = pointOn(L, s0), T = tangentOn(L, s0), N = normalOn(L, s0, T), B = new THREE.Vector3().crossVectors(T, N);
  const tear = rng() * Math.PI * 2, tallest = Math.floor(rng() * S);
  const tips = Array.from({ length: S }, (_, j) => {
    const a = (j / S) * Math.PI * 2;
    const f = j === tallest ? 1 : clamp(0.42 + 0.38 * Math.cos(a - tear) + (rng() - 0.5) * 0.55, 0.12, 0.92);
    const k = 0.5 + 0.35 * rng();
    const p = P.clone().addScaledVector(T, h * f).addScaledVector(N, Math.cos(a) * r0 * k).addScaledVector(B, Math.sin(a) * r0 * k);
    return vertex(p, a, r0 * k, s0 + h * f);
  });
  const heart = vertex(P.clone().addScaledVector(T, h * 0.22), 0, 0.001, s0 + h * 0.22);
  for (let j = 0; j < S; j++) {
    const j1 = (j + 1) % S;
    idx.push(last[j], last[j1], tips[j1], last[j], tips[j1], tips[j]);
    idx.push(tips[j], tips[j1], heart);
  }
}
