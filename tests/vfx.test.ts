import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Enemy } from '../src/entities/enemy';
import { fireCard } from '../src/fx/fire';
import { lootBeam, MeshFx } from '../src/fx/meshFx';
import { missileLook } from '../src/fx/missiles';
import { Particles } from '../src/fx/particles';
import { frameCell, PAGES, SHEETS, type PageId } from '../src/fx/sheets';
import { SpriteLayer } from '../src/fx/sprites';
import type { Game } from '../src/game';
import { Fx } from '../src/systems/fx';
import { ModelKit } from '../src/render/kit';
import { flame } from '../src/world/props/core';

const FX_DIR = path.join(__dirname, '..', 'public', 'textures', 'fx');

/** A JPEG's or WebP's size in pixels, read from its header. */
function imageSize(file: string): [number, number] {
  const b = fs.readFileSync(file);
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length;) {
      const marker = b[i + 1], len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 12, 16) === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  throw new Error(`no size found in ${file}`);
}

const instances = (layer: THREE.Mesh) => (layer.geometry as THREE.InstancedBufferGeometry).instanceCount;

describe('effect sheets', () => {
  it('fit their pages, four frames to a row, and never share a cell', () => {
    const taken = new Map<PageId, Set<string>>();
    for (const [id, s] of Object.entries(SHEETS)) {
      const grid = PAGES[s.page].grid, cells = taken.get(s.page) ?? new Set<string>();
      taken.set(s.page, cells);
      for (let f = 0; f < s.frames; f++) {
        const { col, row } = frameCell(s, f);
        expect(col, id).toBeLessThan(grid);
        expect(row, id).toBeLessThan(grid);
        expect(cells.has(`${col},${row}`), `${id} frame ${f}`).toBe(false);
        cells.add(`${col},${row}`);
      }
    }
  });

  it('give each frame its cell, four to a row, holding the last past the end', () => {
    expect(frameCell(SHEETS.impact, 0)).toEqual({ col: 0, row: 0 });
    expect(frameCell(SHEETS.impact, 5)).toEqual({ col: 1, row: 1 });
    expect(frameCell(SHEETS.flame, 3)).toEqual({ col: 7, row: 5 });
    expect(frameCell(SHEETS.glint, 4)).toEqual(frameCell(SHEETS.glint, 0));
  });

  it('read pages and masks that are in the game, at the sizes their grids and shaders expect', () => {
    for (const page of Object.values(PAGES)) expect(imageSize(path.join(FX_DIR, page.file)), page.file).toEqual([1024, 1024]);
    const masks: [string, number, number][] = [['fx-trail.jpg', 512, 512], ['fx-noise.jpg', 512, 512], ['fx-ring.jpg', 512, 512], ['fx-sigil.jpg', 512, 512], ['fx-frost-circle.jpg', 512, 512], ['fx-slash.jpg', 1024, 192], ['fx-bolt.jpg', 512, 128]];
    for (const [file, w, h] of masks) expect(imageSize(path.join(FX_DIR, file)), file).toEqual([w, h]);
    // Every texture is listed with its source.
    const licences = fs.readFileSync(path.join(FX_DIR, 'LICENSES.md'), 'utf8');
    for (const file of fs.readdirSync(FX_DIR).filter((f) => !f.endsWith('.md'))) expect(licences, file).toContain(`\`${file}\``);
  });
});

