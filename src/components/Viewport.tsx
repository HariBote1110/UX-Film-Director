import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { TimelineObject, VideoObject } from '../types';
import { ThreeStageViewport, type BillboardTextureEntry, type ThreeStageViewportHandle } from './ThreeStageViewport';
import {
  fetchPsdCompositeRgba,
  psdBillboardCacheKey,
  selectWorldPlacedPsdBillboards,
  type PsdCompositeRgba,
} from '../utils/psdBillboardSync';
import { shallow } from 'zustand/shallow';

import { useSceneInteraction } from '../hooks/useSceneInteraction';
import { hitTestSceneObjects, type SceneHitTestViewport } from '../utils/sceneHitTest';
import { createStablePointerSubscription } from '../utils/sceneInteractionLogic';
import { SceneSelectionDecorationLayer } from './SceneSelectionDecorationLayer';
import { VisionDetectionOverlayLayer } from './VisionDetectionOverlayLayer';
import { useProjectExport } from '../hooks/useProjectExport';
import { useVisionRealtimeDetection } from '../hooks/useVisionRealtimeDetection';
import { useTranslation } from '../i18n';
import { computePreviewDisplayScale } from '../utils/previewDisplayScale';
import { measureTextBoxSize } from '../utils/textBoxMeasurement';
import {
  buildSharedRendererPreviewSession,
  type SharedRendererPreviewSession,
} from '../utils/sharedRendererPreviewSession';
import { buildSharedRendererPreviewSessionFromEvaluatedScene } from '../utils/sharedRendererEvaluatedScenePreviewSession';
import { createEditableRustScenePreviewController, type EditableRustScenePreviewController } from '../utils/editableRustScenePreviewController';
import { createSharedRendererScenePreviewScheduler } from '../utils/sharedRendererScenePreviewScheduler';
import { evaluateRustBackendScene, replaceRustBackendScene } from '../utils/rustBackendSceneControl';
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
import {
  prepareSharedRendererViewportNativeRenderOverlayPresent,
  prepareSharedRendererViewportNativeRenderUpload,
} from '../utils/sharedRendererViewportNativeRenderUpload';
import {
  prepareSharedRendererViewportNativeOverlayPresent,
  type SharedRendererViewportVideoDecodeJob,
} from '../utils/sharedRendererViewportVideoUpload';
import type { ProjectExportRustFrameSourceContext } from '../utils/projectExportFrameCanvas';
import { buildViewportRustExportFrameSource } from '../utils/viewportRustExportFrameSource';
import { createResidentSceneExportFrameSource } from '../utils/residentSceneExportFrameSource';
import { shouldMountSharedRendererSurfaceCanvas } from '../utils/sharedRendererSurfaceMount';
import {
  SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT,
  SHARED_RENDERER_PLAYBACK_PREVIEW_FPS,
  quantiseSharedRendererPlaybackPreviewTime,
  resolveSharedRendererPlaybackDecodeMaxEdge,
  type SharedRendererPlaybackDrawableSize,
} from '../utils/sharedRendererPlaybackPreviewSettings';
import { resolveSharedRendererNativeReuseReplayTime } from '../utils/sharedRendererNativeReuseCadence';
import { shouldReuseSharedRendererNativeRenderPresenter } from '../utils/sharedRendererNativeRenderPresenterReuse';
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
import { psdImportTraceCollector } from '../perf/psdImportTrace';
import { isNativeOverlayDirectSceneSession } from '../utils/nativeOverlayDirectSceneEligibility';
import {
  NATIVE_OVERLAY_ATTACH_POLL_INTERVAL_MS,
  buildNativeOverlayAttachKey,
  shouldPollNativeOverlayAttach,
} from '../utils/nativeOverlayAttachPolling';
import { buildSelectionDecorationQuads } from '../utils/nativeOverlaySelectionDecoration';
import { notifyNativeOverlaySceneCleared } from '../utils/sharedRendererRustVideoUploadPipeline';
import { shouldPresentSharedRendererEmptyScenePresentation } from '../utils/sharedRendererViewportEmptyScenePresentation';
import { rendererSceneRpcCollector } from '../perf/rendererSceneRpcTrace';

const SHARED_RENDERER_EXTERNAL_VIDEO_PLAYING_SYNC_INTERVAL_MS = 75;
// 一時停止時にヘッドを表示フレームへスナップする最小デルタ（秒）。これ未満は
// 体感できないうえ無駄な再レンダーを誘発するため無視する。
const PAUSE_SNAP_MIN_DELTA_SECONDS = 0.004;

type SharedRendererPresenterDiagnosticDataset = Record<string, string | undefined>;

type SharedRendererPresenterStartCountWindow = typeof window & {
  __UXFD_SHARED_RENDERER_PRESENTER_START_COUNT__?: number;
};

type RustTimelineSceneRpcStatus = 'disabled' | 'pending' | 'ready' | 'blocked';

interface RustTimelineSceneRpcDiagnostics {
  status: RustTimelineSceneRpcStatus;
  projectId: string | null;
  detail?: string;
  requested?: number;
  resolved?: number;
  stale?: number;
  coalesced?: number;
  failed?: number;
}

interface RustNativePlaybackUiState {
  status: 'started' | 'playing' | 'paused' | 'stopped' | 'ended' | 'failed';
  currentTimeSeconds: number;
  frameIndex: number;
  isPlaying: boolean;
  reason?: string;
  diagnostics?: {
    requestedFrames: number;
    presentedFrames: number;
    skippedFrames: number;
    failedFrames: number;
    uiNotifications: number;
  };
}

const writeRustNativePlaybackDiagnostics = (state: RustNativePlaybackUiState) => {
  if (typeof document === 'undefined') return;
  const dataset = document.documentElement.dataset;
  dataset.uxfdRustPlaybackClockOwner = state.isPlaying ? 'main' : 'renderer';
  dataset.uxfdRustPlaybackStatus = state.status;
  dataset.uxfdRustPlaybackFrame = String(state.frameIndex);
  dataset.uxfdRustPlaybackTime = String(state.currentTimeSeconds);
  if (state.diagnostics) {
    dataset.uxfdRustPlaybackPresented = String(state.diagnostics.presentedFrames);
    dataset.uxfdRustPlaybackSkipped = String(state.diagnostics.skippedFrames);
    dataset.uxfdRustPlaybackFailed = String(state.diagnostics.failedFrames);
    dataset.uxfdRustPlaybackUiNotifications = String(state.diagnostics.uiNotifications);
  }
  (window as unknown as { __UXFD_RUST_PLAYBACK_CLOCK__?: RustNativePlaybackUiState })
    .__UXFD_RUST_PLAYBACK_CLOCK__ = state;
};

