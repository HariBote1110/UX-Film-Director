import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Mobile deck UI sub-app (Remote_Control_Deck_Plan.md Phase 3).
// Built with `npm run remote-deck:build`; the output in dist/ is served
// by electron/remoteDeckServer.ts. Uses relative asset paths because the
// page is served from an arbitrary LAN host/port.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