describe('sprite layer', () => {
  it('draws only the slots it has used and reuses the oldest when full', () => {
    const layer = new SpriteLayer('impact', 3);
    expect(layer.mesh.visible).toBe(false);
    for (let i = 0; i < 2; i++) layer.spawn({ x: i, y: 0, z: 0, life: 1, size: 1, sheet: 'impact' });
    expect(instances(layer.mesh)).toBe(2);
    expect(layer.mesh.visible).toBe(true);
    for (let i = 0; i < 3; i++) layer.spawn({ x: 10 + i, y: 0, z: 0, life: 1, size: 1, sheet: 'impact' });
    expect(instances(layer.mesh)).toBe(3);
    // (The fifth card took the second slot: 28 floats a card, x first.)
    const data = (layer.mesh.geometry.getAttribute('aP') as THREE.InterleavedBufferAttribute).data.array;
    expect(data[28]).toBe(12);
  });

  it('sends only the slots written since its last draw, then hides once its last card is gone', () => {
    const layer = new SpriteLayer('impact', 8);
    layer.spawn({ x: 0, y: 0, z: 0, life: 0.5, size: 1, sheet: 'impact' });
    layer.spawn({ x: 0, y: 0, z: 0, life: 0.3, size: 1, sheet: 'impact' });
    const buf = (layer.mesh.geometry.getAttribute('aP') as THREE.InterleavedBufferAttribute).data;
    layer.mesh.onBeforeRender(null as never, null as never, null as never, null as never, null as never, null as never);
    expect(buf.updateRanges).toEqual([{ start: 0, count: 56 }]);
    layer.update(0.4);
    expect(layer.mesh.visible).toBe(true);
    layer.update(0.2);
    expect(layer.mesh.visible).toBe(false);
  });

  it('starts its clock over while idle, sending every old card far into the past', () => {
    const layer = new SpriteLayer('impact', 4);
    layer.spawn({ x: 0, y: 0, z: 0, life: 0.5, size: 1, sheet: 'impact' });
    const data = (layer.mesh.geometry.getAttribute('aP') as THREE.InterleavedBufferAttribute).data.array;
    layer.update(100);
    expect(data[3]).toBe(0);
    // A card that lived past the restart (its death was late on the old clock).
    layer.spawn({ x: 0, y: 0, z: 0, life: 520, size: 1, sheet: 'impact' });
    layer.update(700);
    expect(data[3]).toBeLessThan(-1e5);
    expect(data[28 + 3]).toBeLessThan(-1e5);
    // (The next card is spawned on the fresh clock, and the layer hides as soon as it is gone.)
    layer.spawn({ x: 0, y: 0, z: 0, life: 0.5, size: 1, sheet: 'impact' });
    expect(data[56 + 3]).toBe(0);
    expect(layer.mesh.visible).toBe(true);
    layer.update(1);
    expect(layer.mesh.visible).toBe(false);
  });

  it('plays a still variant of a sheet as one frame, and refuses a sheet from another page', () => {
    const layer = new SpriteLayer('c', 4);
    layer.spawn({ x: 0, y: 0, z: 0, life: 1, size: 1, sheet: 'blood', frame: 2 });
    const data = (layer.mesh.geometry.getAttribute('aA') as THREE.InterleavedBufferAttribute).data.array;
    // aA: the cell, its frame count and rate.
    expect([data[20], data[21], data[22], data[23]]).toEqual([SHEETS.blood.col + 2, SHEETS.blood.row, 1, 0]);
    expect(() => layer.spawn({ x: 0, y: 0, z: 0, life: 1, size: 1, sheet: 'impact' })).toThrow();
  });
});

describe('particles', () => {
  it('draw glow as painted cards, one draw for the pool', () => {
    const glow = new Particles(16, true);
    glow.spawn(0, 1, 0, 1, 0, 0, 0.5, 0.1, 0xff8000);
    glow.burst(new THREE.Vector3(0, 1, 0), { count: 4, color: [0xffffff], kind: 'glint' });
    expect(glow.mesh.name).toBe('fx-a');
    expect(instances(glow.mesh as THREE.Mesh)).toBe(5);
  });

  it('throw chips that fall, settle on the ground and are gone at the end of their life', () => {
    const chips = new Particles(8, false);
    chips.ground = () => 1;
    chips.spawn(0, 2, 0, 1, 2, 0, 2, 0.2, 0x808080, 9, 0);
    const mesh = chips.mesh as THREE.InstancedMesh;
    for (let i = 0; i < 90; i++) chips.update(1 / 60);
    const m = new THREE.Matrix4(), at = new THREE.Vector3();
    mesh.getMatrixAt(0, m);
    at.setFromMatrixPosition(m);
    expect(mesh.count).toBe(1);
    expect(at.y).toBeGreaterThanOrEqual(1.05);
    expect(at.y).toBeLessThan(1.2);
    for (let i = 0; i < 40; i++) chips.update(1 / 60);
    expect(mesh.count).toBe(0);
  });
});

describe('mesh effects', () => {
  it('end after their life and take their materials back for the next', () => {
    const fx = new MeshFx();
    fx.slash({ x: 0, y: 1, z: 0, dir: 0, sweep: 2, r0: 1, r1: 2, color: 0xffffff });
    fx.decal({ kind: 'ring', x: 0, y: 0, z: 0, from: 1, to: 2, life: 0.5, color: 0xffffff });
    expect(fx.root.children).toHaveLength(2);
    const slashMat = (fx.root.children[0] as THREE.Mesh).material;
    fx.update(0.6);
    expect(fx.root.children).toHaveLength(0);
    fx.slash({ x: 0, y: 1, z: 0, dir: 0, sweep: 2, r0: 1, r1: 2, color: 0xffffff });
    expect((fx.root.children[0] as THREE.Mesh).material).toBe(slashMat);
  });

  it('free a bolt\'s own shape when it ends, and clear everything at once', () => {
    const fx = new MeshFx();
    fx.bolt([new THREE.Vector3(0, 1, 0), new THREE.Vector3(2, 1, 0), new THREE.Vector3(4, 1, 1)], 0xffffff, 0.5, 0.2);
    const geo = (fx.root.children[0] as THREE.Mesh).geometry;
    let freed = false;
    geo.addEventListener('dispose', () => (freed = true));
    // Two crossed bands of two triangles per segment, two segments.
    expect(geo.getAttribute('position').count).toBe(24);
    fx.pillar({ x: 0, y: 0, z: 0, radius: 1, height: 5, life: 2, color: 0xffd060 });
    fx.update(0.25);
    expect(freed).toBe(true);
    expect(fx.root.children).toHaveLength(1);
    fx.clear();
    expect(fx.root.children).toHaveLength(0);
  });

  it('give loot beams of one colour one material', () => {
    const a = lootBeam(0xffd84a, 4), b = lootBeam(0xffd84a, 9), c = lootBeam(0xff8a1a, 9);
    expect(a.material).toBe(b.material);
    expect(c.material).not.toBe(a.material);
    expect(b.scale.y).toBe(9);
  });
});

