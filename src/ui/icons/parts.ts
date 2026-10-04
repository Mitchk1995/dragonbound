/** Shared pieces several icons are built from: weapons, armour, jewellery and the scroll sheet. */
import { C, E, HI, HOLE, IRON_LINE, P, R, hiFill, hiStroke, line, spark, type Dir, type Pen, type Tone } from './pen';

/** Vertical sword, point up, spanning y 3..63.6 around x=32. */
export function swordPart(c: Pen, gem?: string): string {
  return (
    P('M32 3 L37.5 11 V43 H26.5 V11 Z', c.f('iron', 'h')) +
    c.hl(line('M32 13 V40', IRON_LINE, 1.6)) +
    c.hl(hiStroke('M31 6.5 L28.6 10.5 V41', 1.3, 0.8)) +
    R(17, 42, 30, 7, 3.5, c.f('gold', 'v')) +
    c.hl(hiStroke('M20 44 H29', 1.4, 0.8)) +
    R(28.6, 49, 6.8, 8.5, 1.5, c.f('leather', 'h')) +
    c.hl(line('M29.5 52 H34.5 M29.5 55 H34.5', '#3a200e', 1.1)) +
    C(32, 60, 3.6, c.f('gold')) +
    (gem ? c.hl(C(32, 45.5, 2.6, `fill="${gem}" stroke-width="1.4"`)) : '')
  );
}

const SHIELD_OUT = 'M10 9 Q32 3 54 9 V28 Q54 48 32 61 Q10 48 10 28 Z';
const SHIELD_IN = 'M16 13.5 Q32 9 48 13.5 V28 Q48 44 32 54 Q16 44 16 28 Z';

/** Iron-rimmed heater shield with a coloured field and a charge drawn on top. */
export function shieldPart(c: Pen, field: Tone, charge: string, dir: Dir = 'd'): string {
  const rivet = (x: number, y: number) => C(x, y, 1.9, `${c.solid('#e6c874')} stroke-width="1.3"`);
  return (
    P(SHIELD_OUT, c.f('iron')) +
    c.hl(hiStroke('M13 11 Q32 5.5 51 11', 1.4, 0.7)) +
    P(SHIELD_IN, c.f(field, dir)) +
    c.hl(hiFill('M18 15.5 Q24 12.8 30 12 V20 Q24 20.5 18 23 Z', 0.28)) +
    charge +
    c.hl(rivet(32, 6.3) + rivet(13, 17) + rivet(51, 17) + rivet(14.2, 37) + rivet(49.8, 37) + rivet(32, 57.6))
  );
}

/** Horizontal arrow, nock at (7,32), tip at (62.5,32). */
function arrowPart(c: Pen, fletch: Tone = 'blood'): string {
  return (
    c.rod('M11 32 H53', '#8e5d34', 3) +
    c.hl(line('M12 31.2 H50', '#c08a58', 1)) +
    P('M50.5 25.5 L62.5 32 L50.5 38.5 L53.5 32 Z', c.f('iron', 'v')) +
    P('M23 32 L15 25 H7.5 L12.5 32 L7.5 39 H15 Z', c.f(fletch, 'v')) +
    c.hl(line('M8 32 H22', '#3a0e06', 1.2))
  );
}

/** Arrow placed with its nock at (nx,ny) pointing at angle deg. */
export const arrowAt = (c: Pen, nx: number, ny: number, deg: number, s: number, fletch: Tone = 'blood') =>
  c.at(nx, ny, deg, s, 7, 32) + arrowPart(c, fletch) + '</g>';

/** Recurve bow, belly facing left; arrow pointing right when drawn. */
export function bowPart(c: Pen, drawn: boolean): string {
  const limb = 'M38 5 Q50 7 53 20 Q56 32 53 44 Q50 57 38 59';
  const str = drawn ? 'M38 5 L13 32 L38 59' : 'M38 5 L38 59';
  return (
    (c.ghost ? P(str, 'fill="none" stroke-width="1.4"') : c.rod(str, '#efe6cf', 1.4, 1.1)) +
    (drawn ? arrowPart(c) : '') +
    c.rod(limb, '#7a4c2a', 4.8) +
    c.hl(hiStroke('M40.5 7.8 Q49.5 10.5 51.2 20.5', 1.5, 0.55, '#e0b07a')) +
    C(38, 5, 2.3, c.f('bone')) +
    C(38, 59, 2.3, c.f('bone')) +
    R(50.5, 25.5, 7.5, 13, 2, c.f('leather', 'h')) +
    c.hl(line('M51.5 29.5 H57 M51.5 34.5 H57', '#3a200e', 1.1))
  );
}

