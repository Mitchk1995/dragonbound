"""
Damage-number digits (src/ui/worldText.ts): cuts the painted digit sheet (generated with Codex, see
public/ui/digits/LICENSES.md) into four small atlases, one per kind of floating number, plus the glyph table
src/ui/digitGlyphs.ts that lays them out.

The sheet has three rows of "0 1 2 3 4 5 6 7 8 9 + -" on a flat dark ground: warm white (normal hits), molten gold
(critical hits, with an ember glow) and green (heals). Each glyph is found as a connected piece of the row's solid
colour, its soft edge and glow are kept by reading how far every pixel is from the ground (the ground is divided back
out, so the glow becomes a translucent orange rather than a dark box), and every glyph in a row is cut to one shared
height and baseline so a number is just glyphs set side by side. The hurt set is the white set recoloured to the game's
hurt red with its dark outline kept dark.

Run with Python 3 (Pillow, NumPy and SciPy) after putting the sheet in SRC:
    python tools/digit_atlas.py
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = Path('D:/dragonbound-archive/codex/digits/digits-sheet.png')
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'ui' / 'digits'
TABLE = ROOT / 'src' / 'ui' / 'digitGlyphs.ts'
CHARS = '0123456789+-'
SCALE = 0.5  # the sheet's glyphs are ~110 px tall; the game shows them at 20-45 px
LABEL_X = 160  # the row labels (A, B, C) sit left of this and are not glyphs
GAP = 3  # sheet px of space between neighbouring solid glyphs
HURT_RED = (255, 90, 74)  # the hurt colour in style.css (.floater.hurt)

# name: sheet rows (y range), the solid-colour threshold (distance from the ground), the soft ramp
# (distance where alpha starts and where it is full), the glow padding kept round each glyph (sheet px)
ROWS = {
    'white': dict(y=(110, 370), core=60, ramp=(10, 60), pad=6),
    'crit': dict(y=(390, 650), core=120, ramp=(10, 130), pad=22),
    'heal': dict(y=(690, 930), core=60, ramp=(10, 60), pad=6),
}


def cut_row(sheet, bg, spec):
    y0, y1 = spec['y']
    row = sheet[y0:y1].astype(float)
    dist = np.sqrt(((row - bg) ** 2).sum(-1))
    core = dist > spec['core']
    core[:, :LABEL_X] = False
    core = ndimage.binary_opening(core, iterations=1)
    lab, n = ndimage.label(core)
    sizes = ndimage.sum(core, lab, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > 400]
    if len(keep) != len(CHARS):
        raise SystemExit(f'found {len(keep)} glyphs, expected {len(CHARS)}')
    objs = ndimage.find_objects(lab)
    keep.sort(key=lambda i: objs[i - 1][1].start)
    # Soft alpha from distance to the ground; colour = the ground divided back out of the pixel.
    lo, hi = spec['ramp']
    alpha = np.clip((dist - lo) / (hi - lo), 0, 1)
    alpha = alpha * alpha * (3 - 2 * alpha)
    a = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip(bg + (row - bg) / a, 0, 255)
    # Every pixel belongs to its nearest glyph, so glows meeting between neighbours are split cleanly.
    sel = np.zeros(lab.shape, int)
    for k, i in enumerate(keep):
        sel[lab == i] = k + 1
    _, (iy, ix) = ndimage.distance_transform_edt(sel == 0, return_indices=True)
    owner = sel[iy, ix]
    boxes = [objs[i - 1] for i in keep]
    pad = spec['pad']
    h, w = row.shape[:2]
    top = max(0, min(b[0].start for b in boxes) - pad)
    bottom = min(h, max(b[0].stop for b in boxes) + pad)
    cells = []
    for k, b in enumerate(boxes):
        x0, x1 = max(0, b[1].start - pad), min(w, b[1].stop + pad)
        rgba = np.zeros((bottom - top, x1 - x0, 4))
        rgba[..., :3] = rgb[top:bottom, x0:x1]
        rgba[..., 3] = alpha[top:bottom, x0:x1] * (owner[top:bottom, x0:x1] == k + 1) * 255
        cells.append(dict(
            img=rgba, core_w=b[1].stop - b[1].start, left=b[1].start - x0,
            core_top=b[0].start - top, core_bottom=b[0].stop - top))
    baseline = int(np.median([c['core_bottom'] for c in cells[:10]]))
    top = int(np.median([c['core_top'] for c in cells[:10]]))
    return cells, (baseline, top)


def resize(rgba, scale):
    """Resize with premultiplied alpha so the soft edge and glow do not fringe."""
    a = rgba[..., 3:4] / 255
    pre = np.concatenate([rgba[..., :3] * a, rgba[..., 3:4]], -1)
    h, w = rgba.shape[:2]
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    chans = [np.array(Image.fromarray(pre[..., k].astype(np.float32), 'F').resize(size, Image.LANCZOS)) for k in range(4)]
    out = np.stack(chans, -1)
    aa = np.clip(out[..., 3:4], 0, 255)
    rgb = np.where(aa > 0.5, out[..., :3] / np.maximum(aa / 255, 1e-3), 0)
    return np.clip(np.concatenate([rgb, aa], -1), 0, 255).astype(np.uint8)


def recolour_hurt(rgba):
    """White set -> hurt red: luminance drives a red ramp, so the brown outline stays a dark red-brown."""
    out = rgba.astype(float).copy()
    lum = (out[..., :3] * [0.299, 0.587, 0.114]).sum(-1) / 255
    k = np.clip(lum / 0.88, 0, 1.25)[..., None]
    red = np.array(HURT_RED, float)
    base = red * np.minimum(k, 1) ** 1.6
    lift = (255 - red) * np.maximum(k - 1, 0) * 1.4
    out[..., :3] = np.clip(base + lift, 0, 255)
    return out.astype(np.uint8)


def pack(name, glyphs, base):
    """One strip: glyphs left to right, one shared height, with a 2 px gap between them."""
    resized = [resize(g['img'], SCALE) for g in glyphs]
    cell_h = max(r.shape[0] for r in resized)
    width = sum(r.shape[1] + 2 for r in resized)
    atlas = np.zeros((cell_h, width, 4), np.uint8)
    table, x = [], 0
    for ch, g, r in zip(CHARS, glyphs, resized):
        atlas[:r.shape[0], x:x + r.shape[1]] = r
        table.append(dict(
            c=ch, x=x, w=r.shape[1],
            adv=round((g['core_w'] + GAP) * SCALE, 2),  # solid width plus a small gap
            lead=round(g['left'] * SCALE, 2)))  # where the solid part starts inside the sprite
        x += r.shape[1] + 2
    Image.fromarray(atlas, 'RGBA').save(OUT / f'{name}.png', optimize=True)
    baseline, top = base
    return dict(file=f'ui/digits/{name}.png', w=width, h=cell_h, top=round(top * SCALE, 2), base=round(baseline * SCALE, 2), glyphs=table)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = np.array(Image.open(SRC).convert('RGB'))
    bg = np.median(sheet[:20, :20].reshape(-1, 3), 0)
    sets, white = {}, None
    for name, spec in ROWS.items():
        cells, base = cut_row(sheet, bg, spec)
        sets[name] = pack(name, cells, base)
        if name == 'white':
            white = (cells, base)
    cells, base = white
    sets['hurt'] = pack('hurt', [dict(c, img=recolour_hurt(c['img'])) for c in cells], base)
    for name, s in sets.items():
        print(name, s['w'], 'x', s['h'], (OUT / f'{name}.png').stat().st_size, 'bytes')
    body = json.dumps(sets, indent=2)
    TABLE.write_text(
        '// Generated by tools/digit_atlas.py: the damage-number atlases (public/ui/digits) and where each glyph sits.\n'
        '// `w`/`h`: the atlas size; `top`/`base`: where the digit tops and baseline sit down a sprite; per glyph `x`/`w`: its\n'
        '// rect in the atlas, `adv`: how far the next glyph moves along, `lead`: where its solid part starts.\n'
        'export interface DigitGlyph { c: string; x: number; w: number; adv: number; lead: number }\n'
        'export interface DigitSet { file: string; w: number; h: number; top: number; base: number; glyphs: DigitGlyph[] }\n'
        "export type DigitKind = 'white' | 'crit' | 'heal' | 'hurt';\n"
        f'export const DIGIT_SETS: Record<DigitKind, DigitSet> = {body};\n',
        encoding='utf-8', newline='\n')


if __name__ == '__main__':
    main()
