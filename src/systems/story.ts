import { DIARY_REWARDS, DIARY_TASKS, type DiaryTier, type DiaryTask } from '../data/diary';
import { BASES } from '../data/items';
import { RESTORATION_BY_ID, type Restoration } from '../data/keep';
import { QUESTS } from '../data/quests';
import { KEEP_ARCHES, ZONES } from '../data/zones';
import type { Enemy } from '../entities/enemy';
import type { Interactable } from '../entities/interactable';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { SKILL_INFO, levelForXp } from '../progression/skills';
import { SKILLS, type Item, type SkillId } from '../types';

export interface DialogueOption {
  label: string;
  run?: () => void;
  next?: () => Dialogue | null;
}

export interface Dialogue {
  speaker: string;
  portrait: string;
  text: string;
  options: DialogueOption[];
}

export const TUTORIAL_STEPS = [
  'Speak with the Warden',
  'Step through the Emberdeep arch',
  'Mine 3 copper ore and 3 tin ore',
  'Return to the keep through the exit portal (or press T to recall)',
  'Smelt 3 bronze bars at the furnace',
  'Smith a bronze sword at the anvil',
  'Equip your bronze sword (open your inventory with I)',
  'Speak with the Warden',
  'Step through the Ashen Foothills arch',
  'Slay 5 monsters',
  'Recall home with your Veilstone (press T)',
  'Speak with the Warden',
];

const QUEST = 'cinder_seal';

/** Tutorial, quests, diary, keep restorations, portal rules and NPC dialogue. */
export class Story {
  constructor(private g: Game) {}

  private get s() {
    return this.g.save;
  }

  // ─── Tutorial ────────────────────────────────────────────────────────────

  get tutorial() {
    return this.s.tutorial;
  }

  private advance(to: number) {
    if (this.s.tutorial !== to - 1) return;
    this.s.tutorial = to;
    this.g.sfx.play('pickup', 0.8, 1.4);
    this.g.ui.refresh();
    this.g.dirty = true;
  }

  finishTutorial(skipped: boolean) {
    const s = this.s;
    s.tutorial = -1;
    s.portals.mine = true;
    s.portals.foothills = true;
    if (skipped) {
      for (const id of ['bronze_pickaxe', 'bronze_sword', 'worn_bow', 'apprentice_staff']) this.g.items.add(makeItem(id));
      this.g.announce('Tutorial skipped: the Warden left you a pickaxe, a sword, a bow and a staff.', 'info');
    }
    this.g.ui.refresh();
    this.g.dirty = true;
  }

  objective(): string | null {
    const t = this.s.tutorial;
    if (t >= 0) {
      let text = TUTORIAL_STEPS[t];
      if (t === 2) text += ` (${Math.min(3, this.g.items.count('copper_ore'))}/3 copper, ${Math.min(3, this.g.items.count('tin_ore'))}/3 tin)`;
      if (t === 4) text += ` (${Math.min(3, this.s.counters['smelt:bronze_bar'] ?? 0)}/3)`;
      if (t === 9) text += ` (${Math.min(5, this.s.counters.tutKills ?? 0)}/5)`;
      return text;
    }
    const q = this.s.quests[QUEST];
    if (q && !q.done) {
      if (q.stage === 0) return `The Cinder Seal: recover the seal fragments (${Math.min(3, this.g.items.totalCount('seal_fragment'))}/3)`;
      return `The Cinder Seal: ${QUESTS[QUEST].stages[q.stage].text}`;
    }
    return null;
  }

  // ─── Event hooks ─────────────────────────────────────────────────────────

  onEnterZone(id: string) {
    if (id === 'mine') this.advance(2);
    if (id === 'keep') this.advance(4);
    if (id === 'foothills') this.advance(9);
    if (id === 'keep' && this.s.tutorial === 10) this.advance(11);
  }

  onRecall() {
    this.g.prog.bump('recall');
  }

  onKill(e: Enemy) {
    if (this.s.tutorial === 9) {
      this.s.counters.tutKills = (this.s.counters.tutKills ?? 0) + 1;
      if (this.s.counters.tutKills >= 5) this.advance(10);
      this.g.ui.refresh();
    }
    void e;
  }

  onItemGained(baseId: string) {
    const s = this.s;
    if (s.tutorial === 2 && this.g.items.count('copper_ore') >= 3 && this.g.items.count('tin_ore') >= 3) this.advance(3);
    if (s.tutorial === 4 && (s.counters['smelt:bronze_bar'] ?? 0) >= 3) this.advance(5);
    if (s.tutorial === 5 && baseId === 'bronze_sword') this.advance(6);
    const q = s.quests[QUEST];
    if (q && !q.done && q.stage === 0 && baseId === 'seal_fragment' && this.g.items.totalCount('seal_fragment') >= 3) {
      q.stage = 1;
      this.g.announce('You have all three seal fragments. The Warden will want to see them.', 'unique');
      this.g.ui.refresh();
    }
    if (q && !q.done && q.stage === 2 && baseId === 'cinder_key') {
      q.stage = 3;
      this.g.announce('The Cinder Key glows in your hand. Now to find the sealed gate in the Ashen Foothills.', 'unique');
      this.g.ui.refresh();
    }
  }

