# Character material sources

The characters' painted material library (`src/render/charSurfaces.ts`), tinted in the game by each part's role colour
and laid on the models' `tile` UVs under their baked maps (`tools/blender/bake.py`). Each layer is an RGB PNG: the
material's painted value round its mean (R) and its relief's normal (G, B). Metal takes no layer: it is smooth and
polished (`src/render/polish.ts`). The painted layers were generated with Codex image generation as softly
hand-painted, tileable materials, then made to tile, evened out and turned into value and relief by
`tools/char_textures.py`; the generated sources are kept in `D:\dragonbound-archive\codex\tex\chars` (prompts:
`tex-chars-prompt.txt`, `tex-chars2-prompt.txt` beside that folder). The mail is not painted: it is a patch of rings
modelled and baked in Blender by `tools/blender/mail_tile.py` (its bake is kept in
`D:\dragonbound-archive\mail-tile`), so its rows meet exactly across the tile.

| File | Source | Licence |
| --- | --- | --- |
| `skin.png` | Warm skin, smooth with faint painted mottling. Generated with Codex (`char-skin.png`) for Dragonbound, October 4, 2026. | Project-owned artwork |
| `wool.png` | Woven wool tunic cloth, a soft plain weave. Generated with Codex (`char-wool.png`) for Dragonbound, October 4, 2026. | Project-owned artwork |
| `linen.png` | Coarse linen for trousers, an uneven weave with slubs. Generated with Codex (`char-linen.png`) for Dragonbound, October 4, 2026. | Project-owned artwork |
| `leather.png` | Worn leather: pebbled grain, creases, scuffs. Generated with Codex (`char-leather.png`) for Dragonbound, October 4, 2026. | Project-owned artwork |
| `padded.png` | Padded gambeson cloth, a dense twill in quilted diamonds. Generated with Codex (`char-cloth-dark.png`) for Dragonbound, October 4, 2026. | Project-owned artwork |
| `wood.png` | Carved wood for hafts and bows, long straight grain. Generated with Codex (`char-wood.png`) for Dragonbound, October 4, 2026. | Project-owned artwork |
| `hair.png` | Stylised painted hair in soft locks. Generated with Codex (`char-hair.png`) for Dragonbound, October 4, 2026. | Project-owned artwork |
| `goblin.png` | Goblin hide, small rounded bumps and mottling. Generated with Codex (`char-goblin.png`) for Dragonbound, October 4, 2026. | Project-owned artwork |
| `mail.png` | Rows of mail rings, each row lying over the next like shingles. Modelled and baked in Blender by `tools/blender/mail_tile.py`, October 4, 2026. | Project-owned artwork |
