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
import { evaluateObjectPositionAtTime } from '../utils/keyframes';
import { getEnabledObjectFiltersInOrder, getFadeOpacityMultiplier, getPrimaryWipeFilter } from '../utils/filterStack';
import { useTranslation } from '../i18n';
import { computePreviewDisplayScale } from '../utils/previewDisplayScale';
import { visionNormBoundingBoxToVideoLocalRect } from '../utils/visionTrackingGeometry';
import type { ResizeCorner } from '../utils/transformGeometry';
import {
  buildSharedRendererPreviewSession,
  collectSharedRendererGeneratedEffectObjectIdsFromSession,
  type SharedRendererPreviewSession,
} from '../utils/sharedRendererPreviewSession';
import { buildSharedRendererPresenterSessionKey } from '../utils/sharedRendererPresenterSessionKey';
import { buildSharedRendererVideoMediaReadiness } from '../utils/sharedRendererVideoMediaReadiness';
import {
  getSharedRendererSolidSwatchCssColour,
  type SharedRendererPreviewPresenterControl,
} from '../utils/sharedRendererPreviewPresenterController';
import { writeSharedRendererPresenterDiagnostics } from '../utils/sharedRendererPresenterDiagnostics';
import type { SharedRendererVideoFrameScenePresentationResult } from '../utils/sharedRendererWebGpuPresenter';
import {
  startSharedRendererViewportPresenter,
} from '../utils/sharedRendererViewportPresenterOrchestration';
import { prepareSharedRendererViewportNativeRenderUpload } from '../utils/sharedRendererViewportNativeRenderUpload';
import {
  prepareSharedRendererViewportNativeOverlayPresent,
  type SharedRendererViewportVideoDecodeJob,
} from '../utils/sharedRendererViewportVideoUpload';
import type { ProjectExportRustFrameSourceContext } from '../utils/projectExportFrameCanvas';
import { buildViewportRustExportFrameSource } from '../utils/viewportRustExportFrameSource';
import { shouldMountSharedRendererSurfaceCanvas } from '../utils/sharedRendererSurfaceMount';
import {
  SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT,
  SHARED_RENDERER_PLAYBACK_DECODE_MAX_EDGE,
  quantiseSharedRendererPlaybackPreviewTime,
} from '../utils/sharedRendererPlaybackPreviewSettings';
import {
  createSharedRendererExternalVideoSource,
  syncSharedRendererExternalVideoPlayback,
  type SharedRendererExternalVideoPlaybackState,
  type SharedRendererExternalVideoSource,
} from '../utils/sharedRendererExternalVideoSource';
import { toFileProtocolUrl } from '../utils/mediaMetadata';
import { buildNativeOverlayAttachRect } from '../utils/nativeOverlayViewportGeometry';

const GROUP_GRADIENT_COMPONENT_PREFIX = 'group-gradient-component-';
const RESIZE_HANDLE_PREFIX = 'resize-handle-';
const SHARED_RENDERER_EXTERNAL_VIDEO_PLAYING_SYNC_INTERVAL_MS = 75;
// 一時停止時にヘッドを表示フレームへスナップする最小デルタ（秒）。これ未満は
// 体感できないうえ無駄な再レンダーを誘発するため無視する。
const PAUSE_SNAP_MIN_DELTA_SECONDS = 0.004;
/** 角ハンドルのスクリーン上の目標サイズ（px）。 */
const RESIZE_HANDLE_SCREEN_PX = 10;

const RESIZE_CORNER_CURSORS: Record<ResizeCorner, string> = {
  'top-left': 'nwse-resize',
  'bottom-right': 'nwse-resize',
  'top-right': 'nesw-resize',
  'bottom-left': 'nesw-resize',
};

type BoundsLike = { x: number; y: number; width: number; height: number };

type SharedRendererPresenterDiagnosticDataset = Record<string, string | undefined>;

type SharedRendererExternalVideoSourceEntry = {
  url: string;
  source: SharedRendererExternalVideoSource;
  playbackState: SharedRendererExternalVideoPlaybackState;
  frameReadyUnregister?: () => void;
  frameReadyArmedForFrame?: number;
};

// An HTMLVideoElement holds a presentable frame once it reaches HAVE_CURRENT_DATA.
const HTML_VIDEO_HAVE_CURRENT_DATA = 2;

const clearSharedRendererExternalVideoSourceDiagnostics = () => {
  if (typeof document === 'undefined') return;
  const dataset = document.documentElement.dataset as Record<string, string | undefined>;
  delete dataset.uxfdSharedRendererExternalVideoSourceCount;
  delete dataset.uxfdSharedRendererExternalVideoSeekCount;
  delete dataset.uxfdSharedRendererExternalVideoSuppressedSeekCount;
  delete dataset.uxfdSharedRendererExternalVideoPlayCount;
  delete dataset.uxfdSharedRendererExternalVideoPauseCount;
  delete dataset.uxfdSharedRendererExternalVideoMaxAbsDriftMs;
};

const publishSharedRendererExternalVideoSourceDiagnostics = (
  entries: Map<string, SharedRendererExternalVideoSourceEntry>
) => {
  if (typeof document === 'undefined') return;
  if (entries.size === 0) {
    clearSharedRendererExternalVideoSourceDiagnostics();
    return;
  }

  let seekCount = 0;
  let suppressedSeekCount = 0;
  let playCount = 0;
  let pauseCount = 0;
  let maxAbsDriftSeconds = 0;
  entries.forEach((entry) => {
    const state = entry.playbackState;
    seekCount += state.seekCount ?? 0;
    suppressedSeekCount += state.suppressedSeekCount ?? 0;
    playCount += state.playCount ?? 0;
    pauseCount += state.pauseCount ?? 0;
    maxAbsDriftSeconds = Math.max(maxAbsDriftSeconds, Math.abs(state.lastDriftSeconds ?? 0));
  });

  const dataset = document.documentElement.dataset as Record<string, string | undefined>;
  dataset.uxfdSharedRendererExternalVideoSourceCount = String(entries.size);
  dataset.uxfdSharedRendererExternalVideoSeekCount = String(seekCount);
  dataset.uxfdSharedRendererExternalVideoSuppressedSeekCount = String(suppressedSeekCount);
  dataset.uxfdSharedRendererExternalVideoPlayCount = String(playCount);
  dataset.uxfdSharedRendererExternalVideoPauseCount = String(pauseCount);
  dataset.uxfdSharedRendererExternalVideoMaxAbsDriftMs = String(Math.round(maxAbsDriftSeconds * 1000));
};

