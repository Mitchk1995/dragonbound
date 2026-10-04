import * as THREE from 'three';
import type { Game } from '../game';
import { ZONES } from '../data/zones';
import { applyKitRock } from '../render/rockMaterial';
import { loadRocks, ROCK_KIT, rockGeometry, type RockName } from '../render/rockModels';
import { buildProp } from '../world/props';
import { ROCK_STYLE, rockLook } from '../world/worldView/kitRocks';
import { OCCLUDE } from '../world/worldView';
import { frames, freeShot, gameplayCamera, hideEnemies, measure, openField, overlay, type Shot } from './treeLineup/stage';

/**
 * Dev only (inspect suite `rocks`): the rock kit (render/rockModels.ts) in the real game renderer with the game's
 * light. `rocks:kit` lines up every rock of the kit on open ground (boulders and stones, slabs and masses, the cliff
 * modules) through the gameplay camera, closer, and low from the side; `rocks:ore` the five ore rocks, full and mined
 * out; `rocks:zones` the rockiest views of each zone with the old block rocks and then the kit (the same view twice,
 * the first also low from the side), with each one's frame cost and draw counts (report.json `rocks`). `rocks` runs
 * all three.
 */
export async function rocksSuite(g: Game, shot: Shot, suites: string) {
  const arg = suites.split(',').find((s) => s === 'rocks' || s.startsWith('rocks:'))!;
  const parts = arg === 'rocks' ? ['kit', 'ore', 'zones'] : arg.slice(6).split('+');
  const report: Record<string, unknown> = {};
  if (parts.includes('kit')) await kitLineup(g, shot);
  if (parts.includes('ore')) await oreLineup(g, shot);
  if (parts.includes('zones')) report.zones = await zoneViews(g, shot);
  g.debug.hold = null;
  g.debug.timeScale = 1;
  g.camZoom = 1;
  return report;
}

/** The low side angle the checks take beside the play camera's (from the south-east, a little above the rocks). */
const LOW = new THREE.Vector3(0.5, 0.35, 0.8).normalize();

/** An empty stretch of the Foothills' meadow for a lineup: enemies, trees and bushes put away. */
async function stage(g: Game, r: number) {
  ROCK_STYLE.blocks = false;
  g.travel('foothills', true);
  await frames(20);
  hideEnemies(g);
  g.zone.group.traverse((o) => {
    if (o.name === 'tree' || o.name === 'bush') o.visible = false;
  });
  const c = openField(g, r);
  const group = new THREE.Group();
  g.zone.group.add(group);
  g.debug.timeScale = 0;
  document.body.classList.add('inspect-clean');
  return { c, group, y: g.zone.view.heightAt(c.x, c.z) };
}

/** Rocks in a row along x at `z`, `gap` apart past their own widths; each placed on the ground, turned a little. */
function row(g: Game, group: THREE.Group, names: readonly RockName[], x0: number, z: number, gap: number, make: (n: RockName) => THREE.Material, scale = (_: RockName) => 1) {
  const hAt = g.zone.view.heightAt, out: { name: RockName; at: THREE.Vector3 }[] = [];
  const widths = names.map((n) => rockGeometry(n)!.boundingBox!.getSize(new THREE.Vector3()).x * scale(n));
  let x = x0 - (widths.reduce((a, w) => a + w, 0) + gap * (names.length - 1)) / 2;
  names.forEach((name, i) => {
    const mesh = new THREE.Mesh(rockGeometry(name)!, make(name));
    mesh.name = name;
    x += widths[i] / 2;
    mesh.position.set(x, hAt(x, z) - 0.05, z);
    mesh.rotation.y = 0.35;
    mesh.scale.setScalar(scale(name));
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    out.push({ name, at: mesh.position.clone() });
    x += widths[i] / 2 + gap;
  });
  return out;
}

