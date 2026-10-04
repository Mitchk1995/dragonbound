import type { AbilityKey } from '../data/abilities';
import type { Enemy } from '../entities/enemy';
import type { Interactable } from '../entities/interactable';
import type { Game } from '../game';
import type { Dialogue } from '../systems/story';
import type { Item, SkillId } from '../types';
import { DialogueBox } from './dialogueBox';
import { el, installArtFit } from './dom';
import { Hud } from './hud';
import { HudFeed } from './hudFeed';
import { SIDE_TABS, TAB_KEYS, escapeAction, isSideTab, pressTab, showTab, type SideState, type SideTab } from './hudLayout';
import { icon } from './icons';
import { installKit } from './kit';
import { Panels } from './panels';
import { Screens } from './screens';
import { Tooltip } from './tooltip';
import { paintTree, setText } from './uiText';

/** Floating windows (stations and debug); everything else lives in the side panel's tabs. */
type WindowId = 'bank' | 'shop' | 'craft' | 'keep' | 'book' | 'debug';
type PanelId = WindowId | SideTab;

const STATION_PANELS: WindowId[] = ['bank', 'shop', 'craft', 'keep'];

/** Anything under the cursor matching this is UI: the world ignores hover there. */
const UI_SELECTOR = '.panel, .sidepanel, .console, .dlg, .objective, .slot';

/**
 * The game's whole interface: the title screens, the HUD, the side panel and its tabs, the floating
 * station windows and the dialogue box. The HUD's drawing, its news feed and the dialogue box each
 * live in their own module; this class owns which panels are open and routes keys to them.
 */
export class UI {
  overUI = false;
  readonly tooltip: Tooltip;
  readonly panels: Panels;
  readonly screens: Screens;
  private hudRoot = document.getElementById('hud')!;
  private panelRoot = document.getElementById('panels')!;
  private dialogueRoot = document.getElementById('dialogue')!;
  private hud: Hud;
  private feed: HudFeed;
  private dialogue: DialogueBox;
  private open = new Set<WindowId>();
  private side: SideState = { tab: 'inventory', collapsed: false };
  private stationAt: { x: number; z: number } | null = null;
  private $ = <T extends HTMLElement = HTMLElement>(sel: string) => this.hudRoot.querySelector(sel) as T;

  constructor(private g: Game) {
    this.tooltip = new Tooltip(g);
    this.panels = new Panels(this, g);
    this.screens = new Screens(g);
    this.feed = new HudFeed(this.hudRoot, this.panels);
    this.hud = new Hud(g, this.tooltip, this.hudRoot, this.feed);
    this.dialogue = new DialogueBox(g, this.dialogueRoot, () => this.markStation());
  }

  init() {
    installKit();
    installArtFit();
    this.hud.build();
    this.buildSideTabs();
    for (const root of [this.hudRoot, this.panelRoot, this.dialogueRoot]) {
      root.addEventListener('mouseover', (e) => {
        this.overUI = !!(e.target as HTMLElement).closest(UI_SELECTOR);
      });
      root.addEventListener('mouseleave', () => (this.overUI = false));
    }
  }

  // ─── Screens ─────────────────────────────────────────────────────────────

  showTitle() {
    this.hudRoot.classList.add('hidden');
    this.screens.title();
  }

  showCreate() {
    this.screens.create();
  }

