# Painted alphabets

The lettering of the game's names and plates (`src/ui/paintedText.ts`). Three alphabets (A-Z, a-z, 0-9 and `.,!?'-:`)
were generated with Codex image generation for this project in the game's painted style (no third-party source, no
licence restrictions); `tools/digit_atlas.py fonts` cuts the sheets into the atlases below and writes the glyph table
`src/ui/fontGlyphs.ts`. The generated sheets are kept in `D:\dragonbound-archive\codex\alpha`.

| File | What | Used for |
| --- | --- | --- |
| `gold.png` | Forged gold, a dark edge | Place names and the zone plaque, NPC names over heads, the boss bar, text floaters ("+30 gold", "+1 potion") |
| `blue.png` | Glowing pale blue | Portal titles and other magic text |
| `brown.png` | Brown ink with a cream outline | Parchment and other light panels (none yet, so unused) |

The sheets have no `+`, so `tools/digit_atlas.py` draws one into each alphabet from the hyphen and a quarter-turned
copy of it. Other characters outside the set (`·`, `/`, `(`, `)`, `%` and the like) are set in the ordinary UI font beside
the painted ones.
