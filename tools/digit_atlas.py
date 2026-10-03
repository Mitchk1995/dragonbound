"""
Painted text (src/ui/paintedText.ts): the damage-number digits and the three alphabets, one tool.

Damage-number digits (src/ui/worldText.ts): cuts the painted digit sheet (generated with Codex, see
public/ui/digits/LICENSES.md) into four small atlases, one per kind of floating number, plus the glyph table
src/ui/digitGlyphs.ts that lays them out.

The sheet has three rows of "0 1 2 3 4 5 6 7 8 9 + -" on a flat dark ground: warm white (normal hits), molten gold
(critical hits, with an ember glow) and green (heals). Each glyph is found as a connected piece of the row's solid
colour, its soft edge and glow are kept by reading how far every pixel is from the ground (the ground is divided back
out, so the glow becomes a translucent orange rather than a dark box), and every glyph in a row is cut to one shared
height and baseline so a number is just glyphs set side by side. The hurt set is the white set recoloured to the game's
hurt red with its dark outline kept dark.

Alphabets (public/ui/font, src/ui/fontGlyphs.ts): four Codex-generated sheets (alpha-A forged gold, alpha-B brown
ink with a cream outline, alpha-C glowing pale blue, alpha-N neutral silver-white greyscale that the menus tint per
meaning at runtime), each five rows of A-M, N-Z, a-m, n-z and "0123456789.,!?'-:" on a flat ground; the neutral sheet
has a sixth row `+ % / ( ) ? ? & # [ ] " ;` whose two middle `?` are a generation mistake and are skipped (the
middle dot is built from the full stop, raised). Glyphs are cut by row band and column gap (touching letters are
split at the thinnest column, split marks such as the quote are joined), set on one shared baseline, the ground is
divided back out of the glow, and each glyph advances by its own width plus a little tracking. Run
`python tools/digit_atlas.py` for both, or add `digits` / `fonts` to run one.

Run with Python 3 (Pillow, NumPy and SciPy) after putting the sheets in SRC and FONT_SRC:
    python tools/digit_atlas.py
"""

import json
import sys
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


def digits():
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
        'export interface GlyphSet { file: string; w: number; h: number; top: number; base: number; space?: number; glyphs: DigitGlyph[] }\n'
        "export type DigitKind = 'white' | 'crit' | 'heal' | 'hurt';\n"
        f'export const DIGIT_SETS: Record<DigitKind, GlyphSet> = {body};\n',
        encoding='utf-8', newline='\n')


# ---- The alphabets -------------------------------------------------------------------------------------------------

FONT_SRC = Path('D:/dragonbound-archive/codex/alpha')
FONT_OUT = ROOT / 'public' / 'ui' / 'font'
FONT_TABLE = ROOT / 'src' / 'ui' / 'fontGlyphs.ts'
FONT_ROWS = ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ', 'abcdefghijklm', 'nopqrstuvwxyz', "0123456789.,!?'-:"]
SKIP = '@'  # a placeholder in a row for a piece the sheet drew wrongly: it is cut (to keep the count) and dropped
CAP_PX = 56  # cap height in the atlas: the zone plaque is ~16 px (x2 on a 200% display) and nothing is set larger
TRACK = 0.06  # the gap between glyphs, in cap heights, added to each glyph's own width
SPACE = 0.3  # a word space, in cap heights
CORE = 60  # distance from the ground that counts as solid letter
# name: sheet, glow padding kept round each glyph (sheet px), soft ramp (distance from the ground where alpha starts / is full)
FONTS = {
    'gold': dict(file='alpha-A.png', pad=10, ramp=(10, 50)),
    'brown': dict(file='alpha-B.png', pad=10, ramp=(10, 50)),
    'blue': dict(file='alpha-C.png', pad=26, ramp=(8, 90)),
    # The neutral sheet: tinted per meaning at runtime (src/ui/uiText.ts). `+` and `·` are real glyphs here, not made.
    'neutral': dict(file='alpha-N.png', pad=10, ramp=(10, 50), rows=FONT_ROWS + ['+%/()@@&#[]";'], dot=True),
}


def runs(flags, min_gap):
    """(start, stop) pieces of consecutive true flags, joining pieces closer than min_gap + 1."""
    out, start, gap, end = [], None, 0, 0
    for i, f in enumerate(flags):
        if f:
            if start is None:
                start = i
            gap, end = 0, i
        elif start is not None:
            gap += 1
            if gap > min_gap:
                out.append((start, end + 1))
                start = None
    if start is not None:
        out.append((start, end + 1))
    return out


