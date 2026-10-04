import * as THREE from 'three';
import { abs, clamp, dot, float, normalize, pow, vec2, vec3 } from 'three/tsl';
import { surfaceTexture, SURFACES, type SurfaceKind } from './textures';
import { addPatch, surfaceFrame, type F, type SurfaceFrame, type SurfaceSpace, type V2, type V3 } from './patch';

// ─── Surface detail: triplanar albedo + bump ────────────────────────────────

/**
 * Bump from the height gradient measured in texture space (finite differences), carried to view
 * space along the projection axes. Unlike screen-space derivative bump it has no 2×2-pixel
 * blockiness or dashed moiré at grazing angles.
 */
const SURF_E = 1.5 / 256;
function surfBump(f: SurfaceFrame, n: V3, grad: V3, strength: F): V3 {
  const g0 = f.toView(grad);
  const g = g0.sub(n.mul(dot(g0, n)));
  return normalize(n.sub(g.mul(strength)));
}

/** The albedo and roughness a surface height (0..1) gives (`alb` its strength). */
export const heightColor = (c: V3, h: F, alb: F) => c.mul(clamp(h.sub(0.5).mul(2).mul(alb).add(1), 0, 2));
export const heightRoughness = (r: F, h: F, alb: F) => clamp(r.add(float(0.5).sub(h).mul(0.3).mul(alb)), 0.05, 1);

/**
 * Apply a procedural surface to a MeshStandardMaterial (other material types are left alone).
 * A kind with no bump samples albedo only; one with neither leaves the material untouched.
 */
export function applySurface(mat: THREE.Material, kind: SurfaceKind, space: SurfaceSpace = 'object', scaleMul = 1) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  const p = SURFACES[kind];
  if (p.albedo === 0 && p.bump === 0) return;
  const bump = p.bump > 0;
  const uniforms = {
    uSurfTex: { value: surfaceTexture(kind) },
    uSurfScale: { value: p.scale * scaleMul },
    uSurfAlbedo: { value: p.albedo },
    uSurfBump: { value: p.bump },
  };
  addPatch(mat, {
    key: `surface:${space}${bump ? '' : ':flat'}`,
    slot: 'surface',
    uniforms,
    nodes(u, b) {
      let f: SurfaceFrame;
      const tex = u.tex('uSurfTex'), scale = u.f('uSurfScale'), alb = u.f('uSurfAlbedo');
      // Flat: one fetch per plane. Bumped: two more per plane for the gradient.
      const plane = (uv: V2): V3 => {
        const h = tex.sample(uv).r.toVar();
        return bump ? vec3(h, tex.sample(uv.add(vec2(SURF_E, 0))).r.sub(h), tex.sample(uv.add(vec2(0, SURF_E))).r.sub(h)) : vec3(h, 0, 0);
      };
      let h: F = float(0.5), grad: V3 = vec3(0);
      return {
        color(c) {
          f = surfaceFrame(space, b);
          const w0 = pow(abs(normalize(f.nrm)), vec3(4));
          const w = w0.div(w0.x.add(w0.y).add(w0.z)).toVar();
          const q = f.pos.mul(scale).toVar();
          const px = plane(q.yz).toVar(), py = plane(q.xz.add(0.37)).toVar(), pz = plane(q.xy.add(0.71)).toVar();
          grad = vec3(0, px.y, px.z).mul(w.x).add(vec3(py.y, 0, py.z).mul(w.y)).add(vec3(pz.y, pz.z, 0).mul(w.z)).mul(scale.div(SURF_E)).toVar();
          h = px.x.mul(w.x).add(py.x.mul(w.y)).add(pz.x.mul(w.z)).toVar();
          return heightColor(c, h, alb);
        },
        roughness: (r) => heightRoughness(r, h, alb),
        normal: bump ? (n) => surfBump(f, n, grad, u.f('uSurfBump').mul(0.12).div(scale)) : undefined,
      };
    },
  });
}
