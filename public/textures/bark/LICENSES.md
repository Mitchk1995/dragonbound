# Bark textures

The grown trees' bark (`src/render/foliage.ts`). Each was generated with Codex image generation as a softly painted,
tileable bark, then made to tile, toned and given its normal map by `tools/bark_textures.py`. The generated sources are
kept in `D:\dragonbound-archive\bark-src`.

| File | What | Source |
| --- | --- | --- |
| `oak.jpg` | Oak bark colour: deep vertical furrows between long plated ridges | Generated with Codex (`oak-bark.png`) |
| `oak-normal.jpg` | Oak bark relief (OpenGL normal map) | Drawn from `oak.jpg`'s source by `tools/bark_textures.py` |
| `tree.jpg` | Common tree bark colour: fine, shallow fissures | Generated with Codex (`tree-bark.png`) |
| `tree-normal.jpg` | Common tree bark relief (OpenGL normal map) | Drawn from `tree.jpg`'s source by `tools/bark_textures.py` |
