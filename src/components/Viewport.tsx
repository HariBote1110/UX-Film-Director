import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject, VideoObject, GradientFill, ObjectFilter, PsdObject } from '../types';
import { ThreeStageViewport, type BillboardTextureEntry, type ThreeStageViewportHandle } from './ThreeStageViewport';
import { createShadowGraphics } from '../utils/pixiUtils';
import { shallow } from 'zustand/shallow';

import { usePixiInteraction } from '../hooks/usePixiInteraction';
import { useProjectExport } from '../hooks/useProjectExport';
import { useVisionRealtimeDetection } from '../hooks/useVisionRealtimeDetection';
import { getGroupTransforms, getLipSyncViseme, updatePixiContent, applyObjectEffects, getVibrationOffset, applyGroupGradientEffect } from '../utils/pixiRenderHelper';
import type { VideoFrameTextureState, ExportOverlayCanvas } from '../utils/pixiRenderHelper';
import { evaluateObjectPositionAtTime } from '../utils/keyframes';
import { getEnabledObjectFiltersInOrder, getFadeOpacityMultiplier, getPrimaryWipeFilter } from '../utils/filterStack';
import { useTranslation } from '../i18n';
import { computePreviewDisplayScale } from '../utils/previewDisplayScale';
import {
  destroyExportOverlayCanvases,
  destroyVideoFrameTextureState,
  useCanvasVideoUploadForPixiPreview,
} from '../utils/videoElementForPixi';
import { visionNormBoundingBoxToVideoLocalRect } from '../utils/visionTrackingGeometry';
import type { ResizeCorner } from '../utils/transformGeometry';
import {
  buildSharedRendererPreviewSession,
  type SharedRendererPreviewSession,
} from '../utils/sharedRendererPreviewSession';
import { buildSharedRendererPresenterSessionKey } from '../utils/sharedRendererPresenterSessionKey';
import { buildSharedRendererVideoMediaReadiness } from '../utils/sharedRendererVideoMediaReadiness';
import {
  getSharedRendererSolidSwatchCssColour,
  type SharedRendererPreviewPresenterControl,
} from '../utils/sharedRendererPreviewPresenterController';
import { writeSharedRendererPresenterDiagnostics } from '../utils/sharedRendererPresenterDiagnostics';
import {
  startSharedRendererViewportPresenter,
} from '../utils/sharedRendererViewportPresenterOrchestration';
import type { SharedRendererViewportVideoDecodeJob } from '../utils/sharedRendererViewportVideoUpload';
import type { ProjectExportRustFrameSourceContext } from '../utils/projectExportFrameCanvas';
import { buildViewportRustExportFrameSource } from '../utils/viewportRustExportFrameSource';
import { shouldMountSharedRendererSurfaceCanvas } from '../utils/sharedRendererSurfaceMount';

const GROUP_GRADIENT_COMPONENT_PREFIX = 'group-gradient-component-';
const RESIZE_HANDLE_PREFIX = 'resize-handle-';
/** 角ハンドルのスクリーン上の目標サイズ（px）。 */
const RESIZE_HANDLE_SCREEN_PX = 10;

const RESIZE_CORNER_CURSORS: Record<ResizeCorner, string> = {
  'top-left': 'nwse-resize',
  'bottom-right': 'nwse-resize',
  'top-right': 'nesw-resize',
  'bottom-left': 'nesw-resize',
};

type BoundsLike = { x: number; y: number; width: number; height: number };

const boundsIntersect = (a: BoundsLike, b: BoundsLike) => (
  a.x <= b.x + b.width
  && a.x + a.width >= b.x
  && a.y <= b.y + b.height
  && a.y + a.height >= b.y
);

const buildConnectedComponents = (containers: PIXI.Container[]): number[][] => {
  if (containers.length <= 1) return containers.length === 1 ? [[0]] : [];

  const boundsList = containers.map((container) => container.getBounds());
  const visited = new Array(containers.length).fill(false);
  const components: number[][] = [];

  for (let startIndex = 0; startIndex < containers.length; startIndex += 1) {
    if (visited[startIndex]) continue;

    const queue: number[] = [startIndex];
    visited[startIndex] = true;
    const component: number[] = [];

    while (queue.length > 0) {
      const currentIndex = queue.shift()!;
      component.push(currentIndex);

      for (let nextIndex = 0; nextIndex < containers.length; nextIndex += 1) {
        if (visited[nextIndex]) continue;
        if (!boundsIntersect(boundsList[currentIndex], boundsList[nextIndex])) continue;
        visited[nextIndex] = true;
        queue.push(nextIndex);
      }
    }

    components.push(component);
  }

  return components;
};

const flattenGroupGradientComponents = (groupContainer: PIXI.Container) => {
  const componentContainers = groupContainer.children.filter((child) => (
    typeof child.label === 'string' && child.label.startsWith(GROUP_GRADIENT_COMPONENT_PREFIX)
  )) as PIXI.Container[];

  componentContainers.forEach((componentContainer) => {
    const members = componentContainer.removeChildren() as PIXI.Container[];
    members.forEach((member) => {
      groupContainer.addChild(member);
    });
    applyGroupGradientEffect(componentContainer, undefined);
    groupContainer.removeChild(componentContainer);
    componentContainer.destroy({ children: false });
  });
};

const Viewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportShellRef = useRef<HTMLDivElement>(null);
  const threeStageRef = useRef<ThreeStageViewportHandle | null>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const worldContainerRef = useRef<PIXI.Container | null>(null);
  const sharedRendererSurfaceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sharedRendererPresenterControlRef = useRef<SharedRendererPreviewPresenterControl | null>(null);
  const sharedRendererPresenterSessionKeyRef = useRef<string | null>(null);
  const sharedRendererVideoDecodeJobsRef = useRef<SharedRendererViewportVideoDecodeJob[]>([]);
  const sharedRendererVideoDecodeRequestIdRef = useRef(0);
  const pixiObjectsRef = useRef<Map<string, PIXI.Container>>(new Map());
  const groupContainersRef = useRef<Map<string, PIXI.Container>>(new Map());
  
  const textureCacheRef = useRef<Map<string, PIXI.Texture>>(new Map());
  const loadingUrlsRef = useRef<Set<string>>(new Set());
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const videoFrameTexturesRef = useRef<Map<string, VideoFrameTextureState>>(new Map());
  const sharedRendererSolidColourObjectIdsRef = useRef<Set<string>>(new Set());
  const sharedRendererVideoObjectIdsRef = useRef<Set<string>>(new Set());
  /** VideoDecoder ハイブリッドパス: エクスポート時にフレームを注入するためのマップ */
  const exportFrameOverridesRef = useRef<Map<string, ImageBitmap>>(new Map());
  /** exportFrameOverrides を Pixi テクスチャに変換する OffscreenCanvas キャッシュ */
  const exportOverlayCanvasesRef = useRef<Map<string, ExportOverlayCanvas>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const videoPlayPromisesRef = useRef<Map<string, Promise<void> | null>>(new Map());
  
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());

  const [renderTick, setRenderTick] = useState(0);
  const [pixiReady, setPixiReady] = useState(false);
  const [panelSize, setPanelSize] = useState({ w: 0, h: 0 });
  const sharedRendererPreviewEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_PREVIEW === '1';
  const sharedRendererExportEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_EXPORT === '1';
  const sharedRendererDiagnosticSwatchEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_DIAGNOSTIC_SWATCH === '1';
  const sharedRendererVideoCutoverEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER === '1';
  const [sharedRendererGpuStatus, setSharedRendererGpuStatus] = useState({
    webGpuAvailable: false,
    fallbackAdapter: false,
  });
  const [sharedRendererPreviewSession, setSharedRendererPreviewSession] = useState<SharedRendererPreviewSession | null>(null);

  const updateSharedRendererSolidColourObjectIds = useCallback((objectIds: string[]) => {
    const current = sharedRendererSolidColourObjectIdsRef.current;
    const next = new Set(objectIds);
    const unchanged = current.size === next.size && [...current].every((objectId) => next.has(objectId));
    if (unchanged) return;
    sharedRendererSolidColourObjectIdsRef.current = next;
    setRenderTick((previous) => previous + 1);
  }, []);

  const updateSharedRendererVideoObjectIds = useCallback((objectIds: string[]) => {
    const current = sharedRendererVideoObjectIdsRef.current;
    const next = new Set(objectIds);
    const unchanged = current.size === next.size && [...current].every((objectId) => next.has(objectId));
    if (unchanged) return;
    sharedRendererVideoObjectIdsRef.current = next;
    setRenderTick((previous) => previous + 1);
  }, []);

  const { 
    currentTime, objects, selectedIds, selectedId, clearSelection,
    projectSettings, isPlaying, isExporting,
    layers,
    camera,
    stageCamera3D,
    setStageCamera3D,
    setEditorMode,
    isSnapshotRequested, finishSnapshot,
    language,
    previewDisplayMode,
    setPreviewDisplayMode,
    visionDetectionPreviewEnabled,
    visionDetectionOverlay
  } = useStore((state) => ({
    currentTime: state.currentTime,
    objects: state.objects,
    selectedIds: state.selectedIds,
    selectedId: state.selectedId,
    clearSelection: state.clearSelection,
    projectSettings: state.projectSettings,
    isPlaying: state.isPlaying,
    isExporting: state.isExporting,
    layers: state.layers,
    camera: state.camera,
    stageCamera3D: state.stageCamera3D,
    setStageCamera3D: state.setStageCamera3D,
    setEditorMode: state.setEditorMode,
    isSnapshotRequested: state.isSnapshotRequested,
    finishSnapshot: state.finishSnapshot,
    language: state.language,
    previewDisplayMode: state.previewDisplayMode,
    setPreviewDisplayMode: state.setPreviewDisplayMode,
    visionDetectionPreviewEnabled: state.visionDetectionPreviewEnabled,
    visionDetectionOverlay: state.visionDetectionOverlay,
  }), shallow);

  useVisionRealtimeDetection();

  const editorMode = projectSettings.editorMode ?? '2d';

  const selectedBillboardPsdId = useMemo(() => {
    if (editorMode !== '3d_stage') return null;
    const candidates = selectedIds.length > 0 ? selectedIds : (selectedId ? [selectedId] : []);
    for (const cid of candidates) {
      const o = objects.find((x) => x.id === cid);
      if (
        o?.type === 'psd'
        && o.worldPlacement?.enabled === true
        && layers[o.layer]?.locked !== true
      ) {
        return cid;
      }
    }
    return null;
  }, [editorMode, selectedIds, selectedId, objects, layers]);

  const handleBillboardWorldMove = useCallback((id: string, position: { x: number; y: number; z: number }) => {
    const o = useStore.getState().objects.find((x) => x.id === id);
    if (!o || o.type !== 'psd' || !o.worldPlacement) return;
    useStore.getState().updateObject(id, {
      worldPlacement: { ...o.worldPlacement, position: { ...position } },
    });
  }, []);
  
  const t = useTranslation(language);
  
  const latestObjectsRef = useRef(objects);
  latestObjectsRef.current = objects;

  const {
    onDragStart, onDragMove, onDragEnd, dragRef,
    onResizeStart, onResizeMove, onResizeEnd, resizeRef,
  } = usePixiInteraction(latestObjectsRef);

  useEffect(() => {
    const el = viewportShellRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const applySize = () => {
      setPanelSize({ w: el.clientWidth, h: el.clientHeight });
    };

    const ro = new ResizeObserver(() => {
      applySize();
    });
    ro.observe(el);
    applySize();
    return () => {
      ro.disconnect();
    };
  }, []);

  const displayScale = computePreviewDisplayScale(
    previewDisplayMode,
    projectSettings.width,
    projectSettings.height,
    panelSize.w,
    panelSize.h
  );
  // renderScene からリサイズハンドルの見かけサイズ補正に用いるため ref で保持する。
  const displayScaleRef = useRef(displayScale);
  displayScaleRef.current = displayScale;
  const sharedRendererCssReferenceColour = getSharedRendererSolidSwatchCssColour();
  const shouldMountSharedRendererSurface = shouldMountSharedRendererSurfaceCanvas({
    previewEnabled: sharedRendererPreviewEnabled,
    exportEnabled: sharedRendererExportEnabled,
  });

  useEffect(() => {
    if (!sharedRendererPreviewEnabled && !sharedRendererExportEnabled) return;
    let cancelled = false;

    const probeWebGpu = async () => {
      const gpu = navigator.gpu;
      if (!gpu) {
        if (!cancelled) setSharedRendererGpuStatus({ webGpuAvailable: false, fallbackAdapter: false });
        return;
      }

      try {
        const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (cancelled) return;
        if (!adapter) {
          setSharedRendererGpuStatus({ webGpuAvailable: false, fallbackAdapter: false });
          return;
        }
        const fallbackAdapter = (adapter as unknown as { isFallbackAdapter?: boolean }).isFallbackAdapter === true;
        setSharedRendererGpuStatus({ webGpuAvailable: true, fallbackAdapter });
      } catch {
        if (!cancelled) setSharedRendererGpuStatus({ webGpuAvailable: false, fallbackAdapter: false });
      }
    };

    void probeWebGpu();
    return () => {
      cancelled = true;
    };
  }, [sharedRendererExportEnabled, sharedRendererPreviewEnabled]);

  // --- Initialize Pixi App ---
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    const app = new PIXI.Application();
    const { width, height } = useStore.getState().projectSettings;

    // 【重要】autoStart: false に設定。
    // PixiJSの勝手なTickerループを止め、React側の制御下でのみ描画させることで
    // 二重描画によるCPU負荷を回避する。
    app.init({
        width,
        height,
        backgroundColor: '#1e1e1e',
        preference: 'webgpu',
        autoStart: false, // 自動描画停止
        sharedTicker: false
    }).then(() => {
      if (cancelled || !containerRef.current || containerRef.current.hasChildNodes()) {
        app.destroy(true, { children: true, texture: true });
        return;
      }
      if (containerRef.current) {
        containerRef.current.appendChild(app.canvas);
        pixiAppRef.current = app;
        setPixiReady(true);

        // ── Phase 0: PixiJS レンダラー種別確認 ────────────────────
        {
          // PixiJS 8: renderer.type は RendererType enum (number)。webgpu=2, webgl=1
          const rendererType = (app.renderer as unknown as { type: number }).type;
          const rendererName = rendererType === 2 ? 'webgpu' : rendererType === 1 ? 'webgl' : `unknown(${rendererType})`;
          console.log('[Phase0] PixiJS renderer =', rendererName, '(raw:', rendererType, ')');

          const gpuDevice = (app.renderer as unknown as { gpu?: { device?: GPUDevice } }).gpu?.device;
          if (gpuDevice) {
            console.log('[Phase0] importExternalTexture available =', typeof gpuDevice.importExternalTexture === 'function');
          } else {
            console.warn('[Phase0] GPUDevice not accessible from PixiJS renderer');
          }
        }
        // ───────────────────────────────────────────────────────────
        app.stage.eventMode = 'static';
        app.stage.hitArea = app.screen;
        app.stage.sortableChildren = true;
        const world = new PIXI.Container();
        world.label = 'world-root';
        world.sortableChildren = true;
        app.stage.addChildAt(world, 0);
        worldContainerRef.current = world;
        app.stage.on('pointerdown', (e) => {
          if (useStore.getState().isExporting) return;
          const target = e.target as PIXI.Container;
          const label = typeof target?.label === 'string' ? target.label : '';
          if (e.target === app.stage || label === 'world-root') clearSelection();
        });

        // 初回描画
        app.render();
      }
    });
    return () => {
      cancelled = true;
      setPixiReady(false);
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true, { children: true, texture: true });
        pixiAppRef.current = null;
        worldContainerRef.current = null;
        pixiObjectsRef.current.clear();
        groupContainersRef.current.clear();
        textureCacheRef.current.clear();
        loadingUrlsRef.current.clear();
        videoElementsRef.current.forEach(video => { video.pause(); video.src = ""; video.load(); });
        videoElementsRef.current.clear();
        videoFrameTexturesRef.current.forEach((entry) => {
          destroyVideoFrameTextureState(entry);
        });
        videoFrameTexturesRef.current.clear();
        destroyExportOverlayCanvases(exportOverlayCanvasesRef.current);
        audioElementsRef.current.forEach(audio => { audio.pause(); audio.src = ""; audio.load(); });
        audioElementsRef.current.clear();
      }
    };
  }, []);

  useEffect(() => {
    if (!pixiReady) return;
    const app = pixiAppRef.current;
    if (!app?.canvas) return;

    app.renderer.resize(projectSettings.width, projectSettings.height);
    app.stage.hitArea = app.screen;

    const w = projectSettings.width;
    const h = projectSettings.height;
    app.canvas.style.width = `${w * displayScale}px`;
    app.canvas.style.height = `${h * displayScale}px`;
    app.render();
  }, [pixiReady, projectSettings.width, projectSettings.height, displayScale]);

  useEffect(() => {
    if (isExporting) return;
    destroyExportOverlayCanvases(exportOverlayCanvasesRef.current);
  }, [isExporting]);

  // --- Audio Buffer Loading ---
  useEffect(() => {
    const loadBuffers = async () => {
        const hasViz = objects.some(o => o.type === 'audio_visualization');
        if (!hasViz) return;

        const audioContext = new AudioContext();
        for (const obj of objects) {
            if (obj.type === 'audio' && obj.src && !audioBuffersRef.current.has(obj.id)) {
                try {
                    const resp = await fetch(obj.src);
                    const ab = await resp.arrayBuffer();
                    const decoded = await audioContext.decodeAudioData(ab);
                    audioBuffersRef.current.set(obj.id, decoded);
                } catch (e) {
                    console.error("Failed to load audio buffer:", e);
                }
            }
        }
        audioContext.close();
    };
    loadBuffers();
  }, [objects]);

  const publishSharedRendererPreviewSession = useCallback((time: number, currentObjects: TimelineObject[]) => {
    if (!sharedRendererPreviewEnabled) return;

    const session = buildSharedRendererPreviewSession({
      enabled: true,
      projectSettings,
      layers,
      objects: currentObjects,
      time,
      editorMode,
      isExporting,
      webGpuAvailable: sharedRendererGpuStatus.webGpuAvailable,
      fallbackAdapter: sharedRendererGpuStatus.fallbackAdapter,
    });
    const diagnosticsWindow = window as unknown as {
      __UXFD_SHARED_RENDERER_PREVIEW_PLAN__?: unknown;
      __UXFD_SHARED_RENDERER_PREVIEW_SURFACE_GATE__?: unknown;
      __UXFD_SHARED_RENDERER_PRESENTATION_CONTRACT__?: unknown;
      __UXFD_SHARED_RENDERER_VIDEO_MEDIA_READINESS__?: unknown;
    };
    diagnosticsWindow.__UXFD_SHARED_RENDERER_PREVIEW_PLAN__ = session.plan;
    diagnosticsWindow.__UXFD_SHARED_RENDERER_PREVIEW_SURFACE_GATE__ = session.surfaceGate;
    diagnosticsWindow.__UXFD_SHARED_RENDERER_PRESENTATION_CONTRACT__ = session.presentationContract;
    const videoReadiness = session.surfaceGate.ok
      ? buildSharedRendererVideoMediaReadiness({
        media: session.surfaceGate.media,
        videoElements: videoElementsRef.current,
      })
      : { readyCount: 0, pendingCount: 0, missingCount: 0, videos: [] };
    diagnosticsWindow.__UXFD_SHARED_RENDERER_VIDEO_MEDIA_READINESS__ = videoReadiness;

    document.documentElement.dataset.uxfdSharedRendererPlanMode = session.plan.mode;
    document.documentElement.dataset.uxfdSharedRendererSurfaceGate = session.surfaceGate.ok
      ? 'ok'
      : session.surfaceGate.reason;
    document.documentElement.dataset.uxfdSharedRendererCanvasColourSpace = session.presentationContract.canvas.colorSpace;
    document.documentElement.dataset.uxfdSharedRendererCanvasAlphaMode = session.presentationContract.canvas.alphaMode;
    document.documentElement.dataset.uxfdSharedRendererVideoReadyCount = String(videoReadiness.readyCount);
    document.documentElement.dataset.uxfdSharedRendererVideoPendingCount = String(videoReadiness.pendingCount);
    document.documentElement.dataset.uxfdSharedRendererVideoMissingCount = String(videoReadiness.missingCount);

    const surfaceCanvas = sharedRendererSurfaceCanvasRef.current;
    if (surfaceCanvas) {
      surfaceCanvas.dataset.sharedRendererSurfaceGate = session.surfaceGate.ok
        ? 'ok'
        : session.surfaceGate.reason;
    }
    if (session.surfaceGate.ok && surfaceCanvas) {
      if (surfaceCanvas.width !== session.surfaceGate.canvas.width) {
        surfaceCanvas.width = session.surfaceGate.canvas.width;
      }
      if (surfaceCanvas.height !== session.surfaceGate.canvas.height) {
        surfaceCanvas.height = session.surfaceGate.canvas.height;
      }
    }

    const nextPresenterKey = buildSharedRendererPresenterSessionKey(session);
    if (sharedRendererPresenterSessionKeyRef.current !== nextPresenterKey) {
      sharedRendererPresenterSessionKeyRef.current = nextPresenterKey;
      setSharedRendererPreviewSession(session);
    }
  }, [
    editorMode,
    isExporting,
    layers,
    projectSettings,
    sharedRendererGpuStatus.fallbackAdapter,
    sharedRendererGpuStatus.webGpuAvailable,
    sharedRendererPreviewEnabled,
  ]);

  useEffect(() => {
    publishSharedRendererPreviewSession(currentTime, objects);
  }, [currentTime, objects, publishSharedRendererPreviewSession]);

  useEffect(() => {
    if (!sharedRendererPreviewEnabled || !sharedRendererPreviewSession) {
      sharedRendererPresenterControlRef.current?.dispose();
      sharedRendererPresenterControlRef.current = null;
      sharedRendererVideoDecodeJobsRef.current = [];
      updateSharedRendererSolidColourObjectIds([]);
      updateSharedRendererVideoObjectIds([]);
      return;
    }

    const surfaceCanvas = sharedRendererSurfaceCanvasRef.current;
    const rootDataset = document.documentElement.dataset as Record<string, string | undefined>;
    if (!surfaceCanvas) {
      writeSharedRendererPresenterDiagnostics(rootDataset, {
        status: 'fallback',
        reason: 'surfaceCanvasUnavailable',
      });
      updateSharedRendererSolidColourObjectIds([]);
      updateSharedRendererVideoObjectIds([]);
      return;
    }

    sharedRendererPresenterControlRef.current?.dispose();
    sharedRendererPresenterControlRef.current = null;
    if (!sharedRendererVideoCutoverEnabled) {
      sharedRendererVideoDecodeJobsRef.current = [];
    }
    updateSharedRendererSolidColourObjectIds([]);
    updateSharedRendererVideoObjectIds([]);

    let cancelled = false;
    let currentControl: SharedRendererPreviewPresenterControl | null = null;
    const datasets = [
      rootDataset,
      surfaceCanvas.dataset as Record<string, string | undefined>,
    ];

    void startSharedRendererViewportPresenter({
      canvas: surfaceCanvas,
      session: sharedRendererPreviewSession,
      datasets,
      diagnosticSwatchEnabled: sharedRendererDiagnosticSwatchEnabled,
      videoCutoverEnabled: sharedRendererVideoCutoverEnabled,
      activeVideoDecodeJob: sharedRendererVideoCutoverEnabled
        ? sharedRendererVideoDecodeJobsRef.current[0] ?? null
        : null,
      activeVideoDecodeJobs: sharedRendererVideoCutoverEnabled
        ? sharedRendererVideoDecodeJobsRef.current
        : [],
      requestId: (sharedRendererVideoDecodeRequestIdRef.current += 1),
      onVideoDecodeJobResolved: (job) => {
        sharedRendererVideoDecodeJobsRef.current = job ? [job] : [];
      },
      onVideoDecodeJobsResolved: (jobs) => {
        sharedRendererVideoDecodeJobsRef.current = jobs;
      },
    }).then(({ control, activeVideoDecodeJobs }) => {
      if (cancelled) {
        control.dispose();
        return;
      }
      sharedRendererVideoDecodeJobsRef.current = activeVideoDecodeJobs;
      currentControl = control;
      sharedRendererPresenterControlRef.current = control;
      updateSharedRendererSolidColourObjectIds(control.ok ? control.solidColourOwnership.solidColourObjectIds : []);
      updateSharedRendererVideoObjectIds(control.ok ? control.videoOwnership.videoObjectIds : []);
    }).catch(() => {
      if (cancelled) return;
      updateSharedRendererSolidColourObjectIds([]);
      updateSharedRendererVideoObjectIds([]);
      datasets.forEach((dataset) => {
        writeSharedRendererPresenterDiagnostics(dataset, {
          status: 'fallback',
          reason: 'presenterStartFailed',
        });
      });
    });

    return () => {
      cancelled = true;
      currentControl?.dispose();
      if (sharedRendererPresenterControlRef.current === currentControl) {
        sharedRendererPresenterControlRef.current = null;
      }
    };
  }, [sharedRendererDiagnosticSwatchEnabled, sharedRendererPreviewEnabled, sharedRendererPreviewSession, sharedRendererVideoCutoverEnabled, updateSharedRendererSolidColourObjectIds, updateSharedRendererVideoObjectIds]);

  // --- Main Render Logic ---
  const renderScene = useCallback((time: number, currentObjects: TimelineObject[]) => {
    const app = pixiAppRef.current;
    if (!app) return;

    const rendererType = (app.renderer as unknown as { type: number }).type;
    const useCanvasVideoUpload = useCanvasVideoUploadForPixiPreview(rendererType);

    const currentPixiObjects = pixiObjectsRef.current;
    const currentVideoElements = videoElementsRef.current;
    const currentAudioElements = audioElementsRef.current;
    const currentGroupContainers = groupContainersRef.current;
    const visibleObjects = currentObjects.filter((obj) => {
      if (layers[obj.layer]?.visible === false) return false;
      return time >= obj.startTime && time < obj.startTime + obj.duration;
    });
    const visibleGroupIds = new Set(
      visibleObjects
        .map((obj) => obj.groupId)
        .filter((groupId): groupId is string => typeof groupId === 'string' && groupId.trim() !== '')
    );

    // 1. Cleanup
    currentPixiObjects.forEach((container, id) => {
      if (!visibleObjects.find(obj => obj.id === id)) {
        container.parent?.removeChild(container);
        container.destroy({ children: true });
        currentPixiObjects.delete(id);
      }
    });
    const worldRoot = worldContainerRef.current;
    currentGroupContainers.forEach((groupContainer, groupId) => {
      if (visibleGroupIds.has(groupId)) return;
      groupContainer.parent?.removeChild(groupContainer);
      groupContainer.destroy({ children: false });
      currentGroupContainers.delete(groupId);
    });
    currentVideoElements.forEach((video, id) => {
        if (!visibleObjects.find(obj => obj.id === id && obj.type === 'video')) {
            video.pause(); video.src = ""; video.load(); currentVideoElements.delete(id); videoPlayPromisesRef.current.delete(id);
            const frameTexture = videoFrameTexturesRef.current.get(id);
            if (frameTexture) {
                destroyVideoFrameTextureState(frameTexture, video);
                videoFrameTexturesRef.current.delete(id);
            }
            const exportOverlay = exportOverlayCanvasesRef.current.get(id);
            if (exportOverlay) {
                exportOverlay.texture.destroy(true);
                exportOverlayCanvasesRef.current.delete(id);
            }
        }
    });
    currentAudioElements.forEach((audio, id) => {
        if (!visibleObjects.find(obj => obj.id === id && obj.type === 'audio')) {
            audio.pause(); audio.src = ""; audio.load(); currentAudioElements.delete(id);
        }
    });

    visibleGroupIds.forEach((groupId) => {
      if (currentGroupContainers.has(groupId)) return;
      const groupContainer = new PIXI.Container();
      groupContainer.label = `group-${groupId}`;
      groupContainer.sortableChildren = true;
      if (worldRoot) worldRoot.addChild(groupContainer);
      currentGroupContainers.set(groupId, groupContainer);
    });

    // 2. Render visible objects
    visibleObjects.forEach(obj => {
      // Audio Logic
      if (obj.type === 'audio') {
        let audio = currentAudioElements.get(obj.id);
        if (!audio) {
            audio = new Audio(); audio.src = obj.src; audio.muted = obj.muted; audio.volume = obj.volume;
            audio.crossOrigin = 'anonymous'; audio.preload = 'auto'; currentAudioElements.set(obj.id, audio);
        }
        audio.volume = obj.volume; audio.muted = obj.muted;
        const offset = obj.offset || 0; const audioLocalTime = (time - obj.startTime) + offset;
        if (!isExporting) {
            if (isPlaying) {
                if (audio.paused) { const p = audio.play(); if(p) p.catch(()=>{}); }
                if (Math.abs(audio.currentTime - audioLocalTime) > 0.2) audio.currentTime = audioLocalTime;
            } else {
                if (!audio.paused) audio.pause();
                if (Math.abs(audio.currentTime - audioLocalTime) > 0.05) audio.currentTime = audioLocalTime;
            }
        }
        return; 
      }

      const isSelected = selectedIds.includes(obj.id);
      if (obj.type === 'group_control' && !isSelected && isPlaying) return;

      const lipSyncViseme = getLipSyncViseme(obj, time, currentObjects);

      let container = currentPixiObjects.get(obj.id);
      if (!container) {
        container = new PIXI.Container();
        container.label = obj.id; container.eventMode = 'static'; container.cursor = 'pointer';
        container.on('pointerdown', (e) => onDragStart(e, obj.id));
        container.on('pointerup', onDragEnd); container.on('pointerupoutside', onDragEnd); container.on('globalpointermove', onDragMove);
        container.on('pointerup', onResizeEnd); container.on('pointerupoutside', onResizeEnd); container.on('globalpointermove', onResizeMove);
        currentPixiObjects.set(obj.id, container);
      }
      container.cursor = layers[obj.layer]?.locked ? 'not-allowed' : 'pointer';
      if (obj.groupId && currentGroupContainers.has(obj.groupId)) {
        const groupParent = currentGroupContainers.get(obj.groupId)!;
        const isAlreadyInsideGroup = container.parent === groupParent || container.parent?.parent === groupParent;
        if (!isAlreadyInsideGroup) {
          container.parent?.removeChild(container);
          groupParent.addChild(container);
        }
      } else if (worldRoot && container.parent !== worldRoot) {
        container.parent?.removeChild(container);
        worldRoot.addChild(container);
      }

      // Content Update
      const content = updatePixiContent(obj, container, time, {
          textureCache: textureCacheRef.current,
          loadingUrls: loadingUrlsRef.current,
          videoElements: videoElementsRef.current,
          videoFrameTextures: videoFrameTexturesRef.current,
          audioBuffers: audioBuffersRef.current,
          allObjects: currentObjects,
          isExporting,
          isPlaying,
          setRenderTick,
          exportFrameOverrides: exportFrameOverridesRef.current,
          exportOverlayCanvases: exportOverlayCanvasesRef.current,
          sharedRendererSolidColourObjectIds: sharedRendererSolidColourObjectIdsRef.current,
          sharedRendererVideoObjectIds: sharedRendererVideoObjectIdsRef.current,
          useCanvasVideoUpload,
      });

      const shadowFilters = getEnabledObjectFiltersInOrder(obj).filter((filter): filter is Extract<ObjectFilter, { type: 'shadow' }> => {
        return filter.type === 'shadow';
      });
      const currentShadowNodes = container.children.filter((child) => (child.label ?? '').startsWith('shadow'));
      currentShadowNodes.forEach((shadowNode) => {
        container.removeChild(shadowNode);
        shadowNode.destroy({ children: true });
      });
      if (content && shadowFilters.length > 0) {
        const shadowWidth = (content as any).width || (obj as any).width || 100;
        const shadowHeight = (content as any).height || (obj as any).height || 100;
        shadowFilters.forEach((shadowFilter, index) => {
          const shadow = createShadowGraphics(obj, shadowWidth, shadowHeight, {
            enabled: true,
            ...shadowFilter.params
          });
          if (!shadow) return;
          shadow.label = `shadow-${index}`;
          container.addChildAt(shadow, Math.min(index, container.children.length));
        });
      }

      applyObjectEffects(container, obj);

      // Vision detection preview (cat/dog boxes on video — single-frame, no tracking)
      const visionPreviewOn = useStore.getState().visionDetectionPreviewEnabled;
      const visionOverlay = useStore.getState().visionDetectionOverlay;
      const existingDet = container.children.find((c) => c.label === 'vision-detection-overlay');
      const showVisionDet =
        !isExporting
        && !isSnapshotRequested
        && visionPreviewOn
        && visionOverlay !== null
        && obj.type === 'video'
        && visionOverlay.videoId === obj.id
        && visionOverlay.observations.length > 0;

      if (!showVisionDet) {
        if (existingDet) {
          container.removeChild(existingDet);
          existingDet.destroy({ children: true });
        }
      } else {
        const video = obj as VideoObject;
        let detG = existingDet as PIXI.Graphics | undefined;
        if (!detG || detG.destroyed) {
          detG = new PIXI.Graphics();
          detG.label = 'vision-detection-overlay';
          detG.eventMode = 'none';
          container.addChild(detG);
        }
        detG.clear();
        const localT = time - video.startTime;
        const clampedLocal = Math.max(0, Math.min(video.duration, localT));
        const mediaT = (video.offset ?? 0) + clampedLocal;
        const stale = Math.abs(mediaT - visionOverlay!.mediaTimeSec) > 0.35;
        detG.alpha = stale ? 0.42 : 1;

        const strokeWidth = 5;
        const colours = [0x22c55e, 0x38bdf8, 0xfbbf24, 0xf472b6, 0xa78bfa];
        visionOverlay!.observations.forEach((obs, i) => {
          const r = visionNormBoundingBoxToVideoLocalRect(obs.boundingBox, video.width, video.height);
          detG!.rect(r.x, r.y, r.width, r.height);
          detG!.stroke({ width: strokeWidth, color: colours[i % colours.length], alignment: 0.5 });
        });
      }

      // Selection Border
      let border = container.children.find(c => c.label === 'border') as PIXI.Graphics;
      if (isSelected && !isExporting && !isSnapshotRequested) { 
        if (!border) {
            border = new PIXI.Graphics();
            border.label = 'border';
            container.addChild(border);
        }
        border.clear();
        let bx = 0;
        let by = 0;
        let bw = (obj as any).width || 100;
        let bh = (obj as any).height || 100;

        if (content) {
          const globalBounds = content.getBounds();
          const topLeft = container.toLocal(new PIXI.Point(globalBounds.x, globalBounds.y));
          const bottomRight = container.toLocal(new PIXI.Point(globalBounds.x + globalBounds.width, globalBounds.y + globalBounds.height));

          bx = topLeft.x;
          by = topLeft.y;
          bw = Math.max(1, bottomRight.x - topLeft.x);
          bh = Math.max(1, bottomRight.y - topLeft.y);
        }

        border.rect(bx, by, bw, bh);
        border.stroke({ width: 2, color: 0xffd700 });
        container.setChildIndex(border, container.children.length - 1);

        // Resize Handles (四隅)
        const locked = layers[obj.layer]?.locked === true;
        const handleCorners: { corner: ResizeCorner; cx: number; cy: number }[] = [
          { corner: 'top-left', cx: bx, cy: by },
          { corner: 'top-right', cx: bx + bw, cy: by },
          { corner: 'bottom-left', cx: bx, cy: by + bh },
          { corner: 'bottom-right', cx: bx + bw, cy: by + bh },
        ];
        // ハンドルがコンテナのスケール・カメラズーム・プレビュー表示倍率に依らず
        // 一定の見かけサイズ（スクリーン px）になるよう、ローカルサイズを補正する。
        const zoomForHandle = Math.max(0.05, camera.zoom);
        const dispScale = Math.max(1e-3, displayScaleRef.current);
        const handleW = RESIZE_HANDLE_SCREEN_PX / Math.max(1e-3, Math.abs(obj.scaleX ?? 1) * zoomForHandle * dispScale);
        const handleH = RESIZE_HANDLE_SCREEN_PX / Math.max(1e-3, Math.abs(obj.scaleY ?? 1) * zoomForHandle * dispScale);
        const currentBounds = { bx, by, bw, bh };

        handleCorners.forEach(({ corner, cx, cy }) => {
          const label = `${RESIZE_HANDLE_PREFIX}${corner}`;
          let handle = container.children.find((c) => c.label === label) as PIXI.Graphics | undefined;
          if (locked) {
            if (handle) {
              container.removeChild(handle);
              handle.destroy();
            }
            return;
          }
          if (!handle || handle.destroyed) {
            handle = new PIXI.Graphics();
            handle.label = label;
            handle.eventMode = 'static';
            handle.cursor = RESIZE_CORNER_CURSORS[corner];
            // 現在の角・境界はレンダーごとに更新し、pointerdown 時に最新値を読む。
            handle.on('pointerdown', (e) => {
              const data = (handle as unknown as { __resize?: { corner: ResizeCorner; bounds: typeof currentBounds } }).__resize;
              if (data) onResizeStart(e, obj.id, data.corner, data.bounds);
            });
            container.addChild(handle);
          }
          (handle as unknown as { __resize?: unknown }).__resize = { corner, bounds: currentBounds };
          handle.clear();
          handle.rect(cx - handleW / 2, cy - handleH / 2, handleW, handleH);
          handle.fill({ color: 0xffffff });
          handle.stroke({ width: Math.max(handleW, handleH) * 0.12, color: 0xffd700 });
          container.setChildIndex(handle, container.children.length - 1);
        });
      } else {
        if (border) {
            container.removeChild(border);
            border.destroy();
        }
        const handleNodes = container.children.filter((c) => (c.label ?? '').startsWith(RESIZE_HANDLE_PREFIX));
        handleNodes.forEach((handleNode) => {
          container.removeChild(handleNode);
          handleNode.destroy();
        });
      }

      // Transform
      let currentX = obj.x; let currentY = obj.y;
      const rawProgress = (time - obj.startTime) / obj.duration; const progress = Math.max(0, Math.min(1, rawProgress));

      if (obj.keyframes && obj.keyframes.length > 1) {
          const keyed = evaluateObjectPositionAtTime(obj, time);
          currentX = keyed.x;
          currentY = keyed.y;
      } else if (obj.motionPath && obj.motionPath.length > 1) {
          const path = obj.motionPath; let idx = 0;
          while (idx < path.length - 1 && path[idx+1].time < progress) idx++;
          const p1 = path[idx]; const p2 = path[idx+1] || p1;
          const range = p2.time - p1.time; const localRatio = range <= 0 ? 0 : (progress - p1.time) / range;
          currentX = p1.x + (p2.x - p1.x) * localRatio; currentY = p1.y + (p2.y - p1.y) * localRatio;
      } else if (obj.enableAnimation) {
          const keyed = evaluateObjectPositionAtTime(obj, time);
          currentX = keyed.x;
          currentY = keyed.y;
      }
      
      const groupEffects = getGroupTransforms(obj, time, currentObjects);
      const vib = getVibrationOffset(obj, time);

      container.x = currentX + groupEffects.x + vib.x; 
      container.y = currentY + groupEffects.y + vib.y;
      container.rotation = ((obj.rotation || 0) + groupEffects.rotation) * (Math.PI / 180);
      container.scale.set((obj.scaleX ?? 1) * groupEffects.scaleX, (obj.scaleY ?? 1) * groupEffects.scaleY);
      container.alpha = (obj.opacity ?? 1) * groupEffects.alpha * getFadeOpacityMultiplier(obj);
      container.zIndex = obj.layer; 
      
      if (!isExporting && dragRef.current.active && dragRef.current.targetId === obj.id) {
          container.alpha *= 0.6;
      }
    });

    // 3. Clipping / Wipe masks
    visibleObjects.forEach((obj) => {
      const container = currentPixiObjects.get(obj.id);
      if (!container) return;

      const removeWipeMask = () => {
        const wipeNode = container.children.find((child) => child.label === 'wipe-mask');
        if (wipeNode) {
          container.removeChild(wipeNode);
          wipeNode.destroy();
        }
      };

      if (obj.clipping) {
        removeWipeMask();
        const targetLayer = obj.layer - 1;
        const targetObj = [...visibleObjects]
          .reverse()
          .find((candidate) => candidate.layer === targetLayer && currentPixiObjects.has(candidate.id));
        const targetContainer = targetObj ? currentPixiObjects.get(targetObj.id) : null;
        container.mask = targetContainer || null;
        return;
      }

      const wipe = getPrimaryWipeFilter(obj);
      if (wipe) {
        const bounds = container.getLocalBounds();
        const pad = 4;
        const bx = bounds.x - pad;
        const by = bounds.y - pad;
        const bw = Math.max(1, bounds.width + pad * 2);
        const bh = Math.max(1, bounds.height + pad * 2);
        let progress = (time - obj.startTime) / obj.duration;
        progress = Math.max(0, Math.min(1, progress));
        if (wipe.params.reverse) progress = 1 - progress;

        let maskGraphics = container.children.find((child) => child.label === 'wipe-mask') as PIXI.Graphics | undefined;
        if (!maskGraphics) {
          maskGraphics = new PIXI.Graphics();
          maskGraphics.label = 'wipe-mask';
          container.addChild(maskGraphics);
        }
        maskGraphics.clear();
        const edge = wipe.params.edge;
        if (edge === 'left') {
          maskGraphics.rect(bx, by, bw * progress, bh).fill({ color: 0xffffff });
        } else if (edge === 'right') {
          const wv = bw * progress;
          maskGraphics.rect(bx + bw - wv, by, wv, bh).fill({ color: 0xffffff });
        } else if (edge === 'top') {
          maskGraphics.rect(bx, by, bw, bh * progress).fill({ color: 0xffffff });
        } else {
          const hv = bh * progress;
          maskGraphics.rect(bx, by + bh - hv, bw, hv).fill({ color: 0xffffff });
        }
        container.mask = maskGraphics;
        return;
      }

      removeWipeMask();
      container.mask = null;
    });

    // 4. Group Gradient Filter
    const groupTopLayerMap = new Map<string, number>();
    const groupGradientMap = new Map<string, GradientFill | undefined>();
    const groupObjectContainersMap = new Map<string, PIXI.Container[]>();
    visibleObjects.forEach((obj) => {
      if (!obj.groupId || !currentGroupContainers.has(obj.groupId)) return;
      const prevTop = groupTopLayerMap.get(obj.groupId);
      if (prevTop === undefined || obj.layer > prevTop) {
        groupTopLayerMap.set(obj.groupId, obj.layer);
      }
      if (obj.groupGradient && !groupGradientMap.has(obj.groupId)) {
        groupGradientMap.set(obj.groupId, obj.groupGradient);
      }
      const objectContainer = currentPixiObjects.get(obj.id);
      if (!objectContainer) return;
      const members = groupObjectContainersMap.get(obj.groupId) ?? [];
      members.push(objectContainer);
      groupObjectContainersMap.set(obj.groupId, members);
    });
    currentGroupContainers.forEach((groupContainer, groupId) => {
      flattenGroupGradientComponents(groupContainer);

      const gradient = groupGradientMap.get(groupId);
      const members = groupObjectContainersMap.get(groupId) ?? [];
      const useConnectedScope = gradient?.scope !== 'group';
      const canSplitComponents = gradient?.enabled === true && useConnectedScope && members.length >= 2;

      if (canSplitComponents) {
        const components = buildConnectedComponents(members);
        if (components.length > 1) {
          applyGroupGradientEffect(groupContainer, undefined);
          components.forEach((componentMemberIndexes, componentIndex) => {
            const componentContainer = new PIXI.Container();
            componentContainer.label = `${GROUP_GRADIENT_COMPONENT_PREFIX}${groupId}-${componentIndex}`;
            componentContainer.sortableChildren = true;

            let topLayer = Number.NEGATIVE_INFINITY;
            componentMemberIndexes.forEach((memberIndex) => {
              const member = members[memberIndex];
              topLayer = Math.max(topLayer, member.zIndex);
              member.parent?.removeChild(member);
              componentContainer.addChild(member);
            });

            componentContainer.zIndex = Number.isFinite(topLayer) ? topLayer : 0;
            groupContainer.addChild(componentContainer);
            applyGroupGradientEffect(componentContainer, gradient);
          });

          groupContainer.sortChildren();
          groupContainer.zIndex = groupTopLayerMap.get(groupId) ?? 0;
          return;
        }
      }

      groupContainer.zIndex = groupTopLayerMap.get(groupId) ?? 0;
      applyGroupGradientEffect(groupContainer, gradient);
    });

    const world = worldContainerRef.current;
    if (world) {
      const w = projectSettings.width;
      const h = projectSettings.height;
      world.pivot.set(w / 2, h / 2);
      world.position.set(w / 2 + camera.centreOffsetX, h / 2 + camera.centreOffsetY);
      const zoom = Math.max(0.05, camera.zoom);
      world.scale.set(zoom, zoom);
      world.rotation = camera.rotationDeg * (Math.PI / 180);
      world.sortChildren();
    } else {
      app.stage.sortChildren();
    }
    
    // 手動レンダリング実行 (Ticker停止中のため必須)
    app.render();
    publishSharedRendererPreviewSession(time, currentObjects);

    const workspaceMode = useStore.getState().projectSettings.editorMode ?? '2d';
    if (workspaceMode === '3d_stage' && threeStageRef.current) {
      const billboardEntries: BillboardTextureEntry[] = [];
      for (const obj of visibleObjects) {
        if (obj.type !== 'psd') continue;
        const psd = obj as PsdObject;
        if (!psd.worldPlacement?.enabled) continue;
        const wrap = currentPixiObjects.get(obj.id);
        if (!wrap) continue;
        const extractRoot = wrap.children.find((ch) => {
          const label = typeof ch.label === 'string' ? ch.label : '';
          return label !== 'border' && !label.startsWith('shadow') && !label.startsWith(RESIZE_HANDLE_PREFIX);
        }) as PIXI.Container | undefined;
        if (!extractRoot) continue;
        const bounds = extractRoot.getLocalBounds();
        const bw = Math.max(1, Math.ceil(bounds.width));
        const bh = Math.max(1, Math.ceil(bounds.height));
        const frame = new PIXI.Rectangle(bounds.x, bounds.y, bw, bh);
        try {
          const canvas = app.renderer.extract.canvas({
            target: extractRoot,
            frame,
            clearColor: 'rgba(0,0,0,0)',
          }) as HTMLCanvasElement;
          billboardEntries.push({
            id: obj.id,
            canvas,
            placement: psd.worldPlacement,
            widthPx: canvas.width,
            heightPx: canvas.height,
          });
        } catch {
          /* ignore extract failure */
        }
      }
      threeStageRef.current.syncBillboards(billboardEntries, useStore.getState().stageCamera3D);
    }
  }, [
    selectedIds,
    isExporting,
    isPlaying,
    isSnapshotRequested,
    layers,
    camera,
    projectSettings,
    editorMode,
    sharedRendererPreviewEnabled,
    sharedRendererGpuStatus.webGpuAvailable,
    sharedRendererGpuStatus.fallbackAdapter,
    publishSharedRendererPreviewSession,
  ]);

  useEffect(() => { 
      if (!isExporting && pixiReady) renderScene(currentTime, objects); 
  }, [
    currentTime,
    objects,
    renderScene,
    renderTick,
    isExporting,
    pixiReady,
    visionDetectionPreviewEnabled,
    visionDetectionOverlay
  ]);

  const getExportCanvas = useCallback((): HTMLCanvasElement | null => {
    if (useStore.getState().projectSettings.editorMode === '3d_stage') {
      return threeStageRef.current?.getCanvas() ?? null;
    }
    const pixiCanvas = pixiAppRef.current?.canvas;
    return pixiCanvas != null ? (pixiCanvas as HTMLCanvasElement) : null;
  }, []);

  const getRustExportFrameSource = useCallback((context: ProjectExportRustFrameSourceContext) => buildViewportRustExportFrameSource({
    exportEnabled: sharedRendererExportEnabled,
    canvas: sharedRendererSurfaceCanvasRef.current,
    projectSettings,
    layers,
    editorMode,
    webGpuAvailable: sharedRendererGpuStatus.webGpuAvailable,
    fallbackAdapter: sharedRendererGpuStatus.fallbackAdapter,
    videoCutoverEnabled: sharedRendererVideoCutoverEnabled,
    objects: context.objects,
    time: context.time,
    diagnosticsDataset: document.documentElement.dataset as Record<string, string | undefined>,
  }), [
    editorMode,
    layers,
    projectSettings,
    sharedRendererExportEnabled,
    sharedRendererGpuStatus.fallbackAdapter,
    sharedRendererGpuStatus.webGpuAvailable,
    sharedRendererVideoCutoverEnabled,
  ]);
  
  useProjectExport(pixiAppRef, videoElementsRef, renderScene, getExportCanvas, exportFrameOverridesRef, getRustExportFrameSource);

  // --- Snapshot Logic (after renderScene is defined) ---
  useEffect(() => {
      if (!isSnapshotRequested) return;

      const mode = useStore.getState().projectSettings.editorMode ?? '2d';
      if (mode === '3d_stage') {
        renderScene(currentTime, objects);
        const canvas3d = threeStageRef.current?.getCanvas();
        if (canvas3d) {
          const dataUrl = canvas3d.toDataURL('image/png');
          const link = document.createElement('a');
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          link.download = `frame_${timestamp}.png`;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          finishSnapshot();
          return;
        }
      }

      if (pixiAppRef.current) {
          const app = pixiAppRef.current;
          app.render();
          const dataUrl = app.canvas.toDataURL('image/png');
          const link = document.createElement('a');
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          link.download = `frame_${timestamp}.png`;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          finishSnapshot();
      }
  }, [isSnapshotRequested, finishSnapshot, renderScene, currentTime, objects]);

  const previewW = projectSettings.width * displayScale;
  const previewH = projectSettings.height * displayScale;
  const alignStart = previewDisplayMode === 'pixelPerfect';

  return (
    <div
      ref={viewportShellRef}
      className="viewport-container"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: 'var(--bg-app)',
        overflow: previewDisplayMode === 'pixelPerfect' ? 'auto' : 'hidden',
      }}
    >
      <div
        className="glass"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 20,
          display: 'flex',
          gap: 4,
          padding: 4,
          borderRadius: 8,
          pointerEvents: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() => setPreviewDisplayMode('autoFit')}
          title={t('previewModeAuto')}
          style={{
            fontSize: 11,
            padding: '4px 8px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            background: previewDisplayMode === 'autoFit' ? 'var(--accent, #3b82f6)' : 'transparent',
            color: previewDisplayMode === 'autoFit' ? '#fff' : 'var(--text-primary)',
          }}
        >
          {t('previewModeAuto')}
        </button>
        <button
          type="button"
          onClick={() => setPreviewDisplayMode('pixelPerfect')}
          title={t('previewModePixelPerfect')}
          style={{
            fontSize: 11,
            padding: '4px 8px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            background: previewDisplayMode === 'pixelPerfect' ? 'var(--accent, #3b82f6)' : 'transparent',
            color: previewDisplayMode === 'pixelPerfect' ? '#fff' : 'var(--text-primary)',
          }}
        >
          {t('previewModePixelPerfect')}
        </button>
        <div className="divider" style={{ width: 1, height: 14, background: 'var(--border-subtle)', margin: '0 2px' }} />
        <button
          type="button"
          onClick={() => setEditorMode('2d')}
          title={t('editorMode2d')}
          style={{
            fontSize: 11,
            padding: '4px 8px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            background: editorMode === '2d' ? 'var(--accent, #3b82f6)' : 'transparent',
            color: editorMode === '2d' ? '#fff' : 'var(--text-primary)',
          }}
        >
          {t('editorMode2d')}
        </button>
        <button
          type="button"
          onClick={() => setEditorMode('3d_stage')}
          title={t('editorMode3d')}
          style={{
            fontSize: 11,
            padding: '4px 8px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            background: editorMode === '3d_stage' ? 'var(--accent, #3b82f6)' : 'transparent',
            color: editorMode === '3d_stage' ? '#fff' : 'var(--text-primary)',
          }}
        >
          {t('editorMode3d')}
        </button>
      </div>

      {isExporting && (
        <div className="export-indicator glass">
          <div className="export-dot"></div>
          {t('exportingVideo') || 'EXPORTING...'}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          minWidth: 0,
          minHeight: 0,
          boxSizing: 'border-box',
          alignItems: alignStart ? 'flex-start' : 'center',
          justifyContent: alignStart ? 'flex-start' : 'center',
          padding: alignStart ? 12 : 0,
        }}
      >
        <div
          className="preview-canvas-container"
          style={{
            width: previewW,
            height: previewH,
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <div
            ref={containerRef}
            style={{
              width: '100%',
              height: '100%',
              visibility: editorMode === '3d_stage' ? 'hidden' : 'visible',
              pointerEvents: editorMode === '3d_stage' ? 'none' : 'auto',
            }}
          />
          {shouldMountSharedRendererSurface && (
            <>
              <canvas
                ref={sharedRendererSurfaceCanvasRef}
                data-shared-renderer-preview-surface="true"
                aria-hidden="true"
                width={projectSettings.width}
                height={projectSettings.height}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  visibility: editorMode === '2d' && sharedRendererPreviewEnabled ? 'visible' : 'hidden',
                }}
              />
              {sharedRendererDiagnosticSwatchEnabled && (
                <div
                  data-shared-renderer-css-reference-swatch="true"
                  aria-hidden="true"
                  title="Shared renderer sRGB 参照スウォッチ"
                  style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    width: 48,
                    height: 48,
                    boxSizing: 'border-box',
                    border: '1px solid rgba(255, 255, 255, 0.68)',
                    background: sharedRendererCssReferenceColour,
                    pointerEvents: 'none',
                    visibility: editorMode === '2d' ? 'visible' : 'hidden',
                    zIndex: 2,
                  }}
                />
              )}
            </>
          )}
          {editorMode === '3d_stage' && (
            <ThreeStageViewport
              ref={threeStageRef}
              width={projectSettings.width}
              height={projectSettings.height}
              displayScale={displayScale}
              stageCamera3D={stageCamera3D}
              setStageCamera3D={setStageCamera3D}
              isExporting={isExporting}
              selectedBillboardId={selectedBillboardPsdId}
              onBillboardWorldPositionChange={handleBillboardWorldMove}
            />
          )}
        </div>
      </div>
    </div>
  );
};
export default Viewport;
