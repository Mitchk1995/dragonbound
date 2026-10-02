import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the built game loads from file:// inside Electron.
  base: './',
  server: { watch: { ignored: ['**/inspect/**', '**/release/**', '**/docs/**', '**/tools/blender/previews/**'] } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'], maxWorkers: 1, fileParallelism: false },
});