/** Magic staff with glowing orb. */
export function staffPart(c: Pen): string {
  const orb = c.rad([[0, '#ffffff'], [0.25, '#e4f2ff'], [0.55, '#8fc0ff'], [0.85, '#5a9cff'], [1, '#2c5fc4']], 0.38, 0.34, 0.7);
  return (
    c.glow(C(44, 20, 17, 'fill="#5a9cff"'), 5, 0.75) +
    c.rod('M9 58 L37 30', '#6b4426', 5) +
    c.hl(line('M10 55.5 L35 30.5', '#a4744a', 1.4)) +
    P('M34 36 Q24 22 34 11 Q30 22 40 30 Z', c.f('gold')) +
    P('M28 30 Q42 40 53 30 Q42 34 34 25 Z', c.f('gold')) +
    C(44, 20, 11, orb) +
    c.hl(E(40, 16, 4, 2.6, `fill="${HI}" stroke="none" opacity=".85" transform="rotate(-35 40 16)"`)) +
    C(36, 32, 3.6, c.f('gold')) +
    spark(c, 56, 7, 5.5) +
    spark(c, 58, 34, 3.2, '#bfe0ff')
  );
}

/** Open-faced iron helm with nasal (front view). */
export function helmPart(c: Pen): string {
  const rivet = (x: number) => C(x, 40, 1.4, `${c.solid('#fff0b8')} stroke="none"`);
  return (
    P('M13 40 Q12 10 32 9 Q52 10 51 40 Z', c.f('iron')) +
    c.hl(line('M32 11 V37', IRON_LINE, 1.8)) +
    c.hl(hiStroke('M18 31 Q18.5 18 28 13.5', 2.4, 0.7)) +
    P('M14 43 V55 Q19 58 26 51 V43 Z', c.f('iron', 'v')) +
    P('M50 43 V55 Q45 58 38 51 V43 Z', c.f('iron', 'v')) +
    P('M26 43 H38 V51 Q32 54 26 51 Z', c.solid(HOLE)) +
    R(11, 36, 42, 8, 2.5, c.f('gold', 'v')) +
    c.hl(rivet(17) + rivet(24) + rivet(40) + rivet(47)) +
    P('M29.5 42 V56.5 L32 60 L34.5 56.5 V42 Z', c.f('iron', 'h'))
  );
}

/** Side-view boot, toe right. bbox x 17..60, y 6..57. */
export function bootPart(c: Pen): string {
  return (
    P('M20 10 H38 V33 L51 38 Q58 40.5 58 47 V52 H20 Z', c.f('leather')) +
    c.hl(hiStroke('M23.5 14 V44', 2.2, 0.35)) +
    P('M44 36.5 L51 38.5 Q58 41 58 47 V52 H44 Z', c.f('iron')) +
    R(17.5, 51, 43, 6.5, 2.5, c.f('darkIron', 'v')) +
    R(17, 6, 24.5, 9, 2.5, c.f('redLeather', 'v')) +
    c.hl(line('M28 20 L36 23 M28 26 L36 29', '#e8cf8f', 1.6)) +
    c.hl(C(47, 44, 1.5, `fill="#dfe5ea" stroke="none"`))
  );
}

