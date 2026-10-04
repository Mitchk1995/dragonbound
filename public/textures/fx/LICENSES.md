# Effect texture sources

The visual effects' textures (`src/fx/`, layout in `src/fx/sheets.ts`). Each was cut from a painted effect sheet generated with
Codex image generation for the Dragonbound texture library, then cleaned (the black's grain taken out, smoke and dust given
coverage, light to be tinted reduced to its brightness), resampled and packed by `tools/blender/vfx.py`. The generated sources
are kept in `D:\dragonbound-archive\codex\tex` (`fx-flipbook`, `fx-mesh`, `fx-beams`), listed in its `CATALOGUE.md`.

| File | What it holds | Source (generated with Codex for Dragonbound, October 2026) | Licence |
| --- | --- | --- | --- |
| `fx-impact.jpg` | A melee hit: white-gold star flash, shock ring and sparks (16 frames). | `flip-impact-a.png` | Project-owned artwork |
| `fx-crit.jpg` | A critical hit: red-gold jagged star burst (16 frames). | `flip-crit-a.png` | Project-owned artwork |
| `fx-explosion.jpg` | A fiery explosion, its smoke left to the smoke flipbook (16 frames). | `flip-explosion-a.png` | Project-owned artwork |
| `fx-frost.jpg` | A frost burst of ice shards and cold mist (16 frames). | `flip-frost-explosion-a.png` | Project-owned artwork |
| `fx-teleport.jpg` | A column of blue-white sparkles gathering and vanishing (16 frames). | `flip-teleport-a.png` | Project-owned artwork |
| `fx-page-a.jpg` | The torch flame, the bonfire, the fireball in flight (16 frames each), and the particles' shapes: a soft mote and a four-pointed glint (from the loot sparkle), an ice shard, four flame frames. | `flip-torch-a.png`, `flip-fire-b.png`, `flip-fireball-a.png`, `flip-sparkle-a.png`, `flip-ice-shard-a.png` | Project-owned artwork |
| `fx-page-b.jpg` | Lightning's crackle, the loot sparkle burst, the arcane burst and the healing swirl (16 frames each; the last two as brightness, tinted in the game). | `flip-electric-a.png`, `flip-sparkle-burst-b.png`, `flip-arcane-burst-a.png`, `flip-heal-a.png` | Project-owned artwork |
| `fx-page-c.webp` | Drawn over what lies behind (colour premultiplied by coverage): a smoke puff, a dust puff (in grey, tinted in the game), the death puff (16 frames each) and four blood drops in grey. | `flip-smoke-a.png`, `flip-dust-puff-a.png`, `flip-death-poof-a.png`, `blood-drops-a.png` | Project-owned artwork |
| `fx-slash.jpg` | The painted sword slash, unwrapped from its crescent into a straight strip (tail to head along its length). | `fx-slash-arc-a.png` | Project-owned artwork |
| `fx-trail.jpg` | Wispy light streaks, tiling (greyscale). | `fx-trail-a.png` | Project-owned artwork |
| `fx-noise.jpg` | Soft cloud noise, tiling (greyscale): what effects erode away through. | `fx-noise-a.png` | Project-owned artwork |
| `fx-ring.jpg` | A shockwave ring (greyscale). | `fx-ring-a.png` | Project-owned artwork |
| `fx-sigil.jpg` | A magic circle of rings and star points (greyscale). | `fx-sigil-a.png` | Project-owned artwork |
| `fx-frost-circle.jpg` | The frost magic circle, in colour. | `magic-circle-frost-a.png` | Project-owned artwork |
| `fx-bolt.jpg` | A crackling lightning strip, tiling along its length (greyscale). | `beam-lightning-a.png` | Project-owned artwork |
