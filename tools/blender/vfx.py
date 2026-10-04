"""
The visual effects' textures (src/fx/): the painted effect sheets of the Codex library, packed into the game's atlases in
public/textures/fx/ (each listed with its source in the LICENSES.md beside them). Run headless, through the heavy-job lock:

    set DRAGONBOUND_ROOT=<this checkout>
    node tools/heavy.cjs "D:/pokemon/tools/blender-5.2.2/blender.exe -b --factory-startup --python tools/blender/vfx.py"

How a professional effects artist builds the same: painted flipbook sheets (4 x 4 frames, read left to right and top to
bottom) for the fire, impacts, bursts, smoke and dust, played on camera-facing cards with the frames blended, and tileable
greyscale masks (streaks, cloud noise, a ring, a magic circle, a lightning strip) that the mesh effects scroll, erode and
tint in their shaders. Nothing here is painted in code: every picture is a library painting, cut, cleaned and resampled.

The atlases (the layout src/fx/sheets.ts reads; tests/vfx-assets.test.ts checks the sizes):
- Pages of 128 px frames, 1024 px square, four 4 x 4 sheets each, one per quarter (top left, top right, bottom left,
  bottom right). `fx-page-a.jpg` and `fx-page-b.jpg` are drawn adding light (RGB on black); `fx-page-c.webp` is drawn
  over what lies behind, its colour premultiplied by its coverage (smoke, dust, blood).
- Sheets of 256 px frames, 1024 px square, one each, adding light: the impacts, the explosion, the frost burst and the
  portal arrival.
- Masks, greyscale, read as data: `fx-trail.jpg`, `fx-noise.jpg` (both tile), `fx-ring.jpg`, `fx-sigil.jpg`, the lightning
  strip `fx-bolt.jpg` (tiles left to right); and in colour the frost circle `fx-frost-circle.jpg` and the painted sword
  slash unwrapped into a strip, `fx-slash.jpg` (slash_strip).

Deterministic: fixed crops and frames, no randomness; the same library gives the same files.
"""

import os

import bpy
import numpy as np

try:
    _HERE = os.path.dirname(os.path.abspath(__file__))
except NameError:  # run through exec(open(...).read())
    _HERE = None
ROOT = os.environ.get('DRAGONBOUND_ROOT') or (os.path.dirname(os.path.dirname(_HERE)) if _HERE else 'D:/gameplanning')
CODEX = 'D:/dragonbound-archive/codex/tex'
OUT = os.path.join(ROOT, 'public', 'textures', 'fx')

# ─── Pixels ───────────────────────────────────────────────────────────────────


def load(rel):
    """A library image as float RGBA rows top to bottom, sRGB-encoded values 0..1 (alpha 1 where it has none)."""
    img = bpy.data.images.load(os.path.join(CODEX, rel), check_existing=False)
    w, h = img.size
    buf = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img)
    return buf.reshape(h, w, 4)[::-1].copy()


def save(arr, name, quality=90):
    """Write rows top to bottom: .jpg as RGB (or greyscale for a 2-D array), .webp with its alpha."""
    if arr.ndim == 2:
        arr = np.dstack([arr, arr, arr])
    if arr.shape[2] == 3:
        arr = np.dstack([arr, np.ones(arr.shape[:2], np.float32)])
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.clip(arr[::-1], 0, 1).astype(np.float32).ravel())
    img.filepath_raw = os.path.join(OUT, name)
    img.file_format = 'JPEG' if name.endswith('.jpg') else 'WEBP'
    img.save(quality=quality)
    bpy.data.images.remove(img)
    print('wrote', name, w, h, os.path.getsize(os.path.join(OUT, name)))


