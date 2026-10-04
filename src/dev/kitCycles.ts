import type { Game } from '../game';
import { buildBakery } from '../world/kit/house';
import { loadKitSurfaces } from '../world/kit/surfaces';
import { KitView } from '../world/kit/view';
import { OCCLUDE } from '../world/worldView';
import { houseColour, testLot } from './kitStreet';

const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
};

/**
 * Streets of kit houses drawn and freed over and over (explicit suite: `kit:cycles`), as the hub
 * layouts do between options: one house stays drawn throughout (as the bakery stays in the hub) while
 * each round draws the paving and two streets for a few frames and frees them one after another.
 * The GPU must report no errors: a freed street must never take buffers another view still draws.
 * Run twice: with the streets casting no shadows, every round from the third on must end with the
 * same GPU buffers alive, and the same geometries, textures and shader programs, as the one before
 * (the kit frees all it owns); with shadows as drawn, the growth per round is reported (the renderer
 * keeps an instanced shadow caster's matrix buffer, src/render/patch.ts, whoever draws it).
 */
export async function kitCycles(g: Game) {
  g.travel('keep', true);
  await new Promise((r) => setTimeout(r, 400));
  await loadKitSurfaces();
  g.debug.timeScale = 0;
  const build = buildBakery(), { corner, copies, paving, middle } = testLot(g, g.player.pos.clone());
  const look = corner.clone().add(middle), errors: string[] = [];
  const onError = g.renderer.onError;
  // (Typed as a message; the renderer passes an object with the message on it.)
  g.renderer.onError = (info) => {
    errors.push(String((info as unknown as { message?: string }).message ?? info));
    onError.call(g.renderer, info);
  };
  // Every GPU buffer made and not yet destroyed, and its size: what the GPU really holds.
  const device = (g.renderer.backend as { device?: GPUDevice }).device;
  const live = new Map<GPUBuffer, number>();
  const create = device?.createBuffer;
  if (device && create) {
    device.createBuffer = (desc: GPUBufferDescriptor) => {
      const buf = create.call(device, desc), destroy = buf.destroy;
      live.set(buf, desc.size);
      buf.destroy = () => {
        live.delete(buf);
        destroy.call(buf);
      };
      return buf;
    };
  }
  g.debug.hold = () => {
    g.camera.position.set(look.x, look.y + 30, look.z + 20);
    g.camera.lookAt(look);
    OCCLUDE.uOccOn.value = 0;
    g.draw();
    return true;
  };
  const sample = () => {
    const m = g.renderer.info.memory;
    let bytes = 0;
    for (const s of live.values()) bytes += s;
    return { gpuBuffers: live.size, gpuKB: Math.round(bytes / 1024), geometries: m.geometries, textures: m.textures, programs: m.programs };
  };
  const cycle = async (shadows: boolean) => {
    const rounds: ReturnType<typeof sample>[] = [];
    for (let round = 0; round < 6; round++) {
      const views = [new KitView(paving), new KitView(build, copies.slice(1)), new KitView(build, copies.slice(8))];
      views[1].recolor((p, k) => houseColour(p.color, k + round));
      for (const v of views) {
        if (!shadows) v.group.traverse((o) => (o.castShadow = false));
        v.group.position.copy(corner);
        g.scene.add(v.group);
      }
      await frames(4);
      // One street freed while the other, the paving and the kept house go on being drawn.
      views[1].dispose();
      await frames(3);
      views[0].dispose();
      views[2].dispose();
      await frames(4);
      rounds.push(sample());
    }
    // (The first two rounds warm the renderer's caches.)
    const steady = rounds.slice(2);
    return { flat: steady.every((r) => JSON.stringify(r) === JSON.stringify(steady[0])), perRound: { buffers: (steady[3].gpuBuffers - steady[0].gpuBuffers) / 3, kB: (steady[3].gpuKB - steady[0].gpuKB) / 3 }, rounds };
  };
  let out;
  try {
    const keep = new KitView(build, [copies[0]]);
    keep.group.position.copy(corner);
    g.scene.add(keep.group);
    const noShadows = await cycle(false), shadows = await cycle(true);
    keep.dispose();
    await frames(4);
    await device?.queue.onSubmittedWorkDone();
    await frames(2);
    out = { gpuErrors: errors.length, firstError: errors[0] ?? null, noShadows, shadows, after: sample() };
  } finally {
    g.debug.hold = null;
    g.renderer.onError = onError;
    if (device && create) device.createBuffer = create;
    g.debug.timeScale = 1;
  }
  if (errors.length) console.error(`kit cycles: the GPU reported ${errors.length} errors, first: ${errors[0]}`);
  if (!out.noShadows.flat) console.error(`kit cycles: what the views own grew from round to round: ${JSON.stringify(out.noShadows.rounds)}`);
  return out;
}
