import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)) },
  },
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1500 },
});
