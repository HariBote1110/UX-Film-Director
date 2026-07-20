import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { TimelineObject, VideoObject } from '../types';
import { ThreeStageViewport, type BillboardTextureEntry, type ThreeStageViewportHandle } from './ThreeStageViewport';
import {
  fetchPsdCompositeCanvas,
  psdBillboardCacheKey,
  selectWorldPlacedPsdBillboards,
} from '../utils/psdBillboardSync';
import { shallow } from 'zustand/shallow';

import { useSceneInteraction } from '../hooks/useSceneInteraction';
import { hitTestSceneObjects, type SceneHitTestViewport } from '../utils/sceneHitTest';
import { createStablePointerSubscription } from '../utils/sceneInteractionLogic';
import { SceneSelectionOverlay } from './SceneSelectionOverlay';
import { useProjectExport } from '../hooks/useProjectExport';
import { useVisionRealtimeDetection } from '../hooks/useVisionRealtimeDetection';
// PixiJS 排除計画 Phase 4: グループ変形・振動は Pixi 非依存の sceneTransforms を直接参照する。
import { getGroupTransforms, getVibrationOffset } from '../utils/sceneTransforms';
import { evaluateObjectPositionAtTime } from '../utils/keyframes';
import { useTranslation } from '../i18n';
import { computePreviewDisplayScale } from '../utils/previewDisplayScale';
import { buildVisionDetectionOverlayBoxes } from '../utils/visionDetectionOverlayGeometry';
import { measureTextBoxSize } from '../utils/textBoxMeasurement';
import {
  buildSharedRendererPreviewSession,
  collectSharedRendererGeneratedEffectObjectIdsFromSession,
  type SharedRendererPreviewSession,
} from '../utils/sharedRendererPreviewSession';
import { buildSharedRendererPresenterSessionKey } from '../utils/sharedRendererPresenterSessionKey';
import { buildSharedRendererVideoMediaReadiness } from '../utils/sharedRendererVideoMediaReadiness';
import {
  getSharedRendererSolidSwatchCssColour,
  isTransientExternalVideoPresentationFailure,
  type SharedRendererPreviewPresenterControl,
} from '../utils/sharedRendererPreviewPresenterController';
import { writeSharedRendererPresenterDiagnostics } from '../utils/sharedRendererPresenterDiagnostics';
import {
  startSharedRendererViewportPresenter,
  resolveNativeOverlayTransparentClearTransition,
  NATIVE_OVERLAY_TRANSPARENT_CLEAR_INITIAL_STATE,
  type NativeOverlayTransparentClearState,
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
  SHARED_RENDERER_PLAYBACK_PREVIEW_FPS,
  quantiseSharedRendererPlaybackPreviewTime,
  resolveSharedRendererPlaybackDecodeMaxEdge,
  type SharedRendererPlaybackDrawableSize,
} from '../utils/sharedRendererPlaybackPreviewSettings';
import { resolveSharedRendererNativeReuseReplayTime } from '../utils/sharedRendererNativeReuseCadence';
import {
  createSharedRendererExternalVideoSource,
  syncSharedRendererExternalVideoPlayback,
  type SharedRendererExternalVideoPlaybackState,
  type SharedRendererExternalVideoSource,
} from '../utils/sharedRendererExternalVideoSource';
import { toFileProtocolUrl } from '../utils/mediaMetadata';
import {
  resolveSharedRendererExternalVideoMasterClockSnapTime,
  type SharedRendererExternalVideoMasterClockCandidate,
} from '../utils/sharedRendererExternalVideoMasterClock';
import { resolveSharedRendererPresenterRestartSession } from '../utils/sharedRendererPresenterRestartSession';
import { buildNativeOverlayAttachRect } from '../utils/nativeOverlayViewportGeometry';
import {
  NATIVE_OVERLAY_ATTACH_POLL_INTERVAL_MS,
  buildNativeOverlayAttachKey,
  shouldPollNativeOverlayAttach,
} from '../utils/nativeOverlayAttachPolling';
import {
  buildSelectionDecorationQuads,
  createNativeOverlaySelectionDecorationSender,
  shouldSendStandaloneDecoration,
  type SelectionDecorationSendState,
} from '../utils/nativeOverlaySelectionDecoration';
import { notifyNativeOverlaySceneCleared } from '../utils/sharedRendererRustVideoUploadPipeline';

const SHARED_RENDERER_EXTERNAL_VIDEO_PLAYING_SYNC_INTERVAL_MS = 75;
// 一時停止時にヘッドを表示フレームへスナップする最小デルタ（秒）。これ未満は
// 体感できないうえ無駄な再レンダーを誘発するため無視する。
const PAUSE_SNAP_MIN_DELTA_SECONDS = 0.004;

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