const disposeSharedRendererExternalVideoSources = (
  entries: Map<string, SharedRendererExternalVideoSourceEntry>
) => {
  entries.forEach((entry) => {
    entry.frameReadyUnregister?.();
    entry.frameReadyUnregister = undefined;
    entry.source.dispose();
  });
  entries.clear();
  clearSharedRendererExternalVideoSourceDiagnostics();
};

const resolveSharedRendererExternalVideoUrl = (
  video: VideoObject,
  fallbackSource: string
): string => {
  const source = video.filePath || fallbackSource || video.src;
  const trimmed = source.trim();
  if (!trimmed) return '';
  if (/^(blob:|data:|file:|https?:)/.test(trimmed)) return trimmed;
  return toFileProtocolUrl(trimmed);
};

const sourceFrameToSeconds = (
  sourceFrame: number,
  sourceRate: { numerator: number; denominator: number } | undefined
): number => {
  if (!sourceRate || sourceRate.numerator <= 0 || sourceRate.denominator <= 0) {
    return 0;
  }
  return Math.max(0, sourceFrame * sourceRate.denominator / sourceRate.numerator);
};

const isSharedRendererExternalVideoOnlySession = (session: SharedRendererPreviewSession): boolean => {
  if (!session.surfaceGate.ok || session.surfaceGate.snapshot.clips.length === 0) return false;

  const mediaKindById = new Map(session.surfaceGate.media.map((media) => [media.id, media.kind]));
  return session.surfaceGate.snapshot.clips.every((clip) => mediaKindById.get(clip.media_id) === 'Video');
};

export const shouldReuseExternalVideoPresenterSession = ({
  session,
  isExporting,
  rustVideoOnly = false,
}: {
  session: SharedRendererPreviewSession;
  isExporting: boolean;
  rustVideoOnly?: boolean;
}): boolean => (
  // In rust-only mode video frames are presented by the native render path, not
  // the HTMLVideoElement presenter. Reusing the external-video presenter here
  // makes every playback tick attempt (and fail) an external-video present, which
  // nulls the presenter session key and forces a full native-render restart each
  // frame — the ffmpeg restart storm seen in UXFD_DECODE_TRACE. Never reuse it.
  !isExporting
  && !rustVideoOnly
  && isSharedRendererExternalVideoOnlySession(session)
);

const publishSharedRendererExternalVideoPresentationDiagnostics = (
  session: SharedRendererPreviewSession,
  datasets: SharedRendererPresenterDiagnosticDataset[],
  presenterStartCount: number,
) => {
  if (!session.surfaceGate.ok) return;

  const surfaceGate = session.surfaceGate;
  const mediaKindById = new Map(surfaceGate.media.map((media) => [media.id, media.kind]));
  const firstVideoClip = surfaceGate.snapshot.clips
    .filter((clip) => mediaKindById.get(clip.media_id) === 'Video')
    .sort((left, right) => left.z_index - right.z_index)[0];
  if (!firstVideoClip) return;

  datasets.forEach((dataset) => {
    dataset.uxfdSharedRendererPresenterStatus = 'ready';
    dataset.uxfdSharedRendererPresenterStartCount = String(presenterStartCount);
    dataset.uxfdSharedRendererPresenterVideoPresentationSource = 'external-video-source';
    dataset.uxfdSharedRendererPresenterVideoFrameUploadReady = 'true';
    dataset.uxfdSharedRendererPresenterVideoPresentedSourceFrame = String(firstVideoClip.source_frame);
    dataset.uxfdSharedRendererPresenterVideoPresentedFrameIndex = String(surfaceGate.snapshot.frame_index);
  });
};

