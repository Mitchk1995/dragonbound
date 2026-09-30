# Dragonbound

Diablo-style click-to-move combat with OSRS-length progression, in a high-fantasy setting with dragons.
v0.1 is the **combat-feel slice**: one zone (Ashen Foothills), three combat styles, loot, skills to 99, and the Cinderwing boss.

## Play

```bash
npm run play      # build + open the desktop app (saves to %APPDATA%\Dragonbound\save.json)
npm run dev       # desktop app with hot reload while developing
npm run dev:web   # browser only, http://localhost:5173 (saves to browser storage)
npm run dist      # package a portable Windows .exe into release/
npm test          # logic tests (XP curve, drop rates, damage, saves, pathing)
```

## Controls

| Input | Action |
|---|---|
| Left-click ground (hold) | Move |
| Left-click enemy | Attack until it dies |
| Shift + click | Attack in place |
| Q W E | Abilities (depend on your weapon; E unlocks at style level 15) |
| 1 | Healing potion |
| Alt (hold) | Show all loot labels |
| I / K / L / H | Inventory / Skills / Collection log / Help |
| F1 | Debug panel (god mode, drop-rate ×1000, teleports, +levels) |

## Where things live

- `src/data/*.ts`: **all tuning numbers** (items, affixes, enemies, drop tables, abilities).
- `src/game.ts`: game loop, combat resolution, loot, progression, spawning.
- `src/ai/boss.ts`: Cinderwing's attack patterns and phases.
- `src/entities/`: player, enemies, projectiles, ground loot, pet.
- `src/render/`: models, animation rig, GLB registry. `src/fx/` has particles, sound and telegraphs.
- `src/ui/`: HUD, panels, tooltips, floating text.
- `tools/blender/*.py`: every model is a script. Re-export from Blender's Python console or the MCP:
  `exec(open(r'D:\gameplanning\tools\blender\dragons.py').read())`, which writes to `public/models/*.glb`.
  Preview renders go to `tools/blender/previews/`. If a `.glb` is missing, the game falls back to its code-built placeholder.

## Roadmap

v0.2 Dragonspire Keep + Mining/Smithing + first unlock chain → v0.3 Herblore, Runecrafting/Enchanting →
v0.4 Beastmastery (dragon eggs, pets that fight) → v0.5 Dragon Hunts ladder, collection log, quests.
