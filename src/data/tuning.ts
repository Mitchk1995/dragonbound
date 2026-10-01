/**
 * Global XP pacing: OSRS's XP curve, and rates set so efficient play takes about as long as OSRS.
 * Combat XP comes from each enemy's fixed `xp` value (data/enemies.ts, shared by the fraction of its
 * health you dealt), so area damage and overkill can't inflate it and XP/hour is bounded by how
 * fast a zone can be cleared. Those values were cut to about a fifth so a combat style reaches 10 in
 * about 20 minutes, 20 in about an hour and 50 in about a dozen hours of efficient Chapter 1 play;
 * 99 then takes about 200 hours once later chapters add zones that keep XP/hour climbing. Mining
 * was already on that pace. The deterministic simulators in tests/balance/ measure all of it and
 * docs/BALANCE.md has the tables.
 */
export const XP_TUNING = {
  /** Hitpoints XP as a fraction of the combat XP earned (OSRS's 1/3). */
  hitpointsShare: 1 / 3,
  /** Defence XP as a fraction of the combat XP earned, whatever the weapon style. */
  defenceShare: 0.5,
  /**
   * Plus Defence XP per point of damage your armour absorbs. Kept small (a few percent of a fight's
   * Defence XP) so standing in a pack soaking hits is never a way to train.
   */
  defencePerAbsorbed: 0.1,
  /**
   * Multipliers on the per-action XP in data/ores.ts and data/recipes.ts (OSRS's own values).
   * Mining keeps half, which already gives OSRS-length Mining. Smithing gets the full value: there is
   * no bar market here, every bar is mined and smelted by hand first, so the whole mine-smelt-smith
   * loop sets its pace, and at half it took several times longer than OSRS to 99.
   */
  mining: 0.5,
  smithing: 1,
};

/**
 * Mana: one pool shared by every weapon style (the hero swaps weapons freely). Skills spend it,
 * it refills over time and the healing potion tops it up too. The pool grows with the best
 * combat-style level, so a new character can chain a few skills and a veteran a few more.
 */
export const MANA_TUNING = {
  /** Max mana = base + perLevel x (highest of Melee, Ranged, Magic). */
  base: 30,
  perLevel: 2,
  /**
   * Mana per second = regenBase + regenFrac x max mana: 2.7/s at level 5, 3.1 at 20, 3.6 at 40.
   * Using every skill on cooldown costs about 4 mana/s early and 5-6 once the E skills unlock, so
   * regen covers roughly half to two thirds of that: a full pool lasts 20-40 s of all-out casting
   * (longer than any regular pack fight) and a long fight (a mini-boss, Cinderwing) makes you pick
   * your casts. Regen grows slowly with the pool so high levels still can't cast everything forever.
   * Checked by tests/balance.test.ts.
   */
  regenBase: 2.2,
  regenFrac: 0.013,
  /** Extra regen (fraction of max per second) once you haven't been hit for a few seconds. */
  outOfCombatFrac: 0.04,
  /** Seconds without taking damage before the out-of-combat regen kicks in (same as life). */
  outOfCombatAfter: 4,
  /** Fraction of max mana a healing potion restores, over the same 1.5 s as its life. */
  potionFrac: 0.35,
};

/**
 * Combat pacing, Diablo 2 style: deliberate swings with a wind-up, an impact and a
 * follow-through; the base kit attacks about once a second and speed comes from gear.
 * Enemies are clearly slower than the hero, telegraph their attacks, and flinch from big hits.
 * Every number that sets how fast a fight plays lives here.
 */
