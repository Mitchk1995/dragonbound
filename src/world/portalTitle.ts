import * as THREE from 'three';
import { FONT_SETS } from '../ui/fontGlyphs';
import { drawText, layoutText, loadAtlas } from '../ui/paintedText';

// ─── Title layout (pure, tested) ────────────────────────────────────────────

/**
 * Break a destination name into one or two title lines: one line if it fits `maxChars`, else the
 * split at a word boundary that makes the longer line shortest ("Wyrmwood Foothills" → two lines).
 */
export function titleLines(name: string, maxChars = 11): string[] {
  const up = name.toUpperCase().trim();
  const words = up.split(/\s+/);
  if (up.length <= maxChars || words.length < 2) return [up];
  let best = [up], bestLen = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const len = Math.max(a.length, b.length);
    if (len < bestLen) {
      best = [a, b];
      bestLen = len;
    }
  }
  return best;
}

// ─── Title ──────────────────────────────────────────────────────────────────

/** A CSS colour for a canvas from a (linear) three.js colour, scaled by `k` in sRGB. */
const css = (c: THREE.Color, k = 1, a = 1) => {
  const s = c.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  const v = (x: number) => Math.round(Math.max(0, Math.min(1, x * k)) * 255);
  return `rgba(${v(s.r)},${v(s.g)},${v(s.b)},${a})`;
};

/**
 * Paint a title into a canvas: the zone's name in the glowing blue alphabet (case as written upper, the way the
 * plates always were), then a small rule with a gem beneath. Locked: the same letters drained to grey stone, no gem,
 * a padlock and the hint under them. `atlas` is the blue alphabet's image; until it arrives only the rule is drawn
 * (the caller repaints when it loads). Returns where the lettering and its rule sit, as fractions of the canvas, so the
 * HUD can tell when the title would slide under a panel (ui/worldText.ts).
 */
