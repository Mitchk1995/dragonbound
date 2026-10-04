"""
The building kit's surfaces (src/world/kit/surfaces.ts): turns sourced, painted textures into one strip of
tileable colour layers and one strip of their normal maps in public/textures/kit/, and painted plant sprays into
one atlas of plants (each source is listed with its licence in the LICENSES.md beside them). The game cuts each
strip into the layers of one texture array, so every piece of every building samples the same two textures.

For each layer: the source is made to tile (a minimum-error cut through an overlap, both ways), its large-scale
light and stains evened out so no patch repeats across a wall, and turned into a colour multiplier round a mean
brightness that keeps a share of the source's own hue: the game's piece colour gives the stone its cream, the
timber its brown and the roof its red, and the texture adds the painted grain, mottling and wear on top. The
normal map (OpenGL convention, green up) is drawn from the colour's shading: dark pits and cracks low, light
ridges high.

The plant atlas keeps each spray's own painted colours: a 3 x 2 grid, each spray trimmed to its leaves, fitted to
its cell with its foot on the cell's bottom edge, the colour of its edges bled out into the clear round it.

Run with Python 3 (Pillow with WebP, and NumPy) once the sources are in KIT and CODEX:
    python tools/kit_textures.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

from bark_textures import bleed, blur, make_tile, to_linear, to_srgb

KIT = Path('D:/dragonbound-archive/codex/kit')
CODEX = Path('D:/dragonbound-archive/codex/tex')
OUT = Path(__file__).resolve().parent.parent / 'public' / 'textures' / 'kit'
SIZE = 512
# The colour multipliers' mean (linear); the game scales them back up by its inverse (surfaces.ts GAIN).
MEAN = 0.45
LUMA = np.array([0.2126, 0.7152, 0.0722])

# The layers in the order the game numbers them (surfaces.ts LAYERS): the source, the contrast round the mean,
# the share of the source's own hue kept, the relief's depth, and the overlap cut away to make it tile (px).
LAYERS = [
    ('stone', dict(src=KIT / 'kit-stone.png', contrast=0.85, hue=0.55, depth=2.6, overlap=110)),
    ('plaster', dict(src=CODEX / 'wood' / 'wood-plaster.png', contrast=0.75, hue=0.35, depth=1.8, overlap=96)),
    ('oak', dict(src=KIT / 'kit-oak.png', contrast=1.0, hue=0.5, depth=3.2, overlap=110)),
    ('clay', dict(src=KIT / 'kit-clay.png', contrast=0.8, hue=0.45, depth=2.2, overlap=110)),
    ('iron', dict(src=CODEX / 'wood' / 'metal-iron.png', contrast=0.9, hue=0.25, depth=3.0, overlap=96)),
    ('cloth', dict(src=CODEX / 'wood' / 'cloth-banner.png', contrast=0.8, hue=0.0, depth=2.2, overlap=96)),
]

# The plant atlas's cells, in the order the game numbers them (shapes/plants.ts PLANTS).
PLANTS = ['plant-bush', 'plant-flowers-red', 'plant-flowers-yellow', 'plant-flowers-blue', 'plant-fern', 'plant-grass-clump']
CELL = 384


def multiplier(lin, contrast, keep):
    """Even out the large-scale light, then a colour multiplier with mean MEAN keeping a share of the hue."""
    big = blur(lin, SIZE / 8)
    flat = lin / np.maximum(big, 1e-4) * big.mean((0, 1))
    lin = lin * 0.3 + flat * 0.7
    lum = np.maximum(lin @ LUMA, 1e-4)
    m = np.exp(np.log(lum).mean())
    k = (lum / m) ** contrast
    chroma = lin / lum[..., None]
    chroma = chroma / chroma.reshape(-1, 3).mean(0)
    hue = 1 + (chroma - 1) * keep
    out = hue * k[..., None]
    # Scaled to the mean twice over: once, then again after the brightest texels clip.
    for _ in range(2):
        out = np.clip(out * (MEAN / (out @ LUMA).mean()), 0, 1)
    return out


def normal_from(lin, depth):
    """A normal map from the colour's shading: lighter is higher (OpenGL convention, green up)."""
    lum = np.sqrt(np.maximum(lin @ LUMA, 0))
    lum = (lum - lum.mean()) / max(lum.std(), 1e-6)
    h = blur(lum, 4.0) * 0.6 + blur(lum, 1.0) * 0.4
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * depth
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * depth
    # Image rows run down; texture v runs up, so green follows -dy.
    n = np.stack([-dx, dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def surfaces():
    colour = np.zeros((SIZE, SIZE * len(LAYERS), 3))
    normal = np.zeros_like(colour)
    for i, (name, b) in enumerate(LAYERS):
        src = np.asarray(Image.open(b['src']).convert('RGB')).astype(np.float64) / 255.0
        src = make_tile(src, b['overlap'])
        src = np.asarray(Image.fromarray((src * 255 + 0.5).astype(np.uint8)).resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float64) / 255.0
        lin = to_linear(src)
        mult = multiplier(lin, b['contrast'], b['hue'])
        colour[:, i * SIZE:(i + 1) * SIZE] = to_srgb(mult)
        normal[:, i * SIZE:(i + 1) * SIZE] = normal_from(lin, b['depth'])
        print(f'{name}: mean {(mult @ LUMA).mean():.3f}, range {(mult @ LUMA).min():.3f}-{(mult @ LUMA).max():.3f}')
    for img, file, q in ((colour, 'surfaces.jpg', 86), (normal, 'surfaces-normal.jpg', 88)):
        Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(OUT / file, quality=q, optimize=True, progressive=True)
        print(file, (OUT / file).stat().st_size // 1024, 'KB')


def plants():
    atlas = Image.new('RGBA', (CELL * 3, CELL * 2), (0, 0, 0, 0))
    for i, name in enumerate(PLANTS):
        img = Image.open(CODEX / 'plants' / f'{name}.png').convert('RGBA')
        img = img.crop(img.split()[-1].point(lambda a: 255 if a > 24 else 0).getbbox())
        k = (CELL - 8) / max(img.size)
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
        cx, cy = i % 3, i // 3
        atlas.alpha_composite(img, (cx * CELL + (CELL - img.width) // 2, cy * CELL + CELL - 2 - img.height))
    out = np.asarray(atlas).astype(np.float64) / 255.0
    out[..., :3] = bleed(out[..., :3], out[..., 3])
    Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(OUT / 'plants.webp', quality=84, alpha_quality=90, method=6)
    print('plants.webp', (OUT / 'plants.webp').stat().st_size // 1024, 'KB')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    surfaces()
    plants()


if __name__ == '__main__':
    main()
