import { COMBAT_TUNING } from './tuning';

const PACE = COMBAT_TUNING.enemyPace;

export type Behavior = 'chaser' | 'kiter' | 'lunger' | 'caster' | 'boss';

export interface EnemyDef {
  id: string;
  name: string;
  level: number;
  hp: number;
  dmg: [number, number];
  /** Attacks per second. Pacing (this, speed, castTime) comes from COMBAT_TUNING.enemyPace. */
  atkSpeed: number;
  atkRange: number;
  /** Units per second. */
  speed: number;
  armor: number;
  radius: number;
  aggro: number;
  behavior: Behavior;
  drop: string;
  model: string;
  scale: number;
  projSpeed?: number;
  aoeRadius?: number;
  /** Casters: seconds from starting the cast to the AoE landing. */
  castTime?: number;
  /** Casters: number of AoE circles per cast (the first always on the player). */
  multiCast?: number;
  /** Mini-bosses show a boss bar. */
  elite?: boolean;
  /**
   * Total combat XP for a kill, shared by the fraction of its health you dealt (see XP_TUNING).
   * Set for OSRS-length progression: docs/BALANCE.md has the XP/hour and hours-to-level they give.
   */
  xp: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  goblin: {
    id: 'goblin', name: 'Goblin Grunt', level: 2, hp: 14, xp: 3, dmg: [2, 4], atkRange: 1.2, ...PACE.goblin,
    armor: 0, radius: 0.45, aggro: 9, behavior: 'chaser', drop: 'common', model: 'goblin', scale: 1,
  },
  kobold: {
    id: 'kobold', name: 'Kobold Slinger', level: 3, hp: 11, xp: 2.5, dmg: [2, 4], atkRange: 8, ...PACE.kobold,
    armor: 0, radius: 0.4, aggro: 11, behavior: 'kiter', drop: 'common', model: 'kobold', scale: 1, projSpeed: 11,
  },
  drakeling: {
    id: 'drakeling', name: 'Drakeling', level: 6, hp: 26, xp: 6, dmg: [4, 7], atkRange: 5, ...PACE.drakeling,
    armor: 3, radius: 0.55, aggro: 10, behavior: 'lunger', drop: 'elite', model: 'drakeling', scale: 1,
  },
  cultist: {
    id: 'cultist', name: 'Ember Cultist', level: 8, hp: 22, xp: 7, dmg: [6, 10], atkRange: 9, ...PACE.cultist,
    armor: 1, radius: 0.45, aggro: 12, behavior: 'caster', drop: 'elite', model: 'cultist', scale: 1,
    aoeRadius: 1.8,
  },
  cinder_priest: {
    id: 'cinder_priest', name: 'Cinder Priest', level: 14, hp: 260, xp: 75, dmg: [8, 12], atkRange: 10, ...PACE.cinder_priest,
    armor: 4, radius: 0.6, aggro: 12, behavior: 'caster', drop: 'priest', model: 'cultist', scale: 1.45,
    aoeRadius: 2.0, multiCast: 4, elite: true,
  },
  cinderwing: {
    id: 'cinderwing', name: 'Cinderwing', level: 20, hp: 1100, xp: 220, dmg: [9, 14], atkRange: 3.4, ...PACE.cinderwing,
    armor: 8, radius: 1.7, aggro: 12, behavior: 'boss', drop: 'cinderwing', model: 'cinderwing', scale: 1,
  },
};
