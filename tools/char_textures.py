"""
The characters' painted material library (src/render/charSurfaces.ts): turns each sourced material image into one
tileable layer in public/textures/characters/, listed with its source in the LICENSES.md beside it.

Each layer is an RGB PNG, SIZE square:
  R  the material's painted value round its mean (0.5 = the part's own colour): the game tints it by the part's role
     colour (a dyed tunic, a tier's metal, a skin tone), so the layer carries light and shade, never hue;
  G  the relief's normal, x (0.5 flat), and
  B  its y, OpenGL convention (green up the image), drawn from the source's shading (lighter is higher).
Large-scale light and stains are evened out first, so no patch repeats across a big face, and every layer is made to
tile by a minimum-error cut through an overlap, both ways (as tools/bark_textures.py does for bark).

The mail layer is not painted: it is a patch of modelled rings baked in Blender (tools/blender/mail_tile.py), so its
rows meet exactly across the tile's edges.

Run with Python 3 (Pillow and NumPy) after putting the sources in CODEX (and baking the mail tile):
    python tools/char_textures.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

from bark_textures import blur, make_tile, to_linear

CODEX = Path('D:/dragonbound-archive/codex/tex/chars')
MAIL = Path('D:/dragonbound-archive/mail-tile/mail.png')
OUT = Path(__file__).resolve().parent.parent / 'public' / 'textures' / 'characters'
SIZE = 256

# layer: source, contrast of its value round the mean, the relief's depth, how finely the relief is read (px blur at
# the source's size), and the overlap cut away to make it tile (px at the source's size). The order is the layer
# order in the game (charSurfaces.ts LAYERS).
LAYERS = {
    'skin': dict(src=CODEX / 'char-skin.png', contrast=0.8, depth=1.2, fine=4.0, overlap=96),
    'wool': dict(src=CODEX / 'char-wool.png', contrast=1.0, depth=5.0, fine=1.5, overlap=64),
    'linen': dict(src=CODEX / 'char-linen.png', contrast=1.0, depth=4.0, fine=1.2, overlap=64),
    'leather': dict(src=CODEX / 'char-leather.png', contrast=1.0, depth=3.5, fine=1.5, overlap=96),
    'padded': dict(src=CODEX / 'char-cloth-dark.png', contrast=1.0, depth=5.0, fine=2.0, overlap=96),
    # Plate: the smooth painting's soft sheen as its value, the hammered painting's dents as its relief (forged, not
    # brushed: brushed streaks on bronze read as wood grain).
    'plate': dict(src=CODEX / 'char-plate-smooth.png', relief_src=CODEX / 'char-plate-hammered.png', contrast=0.7, depth=2.0,
                  fine=4.0, overlap=96),
    'gold': dict(src=CODEX / 'char-gold.png', contrast=0.9, depth=2.0, fine=1.5, overlap=96),
    'wood': dict(src=CODEX / 'char-wood.png', contrast=1.0, depth=3.0, fine=1.5, overlap=96),
    'hair': dict(src=CODEX / 'char-hair.png', contrast=1.0, depth=5.0, fine=2.0, overlap=96),
    'goblin': dict(src=CODEX / 'char-goblin.png', contrast=1.0, depth=5.0, fine=2.5, overlap=96),
    'mail': dict(src=MAIL, contrast=1.0, depth=0.0, fine=0.0, overlap=0),
}

LUM = np.array([0.2126, 0.7152, 0.0722])


def value_layer(lin, contrast):
    """The painted value round its mean, large-scale light evened out: 0.5 = the mean, +-0.5 = twice / none of it."""
    lum = lin @ LUM
    big = blur(lum, lum.shape[0] / 8)
    flat = lum / np.maximum(big, 1e-4) * big.mean()
    lum = lum * 0.2 + flat * 0.8
    m = np.exp(np.log(np.maximum(lum, 1e-4)).mean())
    k = (np.maximum(lum, 1e-4) / m) ** contrast
    return np.clip(0.5 + (k - 1) * 0.5, 0, 1)


def relief(lin, depth, fine):
    """A normal map from the shading: lighter is higher (OpenGL convention, green up the image)."""
    h = np.sqrt(lin @ LUM)
    h = h - blur(h, h.shape[0] / 8)
    h = (h - h.mean()) / max(h.std(), 1e-6)
    h = blur(h, fine) * 0.75 + blur(h, fine * 3) * 0.25
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * depth
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * depth
    n = np.stack([-dx, dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def resize(a, size):
    """Downsize a float image (any channel count) with Lanczos, channel by channel."""
    return np.stack([np.asarray(Image.fromarray(a[..., k].astype(np.float32), 'F').resize((size, size), Image.LANCZOS))
                     for k in range(a.shape[-1])], -1)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, b in LAYERS.items():
        if name == 'mail':
            # Baked already as (value, normal x, normal y) by mail_tile.py, exactly periodic.
            rgb = np.asarray(Image.open(b['src']).convert('RGB')).astype(np.float64) / 255.0
            out = resize(rgb, SIZE)
        else:
            src = np.asarray(Image.open(b['src']).convert('RGB')).astype(np.float64) / 255.0
            src = make_tile(src, b['overlap'])
            lin = to_linear(src)
            val = value_layer(lin, b['contrast'])
            if 'relief_src' in b:   # the relief from a second painting of the same material, made to tile the same way
                rsrc = np.asarray(Image.open(b['relief_src']).convert('RGB')).astype(np.float64) / 255.0
                rlin = to_linear(make_tile(rsrc, b['overlap']))
                nrm = resize(relief(rlin, b['depth'], b['fine']), val.shape[0])
            else:
                nrm = relief(lin, b['depth'], b['fine'])
            out = resize(np.dstack([val, nrm[..., 0], nrm[..., 1]]), SIZE)
        img = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB')
        img.save(OUT / f'{name}.png', optimize=True)
        print(name, (OUT / f'{name}.png').stat().st_size // 1024, 'KB', 'value mean', round(float(out[..., 0].mean()), 3))


if __name__ == '__main__':
    main()
