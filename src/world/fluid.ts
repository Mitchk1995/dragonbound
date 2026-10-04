import * as THREE from 'three';
import type { ZoneTheme } from '../data/zones';
import { abs, attribute, cameraViewMatrix, cos, diffuseColor, dot, float, If, length, mat3, max, min, mix, normalize, normalView, positionView, positionWorld, pow, reflect, saturate, sin, smoothstep, transpose, vec2, vec3 } from 'three/tsl';
import { addPatch, rot2, type F, type V2, type V3 } from '../render/patch';
import { effectsWater } from '../render/surfaces';
import { noiseTexture } from '../render/textures';
import { Fluid } from './layout';
import { mirrorUV, planarReflection, SUN_GLINT } from './water';

/**
 * The terrain's liquids: the animated water and lava over its Fluid cells (terrain.ts lays the
 * surfaces out; this draws them).
 */

/** The layer a moat's mirror draws, and how far from its water what it draws stands (see fluidSurface). */
const MOAT_MIRROR_LAYER = 5, MOAT_MIRROR_REACH = 8;

/**
 * Does a box come within `reach` (in plan) of a water surface (its geometry's cells, in world units)?
 * The cells the water covers, grown by `reach`, on a grid a metre square.
 */
function waterNear(geo: THREE.BufferGeometry, reach: number) {
  const p = geo.getAttribute('position');
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < p.count; i++) {
    x0 = Math.min(x0, p.getX(i));
    x1 = Math.max(x1, p.getX(i));
    z0 = Math.min(z0, p.getZ(i));
    z1 = Math.max(z1, p.getZ(i));
  }
  const R = Math.ceil(reach), ox = Math.floor(x0) - R, oz = Math.floor(z0) - R, W = Math.ceil(x1) + R - ox + 1, H = Math.ceil(z1) + R - oz + 1;
  const wet = new Uint8Array(W * H), grown = new Uint8Array(W * H);
  for (let i = 0; i < p.count; i++) wet[(Math.floor(p.getZ(i)) - oz) * W + (Math.floor(p.getX(i)) - ox)] = 1;
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (!wet[z * W + x]) continue;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const xx = x + dx, zz = z + dz;
      if (xx >= 0 && zz >= 0 && xx < W && zz < H && dx * dx + dz * dz <= R * R) grown[zz * W + xx] = 1;
    }
  }
  return (b: THREE.Box3) => {
    const bx0 = Math.max(0, Math.floor(b.min.x) - ox), bx1 = Math.min(W - 1, Math.floor(b.max.x) - ox), bz0 = Math.max(0, Math.floor(b.min.z) - oz), bz1 = Math.min(H - 1, Math.floor(b.max.z) - oz);
    for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) if (grown[z * W + x]) return true;
    return false;
  };
}

/**
 * Stylised animated liquids.
 * - Water: depth-tinted over a long shelf (shallows show), two layers of drifting ripples in the
 *   normal, a sky reflection tinted from the zone's sky and background (stronger at grazing
 *   angles, broken up by the ripples), glints on ripple crests, soft caustics in the shallows and
 *   a foam line where the bed meets the surface.
 * - Lava: cooled black crust plates drifting slowly, with glowing seams that widen toward the
 *   hot, deep middle; open molten patches churn in the deepest spots. Emission stays moderate so
 *   bloom shows seams, not a blown-out disc.
 */
