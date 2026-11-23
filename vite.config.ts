import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Genera un único archivo HTML autocontenido (sin servidor, funciona sin conexión)
export default defineConfig({
  plugins: [preact(), viteSingleFile()],
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 100000000 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
