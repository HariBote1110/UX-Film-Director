/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
const electronPlugins =
  process.env.VITEST === 'true'
    ? []
    : [
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
      ]

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/psdParser.perf.test.ts'],
  },
  plugins: [react(), ...electronPlugins],
})