export const COMBAT_TUNING = {
  hero: {
    /** Units per second before movement-speed gear. */
    moveSpeed: 4.8,
    turnSpeed: 18,
  },
  /** Base attacks per second, before attack-speed gear and War Cry. */
  weaponSpeed: {
    fists: 1.0,
    sword: 1.25,
    longsword: 1.0,
    shortbow: 1.1,
    heavyBow: 1.05,
    staff: 1.0,
    heavyStaff: 0.95,
  },
  /**
   * Melee swings track their target (combat/stats swingTrackStep / swingConnects): during the
   * wind-up the hero steps after an enemy backing out of reach at up to `speed` units/s (a kobold
   * backs off at about 2.1), stopping `margin` inside striking distance, and the blow still lands
   * on its target up to `leeway` units past reach. Without the step a kobold on open ground
   * slipped out of every swing that started with it in reach.
   */
  meleeTrack: { speed: 3.4, margin: 0.3, leeway: 0.8 },
  /** War Cry's attack-speed bonus in percent (its ability text says the same). */
  warCryAtkSpd: 20,
  /** Attack speed can't go above this, however much gear stacks. */
  maxAtkSpeed: 2.5,
  maxCastSpeed: 2,
  /** A basic attack's animation length as a fraction of the time between attacks (the rest is a short ready pause). */
  swingFrac: 0.92,
  /**
   * Where in every attack animation the blow lands (fraction of the animation): wind-up before,
   * follow-through after. Player swings, skills and enemy attacks share it, and the pose
   * keyframes in render/anim.ts are built around it.
   */
  impact: 0.55,
  /** Skill animation lengths in seconds at cast speed 1 (cast-speed gear divides them). */
  skillCast: {
    cleave: 0.7,
    war_cry: 0.8,
    multishot: 0.65,
    arrow_rain: 0.7,
    fireball: 0.6,
    frost_nova: 0.6,
    chain_lightning: 0.6,
  },
  /** Dash skills: flight time in seconds. */
  leapDur: 0.6,
  rollDur: 0.28,
  /** Seconds the world slows on impact (every hit lands with weight; crits hit harder). */
  hitstop: 0.035,
  hitstopCrit: 0.08,
  /** Knockback impulse per hit (units/s); an enemy slides about impulse / decay units. */
  knockback: {
    melee: 4,
    arrow: 2,
    bolt: 2.5,
    explosion: 7,
    cleave: 7,
    leap: 12,
    nova: 4,
    critMult: 1.6,
    /** How fast a shove dies out (per second): enemies slide further than the hero. */
    decay: 9,
    enemyDecay: 6,
  },
  /**
   * Hit recovery: a hit dealing at least `frac` of an enemy's life (or any crit on a regular
   * enemy) makes it flinch for `secs`, cancelling an attack it hadn't finished. Mini-bosses only
   * flinch from big hits; Cinderwing never does.
   */
  stagger: { frac: 0.12, secs: 0.3 },
  /** Mouse hold-to-attack (see combat/holdInput.ts). */
  input: {
    /** A press this close to an enemy (units, on the ground) counts as clicking it. */
    pressPick: 1.0,
    /** While holding, a new target this close to the cursor is picked up when the old one dies. */
    holdPick: 1.5,
    /** A held retarget never walks more than this far past attack range (keeps you out of the next pack). */
    holdChase: 1.5,
    /** Seconds between repeats of the ground-hold walk order. */
    walkRepeat: 0.1,
    /** Seconds between casts when a skill key is held down. */
    keyRepeat: 0.3,
  },
  /** Regular enemies: attack animation length (s) and the lunger's charge. */
  enemy: {
    swing: 0.8,
    throw: 0.9,
    lungeWindup: 0.7,
    lungeDash: 0.45,
    lungeSpeed: 11,
    lungeRecover: 0.8,
  },
  /** Per-enemy movement speed (units/s), attacks per second and caster cast time (s). */
  enemyPace: {
    goblin: { speed: 2.7, atkSpeed: 0.7 },
    kobold: { speed: 2.5, atkSpeed: 0.5 },
    drakeling: { speed: 3.1, atkSpeed: 0.4 },
    cultist: { speed: 2.3, atkSpeed: 0.35, castTime: 1.6 },
    cinder_priest: { speed: 2.1, atkSpeed: 0.4, castTime: 1.7 },
    cinderwing: { speed: 3.2, atkSpeed: 0.8 },
  },
  /**
   * Cinderwing's warnings (seconds from telegraph to hit). Each outlasts the slowest base swing
   * plus a step out of the area, so a committed attack never forces a hit (tests/combat-pacing).
   */
  boss: {
    bite: 1.2,
    breathWindup: 1.3,
    breathBurn: 1.6,
    tail: 1.4,
    gust: 1.25,
    meteor: 1.4,
    /** Phase-2 flight: seconds circling and raining fire, then the landing slam's warning. */
    flight: 7.9,
    land: 1.8,
  },
};