def fit_pieces(cols, chars, profile, path):
    """Make the column pieces of a row match its characters: join the closest pair of pieces while there are too
    many (a split quote, a dotted i), split the widest piece at its thinnest column while there are too few (touching
    letters)."""
    cols = list(cols)
    while len(cols) > len(chars):
        j = min(range(len(cols) - 1), key=lambda k: cols[k + 1][0] - cols[k][1])
        cols[j:j + 2] = [(cols[j][0], cols[j + 1][1])]
    while len(cols) < len(chars):
        i = max(range(len(cols)), key=lambda k: cols[k][1] - cols[k][0])
        a, b = cols[i]
        lo, hi = a + (b - a) // 4, b - (b - a) // 4
        m = lo + int(np.argmin(profile[lo:hi]))
        cols[i:i + 1] = [(a, m), (m + 1, b)]
    return cols


def cut_alphabet(path, spec):
    rows = spec.get('rows', FONT_ROWS)
    sheet = np.array(Image.open(path).convert('RGB')).astype(float)
    bg = np.median(np.concatenate([sheet[:8].reshape(-1, 3), sheet[-8:].reshape(-1, 3)]), 0)
    dist = np.sqrt(((sheet - bg) ** 2).sum(-1))
    core = dist > CORE
    bands = [r for r in runs(core.any(1), 12) if r[1] - r[0] > 30]
    if len(bands) != len(rows):
        raise SystemExit(f'{path}: found {len(bands)} rows')
    # Soft alpha from the distance to the ground; small gaps inside a stroke are filled solid.
    lo, hi = spec['ramp']
    ramp = np.clip((dist - lo) / (hi - lo), 0, 1)
    ramp = ramp * ramp * (3 - 2 * ramp)
    # Small gaps inside a stroke are ink, not counters: fill holes smaller than a stroke is wide.
    holes, n = ndimage.label(ndimage.binary_fill_holes(core) & ~core)
    small = np.isin(holes, [i + 1 for i, s in enumerate(ndimage.sum(holes > 0, holes, range(1, n + 1))) if s < 200])
    solid = core | small
    alpha = np.maximum(ramp, solid)
    a = np.maximum(ramp, 1e-3)[..., None]
    rgb = np.clip(bg + (sheet - bg) / a, 0, 255)
    rgb = np.where(solid[..., None] & (ramp[..., None] < 1), sheet, rgb)
    bounds = [0] + [(bands[i][1] + bands[i + 1][0]) // 2 for i in range(len(bands) - 1)] + [core.shape[0]]
    cells = {}
    for i, ((y0, y1), chars) in enumerate(zip(bands, rows)):
        strip = core[max(bounds[i], y0 - 10):min(bounds[i + 1], y1 + 10)]
        cols = [c for c in runs(strip.any(0), 3) if c[1] - c[0] > 2]
        cols = fit_pieces(cols, chars, strip.sum(0), path)
        spans = []
        for (x0, x1) in cols:
            ys = np.where(core[bounds[i]:bounds[i + 1], x0:x1].any(1))[0] + bounds[i]
            spans.append((ys[0], ys[-1] + 1))
        base = int(np.median([b for _, b in spans]))
        # Which glyph a pixel belongs to: the nearest column piece, split half way across each gap.
        cuts = [(cols[k][1] + cols[k + 1][0]) // 2 for k in range(len(cols) - 1)]
        owner = np.searchsorted(cuts, np.arange(core.shape[1]), side='right')
        for k, ch in enumerate(chars):
            if ch == SKIP:
                continue
            cells[ch] = dict(
                k=k, x=cols[k], base=base, above=base - spans[k][0], below=spans[k][1] - base,
                band=(bounds[i], bounds[i + 1]), owner=owner)
    return dict(cells=cells, cap=cells['H']['above'], rgb=rgb, alpha=alpha)


def make_plus(dash, pad, cy):
    """A plus from a hyphen cell: the bar and a quarter-turned copy, both centred at row `cy`; (sprite, solid width)."""
    ys, xs = np.where(dash[..., 3] > 127)
    bar = resize(dash[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 1.6).astype(float)  # a hyphen is short for a plus
    side = max(bar.shape[:2])
    out = np.zeros((dash.shape[0], side + 2 * pad, 4))
    for img in (bar, np.rot90(bar)):
        h, w = img.shape[:2]
        y, x = int(round(cy - h / 2)), int(round(out.shape[1] / 2 - w / 2))
        region = out[y:y + h, x:x + w]
        a_s, a_d = img[..., 3:4] / 255, region[..., 3:4] / 255
        a_o = a_s + a_d * (1 - a_s)
        region[..., :3] = (img[..., :3] * a_s + region[..., :3] * a_d * (1 - a_s)) / np.maximum(a_o, 1e-6)
        region[..., 3:4] = a_o * 255
    return out, side


def raise_dot(dot, cell, centre_row):
    """The full stop moved up so its centre sits on `centre_row` of the sprite; (sprite, cell for the advance)."""
    ys = np.where(dot[..., 3] > 127)[0]
    shift = int(round(centre_row - (ys.min() + ys.max()) / 2))
    if ys.min() + shift < 0:
        raise SystemExit('no room above the full stop to raise it')
    out = np.zeros_like(dot)
    out[:dot.shape[0] + shift] = dot[-shift:] if shift < 0 else dot[:dot.shape[0] - shift]
    return out, dict(cell, x=(cell['x'][0], cell['x'][1]))


def pack_alphabet(name, spec, cut):
    pad, cap = spec['pad'], cut['cap']
    scale = CAP_PX / cap
    cells = cut['cells']
    up = max(c['above'] for c in cells.values()) + pad
    down = max(c['below'] for c in cells.values()) + pad
    width = cut['alpha'].shape[1]
    raws = {}
    for ch, c in cells.items():
        x0, x1 = c['x']
        xs = np.arange(x0 - pad, x1 + pad)
        inside = (xs >= 0) & (xs < width)
        xs = np.where(inside, xs, 0)
        mine = inside & (c['owner'][xs] == c['k'])
        rgba = np.zeros((up + down, len(xs), 4))
        for yy in range(up + down):
            sy = c['base'] - up + yy
            if c['band'][0] <= sy < c['band'][1]:
                rgba[yy, :, :3] = cut['rgb'][sy, xs]
                rgba[yy, :, 3] = cut['alpha'][sy, xs] * mine * 255
        raws[ch] = rgba
    if 'rows' not in spec:
        # The first three sheets have no "+": cross the hyphen with itself turned a quarter, centred where a plus sits beside capitals.
        raws['+'], plus_core = make_plus(raws['-'], pad, up - 0.42 * cap)
        cells['+'] = dict(x=(0, plus_core))
    if spec.get('dot'):
        # The middle dot (a list separator) is the full stop raised to the middle of the x-height.
        raws['·'], cells['·'] = raise_dot(raws['.'], cells['.'], up - 0.5 * cells['x']['above'])
    sprites = {ch: resize(r, scale) for ch, r in raws.items()}
    order = [ch for ch in ''.join(spec.get('rows', FONT_ROWS)) if ch != SKIP] + ([] if 'rows' in spec else ['+'])
    order += ['·'] if spec.get('dot') else []
    cell_h = max(s.shape[0] for s in sprites.values())
    total = sum(s.shape[1] + 2 for s in sprites.values())
    atlas = np.zeros((cell_h, total, 4), np.uint8)
    glyphs, x = [], 0
    for ch in order:
        s, c = sprites[ch], cells[ch]
        atlas[:s.shape[0], x:x + s.shape[1]] = s
        glyphs.append(dict(c=ch, x=x, w=s.shape[1], adv=round((c['x'][1] - c['x'][0] + TRACK * cap) * scale, 2), lead=round(pad * scale, 2)))
        x += s.shape[1] + 2
    FONT_OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas, 'RGBA').save(FONT_OUT / f'{name}.png', optimize=True)
    base = round(up * scale, 2)
    return dict(
        file=f'ui/font/{name}.png', w=total, h=cell_h, top=round(base - CAP_PX, 2), base=base,
        space=round(SPACE * CAP_PX, 2), glyphs=glyphs)


def ts_char(c):
    return '"\'"' if c == "'" else f"'{c}'"


def fonts():
    sets = {}
    for name, spec in FONTS.items():
        sets[name] = pack_alphabet(name, spec, cut_alphabet(FONT_SRC / spec['file'], spec))
        print(name, sets[name]['w'], 'x', sets[name]['h'], (FONT_OUT / f'{name}.png').stat().st_size, 'bytes')
    out = [
        '// Generated by tools/digit_atlas.py: the four alphabets (public/ui/font) and where each glyph sits.',
        '// Same shape as the digit sets: `w`/`h` the atlas size; `top`/`base` where the cap tops and the baseline sit down a',
        '// sprite; per glyph `x`/`w` its rect in the atlas, `adv` how far the next glyph moves and `lead` where its solid part',
        '// starts. `space` is a word space. All in atlas pixels; the caps stand FONT_CAP px tall.',
        "import type { GlyphSet } from './digitGlyphs';",
        "export type FontKind = 'gold' | 'brown' | 'blue' | 'neutral';",
        f'export const FONT_CAP = {CAP_PX};',
        'export const FONT_SETS: Record<FontKind, GlyphSet> = {',
    ]
    for name, st in sets.items():
        out.append(f"  {name}: {{ file: '{st['file']}', w: {st['w']}, h: {st['h']}, top: {st['top']}, base: {st['base']}, space: {st['space']}, glyphs: [")
        for g in st['glyphs']:
            out.append(f"    {{ c: {ts_char(g['c'])}, x: {g['x']}, w: {g['w']}, adv: {g['adv']}, lead: {g['lead']} }},")
        out.append('  ] },')
    out.append('};')
    FONT_TABLE.write_text('\n'.join(out) + '\n', encoding='utf-8', newline='\n')


if __name__ == '__main__':
    which = sys.argv[1:] or ['digits', 'fonts']
    if 'digits' in which:
        digits()
    if 'fonts' in which:
        fonts()
