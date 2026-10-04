import { SLOTS, type Slot } from '../../types';
import { itemSlot } from '../dom';
import { icon } from '../icons';
import type { Panels } from '../panels';

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

/** The equipment tab: the paper doll with what's worn, and the hero's stats beneath. */
export function equipmentPanel(p: Panels) {
  const { ui, g } = p, s = g.save;
  const el = ui.panel('equipment', 'Equipment');
  if (!el) return;
  const cell = (sl: Slot) => `<div class="eq eq-${sl}">${itemSlot(s.equipment[sl], `data-eq="${sl}"`, '', icon(`slot_${sl}`, 34))}</div>`;
  const st = g.stats;
  ui.body(el, `
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
      if (it) ui.tooltip.item(it, c.getBoundingClientRect(), false, 'Click: take off');
      else ui.tooltip.text(`<div class="tt-name">${SLOT_LABEL[sl]}</div><div class="tt-dim">Empty. Click gear in your inventory to wear it.</div>`, c.getBoundingClientRect());
    });
    c.addEventListener('mouseleave', () => ui.tooltip.hide());
    c.addEventListener('mousedown', () => {
      ui.tooltip.hide();
      if (s.equipment[sl]) g.items.unequip(sl);
    });
  });
}
