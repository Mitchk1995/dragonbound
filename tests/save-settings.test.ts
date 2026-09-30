import { describe, expect, it } from 'vitest';
import { loadSave, newSave } from '../src/save/save';

describe('saved graphics settings', () => {
  it.each(['high', 'medium', 'low'])('preserves the %s preset on load', async (graphics) => {
    const save = await loadSave({ read: async () => JSON.stringify({ ...newSave(), settings: { volume: 0.4, graphics } }), write: async () => {}, describe: () => 'test storage' });
    expect(save!.settings.graphics).toBe(graphics);
    expect(save!.settings.volume).toBe(0.4);
  });

  it.each([undefined, null, '', 'ultra', 'constructor', '__proto__', 2, false, {}, ['low']])('falls back to high for %j', async (graphics) => {
    const save = await loadSave({ read: async () => JSON.stringify({ ...newSave(), settings: { volume: 0.4, graphics } }), write: async () => {}, describe: () => 'test storage' });
    expect(save!.settings.graphics).toBe('high');
    expect(save!.settings.volume).toBe(0.4);
  });
});
