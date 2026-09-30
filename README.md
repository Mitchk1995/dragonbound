# Dragonbound

Diablo-style click-to-move combat with OSRS-length progression, in a high-fantasy world of dragons.

**Chapter 1: The Hidden Keep.** You wake in Dragonspire Keep, a ruined fortress hidden on a floating island in the Veil. Portal arches lead out into the world:
- **Emberdeep Mine** (safe): mine copper, tin, iron and coal.
- **Ashen Foothills** (dangerous): monster packs and emberite veins.
- **Sunken Ruin**: the quest *The Cinder Seal*.
- **Cinderwing's Lair**: the chapter's dragon and its super-rare drops.

Smelt and smith your way from bronze to Emberforged gear, restore the keep hall by hall, and chase the achievement diary and collection log. Skills level to 99 on the OSRS curve.

## Play

```bash
npm run play      # build + open the desktop app (saves to %APPDATA%\Dragonbound\save.json)
npm run dev       # desktop app with hot reload while developing
npm run dev:web   # browser only, http://localhost:5173 (saves to browser storage)
npm run dist      # portable Windows .exe in release/
npm test          # logic tests (XP, drops, recipes, saves, zone pathing, data integrity)
```

## Controls

| Input | Action |
|---|---|
| Left-click | Move (hold to keep walking) · attack · pick up · mine · use stations · talk |
| Shift + click | Attack in place |
| Q W E R | Abilities (depend on your weapon; E unlocks at style level 15) |
| 1 · T | Healing potion · Veilstone recall to the keep |
| I · K · J · L | Inventory · Skills (and combat stance) · Journal (quests, diary) · Collection log |
| Alt (hold) | Show all loot labels |
| Esc | Close windows / settings · F1 debug panel |

## Where things live

- `src/data/`: **all content and tuning**: items and tiers, recipes, ores, enemies, drops, zones, quests, diary, keep restorations, shop.
- `src/systems/`: combat, items (inventory, bank, shop), progression, skilling (tick-based), story (tutorial, quests, diary, restorations, dialogue), fx.
- `src/world/`: zone runtime (one fresh instance per portal trip), layouts, nav grid, world view, props.
- `src/render/`: model registry (GLB loading, gear attachment, role recolouring), rig animation, 3D item icons.
- `src/ui/`: HUD, panels, title and character creation, tooltip, stone and iron kit, SVG icons.
- `tools/blender/`: every model is a script; see [docs/ART_CONTRACT.md](docs/ART_CONTRACT.md).
- `docs/CHAPTER1_PLAN.md`: the Chapter 1 design.

## Contributing

GitHub flow: branch → PR → CI (typecheck, tests, build, encoding) → review → squash-merge. See [CONTRIBUTING.md](CONTRIBUTING.md).
