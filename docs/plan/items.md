# Existing item reference

Part of the design plan; the index and the current direction are in [DESIGN_DECISIONS.md](../DESIGN_DECISIONS.md). A snapshot for comparison, not balance. Newer decisions take precedence over older ones. Record each new decision here, dated, in the same session it is made.

The following catalog is an October 1, 2026 reference snapshot. It preserves names and recorded values for comparison while the new early-region progression is designed. These values are not the approved levels 1–10 balance or a promise that every listed item belongs in that region.

The snapshot contains 57 equipment entries: 48 base gear items, four pickaxes and five named uniques. Fourteen additional material and quest entries bring the full item reference to 71 entries.

### Material tier fields

The equip requirement refers to the relevant skill: Melee for metal weapons, Defence for metal armor and Mining for pickaxes. It is not a universal player or region level. The smithing base and piece offset are separate catalog fields, not a complete recipe definition.

| Material | Equip skill level | Smithing base | XP per bar | Tier min item level |
|---|---|---|---|---|
| Bronze | 1 | 1 | 12.5 | 1 |
| Iron | 10 | 15 | 25 | 4 |
| Steel | 20 | 30 | 37.5 | 9 |
| Emberforged | 30 | 40 | 60 | 15 |

### Metal equipment names

Each row identifies all four exact material variants. Shared shapes do not erase the material differences.

| Bronze | Iron | Steel | Emberforged |
|---|---|---|---|
| Bronze Sword | Iron Sword | Steel Sword | Emberforged Sword |
| Bronze Longsword | Iron Longsword | Steel Longsword | Emberforged Longsword |
| Bronze Med Helm | Iron Med Helm | Steel Med Helm | Emberforged Med Helm |
| Bronze Full Helm | Iron Full Helm | Steel Full Helm | Emberforged Full Helm |
| Bronze Chainbody | Iron Chainbody | Steel Chainbody | Emberforged Chainbody |
| Bronze Platebody | Iron Platebody | Steel Platebody | Emberforged Platebody |
| Bronze Gauntlets | Iron Gauntlets | Steel Gauntlets | Emberforged Gauntlets |
| Bronze Boots | Iron Boots | Steel Boots | Emberforged Boots |
| Bronze Pickaxe | Iron Pickaxe | Steel Pickaxe | Emberforged Pickaxe |

### Piece crafting reference

| Piece | Slot or type | Smithing offset | Bar count |
|---|---|---|---|
| Sword | weapon | 0 | 1 |
| Longsword | weapon | 6 | 2 |
| Med Helm | helm | 2 | 1 |
| Full Helm | helm | 7 | 2 |
| Chainbody | body | 9 | 3 |
| Platebody | body | 13 | 5 |
| Gauntlets | gloves | 4 | 1 |
| Boots | boots | 5 | 1 |
| Pickaxe | tool | 0 | 2 |

### Metal base stat reference

Damage, armor, speed and swingTicks are captured base fields. Speed and swingTicks are reproduced without an invented unit conversion. Minimum item level is a separate item field and must not be read as the player requirement.

| Piece | Bronze | Iron | Steel | Emberforged |
|---|---|---|---|---|
| Sword | 3–6 damage speed 1.25 min item 1 | 5–9 damage speed 1.25 min item 4 | 7–13 damage speed 1.25 min item 9 | 10–17 damage speed 1.25 min item 15 |
| Longsword | 5–9 damage speed 1 min item 2 | 7–13 damage speed 1 min item 5 | 10–18 damage speed 1 min item 10 | 14–24 damage speed 1 min item 16 |
| Med Helm | 2 armor min item 1 | 4 armor min item 4 | 6 armor min item 9 | 9 armor min item 15 |
| Full Helm | 3 armor min item 2 | 6 armor min item 5 | 9 armor min item 10 | 13 armor min item 16 |
| Chainbody | 4 armor min item 3 | 8 armor min item 6 | 12 armor min item 11 | 17 armor min item 17 |
| Platebody | 6 armor min item 4 | 11 armor min item 7 | 16 armor min item 12 | 23 armor min item 18 |
| Gauntlets | 1 armor min item 2 | 2 armor min item 5 | 4 armor min item 10 | 6 armor min item 16 |
| Boots | 1 armor min item 2 | 2 armor min item 5 | 4 armor min item 10 | 6 armor min item 16 |
| Pickaxe | swingTicks 5 | swingTicks 4 | swingTicks 4 | swingTicks 3 |

### Bows and staffs

“None listed” means the captured item has no requirement field. It is not a separate design decision that the item unlocks at skill level 1.

| Weapon | Requirement | Damage | Speed | Min item level |
|---|---|---|---|---|
| Worn Shortbow | None listed | 2–5 | 1.1 | 1 |
| Hunter's Bow | Ranged 10 | 4–8 | 1.1 | 4 |
| Recurve Bow | Ranged 20 | 6–11 | 1.05 | 9 |
| Drakebone Bow | Ranged 30 | 8–15 | 1.05 | 15 |
| Apprentice Staff | None listed | 3–6 | 1 | 1 |
| Oak Staff | Magic 10 | 5–10 | 1 | 4 |
| Runed Staff | Magic 20 | 7–14 | 0.95 | 9 |
| Emberwood Staff | Magic 30 | 10–18 | 0.95 | 15 |

### Leather and jewelry

| Item | Slot | Requirement | Armor | Min item level |
|---|---|---|---|---|
| Leather Cap | Helm | None listed | 2 | 1 |
| Leather Body | Body | None listed | 4 | 1 |
| Leather Gloves | Gloves | None listed | 1 | 1 |
| Leather Boots | Boots | None listed | 1 | 1 |
| Bone Amulet | Amulet | None listed | None listed | 1 |
| Jade Amulet | Amulet | None listed | None listed | 6 |
| Copper Ring | Ring | None listed | None listed | 1 |
| Silver Ring | Ring | None listed | None listed | 6 |

### Named unique equipment

The catalog records these names and base mappings. It does not define their complete special powers here. Wyrmbone Harness is the current display name of the entry with the legacy internal name Scaleguard; those are not two separate current uniques.

| Unique | Base item | Requirement | Min item level |
|---|---|---|---|
| Cinderfang | Steel Longsword | Melee 20 | 10 |
| Emberstring | Recurve Bow | Ranged 20 | 9 |
| Staff of Kindled Ash | Runed Staff | Magic 20 | 9 |
| Ashen Crown | Iron Full Helm | Defence 10 | 5 |
| Wyrmbone Harness | Steel Chainbody | Defence 20 | 11 |

### Materials and quest objects

| Group | Exact catalog names |
|---|---|
| Ores and resources | Copper Ore, Tin Ore, Iron Ore, Coal, Emberite Ore |
| Bars | Bronze Bar, Iron Bar, Steel Bar, Emberforged Bar |
| Gems | Uncut Sapphire, Uncut Emerald, Uncut Ruby |
| Quest objects | Cinder Seal Fragment, Cinder Key |

Mining XP, yields, respawn timing, smelting ratios, acquisition locations, complete recipes and quest rewards are not defined by these name and item-field tables. They remain separate progression-design work.
