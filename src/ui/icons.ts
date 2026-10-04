/**
 * Dragonbound icon set: hand-built SVG game icons for the "carved stone & iron" UI.
 *
 * Every icon is drawn on a 64x64 grid with a bold dark outline, 3-tone cel-shaded
 * gradient fills, a small top-left highlight and (for spells) a soft blurred glow.
 * Empty equipment-slot icons (`slot_*`) reuse the item geometry but render as faint
 * single-colour silhouettes.
 *
 * Several icons live in one HTML document at once, so every call gets its own id
 * prefix for gradients / filters / clip paths.
 *
 * The drawings live in ./icons/: the pen and shape helpers, the shared parts, and the
 * skill and interface icon tables.
 */
import { GHOST, GHOST_SW, OUT, Pen, SW, n2, type Draw } from './icons/pen';
import { SKILL_ICONS } from './icons/skillIcons';
import { UI_ICONS } from './icons/uiIcons';

const ICONS: Record<string, Draw> = { ...SKILL_ICONS, ...UI_ICONS };

let serial = 0;

/** Every icon name `icon()` knows. */
export const ICON_NAMES: string[] = Object.keys(ICONS);

/**
 * Render an icon as a complete `<svg>` string (viewBox 0 0 64 64, width/height = size).
 * Unknown names fall back to a generic rune icon; never throws.
 */
export function icon(name: string, size = 32): string {
  const key = typeof name === 'string' && Object.prototype.hasOwnProperty.call(ICONS, name) ? name : 'rune';
  const px = typeof size === 'number' && Number.isFinite(size) && size > 0 ? n2(size) : 32;
  const ghost = key.startsWith('slot_');
  const pen = new Pen(`dbi${(serial++).toString(36)}_`, ghost);
  let body = '';
  try {
    body = ICONS[key](pen);
  } catch {
    body = '';
  }
  const root = ghost
    ? `<g fill="${GHOST}" fill-opacity=".2" stroke="${GHOST}" stroke-opacity=".6" stroke-width="${GHOST_SW}" stroke-linejoin="round" stroke-linecap="round">`
    : `<g stroke="${OUT}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round">`;
  const defs = pen.defs.length ? `<defs>${pen.defs.join('')}</defs>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 64 64" class="dbi dbi-${key}" aria-hidden="true" focusable="false">` +
    `${defs}${root}${body}</g></svg>`
  );
}
