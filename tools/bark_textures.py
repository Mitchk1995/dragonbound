"""
Bark and leaf textures for the grown trees (src/render/foliage.ts): turns sourced bark images into the game's
tileable colour and normal maps in public/textures/bark/, and sourced leaf sprays into leaf atlases in
public/textures/leaves/ (each listed with its source in the LICENSES.md beside it).

For each bark: the colour image is made to tile (a minimum-error cut through an overlap, both ways), its
large-scale light and stains are evened out so no stripe repeats round a trunk, and it is toned to the
bark's colour in the game's warm light. The normal map (OpenGL convention, green up) is drawn from the
colour's shading: the dark furrows deep, the light plates raised.

Each leaf atlas is a 3 x 3 grid of the species' sourced spray (a painted spray on a clear ground), each cell
turned, mirrored, sized and toned a little differently, its twig's foot at the foot of the cell. Its colours are
multipliers (the game's instance colour gives each tree its green, red or gold): the spray's own light and shade
and a share of its hue, round a mean brightness. Saved as WebP with lossless alpha (the leaves are alpha-cut).

Run with Python 3 (Pillow with WebP, and NumPy) after putting the sources in SRC and CODEX; name barks or
leaf sprays to make only those (the rest are left as they are):
    python tools/bark_textures.py
    python tools/bark_textures.py deadwood charred bush
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path('D:/dragonbound-archive/bark-src')
CODEX = Path('D:/dragonbound-archive/codex/tex')
PUBLIC = Path(__file__).resolve().parent.parent / 'public' / 'textures'
OUT = PUBLIC / 'bark'
LEAVES = PUBLIC / 'leaves'
SIZE = 1024

# name: colour source (a painted bark generated with Codex, see LICENSES.md), toned mean colour (sRGB), contrast,
# overlap cut away to make it tile (px at 1024), the relief's depth, and the share of the source's own hue kept.
BARKS = {
    'oak': dict(color=SRC / 'oak-bark.png', mean=(98, 88, 77), contrast=1.0, overlap=96, depth=4.5),
    'tree': dict(color=SRC / 'tree-bark.png', mean=(118, 110, 98), contrast=0.95, overlap=96, depth=3.0),
    # Willow: grey-brown, deep criss-crossing diamond furrows.
    'willow': dict(color=CODEX / 'bark' / 'bark-willow.png', mean=(104, 96, 84), contrast=1.0, overlap=96, depth=4.0),
    # Maple: grey, long shallow plates.
    'maple': dict(color=CODEX / 'bark' / 'bark-maple.png', mean=(116, 110, 102), contrast=0.95, overlap=96, depth=3.2),
    # Yew: red-brown, thin flaking scales showing redder under them.
    'yew': dict(color=CODEX / 'bark' / 'bark-yew.png', mean=(122, 74, 56), contrast=1.05, overlap=96, depth=3.0, hue=0.6),
    # Magic: pale silver-blue, smooth flowing ridges with fine glowing veins (most of its own hue kept).
    'magic': dict(color=CODEX / 'bark' / 'bark-magic.png', mean=(176, 184, 196), contrast=0.9, overlap=96, depth=2.2, hue=0.85),
    # A dead tree's bare wood: weathered silver-grey, long cracks along the grain (its source already wraps top to bottom).
    'deadwood': dict(color=CODEX / 'retiled' / 'foothills' / 'bark-dead.png', mean=(128, 127, 124), contrast=1.0, overlap=96, depth=3.0, wraps=True, hue=0.2),
    # The char a fire leaves on a dead tree's foot: black, cracked into blocks, grey ash in the cracks.
    'charred': dict(color=CODEX / 'nature-bark' / 'bark-burnt-a.png', mean=(40, 37, 35), contrast=1.1, overlap=96, depth=4.0, hue=0.3),
}

# name: spray source (generated with Codex, see LICENSES.md), where its twig's foot is in the source (px), the
# share of its own hue kept, its mean brightness as a multiplier (linear), and how many sprigs fan from each foot
# (one when left out; the willow's sprig is narrow, so three fan out into a full spray).
LEAF_SPRAYS = {
    'willow': dict(color=CODEX / 'leaves' / 'leaf-willow.png', foot=(614, 16), hue=0.3, mean=0.62, fan=3),
    'maple': dict(color=CODEX / 'leaves' / 'leaf-maple.png', foot=(170, 952), hue=0.2, mean=0.6),
    'yew': dict(color=CODEX / 'leaves' / 'leaf-yew.png', foot=(174, 994), hue=0.35, mean=0.6),
    'magic': dict(color=CODEX / 'leaves' / 'leaf-magic.png', foot=(286, 962), hue=0.3, mean=0.66),
    # The bushes' leaves: broad oval leaves set along a twig (a beech spray).
    'bush': dict(color=CODEX / 'nature-leaves' / 'leaf-beech-a.png', foot=(135, 1105), hue=0.25, mean=0.66),
}
ATLAS = 1024
CELLS = 3


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def blur(a, sigma):
    """A Gaussian blur that wraps round the edges (the texture tiles), per channel."""
    h, w = a.shape[:2]
    fy, fx = np.fft.fftfreq(h)[:, None], np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (fx ** 2 + fy ** 2))
    if a.ndim == 2:
        return np.real(np.fft.ifft2(np.fft.fft2(a) * g))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(a[..., k]) * g)) for k in range(a.shape[2])], -1)


def cut_path(err):
    """The cheapest top-to-bottom path through an error band (one column per row)."""
    h, w = err.shape
    cost = err.copy()
    for y in range(1, h):
        prev = cost[y - 1]
        left = np.r_[np.inf, prev[:-1]]
        right = np.r_[prev[1:], np.inf]
        cost[y] += np.minimum(prev, np.minimum(left, right))
    path = np.zeros(h, int)
    path[-1] = int(np.argmin(cost[-1]))
    for y in range(h - 2, -1, -1):
        x = path[y + 1]
        lo, hi = max(0, x - 1), min(w, x + 2)
        path[y] = lo + int(np.argmin(cost[y, lo:hi]))
    return path


def tile_x(a, b):
    """Make an image tile left to right: its last `b` columns are cut into its first `b` along the cheapest seam, softened over a few px."""
    h, w = a.shape[:2]
    right, left = a[:, w - b:], a[:, :b]
    path = cut_path(((right - left) ** 2).sum(-1))
    x = np.arange(b)[None, :]
    # 0 left of the cut (still the right band, which follows on from the image's right edge), 1 right of it.
    m = np.clip((x - path[:, None]) / 3.0 + 0.5, 0, 1)[..., None]
    out = a[:, : w - b].copy()
    out[:, :b] = right * (1 - m) + left * m
    return out


def make_tile(a, b):
    a = tile_x(a, b)
    return tile_x(a.transpose(1, 0, 2), b).transpose(1, 0, 2)


def tone(lin, mean, contrast, keep=0.35):
    """Even out large-scale light and stains, then tone to a mean colour (linear in, linear out)."""
    lum = lin @ np.array([0.2126, 0.7152, 0.0722])
    big = blur(lin, SIZE / 10)
    big_lum = big @ np.array([0.2126, 0.7152, 0.0722])
    # Large-scale brightness and hue: mostly evened out, a little left so the bark is not flat.
    flat = lin / np.maximum(big, 1e-4)[...] * big.mean((0, 1))
    lin = lin * 0.25 + flat * 0.75
    lum = lin @ np.array([0.2126, 0.7152, 0.0722])
    target = to_linear(np.array(mean) / 255.0)
    t_lum = target @ np.array([0.2126, 0.7152, 0.0722])
    # Contrast round the mean (in log space, so the furrows stay dark without clipping).
    m = np.exp(np.log(np.maximum(lum, 1e-4)).mean())
    k = (np.maximum(lum, 1e-4) / m) ** contrast
    # A share of the source's own hue kept (a third by default), the rest pulled to the bark's colour.
    hue = lin / np.maximum(lum, 1e-4)[..., None]
    hue = hue * keep + (target / t_lum) * (1 - keep)
    return hue * (k * t_lum)[..., None]


def normal_from(lin, depth):
    """A normal map from the colour's shading: lighter is higher (OpenGL convention, green up)."""
    # The furrows' broad depth (the dark bands) under the plates' fine relief.
    lum = np.sqrt(lin @ np.array([0.2126, 0.7152, 0.0722]))
    lum = (lum - lum.mean()) / lum.std()
    h = blur(lum, 5.0) * 0.7 + blur(lum, 1.0) * 0.3
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * depth
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * depth
    # Image rows run down; texture v runs up, so green follows -dy.
    n = np.stack([-dx, dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def save(img01, path, quality):
    Image.fromarray((np.clip(img01, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path, quality=quality, optimize=True, progressive=True)


def cell_edge(i):
    """A cell's first pixel (as foliage.ts splits the atlas: as evenly as whole pixels allow)."""
    return round(i * ATLAS / CELLS)


def bleed(rgb, alpha, passes=8):
    """Spread colour from the solid texels into the clear ones round them; the rest take the mean leaf colour."""
    filled = alpha > 0.02
    rgb = rgb.copy()
    rgb[~filled] = 0
    for _ in range(passes):
        acc = np.zeros_like(rgb)
        cnt = np.zeros(alpha.shape)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            f = np.roll(filled, (dy, dx), (0, 1))
            acc += np.roll(rgb, (dy, dx), (0, 1)) * f[..., None]
            cnt += f
        grow = ~filled & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][..., None]
        filled = filled | grow
    rgb[~filled] = rgb[alpha > 0.5].mean(0)
    return rgb


def sprigs(img, turn, n, rng):
    """A spray of n copies of a sprig fanning from one foot (the image's bottom middle once turned upright), cropped."""
    if n == 1:
        out = img.rotate(turn, resample=Image.BICUBIC, expand=True)
        return out.crop(out.getbbox())
    w, h = img.size
    canvas = Image.new('RGBA', (w * 3, h * 2), (0, 0, 0, 0))
    for k in range(n):
        spread = (k - (n - 1) / 2) * 17 + rng.uniform(-4, 4)
        s = img.rotate(turn, resample=Image.BICUBIC, expand=True)
        s = s.crop(s.getbbox())
        s = s.resize((round(s.width * (0.9 if k != (n - 1) // 2 else 1)), round(s.height * (0.9 if k != (n - 1) // 2 else 1))), Image.LANCZOS)
        # Pivot about the sprig's foot: pad it so the foot sits at the centre, then turn it.
        pad = Image.new('RGBA', (s.width, s.height * 2), (0, 0, 0, 0))
        pad.alpha_composite(s, (0, 0))
        pad = pad.rotate(spread, resample=Image.BICUBIC, expand=True, center=(s.width / 2, s.height))
        canvas.alpha_composite(pad, ((canvas.width - pad.width) // 2, canvas.height // 2 - pad.height // 2))
    return canvas.crop(canvas.getbbox())


def leaf_atlas(name, b):
    """A leaf atlas from one sourced spray (see the module comment), as straight-alpha RGBA in 0..1."""
    rgba = np.asarray(Image.open(b['color']).convert('RGBA')).astype(np.float64) / 255.0
    # Solid where the source is solid (its alpha tops out a little under 1), clear round it.
    alpha = np.clip(rgba[..., 3] / 0.97, 0, 1)
    lin = to_linear(rgba[..., :3])
    lum = lin @ np.array([0.2126, 0.7152, 0.0722])
    solid = alpha > 0.5
    # Colours as multipliers: the spray's light and shade round a mean brightness, and a share of its hue.
    hue = lin / np.maximum(lum, 1e-4)[..., None]
    hue = hue * b['hue'] + (1 - b['hue'])
    m = np.exp(np.log(np.maximum(lum[solid], 1e-4)).mean())
    mult = hue * (np.clip(lum / m, 0, 3) ** 0.8 * b['mean'])[..., None]
    base = Image.fromarray((np.dstack([np.clip(mult, 0, 1), alpha]) * 255 + 0.5).astype(np.uint8), 'RGBA')
    # Turned so its twig runs up from its foot through the middle of the spray.
    ys, xs = np.nonzero(solid)
    fx, fy = b['foot']
    ang = np.degrees(np.arctan2(xs.mean() - fx, fy - ys.mean()))
    atlas = Image.new('RGBA', (ATLAS, ATLAS), (0, 0, 0, 0))
    rng = np.random.default_rng(sum(map(ord, name)))
    for cell in range(CELLS * CELLS):
        cx, cy = cell % CELLS, cell // CELLS
        x0, x1, y0, y1 = cell_edge(cx), cell_edge(cx + 1), cell_edge(cy), cell_edge(cy + 1)
        c = min(x1 - x0, y1 - y0)
        img = base.transpose(Image.FLIP_LEFT_RIGHT) if cell % 2 else base
        turn = ang * (-1 if cell % 2 else 1) + rng.uniform(-11, 11)
        img = sprigs(img, turn, b.get('fan', 1), rng)
        k = (c - 12) * rng.uniform(0.88, 1.0) / max(img.size)
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
        # A little tone and warmth of its own.
        px = np.asarray(img).astype(np.float64)
        px[..., :3] *= rng.uniform(0.93, 1.07) * np.array([1 + rng.uniform(-0.03, 0.03), 1, 1 + rng.uniform(-0.03, 0.03)])
        img = Image.fromarray(np.clip(px, 0, 255).astype(np.uint8), 'RGBA')
        # Texture v runs up, so the cell's foot (its first row in v) is its bottom edge in the image.
        atlas.alpha_composite(img, (x0 + (c - img.width) // 2, ATLAS - y0 - 6 - img.height))
    out = np.asarray(atlas).astype(np.float64) / 255.0
    # Clear texels carry their nearest leaf's colour (no dark fringe where the alpha test cuts).
    out[..., :3] = bleed(out[..., :3], out[..., 3])
    return out


def main(only):
    OUT.mkdir(parents=True, exist_ok=True)
    LEAVES.mkdir(parents=True, exist_ok=True)
    for name, b in BARKS.items():
        if only and name not in only:
            continue
        src = np.asarray(Image.open(b['color']).convert('RGB')).astype(np.float64) / 255.0
        cut = int(b['overlap'] * src.shape[0] / SIZE)
        # (A source that already wraps top to bottom is cut only side to side: a cut across the grain would show.)
        src = tile_x(src, cut) if b.get('wraps') else make_tile(src, cut)
        src = np.asarray(Image.fromarray((src * 255).astype(np.uint8)).resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float64) / 255.0
        lin = tone(to_linear(src), b['mean'], b['contrast'], b.get('hue', 0.35))
        save(to_srgb(lin), OUT / f'{name}.jpg', 86)
        save(normal_from(to_linear(src), b['depth']), OUT / f'{name}-normal.jpg', 90)
        print(name, 'mean sRGB', (to_srgb(lin).mean((0, 1)) * 255).round())
    for name, b in LEAF_SPRAYS.items():
        if only and name not in only:
            continue
        img = Image.fromarray((np.clip(leaf_atlas(name, b), 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        img.save(LEAVES / f'{name}.webp', quality=88, alpha_quality=100, method=6)
        print(name, 'leaves', (LEAVES / f'{name}.webp').stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main(set(sys.argv[1:]))
