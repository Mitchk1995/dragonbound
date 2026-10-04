import { ABILITIES } from '../../data/abilities';
import { BASE_LIST, UNIQUES, TIERS, TIER_ORDER } from '../../data/items';
import { XP_TUNING } from '../../data/tuning';
import { combatLevel } from '../../combat/stats';
import { FUTURE_SKILLS, MAX_LEVEL, SKILL_INFO } from '../../progression/skills';
import { SKILLS, type SkillId } from '../../types';
import { esc, fmt } from '../dom';
import { icon } from '../icons';
import type { Panels } from '../panels';
import { skillTileInfo } from '../skillGrid';

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

/** What each level of a skill unlocks (gear to wield or wear, abilities, tiers to smith, ores to mine), lowest first. */
export function skillMilestones(skill: SkillId) {
  const out: { level: number; text: string }[] = [];
  for (const b of BASE_LIST) if (b.req?.skill === skill && b.req.level > 1) out.push({ level: b.req.level, text: `${b.kind === 'tool' ? 'use' : b.slot === 'weapon' ? 'wield' : 'wear'} ${b.name}` });
  for (const u of Object.values(UNIQUES)) if (u.req?.skill === skill) out.push({ level: u.req.level, text: `use ${u.name}` });
  for (const a of Object.values(ABILITIES)) if (a.style === skill && a.unlock > 1) out.push({ level: a.unlock, text: `unlock ${a.name}` });
  if (skill === 'smithing') for (const t of TIER_ORDER) out.push({ level: TIERS[t].smith, text: `smith ${TIERS[t].name}` });
  if (skill === 'mining') for (const [lvl, ore] of [[15, 'iron'], [30, 'coal'], [32, 'emberite']] as const) out.push({ level: lvl, text: `mine ${ore}` });
  const seen = new Set<string>();
  return out.sort((a, b) => a.level - b.level).filter((m) => !seen.has(m.level + m.text) && seen.add(m.level + m.text));
}

/** The skills tab: combat level and total XP, then the OSRS skill grid with each skill's hover card. */
export function skillsPanel(p: Panels) {
  const { ui, g } = p, s = g.save;
  const el = ui.panel('skills', 'Skills');
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
  ui.body(el, `
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
    b.addEventListener('mouseenter', () => ui.tooltip.text(sumTips[b.dataset.sum!], b.getBoundingClientRect()));
    b.addEventListener('mouseleave', () => ui.tooltip.hide());
  });
  el.querySelectorAll<HTMLElement>('[data-skill]').forEach((row) => {
    const k = row.dataset.skill as SkillId;
    row.addEventListener('mouseenter', () => {
      const t = skillTileInfo(s.skills[k]);
      const ms = skillMilestones(k).filter((m) => m.level > t.level).slice(0, 4);
      const next = t.nextAt === null
        ? '<div class="tt-dim">Mastered.</div>'
        : `<div class="tt-row"><span>Next level at</span><b>${fmt(t.nextAt)}</b></div>
           <div class="tt-row"><span>Remaining</span><b>${fmt(t.remaining)}</b></div>
           <div class="tt-prog" style="--c:${SKILL_INFO[k].color}"><div style="width:${t.frac * 100}%"></div><span>${t.pct}% to level ${t.level + 1}</span></div>`;
      ui.tooltip.text(`<div class="tt-name">${SKILL_INFO[k].name} <span class="tt-lv">${t.label}</span></div>
        <div class="tt-row"><span>XP</span><b>${fmt(t.xp)}</b></div>
        ${next}
        <div class="tt-dim">${SKILL_TRAINING[k]}</div>
        ${ms.length ? `<div class="tt-cmp">${ms.map((m) => `<div><b>${m.level}</b> · ${esc(m.text)}</div>`).join('')}</div>` : ''}`, row.getBoundingClientRect());
    });
    row.addEventListener('mouseleave', () => ui.tooltip.hide());
  });
  el.querySelectorAll<HTMLElement>('[data-future]').forEach((row) => {
    const f = FUTURE_SKILLS[Number(row.dataset.future)];
    row.addEventListener('mouseenter', () => ui.tooltip.text(`<div class="tt-name">${esc(f.name)}</div><div class="tt-dim">Arrives in Chapter ${f.chapter}.</div>`, row.getBoundingClientRect()));
    row.addEventListener('mouseleave', () => ui.tooltip.hide());
  });
}