  onEquip(item: Item) {
    if (this.s.tutorial === 6 && BASES[item.base].style === 'melee') this.advance(7);
  }

  // ─── Portals ─────────────────────────────────────────────────────────────

  portalState(id: string): { open: boolean; reason?: string } {
    const s = this.s;
    const arch = KEEP_ARCHES.find((a) => a.id === id);
    if (arch?.dormant) return { open: false, reason: `This arch is dormant. (${arch.dormant})` };
    switch (id) {
      case 'mine':
        return s.portals.mine ? { open: true } : { open: false, reason: 'The arch is dark. Speak with the Warden first.' };
      case 'foothills':
        return s.portals.foothills ? { open: true } : { open: false, reason: 'The arch is dark. The Warden will open it when you are ready.' };
      case 'ruin': {
        const q = s.quests[QUEST];
        if (!q) return { open: false, reason: 'The arch is dark. Perhaps the Warden knows its purpose.' };
        if (q.done) return { open: false, reason: 'The Sunken Ruin has given up its secrets.' };
        return { open: true };
      }
      case 'lair':
        return s.keep.lair_arch ? { open: true } : { open: false, reason: 'Restore the Lair Arch at the Restoration Board to open a direct path.' };
    }
    return { open: false };
  }

  useStation(st: Interactable) {
    const g = this.g;
    switch (st.kind) {
      case 'portal': {
        const ps = this.portalState(st.id);
        if (!ps.open) {
          g.announce(ps.reason ?? 'The arch is dark.', 'deny');
          g.sfx.play('deny');
          return;
        }
        g.travel(st.id);
        return;
      }
      case 'exit':
        g.travel('keep');
        return;
      case 'bank':
        g.ui.openBank(false);
        return;
      case 'chest':
        if (!this.s.keep.mine_chest) {
          g.announce('An empty alcove. A deposit chest could go here (Restoration Board).', 'info');
          return;
        }
        g.ui.openBank(true);
        return;
      case 'furnace':
      case 'anvil':
        g.ui.openCraft(st.kind, st);
        return;
      case 'shop':
        g.ui.openShop();
        return;
      case 'npc':
        g.ui.openDialogue(this.talk(st.id));
        return;
      case 'restore':
        g.ui.openKeep(st.id === 'board' ? null : st.id);
        return;
      case 'pedestal':
        this.usePedestal(st);
        return;
      case 'gate':
        this.useGate();
        return;
    }
  }

  private usePedestal(st: Interactable) {
    const g = this.g;
    const q = this.s.quests[QUEST];
    const key = `frag${st.id}`;
    if (this.s.counters[key]) {
      g.announce('The pedestal is empty.', 'info');
      return;
    }
    if (!q || q.stage !== 0) {
      g.announce('A cracked pedestal, warm to the touch.', 'info');
      return;
    }
    if (st.id === '2' && g.zone.enemies.some((e) => e.def.id === 'cinder_priest' && !e.dead)) {
      g.announce('The Cinder Priest guards the altar fragment. Defeat him first.', 'deny');
      return;
    }
    if (!g.items.add(makeItem('seal_fragment'))) {
      g.announce("You don't have enough inventory space.", 'deny');
      return;
    }
    this.s.counters[key] = 1;
    st.setState('taken');
    g.sfx.play('drop_rare');
    g.announce('You take the seal fragment.', 'unique');
    this.onItemGained('seal_fragment');
  }

  private useGate() {
    const g = this.g;
    const q = this.s.quests[QUEST];
    if (q?.done) {
      g.travel('lair');
      return;
    }
    if (q && q.stage === 3 && g.items.count('cinder_key') > 0) {
      g.items.remove('cinder_key', 1);
      this.completeQuest();
      g.travel('lair');
      return;
    }
    g.announce('A seal of living fire bars the way. There must be a key somewhere.', 'deny');
    g.sfx.play('deny');
  }

  private completeQuest() {
    const g = this.g;
    const q = this.s.quests[QUEST];
    q.done = true;
    g.prog.grant('smithing', 2500);
    g.prog.grant('mining', 1500);
    this.s.gold += 750;
    g.ui.questComplete(QUESTS[QUEST].name, QUESTS[QUEST].rewards);
    g.ui.refresh();
    g.sfx.play('levelup');
    this.checkDiary();
  }