export function fluidSurface(geo: THREE.BufferGeometry, kind: Fluid, theme: ZoneTheme, mirror: { level: number; moat: boolean } | null = null) {
  const lava = kind === Fluid.Lava;
  // (A moat's mirror draws only what stood in the world when it first drew within a few metres of
  // its water: the walls, the towers, the banks and the rock round it, never the grass carpet's
  // shells or other water, so it costs a fraction of a second view of the scene.)
  const refl = mirror ? planarReflection(mirror.level, mirror.moat ? MOAT_MIRROR_LAYER : undefined, mirror.moat ? 3 : 2, !!mirror.moat) : null;
  // The painted sky the water reflects. Mirror water (the drowned city, a moat) reflects a deep
  // dusk navy instead: a pale painted sky turned its open water milky grey from the steep camera.
  const deepHex = theme.water?.[1] ?? 0x123a52;
  const skyHigh = refl ? new THREE.Color(deepHex).lerp(new THREE.Color(theme.hemi[0]), 0.3).multiplyScalar(0.9) : new THREE.Color(theme.hemi[0]).multiplyScalar(0.75);
  const skyLow = refl ? new THREE.Color(deepHex).multiplyScalar(0.8) : new THREE.Color(theme.bg).lerp(new THREE.Color(theme.hemi[0]), 0.25);
  const uniforms = {
    uTime: { value: 0 },
    uNoise: { value: noiseTexture() },
    uShallow: { value: new THREE.Color(lava ? 0xff6a10 : (theme.water?.[0] ?? 0x3f8fa8)) },
    uDeep: { value: new THREE.Color(lava ? 0x5a0c02 : (theme.water?.[1] ?? 0x123a52)) },
    uSkyHigh: { value: skyHigh },
    uSkyLow: { value: skyLow },
    uRefl: { value: refl?.texture ?? null },
    uReflMat: { value: refl?.texMat ?? new THREE.Matrix4() },
    uReflOn: refl?.on ?? { value: 0 },
    // How strongly the mirror shows (x, plus y toward grazing angles) and how much of the water's
    // own colour tints it (z): the drowned city's still pools mirror the ruins outright; a moat seen
    // from above shows the walls and the sky in it softly, the water's colour through them.
    uReflK: { value: mirror?.moat ? new THREE.Vector3(0.32, 0.6, 0.55) : new THREE.Vector3(1, 0, 0) },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: lava ? 0.55 : 0.3, metalness: 0,
    transparent: !lava, opacity: lava ? 1 : 0.86, depthWrite: lava,
  });
  // (A surface for the screen-space effects; mirror water already shows what stands over it.)
  if (!lava) effectsWater(mat, refl ? 0 : 1);
  addPatch(mat, {
    key: lava ? 'fluid4-lava' : refl ? 'fluid4-mirror' : 'fluid4-water',
    uniforms,
    nodes(u) {
      const time = u.f('uTime'), shallow = u.v3('uShallow');
      const fluidN = (p: V2) => u.tex('uNoise').sample(p).r;
      const fluidGrad = (p: V2, e: number) => {
        const c = fluidN(p).toVar();
        return vec2(fluidN(p.add(vec2(e, 0))).sub(c), fluidN(p.add(vec2(0, e))).sub(c)).div(e);
      };
      const depth = attribute('aDepth', 'float') as F;
      const fp = positionWorld.xz;
      // Set by the colour, read by the normal and the emission.
      let q1: V2 = vec2(0), q2: V2 = vec2(0), n1: F = float(0), n2: F = float(0);
      let heat: F = float(0), seam: F = float(0), molten: F = float(0), glowNear: F = float(0);
      let rw: V3 = vec3(0), ndv: F = float(0), cover: F = float(0), mirC: V3 = vec3(0);
      return {
        color(c) {
          q1 = fp.mul(0.07).add(vec2(time.mul(0.011), time.mul(0.006))).toVar();
          q2 = fp.mul(0.23).sub(vec2(time.mul(0.021), time.mul(-0.014))).toVar();
          n1 = fluidN(q1).toVar();
          n2 = fluidN(q2).toVar();
          const ripple = n1.mul(0.6).add(n2.mul(0.4));
          if (lava) {
            // Crust plates drift and slowly deform; seams widen with depth (heat).
            const warp = vec2(fluidN(fp.mul(0.05).add(time.mul(0.004))), fluidN(fp.mul(0.05).add(0.5).sub(time.mul(0.003)))).sub(0.5);
            const cells = lavaCells(fp.mul(0.45).add(warp.mul(1.4)).add(vec2(time.mul(0.014), time.mul(0.009)))).toVar();
            heat = smoothstep(0.02, 0.6, depth.add(n1.sub(0.5).mul(0.2))).toVar();
            const gap = cells.y.sub(cells.x).toVar();
            seam = float(1).sub(smoothstep(0.015, heat.mul(0.075).add(0.035), gap)).toVar();
            glowNear = float(1).sub(smoothstep(0, heat.mul(0.2).add(0.2), gap)).toVar();
            molten = smoothstep(0.82, 0.98, heat.mul(0.45).add(n2.mul(0.65))).toVar();
            const crust = mix(vec3(0.06, 0.045, 0.042).mul(cells.z.mul(0.5).add(0.75)), vec3(0.22, 0.05, 0.015), glowNear.mul(heat).mul(0.7));
            return mix(crust, vec3(0.3, 0.08, 0.02), max(seam, molten));
          }
          // Depth colour: clear turquoise shallows (the bed shows through, see the ground's wet patch)
          // deepening to opaque blue-green.
          const deep = smoothstep(0.03, 0.72, depth.add(ripple.sub(0.5).mul(0.1)));
          // The deep is not one flat colour: broad, slowly drifting patches of a greener and a bluer
          // deep, darkest where it is deepest.
          const patchN = fluidN(fp.mul(0.016).add(vec2(time.mul(0.0015), time.mul(-0.001))));
          const dp = u.v3('uDeep');
          const deepC = mix(dp.mul(vec3(0.8, 1.1, 0.95)), dp.mul(vec3(1.05, 0.9, 1.18)), smoothstep(0.3, 0.7, patchN)).mul(float(1).sub(smoothstep(0.45, 0.72, depth).mul(0.28)));
          // Foam: a broken rim where the bank meets the water, and a second line that laps in and out a
          // little way offshore. Thin and soft: a narrow, broken lace right at the waterline, never a band.
          const n3 = fluidN(fp.mul(0.61).add(vec2(time.mul(0.05), time.mul(-0.04)))).toVar();
          const rim = float(1).sub(smoothstep(0, 0.028, depth.add(n2.sub(0.5).mul(0.03)))).mul(smoothstep(0.4, 0.62, n3.add(0.08)));
          const lap = smoothstep(0.72, 0.95, sin(time.mul(0.8).sub(depth.mul(40)).add(n1.mul(5))).mul(0.5).add(0.5));
          const band = lap.mul(float(1).sub(smoothstep(0.03, 0.1, depth))).mul(smoothstep(0.48, 0.66, n3));
          const foam = max(rim, band.mul(0.45)).toVar();
          diffuseColor.a.assign(mix(0.38, 0.94, smoothstep(0, 0.6, depth)).add(foam.mul(0.2)));
          const col = mix(mix(shallow, deepC, deep), mix(shallow, vec3(0.86, 0.92, 0.92), 0.7), foam.mul(0.55)).toVar();
          // The sky the rippled surface reflects (the emission adds it): the reflected ray in the world.
          const vdir = positionView.negate().normalize();
          ndv = saturate(dot(vdir, normalView)).toVar();
          rw = transpose(mat3(cameraViewMatrix)).mul(reflect(vdir.negate(), normalView)).toVar();
          if (refl) {
            // The mirrored scene (ruins, columns, the far shore) where there is one, rippled by the
            // swells; the painted sky everywhere else. Solid reflections read stronger than the sky's,
            // so the ruins show in the water even from the high camera.
            const flatN = normalize(mat3(cameraViewMatrix).mul(vec3(0, 1, 0)));
            const mir = u.tex('uRefl').sample(mirrorUV(u.m4('uReflMat'), positionWorld, normalView.xy.sub(flatN.xy).mul(0.45))).toVar();
            const k = u.v3('uReflK');
            cover = saturate(mir.a).mul(u.f('uReflOn')).mul(min(1, k.x.add(k.y.mul(pow(float(1).sub(ndv), 3))))).toVar();
            mirC = mir.rgb.mul(mix(vec3(1), shallow.mul(1.6), k.z)).toVar();
            col.mulAssign(float(1).sub(cover.mul(0.78)));
          }
          return col;
        },
        normal(n) {
          // Water: long swells, a cross-chop and fine wind ripples; lava: a slow heave.
          let g = fluidGrad(q1, 0.01).mul(lava ? 0 : 0.006).add(fluidGrad(q2, 0.01).mul(lava ? 0.002 : 0.004));
          if (!lava) {
            // Gentle swells rolling across the surface (their crests wander with the noise), under a
            // faint wind chop.
            const swD = vec2(0.8, 0.6);
            const swPh = dot(fp, swD).mul(0.7).sub(time.mul(0.85)).add(n1.mul(4));
            g = g.add(swD.mul(cos(swPh).mul(0.045).mul(n2.mul(0.45).add(0.55)))).add(fluidGrad(fp.mul(0.7).add(vec2(time.mul(0.06), time.mul(0.045))), 0.01).mul(0.0015));
          }
          const gv = mat3(cameraViewMatrix).mul(vec3(g.x, 0, g.y)).toVar();
          return normalize(n.sub(gv).add(n.mul(dot(gv, n))));
        },
        emissive(e) {
          if (lava) {
            const hot = mix(vec3(1.2, 0.3, 0.04), vec3(1.5, 0.6, 0.12), heat);
            const pulse = sin(time.mul(1.3).add(fp.x.mul(0.3)).add(fp.y.mul(0.2))).mul(0.15).add(0.85);
            return e.add(max(hot.mul(seam), vec3(1.25, 0.34, 0.05).mul(molten.mul(n2.mul(0.3).add(0.6)))).mul(pulse)).add(vec3(0.3, 0.05, 0.005).mul(glowNear.mul(heat).mul(0.35)));
          }
          // Sky reflection: the reflected ray picks a colour from a sky gradient, so ripples show as
          // moving light and dark bands; stronger toward grazing angles.
          const sky = mix(u.v3('uSkyLow'), u.v3('uSkyHigh'), smoothstep(-0.1, 0.9, rw.y).mul(smoothstep(0.3, -0.6, rw.z).mul(0.25).add(0.75)));
          // Drifting cloud shadows in the reflection keep open water from reading as one flat sheet.
          const cloud = smoothstep(0.35, 0.75, fluidN(rw.xz.div(max(rw.y, 0.25)).mul(0.05).add(fp.mul(0.012)).add(vec2(time.mul(0.004), 0))));
          const fres = pow(float(1).sub(ndv), 4).mul(0.9).add(0.1);
          let envC = sky.mul(cloud.mul(0.35).add(0.8)).mul(fres);
          let out = e;
          if (refl) {
            envC = mix(envC, mirC.mul(pow(float(1).sub(ndv), 2).mul(0.25).add(0.95)), cover);
            // Caustic shimmer in the shallows: a drifting web of light over the drowned paving.
            const ca = fluidN(fp.mul(0.55).add(vec2(time.mul(0.035), time.mul(0.013))));
            const cb = fluidN(fp.mul(0.73).add(vec2(0.37, 0.61)).sub(vec2(time.mul(0.015), time.mul(0.03))));
            const caus = pow(float(1).sub(abs(ca.mul(2).sub(1))).mul(float(1).sub(abs(cb.mul(2).sub(1)))), 4);
            const shoal = float(1).sub(smoothstep(0.06, 0.5, depth));
            out = out.add(vec3(0.5, 0.95, 0.85).mul(caus.mul(shoal).mul(float(1).sub(cover.mul(0.7))).mul(0.55)));
          }
          out = out.add(envC.mul(smoothstep(0, 0.5, depth).mul(0.45).add(0.55)));
          // Sun glints: a sun low ahead of the camera, reflected by the ripple normals, so a path of
          // sparkles flickers on the crests (HDR: they bloom). Two samples at unrelated scales and angles
          // multiplied, so the sparkles never line up on the noise lattice.
          const sd = max(dot(normalize(rw), SUN_GLINT), 0).toVar();
          const spec = pow(sd, 400);
          const twinkle = smoothstep(0.42, 0.62, fluidN(fp.mul(1.13).add(vec2(time.mul(0.11), time.mul(-0.07)))).mul(fluidN(rot2(fp, 0.8, 0.6, -0.6, 0.8).mul(1.71).sub(vec2(time.mul(0.05), time.mul(0.09))))));
          // (Capped, so a glint never burns the surface out to white.)
          return out.add(vec3(1.0, 0.96, 0.86).mul(min(spec.mul(twinkle).mul(0.9).add(pow(sd, 18).mul(0.05)), 0.45)));
        },
      };
    },
  });

  const mesh = new THREE.Mesh(geo, mat);
  if (refl) {
    let layered = !mirror?.moat;
    mesh.onBeforeRender = (renderer, scene, camera) => {
      if (!layered) {
        layered = true;
        const near = waterNear(geo, MOAT_MIRROR_REACH), box = new THREE.Box3();
        scene.traverse((o) => {
          if (!(o as THREE.Mesh).isMesh || (o as THREE.InstancedMesh).isInstancedMesh || o.name === 'water') return;
          box.setFromObject(o);
          if (box.max.y > mirror!.level && near(box)) o.layers.enable(MOAT_MIRROR_LAYER);
        });
      }
      refl.render(renderer, scene, camera, mesh);
    };
    mat.addEventListener('dispose', () => refl.dispose());
  }
  mesh.name = lava ? 'lava' : 'water';
  mesh.receiveShadow = !lava;
  mesh.renderOrder = 1;
  return { mesh, tick: (t: number) => (uniforms.uTime.value = t) };
}

/** A hash of a cell to two values in 0..1. */
const lavaHash = (p: V2) => sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))).mul(43758.5453).fract();

/** Cellular noise: x = distance to the nearest cell, y = to the second nearest, z = the nearest cell's id. */
function lavaCells(p: V2): V3 {
  const i = p.floor().toVar(), f = p.fract().toVar();
  const f1 = float(8).toVar(), f2 = float(8).toVar(), id = float(0).toVar();
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const o = vec2(x, y);
    const h = lavaHash(i.add(o)).toVar();
    const d = length(o.add(0.15).add(h.mul(0.7)).sub(f)).toVar();
    If(d.lessThan(f1), () => {
      f2.assign(f1);
      f1.assign(d);
      id.assign(h.x);
    }).ElseIf(d.lessThan(f2), () => {
      f2.assign(d);
    });
  }
  return vec3(f1, f2, id);
}
