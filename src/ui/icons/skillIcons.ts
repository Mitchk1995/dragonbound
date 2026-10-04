/** Icons for the skills, the ones still to come included. */
import { bowPart, shieldPart, staffPart, swordPart } from './parts';
import { C, HI, OUT, P, R, hiFill, hiStroke, line, spark, type Draw } from './pen';

export const SKILL_ICONS: Record<string, Draw> = {
  // ------------------------------------------------ skills
  melee: (c) => c.at(32, 32, -45, 0.84) + swordPart(c) + '</g>' + c.at(32, 32, 45, 0.84) + swordPart(c) + '</g>',

  ranged: (c) => c.at(33, 31, -45, 0.84) + bowPart(c, true) + '</g>',

  magic: (c) => staffPart(c),

  defence: (c) =>
    shieldPart(
      c,
      'blood',
      P('M29 12.5 H35 V25 H46.5 V31 H35 V50 L32 52.5 L29 50 V31 H17.5 V25 H29 Z', c.f('gold')) +
        c.hl(hiStroke('M30.5 15 V24 M20 26.5 H28', 1.2, 0.7)),
    ),

  hitpoints: (c) =>
    c.glow(P('M32 56 C14 44 6 34 6 23 C6 14 13 8 21 8 C26 8 30 11 32 15 C34 11 38 8 43 8 C51 8 58 14 58 23 C58 34 50 44 32 56 Z', 'fill="#b02a1a"'), 2.5, 0.5) +
    P(
      'M32 57 C14 45 6 35 6 23.5 C6 14 13 8 21 8 C26 8 30 11 32 15 C34 11 38 8 43 8 C51 8 58 14 58 23.5 C58 35 50 45 32 57 Z',
      c.rad([[0, '#f07a5e'], [0.35, '#d9503a'], [0.62, '#b02a1a'], [1, '#6e1409']], 0.36, 0.3, 0.8),
    ) +
    c.hl(P('M44 50 C50 43 56 36 57 26', `fill="none" stroke="#5a0f06" stroke-width="3" opacity=".5"`)) +
    c.hl(hiFill('M12.5 17 C14 12 19 11 23 12.5 C19 13.5 16 16.5 15 21 C14 22 12 20.5 12.5 17 Z', 0.85)) +
    c.hl(C(24.5, 20, 1.8, `fill="${HI}" stroke="none" opacity=".7"`)),

  mining: (c) =>
    c.at(33, 32, 40, 0.9) +
    R(29, 16, 6, 46, 2.5, c.f('wood', 'h')) +
    c.hl(line('M29.5 50 H34.5 M29.5 53.5 H34.5 M29.5 57 H34.5', '#3a200e', 1.3)) +
    P('M3 27 Q16 8.5 32 7.5 Q48 8.5 61 27 Q47 18.5 32 18.5 Q17 18.5 3 27 Z', c.f('iron', 'v')) +
    c.hl(hiStroke('M7 22.5 Q17 12 30 10.5', 1.6, 0.8)) +
    R(26, 5, 12, 16, 2.5, c.f('darkIron', 'h')) +
    c.hl(C(32, 13, 1.8, `fill="#e6c874" stroke-width="1.2"`)) +
    '</g>',

  smithing: (c) =>
    spark(c, 44, 28, 4.2, '#ffd070') +
    spark(c, 52, 20, 2.8, '#ffb040') +
    spark(c, 38, 21, 2.6, '#ffe39a') +
    P('M4 31 H57 V38.5 H43 V43 Q43 47 49 50 L51 58 H15 L17 50 Q23 47 23 43 V38.5 H19 Q9.5 37 4 31 Z', c.f('darkIron', 'a')) +
    c.hl(hiFill('M8 32.4 H55.5 V34.4 H10 Z', 0.55)) +
    c.hl(line('M23 43 H43', '#2b2f35', 1.2, 0.8)) +
    c.at(27, 22, -135, 0.72, 32, 10) +
    R(29.5, 14, 5, 34, 2, c.f('wood', 'h')) +
    R(19, 3, 26, 13, 2.5, c.f('iron', 'h')) +
    R(29, 2, 6, 15, 1.5, c.f('darkIron', 'h')) +
    '</g>',

  herblore: (c) => {
    const body = 'M27 10 V24 L12 51 Q9.5 58 17 58 H47 Q54.5 58 52 51 L37 24 V10 Z';
    return (
      P(body, `${c.solid('#cfe3ea')} fill-opacity=".45" stroke="none"`) +
      P('M18.4 40 Q25 37 32 40 T45.6 40 L52 51 Q54.5 58 47 58 H17 Q9.5 58 12 51 Z', c.f('poison', 'd') + ' stroke="none"') +
      c.hl(C(24, 50, 2.2, 'fill="#c8f2a6" stroke="none" opacity=".9"') + C(30, 45, 1.5, 'fill="#c8f2a6" stroke="none" opacity=".8"') + C(38, 51, 1.3, 'fill="#c8f2a6" stroke="none" opacity=".8"')) +
      P(body, 'fill="none"') +
      c.hl(hiStroke('M29.6 13 V25.5 L19 44', 2, 0.75)) +
      R(24.5, 4, 15, 8, 2.5, c.f('wood', 'v')) +
      P('M38 17 Q41 4 60 3 Q57 18 38 17 Z', c.f('poison')) +
      c.hl(line('M40 15.5 Q48 9 56 6', '#2d5e1d', 1.3))
    );
  },

  runecrafting: (c) => {
    const rune = 'M26 16 V48 M26 17 L39 24.5 L26 32 L40 47';
    return (
      P('M20 6 L45 5 Q52 6 53 13 L57 50 Q57 58 49 59 H15 Q8 58 8 50 L13 13 Q14 7 20 6 Z', c.f('stone')) +
      c.hl(hiFill('M16 10 L26 8.5 L22 20 L13.5 24 Z', 0.3)) +
      c.hl(line('M49 12 L53 40 M12 42 L16 55', '#3d3932', 1.3, 0.6)) +
      c.glow(`<path d="${rune}" fill="none" stroke="#5a9cff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`, 3, 0.9) +
      c.hl(line(rune, OUT, 6.2)) +
      c.hl(line(rune, '#bfe0ff', 2.8))
    );
  },

  enchanting: (c) =>
    c.glow(P('M20 12 H44 L56 26 L32 56 L8 26 Z', 'fill="#a45ee0"'), 4, 0.65) +
    P('M20 12 H44 L56 26 L32 56 L8 26 Z', c.f('violet')) +
    c.hl(P('M20 12 L26 26 L32 12 L38 26 L44 12 M8 26 H56 M26 26 L32 56 L38 26', `fill="none" stroke="#3d1464" stroke-width="1.3" opacity=".75"`)) +
    c.hl(hiFill('M20 12 L8 26 H26 Z', 0.55) + hiFill('M26 26 L32 12 L38 26 Z', 0.3) + hiFill('M8 26 L26 26 L32 56 Z', 0.18)) +
    c.hl(P('M38 26 H56 L32 56 Z', 'fill="#2a0b4a" stroke="none" opacity=".35"')) +
    spark(c, 52, 9, 6.5, '#fff3c4') +
    spark(c, 11, 44, 4.5, '#f3d98a') +
    spark(c, 50, 46, 3.4, '#fff'),

  beastmastery: (c) => {
    const egg = 'M32 4 C45 4 54 24 54 38 C54 52 45 60 32 60 C19 60 10 52 10 38 C10 24 19 4 32 4 Z';
    let scales = '';
    for (let row = 0; row < 7; row++) {
      const y = 14 + row * 7;
      const off = row % 2 ? 4.5 : 0;
      for (let x = 4 + off; x < 62; x += 9) scales += `M${x - 4.5} ${y} Q${x} ${y + 6} ${x + 4.5} ${y} `;
    }
    const crack = 'M41 9 L36 19 L43 24 L36 33 L40 38';
    return (
      c.glow(P('M36 14 L42 24 L36 34 Z', 'fill="#ffb040"'), 4, 0.9) +
      P(egg, c.f('blood')) +
      c.hl(`<g ${c.clip(P(egg))}>${line(scales, '#5a0f06', 1.5, 0.7)}</g>`) +
      c.hl(hiFill('M18 18 C21 11 25 8 29 7.5 C24 12 21 18 20 25 Z', 0.55)) +
      c.hl(line(crack, OUT, 4.4) + line(crack, '#ffd070', 2) + line('M36 19 L30 22 M43 24 L48 26', OUT, 3.2) + line('M36 19 L30 22 M43 24 L48 26', '#ffb040', 1.3)) +
      P('M20 60 Q32 54 44 60 Z', c.f('stone', 'v')) +
      P('M8 61 Q16 52 22 57 Q32 51 42 57 Q48 52 56 61 Z', c.f('stone', 'v'))
    );
  },
};
