# Damage-number digits

The painted digits of the floating damage numbers (`src/ui/worldText.ts`). The sheet of "0 1 2 3 4 5 6 7 8 9 + -" in
three colours was generated with Codex image generation for this project in the game's painted style (no third-party
source, no licence restrictions); `tools/digit_atlas.py` cuts it into the atlases below and writes the glyph table
`src/ui/digitGlyphs.ts`. The generated sheet is kept in `D:\dragonbound-archive\codex\digits`.

| File | What | Source |
| --- | --- | --- |
| `white.png` | Normal hits: warm white digits, brown outline | Generated with Codex (row A of `digits-sheet.png`) |
| `crit.png` | Critical hits: molten gold digits with an ember glow | Generated with Codex (row B) |
| `heal.png` | Heals: green digits | Generated with Codex (row C) |
| `hurt.png` | Damage taken: the white digits recoloured to the hurt red, outline kept dark | Row A, recoloured by `tools/digit_atlas.py` |
