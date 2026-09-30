/**
 * Global XP pacing. Chapter 1 aims for OSRS-length progression on Diablo-speed combat:
 * combat XP comes from each enemy's fixed `xp` value (shared by the fraction of its health
 * you dealt), so area damage and overkill can't inflate it, and XP/hour is bounded by how
 * fast an instance can be cleared.
 */
export const XP_TUNING = {
  /** Hitpoints XP as a fraction of the combat XP earned. */
  hitpointsShare: 1 / 3,
  /** Defence XP per point of damage your armour absorbs (on top of stance XP). */
  defencePerAbsorbed: 0.5,
  /** Multipliers on the per-action XP in data/ores.ts and data/recipes.ts. */
  mining: 0.5,
  smithing: 0.5,
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
