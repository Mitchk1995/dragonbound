import { cylinder, type Mesh3, turned } from '../mesh';

/**
 * The street's turned details, in kit units (each standing on y = 0, centred on its footprint): the
 * lamp post, its lantern's glass, and pots (their plants are painted cards: plants.ts). The lantern's
 * iron, the baker's sign and its bracket, and the window boxes are modelled whole (props.ts).
 */

/** The lamp post: a forged post on a moulded foot, a collar and a cap the lantern stands on. */
export function lampPost(hU: number): Mesh3 {
  return turned([
    { r: 0, y: 0 }, { r: 9, y: 0 }, { r: 9, y: 2.6, round: true }, { r: 7.6, y: 4 }, { r: 5.6, y: 8, smooth: true },
    { r: 3.6, y: 14, smooth: true }, { r: 2.6, y: 20 }, { r: 3.6, y: 21 }, { r: 3.6, y: 24 }, { r: 2.1, y: 25 },
    { r: 2.1, y: hU - 9 }, { r: 3.4, y: hU - 8 }, { r: 3.4, y: hU - 5 }, { r: 6.2, y: hU - 3, smooth: true }, { r: 6.8, y: hU - 0.6, round: true }, { r: 6.2, y: hU }, { r: 0, y: hU },
  ], 16);
}

/** The glass of the lantern on the post (its iron is modelled: props.ts), glowing at dusk. */
export const lanternGlass = (): Mesh3 => cylinder(5.2, 16.6, 0, 16, [0, 2.4, 0], false);

/** A clay pot, `rU` across its rim and `hU` tall, a rolled rim and a foot, filled with earth to just under its rim. Returns [pot, earth]. */
export function pot(rU: number, hU: number): [Mesh3, Mesh3] {
  const fill = { r: rU * 0.84, y: hU - 1.5 };
  return [
    turned([
      { r: 0, y: 0 }, { r: rU * 0.62, y: 0 }, { r: rU * 0.66, y: 1.2, round: true }, { r: rU * 0.7, y: 1.8 },
      { r: rU * 0.9, y: hU * 0.8, smooth: true }, { r: rU * 0.92, y: hU - 2.6 }, { r: rU, y: hU - 2 }, { r: rU, y: hU - 0.5, round: true },
      { r: rU * 0.88, y: hU }, fill,
    ], 18),
    // (The earth closes the pot's mouth along its inner rim: the two are one closed shape.)
    turned([fill, { r: 0, y: fill.y }], 18),
  ];
}
