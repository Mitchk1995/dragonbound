import * as THREE from 'three';
import type { HubPlan, Spot } from './plan';
import type { Walk } from './walk';

/**
 * The hub layouts' pictures' overlay (dev only): a name over every station, exit and the castle,
 * and the hero's runs between the busiest stations drawn on the ground with their times. Plain
 * review labels for the owner's pictures, not game text.
 */

type Floor = (x: number, z: number) => number;

const INK: Record<Spot['kind'] | 'time', { fill: string; text: string }> = {
  station: { fill: 'rgba(28,24,20,0.82)', text: '#fff6e2' },
  exit: { fill: 'rgba(22,52,30,0.85)', text: '#dcffd8' },
  castle: { fill: 'rgba(24,36,70,0.85)', text: '#dce8ff' },
  time: { fill: 'rgba(120,80,10,0.9)', text: '#fff3c8' },
};

/** A label: `text` (a line, or several) on a rounded plate, each line `h` metres tall, drawn over everything. */
function tag(text: string | string[], kind: keyof typeof INK, h: number) {
  const lines = typeof text === 'string' ? [text] : text, pad = 22, line = 84, font = '700 64px "Alegreya Sans", "Segoe UI", sans-serif';
  const c = document.createElement('canvas'), ctx = c.getContext('2d')!;
  ctx.font = font;
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + pad * 2, ht = lines.length * line + 12;
  c.width = w;
  c.height = ht;
  ctx.font = font;
  ctx.fillStyle = INK[kind].fill;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, ht - 4, 22);
  ctx.fill();
  ctx.fillStyle = INK[kind].text;
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, pad, 6 + line * (i + 0.5) + 2));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  s.scale.set((h * w) / line, (h * ht) / line, 1);
  s.renderOrder = 20;
  return s;
}

/** The names of a plan's places, `h` metres tall, `lift` metres over the ground. */
export function labels(plan: HubPlan, floor: Floor, h: number, lift: number, rockTop: number) {
  const g = new THREE.Group();
  for (const s of plan.spots) {
    const p = s.tag ?? s.at, sprite = tag(s.label, s.kind, h);
    sprite.position.set(p.x, (s.id === 'castle' ? rockTop + 14 : floor(p.x, p.z)) + lift, p.z);
    g.add(sprite);
  }
  const house = plan.houses[plan.bakery].box;
  const bakery = tag('The finished kit house (the bakery)', 'station', h * 0.8);
  bakery.position.set((house.x0 + house.x1) / 2, floor(house.x0, house.z0) + lift, (house.z0 + house.z1) / 2);
  g.add(bakery);
  return g;
}

/**
 * The runs drawn on the ground, each with its time along it (staggered, so runs sharing a street keep
 * their times apart), the castle and exit runs in their own colours; and a key at `key` listing them all.
 */
export function routes(walks: Walk[], plan: HubPlan, floor: Floor, h: number, key: { x: number; z: number; y: number }) {
  const g = new THREE.Group();
  const colour = (w: Walk) => {
    const to = plan.spots.find((s) => s.id === w.to)!;
    return to.kind === 'castle' ? 0x8fb4ff : to.kind === 'exit' ? 0x8ce08a : 0xffc847;
  };
  walks.forEach((w, k) => {
    const pos: number[] = [];
    for (let i = 1; i < w.path.length; i++) {
      const a = w.path[i - 1], b = w.path[i], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = (-(b.z - a.z) / len) * 0.55, nz = ((b.x - a.x) / len) * 0.55;
      const ya = floor(a.x, a.z) + 0.3, yb = floor(b.x, b.z) + 0.3;
      pos.push(a.x + nx, ya, a.z + nz, b.x + nx, yb, b.z + nz, b.x - nx, yb, b.z - nz, a.x + nx, ya, a.z + nz, b.x - nx, yb, b.z - nz, a.x - nx, ya, a.z - nz);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const line = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colour(w), side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    line.renderOrder = 10;
    g.add(line);
    // The time at the run's halfway point.
    // (Set off to one side of it, so a time never sits on a name or on another run.)
    let half = w.metres * (0.3 + 0.11 * k), at = w.path[0];
    for (let i = 1; i < w.path.length; i++) {
      const a = w.path[i - 1], b = w.path[i], len = Math.hypot(b.x - a.x, b.z - a.z);
      if (half <= len) {
        at = { x: a.x + ((b.x - a.x) * half) / len + ((b.z - a.z) / len) * 3, z: a.z + ((b.z - a.z) * half) / len - ((b.x - a.x) / len) * 3 };
        break;
      }
      half -= len;
    }
    const time = tag(`${Math.round(w.seconds)} s`, 'time', h);
    time.position.set(at.x, floor(at.x, at.z) + 1, at.z);
    g.add(time);
  });
  const name = (id: string) => plan.spots.find((s) => s.id === id)!.label.split(':')[0];
  const list = tag(['Run times (hero at full run)', ...walks.map((w) => `${name(w.from)} to ${name(w.to)}: ${Math.round(w.seconds)} s`)], 'time', h * 0.95);
  list.position.set(key.x, key.y, key.z);
  g.add(list);
  return g;
}

/** Frees an overlay's textures and geometry. */
export function disposeOverlay(g: THREE.Object3D) {
  g.traverse((o) => {
    if (o instanceof THREE.Sprite) {
      o.material.map?.dispose();
      o.material.dispose();
    } else if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  g.removeFromParent();
}
