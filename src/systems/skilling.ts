import { BASES } from '../data/items';
import { GEM_CHANCE, GEM_TABLE, GOLEM_CHANCE, mineChance, ORES } from '../data/ores';
import { masterworkChance, RECIPES, type Recipe } from '../data/recipes';
import { weighted } from '../core/rng';
import { XP_TUNING } from '../data/tuning';
import type { Interactable } from '../entities/interactable';
import type { Game } from '../game';
import { makeItem, makeMasterwork } from '../loot/itemGen';

export const TICK = 0.6;

type Action =
  | { kind: 'mine'; node: Interactable; wait: number }
  | { kind: 'craft'; recipe: Recipe; left: number; wait: number; station: Interactable };

/** OSRS-style tick skilling: mining rocks, smelting and smithing make-X queues. */
export class Skilling {
  action: Action | null = null;
  private tickT = 0;
  private swingAnim = 0;
  /** Set while auto-walking to the next rock, so the chat isn't spammed. */
  private autoHop = false;

  constructor(private g: Game) {}

  get busy() {
    return !!this.action;
  }

  stop() {
    if (!this.action) return;
    this.action = null;
    this.g.player.toolOverride(null);
    this.g.player.anim.attack = -1;
  }

  /** Taking damage interrupts gathering, like OSRS. Crafting in the keep can't be hit anyway. */
  interrupt() {
    if (this.action?.kind === 'mine') this.stop();
  }

  startMining(node: Interactable) {
    const g = this.g;
    const ore = ORES[node.id];
    if (g.levels.mining < ore.level) {
      g.announce(`You need a Mining level of ${ore.level} to mine this rock.`, 'deny');
      g.sfx.play('deny');
      return;
    }
    const pick = g.items.bestPickaxe();
    if (!pick) {
      g.announce('You need a pickaxe to mine this rock. The Quartermaster sells them.', 'deny');
      g.sfx.play('deny');
      return;
    }
    if (g.items.freeSlots() === 0) {
      g.announce('Your inventory is too full to hold any more ore.', 'deny');
      return;
    }
    if (node.state === 'depleted') {
      g.announce('There is currently no ore available in this rock.', 'info');
      return;
    }
    // The first swing takes a full swing interval, so hopping between rocks is no faster than staying put.
    this.action = { kind: 'mine', node, wait: BASES[pick.base].swingTicks ?? 5 };
    g.player.faceTo(node.x, node.z, true);
    g.player.toolOverride(pick.base);
    if (!this.autoHop) g.announce('You swing your pickaxe at the rock.', 'info');
    this.autoHop = false;
  }

  startCraft(recipeId: string, qty: number, station: Interactable) {
    const g = this.g;
    const r = RECIPES[recipeId];
    const err = this.craftError(r);
    if (err) {
      g.announce(err, 'deny');
      g.sfx.play('deny');
      return;
    }
    this.action = { kind: 'craft', recipe: r, left: qty, wait: r.ticks, station };
    g.player.faceTo(station.x, station.z, true);
    g.ui.closeCraftMenu();
  }

  craftError(r: Recipe): string | null {
    const g = this.g;
    if (g.levels.smithing < r.level) return `You need a Smithing level of ${r.level} to make that.`;
    if (r.needs && !g.save.keep[r.needs]) return 'The forge needs restoring before it can work this metal.';
    if (!g.items.has(r.inputs)) return "You don't have the materials for that.";
    return null;
  }

  update(dt: number) {
    this.tickT += dt;
    this.swingAnim = Math.max(0, this.swingAnim - dt * 2.2);
    if (this.action) {
      const p = this.g.player;
      p.anim.attackKind = 'swing';
      p.anim.attack = this.swingAnim > 0 ? 1 - this.swingAnim : -1;
    }
    while (this.tickT >= TICK) {
      this.tickT -= TICK;
      this.tick();
    }
  }

