/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

// https://vitejs.dev/config/
const electronPlugins =
  process.env.VITEST === 'true'
    ? []
    : [
        electron({
          main: {
            entry: 'electron/main.ts',
          },
          preload: {
            input: 'electron/preload.ts',
          },
          renderer: {},
        }),
      ]

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  plugins: [wasm(), topLevelAwait(), react(), ...electronPlugins],
})
