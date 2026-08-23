import type {
  CameraState,
  EditorMode,
  FilterType,
  GradientFill,
  LayerState,
  PreviewDisplayMode,
  ProjectSettings,
  SceneData,
  StageCamera3D,
  TimelineObject,
} from '../types';
import type { CoreMlAnimalObservation } from '../utils/coremlTrackIpc';
import type { AviUtlCoordinateStoreSnapshot } from '../utils/aviutl/aviutlCoordinateStore';
import type { ProjectExportFrameSourcePlanResult } from '../utils/projectExportFrameCanvas';
import type { RustBackendNativeRenderOutputReleaseEvent } from '../utils/rustBackendVideoEncodeExport';
import type { SharedRendererExportFrameSourceBlockedReason } from '../utils/sharedRendererExportFrameSource';
import type { Command } from '../generated/rustCore/Command';

export interface ClipboardState {
  objects: TimelineObject[];
  anchorStartTime: number;
  anchorLayer: number;
  anchorX: number;
  anchorY: number;
}

/** プレビュー上の Vision 検出枠（トラッキングなし・単フレーム）。プロジェクトには保存しない。 */
export type VisionDetectionOverlayState = {
  videoId: string;
  mediaTimeSec: number;
  observations: CoreMlAnimalObservation[];
};

/** 書き出し処理のフェーズ。 */
export type ExportPhase = 'preparing' | 'transcoding' | 'rendering' | 'saving' | 'cancelling';

/** 書き出しの進捗状況。 */
export interface ExportProgress {
  phase: ExportPhase;
  /** レンダリング済みフレーム数。 */
  currentFrame: number;
  /** 総フレーム数。0 のときは不確定（プログレスバーを不確定表示）。 */
  totalFrames: number;
  /** Rust export が現在待っている工程。 */
  stepDetail?: string;
  /** 現在の書き出し工程が始まった時刻。UI上の経過表示に使う。 */
  startedAtMs?: number;
  /** Rust/shared renderer frame source plan の失敗診断。 */
  exportFrameSourcePlanFailure?: Pick<Extract<ProjectExportFrameSourcePlanResult, { ok: false }>, 'reason' | 'detail'>;
  /** Rust/shared renderer frame source がblockedになった時の診断。 */
  rustFrameSourceBlocked?: {
    reason: SharedRendererExportFrameSourceBlockedReason;
    frameIndex: number;
    legacyCanvasFallbackAllowed: boolean;
    detail?: string;
  };
  /** Rust native render output のrelease診断。 */
  nativeRenderOutputRelease?: RustBackendNativeRenderOutputReleaseEvent;
}

/** 書き出し終了後にも残すRust移行用診断。 */
export interface ExportDiagnostics {
  exportFrameSourcePlanFailure?: ExportProgress['exportFrameSourcePlanFailure'];
  rustFrameSourceBlocked?: ExportProgress['rustFrameSourceBlocked'];
  nativeRenderOutputRelease?: RustBackendNativeRenderOutputReleaseEvent;
}

export interface AppState {
  language: 'ja' | 'en';
  isProjectLoaded: boolean;
  projectSettings: ProjectSettings;

  isExporting: boolean;
  exportProgress: ExportProgress | null;
  lastExportDiagnostics: ExportDiagnostics | null;
  exportCancelRequested: boolean;

  isSnapshotRequested: boolean;
  /** 現在進行中のプロキシ生成数。0 より大きいとき「プロキシ生成中」表示を出す。 */
  proxyGenerationCount: number;
  previewDisplayMode: PreviewDisplayMode;

  visionDetectionPreviewEnabled: boolean;
  visionDetectionRealtimeEnabled: boolean;
  visionDetectionOverlay: VisionDetectionOverlayState | null;

  currentTime: number;
  duration: number;
  isPlaying: boolean;
  nativePlaybackActive: boolean;
  layers: LayerState[];
  objects: TimelineObject[];
  camera: CameraState;
  stageCamera3D: StageCamera3D;
  scenes: SceneData[];
  activeSceneId: string;
  selectedId: string | null;
  selectedIds: string[];
  clipboard: ClipboardState | null;
  aviUtlCoordinateStoreSnapshot: AviUtlCoordinateStoreSnapshot | null;

  /**
   * R4-8: 編集履歴の command stack。旧スナップショット API
   * （`pastStates`/`futureStates`/`pushHistory`/`undo`/`redo`）は
   * group f で削除済み（全 34 箇所の呼び出しを `pushHistoryCommand` へ
   * 移行してから、この command stack へ一本化した）。
   */
  pastCommands: Command[];
  futureCommands: Command[];
  /** undo/redo の IPC 往復中は true。ignore-while-pending の判定に使う。 */
  isCommandHistoryPending: boolean;