/** Label each rock under it on screen. */
function labels(g: Game, placed: { name: string; at: THREE.Vector3 }[]) {
  const ov = overlay();
  for (const { name, at } of placed) {
    const s = at.clone().project(g.camera);
    ov.label(name.replace('_', ' '), ((s.x + 1) / 2) * innerWidth - 30, ((1 - s.y) / 2) * innerHeight + 14);
  }
  return ov;
}

async function view(g: Game, shot: Shot, name: string, x: number, y: number, z: number, zoom: number, placed: { name: string; at: THREE.Vector3 }[]) {
  g.debug.hold = () => {
    OCCLUDE.uOccOn.value = 0;
    gameplayCamera(g, x, y, z, zoom);
    return false;
  };
  await frames(3);
  const ov = labels(g, placed);
  await shot(name);
  ov.el.remove();
}

async function kitLineup(g: Game, shot: Shot) {
  // (The worlds don't draw the cliff modules yet, so the game leaves them to load when wanted.)
  await loadRocks(ROCK_KIT.cliff);
  const { c, group, y } = await stage(g, 12);
  const theme = ZONES.foothills.theme, look = rockLook(theme);
  const tone = new THREE.Color(theme.cliff![0]).lerp(new THREE.Color(0x8a8478), 0.35);
  const make = (name: RockName) => {
    const m = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.9 });
    applyKitRock(m, name, look);
    return m;
  };
  const rocks = row(g, group, ROCK_KIT.boulder, c.x, c.z - 9, 0.8, make);
  const small = row(g, group, [...ROCK_KIT.stone, ...ROCK_KIT.slab], c.x, c.z - 6.2, 0.8, make, (n) => (n.startsWith('stone') ? 0.7 : 1));
  const masses = row(g, group, ROCK_KIT.mass, c.x, c.z - 2, 1.1, make);
  const cliffs = row(g, group, ROCK_KIT.cliff, c.x, c.z + 6, 1.4, make);
  const p = g.player;
  p.pos.set(c.x + 1, 0, c.z + 1.5);
  p.stop();
  p.faceTo(p.pos.x, p.pos.z + 1, true);
  g.camPos.copy(p.pos);
  g.update(0);
  await view(g, shot, 'rocks-kit-all', c.x, y, c.z + 1, 1.9, [...rocks, ...small, ...masses, ...cliffs]);
  await view(g, shot, 'rocks-kit-boulders', c.x, y, c.z - 7.4, 0.5, [...rocks, ...small]);
  await view(g, shot, 'rocks-kit-masses', c.x, y, c.z - 2.5, 0.85, masses);
  await view(g, shot, 'rocks-kit-cliffs', c.x, y + 1.5, c.z + 5, 1.25, cliffs);
  // Low from the side: the rocks and masses with the cliff modules put away (they stand in front), the hero at the
  // masses' end for scale; then the modules.
  p.pos.set(masses[0].at.x - 2.2, 0, c.z - 1.6);
  g.update(0);
  const modules = group.children.filter((o) => o.name.startsWith('cliff_'));
  modules.forEach((o) => (o.visible = false));
  const at = new THREE.Vector3(c.x, y + 1, c.z - 4);
  await freeShot(g, shot, 'rocks-kit-low', at.clone().addScaledVector(LOW, 20), at, 16);
  modules.forEach((o) => (o.visible = true));
  at.set(c.x, y + 2, c.z + 6);
  await freeShot(g, shot, 'rocks-kit-cliffs-low', at.clone().addScaledVector(LOW, 22), at, 16);
  group.removeFromParent();
  document.body.classList.remove('inspect-clean');
}

