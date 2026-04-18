import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  plugins: [
    react(),
    electron({
      main: {
        // Entry point of the Main Process
        entry: 'electron/main.ts',
      },
      preload: {
        // Entry point of the Preload Script
        input: 'electron/preload.ts',
      },
      // Polyfill the Electron and Node.js built-in modules for Renderer process
      renderer: {},
    }),
  ],
})