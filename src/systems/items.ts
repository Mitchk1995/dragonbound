import * as THREE from 'three';
import { BELT_PRICES, SHOP, type ShopEntry } from '../data/shop';
import { BASES, PETS, UNIQUES } from '../data/items';
import { GroundItem } from '../entities/groundItem';
import { Pet } from '../entities/pet';
import type { Game } from '../game';
import { itemName, itemReq, itemValue, makeItem, stacksInBank } from '../loot/itemGen';
import { SKILL_INFO } from '../progression/skills';
import { BANK_BASE_SIZE, INVENTORY_SIZE } from '../save/save';
import type { Item, Slot } from '../types';

/** Everything the player owns: ground loot, inventory, equipment, bank, pets, potions. */
export class Items {
  constructor(private g: Game) {}

  // ─── Ground loot ─────────────────────────────────────────────────────────

  drop(item: Item | null, gold: number, fromX: number, fromZ: number, spread: number) {
    const g = this.g;
    const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * spread;
    const spot = g.zone.nav.nearestWalkable(fromX + Math.cos(a) * r, fromZ + Math.sin(a) * r) ?? { x: fromX, z: fromZ };
    const gi = new GroundItem(item, gold, fromX, fromZ, spot.x, spot.z);
    g.zone.items.push(gi);
    g.zone.group.add(gi.group);
    if (item?.rarity === 'unique') {
      g.announce(`Rare drop: ${itemName(item)}!`, 'unique');
      g.hitstop(0.15);
    }
  }

  update(dt: number) {
    const g = this.g, p = g.player;
    for (const it of g.zone.items) {
      if (it.gone) continue;
      if (it.update(dt)) {
        const r = it.item?.rarity;
        if (!it.item) g.sfx.play('gold', 0.6);
        else g.sfx.play(`drop_${r}`, 0.8);
        if (r === 'unique') {
          g.glow.burst(it.group.position.clone().setY(0.5), { count: 60, color: [0xff8a1a, 0xffe080, 0xffffff], speed: 6, up: 8, life: 1.2, gravity: 4, size: 0.14 });
          g.shake(0.3, 0.4);
        } else if (r === 'rare') {
          g.glow.burst(it.group.position.clone().setY(0.4), { count: 20, color: [0xffd84a, 0xffffff], speed: 3, up: 5, life: 0.8, gravity: 4, size: 0.1 });
        }
      }
      if (it.item?.rarity === 'unique' && Math.random() < 0.3) {
        g.glow.spawn(it.x + (Math.random() - 0.5) * 0.4, 0.3, it.z + (Math.random() - 0.5) * 0.4, 0, 2 + Math.random() * 2, 0, 1, 0.08, 0xffb040, 0, 0.5);
      }
      if (!it.item && it.landed && !p.dead && Math.hypot(p.x - it.x, p.z - it.z) < 1.1) this.pickup(it);
    }
    g.zone.items = g.zone.items.filter((it) => {
      if (it.gone) {
        it.group.removeFromParent();
        g.text.removeLabel(it);
      }
      return !it.gone;
    });
  }

  pickup(it: GroundItem) {
    const g = this.g;
    if (it.gone || !it.landed) return;
    if (!it.item) {
      g.save.gold += it.gold;
      it.gone = true;
      g.sfx.play('gold');
      g.text.float(`+${it.gold} gold`, it.x, 1.2, it.z, 'gold');
      g.dirty = true;
      return;
    }
    if (!this.add(it.item)) {
      g.announce("You don't have enough inventory space.", 'deny');
      g.sfx.play('deny');
      return;
    }
    it.gone = true;
    g.sfx.play('pickup');
    if (it.item.unique) this.logCollection(it.item.unique, UNIQUES[it.item.unique].name);
    g.story.onItemGained(it.item.base);
  }

  // ─── Inventory ───────────────────────────────────────────────────────────

  get inv() {
    return this.g.save.inventory;
  }

  freeSlots() {
    return this.inv.filter((i) => !i).length;
  }

  /** Add one item to the first free slot. Returns false if the inventory is full. */
  add(item: Item): boolean {
    const i = this.inv.indexOf(null);
    if (i < 0) return false;
    delete item.qty;
    this.inv[i] = item;
    this.changed();
    return true;
  }

  count(baseId: string) {
    return this.inv.filter((i) => i?.base === baseId).length;
  }

  has(inputs: Record<string, number>) {
    return Object.entries(inputs).every(([id, n]) => this.count(id) >= n);
  }

  /** Remove `n` plain items of a base (prefers un-rolled copies). */
  remove(baseId: string, n: number) {
    for (let k = 0; k < n; k++) {
      let idx = this.inv.findIndex((i) => i?.base === baseId && i.rarity === 'normal');
      if (idx < 0) idx = this.inv.findIndex((i) => i?.base === baseId);
      if (idx >= 0) this.inv[idx] = null;
    }
    this.changed();
  }

