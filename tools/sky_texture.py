"""
The island's sky (src/world/worldView.ts): turns the sourced sky panorama into public/textures/sky/cloudsea.jpg
(listed with its source in the LICENSES.md beside it).

The source is an equirectangular panorama (2:1) of a clear sky over a sea of soft cloud. The generator left a thin
light or dark line along each edge: those are trimmed off and the picture stretched back to size, and the small
step left where its left and right edges meet round the back of the sky is spread over a band on either side, so
the panorama wraps with no seam. Colour and warmth are left alone: the game grades the sky to each light.

Run with Python 3 (Pillow and NumPy):
    python tools/sky_texture.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path('D:/dragonbound-archive/codex/tex/sky/sky-cloudsea.png')
OUT = Path(__file__).resolve().parent.parent / 'public' / 'textures' / 'sky' / 'cloudsea.jpg'
W, H = 2048, 1024
TRIM = 3
BAND = 64


def main():
    img = Image.open(SRC).convert('RGB')
    w, h = img.size
    img = img.crop((TRIM, TRIM, w - TRIM, h - TRIM)).resize((W, H), Image.LANCZOS)
    a = np.asarray(img).astype(np.float32)
    # The step across the wrap, shared out over a band each side so the two edges meet.
    step = a[:, 0] - a[:, -1]
    for i in range(BAND):
        k = 1 - i / BAND
        a[:, i] -= step * 0.5 * k
        a[:, W - 1 - i] += step * 0.5 * k
    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(OUT, quality=88, optimize=True, progressive=True)
    print(OUT, OUT.stat().st_size)


if __name__ == '__main__':
    main()