const syncSharedRendererExternalVideoSources = ({
  session,
  objects,
  entries,
  isPlaying,
  onFrameReady,
  onPauseSnap,
}: {
  session: SharedRendererPreviewSession;
  objects: TimelineObject[];
  entries: Map<string, SharedRendererExternalVideoSourceEntry>;
  isPlaying: boolean;
  onFrameReady?: () => void;
  onPauseSnap?: (deltaSeconds: number) => void;
}): Map<string, unknown> => {
  const sourcesByClipId = new Map<string, unknown>();
  if (!session.surfaceGate.ok) {
    disposeSharedRendererExternalVideoSources(entries);
    return sourcesByClipId;
  }

  const objectsById = new Map(objects.map((object) => [object.id, object]));
  const mediaById = new Map(session.surfaceGate.media.map((media) => [media.id, media]));
  const activeClipIds = new Set<string>();
  let pauseSnapDeltaSeconds: number | undefined;

  session.surfaceGate.snapshot.clips.forEach((clip) => {
    const object = objectsById.get(clip.clip_id);
    const media = mediaById.get(clip.media_id);
    if (object?.type !== 'video' || media?.kind !== 'Video') return;

    const url = resolveSharedRendererExternalVideoUrl(object, media.source);
    if (!url) return;

    activeClipIds.add(clip.clip_id);
    let entry = entries.get(clip.clip_id);
    if (!entry || entry.url !== url) {
      entry?.source.dispose();
      entry = {
        url,
        source: createSharedRendererExternalVideoSource({
          url,
          muted: object.muted,
          volume: object.volume,
        }),
        playbackState: {},
      };
      entries.set(clip.clip_id, entry);
    }
    entry.source.setAudioState({
      muted: object.muted,
      volume: object.volume,
    });

    const playbackSyncResult = syncSharedRendererExternalVideoPlayback({
      source: entry.source,
      playbackState: entry.playbackState,
      targetTimeSeconds: sourceFrameToSeconds(clip.source_frame, media.source_rate),
      isPlaying,
      minimumPlayingSyncIntervalMs: SHARED_RENDERER_EXTERNAL_VIDEO_PLAYING_SYNC_INTERVAL_MS,
    });

    // On the play → pause edge, move the timeline head onto the frame the
    // element is actually showing rather than letting the element seek back to
    // the drifted head (which looked like an unnatural jump). Only the primary
    // (first) video clip drives the head; sub-frame deltas are ignored to avoid
    // needless re-renders.
    if (
      onPauseSnap
      && pauseSnapDeltaSeconds === undefined
      && typeof playbackSyncResult.pauseSnapTimelineDeltaSeconds === 'number'
      && Math.abs(playbackSyncResult.pauseSnapTimelineDeltaSeconds) > PAUSE_SNAP_MIN_DELTA_SECONDS
    ) {
      pauseSnapDeltaSeconds = playbackSyncResult.pauseSnapTimelineDeltaSeconds;
    }

    // While paused, a freshly seeked element may not yet hold a presentable
    // frame, so the shared renderer skips it and shows a transient diagnostic.
    // Register a one-shot frame-ready notification to re-present once the frame
    // is decoded; without this the preview stays blank until a manual seek.
    //
    // Crucially this is de-duplicated per (clip, source_frame): a paused element
    // can fire requestVideoFrameCallback/seeked many times for the same target
    // while scrubbing, and re-arming each time would restart the presenter in a
    // tight loop and exhaust the GPU (blank window). Arm at most once per target
    // frame, and clear the guard once the frame is ready.
    if (onFrameReady && !isPlaying) {
      const elementReadyState = entry.source.source.readyState ?? 0;
      if (elementReadyState >= HTML_VIDEO_HAVE_CURRENT_DATA) {
        entry.frameReadyUnregister?.();
        entry.frameReadyUnregister = undefined;
        entry.frameReadyArmedForFrame = undefined;
      } else if (entry.frameReadyArmedForFrame !== clip.source_frame) {
        entry.frameReadyUnregister?.();
        entry.frameReadyArmedForFrame = clip.source_frame;
        entry.frameReadyUnregister = entry.source.notifyOnNextPresentableFrame(() => {
          entry.frameReadyUnregister = undefined;
          onFrameReady();
        });
      }
    }

    sourcesByClipId.set(clip.clip_id, entry.source.source);
  });

  entries.forEach((entry, clipId) => {
    if (activeClipIds.has(clipId)) return;
    entry.frameReadyUnregister?.();
    entry.frameReadyUnregister = undefined;
    entry.source.dispose();
    entries.delete(clipId);
  });
  publishSharedRendererExternalVideoSourceDiagnostics(entries);

  if (onPauseSnap && pauseSnapDeltaSeconds !== undefined) {
    onPauseSnap(pauseSnapDeltaSeconds);
  }

  return sourcesByClipId;
};

const copySharedRendererPresenterDiagnostics = (
  source: SharedRendererPresenterDiagnosticDataset,
  target: SharedRendererPresenterDiagnosticDataset,
) => {
  Object.keys(target).forEach((key) => {
    if (key.startsWith('uxfdSharedRendererPresenter')) {
      delete target[key];
    }
  });
  Object.entries(source).forEach(([key, value]) => {
    if (key.startsWith('uxfdSharedRendererPresenter') && typeof value === 'string') {
      target[key] = value;
    }
  });
};

const isNonBlockingSharedRendererPreviewDiagnostic = (
  dataset: SharedRendererPresenterDiagnosticDataset,
  control: SharedRendererPreviewPresenterControl | null,
): boolean => (
  control?.ok === true
  && dataset.uxfdSharedRendererPresenterStatus === 'ready'
  && dataset.uxfdSharedRendererPresenterVideoPresentationSource === 'external-video-source'
  && dataset.uxfdSharedRendererPresenterVideoFrameUploadReady === 'true'
  && !dataset.uxfdSharedRendererPresenterFailureReason
  && !dataset.uxfdSharedRendererPresenterNativeRenderFailureReason
);

