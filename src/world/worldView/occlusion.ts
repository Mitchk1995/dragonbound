import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import { abs, cross, Discard, dot, float, If, length, max, min, normalize, positionWorld, renderGroup, select, smoothstep, uniform, vec2, vec3 } from 'three/tsl';
import type { F } from '../../render/patch';
import { addPatch } from '../../render/surface';

// ─── See-through occlusion ──────────────────────────────────────────────────

/** Shared uniforms: the game updates these every frame with the camera and player positions (read once per render). */
export const OCCLUDE = {
  uOccPlayer: uniform(new THREE.Vector3()).setGroup(renderGroup),
  uOccCam: uniform(new THREE.Vector3()).setGroup(renderGroup),
  uOccRadius: uniform(0.16).setGroup(renderGroup),
  /** 1 during gameplay; 0 on the title/creation screens where nothing should be cut away. */
  uOccOn: uniform(0).setGroup(renderGroup),
  /** Direction toward the sun (game.ts keeps the sun at this offset from the hero). */
  uOccSun: uniform(new THREE.Vector3(14, 28, 10).normalize()).setGroup(renderGroup),
};

/**
 * The cut-away round the hero at the fragment's world position: whether it stands where the window
 * applies (`inside`) and its signed distance to the window's rounded rectangle (`sd`, negative inside).
 * In the shadow pass (`shadow`) the test follows the sun ray down to the ground: a part whose shadow
 * would land in the opening (in front of the hero) casts none, so the ground seen through the cut is
 * never smeared with the shadow of what was cut away.
 */
function occlusion(shadow: boolean) {
  const O = OCCLUDE, world = positionWorld;
  const target = O.uOccPlayer.add(vec3(0, 1, 0));
  const toP = target.sub(O.uOccCam);
  const lenP = length(toP);
  const dirP = toP.div(lenP);
  let toF = world.sub(O.uOccCam);
  let inside;
  if (shadow) {
    const lift = world.y.sub(O.uOccPlayer.y);
    toF = world.sub(O.uOccSun.mul(lift.div(max(O.uOccSun.y, 0.05)))).sub(O.uOccCam);
    const along = dot(toF, dirP);
    const feet = dot(O.uOccPlayer.sub(O.uOccCam), dirP);
    inside = O.uOccOn.greaterThan(0.5).and(lift.greaterThan(0.1)).and(along.greaterThan(0.5)).and(along.lessThan(feet.add(0.3)));
  } else {
    const along = dot(toF, dirP);
    inside = O.uOccOn.greaterThan(0.5).and(along.greaterThan(0.5)).and(along.lessThan(lenP.sub(0.8))).and(world.y.greaterThan(O.uOccPlayer.y.add(0.08)));
  }
  // The fragment's offset from the hero as it appears on screen, in metres at the hero's distance
  // (across and up the screen), tested against the rounded rectangle.
  const along = dot(toF, dirP);
  const occRight = normalize(cross(dirP, vec3(0, 1, 0)));
  const occUp = cross(occRight, dirP);
  const k = lenP.div(along);
  const q = vec2(dot(toF, occRight).mul(k), dot(toF, occUp).mul(k).sub(0.7));
  const hb = vec2(1.45, 2.6).mul(O.uOccRadius.div(0.16));
  const cr = 0.9;
  const dq = abs(q).sub(hb).add(cr);
  const sd = length(max(dq, 0)).add(min(max(dq.x, dq.y), 0)).sub(cr);
  return { inside, sd };
}

/** How far the window's edge feathers out (metres): a clean cut-away down to a low stub. */
const FEATHER = 0.7;

/**
 * Shadow-pass mask with the same cut-away (see makeOccludable): false where a caster is cut away.
 * It belongs to the material, so anything else wearing a cut-away material loses its shadow in the
 * window too, as it already loses its body there.
 */
const occludedShadow = (() => {
  const { inside, sd } = occlusion(true);
  return inside.and(sd.lessThan(-FEATHER)).not();
})();

/**
 * Patch a material so fragments between the camera and the player, inside a soft upright window
 * round the hero (a rounded rectangle on screen, a little wider than the hero and as tall as them
 * with room over their head, reaching down to their feet), are cut away; the rest of the wall stays
 * solid. Its edges feather out over half a metre through alpha-to-coverage, so with multisampling
 * the window fades softly into the wall instead of ending on a hard or stippled edge. Trees and
 * walls never hide the hero.
 */
export function makeOccludable(mat: THREE.Material) {
  if (!mat.transparent) mat.alphaToCoverage = true;
  addPatch(mat, {
    key: 'occlude',
    slot: 'occlude',
    nodes() {
      let fade: F = float(1);
      return {
        discard() {
          const { inside, sd } = occlusion(false);
          If(inside.and(sd.lessThan(-FEATHER)), () => {
            Discard();
          });
          fade = select(inside, smoothstep(-FEATHER, 0, sd), float(1)).toVar();
        },
        alpha: (a) => a.mul(fade),
      };
    },
  });
}

/** Make every material under an object cut away between the camera and the hero (shadows too). */
export function occludeAll(root: THREE.Object3D) {
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
    if (o.castShadow && !mats.some((m) => m instanceof NodeMaterial)) for (const m of mats) Object.assign(m, { maskShadowNode: occludedShadow });
    for (const m of mats) {
      if (seen.has(m) || m instanceof NodeMaterial || m.userData.noOcclude) continue;
      seen.add(m);
      makeOccludable(m);
    }
  });
}
