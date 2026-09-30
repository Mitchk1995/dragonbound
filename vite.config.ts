import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the built game loads from file:// inside Electron.
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
