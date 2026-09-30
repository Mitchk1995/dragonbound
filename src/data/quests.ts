import type { SkillId } from '../types';

export interface QuestStage {
  /** Journal text for this stage. */
  text: string;
}

export interface QuestDef {
  id: string;
  name: string;
  reqs: { skill: SkillId; level: number }[];
  stages: QuestStage[];
  rewards: string[];
}

export const QUESTS: Record<string, QuestDef> = {
  cinder_seal: {
    id: 'cinder_seal',
    name: 'The Cinder Seal',
    reqs: [{ skill: 'smithing', level: 25 }],
    stages: [
      { text: 'The Warden says Cinderwing\'s lair is sealed by an old ward. Take the Sunken Ruin portal and recover the three seal fragments.' },
      { text: 'I have all three fragments. I should bring them back to the Warden.' },
      { text: 'Forge the Cinder Key at the anvil: 3 seal fragments, 2 iron bars and 1 emberite ore (Smithing 25).' },
      { text: 'Use the Cinder Key on the sealed gate at the far north of the Wyrmwood Foothills.' },
    ],
    rewards: ['1,250 Smithing XP', '750 Mining XP', '750 gold', "Access to Cinderwing's Lair", 'Unlocks the Lair Arch restoration'],
  },
};
