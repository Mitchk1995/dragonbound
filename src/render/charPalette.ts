import * as THREE from 'three';
import type { CharPaintKind } from './surface';

const SCALY = new Set(['drakeling', 'cinderwing', 'kobold', 'whelp']);
const HARNESSED = new Set(['drakeling', 'cinderwing']);

/** The painted recipe for a fixed colour, from its model and the material it reads as. */
export function fixedPaint(model: string, c: THREE.Color, metallic: boolean, double = false): CharPaintKind | null {
  const { h, s, l } = c.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  const hue = h * 360;
  if (metallic) return 'metal';
  if (l < 0.095) return null; // eyes, pupils, visor slits and face shadows stay clean
  if (model === 'golem') return 'stone';
  if (SCALY.has(model)) {
    if (double) return 'membrane';
    if (l > 0.72) return model === 'whelp' ? 'soft' : 'bone';
    // Dragon harnesses have gilt fittings and leather straps among their scales.
    if (HARNESSED.has(model) && hue >= 34 && hue <= 56 && s > 0.5 && l > 0.4) return 'gilt';
    if (HARNESSED.has(model) && hue >= 18 && hue <= 40 && s < 0.6 && l < 0.4) return 'leather';
    return model === 'whelp' ? 'softScales' : 'scales';
  }
  if (model.startsWith('gear_u_') && l > 0.5 && s < 0.6 && hue >= 25 && hue <= 60) return 'wyrmbone';
  if (l > 0.75 && s < 0.6) return model.startsWith('gear_') ? 'bone' : 'soft';
  if (hue >= 34 && hue <= 56 && s > 0.5 && l > 0.4 && l < 0.78) return 'trim';
  if (s < 0.14) return 'metal';
  if (model === 'goblin' && hue > 70 && hue < 160) return 'hide';
  if (hue >= 14 && hue <= 40 && s > 0.4 && l > 0.58 && l < 0.86) return 'skin';
  if (hue >= 10 && hue <= 45 && l < 0.42) return 'leather';
  return 'cloth';
}
