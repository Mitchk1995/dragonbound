# Sky texture sources

The island's sky (`src/render/sky.ts`): a panorama of clear sky over a sea of soft cloud, graded in the game to each
zone's light. It was generated with Codex image generation as an equirectangular panorama, then trimmed of the thin
lines along its edges and made to wrap with no seam by `tools/sky_texture.py`. The generated source is kept in
`D:\dragonbound-archive\codex\tex\sky`.

| File | Source | Licence |
| --- | --- | --- |
| `cloudsea.jpg` | A clear blue sky over a sea of soft cloud far below the horizon, as seen from a floating island. Generated with Codex (`sky-cloudsea.png`) for Dragonbound, October 2, 2026. | Project-owned artwork |
