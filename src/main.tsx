import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { schedulePerformanceHarness } from './perf/schedulePerformanceHarness'
import { useStore } from './store/useStore'

schedulePerformanceHarness()

const urlSearchParams = new URLSearchParams(window.location.search)

if (urlSearchParams.has('videoLoadE2e') || urlSearchParams.has('videoExportE2e')) {
  useStore.getState().initializeProject({
    width: 1920,
    height: 1080,
    fps: 60,
    sampleRate: 48000,
    editorMode: '2d',
  });
}

if (urlSearchParams.has('videoExportE2e')) {
  type VideoExportE2eDurationResult = {
    ok: boolean;
    objectCount: number;
    duration: number;
  };

  (window as typeof window & {
    __UXFD_VIDEO_EXPORT_E2E_SET_VIDEO_DURATION__?: (duration: number) => boolean;
    __UXFD_VIDEO_EXPORT_E2E_PATCH_FIRST_VIDEO__?: (patch: Record<string, unknown>) => boolean;
    __UXFD_VIDEO_EXPORT_E2E_SET_ALL_OBJECT_DURATIONS__?: (duration: number) => VideoExportE2eDurationResult;
  }).__UXFD_VIDEO_EXPORT_E2E_SET_VIDEO_DURATION__ = (duration: number) => {
    const state = useStore.getState();
    const videoObjects = state.objects.filter((object) => object.type === 'video');
    videoObjects.forEach((object) => {
      state.updateObject(object.id, { duration });
    });
    state.setDuration(duration);
    return videoObjects.length > 0;
  };
  (window as typeof window & {
    __UXFD_VIDEO_EXPORT_E2E_SET_ALL_OBJECT_DURATIONS__?: (duration: number) => VideoExportE2eDurationResult;
  }).__UXFD_VIDEO_EXPORT_E2E_SET_ALL_OBJECT_DURATIONS__ = (duration: number) => {
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1;
    const state = useStore.getState();
    state.objects.forEach((object) => {
      const startTime = Number.isFinite(object.startTime) ? Math.max(0, object.startTime) : 0;
      state.updateObject(object.id, {
        duration: Math.max(1 / 60, safeDuration - startTime),
      });
    });
    state.setDuration(safeDuration);
    return {
      ok: state.objects.length > 0,
      objectCount: state.objects.length,
      duration: safeDuration,
    };
  };
  (window as typeof window & {
    __UXFD_VIDEO_EXPORT_E2E_PATCH_FIRST_VIDEO__?: (patch: Record<string, unknown>) => boolean;
    __UXFD_VIDEO_EXPORT_E2E_GET_FIRST_VIDEO__?: () => Record<string, unknown> | null;
  }).__UXFD_VIDEO_EXPORT_E2E_PATCH_FIRST_VIDEO__ = (patch: Record<string, unknown>) => {
    const state = useStore.getState();
    const videoObject = state.objects.find((object) => object.type === 'video');
    if (!videoObject) return false;
    state.updateObject(videoObject.id, patch);
    return true;
  };
  (window as typeof window & {
    __UXFD_VIDEO_EXPORT_E2E_GET_FIRST_VIDEO__?: () => Record<string, unknown> | null;
  }).__UXFD_VIDEO_EXPORT_E2E_GET_FIRST_VIDEO__ = () => {
    const videoObject = useStore.getState().objects.find((object) => object.type === 'video');
    return videoObject ? { ...videoObject } : null;
  };
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
