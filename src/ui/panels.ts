import { ABILITIES } from '../data/abilities';
import { DIARY_REWARDS, DIARY_TASKS, type DiaryTier } from '../data/diary';
import { BASES, BASE_LIST, PETS, UNIQUES, TIERS, TIER_ORDER } from '../data/items';
import { RESTORATIONS } from '../data/keep';
import { QUESTS } from '../data/quests';
import { masterworkChance, recipesFor, RECIPES, type Recipe } from '../data/recipes';
import { SHOP } from '../data/shop';
import { XP_TUNING } from '../data/tuning';
import { DROP_TABLES } from '../data/dropTables';
import type { Interactable } from '../entities/interactable';
import type { Game } from '../game';
import { generateItem, generateUnique, makeItem } from '../loot/itemGen';
import { FUTURE_SKILLS, SKILL_INFO, levelProgress, xpForLevel } from '../progression/skills';
import { itemIconUrl } from '../render/icons3d';
import { SKILLS, SLOTS, type Item, type SkillId, type Slot, type Stance } from '../types';
import { cap, esc, fmt, itemSlot } from './dom';
import { DRAG_THRESHOLD, swapSlots } from './hudLayout';
import { icon } from './icons';
import type { UI } from './ui';

const SLOT_LABEL: Record<Slot, string> = { weapon: 'Weapon', helm: 'Helm', body: 'Body', gloves: 'Gloves', boots: 'Boots', amulet: 'Amulet', ring: 'Ring' };

/** Everything that opens in a framed stone panel. */
export class Panels {
  bankMode: 'bank' | 'deposit' | null = null;
  shopOpen = false;
  craft: { kind: 'furnace' | 'anvil'; station: Interactable } | null = null;
  keepFocus: string | null = null;
  journalTab: 'quests' | 'diary' = 'quests';
  bankSearch = '';

  constructor(private ui: UI, private g: Game) {}

  // ─── Inventory (always-visible side panel tab) ──────────────────────────

  inventory() {
    const g = this.g, s = g.save;
    const el = this.ui.panel('inventory', 'Inventory');
    if (!el) return;
    const inv = s.inventory.map((it, i) => itemSlot(it, `data-inv="${i}"`, it && BASES[it.base]?.kind === 'gear' && g.items.canEquip(it) ? 'unusable' : '')).join('');
    const mode = this.bankMode === 'bank' || this.bankMode === 'deposit' ? '<span class="modechip">Click to deposit</span>' : this.shopOpen ? '<span class="modechip">Click to sell</span>' : '';
    this.ui.body(el, `
      <div class="invgrid ${mode ? 'moded' : ''}">${inv}</div>
      <div class="invfoot">${mode || `<span class="goldline">${icon('gold', 18)} ${fmt(s.gold)}</span>`}<button class="btn sm" data-act="sort">Sort</button></div>`);
    el.querySelector('[data-act="sort"]')!.addEventListener('click', () => g.items.sort());
    el.querySelectorAll<HTMLElement>('[data-inv]').forEach((c) => {
      const i = Number(c.dataset.inv);
      c.addEventListener('mouseenter', () => {
        const it = s.inventory[i];
        if (it && !this.dragging) this.ui.tooltip.item(it, c.getBoundingClientRect(), true, this.invHint(it));
      });
      c.addEventListener('mouseleave', () => this.ui.tooltip.hide());
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('mousedown', (e) => {
        if (!s.inventory[i]) return;
        this.ui.tooltip.hide();
        if (e.button === 2) {
          if (!this.bankMode && !this.shopOpen) g.items.dropFromInventory(i);
          return;
        }
        if (e.button === 0) this.press(i, e);
      });
    });
  }

  private dragging = false;

  private invHint(it: Item) {
    if (this.bankMode) return 'Click: deposit · Shift-click: deposit all of it';
    if (this.shopOpen) return 'Click: sell to the Quartermaster';
    return `${BASES[it.base]?.kind === 'gear' ? 'Click: equip · ' : ''}Right-click: drop · Drag: move`;
  }

