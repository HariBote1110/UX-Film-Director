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
            vite: {
              build: {
                rollupOptions: {
                  // ws の optional native peer 依存。バンドル時に解決させず、
                  // 実行時の try/catch 付き require（未導入なら JS fallback）に任せる。
                  external: ['bufferutil', 'utf-8-validate'],
                },
              },
            },
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
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts'],
  },
  plugins: [wasm(), topLevelAwait(), react(), ...electronPlugins],
})
