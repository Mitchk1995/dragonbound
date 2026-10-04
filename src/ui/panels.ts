/**
 * Everything that opens in a framed stone panel. This class holds what the panels share (which bank, shop,
 * station, keep focus, journal tab and book view are showing) and routes each panel to its module in panels/:
 *
 * - inventory: the always-visible inventory tab (selection, drag and drop, coins and Sort);
 * - equipment, skills: the paper doll and stats; the skill grid and each skill's milestones;
 * - bank, shop, craft, keep: the windows a station in the world opens;
 * - journal, collection: the side-panel lists and the full-size book window they open into (sideHead: its button);
 * - help: controls and settings.
 */
import type { Interactable } from '../entities/interactable';
import type { Game } from '../game';
import type { SkillId } from '../types';
import { debugPanel } from './debugPanel';
import { bankPanel } from './panels/bank';
import { collectionBody, collectionPanel } from './panels/collection';
import { craftPanel } from './panels/craft';
import { equipmentPanel } from './panels/equipment';
import { helpPanel } from './panels/help';
import { InventoryPanel } from './panels/inventory';
import { journalFull, journalPanel } from './panels/journal';
import { keepPanel } from './panels/keep';
import { shopPanel } from './panels/shop';
import type { BookView } from './panels/sideHead';
import { skillMilestones, skillsPanel } from './panels/skills';
import type { UI } from './ui';

export class Panels {
  bankMode: 'bank' | 'deposit' | null = null;
  shopOpen = false;
  craft: { kind: 'furnace' | 'anvil'; station: Interactable } | null = null;
  keepFocus: string | null = null;
  journalTab: 'quests' | 'diary' = 'quests';
  /** What the full-size book window shows (null while it's closed). */
  bookView: BookView | null = null;
  bankSearch = '';

  private readonly inv = new InventoryPanel(this);

  constructor(readonly ui: UI, readonly g: Game) {}

  inventory() {
    this.inv.render();
  }

  /** The inventory folded or switched away from: forget the selection, end any press and its ghost. */
  clearSelection() {
    this.inv.clearSelection();
  }

  equipment() {
    equipmentPanel(this);
  }

  milestones(skill: SkillId) {
    return skillMilestones(skill);
  }

  skills() {
    skillsPanel(this);
  }

  bank() {
    bankPanel(this);
  }

  shop() {
    shopPanel(this);
  }

  craftMenu() {
    craftPanel(this);
  }

  keep() {
    keepPanel(this);
  }

  journal() {
    journalPanel(this);
  }

  /** The full-size window the journal and collection log open out into. */
  book() {
    const view = this.bookView;
    if (!view) return;
    const el = this.ui.panel('book', view === 'journal' ? 'Journal' : 'Collection Log');
    if (!el) return;
    if (view === 'journal') journalFull(this, el);
    else collectionBody(this, el, true);
  }

  collection() {
    collectionPanel(this);
  }

  help() {
    helpPanel(this);
  }

  debug() {
    debugPanel(this.ui, this.g);
  }
}
