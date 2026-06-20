/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { fileURLToPath, URL } from 'node:url'

const mp4boxModulePath = fileURLToPath(
  new URL('./node_modules/mp4box/dist/mp4box.all.mjs', import.meta.url)
)

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
  resolve: {
    alias: {
      mp4box: mp4boxModulePath,
    },
  },
  optimizeDeps: {
    entries: ['index.html'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  plugins: [wasm(), topLevelAwait(), react(), ...electronPlugins],
})
