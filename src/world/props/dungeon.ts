import * as THREE from 'three';
import { octagon, prism, taper } from '../../render/blocks';
import { PAL } from '../../render/kit';
import { type Builder, cb, chunk, light, masonry } from './core';
import { DARK, IRON, STONE, STONE_D, STONE_DD, WOOD, WOOD_D } from './palette';
import { bonePile } from './pieces';

// The cult's halls and the dungeons: the ritual dais, obelisks, banners, altars, bones, the hoard, lanterns, chests and the gate.

export const DUNGEON_PROPS: Record<string, Builder> = {
  /**
   * The cultists' dais (the way in runs along local +X): three stepped
   * square tiers of dark basalt-grey stone, a ritual circle inlaid in the top (a ring and four
   * spokes, a faint ember glow), and the altar block at the back with the cult's sigil stone.
   */
  ritual_dais: (k, g) => {
    const SH = [0x4a4440, 0x554c48, 0x5e5650];
    const tiers: [number, number][] = [[8.2, 0.3], [6.6, 0.3], [5.0, 0.28]];
    let y = -0.05;
    tiers.forEach(([s, h], i) => {
      cb(k, g, [s, h, s], [0, y + h / 2, 0], SH[i], undefined, 0.07);
      y += h;
    });
    const top = y, GLOW = 0x6a2410;
    // Ritual circle: an octagonal ring of thin inlaid strips with four spokes to a centre stone.
    const R = 1.7;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      k.box(g, [1.36, 0.03, 0.12], [Math.sin(a) * R, top + 0.015, Math.cos(a) * R], GLOW, [0, a, 0], PAL.fire, 0.35);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      k.box(g, [0.09, 0.03, 1.1], [Math.sin(a) * 0.95, top + 0.015, Math.cos(a) * 0.95], GLOW, [0, a, 0], PAL.fire, 0.3);
    }
    cb(k, g, [0.6, 0.12, 0.6], [0, top + 0.06, 0], 0x3a3230, [0, Math.PI / 4, 0], 0.04);
    // The altar at the back (−X), facing the way in: a heavy block, a slab lid, a sigil stone.
    cb(k, g, [1.3, 0.9, 2.4], [-1.6, top + 0.45, 0], 0x3e3634, undefined, 0.06);
    cb(k, g, [1.5, 0.18, 2.6], [-1.6, top + 0.99, 0], 0x554c48, undefined, 0.04);
    k.mesh(g, taper(0.55, 0.3, 0.3, 0.16, 1.3, 0, 0), 0x3a3230, [-1.95, top + 1.73, 0]);
    k.box(g, [0.05, 0.36, 0.16], [-1.66, top + 1.7, 0], GLOW, undefined, PAL.fire, 0.6);
    k.box(g, [0.05, 0.12, 0.34], [-1.66, top + 1.62, 0], GLOW, undefined, PAL.fire, 0.6);
  },
  /**
   * An obelisk of the processional way (`arg` = 0 standing, 1 broken off, 2 toppled): a tapered
   * dark shaft on a stepped plinth with a pyramid cap and a line of faint runes on its face (+Z).
   */
  obelisk: (k, g, v) => {
    const s = v ?? 0, OB = 0x3e3634, OB_L = 0x4a4240, RUNE = 0x8a2a14;
    cb(k, g, [1.3, 0.3, 1.3], [0, 0.1, 0], 0x554c48, undefined, 0.05);
    cb(k, g, [1.0, 0.3, 1.0], [0, 0.4, 0], OB_L, undefined, 0.05);
    if (s === 0) {
      k.mesh(g, taper(0.72, 0.72, 0.46, 0.46, 3.4, 0, 0), OB, [0, 2.25, 0]);
      k.mesh(g, taper(0.5, 0.5, 0.02, 0.02, 0.5, 0, 0), OB_L, [0, 4.2, 0]);
      for (const y of [1.3, 1.9, 2.5]) k.box(g, [0.18, 0.2, 0.04], [0, y, 0.33 - (y - 0.55) * 0.038], RUNE, undefined, PAL.fire, 0.4);
    } else {
      // Broken off at a slant, the top lying where it fell.
      k.mesh(g, taper(0.72, 0.72, 0.6, 0.6, 1.5, 0, 0), OB, [0, 1.3, 0]);
      k.mesh(g, taper(0.62, 0.62, 0.62, 0.62, 0.3, 0.12, 0), OB_L, [0, 2.1, 0], [0, 0, 0.12]);
      k.box(g, [0.18, 0.2, 0.04], [0, 1.3, 0.35], RUNE, undefined, PAL.fire, 0.4);
      if (s === 2) {
        const top = new THREE.Group();
        top.position.set(2.1, 0.3, 0.3);
        top.rotation.set(0, 0.35, -Math.PI / 2 + 0.06);
        g.add(top);
        k.mesh(top, taper(0.6, 0.6, 0.46, 0.46, 2.1, 0, 0), OB, [0, 1.05, 0]);
        k.mesh(top, taper(0.5, 0.5, 0.02, 0.02, 0.5, 0, 0), OB_L, [0, 2.35, 0]);
      }
    }
  },
  /** A cult banner: a tall iron-shod pole with a crossbar and a long crimson cloth bearing the sigil. */
  cult_banner: (k, g) => {
    cb(k, g, [0.6, 0.3, 0.6], [0, 0.1, 0], 0x4a4240, undefined, 0.05);
    cb(k, g, [0.14, 3.8, 0.14], [0, 1.9, 0], WOOD_D, undefined, 0.02);
    k.mesh(g, taper(0.14, 0.14, 0.01, 0.01, 0.4), IRON, [0, 4.0, 0]);
    cb(k, g, [1.2, 0.1, 0.1], [0, 3.55, 0], IRON, undefined, 0.02);
    cb(k, g, [1.0, 2.0, 0.05], [0, 2.5, 0.07], 0x6a2020, undefined, 0.01);
    for (const x of [-0.27, 0.27]) cb(k, g, [0.46, 0.4, 0.05], [x, 1.31, 0.07], 0x6a2020, undefined, 0.01);
    // The sigil: a dark ring with an ember eye.
    cb(k, g, [0.46, 0.46, 0.04], [0, 2.75, 0.11], 0x2a1414, [0, 0, Math.PI / 4], 0.02);
    k.box(g, [0.16, 0.16, 0.03], [0, 2.75, 0.135], 0xc85020, [0, 0, Math.PI / 4], PAL.fire, 0.35);
  },
  altar: (k, g) => {
    cb(k, g, [3.4, 0.3, 2.0], [0, 0.15, 0], STONE_DD, undefined, 0.05);
    cb(k, g, [3, 0.8, 1.6], [0, 0.7, 0], STONE_D, undefined, 0.06);
    cb(k, g, [3.2, 0.2, 1.8], [0, 1.2, 0], STONE, undefined, 0.04);
    k.box(g, [1, 0.05, 0.8], [0, 1.32, 0], PAL.fire, undefined, PAL.fire, 1.2);
  },
  bones: (k, g, v) => bonePile(k, g, v ?? 0),
  hoard: (k, g) => {
    // Stepped heaps of gold, scattered coins, ingots, an open chest and a ruby.
    cb(k, g, [1.8, 0.2, 1.4], [0, 0.1, 0], PAL.gold, [0, 0.3, 0], 0.08, 0x5a3a00);
    cb(k, g, [1.2, 0.2, 0.9], [0.1, 0.3, 0], PAL.gold, [0, 0.7, 0], 0.08, 0x5a3a00);
    cb(k, g, [0.6, 0.2, 0.5], [0.05, 0.5, 0.05], PAL.gold, [0, 0.2, 0], 0.06, 0x5a3a00);
    for (let i = 0; i < 9; i++) k.mesh(g, octagon(0.14, 0.04), PAL.gold, [Math.sin(i * 2.1) * 1.4, 0.03, Math.cos(i * 1.7) * 1.1], [0, i, Math.PI / 2], 0x5a3a00);
    for (let i = 0; i < 3; i++) k.mesh(g, taper(0.5, 0.24, 0.4, 0.16, 0.14), PAL.gold, [0.9 + i * 0.1, 0.07 + i * 0.14, -0.5], [0, 0.4 + i * 0.3, 0], 0x5a3a00);
    cb(k, g, [0.24, 0.24, 0.24], [0.2, 0.7, 0], 0xe0304a, [0.6, 0.6, 0], 0.05, 0xa01a2a, 0.6);
    cb(k, g, [0.9, 0.55, 0.62], [-1.0, 0.28, -0.5], PAL.wood, [0, 0.4, 0], 0.04);
    cb(k, g, [0.94, 0.08, 0.66], [-1.0, 0.5, -0.5], IRON, [0, 0.4, 0], 0.03);
  },
  lantern: (k, g) => {
    cb(k, g, [0.34, 0.44, 0.34], [0, 2.2, 0], IRON, undefined, 0.04);
    k.box(g, [0.24, 0.3, 0.24], [0, 2.2, 0], 0xffd080, undefined, 0xffb040, 2.5);
    cb(k, g, [0.1, 2.2, 0.1], [0, 1.1, 0], PAL.wood, undefined, 0.02);
    k.mesh(g, taper(0.4, 0.4, 0.1, 0.1, 0.16), IRON, [0, 2.5, 0]);
    return { obj: g, light: light(g, 0xffa050, 12, 12, 2.2) };
  },
  // A miner's wall lamp: a timber post set against the rock (its back at -Z), an arm reaching out
  // over the floor and a lantern hanging from it, throwing a warm pool across the wall and the ore
  // in front of it.
  wall_lantern: (k, g) => {
    chunk(k, g, 171, [0.55, 0.28, 0.5], [0, -0.06, -0.1], 0x5a4a3c, 0.4);
    cb(k, g, [0.26, 2.9, 0.26], [0, 1.45, -0.1], WOOD_D, [0.03, 0, 0], 0.04);
    cb(k, g, [0.2, 0.2, 1.05], [0, 2.82, 0.32], WOOD, undefined, 0.03);
    cb(k, g, [0.1, 0.5, 0.1], [0, 2.45, 0.1], WOOD_D, [0.75, 0, 0], 0.02);
    k.box(g, [0.04, 0.36, 0.04], [0, 2.56, 0.7], IRON);
    cb(k, g, [0.32, 0.4, 0.32], [0, 2.2, 0.7], IRON, undefined, 0.03);
    k.box(g, [0.22, 0.28, 0.22], [0, 2.2, 0.7], 0xffd890, undefined, 0xffb040, 2.8);
    k.mesh(g, taper(0.38, 0.38, 0.1, 0.1, 0.14), IRON, [0, 2.4, 0.7]);
    const l = light(g, 0xffa458, 15, 12, 2.0);
    l.position.z = 1.0;
    return { obj: g, light: l };
  },
  crystal: (k, g) => {
    k.mesh(g, prism(0.26, 0.9, 0.35), 0xff8a3a, [0, 0, 0], [0.2, 0.4, 0.1], 0xff5a1a);
    k.mesh(g, prism(0.18, 0.6, 0.35), 0xff8a3a, [0.25, 0, 0.1], [-0.3, 1.2, -0.3], 0xff5a1a);
  },
  chest: (k, g) => {
    const on = new THREE.Group();
    g.add(on);
    cb(k, on, [1, 0.6, 0.7], [0, 0.3, 0], PAL.wood, undefined, 0.04);
    cb(k, on, [1.04, 0.22, 0.74], [0, 0.71, 0], PAL.leather, undefined, 0.04);
    for (const x of [-0.32, 0.32]) k.box(on, [0.08, 0.84, 0.76], [x, 0.42, 0], IRON);
    k.box(on, [0.2, 0.2, 0.06], [0, 0.52, 0.37], PAL.gold);
    return { obj: g, setState: (s) => (on.visible = s === 'restored') };
  },
  pedestal: (k, g) => {
    cb(k, g, [1.0, 0.2, 1.0], [0, 0.1, 0], STONE_D, undefined, 0.05);
    k.mesh(g, taper(0.64, 0.64, 0.46, 0.46, 0.75), STONE, [0, 0.575, 0]);
    cb(k, g, [0.72, 0.14, 0.72], [0, 1.02, 0], STONE_D, undefined, 0.04);
    const frag = new THREE.Group();
    g.add(frag);
    k.box(frag, [0.3, 0.06, 0.24], [0, 1.14, 0], 0x3a2a24, [0, 0.4, 0]);
    k.box(frag, [0.14, 0.03, 0.1], [0, 1.18, 0], PAL.fire, [0, 0.4, 0], PAL.fire, 2);
    return { obj: g, setState: (s) => (frag.visible = s !== 'taken'), tick: (t) => (frag.position.y = Math.sin(t * 2) * 0.05) };
  },
  gate: (k, g) => {
    // The sealed lair gate: a basalt masonry wall with buttresses, merlons and an iron door
    // bearing a glowing octagonal seal.
    const dark = [0x4a4240, 0x3e3634, 0x554c48];
    masonry(k, g, { x: 0, z: 0, rot: 0, len: 5.2, y0: 0, rows: 7, rowH: 0.72, thick: 1.2, seed: 31, shades: dark, unit: 1.2, hole: { u: 0, w: 3.0, h: 3.9 } });
    cb(k, g, [3.6, 0.6, 1.3], [0, 4.1, 0.05], 0x3a3230, undefined, 0.06);
    for (const sx of [-1, 1]) k.mesh(g, taper(1.0, 1.6, 0.6, 1.0, 5.4, 0, -0.2), 0x3a3230, [sx * 2.75, 2.7, 0.1]);
    for (const x of [-2, -0.7, 0.7, 2]) cb(k, g, [0.8, 0.6, 1.0], [x, 5.34, 0], dark[0], undefined, 0.05);
    k.box(g, [3.0, 3.9, 0.4], [0, 1.95, 0], DARK);
    const door = new THREE.Group();
    g.add(door);
    cb(k, door, [3, 3.8, 0.4], [0, 1.9, 0.4], IRON, undefined, 0.05);
    for (const y of [0.7, 1.9, 3.1]) k.box(door, [3.04, 0.12, 0.06], [0, y, 0.62], 0x2e2e34);
    const sealGeo = octagon(0.8, 0.1);
    const seal = k.mesh(door, sealGeo, PAL.fire, [0, 2, 0.66], [0, Math.PI / 2, 0], PAL.fire);
    seal.name = 'seal';
    const l = light(g, 0xff5a1a, 6, 8, 2);
    l.position.z = 1.5;
    return {
      obj: g, light: l,
      tick: (t) => ((seal.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + Math.sin(t * 2) * 0.5),
      setState: (s) => {
        door.visible = s !== 'open';
        l.color.setHex(s === 'open' ? 0xff2a1a : 0xff5a1a);
      },
    };
  },
};