  setLanguage: (lang: 'ja' | 'en') => void;
  initializeProject: (settings: ProjectSettings) => void;
  loadProject: (settings: ProjectSettings, scenes: SceneData[], activeSceneId: string) => void;
  setCamera: (patch: Partial<CameraState>) => void;
  setStageCamera3D: (patch: {
    position?: Partial<StageCamera3D['position']>;
    target?: Partial<StageCamera3D['target']>;
  }) => void;
  setEditorMode: (mode: EditorMode) => void;
  switchScene: (sceneId: string) => void;
  addScene: () => void;
  deleteScene: (sceneId: string) => void;
  renameScene: (sceneId: string, name: string) => void;
  setLayerName: (layer: number, name: string) => void;
  toggleLayerVisibility: (layer: number) => void;
  toggleLayerLock: (layer: number) => void;
  swapLayerTracks: (indexA: number, indexB: number) => void;
  insertLayerTrackAt: (insertAt: number) => void;
  deleteLayerTrackAt: (layerIndex: number) => void;
  setTime: (time: number) => void;
  setDuration: (duration: number) => void;
  advanceTime: (deltaTime: number) => void;
  togglePlay: () => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setNativePlaybackActive: (active: boolean) => void;
  setExporting: (isExporting: boolean) => void;
  setExportProgress: (progress: ExportProgress | null) => void;
  requestExportCancel: () => void;

  requestSnapshot: () => void;
  finishSnapshot: () => void;

  /** プロキシ生成の開始を記録する（カウンタを +1）。 */
  beginProxyGeneration: () => void;
  /** プロキシ生成の終了を記録する（カウンタを -1、下限 0）。 */
  endProxyGeneration: () => void;

  setPreviewDisplayMode: (mode: PreviewDisplayMode) => void;
  setVisionDetectionPreviewEnabled: (enabled: boolean) => void;
  setVisionDetectionRealtimeEnabled: (enabled: boolean) => void;
  setVisionDetectionOverlay: (overlay: VisionDetectionOverlayState | null) => void;

  /**
   * command stack へ `Command` を積む。呼び出し側がコミット時点で
   * `previous`/`next` を確定させた `Command` を渡す
   * （フィールド単位は `setObjectField` 等）。
   */
  pushHistoryCommand: (command: Command) => void;
  /**
   * command stack を使う非同期 undo。`getCommandBridge()` が `null`
   * （IPC bridge 不在環境）なら no-op。IPC 往復中の多重発火は
   * ignore-while-pending（同時実行中は新しい呼び出しを黙って無視する）。
   * apply がエラーを返した場合は状態を変更せず `console.error` のみ行う。
   */
  undoCommand: () => Promise<void>;
  /** `undoCommand` と対称の redo。 */
  redoCommand: () => Promise<void>;

  addObject: (obj: TimelineObject) => void;
  updateObject: (id: string, newProps: Partial<TimelineObject>) => void;
  addObjectFilter: (objectId: string, filterType: FilterType) => void;
  toggleObjectFilter: (objectId: string, filterId: string) => void;
  moveObjectFilter: (objectId: string, filterId: string, direction: 'up' | 'down') => void;
  removeObjectFilter: (objectId: string, filterId: string) => void;
  updateObjectFilterParams: (objectId: string, filterId: string, params: Record<string, unknown>) => void;
  deleteObject: (id: string) => void;
  deleteSelectedObjects: () => void;
  /** 指定オブジェクトを削除し、同一レイヤーの後続クリップを尺ぶん左へ詰める（YMM の「削除して左寄せ」相当）。 */
  rippleDeleteObject: (id: string) => void;
  /** 選択中オブジェクトを削除し、同一レイヤーの後続クリップを左へ詰める。 */
  rippleDeleteSelectedObjects: () => void;
  splitObject: () => void;
  copySelectedObjects: () => void;
  cutSelectedObjects: () => void;
  pasteClipboardObjects: () => void;
  duplicateSelectedObjects: () => void;
  duplicateSelectedObjectsWithObjectCopyExt: () => void;
  captureSelectedCoordinatesWithAviUtlStore: (name?: string) => void;
  applyAviUtlStoredCoordinatesToSelection: () => void;
  groupSelectedObjects: () => void;
  ungroupSelectedObjects: () => void;
  setGroupGradient: (groupId: string, gradient: GradientFill | undefined) => void;
  selectObject: (id: string | null) => void;
  toggleObjectSelection: (id: string) => void;
  selectObjects: (ids: string[], primaryId?: string | null) => void;
  clearSelection: () => void;
}
