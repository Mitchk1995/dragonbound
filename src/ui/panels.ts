import { ABILITIES } from '../data/abilities';
import { DIARY_REWARDS, DIARY_TASKS, type DiaryTier } from '../data/diary';
import { BASES, BASE_LIST, PETS, UNIQUES, TIERS, TIER_ORDER } from '../data/items';
import { RESTORATIONS } from '../data/keep';
import { QUESTS } from '../data/quests';
import { masterworkChance, recipesFor, RECIPES, type Recipe } from '../data/recipes';
import { SHOP } from '../data/shop';
import { combatLevel } from '../combat/stats';
import { XP_TUNING } from '../data/tuning';
import { DROP_TABLES } from '../data/dropTables';
import type { Interactable } from '../entities/interactable';
import type { Game } from '../game';
import { generateUnique, makeItem } from '../loot/itemGen';
import { FUTURE_SKILLS, MAX_LEVEL, SKILL_INFO } from '../progression/skills';
import { SKILLS, SLOTS, type Item, type SkillId, type Slot } from '../types';
import { debugPanel } from './debugPanel';
import { cap, esc, fmt, itemImg, itemSlot } from './dom';
import { DRAG_THRESHOLD, swapSlots } from './hudLayout';
import { icon } from './icons';
import { skillTileInfo } from './skillGrid';
import type { UI } from './ui';

const SLOT_LABEL: Record<Slot, string> = { weapon: 'Weapon', helm: 'Helm', body: 'Body', gloves: 'Gloves', boots: 'Boots', amulet: 'Amulet', ring: 'Ring' };

/**
 * The paper doll's backdrop, in the doll's own pixel frame at 1600x900 (198x198; it scales down at 720p):
 * a carved panel with chamfered corners, a figure whose neck, shoulders, arms and legs show in the
 * gutters between the slots, and the connecting rails OSRS draws between equipment slots.
 * Slot centres: columns x 33 / 99 / 165; helm y 33, body 99, boots 165; flanks y 66 (jewellery) and 132 (hands).
 */
const DOLL_FIG = `<svg class="doll-fig" viewBox="0 0 198 198" preserveAspectRatio="none" aria-hidden="true">
  <path d="M24 1 H174 L197 24 V174 L174 197 H24 L1 174 V24 Z" fill="rgba(8,6,4,0.42)" stroke="#5a4526" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
  <path d="M27 6 H171 L192 27 V171 L171 192 H27 L6 171 V27 Z" fill="none" stroke="rgba(216,178,90,0.16)" stroke-width="1" vector-effect="non-scaling-stroke"/>
  <g fill="rgba(206,176,116,0.24)" stroke="rgba(226,190,110,0.55)" stroke-width="1.2" stroke-linejoin="round">
    <path d="M90 52 H108 V80 H90 Z" vector-effect="non-scaling-stroke"/>
    <path d="M48 88 Q54 76 72 76 H126 Q144 76 150 88 L156 104 L136 110 L130 132 H68 L62 110 L42 104 Z" vector-effect="non-scaling-stroke"/>
    <path d="M42 102 L62 110 L50 126 L30 116 Z M156 102 L136 110 L148 126 L168 116 Z" vector-effect="non-scaling-stroke"/>
    <path d="M74 128 H96 L94 152 H76 Z M102 128 H124 L122 152 H104 Z" vector-effect="non-scaling-stroke"/>
  </g>
  <path d="M99 33 V165 M33 66 H165 M33 132 H165" fill="none" stroke="#6e5530" stroke-width="2" vector-effect="non-scaling-stroke"/>
  <g fill="#b08a44" stroke="#1a1208" stroke-width="1"><circle cx="99" cy="66" r="3"/><circle cx="99" cy="132" r="3"/></g>
  <path d="M11 36 V24 L24 11 H36 M187 36 V24 L174 11 H162 M11 162 V174 L24 187 H36 M187 162 V174 L174 187 H162" fill="none" stroke="#8a6f36" stroke-width="1.3" vector-effect="non-scaling-stroke"/>
  <g fill="#c8a560" stroke="#1a1208" stroke-width="0.8"><circle cx="22" cy="22" r="2.6"/><circle cx="176" cy="22" r="2.6"/><circle cx="22" cy="176" r="2.6"/><circle cx="176" cy="176" r="2.6"/></g>
</svg>`;