def to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def luma(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def _weights(n_in, n_out):
    """A resampling matrix (n_out x n_in): a Lanczos-2 kernel widened by the reduction, so nothing aliases."""
    scale = n_in / n_out
    support = 2 * max(scale, 1)
    centers = (np.arange(n_out) + 0.5) * scale
    x = np.arange(n_in) + 0.5
    d = (x[None, :] - centers[:, None]) / max(scale, 1)
    k = np.sinc(d) * np.sinc(d / 2) * (np.abs(d) < 2)
    k[np.abs(x[None, :] - centers[:, None]) > support] = 0
    return k / k.sum(axis=1, keepdims=True)


def resize(arr, w, h):
    """Resample an image (H x W x C, or H x W) to w x h."""
    ry, rx = _weights(arr.shape[0], h), _weights(arr.shape[1], w)
    if arr.ndim == 2:
        return np.clip(ry @ arr @ rx.T, 0, None)
    return np.clip(np.einsum('oh,hwc->owc', ry, np.einsum('pw,hwc->hpc', rx, arr)), 0, None)


def window(n, edge=0.06):
    """1 in the middle of a cell, easing to 0 over its outer `edge`, so no frame bleeds into the next."""
    t = (np.arange(n) + 0.5) / n
    s = np.clip(np.minimum(t, 1 - t) / edge, 0, 1)
    s = s * s * (3 - 2 * s)
    return s[:, None] * s[None, :]


def frames(sheet, grid=4):
    """The 16 frames of a 4 x 4 flipbook, in reading order."""
    h, w = sheet.shape[:2]
    fh, fw = h // grid, w // grid
    return [sheet[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw] for r in range(grid) for c in range(grid)]


def flipbook(frames_, px, edge=0.06):
    """Frames resampled to px and laid back out 4 x 4, each faded out at its edge."""
    win = window(px, edge)[..., None]
    out = np.zeros((px * 4, px * 4, frames_[0].shape[2]), np.float32)
    for i, f in enumerate(frames_):
        r, c = divmod(i, 4)
        out[r * px:(r + 1) * px, c * px:(c + 1) * px] = resize(f, px, px) * win
    return out


# ─── How each kind of painting is cleaned ─────────────────────────────────────


def glow(rgb, floor=0.035, keep_grey=True):
    """
    A painting of light on black, as light to add: the black's grain taken out, and (keep_grey False) the dull grey
    bits (smoke, rock chips) taken out too, so only the fire, sparks and hot white stay to glow.
    """
    rgb = np.clip((rgb - floor) / (1 - floor), 0, 1)
    if keep_grey:
        return rgb
    spread = rgb.max(axis=-1) - rgb.min(axis=-1)
    hot = np.clip((rgb.max(axis=-1) - 0.55) / 0.3, 0, 1)
    keep = np.maximum(np.clip(spread / 0.25, 0, 1), hot)
    return rgb * keep[..., None]


def grey(rgb):
    """Light to add, as brightness only (the game tints it), its brightest point at full white."""
    g = luma(glow(rgb))
    return g / max(g.max(), 1e-3)


def grey_frames(rel):
    """A flipbook's frames as brightness only, scaled together (so its frames still fade out as painted)."""
    g = grey(load(rel)[..., :3])
    return [np.repeat(f[..., None], 3, axis=2) for f in frames(g)]


def coverage(rgb, lo=0.03, hi=0.5):
    """
    A painting of smoke or dust on black as coverage and colour: as thick as it is bright, its colour the painting's
    own lifted out of the black. Premultiplied in linear light (as the game draws it), stored sRGB.
    """
    v = rgb.max(axis=-1)
    a = np.clip((v - lo) / (hi - lo), 0, 1) ** 0.8
    col = np.clip(rgb / np.maximum(a, 1e-3)[..., None], 0, 1)
    return np.dstack([to_srgb(to_lin(col) * a[..., None]), a])


def premultiply(rgba):
    """A painting on a clear ground (straight alpha), premultiplied in linear light, stored sRGB."""
    a = rgba[..., 3:4]
    return np.dstack([to_srgb(to_lin(rgba[..., :3]) * a), a])


def fit(img, box, px, margin=0.06, mask=None):
    """The part of `img` inside box (x0, y0, x1, y1), trimmed to what is painted, centred square in a px cell."""
    x0, y0, x1, y1 = box
    part = img[y0:y1, x0:x1]
    m = part[..., 3] if mask is None else mask[y0:y1, x0:x1]
    ys, xs = np.nonzero(m > 0.02)
    cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
    half = max(ys.max() - ys.min(), xs.max() - xs.min()) / 2 / (1 - 2 * margin)
    h, w = part.shape[:2]
    pad = int(np.ceil(half)) + 2
    padded = np.zeros((h + 2 * pad, w + 2 * pad, part.shape[2]), np.float32)
    padded[pad:pad + h, pad:pad + w] = part
    cy, cx = int(round(cy)) + pad, int(round(cx)) + pad
    r = int(round(half))
    return resize(padded[cy - r:cy + r, cx - r:cx + r], px, px)


# ─── The atlases ──────────────────────────────────────────────────────────────


def page(quarters, name, alpha=False):
    """A 1024 px page of four 4 x 4 sheets of 128 px frames: top left, top right, bottom left, bottom right."""
    out = np.zeros((1024, 1024, 4 if alpha else 3), np.float32)
    for i, q in enumerate(quarters):
        if q is None:
            continue
        r, c = divmod(i, 2)
        out[r * 512:(r + 1) * 512, c * 512:(c + 1) * 512] = q
    save(out, name, quality=90)


def shapes():
    """
    The particles' shapes, 4 x 4 cells of 128 px (sheets.ts SHAPE): a soft mote, a four-pointed glint, an ice shard
    pointing along its flight (right), then a candle-sized flame in four frames (cells 4 to 7). The mote and glint are
    brightness only (tinted per particle); the shard and the flames keep their painted colour.
    """
    cells = np.zeros((4 * 128, 4 * 128, 3), np.float32)
    sparkle = frames(load('fx-flipbook/flip-sparkle-a.png'))
    big = glow(sparkle[6][..., :3])
    yy, xx = np.mgrid[0:256, 0:256]
    soft = np.exp(-(((xx - 127.5) ** 2 + (yy - 127.5) ** 2) / (2 * 34.0 ** 2)))
    mote = luma(big) * soft
    put = lambda i, img: cells.__setitem__((slice((i // 4) * 128, (i // 4 + 1) * 128), slice((i % 4) * 128, (i % 4 + 1) * 128)), img)
    put(0, np.repeat(resize(mote / mote.max(), 128, 128)[..., None], 3, axis=2) * window(128)[..., None])
    put(1, np.repeat(resize(grey(sparkle[6][..., :3]), 128, 128)[..., None], 3, axis=2) * window(128)[..., None])
    shard = glow(load('fx-flipbook/flip-ice-shard-a.png')[..., :3])
    s = frames(np.dstack([shard, luma(shard)]))[0]
    put(2, fit(s, (0, 0, 256, 256), 128, 0.04, mask=s[..., 3])[..., :3] * window(128)[..., None])
    torch = frames(load('fx-flipbook/flip-torch-a.png'))
    for k, f in enumerate([1, 5, 9, 13]):
        put(4 + k, resize(glow(torch[f][..., :3]), 128, 128) * window(128)[..., None])
    return cells


def bits():
    """
    The coloured particles drawn over what lies behind (sheets.ts BITS), premultiplied: four blood drops and splashes
    in grey (cells 0 to 3: the game tints each creature's own) and four puffs of smoke (cells 8 to 11).
    """
    cells = np.zeros((4 * 128, 4 * 128, 4), np.float32)
    put = lambda i, img: cells.__setitem__((slice((i // 4) * 128, (i // 4 + 1) * 128), slice((i % 4) * 128, (i % 4 + 1) * 128)), img)
    blood = load('fx-mesh/blood-drops-a.png')
    cell = blood.shape[0] / 4
    g = luma(blood[..., :3])
    lifted = np.clip(g / np.percentile(g[blood[..., 3] > 0.5], 90), 0, 1) ** 0.7
    blood_grey = np.dstack([lifted, lifted, lifted, blood[..., 3]])
    for i, (r, c) in enumerate([(0, 0), (2, 2), (0, 2), (1, 2)]):
        box = (int(c * cell), int(r * cell), int((c + 1) * cell), int((r + 1) * cell))
        put(i, premultiply(fit(blood_grey, box, 128)) * window(128)[..., None])
    smoke = load('fx-mesh/smoke-puffs-a.png')
    sw, sh = smoke.shape[1] / 4, smoke.shape[0] / 2
    for k in range(4):
        box = (int(k * sw), 0, int((k + 1) * sw), int(sh))
        put(8 + k, premultiply(fit(smoke, box, 128)) * window(128)[..., None])
    return cells


def bilinear(img, xs, ys):
    """`img` sampled at (xs, ys) in pixels (clamped to its edges)."""
    h, w = img.shape[:2]
    xs, ys = np.clip(xs, 0, w - 1.001), np.clip(ys, 0, h - 1.001)
    x0, y0 = np.floor(xs).astype(int), np.floor(ys).astype(int)
    fx, fy = (xs - x0)[..., None], (ys - y0)[..., None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
            + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


def slash_strip():
    """
    The painted sword slash (a crescent, its thin wispy tail on the left curving down and round to its thick bright
    head on the right) unwrapped into a straight strip for the slash mesh: u from the tail (0) to the head (1), v from
    the inside of the curve (top) to its crisp outer edge (bottom). Rays from a point inside the curve sweep round it;
    along each, the band of paint is found (its brightness-weighted middle, smoothed along the curve) and sampled.
    """
    img = glow(load('fx-mesh/fx-slash-arc-a.png')[..., :3])
    lum = img.max(axis=-1)[..., None]
    cx, cy = 760.0, 330.0
    t0, t1 = np.radians(172), np.radians(-8)
    n, rs = 720, np.arange(60, 950, 2.0)
    mids = []
    for th in np.linspace(t0, t1, n):
        prof = bilinear(lum, cx + rs * np.cos(th), cy + rs * np.sin(th))[..., 0]
        wgt = np.clip(prof - 0.15, 0, None) ** 2
        mids.append((wgt * rs).sum() / max(wgt.sum(), 1e-6))
    mids = np.convolve(np.pad(np.array(mids), 15, mode='edge'), np.ones(31) / 31, mode='valid')
    w, h, half = 1024, 192, 150
    th = t0 + (t1 - t0) * np.linspace(0, 1, w)
    mid = np.interp(np.linspace(0, 1, w), np.linspace(0, 1, n), mids)
    rr = mid[None, :] + np.linspace(-half, half, h)[:, None]
    strip = bilinear(img, cx + rr * np.cos(th)[None, :], cy + rr * np.sin(th)[None, :])
    # (Faded out at its very ends, so the mesh's window never shows a cut.)
    t = np.linspace(0, 1, w)
    ends = np.clip(t / 0.03, 0, 1) * np.clip((1 - t) / 0.01, 0, 1)
    return strip * ends[None, :, None]


def main():
    os.makedirs(OUT, exist_ok=True)
    rgb = lambda rel: load(rel)[..., :3]

    # Big sheets: 256 px frames, light to add.
    for name, rel, keep_grey in [
        ('fx-impact.jpg', 'fx-flipbook/flip-impact-a.png', False),
        ('fx-crit.jpg', 'fx-flipbook/flip-crit-a.png', True),
        ('fx-explosion.jpg', 'fx-flipbook/flip-explosion-a.png', False),
        ('fx-frost.jpg', 'fx-flipbook/flip-frost-explosion-a.png', True),
        ('fx-teleport.jpg', 'fx-flipbook/flip-teleport-a.png', True),
    ]:
        save(flipbook([glow(f, keep_grey=keep_grey) for f in frames(rgb(rel))], 256), name, quality=88)

    # Page A: the torch flame, the bonfire, the fireball, the particles' shapes.
    torch = flipbook([glow(f) for f in frames(rgb('fx-flipbook/flip-torch-a.png'))], 128)
    bonfire = flipbook([glow(f) for f in frames(rgb('fx-flipbook/flip-fire-b.png'))], 128)
    fireball = flipbook([glow(f) for f in frames(rgb('fx-flipbook/flip-fireball-a.png'))], 128)
    page([torch, bonfire, fireball, shapes()], 'fx-page-a.jpg')

    # Page B: lightning's crackle, the loot sparkle, the arcane burst (brightness: tinted the bolt's blue), the heal.
    electric = flipbook([glow(f) for f in frames(rgb('fx-flipbook/flip-electric-a.png'))], 128)
    sparkle = flipbook([glow(f) for f in frames(rgb('fx-flipbook/flip-sparkle-burst-b.png'))], 128)
    arcane = flipbook(grey_frames('fx-flipbook/flip-arcane-burst-a.png'), 128)
    heal = flipbook(grey_frames('fx-flipbook/flip-heal-a.png'), 128)
    page([electric, sparkle, arcane, heal], 'fx-page-b.jpg')

    # Page C, drawn over what lies behind: smoke, dust, the death puff, and the coloured bits.
    smoke = flipbook([coverage(f, 0.03, 0.5) for f in frames(rgb('fx-flipbook/flip-smoke-a.png'))], 128)
    # (Dust in grey, its own light and shade: the game tints it the colour of the ground it is kicked from.)
    dust = flipbook([coverage(np.repeat(luma(f)[..., None], 3, axis=2) * 1.6, 0.06, 0.6) for f in frames(rgb('fx-flipbook/flip-dust-puff-a.png'))], 128)
    poof = flipbook([coverage(f, 0.04, 0.5) for f in frames(rgb('fx-flipbook/flip-death-poof-a.png'))], 128)
    page([smoke, dust, poof, bits()], 'fx-page-c.webp', alpha=True)

    # Masks for the mesh effects.
    save(resize(luma(rgb('fx-mesh/fx-trail-a.png')), 512, 512), 'fx-trail.jpg')
    save(resize(luma(rgb('fx-mesh/fx-noise-a.png')), 512, 512), 'fx-noise.jpg')
    for name, rel in [('fx-ring.jpg', 'fx-mesh/fx-ring-a.png'), ('fx-sigil.jpg', 'fx-mesh/fx-sigil-a.png')]:
        g = grey(rgb(rel))
        save(fit(np.dstack([g, g, g, g]), (0, 0, g.shape[1], g.shape[0]), 512, 0.02)[..., 0], name)
    frost = glow(rgb('fx-mesh/magic-circle-frost-a.png'))
    save(fit(np.dstack([frost, luma(frost)]), (0, 0, frost.shape[1], frost.shape[0]), 512, 0.02)[..., :3], 'fx-frost-circle.jpg')
    save(slash_strip(), 'fx-slash.jpg')
    bolt = grey(rgb('fx-beams/beam-lightning-a.png'))
    rows = np.nonzero(bolt.max(axis=1) > 0.05)[0]
    mid, half = (rows.min() + rows.max()) // 2, (rows.max() - rows.min()) // 2 + 8
    save(resize(bolt[max(0, mid - half):mid + half], 512, 128), 'fx-bolt.jpg')


main()