async function oreLineup(g: Game, shot: Shot) {
  const { c, group, y } = await stage(g, 8);
  const ores = ['copper', 'tin', 'iron', 'coal', 'emberite'];
  const placed: { name: string; at: THREE.Vector3 }[] = [];
  const hAt = g.zone.view.heightAt;
  ores.forEach((ore, i) => {
    for (const [k, mined] of [[0, false], [1, true]] as const) {
      const p = buildProp(`rock_${ore}`);
      const x = c.x + (i - 2) * 2.9, z = c.z - 1.2 + k * 3.3;
      p.obj.position.set(x, hAt(x, z), z);
      p.obj.rotation.y = 0.3;
      p.tick?.(1.3 + i);
      if (mined) p.setState?.('depleted');
      group.add(p.obj);
      placed.push({ name: mined ? `${ore} mined` : ore, at: p.obj.position.clone() });
    }
  });
  await view(g, shot, 'rocks-ore', c.x, y, c.z + 0.6, 0.95, placed);
  await view(g, shot, 'rocks-ore-close', c.x, y, c.z - 1, 0.6, placed.filter((p) => !p.name.includes('mined')));
  group.removeFromParent();
  document.body.classList.remove('inspect-clean');
}

/** The `n` rockiest walkable spots of the zone in play now (where the most rock stands within 9 m), well apart. */
function rockiest(g: Game, n: number) {
  const L = g.zone.layout, count = new Float32Array(L.w * L.h), m = new THREE.Matrix4(), at = new THREE.Vector3();
  g.zone.view.group.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh) || !o.userData.rock) return;
    for (let k = 0; k < o.count; k++) {
      o.getMatrixAt(k, m);
      at.setFromMatrixPosition(m);
      const s = new THREE.Vector3().setFromMatrixScale(m);
      const x = Math.floor(at.x), z = Math.floor(at.z);
      if (x >= 0 && z >= 0 && x < L.w && z < L.h) count[z * L.w + x] += Math.min(6, s.x * s.y);
    }
  });
  const spots: { x: number; z: number; score: number }[] = [];
  for (let z = 10; z < L.h - 10; z += 2) for (let x = 10; x < L.w - 10; x += 2) {
    if (!g.zone.nav.isWalkable(x + 0.5, z + 0.5)) continue;
    let score = 0;
    for (let dz = -9; dz <= 9; dz++) for (let dx = -9; dx <= 9; dx++) score += count[(z + dz) * L.w + x + dx];
    spots.push({ x: x + 0.5, z: z + 0.5, score });
  }
  spots.sort((a, b) => b.score - a.score);
  const out: typeof spots = [];
  for (const s of spots) if (out.length < n && out.every((o) => Math.hypot(o.x - s.x, o.z - s.z) > 30)) out.push(s);
  return out;
}

async function zoneViews(g: Game, shot: Shot) {
  const out: Record<string, unknown> = {};
  for (const zone of ['foothills', 'ruin', 'lair', 'mine']) {
    ROCK_STYLE.blocks = false;
    g.travel(zone, true);
    await frames(20);
    const spots = rockiest(g, 2);
    for (const [style, blocks] of [['old', true], ['new', false]] as const) {
      ROCK_STYLE.blocks = blocks;
      g.travel(zone, true);
      await frames(20);
      hideEnemies(g);
      for (const [i, s] of spots.entries()) {
        const p = g.player;
        p.pos.set(s.x, 0, s.z);
        p.stop();
        g.camPos.copy(p.pos);
        g.camZoom = 1.15;
        g.debug.hold = null;
        g.debug.timeScale = 0;
        g.update(0);
        document.body.classList.add('inspect-clean');
        await frames(6);
        const name = `rocks-${zone}-${i + 1}-${style}`;
        out[name] = await measure(g);
        await shot(name);
        if (i === 0) {
          const look = new THREE.Vector3(s.x, g.zone.view.heightAt(s.x, s.z) + 1, s.z);
          await freeShot(g, shot, `${name}-low`, look.clone().addScaledVector(LOW, 18), look, 14);
        }
        document.body.classList.remove('inspect-clean');
      }
    }
  }
  ROCK_STYLE.blocks = false;
  return out;
}