/** The OSRS "open in a window" button a compact side-panel tab carries. */
const EXPAND = `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 5V1.5H5M9 1.5h3.5V5M12.5 9v3.5H9M5 12.5H1.5V9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const COMBAT_XP_SKILLS: SkillId[] = ['melee', 'ranged', 'magic', 'defence', 'hitpoints'];

/** How each skill trains, for its hover card (the combat split is combat/stats combatXpSplit). */
const SKILL_TRAINING: Record<SkillId, string> = {
  melee: 'Trains whenever you fight with a sword or longsword.',
  ranged: 'Trains whenever you fight with a bow.',
  magic: 'Trains whenever you fight with a staff.',
  defence: `Gets ${Math.round(XP_TUNING.defenceShare * 100)}% of all combat XP, plus XP for damage your armour absorbs.`,
  hitpoints: 'Gets a third of all combat XP, whatever you fight with.',
  mining: 'Trains by mining ore.',
  smithing: 'Trains by smelting bars and smithing at the anvil.',
};

/** Everything that opens in a framed stone panel. */
export class Panels {
  bankMode: 'bank' | 'deposit' | null = null;
  shopOpen = false;
  craft: { kind: 'furnace' | 'anvil'; station: Interactable } | null = null;
  keepFocus: string | null = null;
  journalTab: 'quests' | 'diary' = 'quests';
  /** What the full-size book window shows (null while it's closed). */
  bookView: 'journal' | 'collection' | null = null;
  bankSearch = '';

  constructor(private ui: UI, private g: Game) {}

  // ─── Inventory (always-visible side panel tab) ──────────────────────────

  /**
   * The item last pressed in the inventory, rimmed in gold as the selection. Held by identity, never by slot, so it
   * follows its item through sorting, swaps and redraws, and lapses once the item leaves the inventory.
   */
  private selected: Item | null = null;
  /** The item being dragged: its slot dims under the ghost, wherever a redraw puts it. */
  private dragItem: Item | null = null;
  /** The slot whose card is showing, and the item it showed. */
  private hoverAt: { i: number; it: Item } | null = null;
  /** Ends the press in progress without acting on it (its ghost removed). */
  private cancelPress: (() => void) | null = null;

  inventory() {
    const g = this.g, s = g.save;
    const el = this.ui.panel('inventory', 'Inventory');
    if (!el) return;
    if (this.selected && !s.inventory.includes(this.selected)) this.selected = null;
    const inv = s.inventory.map((it, i) => itemSlot(it, `data-inv="${i}"`, it && BASES[it.base]?.kind === 'gear' && g.items.canEquip(it) ? 'unusable' : '')).join('');
    const mode = this.bankMode === 'bank' || this.bankMode === 'deposit' ? '<span class="modechip">Click to deposit</span>' : this.shopOpen ? '<span class="modechip">Click to sell</span>' : '';
    this.ui.body(el, `
      <div class="invgrid ${mode ? 'moded' : ''}">${inv}</div>
      <div class="invfoot">${mode || `<span class="goldline">${icon('gold', 18)}<span>${fmt(s.gold)}</span></span>`}<button class="sortbtn" data-act="sort">Sort</button></div>`);
    this.markSlots();
    // Redrawn under a showing card: it stays only while its slot still holds the item it describes.
    if (this.hoverAt && s.inventory[this.hoverAt.i] !== this.hoverAt.it) {
      this.hoverAt = null;
      this.ui.tooltip.hide();
    }
    el.querySelector('[data-act="sort"]')!.addEventListener('click', () => g.items.sort());
    el.querySelectorAll<HTMLElement>('[data-inv]').forEach((c) => {
      const i = Number(c.dataset.inv);
      c.addEventListener('mouseenter', () => {
        const it = g.save.inventory[i];
        if (!it || this.dragItem) return;
        this.hoverAt = { i, it };
        this.ui.tooltip.item(it, c.getBoundingClientRect(), true, this.invHint(it));
      });
      c.addEventListener('mouseleave', () => {
        this.hoverAt = null;
        this.ui.tooltip.hide();
      });
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('mousedown', (e) => {
        if (!g.save.inventory[i]) return;
        this.hoverAt = null;
        this.ui.tooltip.hide();
        if (e.button === 2) {
          if (!this.bankMode && !this.shopOpen) g.items.dropFromInventory(i);
          return;
        }
        if (e.button === 0) this.press(i, e);
      });
    });
  }

  /** Rim the selected item's slot and dim the dragged one's, wherever they sit now. */
  private markSlots() {
    const inv = this.g.save.inventory;
    document.querySelectorAll<HTMLElement>('.sidepanel [data-inv]').forEach((c) => {
      const it = inv[Number(c.dataset.inv)];
      c.classList.toggle('sel', !!it && it === this.selected);
      c.classList.toggle('dragfrom', !!it && it === this.dragItem);
    });
  }

  /** The inventory folded or switched away from: forget the selection, end any press and its ghost. */
  clearSelection() {
    this.cancelPress?.();
    this.selected = null;
    this.hoverAt = null;
  }

  private invHint(it: Item) {
    if (this.bankMode) return 'Click: deposit · Shift-click: deposit all of it';
    if (this.shopOpen) return 'Click: sell to the Quartermaster';
    return `${BASES[it.base]?.kind === 'gear' ? 'Click: equip · ' : ''}Right-click: drop · Drag: move`;
  }

  /**
   * A left press on an inventory item selects it; released in place it's a click (equip / deposit / sell);
   * moved past DRAG_THRESHOLD it becomes an OSRS-style drag that swaps two slots on release. The pressed item is
   * looked up afresh on release, so a redraw or sort under the press never acts on whatever took its slot.
   */
  private press(i: number, e: MouseEvent) {
    const g = this.g;
    const it = g.save.inventory[i];
    if (!it) return;
    this.cancelPress?.();
    this.selected = it;
    this.markSlots();
    const x0 = e.clientX, y0 = e.clientY, shift = e.shiftKey;
    let ghost: HTMLElement | null = null;
    const end = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('blur', cancel);
      ghost?.remove();
      this.dragItem = null;
      this.cancelPress = null;
    };
    // The window losing focus mid-press (its release may never arrive) or the inventory folding away.
    const cancel = () => {
      end();
      this.markSlots();
    };
    const move = (ev: MouseEvent) => {
      if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) >= DRAG_THRESHOLD) {
        if (!g.save.inventory.includes(it)) return cancel();
        this.dragItem = it;
        ghost = document.createElement('div');
        ghost.className = 'dragghost';
        ghost.innerHTML = itemImg(it);
        document.body.appendChild(ghost);
        this.markSlots();
        this.hoverAt = null;
        this.ui.tooltip.hide();
      }
      if (ghost) ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
    };
    const up = (ev: MouseEvent) => {
      const dragged = !!ghost;
      end();
      const from = g.save.inventory.indexOf(it);
      if (dragged) {
        const to = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('.sidepanel [data-inv]');
        if (from >= 0 && to && swapSlots(g.save.inventory, from, Number(to.dataset.inv))) g.dirty = true;
        this.ui.refresh();
        return;
      }
      if (from < 0) return;
      if (this.bankMode) g.items.deposit(from, shift);
      else if (this.shopOpen) g.items.sell(from);
      else if (BASES[it.base]?.kind === 'gear') g.items.equip(from);
    };
    this.cancelPress = cancel;
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('blur', cancel);
  }

  // ─── Equipment ───────────────────────────────────────────────────────────

  equipment() {
    const g = this.g, s = g.save;
    const el = this.ui.panel('equipment', 'Equipment');
    if (!el) return;
    const cell = (sl: Slot) => `<div class="eq eq-${sl}">${itemSlot(s.equipment[sl], `data-eq="${sl}"`, '', icon(`slot_${sl}`, 34))}</div>`;
    const st = g.stats;
    this.ui.body(el, `
      <div class="doll">${DOLL_FIG}${SLOTS.map(cell).join('')}</div>
      <div class="statgrid">
        <span>Damage</span><b>${Math.round(st.dmgMin)}–${Math.round(st.dmgMax)}</b>
        <span>Attack speed</span><b>${st.atkSpeed.toFixed(2)}/s</b>
        ${st.castSpeed > 1 ? `<span>Cast speed</span><b>+${Math.round((st.castSpeed - 1) * 100)}%</b>` : ''}
        <span>Critical</span><b>${Math.round(st.critChance * 100)}% ×${st.critMult.toFixed(2)}</b>
        <span>Life</span><b>${st.maxHp}</b>
        <span>Mana</span><b>${st.maxMana} <i>(+${st.manaRegen.toFixed(1)}/s)</i></b>
        <span>Armour</span><b>${st.armor} <i>(−${Math.round((st.armor / (st.armor + 50)) * 100)}%)</i></b>
        ${st.lifeOnHit ? `<span>Life on hit</span><b>${st.lifeOnHit}</b>` : ''}
        ${st.xpMult > 1 ? `<span>XP bonus</span><b>+${Math.round((st.xpMult - 1) * 100)}%</b>` : ''}
        ${st.cdr ? `<span>Cooldowns</span><b>−${Math.round(st.cdr * 100)}%</b>` : ''}
      </div>`);
    el.querySelectorAll<HTMLElement>('[data-eq]').forEach((c) => {
      const sl = c.dataset.eq as Slot;
      c.addEventListener('mouseenter', () => {
        const it = s.equipment[sl];
        if (it) this.ui.tooltip.item(it, c.getBoundingClientRect(), false, 'Click: take off');
        else this.ui.tooltip.text(`<div class="tt-name">${SLOT_LABEL[sl]}</div><div class="tt-dim">Empty. Click gear in your inventory to wear it.</div>`, c.getBoundingClientRect());
      });
      c.addEventListener('mouseleave', () => this.ui.tooltip.hide());
      c.addEventListener('mousedown', () => {
        this.ui.tooltip.hide();
        if (s.equipment[sl]) g.items.unequip(sl);
      });
    });
  }

  // ─── Skills ──────────────────────────────────────────────────────────────

  milestones(skill: SkillId) {
    const out: { level: number; text: string }[] = [];
    for (const b of BASE_LIST) if (b.req?.skill === skill && b.req.level > 1) out.push({ level: b.req.level, text: `${b.kind === 'tool' ? 'use' : b.slot === 'weapon' ? 'wield' : 'wear'} ${b.name}` });
    for (const u of Object.values(UNIQUES)) if (u.req?.skill === skill) out.push({ level: u.req.level, text: `use ${u.name}` });
    for (const a of Object.values(ABILITIES)) if (a.style === skill && a.unlock > 1) out.push({ level: a.unlock, text: `unlock ${a.name}` });
    if (skill === 'smithing') for (const t of TIER_ORDER) out.push({ level: TIERS[t].smith, text: `smith ${TIERS[t].name}` });
    if (skill === 'mining') for (const [lvl, ore] of [[15, 'iron'], [30, 'coal'], [32, 'emberite']] as const) out.push({ level: lvl, text: `mine ${ore}` });
    const seen = new Set<string>();
    return out.sort((a, b) => a.level - b.level).filter((m) => !seen.has(m.level + m.text) && seen.add(m.level + m.text));
  }

  skills() {
    const g = this.g, s = g.save;
    const el = this.ui.panel('skills', 'Skills');
    if (!el) return;
    const total = SKILLS.reduce((t, k) => t + g.levels[k], 0) + FUTURE_SKILLS.length;
    // OSRS skill grid: square tiles (inventory-slot sized), the skill's icon over its level out of 99.
    const tiles = SKILLS.map((k) => {
      const t = skillTileInfo(s.skills[k]);
      return `<div class="stile" data-skill="${k}" aria-label="${SKILL_INFO[k].name} ${t.label}">
        <div class="si">${icon(SKILL_INFO[k].icon, 26)}</div><div class="slv"><b>${t.level}</b><i>/${MAX_LEVEL}</i></div>
      </div>`;
    }).join('');
    const locked = FUTURE_SKILLS.map((f, i) => `<div class="stile locked" data-future="${i}" aria-label="${esc(f.name)}, locked">
        <div class="si">${icon(f.icon, 26)}</div><div class="slv"><i>Ch. ${f.chapter}</i></div>
      </div>`).join('');
    const totalTile = `<div class="stile stotal"><span>Total</span><b>${total}</b></div>`;
    // Freed by the stance switch: the two numbers that sum the hero up.
    const totalXp = SKILLS.reduce((t, k) => t + s.skills[k], 0);
    this.ui.body(el, `
      <div class="skillsum">
        <div class="ssum" data-sum="combat">${icon('combat', 24)}<div><span>Combat level</span><b>${combatLevel(g.levels)}</b></div></div>
        <div class="ssum" data-sum="xp">${icon('skills', 24)}<div><span>Total XP</span><b>${fmt(totalXp)}</b></div></div>
      </div>
      <div class="sechead">Skills</div>
      <div class="skillgrid">${tiles}${locked}${totalTile}</div>`);
    const sumTips: Record<string, string> = {
      combat: `<div class="tt-name">Combat level ${combatLevel(g.levels)}</div><div>Half your best weapon style, plus a quarter each of Defence and Hitpoints.</div><div class="tt-dim">Enemies show their level beside their name.</div>`,
      xp: `<div class="tt-name">Total XP</div><div class="tt-row"><span>Combat</span><b>${fmt(COMBAT_XP_SKILLS.reduce((t, k) => t + s.skills[k], 0))}</b></div><div class="tt-row"><span>Mining &amp; Smithing</span><b>${fmt(s.skills.mining + s.skills.smithing)}</b></div>`,
    };
    el.querySelectorAll<HTMLElement>('[data-sum]').forEach((b) => {
      b.addEventListener('mouseenter', () => this.ui.tooltip.text(sumTips[b.dataset.sum!], b.getBoundingClientRect()));
      b.addEventListener('mouseleave', () => this.ui.tooltip.hide());
    });
    el.querySelectorAll<HTMLElement>('[data-skill]').forEach((row) => {
      const k = row.dataset.skill as SkillId;
      row.addEventListener('mouseenter', () => {
        const t = skillTileInfo(s.skills[k]);
        const ms = this.milestones(k).filter((m) => m.level > t.level).slice(0, 4);
        const next = t.nextAt === null
          ? '<div class="tt-dim">Mastered.</div>'
          : `<div class="tt-row"><span>Next level at</span><b>${fmt(t.nextAt)}</b></div>
             <div class="tt-row"><span>Remaining</span><b>${fmt(t.remaining)}</b></div>
             <div class="tt-prog" style="--c:${SKILL_INFO[k].color}"><div style="width:${t.frac * 100}%"></div><span>${t.pct}% to level ${t.level + 1}</span></div>`;
        this.ui.tooltip.text(`<div class="tt-name">${SKILL_INFO[k].name} <span class="tt-lv">${t.label}</span></div>
          <div class="tt-row"><span>XP</span><b>${fmt(t.xp)}</b></div>
          ${next}
          <div class="tt-dim">${SKILL_TRAINING[k]}</div>
          ${ms.length ? `<div class="tt-cmp">${ms.map((m) => `<div><b>${m.level}</b> · ${esc(m.text)}</div>`).join('')}</div>` : ''}`, row.getBoundingClientRect());
      });
      row.addEventListener('mouseleave', () => this.ui.tooltip.hide());
    });
    el.querySelectorAll<HTMLElement>('[data-future]').forEach((row) => {
      const f = FUTURE_SKILLS[Number(row.dataset.future)];
      row.addEventListener('mouseenter', () => this.ui.tooltip.text(`<div class="tt-name">${esc(f.name)}</div><div class="tt-dim">Arrives in Chapter ${f.chapter}.</div>`, row.getBoundingClientRect()));
      row.addEventListener('mouseleave', () => this.ui.tooltip.hide());
    });
  }

  // ─── Bank ────────────────────────────────────────────────────────────────

  bank() {
    const g = this.g, s = g.save;
    const el = this.ui.panel('bank', this.bankMode === 'deposit' ? 'Deposit Chest' : 'Bank Vault');
    if (!el) return;
    if (this.bankMode === 'deposit') {
      this.ui.body(el, `<p class="lead">Deposit only. Click items in your inventory to send them home to the vault.</p><button class="btn big" data-act="all">Deposit inventory</button>`);
      el.querySelector('[data-act="all"]')!.addEventListener('click', () => g.items.depositAll());
      return;
    }
    const q = this.bankSearch.toLowerCase();
    const cells = s.bank.map((it, i) => {
      const hide = q && !(BASES[it.base]?.name.toLowerCase().includes(q) || it.name?.toLowerCase().includes(q));
      return hide ? '' : itemSlot(it, `data-bank="${i}"`);
    }).join('');
    this.ui.body(el, `
      <div class="banktop"><input class="search" placeholder="Search…" value="${esc(this.bankSearch)}"><span>${s.bank.length} / ${g.items.bankCapacity()}</span><button class="btn" data-act="all">Deposit inventory</button></div>
      <div class="bankgrid">${cells || '<div class="emptynote">Your vault is empty.</div>'}</div>
      <div class="hint">Click: withdraw 1 · Shift-click: withdraw 10 · Ctrl-click: withdraw all</div>`);
    const search = el.querySelector<HTMLInputElement>('.search')!;
    search.addEventListener('input', () => {
      this.bankSearch = search.value;
      this.bank();
      el.querySelector<HTMLInputElement>('.search')?.focus();
    });
    search.addEventListener('keydown', (e) => e.stopPropagation());
    el.querySelector('[data-act="all"]')!.addEventListener('click', () => g.items.depositAll());
    el.querySelectorAll<HTMLElement>('[data-bank]').forEach((c) => {
      const i = Number(c.dataset.bank);
      c.addEventListener('mouseenter', () => s.bank[i] && this.ui.tooltip.item(s.bank[i], c.getBoundingClientRect(), true));
      c.addEventListener('mouseleave', () => this.ui.tooltip.hide());
      c.addEventListener('mousedown', (e) => {
        this.ui.tooltip.hide();
        g.items.withdraw(i, e.ctrlKey ? 9999 : e.shiftKey ? 10 : 1);
      });
    });
  }

  // ─── Shop ────────────────────────────────────────────────────────────────

  shop() {
    const g = this.g;
    const el = this.ui.panel('shop', "Quartermaster's Wares");
    if (!el) return;
    const rows = SHOP.map((e, i) => {
      const price = g.items.shopPrice(e);
      const item = e.special ? null : makeItem(e.id);
      const name = e.name ?? BASES[e.id].name;
      const pic = item ? itemSlot(item) : `<div class="slot r-magic">${icon('potion', 44)}</div>`;
      const afford = price !== null && g.save.gold >= price;
      return `<div class="shoprow ${afford ? '' : 'poor'}" data-buy="${i}">${pic}<div class="sr-name">${esc(name)}${e.desc ? `<small>${esc(e.desc)}</small>` : ''}</div><div class="sr-price">${price === null ? 'Maxed' : `${icon('gold', 16)} ${fmt(price)}`}</div></div>`;
    }).join('');
    this.ui.body(el, `<div class="shoplist">${rows}</div><div class="hint">Click to buy · Click items in your inventory to sell · You have ${fmt(g.save.gold)} gold</div>`);
    el.querySelectorAll<HTMLElement>('[data-buy]').forEach((r) => r.addEventListener('mousedown', () => g.items.buy(Number(r.dataset.buy))));
  }

  // ─── Furnace & anvil ─────────────────────────────────────────────────────

  craftMenu() {
    const g = this.g;
    if (!this.craft) return;
    const kind = this.craft.kind;
    const el = this.ui.panel('craft', kind === 'furnace' ? 'Furnace: Smelting' : 'Anvil: Smithing');
    if (!el) return;
    const q = g.save.quests.cinder_seal;
    const list = recipesFor(kind).filter((r) => r.out !== 'cinder_key' || (q && !q.done && q.stage === 2));
    const groups = new Map<string, Recipe[]>();
    for (const r of list) {
      const key = r.tier ? TIERS[r.tier].name : 'Quest';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    const html = [...groups].map(([name, rs]) => {
      const rows = rs.map((r) => {
        const err = g.skilling.craftError(r);
        const lvlOk = g.levels.smithing >= r.level;
        const ins = Object.entries(r.inputs).map(([id, n]) => {
          const have = g.items.count(id);
          return `<span class="${have >= n ? 'ok' : 'no'}">${n}× ${esc(BASES[id].name)} <i>(${have})</i></span>`;
        }).join(' ');
        const mw = masterworkChance(g.levels.smithing, r);
        const max = Math.min(...Object.entries(r.inputs).map(([id, n]) => Math.floor(g.items.count(id) / n)));
        return `<div class="recipe ${err ? 'blocked' : ''}" data-r="${r.id}">
          ${itemSlot(makeItem(r.out))}
          <div class="rc-main"><div class="rc-name">${esc(BASES[r.out].name)} <span class="${lvlOk ? 'lv' : 'lv bad'}">Lv ${r.level}</span></div>
          <div class="rc-in">${ins}</div>
          <div class="rc-xp">${+(r.xp * XP_TUNING.smithing).toFixed(1)} XP${mw > 0 ? ` · ${(mw * 100).toFixed(1)}% masterwork` : ''}${r.needs && !g.save.keep[r.needs] ? ' · <span class="no">needs forge restoration</span>' : ''}</div></div>
          <div class="rc-btns">${[1, 5, 10].map((n) => `<button class="btn sm" data-q="${n}" ${err ? 'disabled' : ''}>${n}</button>`).join('')}<button class="btn sm" data-q="${Math.max(1, max)}" ${err ? 'disabled' : ''}>All</button></div>
        </div>`;
      }).join('');
      return `<div class="rgroup"><div class="rg-title">${name}</div>${rows}</div>`;
    }).join('');
    this.ui.body(el, `<div class="recipes">${html}</div>`);
    el.querySelectorAll<HTMLElement>('.recipe').forEach((row) => {
      row.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) =>
        b.addEventListener('click', () => g.skilling.startCraft(row.dataset.r!, Number(b.dataset.q), this.craft!.station)),
      );
      const out = row.querySelector('.slot') as HTMLElement;
      out.addEventListener('mouseenter', () => this.ui.tooltip.item(makeItem(RECIPES[row.dataset.r!].out), out.getBoundingClientRect(), true));
      out.addEventListener('mouseleave', () => this.ui.tooltip.hide());
    });
  }

  // ─── Keep restoration ────────────────────────────────────────────────────

  keep() {
    const g = this.g, s = g.save;
    const el = this.ui.panel('keep', 'Restoration Board');
    if (!el) return;
    const order = [...RESTORATIONS].sort((a, b) => (a.id === this.keepFocus ? -1 : b.id === this.keepFocus ? 1 : 0));
    const rows = order.map((r) => {
      const done = !!s.keep[r.id];
      const st = g.story.restorationStatus(r);
      const costs = Object.entries(r.cost).map(([id, n]) => {
        const have = g.items.totalCount(id);
        return `<span class="${have >= n ? 'ok' : 'no'}">${n}× ${esc(BASES[id].name)} <i>(${fmt(have)})</i></span>`;
      });
      if (r.gold) costs.push(`<span class="${s.gold >= r.gold ? 'ok' : 'no'}">${fmt(r.gold)} gold</span>`);
      const reqs = r.reqs.map((q) => `<span class="${g.levels[q.skill] >= q.level ? 'ok' : 'no'}">${SKILL_INFO[q.skill].name} ${q.level}</span>`);
      if (r.quest) reqs.push(`<span class="${s.quests[r.quest]?.done ? 'ok' : 'no'}">${esc(QUESTS[r.quest].name)}</span>`);
      return `<div class="restore ${done ? 'done' : ''} ${r.locked ? 'locked' : ''} ${r.id === this.keepFocus ? 'focus' : ''}">
        <div class="rs-head"><b>${esc(r.name)}</b>${done ? '<span class="tag ok">Restored</span>' : r.locked ? `<span class="tag">${esc(r.locked)}</span>` : ''}</div>
        <div class="rs-desc">${esc(r.desc)}</div>
        ${!done && !r.locked ? `<div class="rs-cost">${[...costs, ...reqs].join(' · ')}</div>
        <button class="btn" data-restore="${r.id}" ${st.can ? '' : 'disabled'}>Restore</button>` : ''}
      </div>`;
    }).join('');
    this.ui.body(el, `<p class="lead">Materials are taken from your inventory first, then the bank.</p><div class="restores">${rows}</div>`);
    el.querySelectorAll<HTMLButtonElement>('[data-restore]').forEach((b) => b.addEventListener('click', () => g.story.restore(b.dataset.restore!)));
  }

  // ─── Journal: quests & diary ─────────────────────────────────────────────

  /** A side-panel header row: the view's own switcher (if any) and the button that opens the full window. */
  private sideHead(view: 'journal' | 'collection', left: string) {
    const open = this.bookView === view;
    return `<div class="sidehead">${left}<button class="expand ${open ? 'on' : ''}" data-book="${view}">${EXPAND}</button></div>`;
  }

  private bindSideHead(el: HTMLElement, view: 'journal' | 'collection', label: string) {
    const b = el.querySelector<HTMLElement>(`[data-book="${view}"]`);
    if (!b) return;
    b.addEventListener('click', () => this.ui.openBook(view));
    b.addEventListener('mouseenter', () => this.ui.tooltip.text(`<div class="tt-name">${this.bookView === view ? 'Close' : 'Open'} ${label}</div><div class="tt-dim">The full-size window, beside the side panel.</div>`, b.getBoundingClientRect()));
    b.addEventListener('mouseleave', () => this.ui.tooltip.hide());
  }

  private journalTabs() {
    return `<div class="tabs"><button class="tab ${this.journalTab === 'quests' ? 'on' : ''}" data-jtab="quests">${icon('quest', 18)} Quests</button><button class="tab ${this.journalTab === 'diary' ? 'on' : ''}" data-jtab="diary">${icon('diary', 18)} Diary</button></div>`;
  }

  private bindJournalTabs(el: HTMLElement) {
    el.querySelectorAll<HTMLElement>('[data-jtab]').forEach((t) => t.addEventListener('click', () => {
      this.journalTab = t.dataset.jtab as 'quests' | 'diary';
      this.journal();
      this.book();
    }));
  }

  /**
   * The side panel's journal is an OSRS quest list: one line per quest coloured by status (the current
   * step under one in progress), or the diary tiers with their progress. Details live in the full window.
   */
  journal() {
    const g = this.g, s = g.save;
    const el = this.ui.panel('journal', 'Journal');
    if (!el) return;
    let body = '';
    if (this.journalTab === 'quests') {
      body = Object.values(QUESTS).map((q) => {
        const st = s.quests[q.id];
        const cls = !st ? 'new' : st.done ? 'done' : 'active';
        const step = st && !st.done ? `<span class="qstep">${esc(q.stages[st.stage]?.text ?? '')}</span>` : !st ? '<span class="qstep">Speak with the Warden.</span>' : '';
        return `<button class="qrow ${cls}" data-quest="${q.id}"><b>${esc(q.name)}</b>${step}</button>`;
      }).join('');
      body += '<div class="qlegend"><span class="new">Not started</span><span class="active">In progress</span><span class="done">Complete</span></div>';
    } else {
      body = (['easy', 'medium', 'hard'] as DiaryTier[]).map((tier) => {
        const tasks = DIARY_TASKS.filter((t) => t.tier === tier);
        const done = tasks.filter((t) => s.diary[t.id]).length;
        const claimed = s.diaryClaimed[tier];
        const ready = done === tasks.length && !claimed;
        return `<button class="drow ${claimed ? 'claimed' : ''} ${ready ? 'ready' : ''}" data-diary="${tier}"><span class="dname">${cap(tier)}</span><span class="dcount">${claimed ? 'Claimed' : ready ? 'Claim!' : `${done}/${tasks.length}`}</span><span class="dbar"><span style="width:${(100 * done) / tasks.length}%"></span></span></button>`;
      }).join('');
    }
    this.ui.body(el, `${this.sideHead('journal', this.journalTabs())}<div class="sidelist">${body}</div>`);
    this.bindJournalTabs(el);
    this.bindSideHead(el, 'journal', 'the journal');
    el.querySelectorAll<HTMLElement>('[data-quest], [data-diary]').forEach((r) => r.addEventListener('click', () => {
      if (this.bookView !== 'journal') this.ui.openBook('journal');
    }));
  }

  /** The full journal: every quest's log, requirements and rewards; the diary's tasks and claims. */
  private journalFull(el: HTMLElement) {
    const g = this.g, s = g.save;
    let body = '';
    if (this.journalTab === 'quests') {
      body = Object.values(QUESTS).map((q) => {
        const st = s.quests[q.id];
        const status = !st ? 'Not started' : st.done ? 'Complete' : 'In progress';
        const reqs = q.reqs.map((r) => `<span class="${g.levels[r.skill] >= r.level ? 'ok' : 'no'}">${SKILL_INFO[r.skill].name} ${r.level}</span>`).join(' · ');
        const log = st ? q.stages.slice(0, st.done ? q.stages.length : st.stage + 1).map((x, i) => `<p class="${st.done || i < st.stage ? 'struck' : ''}">${esc(x.text)}</p>`).join('') : '<p>Speak with the Warden in Dragonspire Keep.</p>';
        return `<div class="quest ${st?.done ? 'done' : ''}"><div class="q-head"><b>${esc(q.name)}</b><span class="tag ${st?.done ? 'ok' : ''}">${status}</span></div>
          <div class="q-reqs">Requires: ${reqs}</div>${log}<div class="q-rew">Rewards: ${q.rewards.map(esc).join(' · ')}</div></div>`;
      }).join('');
    } else {
      body = (['easy', 'medium', 'hard'] as DiaryTier[]).map((tier) => {
        const tasks = DIARY_TASKS.filter((t) => t.tier === tier);
        const done = tasks.filter((t) => s.diary[t.id]).length;
        const complete = done === tasks.length;
        const claimed = s.diaryClaimed[tier];
        const lamp = tier === 'easy' && complete && !claimed ? `<select class="lampskill">${SKILLS.map((k) => `<option value="${k}">${SKILL_INFO[k].name}</option>`).join('')}</select>` : '';
        return `<div class="diary"><div class="q-head"><b>${cap(tier)}</b><span class="tag ${complete ? 'ok' : ''}">${done}/${tasks.length}</span></div>
          ${tasks.map((t) => {
            const c = t.check;
            const prog = c.type === 'count' ? ` <i>(${fmt(Math.min(c.n, s.counters[c.key] ?? 0))}/${fmt(c.n)})</i>` : '';
            return `<div class="task ${s.diary[t.id] ? 'done' : ''}">${s.diary[t.id] ? '✔' : '◇'} ${esc(t.text)}${s.diary[t.id] ? '' : prog}</div>`;
          }).join('')}
          <div class="q-rew">Reward: ${DIARY_REWARDS[tier].text.map(esc).join(' · ')}</div>
          ${claimed ? '<div class="tag ok">Claimed</div>' : complete ? `<div class="claimrow">${lamp}<button class="btn" data-claim="${tier}">Claim reward</button></div>` : ''}
        </div>`;
      }).join('');
    }
    this.ui.body(el, `${this.journalTabs()}${body}`);
    this.bindJournalTabs(el);
    el.querySelectorAll<HTMLElement>('[data-claim]').forEach((b) => b.addEventListener('click', () => {
      const lamp = el.querySelector<HTMLSelectElement>('.lampskill');
      g.story.claimDiary(b.dataset.claim as DiaryTier, (lamp?.value as SkillId) ?? undefined);
    }));
  }

  /** The full-size window the journal and collection log open out into. */
  book() {
    const view = this.bookView;
    if (!view) return;
    const el = this.ui.panel('book', view === 'journal' ? 'Journal' : 'Collection Log');
    if (!el) return;
    if (view === 'journal') this.journalFull(el);
    else this.collectionBody(el, true);
  }

  // ─── Collection log ──────────────────────────────────────────────────────

  collection() {
    const el = this.ui.panel('collection', 'Collection Log');
    if (!el) return;
    this.collectionBody(el, false);
  }

  private collectionBody(el: HTMLElement, full: boolean) {
    const g = this.g, s = g.save;
    const table = DROP_TABLES.cinderwing;
    const entry = (id: string, name: string, rate: string, pic: string) => {
      const n = s.collection[id] ?? 0;
      return `<div class="clog ${n ? 'got' : ''}" title="${esc(name)} (${rate})">${pic}<div class="cn">${n ? esc(name) : '???'}</div>${n > 1 ? `<div class="cc">×${n}</div>` : ''}</div>`;
    };
    const boss = [
      ...table.uniques!.map((u) => entry(u.id, UNIQUES[u.id].name, `1/${u.chance}`, itemSlot(generateUnique(Math.random, u.id, 20)))),
      entry('ember_whelp', PETS.ember_whelp.name, `1/${table.pet!.chance}`, `<div class="slot r-unique">${icon('beastmastery', 44)}</div>`),
    ];
    const mining = [
      ...['uncut_sapphire', 'uncut_emerald', 'uncut_ruby'].map((id) => entry(id, BASES[id].name, 'while mining', itemSlot(makeItem(id)))),
      entry('rock_golem', PETS.rock_golem.name, '1/4000 ore', `<div class="slot r-unique">${icon('mining', 44)}</div>`),
    ];
    const bossGot = [...table.uniques!.map((u) => u.id), 'ember_whelp'].filter((id) => s.collection[id]).length;
    const mineGot = ['uncut_sapphire', 'uncut_emerald', 'uncut_ruby', 'rock_golem'].filter((id) => s.collection[id]).length;
    const best = s.stats.bestBossTime;
    const tally = ['goblin', 'kobold', 'drakeling', 'cultist', 'cinder_priest'];
    const html = `
      <div class="csec"><div class="ch">Cinderwing <span>${bossGot}/${table.uniques!.length + 1}</span></div>
      <div class="cstats">Kills <b>${fmt(s.kc.cinderwing ?? 0)}</b> · Personal best <b>${best === null ? '—' : `${Math.floor(best / 60)}:${String(Math.floor(best % 60)).padStart(2, '0')}`}</b></div>
      <div class="cgrid">${boss.join('')}</div></div>
      <div class="csec"><div class="ch">Emberdeep <span>${mineGot}/4</span></div><div class="cgrid">${mining.join('')}</div></div>
      ${s.pets.length ? `<div class="csec"><div class="ch">Pets</div><div class="petrow">Following: <select class="petsel"><option value="">None</option>${s.pets.map((p) => `<option value="${p}" ${s.activePet === p ? 'selected' : ''}>${esc(PETS[p].name)}</option>`).join('')}</select></div></div>` : ''}
      <div class="csec"><div class="ch">Slayer tally</div><div class="tally">${tally.map((id) => `<span>${esc(cap(id.replace('_', ' ')))}</span><b>${fmt(s.kc[id] ?? 0)}</b>`).join('')}</div>
      <div class="cstats dim">Deaths ${s.stats.deaths} · Played ${Math.floor(s.stats.playtime / 3600)}h ${Math.floor((s.stats.playtime % 3600) / 60)}m</div></div>`;
    this.ui.body(el, full ? html : `${this.sideHead('collection', '<div class="sidetitle">Collection log</div>')}${html}`);
    if (!full) this.bindSideHead(el, 'collection', 'the collection log');
    el.querySelector<HTMLSelectElement>('.petsel')?.addEventListener('change', (e) => g.items.setPet((e.target as HTMLSelectElement).value || null));
  }

  // ─── Help & settings ─────────────────────────────────────────────────────

  help() {
    const g = this.g;
    const el = this.ui.panel('help', 'Controls & Settings');
    if (!el) return;
    const keys: [string, string][] = [
      ['Click', 'Move · use · attack'], ['Hold', 'Repeat move / attack'], ['Shift', 'Attack in place'],
      ['Q W E', 'Skills (cost mana)'], ['1 · T', 'Potion · Veilstone'], ['I C K', 'Bag · Gear · Skills'],
      ['J L', 'Journal · Collection'], ['Alt · Space', 'Loot labels · Stop'], ['Wheel', 'Zoom'], ['Esc', 'Close · Settings'],
    ];
    this.ui.body(el, `
      <div class="sechead">Controls</div>
      <div class="keys">${keys.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>
      <div class="sechead">Settings</div>
      <div class="setting"><label>Volume</label><input type="range" min="0" max="1" step="0.05" value="${g.save.settings.volume}" class="vol" style="--v:${g.save.settings.volume * 100}%"></div>
      <div class="setting"><label>Graphics</label><select class="gfx">${(['high', 'medium', 'low'] as const).map((q) => `<option value="${q}"${(g.save.settings.graphics ?? 'high') === q ? ' selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}</select></div>
      <div class="btnrow"><button class="btn" data-act="title">Save &amp; quit to title</button></div>`);
    el.querySelector<HTMLInputElement>('.vol')!.addEventListener('input', (e) => {
      const inp = e.target as HTMLInputElement;
      const v = Number(inp.value);
      inp.style.setProperty('--v', `${v * 100}%`);
      g.save.settings.volume = v;
      g.sfx.setVolume(v);
      g.dirty = true;
    });
    el.querySelector<HTMLSelectElement>('.gfx')!.addEventListener('change', (e) => {
      const q = (e.target as HTMLSelectElement).value as 'high' | 'medium' | 'low';
      g.save.settings.graphics = q;
      g.applyGraphics(q);
      g.dirty = true;
    });
    const quit = el.querySelector<HTMLElement>('[data-act="title"]')!;
    quit.addEventListener('click', async () => {
      if (await g.flushSave()) location.reload();
    });
    quit.addEventListener('mouseenter', () => this.ui.tooltip.text(`<div class="tt-name">Save &amp; quit</div><div class="tt-dim">Progress also saves automatically to your ${esc(g.backend.describe())}.</div>`, quit.getBoundingClientRect()));
    quit.addEventListener('mouseleave', () => this.ui.tooltip.hide());
  }

  // ─── Debug ───────────────────────────────────────────────────────────────

  debug() {
    debugPanel(this.ui, this.g);
  }
}
