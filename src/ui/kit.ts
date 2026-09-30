import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/800.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/700.css';
import { mulberry32 } from '../core/rng';

/**
 * "Carved stone & iron" UI textures, generated at startup (no image files):
 * a tiling stone surface, a darker inset stone, and a 9-slice riveted iron frame.
 * Exposed to CSS as --tex-stone, --tex-inset, --tex-frame, --tex-plate.
 */

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function valueNoise(seed: number, size: number, cell: number) {
  const rng = mulberry32(seed);
  const n = Math.ceil(size / cell) + 1;
  const grid = Array.from({ length: n * n }, () => rng());
  const at = (x: number, y: number) => grid[((y % (n - 1)) * n + (x % (n - 1)))];
  return (x: number, y: number) => {
    const gx = x / cell, gy = y / cell;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const s = (t: number) => t * t * (3 - 2 * t);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy);
  };
}

function stone(seed: number, base: [number, number, number], contrast: number) {
  const size = 256;
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const n1 = valueNoise(seed, size, 64), n2 = valueNoise(seed + 1, size, 16), n3 = valueNoise(seed + 2, size, 4);
  const rng = mulberry32(seed + 9);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = n1(x, y) * 0.5 + n2(x, y) * 0.35 + n3(x, y) * 0.15;
      const speck = rng() < 0.012 ? (rng() - 0.5) * 60 : 0;
      const k = (v - 0.5) * contrast + speck;
      const i = (y * size + x) * 4;
      img.data[i] = base[0] + k;
      img.data[i + 1] = base[1] + k * 0.95;
      img.data[i + 2] = base[2] + k * 0.9;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Hairline cracks.
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 7; k++) {
    let x = rng() * size, y = rng() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (rng() - 0.5) * 40;
      y += (rng() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return c.toDataURL();
}

/** 9-slice iron frame with bevel, inner gold line and corner rivets. Slice = 16px. */
function ironFrame() {
  const S = 64, B = 16;
  const [c, ctx] = canvas(S, S);
  const grad = ctx.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#6b6e74');
  grad.addColorStop(0.5, '#3c3e44');
  grad.addColorStop(1, '#25262a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  ctx.clearRect(B, B, S - 2 * B, S - 2 * B);
  // Bevel lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(1.5, 1.5, S - 3, S - 3);
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
  ctx.strokeRect(B - 0.5, B - 0.5, S - 2 * B + 1, S - 2 * B + 1);
  // Gold inlay.
  ctx.strokeStyle = '#b8903e';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(B - 3.5, B - 3.5, S - 2 * B + 7, S - 2 * B + 7);
  // Rivets.
  for (const [x, y] of [[8, 8], [S - 8, 8], [8, S - 8], [S - 8, S - 8]]) {
    const rg = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 4.5);
    rg.addColorStop(0, '#e8e0d0');
    rg.addColorStop(0.4, '#8a8c92');
    rg.addColorStop(1, '#1a1a1e');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return c.toDataURL();
}

/** Small engraved brass plate for headers/buttons. */
function brassPlate() {
  const [c, ctx] = canvas(32, 32);
  const g = ctx.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0, '#5a4424');
  g.addColorStop(0.5, '#3a2c18');
  g.addColorStop(1, '#241a0e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  ctx.strokeStyle = '#c8a050';
  ctx.strokeRect(0.5, 0.5, 31, 31);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeRect(2.5, 2.5, 27, 27);
  return c.toDataURL();
}

export function installKit() {
  const root = document.documentElement.style;
  root.setProperty('--tex-stone', `url(${stone(7, [46, 42, 38], 46)})`);
  root.setProperty('--tex-inset', `url(${stone(21, [26, 23, 21], 30)})`);
  root.setProperty('--tex-frame', `url(${ironFrame()})`);
  root.setProperty('--tex-plate', `url(${brassPlate()})`);
}
