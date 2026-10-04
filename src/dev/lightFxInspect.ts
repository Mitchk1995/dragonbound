import * as THREE from 'three';
import type { Game } from '../game';
import type { LightingEffects } from '../render/post';
import { OCCLUDE } from '../world/worldView';
import { perf } from './inspect';

type Shot = (name: string) => Promise<void>;

/** A view the effects are judged in: set the scene up, then pose the camera for each frame. */
export interface FxView {
  name: string;
  /** Builds the view (travel, placing the hero); returns what undoes it. */
  enter(g: Game): Promise<() => void>;
  /** Poses the camera for one frame (and anything else the frame needs held). */
  pose(g: Game): void;
}

/** Each effect alone, all four together, and none (the frame as the game draws it today). */
export const FX_CONFIGS: [string, Partial<LightingEffects>][] = [
  ['off', {}],
  ['bounce', { bounce: true }],
  ['contact', { contact: true }],
  ['reflections', { reflections: true }],
  ['smooth', { smooth: true }],
  ['all', { bounce: true, contact: true, reflections: true, smooth: true }],
];

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** The hero standing still at (x, z) on the ground, facing `face`. */
function standHero(g: Game, x: number, z: number, face: number) {
  const at = g.zone.nav.nearestWalkable(x, z) ?? { x, z };
  const p = g.player;
  p.pos.set(at.x, g.zone.groundY(at.x, at.z), at.z);
  p.stop();
  p.facing = p.targetFacing = face;
  p.obj.position.copy(p.pos);
  p.obj.rotation.y = face;
  p.obj.visible = true;
}

/** The play camera on the hero at `zoom` (as the game frames him, held still). */
function playCamera(g: Game, zoom: number) {
  const p = g.player.pos;
  g.camPos.copy(p);
  g.camZoom = zoom;
  g.camera.position.set(p.x, p.y + 21 * zoom, p.z + 14 * zoom);
  g.camera.lookAt(p.x, p.y + 1, p.z);
  OCCLUDE.uOccOn.value = 1;
  OCCLUDE.uOccPlayer.value.copy(p);
  OCCLUDE.uOccCam.value.copy(g.camera.position);
}

/** A free camera at `eye` looking at `look` (nothing cut away). */
function freeCamera(g: Game, eye: THREE.Vector3, look: THREE.Vector3, fov = 42) {
  if (g.camera.fov !== fov) {
    g.camera.fov = fov;
    g.camera.updateProjectionMatrix();
  }
  g.camera.position.copy(eye);
  g.camera.lookAt(look);
  OCCLUDE.uOccOn.value = 0;
}

/**
 * The views on main: the Foothills river through the play camera (water, trees, open ground in
 * sun), the keep's great hall seen from its door at the hero's eye height (an interior lit through
 * its doorway and windows), and the hero close up in the sun on the keep's plaza.
 */
export const FX_VIEWS: FxView[] = [
  {
    name: 'river',
    async enter(g) {
      g.travel('foothills', true);
      await new Promise((r) => setTimeout(r, 400));
      standHero(g, 100, 124, Math.PI);
      return () => {};
    },
    pose: (g) => playCamera(g, 1.25),
  },
  {
    // The same river with the hero walking along the bank and the camera following him: how the
    // smoothing holds up in motion (what it blends from the last frame must not smear or trail).
    name: 'walk',
    async enter(g) {
      g.travel('foothills', true);
      await new Promise((r) => setTimeout(r, 400));
      standHero(g, 92, 124, Math.PI / 2);
      g.camPos.copy(g.player.pos);
      g.camZoom = 1.25;
      return () => g.player.stop();
    },
    pose(g) {
      const p = g.player;
      if (p.cmd.kind === 'none') p.moveTo(g, p.pos.x < 100 ? 110 : 90, 124);
      g.update(1 / 60);
    },
  },
  {
    // The castle's fountain court through the play camera: the heaviest view to draw, for the costs.
    name: 'castle',
    async enter(g) {
      g.travel('keep', true);
      await new Promise((r) => setTimeout(r, 400));
      const { CASTLE_PLAN } = await import('../data/zoneMaps');
      standHero(g, CASTLE_PLAN.fountain.x, CASTLE_PLAN.fountain.z + 6.2, Math.PI);
      return () => {};
    },
    pose: (g) => playCamera(g, 1.2),
  },
  {
    name: 'hero',
    async enter(g) {
      g.travel('keep', true);
      await new Promise((r) => setTimeout(r, 400));
      const { KEEP_STAGE } = await import('../data/zones');
      standHero(g, KEEP_STAGE.x, KEEP_STAGE.z, 0.5);
      return () => {};
    },
    pose(g) {
      const p = g.player.pos;
      freeCamera(g, new THREE.Vector3(p.x + 2.2, p.y + 2.4, p.z + 4.4), new THREE.Vector3(p.x, p.y + 1.1, p.z), 40);
    },
  },
];