export const buildSharedRendererPreviewDiagnostic = (
  dataset: SharedRendererPresenterDiagnosticDataset,
  control: SharedRendererPreviewPresenterControl | null,
): string | null => {
  const status = dataset.uxfdSharedRendererPresenterStatus ?? 'unknown';
  const failureReason = dataset.uxfdSharedRendererPresenterFailureReason;
  const nativeRenderFailureReason = dataset.uxfdSharedRendererPresenterNativeRenderFailureReason;
  const nativeRenderFailureDetail = dataset.uxfdSharedRendererPresenterNativeRenderFailureDetail;
  const videoUploadFailureReason = dataset.uxfdSharedRendererPresenterVideoUploadFailureReason;
  const videoUploadFailureDetail = dataset.uxfdSharedRendererPresenterVideoUploadFailureDetail;
  const videoFrameUploadReady = dataset.uxfdSharedRendererPresenterVideoFrameUploadReady;

  if (control?.ok && status === 'ready' && !nativeRenderFailureReason && !videoUploadFailureReason && videoFrameUploadReady !== 'false') {
    return null;
  }
  if (videoUploadFailureReason && isNonBlockingSharedRendererPreviewDiagnostic(dataset, control)) {
    return null;
  }

  const parts = [
    'Rust shared renderer preview',
    `status=${status}`,
    control && !control.ok ? `control=${control.reason}` : null,
    failureReason ? `reason=${failureReason}` : null,
    nativeRenderFailureReason ? `native=${nativeRenderFailureReason}` : null,
    nativeRenderFailureDetail,
    videoUploadFailureReason ? `video=${videoUploadFailureReason}` : null,
    videoUploadFailureDetail,
    videoFrameUploadReady === 'false' ? 'videoFrameUploadReady=false' : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(' / ');
};

// A mid-seek external video element may momentarily hold no presentable frame,
// so the presenter reports videoTextureViewUnavailable. During playback this is
// transient: keep the current presenter and skip the frame instead of tearing it
// down, which would restart the presenter every frame and lose the GPU device.
export const isTransientExternalVideoPresentationFailure = (
  presentation: SharedRendererVideoFrameScenePresentationResult | undefined | null,
): boolean => Boolean(
  presentation
  && !presentation.ok
  && presentation.reason === 'videoTextureViewUnavailable',
);

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
  const sharedRendererPresenterStartingRef = useRef(false);
  const sharedRendererPresenterStartCountRef = useRef(0);
  const sharedRendererPendingPreviewSessionRef = useRef<SharedRendererPreviewSession | null>(null);
  const sharedRendererPendingPresenterSessionKeyRef = useRef<string | null>(null);
  const sharedRendererVideoDecodeJobsRef = useRef<SharedRendererViewportVideoDecodeJob[]>([]);
  const sharedRendererVideoDecodeRequestIdRef = useRef(0);
  // Single-flight guard for the rust-only native render reuse path: at most one
  // decode+present is in flight at a time so a slow tick cannot issue a second,
  // out-of-order frame request (the backwardSeek collisions that restart the
  // streaming decoder). `pending` holds the latest dropped tick to replay once.
  const sharedRendererNativeReusePreparingRef = useRef(false);
  const sharedRendererNativeReusePendingRef = useRef<{ time: number; objects: TimelineObject[] } | null>(null);
  const sharedRendererExternalVideoSourcesRef = useRef<Map<string, SharedRendererExternalVideoSourceEntry>>(new Map());
  const pixiObjectsRef = useRef<Map<string, PIXI.Container>>(new Map());
  const groupContainersRef = useRef<Map<string, PIXI.Container>>(new Map());
  
  const textureCacheRef = useRef<Map<string, PIXI.Texture>>(new Map());
  const loadingUrlsRef = useRef<Set<string>>(new Set());
  const sharedRendererSolidColourObjectIdsRef = useRef<Set<string>>(new Set());
  const sharedRendererImageObjectIdsRef = useRef<Set<string>>(new Set());
  const sharedRendererPsdObjectIdsRef = useRef<Set<string>>(new Set());
  const sharedRendererGeneratedEffectObjectIdsRef = useRef<Set<string>>(new Set());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());

  const [renderTick, setRenderTick] = useState(0);
  const [pixiReady, setPixiReady] = useState(false);
  const [panelSize, setPanelSize] = useState({ w: 0, h: 0 });
  const sharedRendererPreviewEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_PREVIEW !== '0';
  const sharedRendererExportEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_EXPORT !== '0';
  const sharedRendererDiagnosticSwatchEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_DIAGNOSTIC_SWATCH === '1';
  const sharedRendererVideoCutoverEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER !== '0';
  const nativeOverlayPreviewEnabled = import.meta.env.VITE_UXFD_NATIVE_OVERLAY === '1';
  const rustVideoOnlyEnabled = import.meta.env.VITE_UXFD_RUST_VIDEO_ONLY === '1';
  const phase0SkipDecodedUploadEnabled = import.meta.env.VITE_UXFD_PHASE0_SKIP_DECODED_UPLOAD === '1';
  const phase0WriteTextureNoOpEnabled = import.meta.env.VITE_UXFD_PHASE0_WRITE_TEXTURE_NOOP === '1';
  const phase0DiscardNativeRenderOutputEnabled = import.meta.env.VITE_UXFD_PHASE0_DISCARD_NATIVE_RENDER_OUTPUT === '1';
  const [sharedRendererGpuStatus, setSharedRendererGpuStatus] = useState({
    webGpuAvailable: false,
    fallbackAdapter: false,
  });
  const [sharedRendererPreviewSession, setSharedRendererPreviewSession] = useState<SharedRendererPreviewSession | null>(null);
  const [sharedRendererPreviewDiagnostic, setSharedRendererPreviewDiagnostic] = useState<string | null>(null);
  // Bumped when a paused external video frame becomes presentable, to re-run the
  // preview session publish and restart the presenter with the now-ready frame.
  const [sharedRendererExternalVideoFrameReadyTick, setSharedRendererExternalVideoFrameReadyTick] = useState(0);
  const requestSharedRendererExternalVideoFrameRepaint = useCallback(() => {
    sharedRendererPresenterSessionKeyRef.current = null;
    setSharedRendererExternalVideoFrameReadyTick((tick) => tick + 1);
  }, []);

  useEffect(() => () => {
    sharedRendererPresenterControlRef.current?.dispose();
    sharedRendererPresenterControlRef.current = null;
    disposeSharedRendererExternalVideoSources(sharedRendererExternalVideoSourcesRef.current);
  }, []);

  useEffect(() => {
    if (!nativeOverlayPreviewEnabled) return;
    const previewElement = containerRef.current;
    if (!previewElement || !window.nativeOverlay?.attach) return;

    let disposed = false;
    const attach = () => {
      if (disposed) return;
      const viewportRect = previewElement.getBoundingClientRect();
      void window.nativeOverlay?.attach(buildNativeOverlayAttachRect({
        viewportRect,
        contentHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      }));
    };

    attach();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(attach)
      : null;
    const visualViewport = window.visualViewport;
    observer?.observe(previewElement);
    window.addEventListener('resize', attach);
    visualViewport?.addEventListener('resize', attach);
    visualViewport?.addEventListener('scroll', attach);
    document.addEventListener('fullscreenchange', attach);
    document.addEventListener('visibilitychange', attach);
    window.addEventListener('focus', attach);
    window.addEventListener('pageshow', attach);

    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener('resize', attach);
      visualViewport?.removeEventListener('resize', attach);
      visualViewport?.removeEventListener('scroll', attach);
      document.removeEventListener('fullscreenchange', attach);
      document.removeEventListener('visibilitychange', attach);
      window.removeEventListener('focus', attach);
      window.removeEventListener('pageshow', attach);
      void window.nativeOverlay?.detach({});
    };
  }, [nativeOverlayPreviewEnabled]);

  const updateSharedRendererSolidColourObjectIds = useCallback((objectIds: string[]) => {
    const current = sharedRendererSolidColourObjectIdsRef.current;
    const next = new Set(objectIds);
    const unchanged = current.size === next.size && [...current].every((objectId) => next.has(objectId));
    if (unchanged) return;
    sharedRendererSolidColourObjectIdsRef.current = next;
    setRenderTick((previous) => previous + 1);
  }, []);

  const updateSharedRendererImageObjectIds = useCallback((objectIds: string[]) => {
    const current = sharedRendererImageObjectIdsRef.current;
    const next = new Set(objectIds);
    const unchanged = current.size === next.size && [...current].every((objectId) => next.has(objectId));
    if (unchanged) return;
    sharedRendererImageObjectIdsRef.current = next;
    setRenderTick((previous) => previous + 1);
  }, []);

  const updateSharedRendererPsdObjectIds = useCallback((objectIds: string[]) => {
    const current = sharedRendererPsdObjectIdsRef.current;
    const next = new Set(objectIds);
    const unchanged = current.size === next.size && [...current].every((objectId) => next.has(objectId));
    if (unchanged) return;
    sharedRendererPsdObjectIdsRef.current = next;
    setRenderTick((previous) => previous + 1);
  }, []);

  const updateSharedRendererGeneratedEffectObjectIds = useCallback((objectIds: string[]) => {
    const current = sharedRendererGeneratedEffectObjectIdsRef.current;
    const next = new Set(objectIds);
    const unchanged = current.size === next.size && [...current].every((objectId) => next.has(objectId));
    if (unchanged) return;
    sharedRendererGeneratedEffectObjectIdsRef.current = next;
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
    const previewTime = isPlaying
      ? quantiseSharedRendererPlaybackPreviewTime(time)
      : time;

    const session = buildSharedRendererPreviewSession({
      enabled: true,
      projectSettings,
      layers,
      objects: currentObjects,
      time: previewTime,
      editorMode,
      isExporting,
      webGpuAvailable: sharedRendererGpuStatus.webGpuAvailable,
      fallbackAdapter: sharedRendererGpuStatus.fallbackAdapter,
    });
    updateSharedRendererGeneratedEffectObjectIds(collectSharedRendererGeneratedEffectObjectIdsFromSession(session));
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
      })
      : { readyCount: 0, pendingCount: 0, missingCount: 0, rustRequiredCount: 0, videos: [] };
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
    document.documentElement.dataset.uxfdSharedRendererVideoRustRequiredCount = String(videoReadiness.rustRequiredCount);

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

    const canReuseExternalVideoPresenter = shouldReuseExternalVideoPresenterSession({
      session,
      isExporting,
      rustVideoOnly: rustVideoOnlyEnabled,
    });
    // In rust-only mode the native render presenter can be reused across playback
    // frames: instead of a full presenter restart per frame (the flicker + decode
    // restart storm), keep the presenter and only push a freshly decoded native
    // frame onto it. Requires an all-video session the native path can render.
    const canReuseNativeRenderPresenter = rustVideoOnlyEnabled
      && !isExporting
      && isSharedRendererExternalVideoOnlySession(session);
    const nextPresenterKey = buildSharedRendererPresenterSessionKey(session, {
      includePlaybackFrame: !(canReuseExternalVideoPresenter || canReuseNativeRenderPresenter),
      // The native reuse path re-presents the full Rust-composited frame each
      // tick, so animated transform/opacity/effects must not churn the key.
      includeAnimatedSceneContent: !canReuseNativeRenderPresenter,
    });
    if (isPlaying && sharedRendererPresenterStartingRef.current) {
      sharedRendererPendingPreviewSessionRef.current = session;
      sharedRendererPendingPresenterSessionKeyRef.current = nextPresenterKey;
      return;
    }
    if (canReuseExternalVideoPresenter && sharedRendererPresenterSessionKeyRef.current === nextPresenterKey) {
      const control = sharedRendererPresenterControlRef.current;
      if (control?.ok && control.presentExternalVideoFrameScene) {
        const sourcesByClipId = syncSharedRendererExternalVideoSources({
          session,
          objects: currentObjects,
          entries: sharedRendererExternalVideoSourcesRef.current,
          isPlaying,
          onFrameReady: requestSharedRendererExternalVideoFrameRepaint,
          onPauseSnap: (deltaSeconds) => {
            // Land the timeline head on the frame the element is showing so the
            // preview does not jump at the play → pause edge. setTime re-publishes
            // (now paused) and the element stays put, converging in one tick.
            useStore.getState().setTime(previewTime + deltaSeconds);
          },
        });
        const presentation = control.presentExternalVideoFrameScene?.({
          session,
          sourcesByClipId,
        });
        publishSharedRendererExternalVideoPresentationDiagnostics(
          session,
          [
            document.documentElement.dataset as Record<string, string | undefined>,
            ...(surfaceCanvas ? [surfaceCanvas.dataset as Record<string, string | undefined>] : []),
          ],
          sharedRendererPresenterStartCountRef.current
        );
        setSharedRendererPreviewDiagnostic(buildSharedRendererPreviewDiagnostic(
          document.documentElement.dataset as Record<string, string | undefined>,
          control
        ));
        if (presentation?.ok) {
          return;
        }
        // Mid-seek not-ready frame: retain the presenter and skip this frame.
        // The next playback tick re-presents once the element holds a frame.
        if (isTransientExternalVideoPresentationFailure(presentation)) {
          return;
        }
        sharedRendererPresenterSessionKeyRef.current = null;
      }
    }
    if (canReuseNativeRenderPresenter && sharedRendererPresenterSessionKeyRef.current === nextPresenterKey) {
      const control = sharedRendererPresenterControlRef.current;
      if (control?.ok && (nativeOverlayPreviewEnabled || control.presentPreparedNativeRenderFrame)) {
        const presentPreparedNativeRenderFrame = control.presentPreparedNativeRenderFrame;
        if (sharedRendererNativeReusePreparingRef.current) {
          // A decode+present is already in flight; replay only the latest tick.
          sharedRendererNativeReusePendingRef.current = { time, objects: currentObjects };
          return;
        }
        sharedRendererNativeReusePreparingRef.current = true;
        void (async () => {
          try {
            if (nativeOverlayPreviewEnabled) {
              const result = await prepareSharedRendererViewportNativeOverlayPresent({
                session,
                requestId: (sharedRendererVideoDecodeRequestIdRef.current += 1),
                activeJob: sharedRendererVideoDecodeJobsRef.current[0] ?? null,
                slotCount: SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT,
                maxDecodeEdge: SHARED_RENDERER_PLAYBACK_DECODE_MAX_EDGE,
                nativeOverlayBridge: window.nativeOverlay,
                rustBackendBridge: window.rustBackend,
              });
              sharedRendererVideoDecodeJobsRef.current = result.ok ? [result.activeJob] : [];
              if (!result.ok) {
                sharedRendererPresenterSessionKeyRef.current = null;
                setSharedRendererPreviewSession(session);
              }
              return;
            }
            if (!presentPreparedNativeRenderFrame) return;
            const result = await prepareSharedRendererViewportNativeRenderUpload({
              session,
              requestId: (sharedRendererVideoDecodeRequestIdRef.current += 1),
              activeJobs: sharedRendererVideoDecodeJobsRef.current,
              sourceSlotCount: SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT,
              maxDecodeEdge: SHARED_RENDERER_PLAYBACK_DECODE_MAX_EDGE,
            });
            sharedRendererVideoDecodeJobsRef.current = result.activeJobs;
            if (result.ok) {
              await presentPreparedNativeRenderFrame(result.upload);
            } else {
              // The scene changed under us (e.g. clip swapped); fall back to a full
              // presenter restart so it rebuilds for the new scene.
              sharedRendererPresenterSessionKeyRef.current = null;
              setSharedRendererPreviewSession(session);
            }
          } finally {
            sharedRendererNativeReusePreparingRef.current = false;
            const pending = sharedRendererNativeReusePendingRef.current;
            sharedRendererNativeReusePendingRef.current = null;
            if (pending) {
              publishSharedRendererPreviewSessionRef.current?.(pending.time, pending.objects);
            }
          }
        })();
        return;
      }
    }
    if (sharedRendererPresenterSessionKeyRef.current !== nextPresenterKey) {
      sharedRendererPresenterSessionKeyRef.current = nextPresenterKey;
      setSharedRendererPreviewSession(session);
    }
  }, [
    editorMode,
    isExporting,
    isPlaying,
    layers,
    projectSettings,
    sharedRendererGpuStatus.fallbackAdapter,
    sharedRendererGpuStatus.webGpuAvailable,
    sharedRendererPreviewEnabled,
    nativeOverlayPreviewEnabled,
    rustVideoOnlyEnabled,
    requestSharedRendererExternalVideoFrameRepaint,
    updateSharedRendererGeneratedEffectObjectIds,
  ]);

  // Latest publish callback, so the native reuse single-flight replay can re-run
  // the most recent dropped tick without making publish depend on itself.
  const publishSharedRendererPreviewSessionRef = useRef(publishSharedRendererPreviewSession);
  publishSharedRendererPreviewSessionRef.current = publishSharedRendererPreviewSession;

  useEffect(() => {
    publishSharedRendererPreviewSession(currentTime, objects);
    // sharedRendererExternalVideoFrameReadyTick re-publishes the session so a
    // paused frame that has just become presentable gets re-presented.
  }, [currentTime, objects, publishSharedRendererPreviewSession, sharedRendererExternalVideoFrameReadyTick]);

  useEffect(() => {
    if (!sharedRendererPreviewEnabled || !sharedRendererPreviewSession) {
      sharedRendererPresenterControlRef.current?.dispose();
      sharedRendererPresenterControlRef.current = null;
      disposeSharedRendererExternalVideoSources(sharedRendererExternalVideoSourcesRef.current);
      sharedRendererPresenterStartingRef.current = false;
      sharedRendererPendingPreviewSessionRef.current = null;
      sharedRendererPendingPresenterSessionKeyRef.current = null;
      sharedRendererVideoDecodeJobsRef.current = [];
      setSharedRendererPreviewDiagnostic(null);
      updateSharedRendererSolidColourObjectIds([]);
      updateSharedRendererImageObjectIds([]);
      return;
    }

    const surfaceCanvas = sharedRendererSurfaceCanvasRef.current;
    const rootDataset = document.documentElement.dataset as Record<string, string | undefined>;
    if (!surfaceCanvas) {
      writeSharedRendererPresenterDiagnostics(rootDataset, {
        status: 'fallback',
        reason: 'surfaceCanvasUnavailable',
      });
      setSharedRendererPreviewDiagnostic(buildSharedRendererPreviewDiagnostic(rootDataset, null));
      updateSharedRendererSolidColourObjectIds([]);
      updateSharedRendererImageObjectIds([]);
      return;
    }

    const rustPreviewDecodeEnabled = sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled;
    if (!rustPreviewDecodeEnabled) {
      sharedRendererVideoDecodeJobsRef.current = [];
    }
    updateSharedRendererSolidColourObjectIds([]);
    updateSharedRendererImageObjectIds([]);
    updateSharedRendererPsdObjectIds([]);

    let cancelled = false;
    let currentControl: SharedRendererPreviewPresenterControl | null = null;
    const liveDatasets = [
      rootDataset,
      surfaceCanvas.dataset as Record<string, string | undefined>,
    ];
    const stagePresenterDiagnostics = isPlaying && Boolean(sharedRendererPresenterControlRef.current);
    const stagedDatasets: SharedRendererPresenterDiagnosticDataset[] = stagePresenterDiagnostics
      ? liveDatasets.map(() => ({}))
      : liveDatasets;
    const previousPresenterControl = sharedRendererPresenterControlRef.current;
    const canReuseCurrentPresenterSession = shouldReuseExternalVideoPresenterSession({
      session: sharedRendererPreviewSession,
      isExporting,
      rustVideoOnly: rustVideoOnlyEnabled,
    });
    const canReuseCurrentNativeRenderPresenter = rustVideoOnlyEnabled
      && !isExporting
      && isSharedRendererExternalVideoOnlySession(sharedRendererPreviewSession);
    const presenterSessionKey = buildSharedRendererPresenterSessionKey(sharedRendererPreviewSession, {
      // Mirror publishSharedRendererPreviewSession so the pending-replay key
      // comparison in .finally matches the key the publish path stored.
      includePlaybackFrame: !(canReuseCurrentPresenterSession || canReuseCurrentNativeRenderPresenter),
      includeAnimatedSceneContent: !canReuseCurrentNativeRenderPresenter,
    });
    let externalVideoSourcesByClipId = new Map<string, unknown>();
    if (isExporting) {
      disposeSharedRendererExternalVideoSources(sharedRendererExternalVideoSourcesRef.current);
      sharedRendererPresenterSessionKeyRef.current = null;
    } else if (rustVideoOnlyEnabled) {
      disposeSharedRendererExternalVideoSources(sharedRendererExternalVideoSourcesRef.current);
    } else {
      externalVideoSourcesByClipId = syncSharedRendererExternalVideoSources({
        session: sharedRendererPreviewSession,
        objects,
        entries: sharedRendererExternalVideoSourcesRef.current,
        isPlaying,
        onFrameReady: requestSharedRendererExternalVideoFrameRepaint,
      });
    }
    sharedRendererPresenterStartCountRef.current += 1;
    liveDatasets.forEach((dataset) => {
      dataset.uxfdSharedRendererPresenterStartCount = String(sharedRendererPresenterStartCountRef.current);
    });
    sharedRendererPresenterStartingRef.current = true;

    void startSharedRendererViewportPresenter({
      canvas: surfaceCanvas,
      session: sharedRendererPreviewSession,
      datasets: stagedDatasets,
      diagnosticSwatchEnabled: sharedRendererDiagnosticSwatchEnabled,
      videoCutoverEnabled: sharedRendererVideoCutoverEnabled,
      nativeRenderPreviewEnabled: sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled,
      preferNativeRenderUpload: rustVideoOnlyEnabled,
      requireSharedRendererVideo: sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled,
      requireRustVideoControlPlane: rustVideoOnlyEnabled,
      skipDecodedVideoUploadForBenchmark: phase0SkipDecodedUploadEnabled,
      sharedRendererWriteTextureNoOpEnabled: phase0WriteTextureNoOpEnabled,
      discardNativeRenderOutputForBenchmark: phase0DiscardNativeRenderOutputEnabled,
      nativeOverlayPreviewEnabled,
      presentNativeOverlayDecodedFrame: nativeOverlayPreviewEnabled
        ? (input) => prepareSharedRendererViewportNativeOverlayPresent({
          ...input,
          nativeOverlayBridge: window.nativeOverlay,
          rustBackendBridge: window.rustBackend,
        })
        : undefined,
      activeVideoDecodeJob: rustPreviewDecodeEnabled
        ? sharedRendererVideoDecodeJobsRef.current[0] ?? null
        : null,
      activeVideoDecodeJobs: rustPreviewDecodeEnabled
        ? sharedRendererVideoDecodeJobsRef.current
        : [],
      // Keep the decode job resolution and slot count stable across play/pause so
      // the streaming ffmpeg decoder stays warm. Switching to full-res on pause
      // changed the jobId, evicting (decode.stop) the warm preview decoder and
      // forcing a cold restart on every play/pause/seek — the firstFrame bursts
      // and 1920px churn seen in UXFD_DECODE_TRACE. Preview always decodes at the
      // playback (preview) resolution; full-res stays the export path's concern.
      videoDecodeSlotCount: SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT,
      videoDecodeMaxEdge: SHARED_RENDERER_PLAYBACK_DECODE_MAX_EDGE,
      requestId: (sharedRendererVideoDecodeRequestIdRef.current += 1),
      sharedRendererExternalVideoSourcesByClipId: !rustVideoOnlyEnabled && externalVideoSourcesByClipId.size > 0
        ? externalVideoSourcesByClipId
        : undefined,
      onVideoDecodeJobResolved: (job) => {
        sharedRendererVideoDecodeJobsRef.current = job ? [job] : [];
      },
      onVideoDecodeJobsResolved: (jobs) => {
        sharedRendererVideoDecodeJobsRef.current = jobs;
      },
      isStartCurrent: () => !cancelled,
    }).then(({ control, activeVideoDecodeJobs }) => {
      if (cancelled) {
        control.dispose();
        return;
      }
      if (isPlaying && previousPresenterControl?.ok && !control.ok) {
        control.dispose();
        sharedRendererVideoDecodeJobsRef.current = activeVideoDecodeJobs;
        setSharedRendererPreviewDiagnostic(buildSharedRendererPreviewDiagnostic(rootDataset, previousPresenterControl));
        updateSharedRendererSolidColourObjectIds(previousPresenterControl.solidColourOwnership.solidColourObjectIds);
        updateSharedRendererImageObjectIds(previousPresenterControl.imageOwnership.imageObjectIds);
        updateSharedRendererPsdObjectIds(previousPresenterControl.psdOwnership.psdObjectIds);
        updateSharedRendererGeneratedEffectObjectIds(previousPresenterControl.generatedEffectObjectIds);
        return;
      }
      if (stagePresenterDiagnostics) {
        stagedDatasets.forEach((dataset, index) => {
          copySharedRendererPresenterDiagnostics(dataset, liveDatasets[index]);
        });
      }
      sharedRendererVideoDecodeJobsRef.current = activeVideoDecodeJobs;
      currentControl = control;
      if (sharedRendererPresenterControlRef.current && sharedRendererPresenterControlRef.current !== control) {
        sharedRendererPresenterControlRef.current.dispose();
      }
      sharedRendererPresenterControlRef.current = control;
      setSharedRendererPreviewDiagnostic(buildSharedRendererPreviewDiagnostic(rootDataset, control));
      updateSharedRendererSolidColourObjectIds(control.ok ? control.solidColourOwnership.solidColourObjectIds : []);
      updateSharedRendererImageObjectIds(control.ok ? control.imageOwnership.imageObjectIds : []);
      updateSharedRendererPsdObjectIds(control.ok ? control.psdOwnership.psdObjectIds : []);
      updateSharedRendererGeneratedEffectObjectIds(control.ok ? control.generatedEffectObjectIds : []);
    }).catch((error) => {
      if (cancelled) return;
      const detail = error instanceof Error
        ? `${error.message}${error.stack ? `\n${error.stack}` : ''}`
        : String(error);
      console.error('[SharedRenderer] presenter start failed:', detail);
      updateSharedRendererSolidColourObjectIds([]);
      updateSharedRendererImageObjectIds([]);
      updateSharedRendererPsdObjectIds([]);
      stagedDatasets.forEach((dataset) => {
        writeSharedRendererPresenterDiagnostics(dataset, {
          status: 'fallback',
          reason: 'presenterStartFailed',
          nativeRenderFailureReason: 'presenterStartFailed',
          nativeRenderFailureDetail: detail,
        });
      });
      setSharedRendererPreviewDiagnostic(buildSharedRendererPreviewDiagnostic(rootDataset, null));
    }).finally(() => {
      if (cancelled) return;
      sharedRendererPresenterStartingRef.current = false;
      const pendingSession = sharedRendererPendingPreviewSessionRef.current;
      const pendingSessionKey = sharedRendererPendingPresenterSessionKeyRef.current;
      sharedRendererPendingPreviewSessionRef.current = null;
      sharedRendererPendingPresenterSessionKeyRef.current = null;
      if (pendingSession && pendingSessionKey && pendingSessionKey !== presenterSessionKey) {
        sharedRendererPresenterSessionKeyRef.current = pendingSessionKey;
        setSharedRendererPreviewSession(pendingSession);
      } else if (pendingSession && pendingSessionKey && !rustVideoOnlyEnabled && isSharedRendererExternalVideoOnlySession(pendingSession)) {
        const control = sharedRendererPresenterControlRef.current;
        if (control?.ok && control.presentExternalVideoFrameScene) {
          const sourcesByClipId = syncSharedRendererExternalVideoSources({
            session: pendingSession,
            objects,
            entries: sharedRendererExternalVideoSourcesRef.current,
            isPlaying,
          });
          control.presentExternalVideoFrameScene?.({
            session: pendingSession,
            sourcesByClipId,
          });
          publishSharedRendererExternalVideoPresentationDiagnostics(
            pendingSession,
            liveDatasets,
            sharedRendererPresenterStartCountRef.current
          );
          setSharedRendererPreviewDiagnostic(buildSharedRendererPreviewDiagnostic(rootDataset, control));
        }
      }
    });

    return () => {
      cancelled = true;
      const nextPlaybackState = useStore.getState().isPlaying;
      if (
        nextPlaybackState
        && currentControl?.ok
        && sharedRendererPresenterControlRef.current === currentControl
      ) {
        return;
      }
      currentControl?.dispose();
      if (sharedRendererPresenterControlRef.current === currentControl) {
        sharedRendererPresenterControlRef.current = null;
      }
    };
  }, [isExporting, isPlaying, objects, requestSharedRendererExternalVideoFrameRepaint, rustVideoOnlyEnabled, sharedRendererDiagnosticSwatchEnabled, sharedRendererPreviewEnabled, sharedRendererPreviewSession, sharedRendererVideoCutoverEnabled, updateSharedRendererGeneratedEffectObjectIds, updateSharedRendererImageObjectIds, updateSharedRendererPsdObjectIds, updateSharedRendererSolidColourObjectIds]);

  // --- Main Render Logic ---
  const renderScene = useCallback((time: number, currentObjects: TimelineObject[]) => {
    const app = pixiAppRef.current;
    if (!app) return;

    const currentPixiObjects = pixiObjectsRef.current;
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
          audioBuffers: audioBuffersRef.current,
          allObjects: currentObjects,
          isExporting,
          isPlaying,
          setRenderTick,
          sharedRendererSolidColourObjectIds: sharedRendererSolidColourObjectIdsRef.current,
          sharedRendererImageObjectIds: sharedRendererImageObjectIdsRef.current,
          sharedRendererPsdObjectIds: sharedRendererPsdObjectIdsRef.current,
          sharedRendererGeneratedEffectObjectIds: sharedRendererGeneratedEffectObjectIdsRef.current,
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
    rustVideoOnlyEnabled,
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
    const legacyExportCanvas = pixiAppRef.current?.canvas;
    return legacyExportCanvas != null ? (legacyExportCanvas as HTMLCanvasElement) : null;
  }, []);

  const getRustExportFrameSource = useCallback((context: ProjectExportRustFrameSourceContext) => buildViewportRustExportFrameSource({
    exportEnabled: sharedRendererExportEnabled,
    canvas: sharedRendererSurfaceCanvasRef.current,
    projectSettings,
    layers,
    editorMode,
    webGpuAvailable: sharedRendererGpuStatus.webGpuAvailable,
    fallbackAdapter: sharedRendererGpuStatus.fallbackAdapter,
    videoCutoverEnabled: sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled,
    hasVideoObjects: context.hasVideoObjects,
    hasNativeRenderMediaObjects: context.hasNativeRenderMediaObjects,
    objects: context.objects,
    time: context.time,
    preferEncodeOnly: context.preferEncodeOnly,
    presentedFrameSharedFrameTaker: context.presentedFrameSharedFrameTaker,
    onFrameSourceUnavailable: context.onFrameSourceUnavailable,
    diagnosticsDataset: document.documentElement.dataset as Record<string, string | undefined>,
  }), [
    editorMode,
    layers,
    projectSettings,
    sharedRendererExportEnabled,
    sharedRendererGpuStatus.fallbackAdapter,
    sharedRendererGpuStatus.webGpuAvailable,
    sharedRendererVideoCutoverEnabled,
    rustVideoOnlyEnabled,
  ]);
  
  useProjectExport(renderScene, getExportCanvas, getRustExportFrameSource);

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
  const hasVideoObjects = objects.some((object) => object.type === 'video');

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
              {sharedRendererPreviewDiagnostic && hasVideoObjects && (
                <div className="shared-renderer-preview-diagnostics" role="status" aria-live="polite">
                  {sharedRendererPreviewDiagnostic}
                </div>
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
