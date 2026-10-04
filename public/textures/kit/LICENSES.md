# Building kit texture sources

The building kit's surfaces (`src/world/kit/surfaces.ts`): one strip of colour layers (`surfaces.jpg`) and one of
their normal maps (`surfaces-normal.jpg`), six square layers side by side, which the game cuts into one texture
array. Each layer was made tileable, its large-scale light evened out, turned into a colour multiplier round a
mean (the piece's own colour gives the hue) and given a normal map by `tools/kit_textures.py`. The plant atlas
(`plants.webp`) holds six painted sprays in their own colours, each trimmed and fitted to its cell by the same
script. The generated sources are kept in `D:\dragonbound-archive\codex\kit` (made for the kit) and
`D:\dragonbound-archive\codex\tex` (the October 2 library).

| Layer | Source | Licence |
| --- | --- | --- |
| stone | Dressed cream limestone, the face of one block: faint tooling, pits and mottling, no joints. Generated with Codex (`kit-stone.png`) for Dragonbound, October 4, 2026. | Project-owned artwork |
| plaster | Lime plaster, warm white with soft trowel marks. Generated with Codex (`wood-plaster.png`) for Dragonbound, October 2, 2026. | Project-owned artwork |
| oak | Planed oak, long straight grain with soft knots and fine dry cracks. Generated with Codex (`kit-oak.png`) for Dragonbound, October 4, 2026. | Project-owned artwork |
| clay | Fired terracotta, mottled with burnt and dusty patches and a trace of lichen (roof tiles, pots, the oven's bricks, bread). Generated with Codex (`kit-clay.png`) for Dragonbound, October 4, 2026. | Project-owned artwork |
| iron | Hammered dark iron. Generated with Codex (`metal-iron.png`) for Dragonbound, October 2, 2026. | Project-owned artwork |
| cloth | Linen weave (its blue taken out: the piece's colour dyes it). Generated with Codex (`cloth-banner.png`) for Dragonbound, October 2, 2026. | Project-owned artwork |

| Plant (atlas cell) | Source | Licence |
| --- | --- | --- |
| bush | A leafy flowering shrub. Generated with Codex (`plants/plant-bush.png`) for Dragonbound, October 2, 2026. | Project-owned artwork |
| poppies | Red field poppies. Generated with Codex (`plants/plant-flowers-red.png`) for Dragonbound, October 2, 2026. | Project-owned artwork |
| buttercups | Buttercups and daisies. Generated with Codex (`plants/plant-flowers-yellow.png`) for Dragonbound, October 2, 2026. | Project-owned artwork |
| cornflowers | Cornflowers and lavender. Generated with Codex (`plants/plant-flowers-blue.png`) for Dragonbound, October 2, 2026. | Project-owned artwork |
| fern | A fern. Generated with Codex (`plants/plant-fern.png`) for Dragonbound, October 2, 2026. | Project-owned artwork |
| grass | A clump of tall grass. Generated with Codex (`plants/plant-grass-clump.png`) for Dragonbound, October 2, 2026. | Project-owned artwork |
