"""
The rock kit's painted materials (src/render/rockMaterial.ts): turns the sourced rock and moss paintings into tileable
layers in public/textures/rock/, listed with their sources in the LICENSES.md beside them.

Each layer is an RGB PNG (its `size` square), made as the characters' material layers are (tools/char_textures.py):
  R  the painted value round its mean (0.5 = the rock's own colour): the game tints it by the zone's rock or moss
     colour, so the layer carries light and shade, never hue;
  G  the relief's normal, x (0.5 flat), and
  B  its y, OpenGL convention (green up the image), drawn from the painting's shading (lighter is higher).
The sources already tile; they are downsized wrapping round their edges, so the tile stays seamless.

Run with Python 3 (Pillow and NumPy):
    python tools/rock_textures.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

from bark_textures import to_linear
from char_textures import relief, value_layer

CODEX = Path('D:/dragonbound-archive/codex/tex')
OUT = Path(__file__).resolve().parent.parent / 'public' / 'textures' / 'rock'
PAD = 32

# layer: source, its size in the game (px: rockModels.ts LAYER_SIZE), contrast of its value round the mean, the
# relief's depth and how finely it is read (px blur at the source's size).
LAYERS = {
    # Weathered grey rock: broken facets, fine fractures, a few lichen specks (2.6 m a repeat).
    'rock': dict(src=CODEX / 'rock' / 'rock-cliff.png', size=512, contrast=1.05, depth=4.0, fine=1.5),
    # Cushion moss: soft rounded clumps, lit tips over dark hollows (1.3 m a repeat).
    'moss': dict(src=CODEX / 'rock' / 'rock-moss.png', size=256, contrast=1.1, depth=5.0, fine=1.2),
}


def resize_wrapped(a, size):
    """Downsize a tiling float image, channel by channel, reading across its edges (the tile stays seamless)."""
    h = a.shape[0]
    pad = PAD * h // size
    out = []
    for k in range(a.shape[-1]):
        big = np.pad(a[..., k], pad, mode='wrap').astype(np.float32)
        n = size + 2 * PAD
        small = np.asarray(Image.fromarray(big, 'F').resize((n, n), Image.LANCZOS))
        out.append(small[PAD:PAD + size, PAD:PAD + size])
    return np.stack(out, -1)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, b in LAYERS.items():
        src = np.asarray(Image.open(b['src']).convert('RGB')).astype(np.float64) / 255.0
        lin = to_linear(src)
        val = value_layer(lin, b['contrast'])
        nrm = relief(lin, b['depth'], b['fine'])
        out = resize_wrapped(np.dstack([val, nrm[..., 0], nrm[..., 1]]), b['size'])
        img = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB')
        img.save(OUT / f'{name}.png', optimize=True)
        kb = (OUT / f'{name}.png').stat().st_size // 1024
        print(name, kb, 'KB', 'value mean', round(float(out[..., 0].mean()), 3))


if __name__ == '__main__':
    main()
