import * as THREE from 'three';
import type { SurfaceKind } from './textures';

/**
 * The surface shaders' entry point: triplanar surface detail (surfaceDetail.ts), vertical grade
 * shading (grade.ts), painted characters and gear (charPaint.ts, charGeometry.ts), the painted
 * ground (ground.ts), and here the detail a code-built prop part gets.
 */
export { addPatch, patchKeys, type SurfaceSpace } from './patch';
export { applySurface } from './surfaceDetail';
export { applyGrade, applyHeightShade, gradeRow, MODEL_GRADE, trackGradeRoot, type Grade } from './grade';
export { prepareCharGeometry } from './charGeometry';
export { applyCharPaint, CHAR_PAINTS, packCharAttributes, paintAttributes, setCharPaint, setPaintGain, type CharPaint, type CharPaintKind } from './charPaint';
export { applyGround, CAVE_TERRACE, GROUND_TIME } from './ground';

// ─── Props ──────────────────────────────────────────────────────────────────

/**
 * The detail a code-built prop part gets from its colour: low-saturation grey (masonry, rock) is
 * stone; everything else (wood, cloth, metal, bone) stays clean flat colour.
 */
export function propSurface(c: THREE.Color): SurfaceKind | null {
  // Judge the colour as authored (sRGB): in linear space warm greys look saturated and brown.
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  return hsl.s < 0.12 && hsl.l > 0.2 && hsl.l < 0.8 ? 'stone' : null;
}
