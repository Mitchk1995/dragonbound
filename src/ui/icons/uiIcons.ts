/** Icons for the interface itself, the faint empty-equipment-slot silhouettes, and the fallback rune. */
import { amuletPart, bodyPart, bootPart, glovesPart, helmPart, ringPart, scrollSheet, shieldPart, swordPart } from './parts';
import { C, E, HI, HOLE, OUT, P, R, hiFill, hiStroke, line, polar, spark, spiralD, star4, wavyD, type Draw } from './pen';

export const UI_ICONS: Record<string, Draw> = {
  // ------------------------------------------------ UI
  skills: (c) =>
    scrollSheet(c) +
    c.hl(line('M20 21 H44 M20 27 H40 M20 33 H44 M20 39 H36', '#8a6a44', 2)) +
    c.hl(hiStroke('M13 8.5 H30', 1.4, 0.55)),

  quest: (c) =>
    P('M21 42 L14 62 L20 58.5 L25 62 L30 45 Z', c.f('blood', 'v')) +
    P('M43 42 L50 62 L44 58.5 L39 62 L34 45 Z', c.f('blood', 'v')) +
    P(wavyD(32, 29, 22, 12, 1.6), c.rad([[0, '#e0664a'], [0.5, '#b02a1a'], [1, '#6e1409']], 0.38, 0.32, 0.75)) +
    c.hl(C(32, 29, 16, 'fill="none" stroke="#5a0f06" stroke-width="1.6" opacity=".7"')) +
    c.hl(hiStroke('M16.5 22 Q19 14 27 11', 2.2, 0.6)) +
    P('M28.5 12 H35.5 L34.2 35 H29.8 Z', c.f('gold')) +
    C(32, 42, 3.8, c.f('gold')),

  diary: (c) =>
    P('M14 9 H52 Q55 9 55 12 V55 Q55 58 52 58 H14 Z', c.f('bone', 'h')) +
    c.hl(line('M51 13 V54 M14 55 H51', '#b8a47c', 1.1)) +
    P('M10 6 H47 Q51 6 51 10 V51 Q51 55 47 55 H10 Z', c.f('redLeather')) +
    R(7, 5, 8, 51.5, 2.5, c.f('blood', 'h')) +
    c.hl(line('M8 13 H14 M8 48 H14', '#d8b25a', 2)) +
    P('M51 10 L44 6 H47 Q51 6 51 10 Z M51 51 L44 55 H47 Q51 55 51 51 Z', c.f('gold')) +
    P('M31 18 L39 30 L31 42 L23 30 Z', c.f('gold')) +
    c.hl(P('M31 24 L35 30 L31 36 L27 30 Z', `fill="#7e2a1b" stroke="none"`)) +
    c.hl(hiStroke('M18 10 H36', 1.6, 0.4)) +
    P('M38 55 V63 L41.5 60 L45 63 V55 Z', c.f('gold', 'v')),

  potion: (c) => {
    const body = 'M27 11 V23.7 A18 18 0 1 0 37 23.7 V11 Z';
    return (
      c.glow(C(32, 42, 15, 'fill="#b02a1a"'), 3, 0.35) +
      P(body, `${c.solid('#e4c8c0')} fill-opacity=".45" stroke="none"`) +
      P('M15.4 34 Q24 31 32 34 T48.6 34 A18 18 0 1 1 15.4 34 Z', c.rad([[0, '#f07a5e'], [0.45, '#d9503a'], [0.8, '#b02a1a'], [1, '#6e1409']], 0.4, 0.3, 0.8) + ' stroke="none"') +
      c.hl(C(38, 45, 2, 'fill="#ffb3a0" stroke="none" opacity=".8"') + C(28, 50, 1.4, 'fill="#ffb3a0" stroke="none" opacity=".7"')) +
      P(body, 'fill="none"') +
      c.hl(hiStroke('M19 38 Q19.5 30 26.5 27', 2.4, 0.8)) +
      R(25.5, 18.5, 13, 5, 2, c.f('gold', 'v')) +
      R(26, 4, 12, 9, 2.5, c.f('wood', 'v'))
    );
  },

  gold: (c) => {
    const coin = (cx: number, cy: number) =>
      P(`M${cx - 12} ${cy} V${cy + 4} A12 4.5 0 0 0 ${cx + 12} ${cy + 4} V${cy} Z`, c.f('gold', 'h')) +
      E(cx, cy, 12, 4.5, c.f('gold', 'v')) +
      c.hl(E(cx - 1, cy - 0.5, 7, 2, `fill="none" stroke="#a07a30" stroke-width="1" opacity=".8"`));
    let s = '';
    for (let i = 0; i < 5; i++) s += coin(20, 53 - i * 6);
    for (let i = 0; i < 3; i++) s += coin(44, 55 - i * 6);
    return (
      s +
      C(40, 29, 13, c.f('gold')) +
      C(40, 29, 9, `${c.solid('none')} stroke="#a07a30" stroke-width="1.6"`) +
      P(star4(40, 29, 6.5, 2), c.solid('#a07a30') + ' stroke="none"') +
      c.hl(hiStroke('M30 25 Q32 19 38 17.5', 2, 0.8)) +
      spark(c, 55, 13, 4.5, '#fff6d0')
    );
  },

  recall: (c) =>
    c.glow(C(32, 30, 16, 'fill="#5a9cff"'), 4, 0.9) +
    P('M18 61 Q32 50 46 61 Z', c.f('stone', 'v')) +
    P('M32 4 A26 26 0 1 1 31.99 4 Z M32 13 A17 17 0 1 0 32.01 13 Z', `${c.f('stone')} fill-rule="evenodd"`) +
    C(32, 30, 17, c.rad([[0, '#ffffff'], [0.3, '#bfe0ff'], [0.7, '#5a9cff'], [1, '#1d3f8a']], 0.5, 0.5, 0.55) + ' stroke="none"') +
    c.hl(line(spiralD(32, 30, 1.5, 15, 1.6, 0), '#1d3f8a', 2.4, 0.75)) +
    c.hl(line(spiralD(32, 30, 1.5, 14, 1.6, 180), '#e4f2ff', 1.8, 0.9)) +
    c.hl(hiStroke('M11 20 Q15 10 26 6', 2.2, 0.35)) +
    c.hl(line('M32 6.5 V9.5 M12 30 H15 M52 30 H49 M18 45 L20 43 M46 45 L44 43', '#f3d98a', 2)),

  lock: (c) =>
    c.rod('M20 30 V21 Q20 8 32 8 Q44 8 44 21 V30', '#8d959f', 5) +
    c.hl(line('M21.6 28 V21 Q21.6 11 30 9.6', '#dfe5ea', 1.4)) +
    R(11, 28, 42, 31, 5, c.f('gold')) +
    c.hl(hiFill('M14.5 31 H30 V34 H14.5 Z', 0.55)) +
    P('M32 36 A4.5 4.5 0 0 1 34.5 44.2 L36 51 H28 L29.5 44.2 A4.5 4.5 0 0 1 32 36 Z', c.solid(HOLE) + ' stroke="none"') +
    c.hl([15.5, 48.5].map((x) => C(x, 33, 1.6, 'fill="#8d959f" stroke-width="1.2"') + C(x, 54, 1.6, 'fill="#8d959f" stroke-width="1.2"')).join('')),

  close: (c) => {
    const bar = (deg: number) => R(6, 25.5, 52, 13, 4, `${c.f('blood', 'v')} transform="rotate(${deg} 32 32)"`);
    const stud = (deg: number, x: number) => {
      const [px, py] = polar(32, 32, x, deg);
      return C(px, py, 3.2, c.f('iron')) + c.hl(C(px - 0.9, py - 0.9, 1, `fill="${HI}" stroke="none" opacity=".8"`));
    };
    return (
      bar(45) +
      bar(-45) +
      c.hl(`<path d="M10.5 12.5 L20 22" fill="none" stroke="#f07a5e" stroke-width="1.6" opacity=".8"/><path d="M44 20.5 L51.5 13" fill="none" stroke="#f07a5e" stroke-width="1.6" opacity=".8"/>`) +
      stud(45, 19.5) + stud(135, 19.5) + stud(225, 19.5) + stud(315, 19.5) +
      C(32, 32, 4.6, c.f('iron')) +
      c.hl(C(31, 31, 1.4, `fill="${HI}" stroke="none" opacity=".8"`))
    );
  },

  // Combat level (the skills tab's summary): sword over a crossed shield.
  combat: (c) =>
    c.at(35, 30, -45, 0.9) + swordPart(c) + '</g>' +
    c.at(22, 40, 0, 0.6) +
    shieldPart(c, 'blood', P('M29 13 H35 V25 H46.5 V31 H35 V50 L32 52.5 L29 50 V31 H17.5 V25 H29 Z', c.f('gold'))) +
    '</g>',

  // ------------------------------------------------ empty equipment slots (ghost silhouettes)
  slot_weapon: (c) => c.at(32, 32, 45, 0.92) + swordPart(c) + '</g>',
  slot_helm: (c) => helmPart(c),
  slot_body: (c) => bodyPart(c),
  slot_gloves: (c) => glovesPart(c),
  slot_boots: (c) => c.at(32, 32, 0, 1, 38.5, 31.5) + bootPart(c) + '</g>',
  slot_amulet: (c) => amuletPart(c),
  slot_ring: (c) => ringPart(c),

  // ------------------------------------------------ fallback
  rune: (c) => {
    const glyph = 'M32 17 V47 M22 24 L32 32 L42 24 M24 42 L32 36 L40 42';
    return (
      P(wavyD(32, 33, 26, 7, 1.4), c.f('stone')) +
      c.hl(hiFill('M13 24 Q18 13 30 9 Q22 16 19 27 Z', 0.35)) +
      c.glow(line(glyph, '#ffb040', 6), 2.5, 0.8) +
      c.hl(line(glyph, OUT, 6) + line(glyph, '#f3d98a', 2.6))
    );
  },
};
