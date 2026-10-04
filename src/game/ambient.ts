import type { Game } from '../game';
import { PAL } from '../render/kit';

/** The zone's drifting motes around the hero: embers, void sparks, cave glints or falling ash. */
export class AmbientMotes {
  private t = 0;

  constructor(private readonly g: Game) {}

  update(dt: number) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.05;
    const g = this.g, p = g.player;
    const rx = () => p.x + (Math.random() - 0.5) * 30, rz = () => p.z + (Math.random() - 0.5) * 24;
    switch (g.zone.def.theme.ambient) {
      case 'embers':
        g.glow.spawn(rx(), 0.2 + Math.random() * 3, rz(), 0.6, 0.4 + Math.random() * 0.4, -0.3, 4, 0.05, Math.random() < 0.5 ? PAL.ember : PAL.fire, -0.05, 0);
        break;
      case 'void':
        g.glow.spawn(rx(), 0.3 + Math.random() * 2, rz(), (Math.random() - 0.5) * 0.3, 0.3, (Math.random() - 0.5) * 0.3, 3, 0.05, Math.random() < 0.5 ? 0xb8a0ff : 0x8ad0ff, -0.02, 0);
        break;
      case 'cave':
        g.glow.spawn(rx(), 0.5 + Math.random() * 2.5, rz(), 0.1, 0.05, 0.1, 5, 0.04, 0xffc890, 0, 0);
        break;
      case 'ash':
        g.particles.spawn(rx(), 6, rz(), 0.3, -0.6, 0.1, 6, 0.06, 0xb0b0b0, 0, 0);
        break;
    }
  }
}