  /** Best pickaxe in the inventory or wielded. */
  bestPickaxe(): Item | null {
    const all = [...this.inv, this.g.save.equipment.weapon].filter((i): i is Item => !!i && BASES[i.base]?.model === 'pickaxe' && BASES[i.base]?.kind === 'tool');
    const usable = all.filter((i) => {
      const r = itemReq(i);
      return !r || this.g.levels[r.skill] >= r.level;
    });
    usable.sort((a, b) => (BASES[a.base].swingTicks ?? 9) - (BASES[b.base].swingTicks ?? 9));
    return usable[0] ?? null;
  }

  canEquip(item: Item): string | null {
    const b = BASES[item.base];
    if (b?.kind !== 'gear') return b?.kind === 'tool' ? 'Tools are used straight from your inventory.' : "That isn't something you can wear.";
    const req = itemReq(item);
    if (req && this.g.levels[req.skill] < req.level) {
      const verb = b.slot === 'weapon' ? 'wield' : 'wear';
      return `You need a ${SKILL_INFO[req.skill].name} level of ${req.level} to ${verb} this.`;
    }
    return null;
  }

  equip(index: number) {
    const g = this.g;
    const item = this.inv[index];
    if (!item) return;
    const err = this.canEquip(item);
    if (err) {
      g.announce(err, 'deny');
      g.sfx.play('deny');
      return;
    }
    const slot = BASES[item.base].slot!;
    this.inv[index] = g.save.equipment[slot];
    g.save.equipment[slot] = item;
    this.afterGearChange();
    g.story.onEquip(item);
  }

  unequip(slot: Slot) {
    const g = this.g;
    const item = g.save.equipment[slot];
    if (!item) return;
    const free = this.inv.indexOf(null);
    if (free < 0) {
      g.announce("You don't have enough inventory space.", 'deny');
      return;
    }
    this.inv[free] = item;
    g.save.equipment[slot] = null;
    this.afterGearChange();
  }

  dropFromInventory(index: number) {
    const g = this.g;
    const item = this.inv[index];
    if (!item) return;
    if (BASES[item.base]?.kind === 'quest') {
      g.announce("You can't drop that; you'll need it.", 'deny');
      return;
    }
    this.inv[index] = null;
    const gi = new GroundItem(item, 0, g.player.x, g.player.z, g.player.x + 0.8, g.player.z + 0.4);
    g.zone.items.push(gi);
    g.zone.group.add(gi.group);
    this.changed();
  }

  sort() {
    const order = { unique: 0, rare: 1, magic: 2, normal: 3 };
    const kinds = { gear: 0, tool: 1, material: 2, quest: 3 };
    const items = this.inv.filter(Boolean) as Item[];
    items.sort((a, b) => {
      const ba = BASES[a.base], bb = BASES[b.base];
      return kinds[ba.kind] - kinds[bb.kind] || order[a.rarity] - order[b.rarity] || a.base.localeCompare(b.base);
    });
    this.g.save.inventory = [...items, ...Array(INVENTORY_SIZE - items.length).fill(null)];
    this.changed();
  }

  private afterGearChange() {
    const g = this.g;
    const oldMax = g.stats.maxHp;
    g.prog.recomputeStats();
    g.player.hp = Math.min(g.stats.maxHp, g.player.hp + Math.max(0, g.stats.maxHp - oldMax));
    g.dressHero();
    g.sfx.play('pickup', 0.6, 0.7);
    this.changed();
  }

  changed() {
    this.g.dirty = true;
    this.g.ui.refresh();
  }

  // ─── Bank ────────────────────────────────────────────────────────────────

  bankCapacity() {
    return BANK_BASE_SIZE + (this.g.save.keep.vault_expanded ? 80 : 0);
  }

  private bankPut(item: Item) {
    const bank = this.g.save.bank;
    if (stacksInBank(item)) {
      const stack = bank.find((b) => b.base === item.base && stacksInBank(b));
      if (stack) {
        stack.qty = (stack.qty ?? 1) + (item.qty ?? 1);
        return true;
      }
    }
    if (bank.length >= this.bankCapacity()) return false;
    bank.push({ ...item, qty: stacksInBank(item) ? item.qty ?? 1 : undefined });
    return true;
  }

  deposit(index: number, all = false) {
    const item = this.inv[index];
    if (!item) return;
    const targets = all && stacksInBank(item) ? this.inv.map((it, i) => (it && it.base === item.base && stacksInBank(it) ? i : -1)).filter((i) => i >= 0) : [index];
    for (const i of targets) {
      if (!this.bankPut(this.inv[i]!)) {
        this.g.announce('Your bank is full.', 'deny');
        break;
      }
      this.inv[i] = null;
    }
    this.g.sfx.play('pickup', 0.5, 1.2);
    this.changed();
  }

  depositAll() {
    for (let i = 0; i < this.inv.length; i++) {
      const it = this.inv[i];
      if (!it) continue;
      if (!this.bankPut(it)) {
        this.g.announce('Your bank is full.', 'deny');
        break;
      }
      this.inv[i] = null;
    }
    this.g.sfx.play('pickup', 0.5, 1.2);
    this.changed();
  }