describe('fires and missiles', () => {
  it('burn each fire as one flame card on a material shared by fires of its size', () => {
    const g = new THREE.Group();
    const torch = fireCard(g, 0, 1, 0, 0.6), torch2 = fireCard(g, 2, 1, 0, 0.7), hearth = fireCard(g, 4, 0, 0, 1.2);
    expect([torch.name, hearth.name]).toEqual(['flame', 'flame']);
    expect(torch.material).toBe(torch2.material);
    expect(hearth.material).not.toBe(torch.material);
    expect(torch.scale.x).toBeCloseTo(0.6);
  });

  it('keep the props\' flame and its animation (the flame breathing with its light)', () => {
    const g = new THREE.Group();
    const tick = flame(new ModelKit(), g, 0, 1, 0, 1);
    expect(g.children.filter((o) => o.name === 'flame')).toHaveLength(1);
    tick(0.3);
    expect(g.children[0].scale.x).not.toBe(1);
  });

  it('share a missile kind\'s look', () => {
    expect(missileLook('fireball').material).toBe(missileLook('fireball').material);
    expect(missileLook('bolt').material).not.toBe(missileLook('fireball').material);
  });
});

/** The least of a game the effects reach for: a scene, the camera, flat ground, the hero and the particle pools. */
function fakeGame() {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 21, 14);
  return {
    scene: new THREE.Scene(), camera, time: 0,
    zone: { group: new THREE.Group() }, zoneOrNull: { groundY: () => 0 },
    particles: new Particles(256, false), glow: new Particles(1024, true),
    player: { x: 0, z: 3 }, stats: { style: 'melee' },
  } as unknown as Game & { time: number };
}

const goblin = { x: 0, z: 0, pos: new THREE.Vector3(), radius: 0.45, model: { height: 1.4 }, def: { model: 'goblin' } } as unknown as Enemy;

describe('the effects', () => {
  it('each build their layers without error, and the cards show', () => {
    const g = fakeGame(), fx = new Fx(g);
    fx.arc(0, 3, -Math.PI / 2, 2.5, 2, 0xffffff);
    fx.hit(goblin, false, 0, 3);
    fx.hit(goblin, true, 0, 3);
    fx.death(goblin);
    fx.trail('fireball', 0, 1, 0);
    fx.trail('bolt', 0, 1, 0);
    fx.fireBurst(0, 0, 2.6);
    fx.lightning({ x: 0, y: 1, z: 3 }, { x: 0, y: 1, z: 0 });
    fx.sparks(0, 1, 0);
    fx.mine(0, 0.8, 0, 0xff8a30);
    fx.dust(0, 0);
    fx.slam(0, 0, 3);
    fx.warCry(0, 0, 4);
    fx.frostNova(0, 0, 4.2);
    fx.gust(0, 0, 0);
    fx.heal(0, 0);
    fx.levelUp(0, 0, 0xff0000);
    fx.loot(0, 0.5, 0, true);
    fx.teleport(0, 0);
    fx.moveMarker(0, 0);
    const layer = (name: string) => g.scene.getObjectByName(`fx-${name}`) as THREE.Mesh;
    for (const page of ['impact', 'crit', 'explosion', 'frost', 'teleport', 'b', 'c']) expect(instances(layer(page)), page).toBeGreaterThan(0);
    expect(g.scene.getObjectByName('fx-meshes')!.children.length).toBeGreaterThan(5);
    fx.update(5);
    expect(g.scene.getObjectByName('fx-meshes')!.children).toHaveLength(0);
    expect(layer('impact').visible).toBe(false);
  });

  it('show no impact flash for a blow landed by a spell in the moment of its own burst, nor for a tick of damage', () => {
    const g = fakeGame(), fx = new Fx(g);
    fx.frostNova(0, 0, 4.2);
    fx.hit(goblin, false, 0, 3);
    const impact = () => instances(g.scene.getObjectByName('fx-impact') as THREE.Mesh);
    expect(impact()).toBe(0);
    g.time += 1 / 60;
    fx.hit(goblin, false, 0, 3, true);
    expect(impact()).toBe(0);
    fx.hit(goblin, false, 0, 3);
    expect(impact()).toBe(1);
  });
});
