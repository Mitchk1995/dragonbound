import * as THREE from 'three';
import type { ZoneTheme } from '../data/zones';

// ─── Destination glimpses ───────────────────────────────────────────────────

/** How the far side is painted. */
export enum GlimpseStyle {
  /** Floating island under a violet night sky with stars (the keep). */
  Void = 0,
  /** A lantern-lit tunnel with a mine-cart track running off into the glow (the mine). */
  Cave = 1,
  /** Pine ridges and mountains against a sunset sky (the Foothills). */
  Forest = 2,
  /** Broken columns standing in still, reflecting water under a teal sky (the ruin). */
  Water = 3,
  /** Jagged spires over a lava field under a burning sky (the lair). */
  Lava = 4,
}

export interface Glimpse {
  style: GlimpseStyle;
  skyTop: number;
  /** Sky at the horizon (the brightest part of the sky). */
  skyLow: number;
  /** Distance haze: far silhouettes fade to this. */
  fog: number;
  ground: number;
  /** Nearest silhouettes (farther ones blend toward fog). */
  sil: number;
  /** Accents: sun/lantern glow, lit windows, lava, rim light on the silhouettes. */
  glow: number;
}

/** Hand-picked glimpses for the zones that exist; anything else is derived from its theme. */
export const GLIMPSES: Record<string, Glimpse> = {
  keep: { style: GlimpseStyle.Void, skyTop: 0x140c34, skyLow: 0x6a3a7a, fog: 0x40285a, ground: 0x3e6a34, sil: 0x241c34, glow: 0xffc070 },
  mine: { style: GlimpseStyle.Cave, skyTop: 0x2a1c12, skyLow: 0xffb468, fog: 0xc08048, ground: 0xa87e52, sil: 0x3a281c, glow: 0xffb050 },
  foothills: { style: GlimpseStyle.Forest, skyTop: 0x3e4e80, skyLow: 0xf2a878, fog: 0x9a7478, ground: 0x4a6a34, sil: 0x1e2e24, glow: 0xffd8a0 },
  ruin: { style: GlimpseStyle.Water, skyTop: 0x1a2c3c, skyLow: 0x8ac0c0, fog: 0x46686e, ground: 0x184850, sil: 0x1c2a34, glow: 0xe0f4ff },
  lair: { style: GlimpseStyle.Lava, skyTop: 0x1a0604, skyLow: 0xc84a1c, fog: 0x5e1c10, ground: 0x1e1010, sil: 0x140808, glow: 0xff6a20 },
};

/** A glimpse for a destination: hand-picked when known, else read off the zone's theme. */
export function glimpseFor(dest: string, theme?: ZoneTheme): Glimpse {
  const known = GLIMPSES[dest];
  if (known || !theme) return known ?? GLIMPSES.keep;
  const style = theme.lava ? GlimpseStyle.Lava : theme.wallRise ? GlimpseStyle.Cave : theme.ambient === 'void' ? GlimpseStyle.Void : theme.water && theme.wall === 'ruin' ? GlimpseStyle.Water : GlimpseStyle.Forest;
  const ground = Object.values(theme.ground)[0]?.[0] ?? 0x5a6a3c;
  const c = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();
  return { style, skyTop: c(theme.bg, 1), skyLow: theme.hemi[0], fog: new THREE.Color(theme.bg).lerp(new THREE.Color(theme.hemi[0]), 0.4).getHex(), ground, sil: c(theme.cliff?.[1] ?? 0x3a3430, 0.5), glow: theme.sun[0] };
}
