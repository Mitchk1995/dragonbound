/**
 * Achievement diary. Tasks track counters in the save (`counters[key]`), levels, quests
 * or restorations. Rewards are permanent and unlock per tier.
 */
export type DiaryTier = 'easy' | 'medium' | 'hard';

export type TaskCheck =
  | { type: 'count'; key: string; n: number }
  | { type: 'level'; skill: string; n: number }
  | { type: 'anyLevel'; n: number }
  | { type: 'quest'; id: string }
  | { type: 'restore'; id: string }
  | { type: 'bossTime'; secs: number };

export interface DiaryTask {
  id: string;
  tier: DiaryTier;
  text: string;
  check: TaskCheck;
}

export const DIARY_TASKS: DiaryTask[] = [
  { id: 'e_goblins', tier: 'easy', text: 'Slay 25 goblins', check: { type: 'count', key: 'kill:goblin', n: 25 } },
  { id: 'e_copper', tier: 'easy', text: 'Mine 50 copper ore', check: { type: 'count', key: 'mine:copper_ore', n: 50 } },
  { id: 'e_platebody', tier: 'easy', text: 'Smith a bronze platebody', check: { type: 'count', key: 'smith:bronze_platebody', n: 1 } },
  { id: 'e_combat10', tier: 'easy', text: 'Reach level 10 in any combat style', check: { type: 'count', key: 'maxStyle10', n: 1 } },
  { id: 'e_recall', tier: 'easy', text: 'Recall home with the Veilstone', check: { type: 'count', key: 'recall', n: 1 } },

  { id: 'm_iron', tier: 'medium', text: 'Mine 150 iron ore', check: { type: 'count', key: 'mine:iron_ore', n: 150 } },
  { id: 'm_drakes', tier: 'medium', text: 'Slay 40 drakelings', check: { type: 'count', key: 'kill:drakeling', n: 40 } },
  { id: 'm_steel', tier: 'medium', text: 'Smith any steel item', check: { type: 'count', key: 'smithTier:steel', n: 1 } },
  { id: 'm_quest', tier: 'medium', text: 'Complete The Cinder Seal', check: { type: 'quest', id: 'cinder_seal' } },
  { id: 'm_anvil', tier: 'medium', text: 'Reforge the Great Anvil', check: { type: 'restore', id: 'anvil_reforged' } },

  { id: 'h_cinder10', tier: 'hard', text: 'Slay Cinderwing 10 times', check: { type: 'count', key: 'kill:cinderwing', n: 10 } },
  { id: 'h_speed', tier: 'hard', text: 'Slay Cinderwing in under 1:30', check: { type: 'bossTime', secs: 90 } },
  { id: 'h_emberite', tier: 'hard', text: 'Mine 60 emberite ore', check: { type: 'count', key: 'mine:emberite_ore', n: 60 } },
  { id: 'h_emberplate', tier: 'hard', text: 'Smith an Emberforged Platebody', check: { type: 'count', key: 'smith:ember_platebody', n: 1 } },
  { id: 'h_fifty', tier: 'hard', text: 'Reach level 50 in any skill', check: { type: 'anyLevel', n: 50 } },
];

export const DIARY_REWARDS: Record<DiaryTier, { text: string[] }> = {
  easy: { text: ['+1 potion belt charge', '2,000 XP lamp (any skill)'] },
  medium: { text: ['10% chance to mine an extra ore in Emberdeep', 'Veilstone recall takes 1.5s instead of 3s'] },
  hard: { text: ['Ashen Cloak (cosmetic)', '+5% experience in the Foothills and the Lair'] },
};
