import { canAfford } from '../combat/stats';
import { abilityFor, type AbilityKey } from '../data/abilities';
import { MANA_TUNING } from '../data/tuning';
import type { Enemy } from '../entities/enemy';
import type { Interactable } from '../entities/interactable';
import type { Game } from '../game';
import { SKILL_INFO, levelProgress } from '../progression/skills';
import { paintText } from './paintedText';
import { paintTree, setHtml, setText } from './uiText';
import { xpDropLabel } from './skillGrid';
import type { Dialogue } from '../systems/story';
import type { Item, SkillId, Style } from '../types';
import { abilityArtUrl } from './approvedArt';
import { el, esc, fmt, installArtFit } from './dom';
import { SIDE_TABS, TAB_KEYS, tabArtUrl, consoleKeys, cooldownFrac, escapeAction, isSideTab, pressTab, showTab, type SideState, type SideTab } from './hudLayout';
import { icon } from './icons';
import { installKit } from './kit';
import { Panels } from './panels';
import { Screens } from './screens';
import { BASIC_TILE, skillTileUrl } from './skillTiles';
import { Tooltip } from './tooltip';

/** Floating windows (stations and debug); everything else lives in the side panel's tabs. */
type WindowId = 'bank' | 'shop' | 'craft' | 'keep' | 'book' | 'debug';
type PanelId = WindowId | SideTab;

const STATION_PANELS: WindowId[] = ['bank', 'shop', 'craft', 'keep'];

/** Anything under the cursor matching this is UI: the world ignores hover there. */
const UI_SELECTOR = '.panel, .sidepanel, .console, .dlg, .objective, .slot';

/** How tall the capitals stand (px) in the zone plaque and in the boss's name. */
const PLAQUE_CAP = 16, BOSS_CAP = 18;
/** The kind-of-place ribbon: small painted capitals, spaced out, in a muted gold (see .zkind in style.css). */
const RIBBON_CAP = 10, RIBBON_TRACK = 0.16;

/** What kind of place a zone is, shown beside the zone plaque on arrival. */
const ZONE_KIND: Record<string, string> = { hub: 'Sanctuary', gather: 'Gathering grounds', hunt: 'Hunting grounds', quest: 'Forgotten ruin', lair: "Dragon's lair" };

/** A tiny mouse with its left button lit: the key cap of the basic-attack slot. */
const MOUSE_LMB = `<svg width="11" height="15" viewBox="0 0 11 15"><rect x="0.8" y="0.8" width="9.4" height="13.4" rx="4.7" fill="#1a120a" stroke="#f3d98a" stroke-width="1.3"/><path d="M1.4 6.2V5.5a4.1 4.1 0 0 1 4.1-4.1v4.8Z" fill="#f3d98a"/></svg>`;

export class UI {
  overUI = false;
  readonly tooltip: Tooltip;
  readonly panels: Panels;
  readonly screens: Screens;
  private hud = document.getElementById('hud')!;
  private panelRoot = document.getElementById('panels')!;
  private dialogueRoot = document.getElementById('dialogue')!;
  private open = new Set<WindowId>();
  private side: SideState = { tab: 'inventory', collapsed: false };
  private consoleSig = '';
  private noManaAt = -1e9;
  private xpAcc = new Map<SkillId, { amount: number; t: number }>();
  private bossTarget: Enemy | null = null;
  private hurtAmt = 0;
  private dialogue: Dialogue | null = null;
  private stationAt: { x: number; z: number } | null = null;
  private $ = <T extends HTMLElement = HTMLElement>(sel: string) => this.hud.querySelector(sel) as T;

  constructor(private g: Game) {
    this.tooltip = new Tooltip(g);
    this.panels = new Panels(this, g);
    this.screens = new Screens(g);
  }

  init() {
    installKit();
    installArtFit();
    this.buildHud();
    for (const root of [this.hud, this.panelRoot, this.dialogueRoot]) {
      root.addEventListener('mouseover', (e) => {
        this.overUI = !!(e.target as HTMLElement).closest(UI_SELECTOR);
      });
      root.addEventListener('mouseleave', () => (this.overUI = false));
    }
  }

  // ─── Screens ─────────────────────────────────────────────────────────────

  showTitle() {
    this.hud.classList.add('hidden');
    this.screens.title();
  }

  showCreate() {
    this.screens.create();
  }

