import type { Rng } from '../core/rng';

export interface Hit {
  amount: number;
  crit: boolean;
}

export function rollHit(
  rng: Rng,
  min: number,
  max: number,
  mult: number,
  critChance: number,
  critMult: number,
  forceCrit = false,
): Hit {
  const crit = forceCrit || rng() < critChance;
  const raw = (min + (max - min) * rng()) * mult * (crit ? critMult : 1);
  return { amount: Math.max(1, Math.round(raw)), crit };
}

/** Armour gives diminishing returns: 50 armour halves incoming damage. */
export function mitigate(amount: number, armor: number): number {
  const reduced = amount * (1 - armor / (armor + 50));
  return Math.max(1, Math.round(reduced));
}