  // ─── Dialogue ────────────────────────────────────────────────────────────

  talk(npc: string): Dialogue {
    return npc === 'quartermaster' ? this.quartermaster() : this.warden();
  }

  private say(text: string, options: DialogueOption[]): Dialogue {
    return { speaker: 'The Warden', portrait: 'warden', text, options };
  }

  private warden(): Dialogue {
    const g = this.g, s = this.s;
    const name = s.character?.name || 'Dragonbound';
    const bye: DialogueOption = { label: 'Farewell.' };
    if (s.tutorial === 0) {
      return this.say(`You're awake. Good. Welcome to Dragonspire Keep, ${name}: the last hold of the Dragonbound, hidden in the Veil where the brood cannot follow.`, [
        {
          label: 'What happened here?',
          next: () => this.say('The dragons came for us. This keep is all that is left, and it is crumbling. The arches in the Portal Circle are our only road back into the world. Most of them have gone dark.', [
            {
              label: 'How do I help?',
              next: () => this.say('Everything starts with the forge. Take this pickaxe and step through the Emberdeep arch. Bring me copper and tin, and we will make you a blade.', [
                {
                  label: 'I will.',
                  run: () => {
                    g.items.add(makeItem('bronze_pickaxe'));
                    s.portals.mine = true;
                    g.announce('The Warden hands you a bronze pickaxe. The Emberdeep arch flickers to life.', 'unique');
                    this.advance(1);
                    g.zone.refreshStations();
                  },
                },
              ]),
            },
          ]),
        },
      ]);
    }
    if (s.tutorial === 7) {
      return this.say('A fine first blade. You have the makings of a smith. The Ashen Foothills lie beyond the red arch. Goblins, kobolds and worse have gathered where the brood once nested. Take these too; try them all, and find the style that suits you.', [
        {
          label: 'Take the bow and staff.',
          run: () => {
            g.items.add(makeItem('worn_bow'));
            g.items.add(makeItem('apprentice_staff'));
            s.portals.foothills = true;
            g.announce('You receive a Worn Shortbow and an Apprentice Staff. The Ashen Foothills arch blazes red.', 'unique');
            this.advance(8);
            g.zone.refreshStations();
          },
        },
      ]);
    }
    if (s.tutorial === 11) {
      return this.say('You came back. Most do not, the first time. The keep is yours to rebuild: the Restoration Board lists what we need. And when you are strong enough... there is the matter of Cinderwing.', [
        { label: 'Tell me about Cinderwing.', next: () => this.questOffer() },
        { label: 'Later.', run: () => this.finishTutorial(false) },
      ]);
    }
    if (s.tutorial > 0) {
      return this.say(`You know what to do: ${TUTORIAL_STEPS[s.tutorial].toLowerCase()}.`, [bye]);
    }
    const q = s.quests[QUEST];
    if (!q) return this.questOffer();
    if (!q.done && q.stage === 0) return this.say('The three fragments lie in the Sunken Ruin. The cultists guard them jealously, and something worse waits by the altar.', [bye]);
    if (!q.done && q.stage === 1) {
      return this.say('You found them all! Listen: fused with iron and a heart of emberite, these fragments will make a key. Forge it at the anvil; it will take a skilled hand.', [
        {
          label: 'What do I need?',
          run: () => {
            q.stage = 2;
            g.ui.refresh();
          },
          next: () => this.say('Three fragments, two iron bars and one emberite ore; the veins run in the Foothills, where it is dangerous. And you will need Smithing 25 to work it.', [bye]),
        },
      ]);
    }
    if (!q.done && q.stage === 2) return this.say('Three fragments, two iron bars, one emberite ore, and Smithing 25. Forge the key at the anvil.', [bye]);
    if (!q.done && q.stage === 3) return this.say('The gate is at the far north of the Ashen Foothills. Be ready. Cinderwing does not forgive trespass.', [bye]);
    return this.say(this.idleLine(), [
      { label: 'Show me the Restoration Board.', run: () => g.ui.openKeep(null) },
      bye,
    ]);
  }

  private questOffer(): Dialogue {
    const g = this.g, s = this.s;
    const q = QUESTS[QUEST];
    const reqs = q.reqs.map((r) => `${SKILL_INFO[r.skill].name} ${r.level}`).join(' and ');
    return this.say(`Cinderwing: the brood-mother's firstborn. She nests beyond a sealed gate in the Foothills. The seal can be broken, but the pieces were scattered in the Sunken Ruin. Forging a key will need ${reqs}.`, [
      {
        label: 'I will recover the fragments. (Start quest)',
        run: () => {
          s.quests[QUEST] = { stage: 0, done: false };
          if (s.tutorial >= 0) this.finishTutorial(false);
          g.announce('Quest started: The Cinder Seal. The Sunken Ruin arch shimmers awake.', 'unique');
          g.zone.refreshStations();
          g.ui.refresh();
        },
      },
      { label: 'Not yet.', run: () => s.tutorial === 11 && this.finishTutorial(false) },
    ]);
  }

