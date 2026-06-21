import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { schedulePerformanceHarness } from './perf/schedulePerformanceHarness'
import { useStore } from './store/useStore'
import { buildAviUtlAudioSphereObject } from './utils/audioSphereObjectFactory'
import { buildGetColorDotFieldObject } from './utils/getColorDotFieldObjectFactory'
import { buildHksyCheckerGridObject } from './utils/hksyCheckerGridObjectFactory'
import type { AudioObject, AudioVisualizationObject, ParticleObject, ShapeObject } from './types'

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
  type VideoExportE2eGeneratedEffectsResult = {
    ok: boolean;
    audioTargetFound: boolean;
    addedIds: string[];
    timelineNames: string[];
    objectCount: number;
  };

  (window as typeof window & {
    __UXFD_VIDEO_EXPORT_E2E_SET_VIDEO_DURATION__?: (duration: number) => boolean;
    __UXFD_VIDEO_EXPORT_E2E_PATCH_FIRST_VIDEO__?: (patch: Record<string, unknown>) => boolean;
    __UXFD_VIDEO_EXPORT_E2E_SET_ALL_OBJECT_DURATIONS__?: (duration: number) => VideoExportE2eDurationResult;
    __UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS__?: (duration: number) => VideoExportE2eGeneratedEffectsResult;
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
    __UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS__?: (duration: number) => VideoExportE2eGeneratedEffectsResult;
  }).__UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS__ = (duration: number) => {
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1;
    const state = useStore.getState();
    const audioTarget = state.objects.find((object): object is AudioObject => object.type === 'audio') ?? null;
    const maxLayer = state.objects.reduce((current, object) => Math.max(current, object.layer), 0);
    const addedIds: string[] = [];
    const timelineNames: string[] = [];
    const audioVisualisation: AudioVisualizationObject = {
      id: 'e2e-audio-waveform-r',
      type: 'audio_visualization',
      name: 'Audio waveform R',
      layer: Math.min(99, maxLayer + 1),
      startTime: 0,
      duration: safeDuration,
      x: 960,
      y: 860,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      enableAnimation: false,
      endX: 960,
      endY: 860,
      easing: 'linear',
      targetAudioId: audioTarget?.id ?? null,
      targetLayer: audioTarget?.layer,
      visualizationType: 'waveform',
      color: '#00ff88',
      thickness: 2,
      width: 960,
      height: 160,
      amplitude: 1.25,
    };
    const particle: ParticleObject = {
      id: 'e2e-standard-particle',
      type: 'particle',
      name: '標準パーティクル',
      layer: Math.min(99, maxLayer + 2),
      startTime: 0,
      duration: safeDuration,
      x: 960,
      y: 540,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 0.9,
      enableAnimation: false,
      endX: 960,
      endY: 540,
      easing: 'linear',
      width: 720,
      height: 420,
      particleCount: 64,
      seed: 93,
      spread: 180,
      speed: 140,
      size: 7,
      colour: '#ffffff',
      lifetimeSeconds: 1.5,
    };
    const getColorDotField = {
      ...buildGetColorDotFieldObject({
        id: 'e2e-getcolor-v2r-dot-field',
        projectWidth: 1920,
        projectHeight: 1080,
        startTime: 0,
        layer: Math.min(99, maxLayer + 3),
      }),
      name: 'GetColor V2R ドットフィールド',
    };
    const hksyCheckerGrid = {
      ...buildHksyCheckerGridObject({
        id: 'e2e-hksy-checker-grid',
        projectWidth: 1920,
        projectHeight: 1080,
        startTime: 0,
        layer: Math.min(99, maxLayer + 4),
      }),
      name: 'hksyチェッカー/グリッド',
    };
    const spotLightProbe: ShapeObject = {
      id: 'e2e-93-spotlight-probe',
      type: 'shape',
      name: '93 SpotLight Probe',
      layer: Math.min(99, maxLayer + 5),
      startTime: 0,
      duration: safeDuration,
      x: 880,
      y: 420,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      enableAnimation: false,
      endX: 880,
      endY: 420,
      easing: 'linear',
      shapeType: 'rect',
      width: 240,
      height: 160,
      fill: '#111111',
      filters: [{
        id: 'e2e-93-spotlight-filter',
        type: 'spot_light',
        enabled: true,
        params: {
          centreX: 0.5,
          centreY: 0.5,
          radius: 0.75,
          intensity: 0.9,
          colour: '#fff4c2',
        },
      }],
    };
    const audioSphere = audioTarget ? {
      ...buildAviUtlAudioSphereObject({
        id: 'e2e-93-audio-sphere',
        projectWidth: 1920,
        projectHeight: 1080,
        startTime: 0,
        layer: Math.min(99, maxLayer + 6),
      }),
      targetAudioId: audioTarget.id,
      targetLayer: audioTarget.layer,
      name: '93音声玉',
      duration: safeDuration,
    } : null;
    state.addObject(audioVisualisation);
    state.addObject(particle);
    state.addObject(getColorDotField);
    state.addObject(hksyCheckerGrid);
    state.addObject(spotLightProbe);
    addedIds.push(audioVisualisation.id, particle.id, getColorDotField.id, hksyCheckerGrid.id, spotLightProbe.id);
    timelineNames.push(audioVisualisation.name, particle.name, getColorDotField.name, hksyCheckerGrid.name, spotLightProbe.name);
    if (audioSphere) {
      state.addObject(audioSphere);
      addedIds.push(audioSphere.id);
      timelineNames.push(audioSphere.name);
    }
    return {
      ok: addedIds.length >= 5,
      audioTargetFound: audioTarget !== null,
      addedIds,
      timelineNames,
      objectCount: useStore.getState().objects.length,
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
