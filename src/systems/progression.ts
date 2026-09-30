import * as THREE from 'three';
import { computeStats, stanceSplit } from '../combat/stats';
import { abilityFor } from '../data/abilities';
import type { Game } from '../game';
import { HP_XP_PER_DAMAGE, MAX_XP, SKILL_INFO, XP_PER_DAMAGE, levelForXp } from '../progression/skills';
import { SKILLS, type SkillId } from '../types';

export class Progression {
  constructor(private g: Game) {}

  refreshLevels() {
    for (const s of SKILLS) this.g.levels[s] = levelForXp(this.g.save.skills[s]);
  }

  recomputeStats() {
    const g = this.g, p = g.player;
    const zoneKind = g.zoneOrNull?.def.kind;
    const xpBonus = g.save.diaryClaimed.hard && (zoneKind === 'hunt' || zoneKind === 'lair') ? 0.05 : 0;
    g.stats = computeStats(g.levels, g.save.equipment, { weakened: p.weakenedT > 0, warCry: p.warCryT > 0, xpBonus });
    if (p.style !== g.stats.style) p.setStyle(g.stats.style);
    p.maxHp = g.stats.maxHp;
  }

  /** Combat XP for damage dealt, split by stance. Hitpoints always gets its share. */
  combatXp(dealt: number) {
    const g = this.g;
    for (const [skill, xp] of stanceSplit(g.save.stance, g.stats.style, dealt * XP_PER_DAMAGE)) this.grant(skill, xp);
    this.grant('hitpoints', dealt * HP_XP_PER_DAMAGE);
  }

  grant(skill: SkillId, amount: number) {
    const g = this.g;
    if (amount <= 0) return;
    const gained = amount * g.stats.xpMult;
    const before = g.levels[skill];
    g.save.skills[skill] = Math.min(MAX_XP, g.save.skills[skill] + gained);
    g.ui.xpDrop(skill, gained);
    const after = levelForXp(g.save.skills[skill]);
    if (after > before) {
      g.levels[skill] = after;
      this.onLevelUp(skill, after);
    }
  }

  /** Increment a diary/statistics counter. */
  bump(key: string, n = 1) {
    const c = this.g.save.counters;
    c[key] = (c[key] ?? 0) + n;
    this.g.story.checkDiary();
  }

  private onLevelUp(skill: SkillId, level: number) {
    const g = this.g;
    const name = SKILL_INFO[skill].name;
    g.announce(`Congratulations, you've just advanced your ${name} level. You are now level ${level}.`, 'level');
    g.ui.levelBanner(skill, level);
    g.sfx.play('levelup');
    const oldMax = g.stats.maxHp;
    this.recomputeStats();
    if (skill === 'hitpoints') g.player.hp += g.stats.maxHp - oldMax;
    const p = g.player.pos;
    const col = new THREE.Color(SKILL_INFO[skill].color).getHex();
    for (let i = 0; i < 3; i++) {
      g.glow.burst(new THREE.Vector3(p.x, 0.3 + i * 0.8, p.z), { count: 24, color: [0xffe070, 0xffffff, col], speed: 4, up: 6, life: 1.2, gravity: 3, size: 0.12 });
    }
    if (level === 15 && (skill === 'melee' || skill === 'ranged' || skill === 'magic')) {
      const ab = abilityFor(skill, 'E');
      if (ab) g.announce(`New ability unlocked: ${ab.name} (E) for ${name}!`, 'unique');
    }
    if (level >= 10 && (skill === 'melee' || skill === 'ranged' || skill === 'magic') && !g.save.counters.maxStyle10) this.bump('maxStyle10');
    g.story.checkDiary();
    g.dirty = true;
  }
}
