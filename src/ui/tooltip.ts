import { computeStats } from '../combat/stats';
import { AFFIXES } from '../data/affixes';
import { BASES, TIERS, UNIQUES } from '../data/items';
import type { Game } from '../game';
import { affixText, itemName, itemReq, itemValue } from '../loot/itemGen';
import { SKILL_INFO } from '../progression/skills';
import type { Item, Slot } from '../types';
import { cap, esc } from './dom';
import { paintTree } from './uiText';

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** The side panel's box when `anchor` sits inside it (and the panel is showing), else null. */
function sidePanelRect(anchor: Box): Box | null {
  const side = document.querySelector<HTMLElement>('.sidepanel');
  if (!side || !side.offsetParent) return null;
  const r = side.getBoundingClientRect();
  const cx = anchor.left + anchor.width / 2, cy = anchor.top + anchor.height / 2;
  return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom ? r : null;
}

/**
 * Where a w×h tooltip for the element at `anchor` goes. Inside the side panel it sits OUTSIDE the panel, to its
 * left, level with the hovered element (so it never covers the panel's other tiles or headers); elsewhere it sits
 * above the element (below when there is no room). Always clamped on screen.
 */
export function tooltipPos(anchor: Box, w: number, h: number, view: { w: number; h: number }, side: Box | null) {
  const gap = 10, margin = 8;
  let x: number, y: number;
  if (side) {
    x = side.left - w - gap;
    y = anchor.top + anchor.height / 2 - h / 2;
  } else {
    x = anchor.left + anchor.width / 2 - w / 2;
    y = anchor.top - h - gap;
    if (y < margin) y = anchor.bottom + gap;
  }
  x = Math.max(margin, Math.min(view.w - w - margin, x));
  y = Math.max(margin, Math.min(view.h - h - margin, y));
  return { x, y };
}

const SLOT_LABEL: Record<Slot, string> = { weapon: 'Weapon', helm: 'Helm', body: 'Body', gloves: 'Gloves', boots: 'Boots', amulet: 'Amulet', ring: 'Ring' };

export class Tooltip {
  private tip = document.getElementById('tooltip')!;

  constructor(private g: Game) {}

  item(item: Item, rect: DOMRect, compare: boolean, extra = '') {
    const g = this.g;
    const base = BASES[item.base];
    const tint = `tint-${item.rarity}`;
    const req = itemReq(item);
    const reqBad = req && g.levels[req.skill] < req.level;
    const L: string[] = [];
    L.push(`<div class="tt-name ${tint}">${esc(itemName(item))}</div>`);
    if (item.name && item.rarity === 'rare') L.push(`<div class="tt-base ${tint}">${esc(base.name)}</div>`);
    const kindLabel = base.kind === 'gear' ? `${item.rarity === 'normal' ? '' : cap(item.rarity) + ' '}${SLOT_LABEL[base.slot!]}${base.style ? ` · ${SKILL_INFO[base.style].name}` : ''}` : base.kind === 'tool' ? 'Tool' : base.kind === 'quest' ? 'Quest item' : 'Material';
    L.push(`<div class="tt-type">${kindLabel}${base.tier ? ` · ${TIERS[base.tier].name} tier` : ''}</div>`);
    if (base.dmg) L.push(`<div>Damage <b>${base.dmg[0]}–${base.dmg[1]}</b> · ${base.speed} attacks/s</div>`);
    if (base.armor) L.push(`<div>Armour <b>${base.armor}</b></div>`);
    if (base.swingTicks) L.push(`<div>Mining speed: a swing every <b>${(base.swingTicks * 0.6).toFixed(1)}s</b></div>`);
    for (const a of item.affixes) L.push(`<div class="tt-aff tint-${AFFIXES[a.id]?.tint ?? 'good'}">${esc(affixText(a))}</div>`);
    if (item.masterwork) L.push('<div class="tt-mw">Masterwork</div>');
    if (req) L.push(`<div class="${reqBad ? 'tt-bad' : 'tt-req'}">Requires ${SKILL_INFO[req.skill].name} ${req.level}</div>`);
    if (item.unique) L.push(`<div class="tt-flavor">“${esc(UNIQUES[item.unique].flavor)}”</div>`);
    else if (base.desc) L.push(`<div class="tt-flavor">${esc(base.desc)}</div>`);
    if (base.kind !== 'quest') L.push(`<div class="tt-dim">${base.kind === 'gear' ? `Item level ${item.ilvl} · ` : ''}Worth ${itemValue(item)} gold${item.qty && item.qty > 1 ? ` each (${item.qty})` : ''}</div>`);

    let cmp = '';
    if (compare && base.kind === 'gear' && base.slot) {
      const equipped = g.save.equipment[base.slot];
      if (equipped && equipped.uid !== item.uid) cmp = `<div class="tt-cmp"><div class="tt-dim">Compared to your ${esc(itemName(equipped))}:</div>${this.compareLines(item, base.slot)}</div>`;
    }
    this.tip.innerHTML = L.join('') + cmp + (extra ? `<div class="tt-hint">${extra}</div>` : '');
    paintTree(this.tip);
    this.place(rect);
  }

  private compareLines(a: Item, slot: Slot) {
    const g = this.g;
    const sa = computeStats(g.levels, { ...g.save.equipment, [slot]: a });
    const sb = g.stats;
    const dps = (s: typeof sa) => ((s.dmgMin + s.dmgMax) / 2) * s.atkSpeed * (1 + s.critChance * (s.critMult - 1));
    const rows: [string, number, number, (v: number) => string][] = [
      ['DPS', dps(sa), dps(sb), (v) => v.toFixed(1)],
      ['Life', sa.maxHp, sb.maxHp, (v) => String(Math.round(v))],
      ['Armour', sa.armor, sb.armor, (v) => String(Math.round(v))],
    ];
    return rows
      .filter(([, x, y]) => Math.abs(x - y) > 0.05)
      .map(([n, x, y, f]) => `<div class="${x > y ? 'tt-up' : 'tt-down'}">${n} ${f(x)} (${x > y ? '+' : ''}${f(x - y)})</div>`)
      .join('') || '<div class="tt-dim">No change to key stats</div>';
  }

  text(html: string, rect: DOMRect) {
    this.tip.innerHTML = html;
    paintTree(this.tip);
    this.place(rect);
  }

  private place(rect: DOMRect) {
    const t = this.tip;
    t.style.display = 'block';
    const w = t.offsetWidth, h = t.offsetHeight;
    const { x, y } = tooltipPos(rect, w, h, { w: window.innerWidth, h: window.innerHeight }, sidePanelRect(rect));
    t.style.left = `${x}px`;
    t.style.top = `${y}px`;
  }

  hide() {
    this.tip.style.display = 'none';
  }
}