// 図形（SolidColour/GeneratedGradient/Image/Psd/Text 等の非 Video メディア）
// だけで構成されたセッションかどうかを判定する。選択枠は native overlay
// （child NSWindow）へ約1ms/回で present され即座に追従するが、矩形などの
// 図形本体は DOM 側の WebGPU canvas（sharedRendererSurfaceCanvas）に描かれ、
// 従来は isSharedRendererExternalVideoOnlySession が false になるため
// reuse 経路に乗れず presenterKey に transform が含まれ、毎 pointermove で
// presenter がフル再起動（実測約28ms/回）していた。枠（1ms）と本体（28ms+）
// のレート・レイテンシ差がドラッグ中の「枠と本体のずれ」として見えていた。
// video-only 判定と対になるこの述語を使い、非 video セッションも
// canReuseNativeRenderPresenter の reuse 対象へ広げてこのずれを解消する。
// 混在セッション（video と図形が同居）はどちらの述語にも該当せず、
// 従来どおりフル再起動のままとなる（今回の対象外）。
const isSharedRendererNativeRenderOnlySession = (session: SharedRendererPreviewSession): boolean => {
  if (!session.surfaceGate.ok || session.surfaceGate.snapshot.clips.length === 0) return false;

  const mediaKindById = new Map(session.surfaceGate.media.map((media) => [media.id, media.kind]));
  return session.surfaceGate.snapshot.clips.every((clip) => mediaKindById.get(clip.media_id) !== 'Video');
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

/**
 * presenter 起動中（sharedRendererPresenterStartingRef）に publish された
 * セッションを即 setSharedRendererPreviewSession せず pending へ退避すべきかを
 * 判定する。
 *
 * 図形ドラッグ中は毎 pointermove で publishSharedRendererPreviewSession が
 * 呼ばれ、図形を含むセッションは presenterKey に transform が含まれるため
 * ほぼ毎回 key が変化する。以前は isPlaying（再生中）限定でこの退避を行って
 * いたため、一時停止中のドラッグでは毎 move が setSharedRendererPreviewSession
 * を呼び、起動 useEffect の cleanup が前回の startSharedRendererViewportPresenter
 * を cancel する「起動→キャンセル→起動→キャンセル…」の連鎖に陥り、move が
 * 続く間は一度も present が完了しなかった（症状B）。
 *
 * 再生中限定にしていた理由（proxy 連続再生の presenter 使い回し）は起動中か
 * どうかにのみ依存し、isPlaying 自体を条件にする必然性はない。起動中は常に
 * 退避することで、この起動キャンセル連鎖を再生中・一時停止中の両方で解消する。
 * 退避したセッションは .finally の pending replay 機構
 * （pendingSessionKey !== presenterSessionKey なら再起動）で順次消化される。
 */
export const shouldDeferSharedRendererPreviewSessionPublish = (
  presenterStarting: boolean,
): boolean => presenterStarting;

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
  masterClockHeadTimeSeconds,
  onMasterClockSnap,
}: {
  session: SharedRendererPreviewSession;
  objects: TimelineObject[];
  entries: Map<string, SharedRendererExternalVideoSourceEntry>;
  isPlaying: boolean;
  onFrameReady?: () => void;
  onPauseSnap?: (deltaSeconds: number) => void;
  /** 吸着判定に使う非量子化のタイムラインヘッド秒（store の currentTime）。 */
  masterClockHeadTimeSeconds?: number;
  /**
   * 二重クロック対策（発見1）— 再生中、primary（z_index 最小の再生中 video）
   * のメディアクロックから逆算したタイムライン時刻がヘッドと1プレビュー
   * フレームを超えて乖離したとき、その時刻を渡して呼ばれる。呼び出し側は
   * setTime でヘッドを吸着させる。pauseSnap（onPauseSnap、play→pause 縁で
   * のみ発火）の再生中版に相当し、両者は isPlaying で相互排他。
   */
  onMasterClockSnap?: (timelineTimeSeconds: number) => void;
}): Map<string, unknown> => {
  const sourcesByClipId = new Map<string, unknown>();
  if (!session.surfaceGate.ok) {
    disposeSharedRendererExternalVideoSources(entries);
    return sourcesByClipId;
  }

  const objectsById = new Map(objects.map((object) => [object.id, object]));
  const mediaById = new Map(session.surfaceGate.media.map((media) => [media.id, media]));
  const activeClipIds = new Set<string>();
  const masterClockCandidates: SharedRendererExternalVideoMasterClockCandidate[] = [];
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

    // 二重クロック対策（発見1）— 再生中のマスタークロック候補を収集する。
    // element がこの tick で seek された直後（sought=true）は currentTime が
    // seek 先そのもの（ヘッド由来）を返すため吸着判定は自然に閾値内となり、
    // ユーザーの再生中シークと競合しない。
    if (isPlaying && onMasterClockSnap) {
      masterClockCandidates.push({
        clipId: clip.clip_id,
        zIndex: clip.z_index,
        elementCurrentTimeSeconds: entry.source.source.currentTime,
        clipStartTimeSeconds: object.startTime,
        clipOffsetSeconds: object.offset ?? 0,
        isElementPlaying: entry.playbackState.mode === 'playing',
      });
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

  if (isPlaying && onMasterClockSnap && typeof masterClockHeadTimeSeconds === 'number') {
    const masterClockSnapTime = resolveSharedRendererExternalVideoMasterClockSnapTime({
      candidates: masterClockCandidates,
      headTimeSeconds: masterClockHeadTimeSeconds,
      previewFps: SHARED_RENDERER_PLAYBACK_PREVIEW_FPS,
    });
    if (masterClockSnapTime !== null) {
      onMasterClockSnap(masterClockSnapTime);
    }
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

// Both the persistent status and any transient-skip debug fields
// (uxfdSharedRendererPresenterTransientSkips / ...LastTransientSkipReason)
// live on this dataset, but only the persistent status/failure fields feed
// the banner below — the write site (sharedRendererPreviewPresenterController.ts)
// is responsible for keeping transient, one-tick events out of them so this
// function does not need its own display-side whitelist.
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

export { isTransientExternalVideoPresentationFailure };

const Viewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportShellRef = useRef<HTMLDivElement>(null);
  const threeStageRef = useRef<ThreeStageViewportHandle | null>(null);
  // PSD ビルボードの合成キャッシュ: cacheKey（filePath::activeLayerIds）→
  // 合成済み canvas。rust-backend への psd.renderComposite は非同期・IO束縛
  // のため、renderScene 同期呼び出しの中では「今あるキャッシュをそのまま
  // syncBillboards に渡し、未取得/古いキーだけ裏で取りに行く」stale-while-
  // revalidate 方式にする（毎フレーム同期待ちしてプレビューを止めない）。
  const psdBillboardCanvasCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const psdBillboardFetchInFlightRef = useRef<Set<string>>(new Set());
  const sharedRendererSurfaceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sharedRendererPresenterControlRef = useRef<SharedRendererPreviewPresenterControl | null>(null);
  const sharedRendererPresenterSessionKeyRef = useRef<string | null>(null);
  const sharedRendererPresenterStartingRef = useRef(false);
  const sharedRendererPresenterStartCountRef = useRef(0);
  const sharedRendererPendingPreviewSessionRef = useRef<SharedRendererPreviewSession | null>(null);
  // 毎 publish で更新される最新セッション。presenter のフル再起動（play⇄pause
  // 等）が、presenterKey 変化時にしか更新されない state の stale セッション
  // （＝最後に再起動した時点のフレーム）を present しないための正本
  // （resolveSharedRendererPresenterRestartSession のコメント参照）。
  const sharedRendererLatestPublishedPreviewSessionRef = useRef<SharedRendererPreviewSession | null>(null);
  const sharedRendererPendingPresenterSessionKeyRef = useRef<string | null>(null);
  const sharedRendererVideoDecodeJobsRef = useRef<SharedRendererViewportVideoDecodeJob[]>([]);
  const sharedRendererVideoDecodeRequestIdRef = useRef(0);
  // Single-flight guard for the rust-only native render reuse path: at most one
  // decode+present is in flight at a time so a slow tick cannot issue a second,
  // out-of-order frame request (the backwardSeek collisions that restart the
  // streaming decoder). `pending` holds the latest dropped tick to replay once.
  const sharedRendererNativeReusePreparingRef = useRef(false);
  // 再生 tick の replay 予約。objects は保持しない（replay は常に
  // latestObjectsRef.current を使う — スナップショットだと in-flight 中の
  // クリップ削除を巻き戻してしまう）。
  const sharedRendererNativeReusePendingRef = useRef<{ time: number } | null>(null);
  const sharedRendererNativeReuseLastPreviewTimeRef = useRef<number | null>(null);
  // Native overlay attach rect の drawable ピクセルサイズ（CSS pt × dpr）。
  // preview decode edge を drawable 長辺に追従させるための正本値。attach 毎に更新し、
  // detach（unmount）で null に戻すと decode edge は 720 フォールバックへ戻る。
  const nativeOverlayDrawableSizeRef = useRef<SharedRendererPlaybackDrawableSize | null>(null);
  // Bug F — playhead が動画クリップを含まない位置へ遷移したときだけ native
  // overlay の drawable を transparent clear するための clear-once ガード。
  // resolveNativeOverlayTransparentClearTransition が返す next 状態を保持し、
  // 毎tick繰り返しclearしないようにする（動画が再度現れたら再アームされる）。
  const nativeOverlayTransparentClearStateRef = useRef<NativeOverlayTransparentClearState>(
    NATIVE_OVERLAY_TRANSPARENT_CLEAR_INITIAL_STATE
  );
  const sharedRendererExternalVideoSourcesRef = useRef<Map<string, SharedRendererExternalVideoSourceEntry>>(new Map());
  const sharedRendererSolidColourObjectIdsRef = useRef<Set<string>>(new Set());
  const sharedRendererImageObjectIdsRef = useRef<Set<string>>(new Set());
  const sharedRendererPsdObjectIdsRef = useRef<Set<string>>(new Set());
  const sharedRendererGeneratedEffectObjectIdsRef = useRef<Set<string>>(new Set());
  const sharedRendererTextObjectIdsRef = useRef<Set<string>>(new Set());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const [renderTick, setRenderTick] = useState(0);
  const [panelSize, setPanelSize] = useState({ w: 0, h: 0 });
  const sharedRendererPreviewEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_PREVIEW !== '0';
  const sharedRendererExportEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_EXPORT !== '0';
  const sharedRendererDiagnosticSwatchEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_DIAGNOSTIC_SWATCH === '1';
  const sharedRendererVideoCutoverEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER !== '0';
  const nativeOverlayPreviewEnabled = import.meta.env.VITE_UXFD_NATIVE_OVERLAY !== '0';
  // 選択デコレーション — SVG（SceneSelectionOverlay）は child NSWindow 化された
  // native overlay に隠れるため、選択枠・ハンドルの見た目は addon 側で描く。
  // true の間は SVG を透明化（不可視だが操作可能）し、addon 不可用・attach
  // 失敗時は false に戻して SVG の可視スタイルへフォールバックする。
  const [nativeSelectionDecorationActive, setNativeSelectionDecorationActive] = useState(false);
  // attach は resize 等で作り直され addon 側の decoration state が失われ得る
  // ため、attach 成功 tick を dedupe 鍵に含めて同値 quad でも再送する。
  const [nativeOverlayAttachTick, setNativeOverlayAttachTick] = useState(0);
  const selectionDecorationSenderRef = useRef(
    createNativeOverlaySelectionDecorationSender((payload) =>
      window.nativeOverlay!.setSelectionDecoration(payload)),
  );
  // 症状B（本体フレームと選択枠 present が独立2チャネルのためドラッグ中に
  // ズレる不具合）対策 — shouldSendStandaloneDecoration が「前回 tick から
  // 何が変化したか」を判定するための直近状態。
  const selectionDecorationSendStateRef = useRef<SelectionDecorationSendState | null>(null);
  const rustVideoOnlyEnabled = import.meta.env.VITE_UXFD_RUST_VIDEO_ONLY === '1';
  // 二重クロック対策（発見1）の逃げ道 — 実機で吸着が不自然に見えた場合は
  // VITE_UXFD_EXTERNAL_VIDEO_MASTER_CLOCK=0 で無効化して従来の rAF 積算のみに
  // 戻せる（既定は有効）。
  const externalVideoMasterClockEnabled = import.meta.env.VITE_UXFD_EXTERNAL_VIDEO_MASTER_CLOCK !== '0';
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
    let lastNativeOverlayAttachKey: string | null = null;
    const attach = () => {
      if (disposed) return;
      const viewportRect = previewElement.getBoundingClientRect();
      const visualViewport = window.visualViewport;
      const nextAttachRect = buildNativeOverlayAttachRect({
        viewportRect,
        contentHeight: visualViewport?.height ?? window.innerHeight,
        backingScaleFactor: window.devicePixelRatio,
        viewportOffsetLeft: visualViewport?.offsetLeft ?? 0,
        viewportOffsetTop: visualViewport?.offsetTop ?? 0,
      });
      const nextAttachKey = buildNativeOverlayAttachKey(nextAttachRect);
      // build_overlay_layer_contract（Rust）と同じ丸めで drawable ピクセルサイズを保持し、
      // preview decode edge を drawable 長辺に追従させる。
      nativeOverlayDrawableSizeRef.current = {
        width: Math.round(nextAttachRect.width * nextAttachRect.scaleFactor),
        height: Math.round(nextAttachRect.height * nextAttachRect.scaleFactor),
      };
      if (nextAttachKey === lastNativeOverlayAttachKey) return;
      lastNativeOverlayAttachKey = nextAttachKey;
      void window.nativeOverlay?.attach(nextAttachRect).then((response) => {
        if (disposed || !response?.attached) return;
        // attach 成功で addon 側の選択デコレーション state が失われている可能性が
        // あるため、tick を進めて同値 quad でも再送させる。
        setNativeOverlayAttachTick((tick) => tick + 1);
      });
    };

    attach();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(attach)
      : null;
    const visualViewport = window.visualViewport;
    const resolutionMediaQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      : null;
    observer?.observe(previewElement);
    window.addEventListener('resize', attach);
    visualViewport?.addEventListener('resize', attach);
    visualViewport?.addEventListener('scroll', attach);
    resolutionMediaQuery?.addEventListener('change', attach);
    document.addEventListener('fullscreenchange', attach);
    document.addEventListener('visibilitychange', attach);
    window.addEventListener('focus', attach);
    window.addEventListener('pageshow', attach);
    // 発見8 — サイズ不変の要素移動（兄弟ペインの開閉等のレイアウトシフト）は
    // 上記のどのイベントでも発火しないため、低頻度ポーリングで rect を再計算
    // して補完する。attach は key（buildNativeOverlayAttachKey）で冪等のため、
    // rect 不変のポーリング tick は IPC を発行しない。document.hidden 中は
    // スキップし、復帰は既存の visibilitychange リスナーが即時 attach で拾う。
    const attachPollTimerId = window.setInterval(() => {
      if (!shouldPollNativeOverlayAttach(document.hidden)) return;
      attach();
    }, NATIVE_OVERLAY_ATTACH_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(attachPollTimerId);
      observer?.disconnect();
      window.removeEventListener('resize', attach);
      visualViewport?.removeEventListener('resize', attach);
      visualViewport?.removeEventListener('scroll', attach);
      resolutionMediaQuery?.removeEventListener('change', attach);
      document.removeEventListener('fullscreenchange', attach);
      document.removeEventListener('visibilitychange', attach);
      window.removeEventListener('focus', attach);
      window.removeEventListener('pageshow', attach);
      nativeOverlayDrawableSizeRef.current = null;
      // Bug D case (ii) — Viewport unmount 時、detach が AppKit view を破棄
      // する前に transparent clear を発行して drawable を全 pixel alpha=0 に
      // する。呼び順は clear -> detach 必須（detach 後だと registry lookup
      // が失敗し drawable が古いまま残る）。
      void window.nativeOverlay?.clearSurface({});
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

  const updateSharedRendererTextObjectIds = useCallback((objectIds: string[]) => {
    const current = sharedRendererTextObjectIdsRef.current;
    const next = new Set(objectIds);
    const unchanged = current.size === next.size && [...current].every((objectId) => next.has(objectId));
    if (unchanged) return;
    sharedRendererTextObjectIdsRef.current = next;
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
    visionDetectionOverlay,
    projectId
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
    // Bug D case (iii) — project 切替を検知して Native Overlay drawable を
    // transparent clear するため、store の activeSceneId を projectId として
    // effect の deps に載せる。
    projectId: state.activeSceneId,
  }), shallow);

  useVisionRealtimeDetection();

  // Bug D case (i) — timeline objects が空集合に遷移したとき、Bug C で追加した
  // visual frame cache invalidator と Bug D の transparent clear を同じイベント源
  // から発火する。cache 消去（Bug C）だけでは drawable に present 済みの
  // 削除前フレームが残り続けるため、両方が必要。
  useEffect(() => {
    if (!nativeOverlayPreviewEnabled) return;
    if (objects.length !== 0) return;
    // session.surfaceGate.snapshot.clips.length === 0 を代表する条件として
    // timeline objects の空を用いる（objects が空なら surfaceGate も clips=[]）。
    notifyNativeOverlaySceneCleared(0);
    void window.nativeOverlay?.clearSurface({});
  }, [nativeOverlayPreviewEnabled, objects.length]);

  // Bug D case (iii) — projectId（activeSceneId）の変化を検出し、切替直後に
  // 前 project の drawable が一瞬映る競合を潰す。cache 消去も併発する。
  useEffect(() => {
    if (!nativeOverlayPreviewEnabled) return;
    notifyNativeOverlaySceneCleared(0);
    void window.nativeOverlay?.clearSurface({});
  }, [nativeOverlayPreviewEnabled, projectId]);

  const editorMode = projectSettings.editorMode ?? '2d';

  // 選択デコレーション（standalone チャネル）— 選択変更・時間変化のたびに
  // world quad を送る。値が不変なら sender が dedupe して IPC を発行しない。
  // 応答の success/attached で SVG の透明化（native 描画が生きている間のみ）
  // を切り替える。
  //
  // 症状B対策: native overlay の body co-delivery が有効な tick
  // （video-only セッションの reuse present 経路。publishSharedRendererPreviewSession
  // 内で selectionDecoration を presentNativeOverlaySharedFrame に同梱する）では、
  // objects/currentTime が変化した tick の送信を shouldSendStandaloneDecoration
  // がスキップする。body 側が同じ (objects, time) から計算した decoration を
  // 同じ present に同梱するため、ここで独立に送ると2チャネルが同じ native
  // overlay live surface へ競合 present してしまう（ドラッグ中に本体と選択枠
  // がズレる根本原因）。selectedIds のみの変化、および co-delivery 非対象
  // （図形のみ/混在セッションが使う DOM WebGPU canvas 経路など、本体が
  // native overlay の presentSharedFrame に一切乗らない場合）は従来どおり
  // standalone が唯一の配信経路であり続ける。
  useEffect(() => {
    if (
      !nativeOverlayPreviewEnabled
      || editorMode === '3d_stage'
      || typeof window.nativeOverlay?.setSelectionDecoration !== 'function'
    ) {
      setNativeSelectionDecorationActive(false);
      selectionDecorationSendStateRef.current = null;
      return;
    }
    const nativeOverlayBodyCoDeliveryEligible = rustVideoOnlyEnabled
      && sharedRendererPreviewSession != null
      && isSharedRendererExternalVideoOnlySession(sharedRendererPreviewSession);
    const nextSendState: SelectionDecorationSendState = {
      selectedIds,
      objects,
      time: currentTime,
      nativeOverlayBodyCoDeliveryEligible,
    };
    const shouldSend = shouldSendStandaloneDecoration(selectionDecorationSendStateRef.current, nextSendState);
    selectionDecorationSendStateRef.current = nextSendState;
    if (!shouldSend) return;
    const quads = buildSelectionDecorationQuads({
      selectedIds,
      objects,
      time: currentTime,
    });
    const pending = selectionDecorationSenderRef.current.update(
      {
        canvasWidth: projectSettings.width,
        canvasHeight: projectSettings.height,
        quads,
      },
      nativeOverlayAttachTick,
    );
    if (!pending) return;
    let cancelled = false;
    pending
      .then((response) => {
        if (cancelled) return;
        setNativeSelectionDecorationActive(Boolean(response?.success && response?.attached));
      })
      .catch(() => {
        if (cancelled) return;
        setNativeSelectionDecorationActive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    nativeOverlayPreviewEnabled,
    editorMode,
    selectedIds,
    objects,
    currentTime,
    projectSettings.width,
    projectSettings.height,
    nativeOverlayAttachTick,
    rustVideoOnlyEnabled,
    sharedRendererPreviewSession,
  ]);

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
  // 症状B対策 — publishSharedRendererPreviewSession（body co-delivery する
  // 選択デコレーションの算出に selectedIds を使う）の依存配列に selectedIds を
  // 直接載せると、選択変更のたびにコールバック identity が変わり、それに
  // 連動する再 publish effect が余分な decode+present（dedupe skip 前提でも
  // Rust バックエンドへの decode リクエスト自体は発生する）を毎回誘発して
  // しまう。ref 経由で読むことで、selectedIds の変化はここへ反映されつつ
  // publishSharedRendererPreviewSession 自体の identity は変えない
  // （latestObjectsRef と同じパターン）。
  const latestSelectedIdsRef = useRef(selectedIds);
  latestSelectedIdsRef.current = selectedIds;

  // インタラクションは useSceneInteraction（Pixi 非依存のヒットテスト・
  // ドラッグ・リサイズ）が担う（PixiJS 排除計画 Phase 3/4）。
  const sceneInteractionViewportRef = useRef<SceneHitTestViewport>({
    projectWidth: projectSettings.width,
    projectHeight: projectSettings.height,
    displayScale: 1,
    camera,
  });

  const {
    onPointerDown: onSceneObjectPointerDown,
    onPointerMove: onSceneObjectPointerMove,
    onPointerUp: onSceneObjectPointerUp,
    onResizeStart: onSceneResizeStart,
    onResizeMove: onSceneResizeMove,
    onResizeEnd: onSceneResizeEnd,
  } = useSceneInteraction(latestObjectsRef, sceneInteractionViewportRef);

  // ドラッグ／リサイズ中にポインタが preview 要素の外へ出ても追従できるよう、
  // window レベルで pointermove/pointerup を監視する（要素外に出ても継続する
  // 挙動を DOM イベントで再現する）。
  //
  // 購読自体は createStablePointerSubscription でマウント時に一度だけ行う。
  // onSceneObjectPointerMove 等は objects の更新（ドラッグ中は毎 pointermove
  // ごとに発生する）に伴い Viewport が再レンダーされるたびに新しい関数参照に
  // なるが、これを素朴に useEffect の依存配列へ載せて addEventListener/
  // removeEventListener すると、毎フレーム再登録が走り、その一瞬の空白で
  // ネイティブの pointermove イベントを取りこぼす（ドラッグ中に選択枠が消える・
  // オブジェクトがリアルタイムに追従しないという回帰の原因だった）。
  // ref 経由で「今呼ぶべきハンドラ」だけを都度更新することで、window への
  // 登録は不変に保つ。
  const latestScenePointerHandlersRef = useRef({
    onPointerMove: (e: PointerEvent) => {
      onSceneObjectPointerMove(e as unknown as React.PointerEvent);
      onSceneResizeMove(e as unknown as React.PointerEvent);
    },
    onPointerUp: () => {
      onSceneObjectPointerUp();
      onSceneResizeEnd();
    },
  });
  latestScenePointerHandlersRef.current = {
    onPointerMove: (e: PointerEvent) => {
      onSceneObjectPointerMove(e as unknown as React.PointerEvent);
      onSceneResizeMove(e as unknown as React.PointerEvent);
    },
    onPointerUp: () => {
      onSceneObjectPointerUp();
      onSceneResizeEnd();
    },
  };

  useEffect(() => {
    const unsubscribe = createStablePointerSubscription(window, () => latestScenePointerHandlersRef.current);
    return unsubscribe;
  }, []);

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
  // useSceneInteraction / SceneSelectionOverlay のヒットテスト・座標変換に
  // 用いる viewport 情報。projectSettings/camera/displayScale の変化に
  // 都度追従させる（sceneHitTest.ts の座標系契約どおり）。
  sceneInteractionViewportRef.current = {
    projectWidth: projectSettings.width,
    projectHeight: projectSettings.height,
    displayScale,
    camera,
  };
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

  // PixiJS 排除計画 Phase 4: PIXI Application の生成・破棄は撤去した。
  // preview の描画は native overlay（＋WebGPU presenter の surface canvas）に
  // 一本化され、音声要素の後始末のみ unmount 時に行う。
  useEffect(() => () => {
    audioElementsRef.current.forEach(audio => { audio.pause(); audio.src = ""; audio.load(); });
    audioElementsRef.current.clear();
  }, []);

  // PixiJS 排除計画 Phase 4: テキストの実測書き戻し。旧 PIXI Text の実測に
  // 代わり Canvas 2D の measureText で近似計測し、rustSceneSnapshot の
  // textMediaBox が参照する measuredWidth/measuredHeight を維持する。
  // 計測不能な環境では書き戻さず、textMediaBox のヒューリスティックに任せる。
  useEffect(() => {
    objects.forEach((object) => {
      if (object.type !== 'text') return;
      const size = measureTextBoxSize(object);
      if (!size) return;
      if (object.measuredWidth === size.width && object.measuredHeight === size.height) return;
      useStore.getState().updateObject(object.id, {
        measuredWidth: size.width,
        measuredHeight: size.height,
      });
    });
  }, [objects]);

  const publishSharedRendererPreviewSession = useCallback((time: number, currentObjects: TimelineObject[]) => {
    if (!sharedRendererPreviewEnabled) return;
    const rawPreviewTime = isPlaying
      ? quantiseSharedRendererPlaybackPreviewTime(time)
      : time;
    const previewTime = isPlaying
      && rustVideoOnlyEnabled
      && nativeOverlayPreviewEnabled
      && sharedRendererNativeReuseLastPreviewTimeRef.current !== null
      ? resolveSharedRendererNativeReuseReplayTime({
        requestedTime: sharedRendererNativeReuseLastPreviewTimeRef.current,
        pendingTime: rawPreviewTime,
        previewFps: SHARED_RENDERER_PLAYBACK_PREVIEW_FPS,
      })
      : rawPreviewTime;

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
    // presenter フル再起動時の present 対象の正本。reuse 経路（state 非更新）
    // 中でも毎 tick 最新化し、再起動が stale なフレームを出さないようにする。
    sharedRendererLatestPublishedPreviewSessionRef.current = session;
    // 症状B対策（本体フレームと選択枠 present が独立2チャネルのためズレる
    // 不具合）— native overlay の body co-delivery（video-only reuse present
    // 経路）が同梱する選択デコレーションを、body と全く同じ (currentObjects,
    // previewTime) から計算する。standalone 側（shouldSendStandaloneDecoration）
    // はこの present が body co-delivery を行う tick では送信をスキップする。
    const sessionSelectionDecoration = nativeOverlayPreviewEnabled
      ? {
        canvasWidth: projectSettings.width,
        canvasHeight: projectSettings.height,
        quads: buildSelectionDecorationQuads({
          selectedIds: latestSelectedIdsRef.current,
          objects: currentObjects,
          time: previewTime,
        }),
      }
      : undefined;
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
    // frame onto it. Originally required an all-video session; now also covers
    // all-non-video (shape/image/etc.) sessions so that dragging a shape does
    // not restart the presenter on every pointermove (see
    // isSharedRendererNativeRenderOnlySession comment for the ずれ this fixes).
    // Mixed video + non-video sessions match neither predicate and keep the
    // full-restart path.
    const canReuseNativeRenderPresenter = rustVideoOnlyEnabled
      && !isExporting
      && (isSharedRendererExternalVideoOnlySession(session) || isSharedRendererNativeRenderOnlySession(session));
    const nextPresenterKey = buildSharedRendererPresenterSessionKey(session, {
      includePlaybackFrame: !(canReuseExternalVideoPresenter || canReuseNativeRenderPresenter),
      // The native reuse path re-presents the full Rust-composited frame each
      // tick, so animated transform/opacity/effects must not churn the key.
      includeAnimatedSceneContent: !canReuseNativeRenderPresenter,
    });
    if (shouldDeferSharedRendererPreviewSessionPublish(sharedRendererPresenterStartingRef.current)) {
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
          // 二重クロック対策（発見1）— 再生中は primary video 要素のメディア
          // クロックをマスターとし、rAF 積算のヘッドが1プレビューフレームを
          // 超えて乖離したら setTime で吸着させる。setTime は再 publish を
          // 誘発するが、吸着後のヘッドはマスター時刻そのものなので次 tick の
          // 判定は閾値内に収束し発振しない（純関数テストで固定済み）。
          masterClockHeadTimeSeconds: externalVideoMasterClockEnabled
            ? useStore.getState().currentTime
            : undefined,
          onMasterClockSnap: externalVideoMasterClockEnabled
            ? (timelineTimeSeconds) => {
              useStore.getState().setTime(timelineTimeSeconds);
            }
            : undefined,
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
      // 図形（非 video）は DOM 側 WebGPU canvas に描画されるため、
      // nativeOverlayPreviewEnabled でも overlay 経路には乗せず常に
      // presentPreparedNativeRenderFrame サブパスを使う。overlay 経路は
      // video-only セッションに限定する。
      if (control?.ok && (
        (nativeOverlayPreviewEnabled && isSharedRendererExternalVideoOnlySession(session))
        || control.presentPreparedNativeRenderFrame
      )) {
        const presentPreparedNativeRenderFrame = control.presentPreparedNativeRenderFrame;
        if (sharedRendererNativeReusePreparingRef.current) {
          // A decode+present is already in flight; replay only the latest tick.
          sharedRendererNativeReusePendingRef.current = { time };
          return;
        }
        sharedRendererNativeReusePreparingRef.current = true;
        void (async () => {
          try {
            if (nativeOverlayPreviewEnabled && isSharedRendererExternalVideoOnlySession(session)) {
              if (session.surfaceGate.ok) {
                sharedRendererNativeReuseLastPreviewTimeRef.current = session.surfaceGate.snapshot.frame_index / projectSettings.fps;
              }
              const nativeOverlayReuseRequestId = (sharedRendererVideoDecodeRequestIdRef.current += 1);
              const result = await prepareSharedRendererViewportNativeOverlayPresent({
                session,
                requestId: nativeOverlayReuseRequestId,
                activeJob: sharedRendererVideoDecodeJobsRef.current[0] ?? null,
                slotCount: SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT,
                maxDecodeEdge: resolveSharedRendererPlaybackDecodeMaxEdge(nativeOverlayDrawableSizeRef.current),
                nativeOverlayBridge: window.nativeOverlay,
                rustBackendBridge: window.rustBackend,
                // クリップ削除等で presenter が再起動（requestId が進む）した後に
                // この in-flight present が完了して削除済みフレームで overlay を
                // 上書きするレースを防ぐ（Bug F clear の後だと残像が恒久化する）。
                isRequestCurrent: () => sharedRendererVideoDecodeRequestIdRef.current === nativeOverlayReuseRequestId,
                // 症状B対策 — この present と同じ (currentObjects, previewTime)
                // から計算した選択デコレーションを同梱する。
                selectionDecoration: sessionSelectionDecoration,
              });
              if (result.ok) {
                sharedRendererVideoDecodeJobsRef.current = [result.activeJob];
              } else if (result.reason === 'supersededRequest' || result.reason === 'supersededDecodeReleaseFailed') {
                // 追い越された tick は何もしない — presentation の所有権は
                // 新しい要求（再起動側）にある。ここで fallback 再起動すると
                // この tick が捕捉した古い session（削除済みクリップ入り）を
                // 復活させてしまう。decode jobs ref も新しい要求側が管理する。
              } else {
                sharedRendererVideoDecodeJobsRef.current = [];
                sharedRendererPresenterSessionKeyRef.current = null;
                setSharedRendererPreviewSession(session);
              }
              return;
            }
            if (!presentPreparedNativeRenderFrame) return;
            if (session.surfaceGate.ok) {
              sharedRendererNativeReuseLastPreviewTimeRef.current = session.surfaceGate.snapshot.frame_index / projectSettings.fps;
            }
            const result = await prepareSharedRendererViewportNativeRenderUpload({
              session,
              requestId: (sharedRendererVideoDecodeRequestIdRef.current += 1),
              activeJobs: sharedRendererVideoDecodeJobsRef.current,
              sourceSlotCount: SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT,
              maxDecodeEdge: resolveSharedRendererPlaybackDecodeMaxEdge(nativeOverlayDrawableSizeRef.current),
            });
            sharedRendererVideoDecodeJobsRef.current = result.activeJobs;
            if (result.ok) {
              // Pass the current tick's session so presenter diagnostics
              // (VideoPresentedFrameIndex etc.) advance with playback instead
              // of staying frozen at the frame the presenter first started on.
              await presentPreparedNativeRenderFrame(result.upload, { session });
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
              publishSharedRendererPreviewSessionRef.current?.(
                resolveSharedRendererNativeReuseReplayTime({
                  requestedTime: session.surfaceGate.ok
                    ? session.surfaceGate.snapshot.frame_index / projectSettings.fps
                    : pending.time,
                  pendingTime: pending.time,
                  previewFps: SHARED_RENDERER_PLAYBACK_PREVIEW_FPS,
                }),
                // pending tick 時点の objects スナップショットではなく replay
                // 時点の最新 objects を使う。スナップショットだと、in-flight 中に
                // 削除されたクリップ入りのセッションを再構築して presenter を
                // 再起動させ、削除済みフレームを復活させてしまう（.finally の
                // pending replay と同根の既存対策コメントも参照）。
                latestObjectsRef.current
              );
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
      // presenter 自体が止まるので Bug F の clear-once ガードも初期状態へ戻す。
      nativeOverlayTransparentClearStateRef.current = NATIVE_OVERLAY_TRANSPARENT_CLEAR_INITIAL_STATE;
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

    // 実機回帰「ポーズすると先頭フレームが表示される」対策 — 再起動時は
    // state（presenterKey 変化時にしか更新されず、reuse 経路の再生中 present では
    // 古びる）ではなく、毎 publish で更新される最新セッションを present する。
    // state は再起動トリガー（依存配列）としてのみ機能する。
    const presenterRestartSession = resolveSharedRendererPresenterRestartSession(
      sharedRendererLatestPublishedPreviewSessionRef.current,
      sharedRendererPreviewSession,
    );

    const rustPreviewDecodeEnabled = sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled;
    if (!rustPreviewDecodeEnabled) {
      sharedRendererVideoDecodeJobsRef.current = [];
    }
    updateSharedRendererSolidColourObjectIds([]);
    updateSharedRendererImageObjectIds([]);
    updateSharedRendererPsdObjectIds([]);
    updateSharedRendererTextObjectIds([]);

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
      session: presenterRestartSession,
      isExporting,
      rustVideoOnly: rustVideoOnlyEnabled,
    });
    // Mirrors canReuseNativeRenderPresenter above (video-only OR non-video-only)
    // so the pending-replay key comparison in .finally matches the key the
    // publish path stored for both reuse-eligible session shapes.
    const canReuseCurrentNativeRenderPresenter = rustVideoOnlyEnabled
      && !isExporting
      && (isSharedRendererExternalVideoOnlySession(presenterRestartSession)
        || isSharedRendererNativeRenderOnlySession(presenterRestartSession));
    const presenterSessionKey = buildSharedRendererPresenterSessionKey(presenterRestartSession, {
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
        session: presenterRestartSession,
        // objects を依存配列経由で受けると、ドラッグ中の毎 pointermove（store の
        // objects 参照が変わる）でこの effect 自体が cleanup（cancelled=true）→
        // 再実行され、起動→キャンセルの連鎖が復活してしまう。起動時点の最新
        // objects を ref から読むことで、意味を変えずに依存を外す。
        objects: latestObjectsRef.current,
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
      session: presenterRestartSession,
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
          // この再起動より新しい要求（さらに新しい再起動 / reuse tick）が
          // 始まっていたら、decode 完了後の present を抑止して古いフレームの
          // 上書きを防ぐ。
          isRequestCurrent: () => sharedRendererVideoDecodeRequestIdRef.current === input.requestId,
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
      // and 1920px churn seen in UXFD_DECODE_TRACE. Preview decodes at the
      // drawable-matched edge, which stays constant while the pane size is
      // unchanged (play/pause keeps reusing the warm decoder; only a pane
      // resize rebuilds the job); full-res stays the export path's concern.
      videoDecodeSlotCount: SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT,
      videoDecodeMaxEdge: resolveSharedRendererPlaybackDecodeMaxEdge(nativeOverlayDrawableSizeRef.current),
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
    }).then(({ control, activeVideoDecodeJobs, nativeOverlayPresentResult }) => {
      if (cancelled) {
        control.dispose();
        return;
      }
      // Bug F — playhead が動画クリップを含まない位置に確定して遷移した
      // （noVideoDecodeRequest）ときだけ overlay drawable を transparent
      // clear する。再生中の一時的な decode 失敗（frameDecodeFailed 等）
      // では直前フレームを保持してちらつきを避け、毎tickの再clearも避ける。
      if (nativeOverlayPreviewEnabled) {
        const { next, shouldClear } = resolveNativeOverlayTransparentClearTransition(
          nativeOverlayTransparentClearStateRef.current,
          nativeOverlayPresentResult
        );
        nativeOverlayTransparentClearStateRef.current = next;
        if (shouldClear) {
          notifyNativeOverlaySceneCleared(0);
          void window.nativeOverlay?.clearSurface({});
        }
      }
      if (isPlaying && previousPresenterControl?.ok && !control.ok) {
        control.dispose();
        sharedRendererVideoDecodeJobsRef.current = activeVideoDecodeJobs;
        setSharedRendererPreviewDiagnostic(buildSharedRendererPreviewDiagnostic(rootDataset, previousPresenterControl));
        updateSharedRendererSolidColourObjectIds(previousPresenterControl.solidColourOwnership.solidColourObjectIds);
        updateSharedRendererImageObjectIds(previousPresenterControl.imageOwnership.imageObjectIds);
        updateSharedRendererPsdObjectIds(previousPresenterControl.psdOwnership.psdObjectIds);
        updateSharedRendererTextObjectIds(previousPresenterControl.textOwnership.textObjectIds);
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
      updateSharedRendererTextObjectIds(control.ok ? control.textOwnership.textObjectIds : []);
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
      updateSharedRendererTextObjectIds([]);
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
            // replay 時点の最新 objects を ref から読む（起動時にクロージャへ
            // 捕捉した古い objects より意味的にも正しい）。依存配列に objects を
            // 含めない理由は起動側の sync のコメントを参照。
            objects: latestObjectsRef.current,
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
    // 依存配列に objects を含めない（latestObjectsRef.current 経由で読む）:
    // ドラッグ中は毎 pointermove で store の objects 参照が変わるため、objects を
    // 依存に含めると presenter 起動中でもこの effect が毎 move で cleanup →
    // 再実行され、in-flight の startSharedRendererViewportPresenter が cancel
    // され続けて一度も present が完了しない（症状B の起動キャンセル連鎖）。
    // objects の変化は publish 側 effect（deps: [currentTime, objects, ...]）が
    // 受けて session を再構築するので、presenter の再起動が必要な変化は
    // sharedRendererPreviewSession の変化としてここへ届く。
  }, [isExporting, isPlaying, requestSharedRendererExternalVideoFrameRepaint, rustVideoOnlyEnabled, sharedRendererDiagnosticSwatchEnabled, sharedRendererPreviewEnabled, sharedRendererPreviewSession, sharedRendererVideoCutoverEnabled, updateSharedRendererGeneratedEffectObjectIds, updateSharedRendererImageObjectIds, updateSharedRendererPsdObjectIds, updateSharedRendererSolidColourObjectIds, updateSharedRendererTextObjectIds]);

  // --- Main Render Logic ---
  // PixiJS 排除計画 Phase 4: 旧 Pixi シーングラフ描画は撤去した。ここでは
  // (1) 音声要素の生成・同期・後始末、(2) shared renderer への scene 発行、
  // (3) 3D ステージへの同期のみを行う（描画は native overlay / WebGPU
  // presenter が担う）。
  const renderScene = useCallback((time: number, currentObjects: TimelineObject[]) => {
    const currentAudioElements = audioElementsRef.current;
    const visibleObjects = currentObjects.filter((obj) => {
      if (layers[obj.layer]?.visible === false) return false;
      return time >= obj.startTime && time < obj.startTime + obj.duration;
    });

    // 1. Cleanup
    currentAudioElements.forEach((audio, id) => {
      if (!visibleObjects.find(obj => obj.id === id && obj.type === 'audio')) {
        audio.pause(); audio.src = ""; audio.load(); currentAudioElements.delete(id);
      }
    });

    // 2. Audio sync
    visibleObjects.forEach(obj => {
      if (obj.type !== 'audio') return;
      let audio = currentAudioElements.get(obj.id);
      if (!audio) {
        audio = new Audio(); audio.src = obj.src; audio.muted = obj.muted; audio.volume = obj.volume;
        audio.crossOrigin = 'anonymous'; audio.preload = 'auto'; currentAudioElements.set(obj.id, audio);
      }
      audio.volume = obj.volume; audio.muted = obj.muted;
      const offset = obj.offset || 0; const audioLocalTime = (time - obj.startTime) + offset;
      if (!isExporting) {
        if (isPlaying) {
          if (audio.paused) { const p = audio.play(); if (p) p.catch(() => {}); }
          if (Math.abs(audio.currentTime - audioLocalTime) > 0.2) audio.currentTime = audioLocalTime;
        } else {
          if (!audio.paused) audio.pause();
          if (Math.abs(audio.currentTime - audioLocalTime) > 0.05) audio.currentTime = audioLocalTime;
        }
      }
    });

    publishSharedRendererPreviewSession(time, currentObjects);

    const workspaceMode = useStore.getState().projectSettings.editorMode ?? '2d';
    if (workspaceMode === '3d_stage' && threeStageRef.current) {
      // PixiJS 排除計画 Phase 4 でラスタライズ手段（app.renderer.extract）を
      // 失っていたビルボードを、rust-backend の psd.renderComposite 経由で
      // 復活させる。取得は非同期のためキャッシュにある分だけ即時反映し、
      // 未取得/古いキーは裏で fetchPsdCompositeCanvas を叩いて次tickへ回す。
      const placedPsdObjects = selectWorldPlacedPsdBillboards(currentObjects);
      const cache = psdBillboardCanvasCacheRef.current;
      const inFlight = psdBillboardFetchInFlightRef.current;
      const liveCacheKeys = new Set<string>();

      const billboardEntries: BillboardTextureEntry[] = [];
      placedPsdObjects.forEach((psd) => {
        const cacheKey = psdBillboardCacheKey(psd);
        liveCacheKeys.add(cacheKey);
        const cachedCanvas = cache.get(cacheKey);
        if (cachedCanvas) {
          billboardEntries.push({
            id: psd.id,
            canvas: cachedCanvas,
            placement: psd.worldPlacement!,
            widthPx: cachedCanvas.width,
            heightPx: cachedCanvas.height,
          });
        }

        if (!cache.has(cacheKey) && !inFlight.has(cacheKey) && psd.filePath) {
          inFlight.add(cacheKey);
          fetchPsdCompositeCanvas(window.ipcRenderer, psd)
            .then((canvas) => {
              if (canvas) cache.set(cacheKey, canvas);
            })
            .catch(() => {
              /* ビルボード合成失敗時は次tickの再取得に委ねる */
            })
            .finally(() => {
              inFlight.delete(cacheKey);
            });
        }
      });

      // 使われなくなった cacheKey（PSD 削除・ファイル/レイヤー変更）は
      // メモリリークを防ぐため破棄する。
      for (const key of Array.from(cache.keys())) {
        if (!liveCacheKeys.has(key)) cache.delete(key);
      }

      threeStageRef.current.syncBillboards(billboardEntries, useStore.getState().stageCamera3D);
    }
  }, [
    isExporting,
    isPlaying,
    layers,
    publishSharedRendererPreviewSession,
  ]);

  useEffect(() => {
    if (!isExporting) renderScene(currentTime, objects);
  }, [
    currentTime,
    objects,
    renderScene,
    renderTick,
    isExporting,
  ]);

  const getExportCanvas = useCallback((): HTMLCanvasElement | null => {
    if (useStore.getState().projectSettings.editorMode === '3d_stage') {
      return threeStageRef.current?.getCanvas() ?? null;
    }
    // PixiJS 排除計画 Phase 4: 旧 Pixi canvas の legacy export 経路は撤去。
    // 2D の export フレームは getRustExportFrameSource（Rust 経路）が正で、
    // canvas ベースの fallback は shared renderer の surface canvas を返す。
    return sharedRendererSurfaceCanvasRef.current;
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

      // PixiJS 排除計画 Phase 4: 2D スナップショットは Pixi canvas ではなく
      // shared renderer の surface canvas から取得する（native overlay 主体の
      // シーンでは surface が透明のことがある点は実機検証観点として報告済み）。
      const surfaceCanvas = sharedRendererSurfaceCanvasRef.current;
      if (surfaceCanvas) {
          const dataUrl = surfaceCanvas.toDataURL('image/png');
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
            onPointerDown={(e) => {
              if (editorMode === '3d_stage') return;
              if (useStore.getState().isExporting) return;
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return;
              const cssX = e.clientX - rect.left;
              const cssY = e.clientY - rect.top;
              const hitId = hitTestSceneObjects({
                cssX,
                cssY,
                time: currentTime,
                objects: latestObjectsRef.current,
                viewport: sceneInteractionViewportRef.current,
                layers,
              });
              if (hitId) {
                onSceneObjectPointerDown(e, hitId);
              } else {
                clearSelection();
              }
            }}
            style={{
              width: '100%',
              height: '100%',
              visibility: editorMode === '3d_stage' ? 'hidden' : 'visible',
              pointerEvents: editorMode === '3d_stage' ? 'none' : 'auto',
            }}
          />
          {editorMode !== '3d_stage' && (
            <SceneSelectionOverlay
              selectedIds={selectedIds}
              objects={objects}
              time={currentTime}
              viewport={sceneInteractionViewportRef.current}
              width={previewW}
              height={previewH}
              visualsHidden={nativeSelectionDecorationActive}
              onHandlePointerDown={(objectId, corner, e) => {
                const targetObject = objects.find((o) => o.id === objectId);
                if (!targetObject) return;
                const size = (targetObject as unknown as { width?: number; height?: number });
                const bounds = { bx: 0, by: 0, bw: size.width ?? 100, bh: size.height ?? 100 };
                // 選択枠と同じ「コンテナのワールド変換」（base position + group
                // transforms + vibration, rotation/scale も group 積算込み）を使う。
                // sceneHitTest.ts の getObjectWorldCorners と同じ式。
                const base = evaluateObjectPositionAtTime(targetObject, currentTime);
                const groupEffects = getGroupTransforms(targetObject, currentTime, objects);
                const vib = getVibrationOffset(targetObject, currentTime);
                const rotationRad = ((targetObject.rotation || 0) + groupEffects.rotation) * (Math.PI / 180);
                onSceneResizeStart(e, objectId, corner, bounds, {
                  x: base.x + groupEffects.x + vib.x,
                  y: base.y + groupEffects.y + vib.y,
                  rotationRad,
                  scaleX: (targetObject.scaleX ?? 1) * groupEffects.scaleX,
                  scaleY: (targetObject.scaleY ?? 1) * groupEffects.scaleY,
                });
              }}
            />
          )}
          {/*
            Vision 検出枠（cat/dog 単フレーム検出プレビュー）。
            PixiJS 排除計画 Phase 4 で PIXI Graphics から SVG オーバーレイへ
            置き換えた（座標計算は visionDetectionOverlayGeometry.ts）。
          */}
          {editorMode !== '3d_stage'
            && !isExporting
            && !isSnapshotRequested
            && visionDetectionPreviewEnabled
            && visionDetectionOverlay
            && (() => {
              const targetVideo = objects.find(
                (object): object is VideoObject =>
                  object.type === 'video' && object.id === visionDetectionOverlay.videoId
              );
              if (!targetVideo) return null;
              const detection = buildVisionDetectionOverlayBoxes({
                video: targetVideo,
                overlay: visionDetectionOverlay,
                time: currentTime,
                objects,
                viewport: sceneInteractionViewportRef.current,
              });
              if (!detection) return null;
              return (
                <svg
                  data-testid="vision-detection-overlay"
                  width={previewW}
                  height={previewH}
                  viewBox={`0 0 ${previewW} ${previewH}`}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    overflow: 'visible',
                    opacity: detection.stale ? 0.42 : 1,
                  }}
                >
                  {detection.boxes.map((box, index) => (
                    <polygon
                      key={index}
                      points={box.points}
                      fill="none"
                      stroke={box.colour}
                      strokeWidth={5 * displayScale}
                    />
                  ))}
                </svg>
              );
            })()}
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
