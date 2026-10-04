import type { Game } from '../game';

/** How long the Veilstone takes (the medium diary halves it). */
const recallSecs = (g: Game) => (g.save.diaryClaimed.medium ? 1.5 : 3);

/** Start the Veilstone recall home (interrupted by moving, being hit or dying). */
export function recall(g: Game) {
  if (g.mode !== 'play' || g.player.dead || g.traveling) return;
  if (g.zone.def.kind === 'hub') {
    g.announce('You are already home.', 'info');
    return;
  }
  if (g.recallT >= 0) return;
  g.recallT = recallSecs(g);
  g.skilling.stop();
  g.player.stop();
  g.announce('You grip the Veilstone...', 'info');
}

export function updateRecall(g: Game, dt: number) {
  if (g.recallT < 0) return;
  const p = g.player;
  if (p.cmd.kind !== 'none' || p.sinceHit < 0.05 || p.dead) {
    g.recallT = -1;
    g.announce('Your recall was interrupted.', 'deny');
    return;
  }
  g.recallT -= dt;
  g.fx.recalling(p.x, p.z, dt, 1 - g.recallT / recallSecs(g));
  if (g.recallT <= 0) {
    g.recallT = -1;
    g.story.onRecall();
    g.travel('keep');
  }
}

export function onPlayerDied(g: Game) {
  const p = g.player;
  p.hp = 0;
  p.dead = true;
  p.deadT = 0;
  p.action = null;
  p.dash = null;
  p.stop();
  g.skilling.stop();
  g.recallT = -1;
  g.deathT = 0;
  g.save.stats.deaths++;
  g.announce('Oh dear, you are dead!', 'death');
  g.sfx.play('roar', 0.3, 2);
  g.dirty = true;
}

/** Three seconds after death: wake in the keep, weakened for a while. */
export function updateDeath(g: Game, raw: number) {
  if (!g.player.dead) return;
  g.deathT += raw;
  if (g.deathT > 3 && !g.traveling) respawn(g);
}

function respawn(g: Game) {
  const p = g.player;
  p.dead = false;
  p.anim.dead = -1;
  p.weakenedT = 10;
  g.prog.recomputeStats();
  p.hp = g.stats.maxHp;
  g.travel('keep');
  g.announce('You wake in the keep, shaken. Weakened for 10s (−25% damage).', 'info');
}