  withdraw(bankIndex: number, n = 1) {
    const bank = this.g.save.bank;
    const entry = bank[bankIndex];
    if (!entry) return;
    let taken = 0;
    while (taken < n && this.freeSlots() > 0 && bank[bankIndex] === entry) {
      const slot = this.inv.indexOf(null);
      if ((entry.qty ?? 1) > 1) {
        entry.qty!--;
        this.inv[slot] = { ...makeItem(entry.base), ilvl: entry.ilvl };
      } else {
        const it = { ...entry };
        delete it.qty;
        this.inv[slot] = it;
        bank.splice(bankIndex, 1);
      }
      taken++;
    }
    if (!taken) this.g.announce("You don't have enough inventory space.", 'deny');
    this.changed();
  }

  bankCount(baseId: string) {
    return this.g.save.bank.filter((b) => b.base === baseId).reduce((s, b) => s + (b.qty ?? 1), 0);
  }

  /** Remove materials from inventory first, then the bank. Used by keep restorations. */
  spendAnywhere(baseId: string, n: number) {
    let need = n;
    const inInv = Math.min(need, this.count(baseId));
    if (inInv) this.remove(baseId, inInv);
    need -= inInv;
    const bank = this.g.save.bank;
    for (let i = bank.length - 1; i >= 0 && need > 0; i--) {
      const b = bank[i];
      if (b.base !== baseId) continue;
      const q = b.qty ?? 1;
      const take = Math.min(q, need);
      need -= take;
      if (q - take <= 0) bank.splice(i, 1);
      else b.qty = q - take;
    }
    this.changed();
  }

  totalCount(baseId: string) {
    return this.count(baseId) + this.bankCount(baseId);
  }

  // ─── Shop ────────────────────────────────────────────────────────────────

  shopPrice(entry: ShopEntry) {
    if (entry.special === 'belt') return BELT_PRICES[this.g.save.potionMax] ?? null;
    return entry.price;
  }

  buy(entryIndex: number) {
    const g = this.g;
    const entry = SHOP[entryIndex];
    const price = this.shopPrice(entry);
    if (price === null) {
      g.announce('Your potion belt is already as big as it gets.', 'deny');
      return;
    }
    if (g.save.gold < price) {
      g.announce("You don't have enough gold.", 'deny');
      g.sfx.play('deny');
      return;
    }
    if (entry.special === 'belt') {
      g.save.potionMax++;
      g.save.potions = g.save.potionMax;
    } else if (!this.add(makeItem(entry.id))) {
      g.announce("You don't have enough inventory space.", 'deny');
      return;
    }
    g.save.gold -= price;
    g.sfx.play('gold');
    this.changed();
  }

  sell(index: number) {
    const g = this.g;
    const item = this.inv[index];
    if (!item) return;
    const kind = BASES[item.base]?.kind;
    if (item.rarity === 'unique' || kind === 'quest') {
      g.announce("The Quartermaster won't take that. It's far too precious.", 'deny');
      return;
    }
    const value = itemValue(item);
    this.inv[index] = null;
    g.save.gold += value;
    g.sfx.play('gold');
    g.text.float(`+${value} gold`, g.player.x, 2.4, g.player.z, 'gold');
    this.changed();
  }

  // ─── Collection log & pets ───────────────────────────────────────────────

  logCollection(id: string, name: string) {
    const g = this.g;
    const first = !g.save.collection[id];
    g.save.collection[id] = (g.save.collection[id] ?? 0) + 1;
    if (first) g.announce(`New item added to your collection log: ${name}`, 'unique');
  }

  gainPet(id: string) {
    const g = this.g;
    g.announce("You have a funny feeling like you're being followed.", 'unique');
    g.sfx.play('drop_unique');
    this.logCollection(id, PETS[id].name);
    if (!g.save.pets.includes(id)) g.save.pets.push(id);
    this.setPet(id);
  }

  setPet(id: string | null) {
    const g = this.g;
    if (g.pet) g.pet.obj.removeFromParent();
    g.pet = null;
    g.save.activePet = id;
    if (!id) return;
    g.pet = new Pet(id, PETS[id]?.model ?? 'whelp');
    g.pet.pos.copy(g.player.pos).add(new THREE.Vector3(1, 0, 1));
    g.scene.add(g.pet.obj);
  }

  // ─── Potions ─────────────────────────────────────────────────────────────

  drinkPotion() {
    const g = this.g, p = g.player;
    if (p.dead || p.potionCd > 0) return;
    if (g.save.potions <= 0) {
      g.announce('No potions left. They refill as you slay monsters, or back at the keep.', 'deny');
      g.sfx.play('deny');
      return;
    }
    if (p.hp >= g.stats.maxHp) {
      g.sfx.play('deny', 0.5);
      return;
    }
    g.save.potions--;
    p.potionCd = 1;
    p.healT = 1.5;
    p.healRate = (g.stats.maxHp * 0.45) / 1.5;
    g.sfx.play('potion');
    g.glow.burst(p.pos.clone().setY(1), { count: 16, color: [0xff4a6a, 0xff9ab0], speed: 1.5, up: 3, life: 0.8, gravity: -1, size: 0.1 });
  }
}