/** Rust常駐sceneの評価結果がある間は、Chromiumでsceneを再構築しない。 */
export const shouldBuildSharedRendererPreviewSessionForTick = (
  rustTimelineSceneRpcEnabled: boolean,
): boolean => !rustTimelineSceneRpcEnabled;

/**
 * currentTime tickをsubscribeリスナー内で即時実行してよいかの判定。
 * zustandのsetStateはリスナーを同期実行するため、currentTimeと構造系state
 * （objects/layers/isPlaying等）を単一set()で変えるアクション（switchScene等）
 * では、tickがReactコミット前に1レンダー分古いclosureで走ってしまう。
 * storeの構造系フィールドがコミット済みレンダーの値と一致するときだけ即時実行し、
 * 不一致（storeが先行）ならコミット後のcatch-up effectへ委ねる。
 */
export interface CurrentTimeTickRenderedState {
  objects: unknown;
  layers: unknown;
  isPlaying: boolean;
  isExporting: boolean;
  nativePlaybackActive: boolean;
  activeSceneId: unknown;
  projectSettings: unknown;
}
export const shouldDeferCurrentTimeTick = (
  state: CurrentTimeTickRenderedState,
  rendered: CurrentTimeTickRenderedState,
): boolean => (
  state.objects !== rendered.objects
  || state.layers !== rendered.layers
  || state.isPlaying !== rendered.isPlaying
  || state.isExporting !== rendered.isExporting
  || state.nativePlaybackActive !== rendered.nativePlaybackActive
  || state.activeSceneId !== rendered.activeSceneId
  || state.projectSettings !== rendered.projectSettings
);

/**
 * native reuse のfinallyは同期sceneを再構築するため、Rust常駐sceneの最新評価を
 * 追い越す可能性がある。flag中は次のscene.evaluate結果を待つ。
 */
export const shouldReplaySharedRendererNativeReusePending = (
  rustTimelineSceneRpcEnabled: boolean,
): boolean => !rustTimelineSceneRpcEnabled;

/**
 * export直後は外部動画要素を作り直すため、present可能になった通知
 * （sharedRendererExternalVideoFrameReadyTickのbump）がRust常駐scene再評価の
 * 唯一の復帰契機になる。
 */
export const shouldRequestRustTimelineSceneEvaluationForTick = (input: {
  rustTimelineSceneRpcEnabled: boolean;
  rustTimelineSceneRevisionAvailable: boolean;
  isExporting: boolean;
  nativePlaybackActive: boolean;
  isPlaying: boolean;
}): boolean => {
  if (!input.rustTimelineSceneRpcEnabled) return false;
  if (!input.rustTimelineSceneRevisionAvailable) return false;
  if (input.isExporting) return false;
  if (input.nativePlaybackActive && input.isPlaying) return false;
  return true;
};

const writeRustTimelineSceneRpcDiagnostics = (diagnostics: RustTimelineSceneRpcDiagnostics) => {
  if (typeof document === 'undefined') return;
  const dataset = document.documentElement.dataset as Record<string, string | undefined>;
  dataset.uxfdRustTimelineSceneRpcStatus = diagnostics.status;
  if (diagnostics.projectId) dataset.uxfdRustTimelineSceneRpcProjectId = diagnostics.projectId;
  else delete dataset.uxfdRustTimelineSceneRpcProjectId;
  if (diagnostics.detail) dataset.uxfdRustTimelineSceneRpcDetail = diagnostics.detail;
  else delete dataset.uxfdRustTimelineSceneRpcDetail;
  for (const key of ['requested', 'resolved', 'stale', 'coalesced', 'failed'] as const) {
    const value = diagnostics[key];
    const datasetKey = `uxfdRustTimelineSceneRpc${key[0].toUpperCase()}${key.slice(1)}`;
    if (typeof value === 'number') dataset[datasetKey] = String(value);
    else delete dataset[datasetKey];
  }
  (window as unknown as { __UXFD_RUST_TIMELINE_SCENE_RPC__?: RustTimelineSceneRpcDiagnostics })
    .__UXFD_RUST_TIMELINE_SCENE_RPC__ = diagnostics;
};

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

