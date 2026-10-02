import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { fingerprint, launchPlan } = createRequire(import.meta.url)('../tools/play.cjs');
let dir: string;
const put = (file: string, value = 'initial') => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), value, 'utf8');
};
const prepared = () => {
  const plan = launchPlan(dir, {}, 'test-runtime');
  return { dependencies: plan.dependencies, build: plan.build, output: fingerprint(dir, ['dist']) };
};

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'dragonbound-launch-test-'));
  for (const file of ['package.json', 'package-lock.json', 'src/main.ts', 'public/models/hero.glb', 'electron/save-format.mjs', 'index.html', 'vite.config.ts', 'tsconfig.json', 'dist/index.html', 'dist/game.js']) put(file);
  for (const name of ['electron', 'vite', 'typescript', 'three']) put(`node_modules/${name}/package.json`);
  put(`node_modules/electron/dist/${process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron'}`);
});
afterEach(() => {
  if (!path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(dir).startsWith('dragonbound-launch-test-')) throw Error('Unexpected temporary directory');
  rmSync(dir, { recursive: true, force: true });
});

describe('prepared game launch', () => {
  it('skips installation and build when the game and prepared output are unchanged', () => {
    expect(launchPlan(dir, prepared(), 'test-runtime')).toMatchObject({ install: false, rebuild: false });
  });
  it.each(['src/main.ts', 'public/models/hero.glb', 'electron/save-format.mjs', 'vite.config.ts', 'index.html'])('rebuilds after a game input changes (%s)', file => {
    const cache = prepared();
    put(file, 'updated');
    expect(launchPlan(dir, cache, 'test-runtime')).toMatchObject({ install: false, rebuild: true });
  });
  it('notices newly added and deleted assets', () => {
    const cache = prepared();
    put('public/icons/new.png');
    expect(launchPlan(dir, cache, 'test-runtime').rebuild).toBe(true);
    const newer = prepared();
    rmSync(path.join(dir, 'public/icons/new.png'));
    expect(launchPlan(dir, newer, 'test-runtime').rebuild).toBe(true);
  });
  it.each(['package.json', 'package-lock.json'])('reinstalls and rebuilds when dependencies change (%s)', file => {
    const cache = prepared();
    put(file, 'new dependencies');
    expect(launchPlan(dir, cache, 'test-runtime')).toMatchObject({ install: true, rebuild: true });
  });
  it('prepares again when the runtime changes or an installed dependency disappears', () => {
    const cache = prepared();
    expect(launchPlan(dir, cache, 'different-runtime').install).toBe(true);
    rmSync(path.join(dir, 'node_modules/three/package.json'));
    expect(launchPlan(dir, cache, 'test-runtime').install).toBe(true);
  });
  it('repairs missing or changed built output', () => {
    const cache = prepared();
    put('dist/game.js', 'damaged');
    expect(launchPlan(dir, cache, 'test-runtime').rebuild).toBe(true);
    rmSync(path.join(dir, 'dist/index.html'));
    expect(launchPlan(dir, cache, 'test-runtime').rebuild).toBe(true);
  });
  it('ignores design documents and scratch captures while still checking game files', () => {
    const cache = prepared();
    put('docs/DESIGN_DECISIONS.md', 'approved design');
    put('inspect/capture.png', 'temporary');
    expect(launchPlan(dir, cache, 'test-runtime')).toMatchObject({ install: false, rebuild: false });
  });
});
