import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import type { Game } from '../game';
import { steadyShadowPass, steadyShadows } from '../render/env';
import { hazeFog } from '../render/light';
import { installPatchedMaterials } from '../render/patch';
import type { Graphics } from '../save/save';
import { LAWN_SHELLS, setLawnShells } from '../world/lawn';

/** WebGPU where the machine has it, else WebGL 2 (the renderer falls back by itself). */
export function createRenderer(canvas: HTMLCanvasElement): WebGPURenderer {
  // (Multisampling is the post chain's: the canvas only shows its finished frame. Development
  // builds time the GPU's passes, for the inspect harness's frame costs.)
  const renderer = new WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance', trackTimestamp: import.meta.env.DEV });
  installPatchedMaterials(renderer);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  return renderer;
}

/** The scene's haze, the sun and its shadows, the sky and fill lights, and the always-present objects. */
export function dressScene(g: Game) {
  g.scene.fog = new THREE.Fog(0x2c2630, 38, 85);
  Object.assign(g.scene, { fogNode: hazeFog(g.scene, g.sun) });
  Object.assign(g.sun.shadow, { filterNode: steadyShadows });
  steadyShadowPass();
  g.scene.add(g.hemi);
  // The shadow camera, its filter and its biases are fitted to the view every frame (see ViewLight.fit).
  g.sun.castShadow = true;
  g.sun.shadow.mapSize.set(4096, 4096);
  g.fill.target = g.sun.target;
  g.scene.add(g.sun, g.sun.target, g.fill, g.particles.mesh, g.glow.mesh, g.player.obj);
}

/**
 * Quality presets. High: up to 2× pixel ratio, 4× MSAA, 4096 shadows, ambient occlusion, bloom.
 * Medium: 1.5×, MSAA, 2048 shadows, occlusion, bloom. Low: 1× (no supersampling on HiDPI), no
 * MSAA, 1024 shadows, no occlusion, no bloom — for integrated GPUs. The lawn draws 8, 6 or 4 shells.
 * The lighting effects switched on in the settings (none by default) are worked as finely as the
 * preset allows.
 */
export function applyGraphics(g: Game, level: Graphics) {
  const p = {
    high: { ratio: 2, msaa: 4, shadow: 4096, bloom: true, ao: true },
    medium: { ratio: 1.5, msaa: 4, shadow: 2048, bloom: true, ao: true },
    low: { ratio: 1, msaa: 0, shadow: 1024, bloom: false, ao: false },
  }[level];
  g.renderer.setPixelRatio(Math.min(window.devicePixelRatio, p.ratio));
  // (Without occlusion the low preset skips the whole pass and its grade.)
  g.post.setQuality({ msaa: p.msaa, shade: p.ao, bloom: p.bloom, effects: g.save.settings.lighting, level });
  setLawnShells(LAWN_SHELLS[level]);
  // (The renderer resizes the shadow map to match on its next draw.)
  g.sun.shadow.mapSize.set(p.shadow, p.shadow);
  resize(g);
}

/** Fit the canvas and the camera to the window. */
export function resize(g: Game) {
  const w = window.innerWidth, h = window.innerHeight;
  g.renderer.setSize(w, h, false);
  g.camera.aspect = w / h;
  g.camera.updateProjectionMatrix();
}