// Phase 3b Step 1 — 混在セッション（video と図形が同居）の判定。上の2述語は
// 「全 clip が同一種別」を要求し互いに排他的なので、混在セッションはどちらにも
// 該当しない残余集合として表せる。従来この残余は reuse 対象外でフル再起動
// （約28ms/回、毎 pointermove）していたが、render.nativeSharedFrame RPC は
// media kind を問わず任意の mix を合成できる汎用 RPC であり（フル restart
// 経路では現に混在セッションも正しく描けている）、reuse を妨げる技術的制約は
// 無かった。isSharedRendererNativeRenderReuseEligibleSession 相当を3述語の
// OR として表す（既存2述語の単体契約を壊さないため、単一の
// `surfaceGate.ok && clips.length>0` 判定への統合はしない）。
const isSharedRendererMixedNativeRenderSession = (session: SharedRendererPreviewSession): boolean => {
  if (!session.surfaceGate.ok || session.surfaceGate.snapshot.clips.length === 0) return false;

  return !isSharedRendererExternalVideoOnlySession(session)
    && !isSharedRendererNativeRenderOnlySession(session);
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
  const nativeRenderDecodePaths = dataset.uxfdSharedRendererPresenterNativeRenderDecodePaths;
  const nativeRenderPath = dataset.uxfdSharedRendererPresenterNativeRenderPath;
  const nativeRenderNv12ZeroCopyMediaIds =
    dataset.uxfdSharedRendererPresenterNativeRenderNv12ZeroCopyMediaIds;
  const hasNativeRenderPathDiagnostics = Boolean(
    nativeRenderDecodePaths || nativeRenderPath || nativeRenderNv12ZeroCopyMediaIds
  );

  if (
    control?.ok
    && status === 'ready'
    && !nativeRenderFailureReason
    && !videoUploadFailureReason
    && videoFrameUploadReady !== 'false'
    && !hasNativeRenderPathDiagnostics
  ) {
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
    nativeRenderDecodePaths ? `decode=${nativeRenderDecodePaths}` : null,
    nativeRenderPath ? `render=${nativeRenderPath}` : null,
    nativeRenderNv12ZeroCopyMediaIds ? `nv12=${nativeRenderNv12ZeroCopyMediaIds}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(' / ');
};

export { isTransientExternalVideoPresentationFailure };

const Viewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportShellRef = useRef<HTMLDivElement>(null);
  const threeStageRef = useRef<ThreeStageViewportHandle | null>(null);
  // PSD ビルボードの合成キャッシュ: cacheKey（filePath::activeLayerIds）→
  // 合成済み RGBA8。rust-backend への psd.renderComposite は非同期・IO束縛
  // のため、renderScene 同期呼び出しの中では「今あるキャッシュをそのまま
  // syncBillboards に渡し、未取得/古いキーだけ裏で取りに行く」stale-while-
  // revalidate 方式にする（毎フレーム同期待ちしてプレビューを止めない）。
  const psdBillboardRgbaCacheRef = useRef<Map<string, PsdCompositeRgba>>(new Map());
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
  const rustTimelineScenePreviewControllerRef = useRef<EditableRustScenePreviewController | null>(null);
  const rustNativePlaybackStartGenerationRef = useRef(0);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const [renderTick, setRenderTick] = useState(0);
  const [rustTimelineSceneRevision, setRustTimelineSceneRevision] = useState<number | null>(null);
  // schedulerのonRemoteReadyから届く「Rust側で実際に反映済み、かつsupersededでは
  // ない」revision。rustTimelineSceneRevisionは楽観値（submitRevision直後に確定）
  // なので、native再生開始のように「present中の画がこのrevisionである」ことを
  // 前提にする経路はこちらを使う（diag-debug-1で計測したrevision不一致による
  // native再生失敗の再発防止）。
  const [rustTimelineSceneResidentRevision, setRustTimelineSceneResidentRevision] = useState<number | null>(null);
  const [panelSize, setPanelSize] = useState({ w: 0, h: 0 });
  const sharedRendererPreviewEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_PREVIEW !== '0';
  const sharedRendererExportEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_EXPORT !== '0';
  const sharedRendererDiagnosticSwatchEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_DIAGNOSTIC_SWATCH === '1';
  const sharedRendererVideoCutoverEnabled = import.meta.env.VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER !== '0';
  // 常駐Rust scene RPC は段階的移行用の明示 opt-in。enabled 中は timeline の
  // 評価を renderer 側へ送らず、Rustが返した評価済みsnapshotだけを提示する。
  const rustTimelineSceneRpcEnabled = import.meta.env.VITE_UXFD_RUST_TIMELINE_SCENE_RPC === '1';
  const nativeOverlayPreviewEnabled = import.meta.env.VITE_UXFD_NATIVE_OVERLAY !== '0';
  // 選択デコレーション（送信ロジック・SVG 透明化 state）は
  // SceneSelectionDecorationLayer.tsx へ移設済み。attach 成功 tick の bump
  // だけは Viewport 側に残す（attach 自体は Viewport が行うため）。
  // attach は resize 等で作り直され addon 側の decoration state が失われ得る
  // ため、attach 成功 tick を dedupe 鍵に含めて同値 quad でも再送する。
  const [nativeOverlayAttachTick, setNativeOverlayAttachTick] = useState(0);
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
    objects, selectedIds, selectedId, clearSelection,
    projectSettings, isPlaying, isExporting, duration, nativePlaybackActive,
    setNativePlaybackActive, setIsPlaying, setTime,
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
    objects: state.objects,
    selectedIds: state.selectedIds,
    selectedId: state.selectedId,
    clearSelection: state.clearSelection,
    projectSettings: state.projectSettings,
    isPlaying: state.isPlaying,
    isExporting: state.isExporting,
    duration: state.duration,
    nativePlaybackActive: state.nativePlaybackActive,
    setNativePlaybackActive: state.setNativePlaybackActive,
    setIsPlaying: state.setIsPlaying,
    setTime: state.setTime,
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
  // 意図的に currentTime をこのセレクタへ含めない — 再生中は毎フレーム
  // currentTime が変化するため、hook 購読すると Viewport 全体が毎フレーム
  // 再レンダーされてしまう。currentTime への追従は onCurrentTimeTickRef
  // （renderScene 定義直後）が useStore.subscribe + ref 経由で行う
  // （SceneSelectionDecorationLayer / TimelineCurrentTimeIndicator と同じ方針）。

  useVisionRealtimeDetection();

  // Bug D case (i) — timeline objects が空集合に遷移したとき、Bug C で追加した
  // visual frame cache invalidator と Bug D の transparent clear を同じイベント源
  // から発火する。cache 消去（Bug C）だけでは drawable に present 済みの
  // 削除前フレームが残り続けるため、両方が必要。
  //
  // 注意 — objects.length === 0 は「プロジェクト全体が空になった」ケースだけを
  // 捉える。「タイムラインの他の位置にはクリップがあるが現在時刻には
  // アクティブなクリップが無い」ケース（例: 図形クリップの範囲外へのシーク）は
  // objects.length が 0 にならないためこの effect では捉えられず、
  // publishSharedRendererPreviewSession 内の
  // shouldPresentSharedRendererEmptyScenePresentation（評価済み session の
  // surfaceGate.snapshot.clips.length を見る）が別途担当する。この effect は
  // 新しい評価 tick を伴わない「最後のオブジェクト削除」を拾うため、削除は
  // せず残す。
  useEffect(() => {
    if (!nativeOverlayPreviewEnabled) return;
    if (objects.length !== 0) return;
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

  // 選択デコレーション（standalone チャネル）の送信ロジック・SVG 透明化 state は
  // SceneSelectionDecorationLayer.tsx へ移設済み（currentTime を React 経由で
  // 購読せず、useStore.subscribe + 命令的パッチで時間追従するため）。

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
  const rustTimelineScenePresentationRef = useRef({
    webGpuAvailable: sharedRendererGpuStatus.webGpuAvailable,
    fallbackAdapter: sharedRendererGpuStatus.fallbackAdapter,
  });
  rustTimelineScenePresentationRef.current = {
    webGpuAvailable: sharedRendererGpuStatus.webGpuAvailable,
    fallbackAdapter: sharedRendererGpuStatus.fallbackAdapter,
  };

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
  // letterSpacing はボックス計測と実描画（rust-backend の text.rs）の不整合を
  // 防ぐため、object.letterSpacing をそのまま計測へ渡す（未指定時は 0 扱い）。
  useEffect(() => {
    objects.forEach((object) => {
      if (object.type !== 'text') return;
      const size = measureTextBoxSize({
        text: object.text,
        fontFamily: object.fontFamily,
        fontSize: object.fontSize,
        letterSpacing: object.letterSpacing,
      });
      if (!size) return;
      if (object.measuredWidth === size.width && object.measuredHeight === size.height) return;
      useStore.getState().updateObject(object.id, {
        measuredWidth: size.width,
        measuredHeight: size.height,
      });
    });
  }, [objects]);

  const publishSharedRendererPreviewSession = useCallback((
    time: number,
    currentObjects: TimelineObject[],
    evaluatedSession?: SharedRendererPreviewSession,
  ) => {
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

    const session = evaluatedSession ?? buildSharedRendererPreviewSession({
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
    // WYSIWYG不変条件 — 評価された現在時刻にアクティブなクリップが1つも
    // 無い（session.surfaceGate.snapshot.clips.length === 0）session は、
    // 「空シーンの透明フレームをpresentする」ことそのものである。旧来の
    // Bug D case (i) effect は timeline objects 全体の空集合（objects.length
    // === 0）だけを見ており、「タイムラインの他の位置にはクリップがあるが
    // 現在時刻にはアクティブなクリップが無い」ケース（図形クリップの範囲外
    // シーク）を捉えられず、native overlay に前フレームのゴーストが
    // 残り続けていた。ここで検知し、in-flight の古い present が後から
    // 上書きしないよう requestId を先に進めてから透明clearを発行する。
    if (shouldPresentSharedRendererEmptyScenePresentation({
      session,
      nativeOverlayPreviewEnabled,
    })) {
      sharedRendererVideoDecodeRequestIdRef.current += 1;
      notifyNativeOverlaySceneCleared(0);
      void window.nativeOverlay?.clearSurface({});
    }
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
    // 生成効果の object-id 変化検出（renderTick 経由の renderScene 再実行契機）は
    // presenter 起動完了コールバック（nativeRenderFrameReady でゲートされた
    // control.generatedEffectObjectIds）を唯一の供給元とする。
    // かつてはここで session から無条件に収集した値を毎tick即時反映していたが
    // （2026-06-21 commit c951f8ed、PixiJS 二重描画レース対策）、PixiJS 排除計画
    // Phase 4 で Pixi シーングラフ描画自体が撤去され、その対策の存在意義が
    // 失われた。にもかかわらず残っていたため、この session 側（無条件）と
    // presenter 側（nativeRenderFrameReady ゲート）という異なる条件の2つの
    // 供給元が同じ ref を交互に「まるごと追加→まるごと削除」で上書きし合い、
    // renderTick が再生中ほぼ毎フレーム発火して Viewport が過剰再レンダーする
    // 原因になっていた（solidColour/image/psd/text は最初から presenter 側の
    // みが供給元で、この二重書きを持たない）。
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
    // 動画を含まないnative-render sessionはHTMLVideoElementの音声クロックと
    // 競合しないため、通常cutoverでもpresenterを再利用できる。video-only/
    // mixed sessionはRust video-only時だけ許可し、HTMLVideoElementとRust側
    // decodeの二重パイプラインを作らない。
    const canReuseNativeRenderPresenter = shouldReuseSharedRendererNativeRenderPresenter({
      isExporting,
      rustVideoOnlyEnabled,
      sharedRendererVideoCutoverEnabled,
      externalVideoOnly: isSharedRendererExternalVideoOnlySession(session),
      nativeRenderOnly: isSharedRendererNativeRenderOnlySession(session),
      mixedNativeRender: isSharedRendererMixedNativeRenderSession(session),
    });
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
      // video-only・混在は動画デコード注入経由、native-render-only（図形/画像のみ）
      // は Phase 3b Step2 から render.nativeSharedFrame の合成結果を直接
      // 同梱 present する経路で、どちらも nativeOverlayPreviewEnabled のとき
      // native overlay へ乗る。失敗時だけDOM側WebGPU canvas
      // （presentPreparedNativeRenderFrame）へフォールバックする。
      if (control?.ok && (
        (nativeOverlayPreviewEnabled && isNativeOverlayDirectSceneSession(session))
        || (nativeOverlayPreviewEnabled && isSharedRendererNativeRenderOnlySession(session))
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
            if (
              nativeOverlayPreviewEnabled
              && isNativeOverlayDirectSceneSession(session)
              && !isSharedRendererNativeRenderOnlySession(session)
            ) {
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
            if (nativeOverlayPreviewEnabled && isSharedRendererNativeRenderOnlySession(session)) {
              // Phase 3b Step2 — 図形/画像のみのセッションは DOM canvas を
              // 経由せず render.nativeSharedFrame の合成結果を直接 native
              // overlay へ present する（選択デコレーション同梱つき）。
              if (session.surfaceGate.ok) {
                sharedRendererNativeReuseLastPreviewTimeRef.current = session.surfaceGate.snapshot.frame_index / projectSettings.fps;
              }
              const nativeRenderOverlayRequestId = (sharedRendererVideoDecodeRequestIdRef.current += 1);
              const result = await prepareSharedRendererViewportNativeRenderOverlayPresent({
                session,
                requestId: nativeRenderOverlayRequestId,
                nativeOverlayBridge: window.nativeOverlay,
                selectionDecoration: sessionSelectionDecoration,
                // クリップ削除等で presenter が再起動（requestId が進む）した後に
                // この in-flight present が完了して削除済みフレームで overlay を
                // 上書きするレースを防ぐ（video decode 経路と同じ契約）。
                isRequestCurrent: () => sharedRendererVideoDecodeRequestIdRef.current === nativeRenderOverlayRequestId,
              });
              if (!result.ok) {
                if (result.reason === 'supersededRequest' || result.reason === 'supersededDecodeReleaseFailed') {
                  // 追い越された tick は何もしない — presentation の所有権は
                  // 新しい要求（再起動側）にある。
                } else {
                  // overlay 未 attach 等の失敗は video-only 経路と同じ
                  // self-healing restart パターンで DOM canvas フォールバック
                  // （presentPreparedNativeRenderFrame）へ収束させる。
                  sharedRendererPresenterSessionKeyRef.current = null;
                  setSharedRendererPreviewSession(session);
                }
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
              await presentPreparedNativeRenderFrame(result.upload, {
                session,
                nativeRenderDiagnostics: result.diagnostics,
              });
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
            if (pending && shouldReplaySharedRendererNativeReusePending(rustTimelineSceneRpcEnabled)) {
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
    sharedRendererVideoCutoverEnabled,
    nativeOverlayPreviewEnabled,
    rustVideoOnlyEnabled,
    requestSharedRendererExternalVideoFrameRepaint,
  ]);

  // Latest publish callback, so the native reuse single-flight replay can re-run
  // the most recent dropped tick without making publish depend on itself.
  const publishSharedRendererPreviewSessionRef = useRef(publishSharedRendererPreviewSession);
  publishSharedRendererPreviewSessionRef.current = publishSharedRendererPreviewSession;

  // controller/scheduler は Viewport の寿命中に一つだけ保持する。sceneの編集
  // （objects/layers/size/fps/projectId）と時刻要求を別effectにしたため、再生
  // tick が Project JSON の再変換・replace RPC を引き起こさない。
  useEffect(() => {
    if (!rustTimelineSceneRpcEnabled) {
      rustTimelineScenePreviewControllerRef.current?.dispose();
      rustTimelineScenePreviewControllerRef.current = null;
      setRustTimelineSceneRevision(null);
      setRustTimelineSceneResidentRevision(null);
      setNativePlaybackActive(false);
      writeRustTimelineSceneRpcDiagnostics({ status: 'disabled', projectId: projectId ?? null });
      return;
    }

    const scheduler = createSharedRendererScenePreviewScheduler({
      rpc: {
        replaceScene: replaceRustBackendScene,
        evaluateScene: evaluateRustBackendScene,
      },
      onEvaluation: (evaluation) => {
        const currentSettings = useStore.getState().projectSettings;
        const session = buildSharedRendererPreviewSessionFromEvaluatedScene({
          evaluation,
          projectSettings: currentSettings,
          editorMode: currentSettings.editorMode ?? '2d',
          isExporting: useStore.getState().isExporting,
          webGpuAvailable: rustTimelineScenePresentationRef.current.webGpuAvailable,
          fallbackAdapter: rustTimelineScenePresentationRef.current.fallbackAdapter,
        });
        if (!session.surfaceGate.ok) {
          setSharedRendererPreviewSession(null);
          writeRustTimelineSceneRpcDiagnostics({
            status: 'blocked',
            projectId: useStore.getState().activeSceneId ?? null,
            detail: `評価済みsceneを提示できません: ${session.surfaceGate.reason}`,
            ...scheduler.diagnostics,
          });
          return;
        }
        writeRustTimelineSceneRpcDiagnostics({
          status: 'ready',
          projectId: useStore.getState().activeSceneId ?? null,
          ...scheduler.diagnostics,
        });
        psdImportTraceCollector.mark('evaluateReady');
        publishSharedRendererPreviewSessionRef.current(
          evaluation.frameIndex / currentSettings.fps,
          latestObjectsRef.current,
          session,
        );
      },
      onFailure: (failure) => {
        // 前revisionの画を残すと、unsupported編集をした直後にも古いsceneが
        // 見え続ける。明示的に止め、Chromiumの旧Canvas経路には戻さない。
        setSharedRendererPreviewSession(null);
        writeRustTimelineSceneRpcDiagnostics({
          status: 'blocked',
          projectId: useStore.getState().activeSceneId ?? null,
          detail: `${failure.operation}: ${failure.reason} (${failure.detail})`,
          ...scheduler.diagnostics,
        });
      },
      onRemoteReady: (ready) => {
        setRustTimelineSceneResidentRevision(ready ? ready.revision : null);
      },
    });
    const controller = createEditableRustScenePreviewController({
      sceneId: 'viewport-rust-timeline',
      scheduler,
    });
    rustTimelineScenePreviewControllerRef.current = controller;
    writeRustTimelineSceneRpcDiagnostics({ status: 'pending', projectId: projectId ?? null });

    return () => {
      controller.dispose();
      if (rustTimelineScenePreviewControllerRef.current === controller) {
        rustTimelineScenePreviewControllerRef.current = null;
      }
    };
    // scheduler の callback は store/refから最新値を読むため、flagの変化時のみ
    // 再生成する。ここにobjectsやcurrentTimeを足すと常駐の意味がなくなる。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rustTimelineSceneRpcEnabled]);

  useEffect(() => {
    if (!rustTimelineSceneRpcEnabled) return;
    const controller = rustTimelineScenePreviewControllerRef.current;
    if (!controller) return;
    const result = controller.replaceScene({ projectSettings, layers, objects });
    if (!result.ok) {
      setRustTimelineSceneRevision(null);
      setNativePlaybackActive(false);
      void window.rustBackend.stopScenePlayback();
      setSharedRendererPreviewSession(null);
      writeRustTimelineSceneRpcDiagnostics({
        status: 'blocked',
        projectId: projectId ?? null,
        detail: result.issues.map((issue) => `${issue.objectId}:${issue.code}`).join(', '),
      });
      return;
    }
    setRustTimelineSceneRevision(result.revision);
    writeRustTimelineSceneRpcDiagnostics({
      status: 'pending',
      projectId: projectId ?? null,
    });
  }, [
    layers,
    objects,
    projectId,
    projectSettings.fps,
    projectSettings.height,
    projectSettings.width,
    rustTimelineSceneRpcEnabled,
    setNativePlaybackActive,
  ]);

  useEffect(() => {
    if (!rustTimelineSceneRpcEnabled) return undefined;
    const onPlaybackUiState = (_event: unknown, rawState: unknown) => {
      if (!rawState || typeof rawState !== 'object') return;
      const state = rawState as Partial<RustNativePlaybackUiState>;
      if (
        typeof state.status !== 'string'
        || typeof state.currentTimeSeconds !== 'number'
        || !Number.isFinite(state.currentTimeSeconds)
        || typeof state.frameIndex !== 'number'
      ) {
        return;
      }
      const playbackState = state as RustNativePlaybackUiState;
      writeRustNativePlaybackDiagnostics(playbackState);
      setTime(playbackState.currentTimeSeconds);
      if (playbackState.status === 'ended') {
        setNativePlaybackActive(false);
        setIsPlaying(false);
      } else if (playbackState.status === 'failed') {
        // main/native presentが途中で失敗した場合だけrenderer rAFを再開する。
        // 再生自体は止めず、次のcurrentTime tickから既存経路へ安全に戻す。
        setNativePlaybackActive(false);
      }
    };
    window.ipcRenderer.on('rust-backend-scene-playback-ui-state', onPlaybackUiState);
    return () => {
      window.ipcRenderer.off('rust-backend-scene-playback-ui-state', onPlaybackUiState);
    };
  }, [
    rustTimelineSceneRpcEnabled,
    setIsPlaying,
    setNativePlaybackActive,
    setTime,
  ]);

  useEffect(() => {
    if (!rustTimelineSceneRpcEnabled || rustTimelineSceneResidentRevision === null) {
      if (useStore.getState().nativePlaybackActive) {
        void window.rustBackend.stopScenePlayback();
        setNativePlaybackActive(false);
      }
      return;
    }

    const startGeneration = rustNativePlaybackStartGenerationRef.current + 1;
    rustNativePlaybackStartGenerationRef.current = startGeneration;
    if (!isPlaying) {
      if (useStore.getState().nativePlaybackActive) {
        void window.rustBackend.pauseScenePlayback().then((state) => {
          if (state && Number.isFinite(state.currentTimeSeconds)) {
            setTime(state.currentTimeSeconds);
          }
          setNativePlaybackActive(false);
        });
      }
      return;
    }

    void (async () => {
      let startTimeSeconds = useStore.getState().currentTime;
      if (useStore.getState().nativePlaybackActive) {
        const paused = await window.rustBackend.pauseScenePlayback();
        if (paused && Number.isFinite(paused.currentTimeSeconds)) {
          startTimeSeconds = paused.currentTimeSeconds;
          setTime(startTimeSeconds);
        }
      }
      // 計測専用: engage遅延の内訳切り分け用にnative再生開始RPCの往復時間を
      // 記録する。enabled===falseなら performance.now() すら呼ばず制御フローも
      // 変えない。
      const startPlaybackStartedAtMs = rendererSceneRpcCollector.enabled ? performance.now() : 0;
      const result = await window.rustBackend.startScenePlayback({
        sceneId: 'viewport-rust-timeline',
        revision: rustTimelineSceneResidentRevision,
        fps: projectSettings.fps,
        startTimeSeconds,
        durationSeconds: duration,
      });
      if (rendererSceneRpcCollector.enabled) {
        rendererSceneRpcCollector.record({
          operation: 'startPlayback',
          sceneId: 'viewport-rust-timeline',
          revision: rustTimelineSceneResidentRevision,
          startedAtMs: startPlaybackStartedAtMs,
          durationMs: performance.now() - startPlaybackStartedAtMs,
          ok: result.active,
          reason: result.active ? undefined : result.reason,
          detail: result.active ? undefined : result.detail,
          // 計測専用: main側start()の内訳（evaluateScene/presentScene区間）を
          // そのまま素通しする。result.jsonのexercise.sceneRpcTraceへ乗る。
          startTimingDiagnostics: result.active ? result.startTimingDiagnostics : undefined,
        });
      }
      if (rustNativePlaybackStartGenerationRef.current !== startGeneration) {
        return;
      }
      setNativePlaybackActive(result.active);
      if (!result.active) {
        document.documentElement.dataset.uxfdRustPlaybackClockOwner = 'renderer';
        document.documentElement.dataset.uxfdRustPlaybackStatus =
          `fallback:${result.reason ?? 'unknown'}`;
        document.documentElement.dataset.uxfdRustPlaybackDetail = result.detail ?? '';
      }
    })();
  }, [
    duration,
    isPlaying,
    projectSettings.fps,
    rustTimelineSceneResidentRevision,
    rustTimelineSceneRpcEnabled,
    setNativePlaybackActive,
    setTime,
  ]);

  useEffect(() => () => {
    rustNativePlaybackStartGenerationRef.current += 1;
    void window.rustBackend.stopScenePlayback();
    useStore.getState().setNativePlaybackActive(false);
  }, []);

  // export中はexternal video sourceをtickごとにdisposeするため、export完了直後は
  // readyState=0のvideo要素からpresenterが起動しvideoTextureViewUnavailableになる。
  // 動画がpresent可能になった通知(sharedRendererExternalVideoFrameReadyTickのbump)で
  // scene評価を再要求しないと、RPCモードでは復帰契機が存在しない。
  // currentTime tickによる再要求は onCurrentTimeTickRef（renderScene 定義直後）が
  // 担うため、このeffectはexport終了・revision出現・video frame ready等の
  // 低頻度契機のみを担う（そのためdepsに currentTime は含めず、値は都度
  // useStore.getState() から読む）。
  useEffect(() => {
    if (!shouldRequestRustTimelineSceneEvaluationForTick({
      rustTimelineSceneRpcEnabled,
      rustTimelineSceneRevisionAvailable: rustTimelineSceneRevision !== null,
      isExporting,
      nativePlaybackActive,
      isPlaying,
    })) return;
    const controller = rustTimelineScenePreviewControllerRef.current;
    if (!controller) return;
    controller.requestTime(useStore.getState().currentTime, projectSettings.fps);
    writeRustTimelineSceneRpcDiagnostics({ status: 'pending', projectId: projectId ?? null });
  }, [
    isExporting,
    isPlaying,
    nativePlaybackActive,
    projectId,
    projectSettings.fps,
    rustTimelineSceneRevision,
    rustTimelineSceneRpcEnabled,
    sharedRendererExternalVideoFrameReadyTick,
  ]);

  // currentTime tickによるpublishは onCurrentTimeTickRef が担うため、このeffectは
  // objects の変化と sharedRendererExternalVideoFrameReadyTick の低頻度契機のみを
  // 担う（currentTime は useStore.getState() から読む）。
  useEffect(() => {
    if (shouldBuildSharedRendererPreviewSessionForTick(rustTimelineSceneRpcEnabled)) {
      publishSharedRendererPreviewSession(useStore.getState().currentTime, objects);
    }
    // sharedRendererExternalVideoFrameReadyTick re-publishes the session so a
    // paused frame that has just become presentable gets re-presented.
    // This only takes effect when shouldBuildSharedRendererPreviewSessionForTick
    // is true (i.e. the RPC path is disabled) — when the RPC path is enabled,
    // the effect above owns this re-evaluation instead.
  }, [objects, publishSharedRendererPreviewSession, rustTimelineSceneRpcEnabled, sharedRendererExternalVideoFrameReadyTick]);

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
    // publish側と同じ純粋判定を使い、pending replayのkey比較と実際のreuse
    // eligibilityを一致させる。
    const canReuseCurrentNativeRenderPresenter = shouldReuseSharedRendererNativeRenderPresenter({
      isExporting,
      rustVideoOnlyEnabled,
      sharedRendererVideoCutoverEnabled,
      externalVideoOnly: isSharedRendererExternalVideoOnlySession(presenterRestartSession),
      nativeRenderOnly: isSharedRendererNativeRenderOnlySession(presenterRestartSession),
      mixedNativeRender: isSharedRendererMixedNativeRenderSession(presenterRestartSession),
    });
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
    const presenterStartCountWindow = window as SharedRendererPresenterStartCountWindow;
    const persistentPresenterStartCount =
      presenterStartCountWindow.__UXFD_SHARED_RENDERER_PRESENTER_START_COUNT__;
    sharedRendererPresenterStartCountRef.current = Math.max(sharedRendererPresenterStartCountRef.current,
      Number.isFinite(persistentPresenterStartCount) ? persistentPresenterStartCount ?? 0 : 0,
    ) + 1;
    presenterStartCountWindow.__UXFD_SHARED_RENDERER_PRESENTER_START_COUNT__ =
      sharedRendererPresenterStartCountRef.current;
    liveDatasets.forEach((dataset) => {
      dataset.uxfdSharedRendererPresenterStartCount = String(sharedRendererPresenterStartCountRef.current);
    });
    sharedRendererPresenterStartingRef.current = true;
    // Native Overlay supplies decoded video frames and builds supported
    // non-video sources locally, so mixed sessions can use the same direct
    // CAMetalLayer presentation path. Native-render-only sessions still use
    // their dedicated presentation path.
    const nativeOverlayDirectSceneEligible = nativeOverlayPreviewEnabled
      && isNativeOverlayDirectSceneSession(presenterRestartSession);

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
      nativeOverlayPreviewEnabled: nativeOverlayDirectSceneEligible,
      presentNativeOverlayDecodedFrame: nativeOverlayDirectSceneEligible
        ? (input) => isSharedRendererNativeRenderOnlySession(input.session)
          ? prepareSharedRendererViewportNativeRenderOverlayPresent({
            session: input.session,
            requestId: input.requestId,
            nativeOverlayBridge: window.nativeOverlay,
          })
          : prepareSharedRendererViewportNativeOverlayPresent({
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
    // objects の変化は publish 側 effect（deps: [objects, ...]）および
    // currentTime tick（onCurrentTimeTickRef）が受けて session を再構築するので、
    // presenter の再起動が必要な変化は sharedRendererPreviewSession の変化として
    // ここへ届く。
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

    if (shouldBuildSharedRendererPreviewSessionForTick(rustTimelineSceneRpcEnabled)) {
      publishSharedRendererPreviewSession(time, currentObjects);
    }

    const workspaceMode = useStore.getState().projectSettings.editorMode ?? '2d';
    if (workspaceMode === '3d_stage' && threeStageRef.current) {
      // PixiJS 排除計画 Phase 4 でラスタライズ手段（app.renderer.extract）を
      // 失っていたビルボードを、rust-backend の psd.renderComposite 経由で
      // 復活させる。取得は非同期のためキャッシュにある分だけ即時反映し、
      // 未取得/古いキーは裏で fetchPsdCompositeRgba を叩いて次tickへ回す。
      const placedPsdObjects = selectWorldPlacedPsdBillboards(currentObjects);
      const cache = psdBillboardRgbaCacheRef.current;
      const inFlight = psdBillboardFetchInFlightRef.current;
      const liveCacheKeys = new Set<string>();

      const billboardEntries: BillboardTextureEntry[] = [];
      placedPsdObjects.forEach((psd) => {
        const cacheKey = psdBillboardCacheKey(psd);
        liveCacheKeys.add(cacheKey);
        const cachedComposite = cache.get(cacheKey);
        if (cachedComposite) {
          billboardEntries.push({
            id: psd.id,
            sourceKey: cacheKey,
            rgba: cachedComposite.data,
            placement: psd.worldPlacement!,
            widthPx: cachedComposite.width,
            heightPx: cachedComposite.height,
          });
        }

        if (!cache.has(cacheKey) && !inFlight.has(cacheKey) && psd.filePath) {
          inFlight.add(cacheKey);
          fetchPsdCompositeRgba(window.ipcRenderer, psd)
            .then((composite) => {
              if (composite) cache.set(cacheKey, composite);
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
    rustTimelineSceneRpcEnabled,
  ]);

  // tickの即時実行可否判定に使う「コミット済みレンダーが見た構造系state」。
  // レンダー本体で毎回代入する（コミット前のtickはこれと store が食い違う）。
  const renderedTickStateRef = useRef<CurrentTimeTickRenderedState>({
    objects, layers, isPlaying, isExporting, nativePlaybackActive, activeSceneId: projectId, projectSettings,
  });
  renderedTickStateRef.current = {
    objects, layers, isPlaying, isExporting, nativePlaybackActive, activeSceneId: projectId, projectSettings,
  };

  // 毎フレームのcurrentTime tickで行う処理。ViewportはcurrentTimeをhook購読
  // しない（再生中の毎フレーム再レンダーを避ける）ため、素のuseStore.subscribe
  // から最新closureをref経由で呼ぶ（latestScenePointerHandlersRefと同じパターン）。
  // 実行順は旧effectの宣言順（requestTime → publish → renderScene）を保存する。
  const onCurrentTimeTickRef = useRef<(time: number) => void>(() => {});
  onCurrentTimeTickRef.current = (time: number) => {
    // 1) Rust常駐sceneへの評価要求（旧: requestTime effectのcurrentTime依存分）
    if (shouldRequestRustTimelineSceneEvaluationForTick({
      rustTimelineSceneRpcEnabled,
      rustTimelineSceneRevisionAvailable: rustTimelineSceneRevision !== null,
      isExporting,
      nativePlaybackActive,
      isPlaying,
    })) {
      const controller = rustTimelineScenePreviewControllerRef.current;
      if (controller) {
        controller.requestTime(time, projectSettings.fps);
        writeRustTimelineSceneRpcDiagnostics({ status: 'pending', projectId: projectId ?? null });
      }
    }
    // 2) preview sessionのpublish（旧: publish effectのcurrentTime依存分）
    if (shouldBuildSharedRendererPreviewSessionForTick(rustTimelineSceneRpcEnabled)) {
      publishSharedRendererPreviewSession(time, latestObjectsRef.current);
    }
    // 3) renderScene（音声同期・3Dビルボード同期。旧: renderScene effectのcurrentTime依存分）
    if (!useStore.getState().isExporting) {
      renderScene(time, latestObjectsRef.current);
    }
  };

  // mount時に一度だけcurrentTimeを購読する。storeはsubscribeWithSelector未使用
  // のため素のsubscribeで自前diffする（TimelineCurrentTimeIndicatorと同じ流儀）。
  const pendingDeferredTickRef = useRef(false);
  useEffect(() => {
    let previousCurrentTime = useStore.getState().currentTime;
    const unsubscribe = useStore.subscribe((state) => {
      if (state.currentTime !== previousCurrentTime) {
        previousCurrentTime = state.currentTime;
        if (shouldDeferCurrentTimeTick(state, renderedTickStateRef.current)) {
          // 構造系stateが同一set()で（あるいは未コミットのまま）変わっている。
          // このままだと1レンダー分古いclosureで発火するため、コミット後の
          // catch-up effectへ委ねる（旧effect実装の「必ずコミット後」意味論の復元）。
          pendingDeferredTickRef.current = true;
          return;
        }
        onCurrentTimeTickRef.current(state.currentTime);
      }
    });
    return unsubscribe;
  }, []);

  // 保留されたtickのcatch-up。依存配列なし＝毎コミット後に実行され、
  // 新しいclosure（最新のobjects/layers/isPlaying等）でtickを実行する。
  useEffect(() => {
    if (!pendingDeferredTickRef.current) return;
    pendingDeferredTickRef.current = false;
    onCurrentTimeTickRef.current(useStore.getState().currentTime);
  });

  // currentTime tickによる再描画は onCurrentTimeTickRef が担うため、このeffectは
  // objects の変化（renderTick 経由の明示的な再描画要求を含む）にのみ追従する
  // （currentTime は useStore.getState() から読む）。
  useEffect(() => {
    if (!isExporting) renderScene(useStore.getState().currentTime, objects);
  }, [
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

  const getRustExportFrameSource = useCallback((context: ProjectExportRustFrameSourceContext) => {
    const canUseResidentScene = (
      sharedRendererExportEnabled
      && rustTimelineSceneRpcEnabled
      && rustTimelineSceneRevision !== null
      && editorMode === '2d'
      && context.preferEncodeOnly === true
      && window.rustVideoEncoder.nativeDirectEncodeEnabled === true
      && typeof window.rustVideoEncoder.writeResidentSceneEncodeFrame === 'function'
    );
    if (canUseResidentScene) {
      document.documentElement.dataset.uxfdRustExportFrameSourceStatus = 'residentScene';
      return createResidentSceneExportFrameSource({
        sceneId: 'viewport-rust-timeline',
        revision: rustTimelineSceneRevision,
      });
    }
    return buildViewportRustExportFrameSource({
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
    });
  }, [
    editorMode,
    layers,
    projectSettings,
    rustTimelineSceneRevision,
    rustTimelineSceneRpcEnabled,
    sharedRendererExportEnabled,
    sharedRendererGpuStatus.fallbackAdapter,
    sharedRendererGpuStatus.webGpuAvailable,
    sharedRendererVideoCutoverEnabled,
    rustVideoOnlyEnabled,
  ]);
  
  useProjectExport(renderScene, getExportCanvas, getRustExportFrameSource);

  // --- Snapshot Logic (after renderScene is defined) ---
  // currentTime・objects はこのeffectの依存にせず、発火時にstoreから直接読む
  // （ViewportはcurrentTimeをhook購読しないため）。
  useEffect(() => {
      if (!isSnapshotRequested) return;

      const currentTime = useStore.getState().currentTime;
      const objects = useStore.getState().objects;
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
  }, [isSnapshotRequested, finishSnapshot, renderScene]);

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
                time: useStore.getState().currentTime,
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
            <SceneSelectionDecorationLayer
              selectedIds={selectedIds}
              objects={objects}
              viewportRef={sceneInteractionViewportRef}
              width={previewW}
              height={previewH}
              projectCanvasWidth={projectSettings.width}
              projectCanvasHeight={projectSettings.height}
              nativeOverlayPreviewEnabled={nativeOverlayPreviewEnabled}
              rustVideoOnlyEnabled={rustVideoOnlyEnabled}
              sharedRendererPreviewSession={sharedRendererPreviewSession}
              nativeOverlayAttachTick={nativeOverlayAttachTick}
              onResizeStart={onSceneResizeStart}
            />
          )}
          {/*
            Vision 検出枠（cat/dog 単フレーム検出プレビュー）。
            PixiJS 排除計画 Phase 4 で PIXI Graphics から SVG オーバーレイへ
            置き換えた（座標計算は visionDetectionOverlayGeometry.ts）。
            currentTime tick購読を除去する Viewport 本体からの独立コンポーネント
            抽出（VisionDetectionOverlayLayer.tsx）— vision 検出プレビュー有効時の
            みマウントされ、マウント中は currentTime を意図的に hook 購読する。
          */}
          {editorMode !== '3d_stage'
            && !isExporting
            && !isSnapshotRequested
            && visionDetectionPreviewEnabled
            && visionDetectionOverlay
            && (
              <VisionDetectionOverlayLayer
                objects={objects}
                overlay={visionDetectionOverlay}
                viewportRef={sceneInteractionViewportRef}
                width={previewW}
                height={previewH}
                displayScale={displayScale}
              />
            )}
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