/** The effects' own buffers, for tuning (`lightfx:buffers`): each with the effect it belongs to on. */
const BUFFERS: [string, Partial<LightingEffects>][] = [
  ['ao', { contact: true, smooth: true }], ['gi', { bounce: true, smooth: true }],
  ['reflection', { reflections: true }], ['normal', { contact: true }], ['motion', { smooth: true }],
];

/**
 * Dev-only (`npm run inspect -- lightfx`, or `lightfx:river+hero` for some views, `lightfx:river+off+all`
 * for some configs too): every view with the lighting effects off, each alone and all four together,
 * captured (`lfx-<view>-<config>`) after the smoothing has settled, with each one's frame cost (CPU and
 * GPU milliseconds, medians). `lightfx:buffers` captures the effects' own buffers instead
 * (`lfxbuf-<view>-<buffer>`), and `lightfx:cost` measures each config's cost in interleaved rounds (the
 * machine's other work falls on all alike), with no pictures.
 */
export async function lightFxSuite(g: Game, shot: Shot, only: string[], views: FxView[] = FX_VIEWS) {
  const out: Record<string, Record<string, unknown>> = {};
  const lighting = g.save.settings.lighting;
  const fov = g.camera.fov;
  const buffers = only.includes('buffers'), cost = only.includes('cost');
  const picked = FX_CONFIGS.filter(([n]) => only.includes(n));
  const configs = picked.length ? picked : FX_CONFIGS;
  const names = only.filter((n) => n !== 'buffers' && n !== 'cost' && !FX_CONFIGS.some(([c]) => c === n));
  document.body.classList.add('inspect-clean');
  try {
    for (const view of views.filter((v) => !names.length || names.includes(v.name))) {
      g.setLighting({});
      const leave = await view.enter(g);
      g.debug.timeScale = 0;
      const render = () => {
        view.pose(g);
        g.draw();
      };
      const settle = async (n: number) => {
        for (let i = 0; i < n; i++) {
          render();
          await raf();
        }
      };
      g.debug.hold = () => (render(), true);
      const row: Record<string, unknown> = {};
      try {
        if (buffers) {
          for (const [name, fx] of BUFFERS) {
            g.setLighting(fx);
            g.post.showBuffer(name);
            await settle(70);
            await shot(`lfxbuf-${view.name}-${name}`);
          }
          g.post.showBuffer(null);
        } else if (cost) {
          // Medians of five interleaved rounds of 30 frames each, every config built once first.
          const runs: Record<string, { cpu: number[]; gpu: number[] }> = {};
          for (const [name, fx] of configs) {
            g.setLighting(fx);
            await settle(40);
            runs[name] = { cpu: [], gpu: [] };
          }
          for (let round = 0; round < 5; round++) for (const [name, fx] of configs) {
            g.setLighting(fx);
            await settle(15);
            const p = await perf(g, 30, render);
            runs[name].cpu.push(...(p.cpuRaw ?? []));
            runs[name].gpu.push(...(p.gpuRaw ?? []));
          }
          const med = (x: number[]) => (x.length ? +x.slice().sort((a, b) => a - b)[Math.floor(x.length / 2)].toFixed(2) : null);
          for (const [name, r] of Object.entries(runs)) row[name] = { cpu: med(r.cpu), gpu: med(r.gpu) };
        } else {
          for (const [name, fx] of configs) {
            g.setLighting(fx);
            // (New programs build, then the smoothing and the effects' turning grain settle over the frames.)
            await settle(70);
            row[name] = await perf(g, 40, render);
            await shot(`lfx-${view.name}-${name}`);
          }
        }
      } finally {
        g.debug.hold = null;
        g.post.showBuffer(null);
        leave();
      }
      out[view.name] = row;
    }
  } finally {
    g.setLighting(lighting ?? {});
    g.camera.fov = fov;
    g.camera.updateProjectionMatrix();
    g.debug.timeScale = 1;
    document.body.classList.remove('inspect-clean');
  }
  return out;
}