  showHud() {
    this.screens.hide();
    this.hud.classList.remove('hidden');
    this.refresh();
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────

  private buildHud() {
    const tabs = SIDE_TABS.map((t) => `<button class="stab" data-tab="${t.id}"><img src="${tabArtUrl(t.id)}" alt="" draggable="false"></button>`).join('');
    this.hud.innerHTML = `
      <div class="vignette"></div>
      <div class="topleft"><div class="zoneline"><div class="zone plaque"><span class="zname"></span><i class="sheen"></i></div><div class="zkind"></div></div><div class="weak"></div></div>
      <div class="objective hidden"><div class="obj-title">Objective</div><div class="obj-text"></div></div>
      <div class="target"><div class="tname"></div><div class="tbar"><div></div></div></div>
      <div class="bossbar"><div class="bname"></div><div class="bbar"><div class="bfill"></div></div></div>
      <div class="hoverlabel"></div>
      <div class="xpdrops"></div>
      <div class="banner"></div>
      <div class="chat"></div>
      <div class="death">Oh dear, you are dead!</div>
      <div class="castbar hidden"><div class="cb-fill"></div><span></span></div>
      <div class="console">
        <div class="orbseat l"><div class="orb hp"><div class="fill"></div><div class="glass"></div><span></span></div></div>
        <div class="cbody">
          <div class="xpline"><div class="fill"></div><span></span></div>
          <div class="crow">
            <div class="belt"></div>
            <div class="cdiv"></div>
            <div class="skillrow"></div>
          </div>
        </div>
        <div class="orbseat r"><div class="orb mana"><div class="fill"></div><div class="glass"></div><span></span></div></div>
      </div>
      <div class="sidepanel"><div class="stitle"></div><div class="stabs">${tabs}</div><div class="pbody sbody"></div></div>
      <div class="fade"></div>`;
    paintTree(this.hud);

    // Potion belt: healing potion (1) and the Veilstone (T).
    const belt = this.$('.belt');
    const pot = el('div', 'bslot potion', `<div class="ic">${icon('potion', 34)}</div><div class="count"></div><div class="key">1</div>`);
    pot.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.g.items.drinkPotion();
    });
    this.tipOn(pot, () => `<div class="tt-name">Healing Potion</div><div>Restores 45% life and ${Math.round(MANA_TUNING.potionFrac * 100)}% mana over 1.5s.</div><div class="tt-dim">Refills 1 charge every 6 kills, and fully in the keep.</div>`);
    const rec = el('div', 'bslot recall', `<div class="ic">${icon('recall', 34)}</div><div class="key">T</div>`);
    rec.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.g.recall();
    });
    this.tipOn(rec, () => `<div class="tt-name">Veilstone</div><div>Channel to return to Dragonspire Keep. Moving or taking damage interrupts it.</div><div class="tt-dim">Leaving a zone resets it: monsters return, loot on the ground is lost.</div>`);
    belt.append(pot, rec);
    paintTree(belt);

    this.tipOn(this.$('.orb.hp'), () => {
      const st = this.g.stats;
      return `<div class="tt-name tint-bad">Life</div><div>${Math.ceil(Math.max(0, this.g.player.hp))} / ${st.maxHp}</div><div class="tt-dim">Regenerates ${st.regen.toFixed(1)}/s, much faster once you're out of combat.</div>`;
    });
    this.tipOn(this.$('.orb.mana'), () => {
      const st = this.g.stats;
      return `<div class="tt-name tint-magic">Mana</div><div>${Math.floor(this.manaNow())} / ${st.maxMana}</div><div class="tt-dim">One pool for every weapon. Skills spend it; it refills ${st.manaRegen.toFixed(1)}/s, faster out of combat. Healing potions restore ${Math.round(MANA_TUNING.potionFrac * 100)}%. Grows with your best combat level.</div>`;
    });
    this.tipOn(this.$('.xpline'), () => {
      const st = this.g.stats, k = st.style, p = levelProgress(this.g.save.skills[k]);
      return `<div class="tt-name">${SKILL_INFO[k].name} ${p.level}</div><div>${fmt(this.g.save.skills[k])} XP${p.level < 99 ? ` · ${fmt(p.remaining)} to level ${p.level + 1}` : ''}</div><div class="tt-dim">Your weapon decides which style you train; Hitpoints and Defence get a share of every fight.</div>`;
    });

    const sp = this.$('.sidepanel');
    sp.addEventListener('mousedown', (e) => e.stopPropagation());
    sp.querySelectorAll<HTMLElement>('.stab').forEach((b) => {
      const def = SIDE_TABS.find((t) => t.id === b.dataset.tab)!;
      b.addEventListener('mousedown', () => this.pressTab(def.id));
      this.tipOn(b, () => `<div class="tt-name">${def.label}</div><div class="tt-dim">Hotkey: ${def.key}</div>`);
    });
    this.$('.console').addEventListener('mousedown', (e) => e.stopPropagation());
    this.applySide();
  }

  private tipOn(node: HTMLElement, html: () => string) {
    node.addEventListener('mouseenter', () => this.tooltip.text(html(), node.getBoundingClientRect()));
    node.addEventListener('mouseleave', () => this.tooltip.hide());
  }

  /** Current mana, clamped (the pool starts "infinite" until stats exist). */
  private manaNow() {
    return Math.max(0, Math.min(this.g.combat.mana, this.g.stats.maxMana));
  }

  /** (Re)build the console's skill slots when the weapon style changes: LMB, then Q W E (and R once used). */
  private buildSkillRow(style: Style) {
    const row = this.$('.skillrow');
    row.innerHTML = '';
    const basic = BASIC_TILE[style];
    const lmb = el('div', 'sk basic', `<img src="${skillTileUrl(basic.id)}" alt="" draggable="false"><div class="key mouse">${MOUSE_LMB}</div>`);
    this.tipOn(lmb, () => {
      const st = this.g.stats;
      return `<div class="tt-name">${basic.name} <span class="tt-dim">(Left mouse)</span></div><div>Click an enemy to attack; hold to keep attacking. Shift-click attacks in place.</div><div class="tt-dim">${Math.round(st.dmgMin)}–${Math.round(st.dmgMax)} damage · ${st.atkSpeed.toFixed(2)} attacks/s · no mana</div>`;
    });
    row.appendChild(lmb);
    for (const k of consoleKeys(style)) {
      const d = el('div', 'sk');
      d.dataset.key = k;
      d.innerHTML = `<img alt="" draggable="false"><img class="art" alt="" draggable="false"><div class="sweep"></div><div class="cdnum"></div><div class="key">${k}</div><div class="cost"></div><div class="lock">${icon('lock', 16)}</div>`;
      d.addEventListener('mouseenter', () => this.abilityTip(k, d));
      d.addEventListener('mouseleave', () => this.tooltip.hide());
      d.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.g.combat.useAbility(k);
      });
      row.appendChild(d);
    }
    paintTree(row);
  }

  /** A cast refused for lack of mana: the orb flashes, and a note appears (at most once a second). */
  noMana() {
    const orb = this.$('.orb.mana');
    orb.classList.remove('flash');
    void orb.offsetWidth;
    orb.classList.add('flash');
    const now = performance.now();
    if (now - this.noManaAt > 1000) this.message('Not enough mana.', 'deny');
    this.noManaAt = now;
  }

  update(dt: number) {
    const g = this.g;
    if (g.mode !== 'play') return;
    const p = g.player, st = g.stats, s = g.save;
    const hpFrac = Math.max(0, p.hp / st.maxHp);
    const hp = this.$('.orb.hp');
    (hp.querySelector('.fill') as HTMLElement).style.height = `${hpFrac * 100}%`;
    setText(hp.querySelector('span')!, `${Math.ceil(Math.max(0, p.hp))} / ${st.maxHp}`);
    hp.classList.toggle('low', hpFrac < 0.3);

    const mana = this.manaNow();
    const mo = this.$('.orb.mana');
    (mo.querySelector('.fill') as HTMLElement).style.height = `${(mana / st.maxMana) * 100}%`;
    setText(mo.querySelector('span')!, `${Math.floor(mana)} / ${st.maxMana}`);

    const style = st.style;
    const prog = levelProgress(s.skills[style]);
    const xl = this.$('.xpline');
    (xl.querySelector('.fill') as HTMLElement).style.width = `${prog.frac * 100}%`;
    xl.style.setProperty('--c', SKILL_INFO[style].color);
    setText(xl.querySelector('span')!, prog.level >= 99 ? `${SKILL_INFO[style].name} 99` : `${SKILL_INFO[style].name} ${prog.level} · ${fmt(prog.remaining)} XP to ${prog.level + 1}`);

    const sig = `${style}|${consoleKeys(style).join('')}`;
    if (sig !== this.consoleSig) {
      this.consoleSig = sig;
      this.buildSkillRow(style);
    }
    this.hud.querySelectorAll<HTMLElement>('.sk[data-key]').forEach((d) => {
      const def = abilityFor(style, d.dataset.key as AbilityKey);
      const img = d.querySelector('img') as HTMLImageElement;
      const art = d.querySelector('img.art') as HTMLImageElement;
      if (!def) {
        d.className = 'sk empty';
        img.removeAttribute('src');
        art.removeAttribute('src');
        return;
      }
      if (img.dataset.id !== def.id) {
        img.dataset.id = def.id;
        img.src = skillTileUrl(def.id);
        const artUrl = abilityArtUrl(def.id);
        if (artUrl) art.src = artUrl;
        else art.removeAttribute('src');
      }
      const locked = st.styleLevel < def.unlock;
      const rem = p.cds[def.id] ?? 0;
      const frac = cooldownFrac(rem, def.cooldown, st.cdr);
      d.className = `sk${locked ? ' locked' : ''}${!locked && !canAfford(mana, def.mana) ? ' nomana' : ''}${frac > 0 ? ' cooling' : ''}`;
      setText(d.querySelector('.cost') as HTMLElement, String(def.mana));
      d.style.setProperty('--cd', frac.toFixed(3));
      setText(d.querySelector('.cdnum') as HTMLElement, rem > 0 ? rem.toFixed(rem < 1 ? 1 : 0) : '');
    });
    const pot = this.$('.bslot.potion');
    pot.classList.toggle('spent', s.potions <= 0);
    setText(pot.querySelector('.count') as HTMLElement, `${s.potions}/${s.potionMax}`);

    paintText(this.$('.zname'), g.zone.def.name, 'gold', PLAQUE_CAP);
    setText(this.$('.weak'), p.weakenedT > 0 ? `Weakened ${Math.ceil(p.weakenedT)}s` : p.warCryT > 0 ? `War Cry ${Math.ceil(p.warCryT)}s` : '');
    // Target plate for regular enemies; elites/boss use the big bar.
    const tgt = g.hovered ?? (p.cmd.kind === 'attack' ? p.cmd.target : null);
    const tEl = this.$('.target');
    if (tgt && !tgt.dead && tgt !== this.bossTarget) {
      tEl.style.display = 'block';
      setText(tEl.querySelector('.tname') as HTMLElement, `${tgt.name}  ·  level ${tgt.def.level}`);
      (tEl.querySelector('.tbar div') as HTMLElement).style.width = `${(100 * tgt.hp) / tgt.maxHp}%`;
    } else tEl.style.display = 'none';
    const bb = this.$('.bossbar');
    if (this.bossTarget && !this.bossTarget.dead) {
      bb.style.display = 'block';
      paintText(bb.querySelector('.bname') as HTMLElement, this.bossTarget.name, 'gold', BOSS_CAP, 0.08);
      (bb.querySelector('.bfill') as HTMLElement).style.width = `${(100 * this.bossTarget.hp) / this.bossTarget.maxHp}%`;
    } else {
      bb.style.display = 'none';
      if (this.bossTarget?.dead) this.bossTarget = null;
    }

    // Hover label for interactables, OSRS-style action text.
    const hl = this.$('.hoverlabel');
    const th = g.hoveredThing;
    if (th && !this.overUI) {
      hl.style.display = 'block';
      setHtml(hl, this.hoverText(th));
      hl.style.transform = `translate(${g.mouse.x + 18}px, ${g.mouse.y + 14}px)`;
    } else hl.style.display = 'none';

    const cb = this.$('.castbar');
    const recalling = g.recallT >= 0;
    const skill = g.skilling.action;
    cb.classList.toggle('hidden', !recalling && !skill);
    if (recalling) {
      const total = g.save.diaryClaimed.medium ? 1.5 : 3;
      (cb.querySelector('.cb-fill') as HTMLElement).style.width = `${(1 - g.recallT / total) * 100}%`;
      setText(cb.querySelector('span')!, 'Recalling…');
    } else if (skill) {
      (cb.querySelector('.cb-fill') as HTMLElement).style.width = '100%';
      setText(cb.querySelector('span')!, skill.kind === 'mine' ? `Mining ${skill.node.name.toLowerCase()}…` : `${skill.recipe.station === 'furnace' ? 'Smelting' : 'Smithing'}: ${skill.left} left`);
    }

    for (const [skill, acc] of this.xpAcc) {
      acc.t -= dt;
      if (acc.t <= 0) {
        this.spawnXpDrop(skill, acc.amount);
        this.xpAcc.delete(skill);
      }
    }
    this.hurtAmt = Math.max(0, this.hurtAmt - dt * 1.5);
    const lowHp = hpFrac < 0.3 ? 0.35 + Math.sin(performance.now() / 180) * 0.15 : 0;
    this.$('.vignette').style.opacity = String(Math.min(1, Math.max(this.hurtAmt, lowHp)));
    this.$('.death').classList.toggle('show', p.dead);

    // Walking away from a station closes its windows.
    if (this.stationAt && Math.hypot(p.x - this.stationAt.x, p.z - this.stationAt.z) > 3.5) {
      this.stationAt = null;
      for (const id of STATION_PANELS) this.toggle(id, false);
      this.closeDialogue();
    }
    document.body.style.cursor = (g.hovered || g.hoveredItem || g.hoveredThing) && !this.overUI ? 'pointer' : '';
  }

  private hoverText(th: Interactable) {
    const g = this.g;
    let extra = '';
    if (th.kind === 'portal') {
      const ps = g.story.portalState(th.id);
      extra = ps.open ? ` <em>${esc(g.story.zoneName(th.id))}</em>` : ` <i>(dark)</i>`;
    } else if (th.kind === 'rock' && th.state === 'depleted') extra = ' <i>(depleted)</i>';
    else if (th.kind === 'exit') extra = ' <em>Dragonspire Keep</em>';
    return `<b>${th.verb}</b> ${esc(th.name)}${extra}`;
  }

  hurtFlash(frac: number) {
    this.hurtAmt = Math.min(1, this.hurtAmt + 0.25 + frac * 2);
  }

  showBoss(e: Enemy | null) {
    this.bossTarget = e;
  }

  /** Reset overlays and interactions belonging to the zone being left. */
  clearZoneState() {
    for (const id of STATION_PANELS) this.toggle(id, false);
    this.closeDialogue();
    this.stationAt = null;
    this.bossTarget = null;
    this.hurtAmt = 0;
    this.xpAcc.clear();
    this.overUI = false;
    this.tooltip.hide();
    this.hud.querySelector('.topleft')?.classList.remove('arrive');
    for (const selector of ['.banner', '.xpdrops', '.hoverlabel']) {
      const node = this.$(selector);
      if (!node) continue; // The initial zone loads before the HUD is built.
      setHtml(node, '');
      node.classList.remove('show');
    }
  }

  // ─── Side panel & windows ────────────────────────────────────────────────

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
    if (this.dialogue && /^[1-9]$/.test(e.key)) {
      const opt = this.dialogue.options[Number(e.key) - 1];
      if (opt) this.choose(opt);
      return true;
    }
    if (e.key === 'F1') return this.toggle('debug'), true;
    if (e.key === 'Escape') {
      const a = escapeAction(!!this.dialogue, this.open.size, this.side);
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
    this.dialogue = d;
    this.markStation();
    this.dialogueRoot.innerHTML = `
      <div class="dlg frame">
        <div class="dlg-portrait">${icon(d.portrait === 'warden' ? 'magic' : 'gold', 56)}</div>
        <div class="dlg-main">
          <div class="dlg-name">${esc(d.speaker)}</div>
          <div class="dlg-text">${esc(d.text)}</div>
          <div class="dlg-opts">${d.options.map((o, i) => `<button class="dopt" data-i="${i}"><em>${i + 1}</em> ${esc(o.label)}</button>`).join('')}</div>
        </div>
      </div>`;
    paintTree(this.dialogueRoot);
    this.dialogueRoot.querySelectorAll<HTMLElement>('.dopt').forEach((b) => b.addEventListener('click', () => this.choose(d.options[Number(b.dataset.i)])));
    this.dialogueRoot.querySelector('.dlg')!.addEventListener('mousedown', (e) => e.stopPropagation());
    this.g.sfx.play('ui');
  }

  private choose(o: Dialogue['options'][number]) {
    this.closeDialogue();
    o.run?.();
    const next = o.next?.();
    if (next) this.openDialogue(next);
  }

  closeDialogue() {
    this.dialogue = null;
    this.dialogueRoot.innerHTML = '';
  }

  // ─── Messages, XP drops, banners ─────────────────────────────────────────

  xpDrop(skill: SkillId, amount: number) {
    // Gather a moment's XP per skill (a swing that hits a pack, its Hitpoints and Defence shares)
    // into one drop each, so a fight doesn't throw up a cloud of tiny numbers.
    const acc = this.xpAcc.get(skill) ?? { amount: 0, t: 0.2 };
    acc.amount += amount;
    this.xpAcc.set(skill, acc);
  }

  private spawnXpDrop(skill: SkillId, amount: number) {
    const d = el('div', 'xpdrop', `${icon(SKILL_INFO[skill].icon, 22)}<span>+${xpDropLabel(amount)}</span>`);
    this.$('.xpdrops').appendChild(d);
    paintTree(d);
    setTimeout(() => d.remove(), 1600);
  }

  levelBanner(skill: SkillId, level: number) {
    const next = this.panels.milestones(skill).find((m) => m.level > level);
    this.showBanner(`<div class="lvl" style="--c:${SKILL_INFO[skill].color}">${icon(SKILL_INFO[skill].icon, 72)}<div class="big">${level}</div><div>${SKILL_INFO[skill].name} level up!</div>${next ? `<div class="next">Next: ${esc(next.text)} at ${next.level}</div>` : ''}</div>`);
  }

  private showBanner(html: string) {
    const b = this.$('.banner');
    b.innerHTML = html;
    paintTree(b);
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  message(text: string, kind: string) {
    const chat = this.$('.chat');
    if (!chat) return;
    const m = el('div', `msg ${kind}`);
    m.textContent = text;
    chat.appendChild(m);
    paintTree(m);
    while (chat.children.length > 8) chat.firstElementChild!.remove();
    setTimeout(() => m.classList.add('old'), 10000);
    if (kind === 'unique' || kind === 'boss') this.showBanner(`<div class="announce ${kind}">${esc(text)}</div>`);
  }

  questComplete(name: string, rewards: string[]) {
    this.showBanner(`<div class="questdone frame"><div class="qd-title">Quest complete!</div><div class="qd-name">${esc(name)}</div><ul>${rewards.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`);
  }

  /**
   * Arrival: the zone plaque itself flares and a ribbon names the kind of place beside it. It lives in
   * the HUD's top-left corner, so it never lands on the world's own labels (portal titles, loot, bars).
   */
  zoneTitle(name: string) {
    const tl = this.$('.topleft');
    if (!tl) return;
    paintText(this.$('.zname'), name, 'gold', PLAQUE_CAP);
    const def = this.g.zone.def;
    const kind = def.name === name ? (ZONE_KIND[def.kind] ?? '') : '';
    const ribbon = this.$('.zkind');
    if (kind) paintText(ribbon, kind.toUpperCase(), 'gold', RIBBON_CAP, RIBBON_TRACK);
    else {
      ribbon.replaceChildren();
      delete ribbon.dataset.painted;
    }
    tl.classList.remove('arrive');
    void tl.offsetWidth;
    tl.classList.add('arrive');
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

  private abilityTip(key: AbilityKey, d: HTMLElement) {
    const def = abilityFor(this.g.stats.style, key);
    if (!def) {
      this.tooltip.text('<div class="tt-name">Empty</div><div class="tt-dim">More abilities arrive in later chapters.</div>', d.getBoundingClientRect());
      return;
    }
    const locked = this.g.stats.styleLevel < def.unlock;
    const short = !locked && !canAfford(this.manaNow(), def.mana);
    this.tooltip.text(`<div class="tt-name">${esc(def.name)} <span class="tt-dim">(${key})</span></div><div>${esc(def.desc)}</div><div class="tt-mana${short ? ' tt-bad' : ''}">${def.mana} mana</div><div class="tt-dim">Cooldown ${def.cooldown}s${def.mult ? ` · ${Math.round(def.mult * 100)}% damage` : ''}</div>${locked ? `<div class="tt-bad">Unlocks at ${SKILL_INFO[def.style].name} ${def.unlock}</div>` : ''}${this.g.zone.def.kind === 'hub' ? '<div class="tt-dim">Skills rest inside the keep.</div>' : ''}`, d.getBoundingClientRect());
  }

  /** Tooltip for loot labels in the world. */
  showItemTooltip(item: Item, rect: DOMRect, compare: boolean) {
    this.tooltip.item(item, rect, compare);
  }

  hideTooltip() {
    this.tooltip.hide();
  }
}
