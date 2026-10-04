/** Icons for the skills and the weapon abilities. */
import { bootPart, bowPart, helmPart, shieldPart, staffPart, swordPart, arrowAt } from './parts';
import { C, E, HI, OUT, P, R, arcArrow, hiFill, hiStroke, line, spark, star4, type Draw } from './pen';

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

  // ------------------------------------------------ abilities
  cleave: (c) => {
    // wide swoosh trailing the swing, sword at its leading edge
    const swoosh = 'M55 8 A44 44 0 0 0 5 54 A52 52 0 0 1 49 15 Z';
    return (
      c.glow(P(swoosh, 'fill="#ff7a1a"'), 3, 0.5) +
      P(swoosh, c.lin([[0, '#6e1409', 0.35], [0.45, '#d9503a', 0.85], [0.8, '#fbf6ea'], [1, '#ffffff']], 0, 1, 1, 0) + ' stroke-width="2"') +
      c.hl(P('M51 11.5 A46 46 0 0 0 10 47', `fill="none" stroke="${HI}" stroke-width="1.6" opacity=".8"`)) +
      c.hl(line('M14 58 A40 40 0 0 1 36 30 M24 60 A34 34 0 0 1 40 40', '#eee4cc', 1.8, 0.45)) +
      c.at(39, 27, 45, 0.8) + swordPart(c, '#d9503a') + '</g>'
    );
  },

  leap_slam: (c) =>
    c.glow(E(32, 53, 22, 7, 'fill="#ff7a1a"'), 3, 0.85) +
    E(32, 54, 28, 8, c.f('stone', 'v')) +
    E(32, 53.5, 18, 4.4, c.solid('#2d2822')) +
    c.hl(line('M19 53 L25 51.5 L29 54 M37 52 L44 54.5', '#ffb040', 1.8)) +
    c.rod('M3 51 Q4 41 11 36', '#ffb040', 2.8) +
    c.rod('M61 51 Q60 41 53 36', '#ffb040', 2.8) +
    P('M5 27 L10 24 L13 29 L8 31 Z', c.f('stone')) +
    P('M52 22 L58 21 L58 27 L53 28 Z', c.f('stone')) +
    c.hl(line('M15 4 V13 M49 4 V13', '#eee4cc', 2.2, 0.75)) +
    c.at(32.5, 27, -10, 0.74, 38, 32) +
    bootPart(c) +
    '</g>',

  war_cry: (c) => {
    const horn = (d: string) => P(d, c.f('bone'));
    const shout = (d: string) => c.rod(d, '#ffb040', 2.6);
    return (
      shout('M9 44 L2 42') + shout('M10 51 L3 53') + shout('M13 57 L8 62') +
      shout('M55 44 L62 42') + shout('M54 51 L61 53') + shout('M51 57 L56 62') +
      horn('M13 31 Q1 25 5 4 Q9 17 19 21 Z') +
      horn('M51 31 Q63 25 59 4 Q55 17 45 21 Z') +
      c.hl(line('M8 12 L10.5 13.6 M8.5 18 L12 20 M56 12 L53.5 13.6 M55.5 18 L52 20', '#9f8a62', 1.3)) +
      helmPart(c)
    );
  },

  multishot: (c) =>
    arrowAt(c, 7, 55, -72, 0.78, 'poison') +
    arrowAt(c, 7, 55, -45, 0.84) +
    arrowAt(c, 7, 55, -18, 0.78, 'poison') +
    spark(c, 55, 11, 4, '#fff3c4'),

  evasive_roll: (c) =>
    c.hl(line('M4 22 H13 M2 28 H10 M5 34 H12', '#eee4cc', 2, 0.7)) +
    c.at(33, 33, -18, 0.6, 38, 32) +
    bootPart(c) +
    '</g>' +
    arcArrow(c, 32, 32, 25, 150, 400, 5, 'poison'),

  arrow_rain: (c) =>
    arrowAt(c, 12, 29, 104, 0.5) +
    arrowAt(c, 30, 30, 104, 0.56) +
    arrowAt(c, 48, 29, 104, 0.5) +
    P('M9 29 Q3 22 10 17 Q10 8 21 9 Q25 2 35 4 Q43 1 48 9 Q58 8 57 17 Q63 22 56 29 Z', c.f('cloud', 'v')) +
    c.hl(hiFill('M13 16 Q14 11 21 12 Q24 6.5 32 7.5 Q26 10 24 15 Q18 13 13 16 Z', 0.5)) +
    c.hl(line('M12 25 H54', '#2e3442', 1.2, 0.6)),

  fireball: (c) => {
    const flame = 'M26 59 C12 59 5 48 7 36 C9 24 19 18 30 13 C37 10 45 6 59 4 C53 10 51 14 53 19 C56 17 59 17 62 15 C60 25 55 31 51 35 C55 35 57 35 60 33 C56 50 44 59 26 59 Z';
    const inner = 'M26 54 C16 54 11 46 13 37 C15 28 24 24 33 19 C38 17 43 14 50 12 C46 17 45 21 47 25 C50 24 52 23 54 22 C52 30 48 34 44 37 C48 38 50 38 52 38 C48 48 38 54 26 54 Z';
    return (
      c.glow(P(flame, 'fill="#ff7a1a"'), 4, 0.85) +
      P(flame, c.f('ember', 'd')) +
      P(inner, c.solid('#ffd070') + ' stroke="none"') +
      C(25, 41, 11, c.rad([[0, '#ffffff'], [0.4, '#fff3c0'], [0.8, '#ffd070'], [1, '#ffb040']], 0.4, 0.38, 0.7) + ' stroke="#c2410c" stroke-width="1.6"') +
      c.hl(E(21, 37, 3.6, 2.4, `fill="#fff" stroke="none" opacity=".9" transform="rotate(-35 21 37)"`))
    );
  },

  frost_nova: (c) => {
    let shards = '';
    let glowShape = '';
    for (let i = 0; i < 8; i++) {
      const long = i % 2 === 0;
      const L = long ? 29.5 : 21;
      const m = long ? 17 : 13.5;
      const w = long ? 5.6 : 4.4;
      const d = `M32 ${32 - L} L${32 + w} ${32 - m} L32 ${32 - 7} L${32 - w} ${32 - m} Z`;
      const tf = `transform="rotate(${i * 45 + 22.5} 32 32)"`;
      shards += P(d, `${c.f('arcane', 'h')} ${tf}`);
      shards += c.hl(P(`M32 ${32 - L + 3} L${32 - w + 1.8} ${32 - m} L32 ${32 - m + 3} Z`, `fill="#fff" stroke="none" opacity=".75" ${tf}`));
      glowShape += P(d, `fill="#8fc0ff" ${tf}`);
    }
    return (
      c.glow(C(32, 32, 20, 'fill="#5a9cff"') + glowShape, 4, 0.8) +
      shards +
      C(32, 32, 8.5, c.rad([[0, '#ffffff'], [0.45, '#e4f2ff'], [1, '#8fc0ff']], 0.4, 0.38, 0.7)) +
      c.hl(P(star4(32, 32, 6, 1.6), 'fill="#5a9cff" stroke="none" opacity=".75"'))
    );
  },

  chain_lightning: (c) => {
    const bolt = 'M37 2 L15 35 H28 L19 62 L50 24 H35.5 L46 2 Z';
    const b1 = 'M45 28 L51 33 L48 39 L58 45';
    const b2 = 'M24 44 L15 46 L12 53 L4 57';
    return (
      c.glow(P(bolt, 'fill="#5a9cff"') + line(b1 + ' ' + b2, '#5a9cff', 6), 4, 0.95) +
      c.rod(b1, '#fff3a8', 2.4) +
      c.rod(b2, '#fff3a8', 2.4) +
      P(bolt, c.f('spark', 'h') + ' stroke-linejoin="miter" stroke-miterlimit="3"') +
      c.hl(P('M37.5 5 L20 32.5 H25 Z', 'fill="#fff" stroke="none" opacity=".9"')) +
      spark(c, 58, 45, 4.5, '#fff3a8') +
      spark(c, 4.5, 57, 4.5, '#fff3a8')
    );
  },
};
