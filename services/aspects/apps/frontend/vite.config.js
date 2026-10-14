import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

export default defineConfig({
  base: '/games/aspects/',
  plugins: [react()],
  resolve: {
    alias: {
      '@aspects/engine': path.join(root, 'packages/engine/src/index.ts'),
      '@aspects/cards':  path.join(root, 'packages/cards/src/index.ts'),
      '@aspects/shared': path.join(root, 'packages/shared/src/index.ts'),
      '@aspects/bot':    path.join(root, 'packages/bot/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/games/aspects/api': 'http://localhost:8010',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});