  /**
   * A left press on an inventory item: released in place it's a click (equip / deposit / sell);
   * moved past DRAG_THRESHOLD it becomes an OSRS-style drag that swaps two slots on release.
   */
  private press(i: number, e: MouseEvent) {
    const g = this.g, s = g.save;
    const x0 = e.clientX, y0 = e.clientY, shift = e.shiftKey;
    let ghost: HTMLElement | null = null;
    const move = (ev: MouseEvent) => {
      if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) >= DRAG_THRESHOLD) {
        const it = s.inventory[i];
        if (!it) return;
        this.dragging = true;
        ghost = document.createElement('div');
        ghost.className = 'dragghost';
        ghost.innerHTML = `<img src="${itemIconUrl(it)}" alt="">`;
        document.body.appendChild(ghost);
        document.querySelector(`[data-inv="${i}"]`)?.classList.add('dragfrom');
        this.ui.tooltip.hide();
      }
      if (ghost) ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (ghost) {
        ghost.remove();
        this.dragging = false;
        const to = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-inv]');
        if (to && swapSlots(s.inventory, i, Number(to.dataset.inv))) g.dirty = true;
        this.ui.refresh();
        return;
      }
      const it = s.inventory[i];
      if (!it) return;
      if (this.bankMode) g.items.deposit(i, shift);
      else if (this.shopOpen) g.items.sell(i);
      else if (BASES[it.base]?.kind === 'gear') g.items.equip(i);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  // ─── Equipment ───────────────────────────────────────────────────────────

  equipment() {
    const g = this.g, s = g.save;
    const el = this.ui.panel('equipment', 'Equipment');
    if (!el) return;
    const cell = (sl: Slot) => `<div class="eq eq-${sl}">${itemSlot(s.equipment[sl], `data-eq="${sl}"`, '', icon(`slot_${sl}`, 34))}</div>`;
    const st = g.stats;
    this.ui.body(el, `
      <div class="doll">${SLOTS.map(cell).join('')}</div>
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
    const tiles = SKILLS.map((k) => {
      const p = levelProgress(s.skills[k]);
      const info = SKILL_INFO[k];
      return `<div class="stile" style="--c:${info.color}" data-skill="${k}">
        <div class="si">${icon(info.icon, 28)}</div><b>${p.level}</b>
        <div class="sbar"><div style="width:${p.level >= 99 ? 100 : p.frac * 100}%"></div></div>
      </div>`;
    }).join('');
    const locked = FUTURE_SKILLS.map((f, i) => `<div class="stile locked" data-future="${i}"><div class="si">${icon(f.icon, 28)}</div><b>1</b></div>`).join('');
    const stances: [Stance, string, string][] = [['aggressive', 'Aggressive', 'All combat XP to your weapon style'], ['shared', 'Shared', 'Split between style and Defence'], ['defensive', 'Defensive', 'All combat XP to Defence']];
    this.ui.body(el, `
      <div class="sechead">Combat stance</div>
      <div class="stances">${stances.map(([id, name]) => `<button class="stance ${s.stance === id ? 'on' : ''}" data-stance="${id}">${icon(id, 20)}<span>${name}</span></button>`).join('')}</div>
      <div class="sechead">Skills</div>
      <div class="skillgrid">${tiles}${locked}</div>
      <div class="total">Total level <b>${total}</b></div>`);
    el.querySelectorAll<HTMLElement>('[data-stance]').forEach((b) => {
      const st = stances.find(([id]) => id === b.dataset.stance)!;
      b.addEventListener('click', () => {
        s.stance = st[0];
        g.dirty = true;
        this.skills();
      });
      b.addEventListener('mouseenter', () => this.ui.tooltip.text(`<div class="tt-name">${st[1]}</div><div>${st[2]}.</div>`, b.getBoundingClientRect()));
      b.addEventListener('mouseleave', () => this.ui.tooltip.hide());
    });
    el.querySelectorAll<HTMLElement>('[data-skill]').forEach((row) => {
      const k = row.dataset.skill as SkillId;
      row.addEventListener('mouseenter', () => {
        const p = levelProgress(s.skills[k]);
        const ms = this.milestones(k).filter((m) => m.level > p.level).slice(0, 6);
        this.ui.tooltip.text(`<div class="tt-name" style="color:${SKILL_INFO[k].color}">${SKILL_INFO[k].name} ${p.level}</div>
          <div>${fmt(s.skills[k])} XP${p.level < 99 ? ` · ${fmt(p.remaining)} to level ${p.level + 1}` : ''}</div>
          <div class="tt-dim">Level 99 at ${fmt(xpForLevel(99))} XP</div>
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

  journal() {
    const g = this.g, s = g.save;
    const el = this.ui.panel('journal', 'Journal');
    if (!el) return;
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
    this.ui.body(el, `<div class="tabs"><button class="tab ${this.journalTab === 'quests' ? 'on' : ''}" data-tab="quests">${icon('quest', 18)} Quests</button><button class="tab ${this.journalTab === 'diary' ? 'on' : ''}" data-tab="diary">${icon('diary', 18)} Diary</button></div>${body}`);
    el.querySelectorAll<HTMLElement>('[data-tab]').forEach((t) => t.addEventListener('click', () => {
      this.journalTab = t.dataset.tab as 'quests' | 'diary';
      this.journal();
    }));
    el.querySelectorAll<HTMLElement>('[data-claim]').forEach((b) => b.addEventListener('click', () => {
      const lamp = el.querySelector<HTMLSelectElement>('.lampskill');
      g.story.claimDiary(b.dataset.claim as DiaryTier, (lamp?.value as SkillId) ?? undefined);
    }));
  }

  // ─── Collection log ──────────────────────────────────────────────────────

  collection() {
    const g = this.g, s = g.save;
    const el = this.ui.panel('collection', 'Collection Log');
    if (!el) return;
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
    const best = s.stats.bestBossTime;
    this.ui.body(el, `
      <div class="csec"><div class="ch">Cinderwing <span>${bossGot}/${table.uniques!.length + 1}</span></div>
      <div class="cstats">Kills <b>${fmt(s.kc.cinderwing ?? 0)}</b> · Personal best <b>${best === null ? '—' : `${Math.floor(best / 60)}:${String(Math.floor(best % 60)).padStart(2, '0')}`}</b></div>
      <div class="cgrid">${boss.join('')}</div></div>
      <div class="csec"><div class="ch">Emberdeep</div><div class="cgrid">${mining.join('')}</div></div>
      ${s.pets.length ? `<div class="csec"><div class="ch">Pets</div><div class="petrow">Following: <select class="petsel"><option value="">None</option>${s.pets.map((p) => `<option value="${p}" ${s.activePet === p ? 'selected' : ''}>${esc(PETS[p].name)}</option>`).join('')}</select></div></div>` : ''}
      <div class="csec"><div class="ch">Slayer tally</div><div class="cstats">${['goblin', 'kobold', 'drakeling', 'cultist', 'cinder_priest'].map((id) => `${esc(cap(id.replace('_', ' ')))} <b>${fmt(s.kc[id] ?? 0)}</b>`).join(' · ')}</div>
      <div class="cstats dim">Deaths ${s.stats.deaths} · Played ${Math.floor(s.stats.playtime / 3600)}h ${Math.floor((s.stats.playtime % 3600) / 60)}m</div></div>`);
    el.querySelector<HTMLSelectElement>('.petsel')?.addEventListener('change', (e) => g.items.setPet((e.target as HTMLSelectElement).value || null));
  }

  // ─── Help & settings ─────────────────────────────────────────────────────

  help() {
    const g = this.g;
    const el = this.ui.panel('help', 'Controls & Settings');
    if (!el) return;
    this.ui.body(el, `
      <div class="sechead">Controls</div>
      <table class="keys">
        <tr><td>Left-click</td><td>Move, pick up, mine, use. Hold to keep walking.</td></tr>
        <tr><td>Click enemy</td><td>Strike once; hold to keep attacking</td></tr>
        <tr><td>Shift-click</td><td>Attack in place</td></tr>
        <tr><td>Q W E</td><td>Skills (they follow your weapon and cost mana)</td></tr>
        <tr><td>1 · T</td><td>Healing potion · Veilstone home</td></tr>
        <tr><td>I C K</td><td>Inventory · Equipment · Skills</td></tr>
        <tr><td>J L</td><td>Journal · Collection log</td></tr>
        <tr><td>Esc</td><td>Close windows · this tab</td></tr>
        <tr><td>Alt · Space</td><td>Loot labels · stop</td></tr>
      </table>
      <div class="sechead">Settings</div>
      <div class="setting"><label>Volume</label><input type="range" min="0" max="1" step="0.05" value="${g.save.settings.volume}" class="vol"></div>
      <div class="setting"><label>Graphics</label><select class="gfx">${(['high', 'medium', 'low'] as const).map((q) => `<option value="${q}"${(g.save.settings.graphics ?? 'high') === q ? ' selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}</select></div>
      <div class="setting"><span class="dim">Progress saves automatically to your ${g.backend.describe()}.</span></div>
      <div class="btnrow"><button class="btn" data-act="title">Save &amp; quit to title</button></div>`);
    el.querySelector<HTMLInputElement>('.vol')!.addEventListener('input', (e) => {
      const v = Number((e.target as HTMLInputElement).value);
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
    el.querySelector('[data-act="title"]')!.addEventListener('click', async () => {
      await g.persist();
      location.reload();
    });
  }

  // ─── Debug ───────────────────────────────────────────────────────────────

  debug() {
    const g = this.g;
    const el = this.ui.panel('debug', 'Debug (F1)');
    if (!el) return;
    this.ui.body(el, `
      <div class="debug">
        <label><input type="checkbox" data-d="god" ${g.debug.god ? 'checked' : ''}> God mode</label>
        <label><input type="checkbox" data-d="oneShot" ${g.debug.oneShot ? 'checked' : ''}> One-shot enemies</label>
        <label>Drop rate × <select data-d="drop">${[1, 10, 100, 1000].map((v) => `<option ${g.debug.dropMult === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <div class="dbtns">
          <button class="btn sm" data-a="lvl">+5 all skills</button>
          <button class="btn sm" data-a="gold">+5,000 gold</button>
          <button class="btn sm" data-a="mats">Starter materials</button>
          <button class="btn sm" data-a="rare">Give rare</button>
          <button class="btn sm" data-a="unique">Give unique</button>
          <button class="btn sm" data-a="portals">Open all portals</button>
          ${['keep', 'mine', 'foothills', 'ruin', 'lair'].map((z) => `<button class="btn sm" data-go="${z}">Go: ${z}</button>`).join('')}
          <button class="btn sm danger" data-a="reset">Reset save</button>
        </div>
      </div>`);
    el.querySelectorAll<HTMLInputElement>('[data-d]').forEach((i) => i.addEventListener('change', () => {
      const d = i.dataset.d!;
      if (d === 'drop') g.debug.dropMult = Number((i as unknown as HTMLSelectElement).value);
      else (g.debug as any)[d] = i.checked;
    }));
    el.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.addEventListener('click', () => g.travel(b.dataset.go!)));
    el.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => b.addEventListener('click', () => {
      switch (b.dataset.a) {
        case 'lvl':
          for (const k of SKILLS) g.prog.grant(k, (xpForLevel(Math.min(99, g.levels[k] + 5)) - g.save.skills[k]) / g.stats.xpMult + 1);
          break;
        case 'gold':
          g.save.gold += 5000;
          break;
        case 'mats':
          for (const id of ['copper_ore', 'tin_ore', 'iron_ore', 'coal', 'iron_bar', 'steel_bar', 'emberite_ore']) {
            const stack = g.save.bank.find((x) => x.base === id);
            if (stack) stack.qty = (stack.qty ?? 1) + 50;
            else g.save.bank.push({ ...makeItem(id), qty: 50 });
          }
          g.announce('Added 50 of each material to your bank.', 'info');
          break;
        case 'rare':
          g.items.add(generateItem(Math.random, 15, 'rare'));
          break;
        case 'unique': {
          const ids = Object.keys(UNIQUES);
          g.items.add(generateUnique(Math.random, ids[Math.floor(Math.random() * ids.length)], 20));
          break;
        }
        case 'portals':
          Object.assign(g.save.portals, { mine: true, foothills: true, lair: true });
          g.save.keep.lair_arch = true;
          g.save.quests.cinder_seal ??= { stage: 0, done: false };
          g.zone.refreshStations();
          break;
        case 'reset':
          if (confirm('Reset ALL progress? This cannot be undone.')) g.resetSave();
          break;
      }
      g.ui.refresh();
    }));
  }
}
