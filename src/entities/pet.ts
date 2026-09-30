import { makeModel } from '../render/registry';
import type { NavGrid } from '../world/navgrid';
import { Unit } from './unit';

/** Cosmetic follower. Dragons hover at the player's shoulder; ground pets trot behind. */
export class Pet extends Unit {
  private t = Math.random() * 10;
  private flies: boolean;

  constructor(public petId: string, modelName: string) {
    super(makeModel(modelName), 0.3, 1);
    this.flies = modelName === 'whelp';
    if (this.flies) this.anim.fly = 0.35;
  }

  follow(dt: number, owner: Unit, nav: NavGrid) {
    this.t += dt;
    const side = Math.sin(owner.facing + Math.PI / 2);
    const back = Math.cos(owner.facing + Math.PI / 2);
    const tx = owner.x - Math.sin(owner.facing) * 1.4 + side * 0.9;
    const tz = owner.z - Math.cos(owner.facing) * 1.4 + back * 0.9;
    const d = Math.hypot(tx - this.x, tz - this.z);
    let moved = 0;
    if (d > 8) {
      this.pos.set(tx, 0, tz);
    } else if (d > 0.3) {
      const speed = Math.min(12, d * 3);
      const step = Math.min(d, speed * dt);
      this.pos.x += ((tx - this.x) / d) * step;
      this.pos.z += ((tz - this.z) / d) * step;
      this.faceTo(tx, tz);
      moved = step;
    } else {
      this.faceTo(owner.x + Math.sin(owner.facing) * 5, owner.z + Math.cos(owner.facing) * 5);
    }
    this.anim.speed = dt > 0 ? moved / dt : 0;
    this.updateCommon(dt, nav);
    if (this.flies) this.model.root.position.y = 0.6 + Math.sin(this.t * 2.5) * 0.15;
  }
}
