/**
 * The brick colours: the real system's solid and transparent colours (sRGB, as the plastic looks in
 * daylight), by their common names. Every element is moulded in one of these; nothing is painted.
 */
export const BRICK_COLORS = {
  white: 0xf2f3f0,
  tan: 0xe4cd9e,
  darkTan: 0x958a73,
  lightGrey: 0xa0a5a9,
  darkGrey: 0x6c6e68,
  black: 0x1e2428,
  reddishBrown: 0x582a12,
  darkBrown: 0x352100,
  mediumNougat: 0xaa7d55,
  nougat: 0xd09168,
  darkOrange: 0xa95500,
  orange: 0xfe8a18,
  darkRed: 0x720e0f,
  red: 0xc91a09,
  pink: 0xe4adc8,
  yellow: 0xf2cd37,
  sandGreen: 0xa0bcac,
  darkGreen: 0x184632,
  green: 0x237841,
  brightGreen: 0x4b9f4a,
  oliveGreen: 0x9b9a5a,
  sandBlue: 0x6074a1,
  darkBlue: 0x0a3463,
  mediumBlue: 0x5a93db,
  pearlGold: 0xaa7f2e,
  flatSilver: 0x898788,
} as const;

export type BrickColor = keyof typeof BRICK_COLORS;

/** Transparent colours (glass, lamp glass, flames): the tint and how strongly each glows. */
export const TRANS_COLORS = {
  clear: { tint: 0xd8e6ee, glow: 0 },
  yellow: { tint: 0xf5cd2f, glow: 2.2 },
  orange: { tint: 0xf08f1c, glow: 2.6 },
} as const;

export type TransColor = keyof typeof TRANS_COLORS;
