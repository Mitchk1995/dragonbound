export type Behavior = 'chaser' | 'kiter' | 'lunger' | 'caster' | 'boss';

export interface EnemyDef {
  id: string;
  name: string;
  level: number;
  hp: number;
  dmg: [number, number];
  /** Attacks per second. */
  atkSpeed: number;
  atkRange: number;
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
  castTime?: number;
  /** Casters: number of AoE circles per cast (the first always on the player). */
  multiCast?: number;
  /** Mini-bosses show a boss bar. */
  elite?: boolean;
}

export const ENEMIES: Record<string, EnemyDef> = {
  goblin: {
    id: 'goblin', name: 'Goblin Grunt', level: 2, hp: 14, dmg: [2, 4], atkSpeed: 0.9, atkRange: 1.2,
    speed: 3.6, armor: 0, radius: 0.45, aggro: 9, behavior: 'chaser', drop: 'common', model: 'goblin', scale: 1,
  },
  kobold: {
    id: 'kobold', name: 'Kobold Slinger', level: 3, hp: 11, dmg: [2, 4], atkSpeed: 0.6, atkRange: 8,
    speed: 3.2, armor: 0, radius: 0.4, aggro: 11, behavior: 'kiter', drop: 'common', model: 'kobold', scale: 1, projSpeed: 11,
  },
  drakeling: {
    id: 'drakeling', name: 'Drakeling', level: 6, hp: 26, dmg: [4, 7], atkSpeed: 0.5, atkRange: 5,
    speed: 4.2, armor: 3, radius: 0.55, aggro: 10, behavior: 'lunger', drop: 'elite', model: 'drakeling', scale: 1,
  },
  cultist: {
    id: 'cultist', name: 'Ember Cultist', level: 8, hp: 22, dmg: [6, 10], atkSpeed: 0.35, atkRange: 9,
    speed: 3.0, armor: 1, radius: 0.45, aggro: 12, behavior: 'caster', drop: 'elite', model: 'cultist', scale: 1,
    aoeRadius: 1.8, castTime: 1.2,
  },
  cinder_priest: {
    id: 'cinder_priest', name: 'Cinder Priest', level: 14, hp: 260, dmg: [8, 12], atkSpeed: 0.45, atkRange: 10,
    speed: 2.6, armor: 4, radius: 0.6, aggro: 12, behavior: 'caster', drop: 'priest', model: 'cultist', scale: 1.45,
    aoeRadius: 2.0, castTime: 1.3, multiCast: 4, elite: true,
  },
  cinderwing: {
    id: 'cinderwing', name: 'Cinderwing', level: 20, hp: 1100, dmg: [9, 14], atkSpeed: 0.8, atkRange: 3.4,
    speed: 3.2, armor: 8, radius: 1.7, aggro: 12, behavior: 'boss', drop: 'cinderwing', model: 'cinderwing', scale: 1,
  },
};
