import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { schedulePerformanceHarness } from './perf/schedulePerformanceHarness'
import { useStore } from './store/useStore'

schedulePerformanceHarness()

const urlSearchParams = new URLSearchParams(window.location.search)

if (urlSearchParams.has('videoLoadE2e')) {
  useStore.getState().initializeProject({
    width: 1920,
    height: 1080,
    fps: 60,
    sampleRate: 48000,
    editorMode: '2d',
  });
}

// ?exportTest=1 または VITE_EXPORT_TEST=1 でエクスポートテストを自動実行
if (
  import.meta.env.VITE_EXPORT_TEST === '1' ||
  urlSearchParams.has('exportTest')
) {
  window.setTimeout(async () => {
    const { runExportTests } = await import(/* @vite-ignore */ './exportTest/exportTestHarness');
    await runExportTests().catch(e => console.error('[ExportTest] 致命的エラー:', e));
  }, 2000);
}

// ── Phase 0: WebGPU 環境確認（起動時に一度だけ実行）──
;(async () => {
  console.group('[Phase0] 環境確認')

  // WebGPU navigator.gpu
  if (!navigator.gpu) {
    console.error('[Phase0] navigator.gpu: NOT AVAILABLE')
  } else {
    const adapter = await navigator.gpu.requestAdapter()
    console.log('[Phase0] GPUAdapter =', adapter ? 'OK' : 'null')
    if (adapter) {
      const device = await adapter.requestDevice()
      console.log('[Phase0] GPUDevice =', device ? 'OK' : 'null')
      console.log('[Phase0] importExternalTexture =', typeof device.importExternalTexture === 'function')
    }
  }

  console.groupEnd()
})()
// ─────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
