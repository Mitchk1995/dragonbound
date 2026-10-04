import * as THREE from 'three';
import type { Game } from '../game';
import { frames, goblinCamp, raf } from './inspectCommon';

export interface LumStats { mean: number; p5: number; p95: number; clipped: number; crushed: number; cast: [number, number, number] }
/** frameMs = max(cpu, gpu): the frame cost ignoring vsync. */
export interface PerfStats { cpuMs: number; gpuMs: number; gpuP95: number; frameMs: number; gpuRaw?: number[]; cpuRaw?: number[] }

/** Brightness statistics of the frame just drawn (read in the same task, while the canvas holds it). */
export function lumStats(g: Game): LumStats {
  const cv = g.renderer.domElement, w = cv.width, h = cv.height;
  const copy = document.createElement('canvas');
  copy.width = w;
  copy.height = h;
  const ctx = copy.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(cv, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;
  const hist = new Uint32Array(256);
  let n = 0, clipped = 0, crushed = 0, r = 0, gg = 0, b = 0;
  for (let i = 0; i < px.length; i += 4 * 7) {
    const l = Math.round(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
    hist[l]++;
    n++;
    if (px[i] > 250 || px[i + 1] > 250 || px[i + 2] > 250) clipped++;
    if (l < 8) crushed++;
    r += px[i];
    gg += px[i + 1];
    b += px[i + 2];
  }
  const pct = (q: number) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) if ((acc += hist[i]) >= n * q) return i;
    return 255;
  };
  let mean = 0;
  for (let i = 0; i < 256; i++) mean += i * hist[i];
  const avg = (r + gg + b) / 3 || 1;
  return {
    mean: +(mean / n).toFixed(1), p5: pct(0.05), p95: pct(0.95),
    clipped: +((clipped / n) * 100).toFixed(2), crushed: +((crushed / n) * 100).toFixed(2),
    cast: [+(r / avg).toFixed(2), +(gg / avg).toFixed(2), +(b / avg).toFixed(2)],
  };
}

/**
 * Frame cost with the world frozen (dt = 0, every system still runs its per-frame work):
 * - cpuMs: update + render submission on the CPU;
 * - gpuMs: GPU time of the whole render (the renderer's timestamp queries, every pass of the frame),
 *   the real render cost.
 * Wall-clock with a readback sync is NOT used: it quantises to the display's vsync period.
 * `render` replaces update + draw (a free camera that the game's own update would move).
 */
export async function perf(g: Game, n = 60, render?: () => void): Promise<PerfStats> {
  const r = g.renderer;
  const cpu: number[] = [], gpu: number[] = [];
  // Only our frames may touch the GPU while measuring (the frame loop would interleave its own).
  const held = g.debug.hold;
  g.debug.hold = () => true;
  // (Drop whatever was timed before the first measured frame.)
  await r.resolveTimestampsAsync('render');
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    if (render) render();
    else {
      g.update(0, 1 / 60);
      g.draw();
    }
    cpu.push(performance.now() - t0);
    const ms = await r.resolveTimestampsAsync('render');
    if (ms) gpu.push(ms);
    await raf(); // one measured frame per display frame, like the game
  }
  g.debug.hold = held;
  const med = (x: number[]) => (x.length ? x.slice().sort((p, q) => p - q)[Math.floor(x.length / 2)] : NaN);
  const p95 = (x: number[]) => (x.length ? x.slice().sort((p, q) => p - q)[Math.floor(x.length * 0.95)] : NaN);
  return { cpuMs: +med(cpu).toFixed(2), gpuMs: +med(gpu).toFixed(2), gpuP95: +p95(gpu).toFixed(2), frameMs: +Math.max(med(cpu), med(gpu)).toFixed(2), gpuRaw: gpu.map((v) => +v.toFixed(1)), cpuRaw: cpu.map((v) => +v.toFixed(1)) } as PerfStats;
}

// ─── Perf breakdown ─────────────────────────────────────────────────────────

/**
 * Where does the frame go? At a heavy spot, measure the frame with each feature switched off in
 * turn (explicit suite: `npm run inspect -- perf`). Differences from the baseline are the cost.
 */
export async function perfSuite(g: Game) {
  const out: Record<string, Record<string, string>> = {};
  for (const which of [1, 0, 3]) {
    const zone = 'foothills';
    g.travel(zone, true);
    await frames(20);
    const { x, z } = goblinCamp(g, which, 4);
    const p = g.player;
    p.pos.set(x, 0, z);
    g.camPos.copy(p.pos);
    g.debug.timeScale = 0;
    const game = g as any;
    const byName = (test: (o: THREE.Object3D) => boolean) => {
      const list: THREE.Object3D[] = [];
      g.zone.group.traverse((o) => {
        if (test(o)) list.push(o);
      });
      return list;
    };
    const toggles: [string, () => () => void][] = [
      // (The shadow map stops being drawn; switching castShadow off would leave built programs holding a disposed map.)
      ['no shadow pass', () => {
        g.sun.shadow.autoUpdate = false;
        return () => (g.sun.shadow.autoUpdate = true);
      }],
      ['no bloom', () => {
        g.post.setQuality({ msaa: 4, shade: true, bloom: false });
        return () => g.post.setQuality({ msaa: 4, shade: true, bloom: true });
      }],
      ['no vegetation', () => {
        const l = byName((o) => o instanceof THREE.InstancedMesh);
        l.forEach((o) => (o.visible = false));
        return () => l.forEach((o) => (o.visible = true));
      }],
      ['no terrain', () => {
        const l = byName((o) => o.name === 'ground' || o.name === 'relief');
        l.forEach((o) => (o.visible = false));
        return () => l.forEach((o) => (o.visible = true));
      }],
      ['no enemies', () => {
        g.zone.enemies.forEach((e) => (e.obj.visible = false));
        return () => g.zone.enemies.forEach((e) => (e.obj.visible = true));
      }],
      ['no water', () => {
        const l = byName((o) => o.name === 'water' || o.name === 'lava');
        l.forEach((o) => (o.visible = false));
        return () => l.forEach((o) => (o.visible = true));
      }],
      ['no props', () => {
        const l = g.zone.view.props.map((p) => p.obj);
        l.forEach((o) => (o.visible = false));
        return () => l.forEach((o) => (o.visible = true));
      }],
      ['no lights', () => {
        const l = byName((o) => o instanceof THREE.PointLight);
        l.forEach((o) => (o.visible = false));
        return () => l.forEach((o) => (o.visible = true));
      }],
      ['no MSAA', () => {
        g.post.setQuality({ msaa: 0, shade: true, bloom: true });
        return () => g.post.setQuality({ msaa: 4, shade: true, bloom: true });
      }],

    ];
    const row: Record<string, string> = {};
    await perf(g, 20); // warm up programs
    const fmt = (p: PerfStats) => `cpu ${p.cpuMs} gpu ${p.gpuMs}`;
    row.baseline = fmt(await perf(g, 60));
    for (const [name, off] of toggles) {
      const undo = off();
      await perf(g, 10);
      row[name] = fmt(await perf(g, 60));
      undo();
    }
    out[`${zone}@${x},${z}`] = row;
    g.debug.timeScale = 1;
  }
  return out;
}
