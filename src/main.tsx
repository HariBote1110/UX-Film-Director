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
    const { runExportTests } = await import('./exportTest/exportTestHarness');
    await runExportTests().catch(e => console.error('[ExportTest] 致命的エラー:', e));
  }, 2000);
}

// ── Phase 0: WebCodecs / WebGPU 環境確認（起動時に一度だけ実行）──
;(async () => {
  console.group('[Phase0] 環境確認')

  // WebCodecs VideoDecoder
  if (typeof VideoDecoder === 'undefined') {
    console.error('[Phase0] VideoDecoder: NOT SUPPORTED')
  } else {
    try {
      const r = await VideoDecoder.isConfigSupported({
        codec: 'avc1.42E01E',
        hardwareAcceleration: 'prefer-hardware',
      })
      console.log('[Phase0] VideoDecoder H.264 supported =', r.supported, r)
    } catch (e) {
      console.error('[Phase0] VideoDecoder.isConfigSupported error:', e)
    }
  }

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
