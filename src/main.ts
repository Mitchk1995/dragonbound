import { Game } from './game';
import { MODEL_FILES, preloadModels } from './render/registry';

async function boot() {
  await preloadModels(MODEL_FILES);
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const game = new Game(canvas);
  await game.start();
  if (import.meta.env.DEV) (await import('./dev/poseCheck')).installPoseCheck(game);
  const splash = document.getElementById('splash');
  splash?.classList.add('hide');
  setTimeout(() => splash?.remove(), 800);
}

boot();