  private idleLine() {
    const lines = [
      'Every bar you smelt is a stone back in these walls.',
      'The brood grows restless. I hear wings in the Veil at night.',
      'Emberite burns hottest where the drakes nest. Mind yourself out there.',
      'They say a patient miner can hear the Emberdeep hum. I have never been that patient.',
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  private quartermaster(): Dialogue {
    return {
      speaker: 'Quartermaster Bram',
      portrait: 'quartermaster',
      text: "Supplies, weapons, a fair price for whatever you drag back through those arches. What'll it be?",
      options: [{ label: 'Let me see your wares.', run: () => this.g.ui.openShop() }, { label: 'Nothing for now.' }],
    };
  }

  // ─── Keep restoration ────────────────────────────────────────────────────

  restorationStatus(r: Restoration): { can: boolean; missing: string[] } {
    const s = this.s, g = this.g;
    const missing: string[] = [];
    if (r.locked) return { can: false, missing: [r.locked] };
    if (s.keep[r.id]) return { can: false, missing: [] };
    for (const req of r.reqs) if (g.levels[req.skill] < req.level) missing.push(`${SKILL_INFO[req.skill].name} ${req.level}`);
    for (const a of r.after ?? []) if (!s.keep[a]) missing.push(RESTORATION_BY_ID[a].name);
    if (r.quest && !s.quests[r.quest]?.done) missing.push(QUESTS[r.quest].name);
    for (const [id, n] of Object.entries(r.cost)) if (g.items.totalCount(id) < n) missing.push(`${n}× ${BASES[id].name}`);
    if (s.gold < r.gold) missing.push(`${r.gold} gold`);
    return { can: missing.length === 0, missing };
  }

  restore(id: string) {
    const g = this.g, s = this.s;
    const r = RESTORATION_BY_ID[id];
    if (!r || !this.restorationStatus(r).can) return;
    for (const [bid, n] of Object.entries(r.cost)) g.items.spendAnywhere(bid, n);
    s.gold -= r.gold;
    s.keep[id] = true;
    if (id === 'lair_arch') s.portals.lair = true;
    g.announce(`Restoration complete: ${r.name}!`, 'unique');
    g.sfx.play('levelup');
    g.shake(0.3, 0.5);
    g.zone.refreshStations();
    this.checkDiary();
    g.dirty = true;
    g.ui.refresh();
  }

  // ─── Achievement diary ───────────────────────────────────────────────────

  taskDone(t: DiaryTask): boolean {
    const s = this.s, c = t.check;
    switch (c.type) {
      case 'count':
        return (s.counters[c.key] ?? 0) >= c.n;
      case 'level':
        return levelForXp(s.skills[c.skill as SkillId] ?? 0) >= c.n;
      case 'anyLevel':
        return SKILLS.some((k) => levelForXp(s.skills[k]) >= c.n);
      case 'quest':
        return !!s.quests[c.id]?.done;
      case 'restore':
        return !!s.keep[c.id];
      case 'bossTime':
        return s.stats.bestBossTime !== null && s.stats.bestBossTime <= c.secs;
    }
  }

  checkDiary() {
    const s = this.s;
    if (!s.character) return;
    for (const t of DIARY_TASKS) {
      if (s.diary[t.id] || !this.taskDone(t)) continue;
      s.diary[t.id] = true;
      this.g.announce(`Achievement Diary task complete: ${t.text}.`, 'level');
      this.g.sfx.play('drop_rare', 0.7);
    }
  }

  tierComplete(tier: DiaryTier) {
    return DIARY_TASKS.filter((t) => t.tier === tier).every((t) => this.s.diary[t.id]);
  }

  claimDiary(tier: DiaryTier, lampSkill?: SkillId) {
    const g = this.g, s = this.s;
    if (s.diaryClaimed[tier] || !this.tierComplete(tier)) return;
    s.diaryClaimed[tier] = true;
    if (tier === 'easy') {
      s.potionMax = Math.min(6, s.potionMax + 1);
      g.prog.grant(lampSkill ?? 'mining', 2000);
    }
    g.prog.recomputeStats();
    g.announce(`${tier[0].toUpperCase() + tier.slice(1)} diary rewards claimed: ${DIARY_REWARDS[tier].text.join(', ')}.`, 'unique');
    g.sfx.play('levelup');
    g.dirty = true;
    g.ui.refresh();
  }

  zoneName(id: string) {
    return ZONES[id]?.name ?? id;
  }
}
