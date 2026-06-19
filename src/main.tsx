import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { schedulePerformanceHarness } from './perf/schedulePerformanceHarness'

schedulePerformanceHarness()

// ?exportTest=1 または VITE_EXPORT_TEST=1 でエクスポートテストを自動実行
if (
  import.meta.env.VITE_EXPORT_TEST === '1' ||
  new URLSearchParams(window.location.search).has('exportTest')
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