/** Chestplate. */
export function bodyPart(c: Pen): string {
  return (
    P('M20 7 L11 11 L5 21 L12 30 L14 28 V55 Q32 62 50 55 V28 L52 30 L59 21 L53 11 L44 7 Q32 17 20 7 Z', c.f('iron')) +
    c.hl(line('M14 28 L19 17 M50 28 L45 17', IRON_LINE, 1.6)) +
    c.hl(line('M32 17 V44', IRON_LINE, 1.6)) +
    c.hl(hiStroke('M9 20 L13 13 L19 10', 2.2, 0.6)) +
    c.hl(hiFill('M20 20 Q25 24 30 24 V36 Q23 36 20 32 Z', 0.3)) +
    P('M20 7 Q32 17 44 7 L41 5 Q32 12 23 5 Z', c.f('gold')) +
    R(13, 43, 38, 7, 2, c.f('leather', 'v')) +
    R(28.5, 42, 7, 9, 1.5, c.f('gold')) +
    c.hl(R(30.5, 44.5, 3, 4, 0.8, `fill="${HOLE}" stroke="none"`))
  );
}

/** Gauntlet (back of hand, fingers up). */
export function glovesPart(c: Pen): string {
  return (
    P('M22 40 L11 29.5 Q8 25 12.5 23 L23 29 Z', c.f('iron')) +
    P('M21 44 V15 Q21 8.5 27 8.5 H40 Q46 8.5 46 15 V44 Z', c.f('iron')) +
    c.hl(line('M28 10 V25 M33.5 9.5 V25 M39 10 V25', IRON_LINE, 1.5)) +
    c.hl(hiStroke('M24.5 13 V24', 2, 0.65)) +
    R(19.5, 25, 28, 7, 2.5, c.f('gold', 'v')) +
    P('M17 43 H50 L52 59 H15 Z', c.f('leather')) +
    c.hl(line('M18 49 H49', '#3a200e', 1.2)) +
    c.hl(hiStroke('M19 46 H30', 1.6, 0.45))
  );
}

/** Gold chain with a ruby pendant. */
export function amuletPart(c: Pen): string {
  const gem = c.rad([[0, '#ffb3a0'], [0.35, '#e0503a'], [0.75, '#b02a1a'], [1, '#6e1409']], 0.4, 0.32, 0.75);
  return (
    c.rod('M12 5 Q13 31 32 35 Q51 31 52 5', '#d8b25a', 2.6) +
    c.hl(line('M12.6 8 Q14 28 30 33.5', '#f3d98a', 1)) +
    P('M32 29 L45 44 L32 61 L19 44 Z', c.f('gold')) +
    P('M32 35.5 L39.5 44.5 L32 54.5 L24.5 44.5 Z', gem) +
    c.hl(hiFill('M32 38 L28 44 L30.5 44.5 Z', 0.9)) +
    c.hl(C(32, 29.5, 2.6, `${c.f('gold')} stroke-width="1.6"`))
  );
}

/** Gold ring with a sapphire. */
export function ringPart(c: Pen): string {
  const gem = c.rad([[0, '#ffffff'], [0.3, '#bfe0ff'], [0.7, '#5a9cff'], [1, '#2c5fc4']], 0.38, 0.32, 0.75);
  return (
    P('M32 22 A19 17 0 1 1 31.99 22 Z M32 29.5 A11.5 10 0 1 0 32.01 29.5 Z', `${c.f('gold')} fill-rule="evenodd"`) +
    c.hl(hiStroke('M17.5 36 Q19 27.5 26 24.5', 2, 0.7)) +
    P('M22 24 L26 12 H38 L42 24 Q32 28 22 24 Z', c.f('gold', 'v')) +
    C(32, 15, 8.5, gem) +
    c.hl(E(29.5, 12.5, 2.8, 1.8, `fill="#fff" stroke="none" opacity=".9" transform="rotate(-30 29.5 12.5)"`))
  );
}

export function scrollSheet(c: Pen): string {
  return (
    P('M15 12 H49 V52 H15 Z', c.f('bone', 'h')) +
    R(11, 6, 42, 9, 4.5, c.f('wood', 'v')) +
    C(9.5, 10.5, 3.6, c.f('gold')) +
    C(54.5, 10.5, 3.6, c.f('gold')) +
    R(11, 49, 42, 10, 5, c.f('bone', 'v')) +
    c.hl(line('M14 54 H50', '#b8a47c', 1.2))
  );
}