  showHud() {
    this.screens.hide();
    this.hudRoot.classList.remove('hidden');
    this.refresh();
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────

  /** A cast refused for lack of mana: the orb flashes, and a note appears (at most once a second). */
  noMana() {
    this.hud.noMana();
  }

  update(dt: number) {
    const g = this.g;
    if (g.mode !== 'play') return;
    this.hud.update(dt, this.overUI);
    this.feed.update(dt);

    // Walking away from a station closes its windows.
    const p = g.player;
    if (this.stationAt && Math.hypot(p.x - this.stationAt.x, p.z - this.stationAt.z) > 3.5) {
      this.stationAt = null;
      for (const id of STATION_PANELS) this.toggle(id, false);
      this.closeDialogue();
    }
    document.body.style.cursor = (g.hovered || g.hoveredItem || g.hoveredThing) && !this.overUI ? 'pointer' : '';
  }

  /** The tooltip of the ability in console slot `key` (the inspector's skill-tooltip capture opens it). */
  abilityTip(key: AbilityKey, d: HTMLElement) {
    this.hud.abilityTip(key, d);
  }

  hurtFlash(frac: number) {
    this.hud.hurtFlash(frac);
  }

  showBoss(e: Enemy | null) {
    this.hud.showBoss(e);
  }

  /** Reset overlays and interactions belonging to the zone being left. */
  clearZoneState() {
    for (const id of STATION_PANELS) this.toggle(id, false);
    this.closeDialogue();
    this.stationAt = null;
    this.overUI = false;
    this.tooltip.hide();
    this.hud.clear();
    this.feed.clear();
  }

  // ─── Side panel & windows ────────────────────────────────────────────────

  /** Wire the side panel's tab buttons (the HUD lays them out), then draw the open tab. */
  private buildSideTabs() {
    const sp = this.$('.sidepanel');
    sp.addEventListener('mousedown', (e) => e.stopPropagation());
    sp.querySelectorAll<HTMLElement>('.stab').forEach((b) => {
      const def = SIDE_TABS.find((t) => t.id === b.dataset.tab)!;
      b.addEventListener('mousedown', () => this.pressTab(def.id));
      this.hud.tipOn(b, () => `<div class="tt-name">${def.label}</div><div class="tt-dim">Hotkey: ${def.key}</div>`);
    });
    this.applySide();
  }

  /** The side panel's open tab (OSRS-style: always visible, inventory by default). */
  get sideTab(): SideTab {
    return this.side.tab;
  }

  /**
   * Get the element a panel renders into, or null if it isn't showing: a side-panel tab renders into
   * the side panel while it's the open tab; a window is created on first use.
   */
  panel(id: PanelId, title: string): HTMLElement | null {
    if (isSideTab(id)) return this.side.tab === id && !this.side.collapsed ? this.$('.sidepanel') : null;
    if (!this.open.has(id)) return null;
    let p = this.panelRoot.querySelector<HTMLElement>(`#panel-${id}`);
    if (!p) {
      p = el('div', `panel frame p-${id}`);
      p.id = `panel-${id}`;
      p.innerHTML = `<div class="ptitle"><span></span><button class="x">${icon('close', 20)}</button></div><div class="pbody"></div>`;
      p.querySelector('.x')!.addEventListener('click', () => this.toggle(id, false));
      p.addEventListener('mousedown', (e) => e.stopPropagation());
      this.panelRoot.appendChild(p);
    }
    setText(p.querySelector('.ptitle span')!, title);
    return p;
  }

  body(p: HTMLElement, html: string) {
    const b = p.querySelector('.pbody')!;
    // Keep the scroll position across refreshes, but start a newly opened tab at the top.
    const view = p.classList.contains('sidepanel') ? this.side.tab : 'window';
    const scroll = p.dataset.view === view ? b.scrollTop : 0;
    b.innerHTML = html;
    paintTree(b);
    b.scrollTop = scroll;
    p.dataset.view = view;
  }

  private render(id: PanelId) {
    const P = this.panels;
    ({
      inventory: () => P.inventory(), equipment: () => P.equipment(), skills: () => P.skills(), journal: () => P.journal(),
      collection: () => P.collection(), help: () => P.help(), bank: () => P.bank(), shop: () => P.shop(),
      craft: () => P.craftMenu(), keep: () => P.keep(), book: () => P.book(), debug: () => P.debug(),
    })[id]();
  }

  /** Sync the side panel's title, tab row and folded state, then draw the open tab. */
  private applySide() {
    const sp = this.$('.sidepanel');
    if (!sp) return;
    sp.classList.toggle('collapsed', this.side.collapsed);
    setText(sp.querySelector('.stitle')!, SIDE_TABS.find((t) => t.id === this.side.tab)!.label);
    sp.querySelectorAll<HTMLElement>('.stab').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.side.tab));
    if (this.side.collapsed || this.side.tab !== 'inventory') this.panels.clearSelection();
    this.tooltip.hide();
    if (!this.side.collapsed && this.g.mode === 'play') this.render(this.side.tab);
  }

  private setSide(next: SideState) {
    const changed = next.tab !== this.side.tab || next.collapsed !== this.side.collapsed;
    this.side = next;
    if (changed) this.g.sfx.play('ui');
    this.applySide();
  }

  /** A tab clicked or its hotkey pressed: switch to it, or fold the panel if it's already open. */
  pressTab(tab: SideTab) {
    this.setSide(pressTab(this.side, tab));
  }

  /** Make sure a tab is showing (a bank or shop needs the inventory beside it). */
  showTab(tab: SideTab) {
    this.setSide(showTab(this.side, tab));
  }

  /** Open or close a window. Side-panel tabs are always "open": forcing one just shows it. */
  toggle(id: PanelId, force?: boolean) {
    if (isSideTab(id)) {
      if (force !== false) this.showTab(id);
      return;
    }
    const want = force ?? !this.open.has(id);
    if (!want) {
      if (!this.open.has(id)) return;
      this.open.delete(id);
      this.panelRoot.querySelector(`#panel-${id}`)?.remove();
      this.tooltip.hide();
      this.overUI = false;
      if (id === 'bank') this.panels.bankMode = null;
      if (id === 'shop') this.panels.shopOpen = false;
      if (id === 'craft') this.panels.craft = null;
      if (id === 'book') {
        this.panels.bookView = null;
        this.applySide();
      }
      if ((id === 'bank' || id === 'shop') && this.side.tab === 'inventory') this.applySide();
      return;
    }
    this.g.sfx.play('ui');
    this.open.add(id);
    this.render(id);
  }

  refresh() {
    if (this.g.mode !== 'play') return;
    if (!this.side.collapsed) this.render(this.side.tab);
    for (const id of this.open) this.render(id);
    const obj = this.g.story.objective();
    const o = this.$('.objective');
    o.classList.toggle('hidden', !obj);
    if (obj) setText(o.querySelector('.obj-text')!, obj);
  }

  private markStation() {
    this.stationAt = { x: this.g.player.x, z: this.g.player.z };
  }

  openBank(depositOnly: boolean) {
    this.panels.bankMode = depositOnly ? 'deposit' : 'bank';
    this.markStation();
    this.toggle('bank', true);
    this.showTab('inventory');
    this.render('inventory');
  }

  openShop() {
    this.closeDialogue();
    this.panels.shopOpen = true;
    this.markStation();
    this.toggle('shop', true);
    this.showTab('inventory');
    this.render('inventory');
  }

  openCraft(kind: 'furnace' | 'anvil', station: Interactable) {
    this.panels.craft = { kind, station };
    this.markStation();
    this.open.delete('craft');
    this.panelRoot.querySelector('#panel-craft')?.remove();
    this.toggle('craft', true);
  }

  closeCraftMenu() {
    this.toggle('craft', false);
  }

  /**
   * The journal or collection log opened out into a full window (OSRS-style), beside the side panel's
   * compact list. Opening the view that's already showing closes it.
   */
  openBook(view: 'journal' | 'collection') {
    if (this.open.has('book') && this.panels.bookView === view) return this.toggle('book', false);
    this.panels.bookView = view;
    this.open.delete('book');
    this.panelRoot.querySelector('#panel-book')?.remove();
    this.toggle('book', true);
    this.applySide();
  }

  openKeep(focus: string | null) {
    this.closeDialogue();
    this.panels.keepFocus = focus;
    this.markStation();
    this.open.delete('keep');
    this.panelRoot.querySelector('#panel-keep')?.remove();
    this.toggle('keep', true);
  }

  handleKey(e: KeyboardEvent): boolean {
    const g = this.g;
    if (g.mode !== 'play') return false;
    const k = e.key.toLowerCase();
    if (/^[1-9]$/.test(e.key) && this.dialogue.pickNumber(Number(e.key))) return true;
    if (e.key === 'F1') return this.toggle('debug'), true;
    if (e.key === 'Escape') {
      const a = escapeAction(this.dialogue.isOpen, this.open.size, this.side);
      if (a === 'dialogue') this.closeDialogue();
      else if (a === 'windows') for (const p of [...this.open]) this.toggle(p, false);
      else this.setSide(a);
      return true;
    }
    const tab = TAB_KEYS[k];
    if (tab) return this.pressTab(tab), true;
    return false;
  }

  // ─── Dialogue ────────────────────────────────────────────────────────────

  openDialogue(d: Dialogue) {
    this.dialogue.open(d);
  }

  closeDialogue() {
    this.dialogue.close();
  }

  // ─── Messages, XP drops, banners ─────────────────────────────────────────

  xpDrop(skill: SkillId, amount: number) {
    this.feed.xpDrop(skill, amount);
  }

  levelBanner(skill: SkillId, level: number) {
    this.feed.levelBanner(skill, level);
  }

  message(text: string, kind: string) {
    this.feed.message(text, kind);
  }

  questComplete(name: string, rewards: string[]) {
    this.feed.questComplete(name, rewards);
  }

  /** Arrival: the zone plaque flares and a ribbon names the kind of place beside it. */
  zoneTitle(name: string) {
    this.hud.zoneTitle(name);
  }

  /** Fade to black, run `mid`, fade back in. */
  fade(mid: () => void) {
    const f = this.$('.fade');
    f.classList.add('on');
    for (const id of STATION_PANELS) this.toggle(id, false);
    this.closeDialogue();
    setTimeout(() => {
      mid();
      setTimeout(() => f.classList.remove('on'), 60);
    }, 380);
  }

  /** Tooltip for loot labels in the world. */
  showItemTooltip(item: Item, rect: DOMRect, compare: boolean) {
    this.tooltip.item(item, rect, compare);
  }

  hideTooltip() {
    this.tooltip.hide();
  }
}