  private tick() {
    // Rocks respawn on the same clock whether or not we're skilling.
    for (const n of this.g.zone.interactables) {
      if (n.kind === 'rock' && n.state === 'depleted' && --n.respawnTicks <= 0) n.setState('full');
    }
    const a = this.action;
    if (!a) return;
    if (--a.wait > 0) return;
    if (a.kind === 'mine') this.mineTick(a);
    else this.craftTick(a);
  }

  private mineTick(a: Extract<Action, { kind: 'mine' }>) {
    const g = this.g;
    const ore = ORES[a.node.id];
    const pick = g.items.bestPickaxe();
    if (!pick || a.node.state === 'depleted') {
      this.stop();
      return;
    }
    a.wait = BASES[pick.base].swingTicks ?? 5;
    this.swingAnim = 1;
    g.sfx.play('hit', 0.5, 1.6 + Math.random() * 0.2);
    g.fx.sparks(a.node.x, 0.8, a.node.z, ore.color);
    if (Math.random() >= mineChance(ore, g.levels.mining)) return;

    const extra = g.save.diaryClaimed.medium && g.zone.def.id === 'mine' && Math.random() < 0.1 ? 1 : 0;
    for (let k = 0; k <= extra; k++) {
      if (!g.items.add(makeItem(ore.ore))) break;
      g.prog.grant('mining', ore.xp * XP_TUNING.mining);
      g.prog.bump(`mine:${ore.ore}`);
    }
    g.sfx.play('pickup', 0.6, 0.8);
    g.story.onItemGained(ore.ore);
    if (Math.random() < GEM_CHANCE) {
      const gem = weighted(Math.random, GEM_TABLE);
      if (g.items.add(makeItem(gem))) {
        g.announce(`You just found ${BASES[gem].name.replace('Uncut ', 'an uncut ').toLowerCase()}!`, 'unique');
        g.items.logCollection(gem, BASES[gem].name);
      }
    }
    if (Math.random() < GOLEM_CHANCE) g.items.gainPet('rock_golem');
    a.node.deplete(ore.respawnTicks);
    this.stop();
    if (g.items.freeSlots() === 0) {
      g.announce('Your inventory is too full to hold any more ore.', 'deny');
      return;
    }
    // Rocks deplete after each ore (OSRS). To keep mining click-and-wait, move on to the
    // nearest ready rock of the same kind if there's one close by.
    const next = g.zone.interactables
      .filter((n) => n.kind === 'rock' && n.id === a.node.id && n.state === 'full')
      .sort((x, y) => g.player.distTo(x) - g.player.distTo(y))[0];
    if (next && g.player.distTo(next) < 9) {
      this.autoHop = true;
      g.player.interact(next);
    }
  }

  private craftTick(a: Extract<Action, { kind: 'craft' }>) {
    const g = this.g;
    const r = a.recipe;
    const err = this.craftError(r);
    if (err) {
      if (a.left > 0 && err.startsWith("You don't")) g.announce('You have run out of materials.', 'info');
      this.stop();
      return;
    }
    for (const [id, n] of Object.entries(r.inputs)) g.items.remove(id, n);
    const mw = Math.random() < masterworkChance(g.levels.smithing, r);
    const item = mw ? makeMasterwork(Math.random, r.out, g.levels.smithing) : makeItem(r.out);
    g.items.add(item);
    g.prog.grant('smithing', r.xp * XP_TUNING.smithing);
    this.swingAnim = 1;
    if (r.station === 'anvil') {
      g.sfx.play('hit', 0.7, 1.9);
      g.fx.sparks(a.station.x, 1.0, a.station.z);
      g.prog.bump(`smith:${r.out}`);
      if (r.tier) g.prog.bump(`smithTier:${r.tier}`);
    } else {
      g.sfx.play('fireball', 0.5, 1.4);
      g.prog.bump(`smelt:${r.out}`);
    }
    if (mw) {
      g.announce(`Masterwork! Your ${BASES[r.out].name} came out exceptional.`, 'unique');
      g.sfx.play('drop_rare');
    }
    g.story.onItemGained(r.out);
    a.left--;
    a.wait = r.ticks;
    if (a.left <= 0) this.stop();
  }
}
