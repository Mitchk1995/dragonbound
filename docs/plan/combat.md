# Combat, classes and controls

Part of the design plan; the index and the current direction are in [DESIGN_DECISIONS.md](../DESIGN_DECISIONS.md). Progression and loot are in [gameplay.md](gameplay.md). Newer decisions take precedence over older ones. Record each new decision here, dated, in the same session it is made.

## Round 5 decisions (October 1 evening)

### Classes, builds and controls (new)

- **Classes.** You choose a class at character creation, and more advanced classes can be picked up later. This replaces "every style gets early gear somehow": your class decides your starting kit.
- **Builds are the heart of replay.** Skill trees inside each class, elements and elemental combinations, mixed classes and elements, many viable builds (Chronomancer-style variety). Every new character should feel like a different game. Balance needs a good way to test builds.
- **A summoner class later**, built around dragon whelplings and summons.
- **Controls:** Space is a dodge roll toward the cursor (shared by every class; it replaces "shared dodge vs per-style escapes"), Q drinks a health potion, number keys fire abilities, with a limited number of abilities on the bar. Movement must feel nice.
- **Combat looks flashy:** strong hit effects and good damage numbers.
- **Flinch:** solid hits flinch ordinary enemies; heavy enemies build a stagger meter; bosses stagger at set moments. Don't add flinch resistance by default: in Diablo II you can keep a zombie flinching as long as you keep hitting it, and resistance could break fast attack speeds. Revisit only if playtesting shows a problem.
- **Unique and exceptional items carry extra effects:** cool combos, elemental effects, unique abilities. A fully reinforced mythic bronze item can match a plain iron one, not a plain steel one.
- **Skill-icon colours** wait until classes and elements are designed.

## Combat and movement (October 1)

### The intended feel

**Agreed direction.** Combat should feel closest to Diablo II, with some Diablo IV influence and more active skill use than a left-click and right-click pair. Dragonbound should retain its own systems rather than copy a complete ruleset from either game.

Kiting must work in practice. Early monsters should be very slow, the player's baseline movement should feel comfortable, and encounters need enough open room to create distance. Later armor, magic items or other equipment can improve movement, but basic repositioning should not depend on first finding a speed bonus.

Melee play should still require attention to health and enemy behavior. Movement, attack commitment and the time available to react need to be considered together. Slow enemy walking alone does not establish a fair encounter if projectiles, charges or attack timing remove the repositioning window.

### Functional flinch and hit recovery

**Agreed direction.** Landing a hit should briefly interrupt or hold an enemy so that the player gains real time to reposition. A visible reaction without a gameplay effect would not satisfy the intended Diablo II-like relationship between hitting and kiting.

**Open.** Decide which hits trigger flinch, how long recovery lasts, how repeated hits interact, and how heavy enemies and bosses respond. The discussion did not settle blanket immunity for heavy enemies or bosses. Existing behavior should not silently become the design rule.

**Working proposals.** Clear ordinary-enemy hit reactions, some resistance to repeated interruption, and particular boss interruption opportunities are possible approaches. They should be judged alongside pursuit speed, attack cadence, knockback, commitment, charges and projectiles.

### Dodge and active skills

A dodge or escape answer for telegraphed danger, especially circular attacks, is wanted as a design problem to solve. A limited shared dodge remains under consideration alongside distinct style-specific escape tools. The exact control, resource, timing and availability rules are open.

The existing reference includes ranged Evasive Roll, melee Leap Slam and magic control. Those examples do not decide whether every style should also receive the same dodge. They are useful points of comparison while deciding how each style avoids damage.

The desired richer skill usage does not yet set the number of hotbar slots, cooldowns, resource costs, unlock cadence or a complete ability list. Eventually, exceptional loot may change how skills behave rather than only add numerical bonuses.

### How combat should be judged

Use a short focused interactive playthrough for the behavior being changed, followed by Mitchell's judgment of the feel. Automated checks can help catch problems, but still images and numerical simulations cannot establish that kiting, attack commitment or dodging is enjoyable.

The combat review should pay particular attention to whether a landed hit creates an actual opening, whether the player can escape pursuit, and whether telegraphed attacks leave a usable response window. Recheck changed or failed behavior rather than repeatedly replaying everything.
