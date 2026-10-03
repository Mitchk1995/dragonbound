import type { Mode } from '../game';

/** Names over heads, ground labels, health bars and floating numbers belong to play; the title and creation screens show the bare scene. */
export const worldTextShows = (mode: Mode): boolean => mode === 'play';
