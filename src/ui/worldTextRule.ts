import type { Mode } from '../game';

/** Names over heads, ground labels, health bars and floating numbers belong to play; the title and creation screens show the bare scene. */
export const worldTextShows = (mode: Mode): boolean => mode === 'play';

/**
 * How tall the gold capitals stand (px) in each kind of world lettering. A name over a head is the label that matters
 * (who is this?); a pickup word ("+30 gold") is a passing note, so it sits a clear step smaller and lighter.
 */
export const NAME_CAP = 21;
export const WORD_CAP = 15;

/** A box on the screen, in CSS px. */
export interface ScreenRect { left: number; top: number; right: number; bottom: number }

/** How close (px) a world label may come to a HUD panel before it gives way. */
export const HUD_CLEARANCE = 6;

/** True when `r` comes within `pad` px of any of the HUD panels (empty boxes, such as hidden panels, never count). */
export function overlapsHud(r: ScreenRect, panels: readonly ScreenRect[], pad = HUD_CLEARANCE): boolean {
  for (const p of panels) {
    if (p.right <= p.left || p.bottom <= p.top) continue;
    if (r.right > p.left - pad && r.left < p.right + pad && r.bottom > p.top - pad && r.top < p.bottom + pad) return true;
  }
  return false;
}