function paintTitle(ctx: CanvasRenderingContext2D, name: string, color: number, open: boolean, hint: string, atlas: ImageBitmap | null, atlasFailed = false): TitleInk {
  const { width: W, height: H } = ctx.canvas;
  ctx.clearRect(0, 0, W, H);
  const zc = new THREE.Color(color);
  const lines = titleLines(name);
  const two = lines.length > 1;
  const lay = (cap: number) => {
    ctx.font = `800 ${Math.round(cap / 0.72)}px Cinzel, 'Palatino Linotype', Georgia, serif`;
    return lines.map((l) => layoutText(l, 'blue', cap, { track: 0.04, measure: (c) => ctx.measureText(c).width }));
  };
  let cap = two ? 74 : 84;
  const widest = Math.max(...lay(cap).map((l) => l.width));
  if (widest > W * 0.9) cap = Math.floor((cap * W * 0.9) / widest);
  const laid = lay(cap);
  const size = cap / 0.72;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const gap = size * 1.02;
  const blockH = gap * (lines.length - 1) + size * 0.72;
  const top = (H - 64 - blockH) / 2 + size * 0.72;
  const depth = Math.round(size * 0.11);
  if (atlas) {
    ctx.save();
    if (!open) ctx.filter = 'grayscale(1) brightness(0.75)';
    ctx.fillStyle = open ? '#a8dcff' : '#b0aca6';
    laid.forEach((l, i) => drawText(ctx, atlas, 'blue', l, (W - l.width) / 2, top + i * gap));
    ctx.restore();
  } else if (atlasFailed) {
    // The alphabet could not be loaded: plain letters rather than a nameless portal.
    ctx.fillStyle = open ? '#a8dcff' : '#b0aca6';
    ctx.textAlign = 'center';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * gap));
  }
  // Rule with a gem (open) or a padlock and the hint (locked).
  const ry = top + (lines.length - 1) * gap + depth + 34;
  const cx = W / 2;
  ctx.lineWidth = 3;
  const rw = Math.min(W * 0.34, 260);
  const half = Math.max(rw, ...laid.map((l) => l.width / 2), open ? 0 : 200);
  const ink: TitleInk = { left: (cx - half) / W, right: (cx + half) / W, top: (top - cap) / H, bottom: Math.min(1, (ry + (open ? 14 : 36)) / H) };
  const rule = ctx.createLinearGradient(cx - rw, 0, cx + rw, 0);
  rule.addColorStop(0, 'rgba(0,0,0,0)');
  rule.addColorStop(0.5, open ? css(new THREE.Color(0xe8c890)) : 'rgb(110,106,102)');
  rule.addColorStop(1, 'rgba(0,0,0,0)');
  if (open) {
    ctx.strokeStyle = rule;
    ctx.beginPath();
    ctx.moveTo(cx - rw, ry);
    ctx.lineTo(cx + rw, ry);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx, ry);
    ctx.rotate(Math.PI / 4);
    ctx.shadowColor = css(zc);
    ctx.shadowBlur = 14;
    ctx.fillStyle = css(zc.clone().lerp(new THREE.Color(1, 1, 1), 0.25));
    ctx.strokeStyle = 'rgba(20,14,10,0.95)';
    ctx.lineWidth = 3;
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeRect(-9, -9, 18, 18);
    ctx.restore();
  } else {
    ctx.font = `600 46px Cinzel, 'Palatino Linotype', Georgia, serif`;
    (ctx as any).letterSpacing = '4px';
    const label = hint.toUpperCase();
    const tw = ctx.measureText(label).width;
    const lx = cx - (tw + 52) / 2, ly = ry + 6;
    // Padlock: shackle and body, outlined dark like the letters.
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(12,10,10,0.9)';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(lx + 16, ly - 8, 10, Math.PI, 0);
    ctx.stroke();
    ctx.strokeRect(lx, ly - 8, 32, 26);
    ctx.strokeStyle = 'rgb(168,164,158)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(lx + 16, ly - 8, 10, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgb(168,164,158)';
    ctx.fillRect(lx, ly - 8, 32, 26);
    ctx.fillStyle = 'rgb(40,38,40)';
    ctx.fillRect(lx + 14, ly, 5, 10);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(12,10,10,0.9)';
    ctx.strokeText(label, lx + 52, ly + 5);
    ctx.fillStyle = 'rgb(176,172,166)';
    ctx.fillText(label, lx + 52, ly + 5);
  }
  return ink;
}

/** Where a title's lettering sits on its canvas: fractions of the width (left, right) and height (top, bottom). */
export interface TitleInk { left: number; right: number; top: number; bottom: number }

/** A camera-facing title sprite (null outside a browser, e.g. in tests). */
export function buildTitle(name: string, color: number, open: boolean, hint: string): THREE.Sprite | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  let atlas: ImageBitmap | null = null, atlasFailed = false;
  const draw = () => {
    ink = paintTitle(ctx, name, color, open, hint, atlas, atlasFailed);
    if (s) s.userData.ink = ink;
    tex.needsUpdate = true;
  };
  let s: THREE.Sprite | null = null, ink: TitleInk | null = null;
  draw();
  // Repaint once the alphabet has loaded, and once the display font has (the first paint may use the fallback serif).
  void loadAtlas(FONT_SETS.blue).then((a) => {
    atlas = a;
    atlasFailed = !a;
    if (!a) console.warn('portal titles: the blue alphabet failed to load');
    draw();
  });
  const fonts = (document as any).fonts as FontFaceSet | undefined;
  if (fonts && !fonts.check("800 64px Cinzel")) void fonts.load("800 64px Cinzel").then(draw, () => {});
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  // Lit titles glow just past the bloom threshold; sealed ones stay matte.
  mat.color.setScalar(open ? 1.12 : 0.9);
  s = new THREE.Sprite(mat);
  s.name = 'portal-title';
  s.userData.ink = ink;
  s.scale.set(3.8, (3.8 * 384) / 1024, 1);
  s.renderOrder = 6;
  return s;
}
