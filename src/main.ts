import { Game } from './game';
import { preloadBark } from './render/foliage';
import { MODEL_FILES, preloadModels } from './render/registry';
import { loadUiFont } from './ui/uiText';

async function boot() {
  await Promise.all([preloadModels(MODEL_FILES), preloadBark(), loadUiFont()]);
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const game = new Game(canvas);
  await game.start();
  if (import.meta.env.DEV) {
    (await import('./dev/poseCheck')).installPoseCheck(game);
    const inspect = await window.electronAPI?.inspect?.config();
    if (inspect) (await import('./dev/inspect')).runInspect(game, inspect);
  }
  const splash = document.getElementById('splash');
  splash?.classList.add('hide');
  setTimeout(() => splash?.remove(), 800);
}

boot().catch((error) => {
  console.error(error);
  const splash = document.getElementById('splash');
  const message = error instanceof Error && error.message.includes('newer Dragonbound')
    ? 'This progress was saved by a newer Dragonbound. Update the game to continue.'
    : 'Dragonbound could not load your progress. Close and reopen the game to try again.';
  const note = splash?.querySelector('p');
  if (note) note.textContent = message;
  else if (splash) splash.textContent = message;
});
