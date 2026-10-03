"""
Bark textures for the grown trees (src/render/foliage.ts): turns sourced bark images into the game's
tileable colour and normal maps in public/textures/bark/ (listed with their sources in LICENSES.md there).

For each bark: the colour image is made to tile (a minimum-error cut through an overlap, both ways), its
large-scale light and stains are evened out so no stripe repeats round a trunk, and it is toned to the
bark's colour in the game's warm light. The normal map (OpenGL convention, green up) is drawn from the
colour's shading: the dark furrows deep, the light plates raised.

Run with Python 3 (Pillow and NumPy) after putting the sources in SRC:
    python tools/bark_textures.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path('D:/dragonbound-archive/bark-src')
OUT = Path(__file__).resolve().parent.parent / 'public' / 'textures' / 'bark'
SIZE = 1024

# name: colour source (a painted bark generated with Codex, see LICENSES.md), toned mean colour (sRGB), contrast,
# overlap cut away to make it tile (px at 1024), and the relief's depth.
BARKS = {
    'oak': dict(color='oak-bark.png', mean=(98, 88, 77), contrast=1.0, overlap=96, depth=4.5),
    'tree': dict(color='tree-bark.png', mean=(118, 110, 98), contrast=0.95, overlap=96, depth=3.0),
}


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


def tone(lin, mean, contrast):
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
    # A third of the source's own hue kept, the rest pulled to the bark's colour.
    hue = lin / np.maximum(lum, 1e-4)[..., None]
    hue = hue * 0.35 + (target / t_lum) * 0.65
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


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, b in BARKS.items():
        src = np.asarray(Image.open(SRC / b['color']).convert('RGB')).astype(np.float64) / 255.0
        src = make_tile(src, int(b['overlap'] * src.shape[0] / SIZE))
        src = np.asarray(Image.fromarray((src * 255).astype(np.uint8)).resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float64) / 255.0
        lin = tone(to_linear(src), b['mean'], b['contrast'])
        save(to_srgb(lin), OUT / f'{name}.jpg', 86)
        save(normal_from(to_linear(src), b['depth']), OUT / f'{name}-normal.jpg', 90)
        print(name, 'mean sRGB', (to_srgb(lin).mean((0, 1)) * 255).round())


if __name__ == '__main__':
    main()
