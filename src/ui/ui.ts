import { abilityFor, type AbilityKey } from '../data/abilities';
import type { Enemy } from '../entities/enemy';
import type { Interactable } from '../entities/interactable';
import type { Game } from '../game';
import { SKILL_INFO, levelProgress } from '../progression/skills';
import type { Dialogue } from '../systems/story';
import type { Item, SkillId } from '../types';
import { el, esc, fmt } from './dom';
import { icon } from './icons';
import { installKit } from './kit';
import { Panels } from './panels';
import { Screens } from './screens';
import { Tooltip } from './tooltip';

type PanelId = 'inventory' | 'skills' | 'bank' | 'shop' | 'craft' | 'keep' | 'journal' | 'collection' | 'help' | 'debug';

const STATION_PANELS: PanelId[] = ['bank', 'shop', 'craft', 'keep'];

export class UI {
  overUI = false;
  readonly tooltip: Tooltip;
  readonly panels: Panels;
  readonly screens: Screens;
  private hud = document.getElementById('hud')!;
  private panelRoot = document.getElementById('panels')!;
  private dialogueRoot = document.getElementById('dialogue')!;
  private open = new Set<PanelId>();
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
    this.buildHud();
    for (const root of [this.hud, this.panelRoot, this.dialogueRoot]) {
      root.addEventListener('mouseover', (e) => {
        this.overUI = !!(e.target as HTMLElement).closest('.panel, .bar, .topbtns, .slot, .dlg, .objective, .stancebar');
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
    const btn = (id: string, ic: string, key: string, title: string) => `<button data-p="${id}" title="${title} (${key})">${icon(ic, 30)}<span>${key}</span></button>`;
    this.hud.innerHTML = `
      <div class="vignette"></div>
      <div class="topleft"><div class="zone plaque"></div><div class="goldline"></div><div class="weak"></div></div>
      <div class="objective hidden"><div class="obj-title">Objective</div><div class="obj-text"></div></div>
      <div class="topbtns">
        ${btn('inventory', 'bag', 'I', 'Inventory')}${btn('skills', 'skills', 'K', 'Skills')}${btn('journal', 'quest', 'J', 'Journal')}${btn('collection', 'collection', 'L', 'Collection log')}${btn('help', 'settings', 'Esc', 'Controls & settings')}
      </div>
      <div class="target"><div class="tname"></div><div class="tbar"><div></div></div></div>
      <div class="bossbar"><div class="bname"></div><div class="bbar"><div class="bfill"></div></div></div>
      <div class="hoverlabel"></div>
      <div class="xpdrops"></div>
      <div class="banner"></div>
      <div class="chat"></div>
      <div class="death">Oh dear, you are dead!</div>
      <div class="castbar hidden"><div class="cb-fill"></div><span></span></div>
      <div class="bar">
        <div class="orb hp"><div class="fill"></div><div class="glass"></div><span></span></div>
        <div class="barmid">
          <div class="slots"></div>
          <div class="xpline"><div class="fill"></div><span></span></div>
        </div>
        <div class="orb style"><div class="fill"></div><div class="glass"></div><span></span></div>
      </div>
      <div class="fade"></div>
      <div class="zonetitle"></div>`;
    const slots = this.$('.slots');
    for (const k of ['Q', 'W', 'E', 'R'] as AbilityKey[]) {
      const d = el('div', 'aslot');
      d.dataset.key = k;
      d.innerHTML = `<div class="ic"></div><div class="cd"></div><div class="key">${k}</div><div class="lock">${icon('lock', 16)}</div>`;
      d.addEventListener('mouseenter', () => this.abilityTip(k, d));
      d.addEventListener('mouseleave', () => this.tooltip.hide());
      d.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.g.combat.useAbility(k);
      });
      slots.appendChild(d);
    }
    const pot = el('div', 'aslot potion', `<div class="ic">${icon('potion', 40)}</div><div class="count"></div><div class="key">1</div>`);
    pot.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.g.items.drinkPotion();
    });
    pot.addEventListener('mouseenter', () => this.tooltip.text(`<div class="tt-name">Healing Potion</div><div>Restores 45% life over 1.5s.</div><div class="tt-dim">Refills 1 charge every 6 kills, and fully in the keep.</div>`, pot.getBoundingClientRect()));
    pot.addEventListener('mouseleave', () => this.tooltip.hide());
    slots.appendChild(pot);
    const rec = el('div', 'aslot recall', `<div class="ic">${icon('recall', 40)}</div><div class="key">T</div>`);
    rec.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.g.recall();
    });
    rec.addEventListener('mouseenter', () => this.tooltip.text(`<div class="tt-name">Veilstone</div><div>Channel to return to Dragonspire Keep. Moving or taking damage interrupts it.</div><div class="tt-dim">Leaving a zone resets it: monsters return, loot on the ground is lost.</div>`, rec.getBoundingClientRect()));
    rec.addEventListener('mouseleave', () => this.tooltip.hide());
    slots.appendChild(rec);

    this.hud.querySelectorAll<HTMLButtonElement>('.topbtns button').forEach((b) =>
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.toggle(b.dataset.p as PanelId);
      }),
    );
  }

  update(dt: number) {
    const g = this.g;
    if (g.mode !== 'play') return;
    const p = g.player, st = g.stats, s = g.save;
    const hpFrac = Math.max(0, p.hp / st.maxHp);
    const hp = this.$('.orb.hp');
    (hp.querySelector('.fill') as HTMLElement).style.height = `${hpFrac * 100}%`;
    hp.querySelector('span')!.textContent = `${Math.ceil(Math.max(0, p.hp))} / ${st.maxHp}`;
    hp.classList.toggle('low', hpFrac < 0.3);

    const style = st.style;
    const prog = levelProgress(s.skills[style]);
    const so = this.$('.orb.style');
    (so.querySelector('.fill') as HTMLElement).style.height = `${prog.frac * 100}%`;
    so.style.setProperty('--c', SKILL_INFO[style].color);
    const soText = so.querySelector('span')!;
    const want = `${style}|${g.levels[style]}`;
    if (soText.dataset.k !== want) {
      soText.dataset.k = want;
      soText.innerHTML = `${icon(SKILL_INFO[style].icon, 30)}<b>${g.levels[style]}</b>`;
    }
    const xl = this.$('.xpline');
    (xl.querySelector('.fill') as HTMLElement).style.width = `${prog.frac * 100}%`;
    xl.querySelector('span')!.textContent = prog.level >= 99 ? `${SKILL_INFO[style].name} 99` : `${SKILL_INFO[style].name} ${prog.level} · ${fmt(prog.remaining)} XP to ${prog.level + 1}`;

    this.hud.querySelectorAll<HTMLElement>('.aslot[data-key]').forEach((d) => {
      const def = abilityFor(style, d.dataset.key as AbilityKey);
      const ic = d.querySelector('.ic') as HTMLElement;
      const cd = d.querySelector('.cd') as HTMLElement;
      if (!def) {
        d.className = 'aslot empty';
        ic.innerHTML = '';
        cd.style.height = '0';
        return;
      }
      d.className = `aslot ${st.styleLevel < def.unlock ? 'locked' : ''}`;
      if (ic.dataset.id !== def.id) {
        ic.dataset.id = def.id;
        ic.innerHTML = icon(def.id, 44);
      }
      const rem = p.cds[def.id] ?? 0;
      cd.style.height = `${(rem / (def.cooldown * (1 - st.cdr))) * 100}%`;
      cd.textContent = rem > 0 ? rem.toFixed(rem < 1 ? 1 : 0) : '';
    });
    const pot = this.hud.querySelector('.aslot.potion') as HTMLElement;
    pot.querySelector('.count')!.textContent = `${s.potions}/${s.potionMax}`;
    pot.classList.toggle('locked', s.potions <= 0);

    this.$('.zone').textContent = g.zone.def.name;
    this.$('.goldline').innerHTML = `${icon('gold', 18)} ${fmt(s.gold)}`;
    this.$('.weak').textContent = p.weakenedT > 0 ? `Weakened ${Math.ceil(p.weakenedT)}s` : p.warCryT > 0 ? `War Cry ${Math.ceil(p.warCryT)}s` : '';

    // Target plate for regular enemies; elites/boss use the big bar.
    const tgt = g.hovered ?? (p.cmd.kind === 'attack' ? p.cmd.target : null);
    const tEl = this.$('.target');
    if (tgt && !tgt.dead && tgt !== this.bossTarget) {
      tEl.style.display = 'block';
      tEl.querySelector('.tname')!.textContent = `${tgt.name}  ·  level ${tgt.def.level}`;
      (tEl.querySelector('.tbar div') as HTMLElement).style.width = `${(100 * tgt.hp) / tgt.maxHp}%`;
    } else tEl.style.display = 'none';
    const bb = this.$('.bossbar');
    if (this.bossTarget && !this.bossTarget.dead) {
      bb.style.display = 'block';
      bb.querySelector('.bname')!.textContent = this.bossTarget.name;
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
      hl.innerHTML = this.hoverText(th);
      hl.style.transform = `translate(${g.mouse.x + 18}px, ${g.mouse.y + 14}px)`;
    } else hl.style.display = 'none';

    const cb = this.$('.castbar');
    const recalling = g.recallT >= 0;
    const skill = g.skilling.action;
    cb.classList.toggle('hidden', !recalling && !skill);
    if (recalling) {
      const total = g.save.diaryClaimed.medium ? 1.5 : 3;
      (cb.querySelector('.cb-fill') as HTMLElement).style.width = `${(1 - g.recallT / total) * 100}%`;
      cb.querySelector('span')!.textContent = 'Recalling…';
    } else if (skill) {
      (cb.querySelector('.cb-fill') as HTMLElement).style.width = '100%';
      cb.querySelector('span')!.textContent = skill.kind === 'mine' ? `Mining ${skill.node.name.toLowerCase()}…` : `${skill.recipe.station === 'furnace' ? 'Smelting' : 'Smithing'}: ${skill.left} left`;
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

  refresh() {
    if (this.g.mode !== 'play') return;
    for (const id of this.open) this.render(id);
    const obj = this.g.story.objective();
    const o = this.$('.objective');
    o.classList.toggle('hidden', !obj);
    if (obj) o.querySelector('.obj-text')!.textContent = obj;
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
    for (const selector of ['.chat', '.banner', '.zonetitle', '.xpdrops', '.hoverlabel']) {
      const node = this.$(selector);
      if (!node) continue; // The initial zone loads before the HUD is built.
      node.innerHTML = '';
      node.classList.remove('show');
    }
  }

  // ─── Panels ──────────────────────────────────────────────────────────────

  /** Get (creating if needed) the element for an open panel; null if it's closed. */
  panel(id: PanelId, title: string): HTMLElement | null {
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
    p.querySelector('.ptitle span')!.textContent = title;
    return p;
  }

  body(p: HTMLElement, html: string) {
    const b = p.querySelector('.pbody')!;
    const scroll = b.scrollTop;
    b.innerHTML = html;
    b.scrollTop = scroll;
  }

  private render(id: PanelId) {
    const P = this.panels;
    ({ inventory: () => P.inventory(), skills: () => P.skills(), bank: () => P.bank(), shop: () => P.shop(), craft: () => P.craftMenu(), keep: () => P.keep(), journal: () => P.journal(), collection: () => P.collection(), help: () => P.help(), debug: () => P.debug() })[id]();
  }

  toggle(id: PanelId, force?: boolean) {
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
      if ((id === 'bank' || id === 'shop') && this.open.has('inventory')) this.render('inventory');
      return;
    }
    this.g.sfx.play('ui');
    this.open.add(id);
    this.render(id);
  }

  private markStation() {
    this.stationAt = { x: this.g.player.x, z: this.g.player.z };
  }

  openBank(depositOnly: boolean) {
    this.panels.bankMode = depositOnly ? 'deposit' : 'bank';
    this.markStation();
    this.toggle('bank', true);
    this.toggle('inventory', true);
    this.render('inventory');
  }

  openShop() {
    this.closeDialogue();
    this.panels.shopOpen = true;
    this.markStation();
    this.toggle('shop', true);
    this.toggle('inventory', true);
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
      if (this.dialogue) return this.closeDialogue(), true;
      if (this.open.size) {
        for (const p of [...this.open]) this.toggle(p, false);
        return true;
      }
      this.toggle('help', true);
      return true;
    }
    const map: Record<string, PanelId> = { i: 'inventory', b: 'inventory', k: 'skills', j: 'journal', l: 'collection', h: 'help' };
    if (map[k]) return this.toggle(map[k]), true;
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
    const acc = this.xpAcc.get(skill) ?? { amount: 0, t: 0.08 };
    acc.amount += amount;
    this.xpAcc.set(skill, acc);
  }

  private spawnXpDrop(skill: SkillId, amount: number) {
    const d = el('div', 'xpdrop', `${icon(SKILL_INFO[skill].icon, 22)}<span>+${fmt(Math.max(1, amount))}</span>`);
    this.$('.xpdrops').appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }

  levelBanner(skill: SkillId, level: number) {
    const next = this.panels.milestones(skill).find((m) => m.level > level);
    this.showBanner(`<div class="lvl" style="--c:${SKILL_INFO[skill].color}">${icon(SKILL_INFO[skill].icon, 72)}<div class="big">${level}</div><div>${SKILL_INFO[skill].name} level up!</div>${next ? `<div class="next">Next: ${esc(next.text)} at ${next.level}</div>` : ''}</div>`);
  }

  private showBanner(html: string) {
    const b = this.$('.banner');
    b.innerHTML = html;
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
    while (chat.children.length > 8) chat.firstElementChild!.remove();
    setTimeout(() => m.classList.add('old'), 10000);
    if (kind === 'unique' || kind === 'boss') this.showBanner(`<div class="announce ${kind}">${esc(text)}</div>`);
  }

  questComplete(name: string, rewards: string[]) {
    this.showBanner(`<div class="questdone frame"><div class="qd-title">Quest complete!</div><div class="qd-name">${esc(name)}</div><ul>${rewards.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`);
  }

  zoneTitle(name: string) {
    const z = this.$('.zonetitle');
    z.innerHTML = `<span>${esc(name)}</span>`;
    z.classList.remove('show');
    void z.offsetWidth;
    z.classList.add('show');
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
    this.tooltip.text(`<div class="tt-name">${esc(def.name)} <span class="tt-dim">(${key})</span></div><div>${esc(def.desc)}</div><div class="tt-dim">Cooldown ${def.cooldown}s${def.mult ? ` · ${Math.round(def.mult * 100)}% damage` : ''}</div>${locked ? `<div class="tt-bad">Unlocks at ${SKILL_INFO[def.style].name} ${def.unlock}</div>` : ''}`, d.getBoundingClientRect());
  }

  /** Tooltip for loot labels in the world. */
  showItemTooltip(item: Item, rect: DOMRect, compare: boolean) {
    this.tooltip.item(item, rect, compare);
  }

  hideTooltip() {
    this.tooltip.hide();
  }
}
