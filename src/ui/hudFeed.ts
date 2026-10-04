import type { SkillId } from '../types';
import { SKILL_INFO } from '../progression/skills';
import { el, esc } from './dom';
import { icon } from './icons';
import type { Panels } from './panels';
import { xpDropLabel } from './skillGrid';
import { paintTree, setHtml } from './uiText';

/** The HUD's passing news: chat messages, XP drops and the centre-screen banners (level ups, quests, uniques). */
export class HudFeed {
  private xpAcc = new Map<SkillId, { amount: number; t: number }>();
  private $ = <T extends HTMLElement = HTMLElement>(sel: string) => this.root.querySelector(sel) as T;

  constructor(private root: HTMLElement, private panels: Panels) {}

  xpDrop(skill: SkillId, amount: number) {
    // Gather a moment's XP per skill (a swing that hits a pack, its Hitpoints and Defence shares)
    // into one drop each, so a fight doesn't throw up a cloud of tiny numbers.
    const acc = this.xpAcc.get(skill) ?? { amount: 0, t: 0.2 };
    acc.amount += amount;
    this.xpAcc.set(skill, acc);
  }

  /** Release each skill's gathered XP as one drop once its moment has passed. */
  update(dt: number) {
    for (const [skill, acc] of this.xpAcc) {
      acc.t -= dt;
      if (acc.t <= 0) {
        this.spawnXpDrop(skill, acc.amount);
        this.xpAcc.delete(skill);
      }
    }
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

  /** Drop pending XP and clear the banner and drops left over from the zone being left. */
  clear() {
    this.xpAcc.clear();
    for (const selector of ['.banner', '.xpdrops']) {
      const node = this.$(selector);
      if (!node) continue; // The initial zone loads before the HUD is built.
      setHtml(node, '');
      node.classList.remove('show');
    }
  }
}
