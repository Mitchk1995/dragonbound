export const SAVE_VERSION: 3;
export function isSaveCandidate(raw: unknown): raw is Record<string, unknown>;
export function parseSave(text: string): Record<string, unknown> | null;
