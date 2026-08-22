/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PERF_AUTORUN?: string;
  readonly VITE_PERF_AGENT_MODE?: string;
  readonly VITE_UXFD_SHARED_RENDERER_EXPORT?: string;
  readonly VITE_UXFD_RUST_EXPORT_ONLY?: string;
  readonly VITE_UXFD_RUST_VIDEO_ONLY?: string;
  readonly VITE_UXFD_RUST_TIMELINE_SCENE_RPC?: string;
  readonly VITE_UXFD_PHASE0_SKIP_DECODED_UPLOAD?: string;
  readonly VITE_UXFD_PHASE0_WRITE_TEXTURE_NOOP?: string;
  readonly VITE_UXFD_PHASE0_DISCARD_NATIVE_RENDER_OUTPUT?: string;
  readonly VITE_UXFD_NATIVE_OVERLAY?: string;
  readonly VITE_UXFD_UPLOAD_CRC_VERIFY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  ipcRenderer: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
    off: (channel: string, listener: (...args: any[]) => void) => void;
    send: (channel: string, ...args: any[]) => void;
    invoke: (channel: string, ...args: any[]) => Promise<any>;
  };
  // Phase 7 (W7) STAGE 1: native overlayのプラットフォーム別既定ゲート判定に使う
  // process.platform（preload経由でstatic値を公開、electron/preload.ts参照）。
  uxfdPlatform?: string;
  electronFile?: {
    getPathForFile: (file: File) => string;
  };
  rustBackend: {
    health: () => Promise<{ success: boolean; result?: unknown; error?: string }>;
    echo: (payload: unknown) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    replaceScene: (payload: unknown) => Promise<{ success: boolean; result?: unknown; error?: string; errorCode?: number }>;
    evaluateScene: (payload: unknown) => Promise<{ success: boolean; result?: unknown; error?: string; errorCode?: number }>;
    startScenePlayback: (payload: {
      sceneId: string;
      revision: number;
      fps: number;
      startTimeSeconds: number;
      durationSeconds: number;
    }) => Promise<{
      active: boolean;
      frameIndex?: number;
      reason?: 'invalidRequest' | 'unsupportedDirectMedia' | 'evaluationFailed' | 'presentFailed';
      detail?: string;
      // 計測専用: electron main側で計測したengage遅延内訳（start()成功時のみ）。
      startTimingDiagnostics?: {
        totalMs: number;
        evaluateSceneMs: number | null;
        presentSceneMs: number | null;
        otherMs: number | null;
        isFirstStartSinceLaunch: boolean;
      };
    }>;
    pauseScenePlayback: () => Promise<{
      status: string;
      currentTimeSeconds: number;
      frameIndex: number;
      isPlaying: boolean;
    } | null>;
    stopScenePlayback: () => Promise<{
      status: string;
      currentTimeSeconds: number;
      frameIndex: number;
      isPlaying: boolean;
    } | null>;
    startVideoDecode: (payload: {
      jobId: string;
      source: string;
      slotCount: number;
      width: number;
      height: number;
      sourceRate: {
        numerator: number;
        denominator: number;
      };
      format: 'rgba8Srgb';
      colour: {
        primaries: 'bt709';
        transfer: 'srgb';
        matrix: 'rgb';
        range: 'full';
      };
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    requestVideoDecodeFrame: (payload: {
      jobId: string;
      requestId: number;
      frameIndex: number;
      mode: 'latestWins';
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    requestVideoDecodeFrameInline?: (payload: {
      jobId: string;
      requestId: number;
      frameIndex: number;
      mode: 'latestWins';
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    stopVideoDecode: (payload: {
      jobId: string;
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    releaseVideoDecodeFrame: (payload: {
      jobId: string;
      slotIndex: number;
      generation: number;
      copyOutState: 'gpuUploadFenceSignalled' | 'rendererUploadAborted';
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    renderNativeSharedFrame: (payload: unknown) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    releaseNativeSharedFrame: (payload: unknown) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    // R4-2: rust-core の project_file 境界（ProjectFile の解析/移行と
    // pretty JSON 直列化）を rust-backend RPC 経由で公開する薄いIPC。
    // renderer 側の実際の消費（src/utils/projectFile.ts 置き換え）は
    // R4-3 の範囲。ここでは IPC surface の型のみを用意する。
    deserializeProjectFile: (payload: { json: string }) => Promise<{
      success: boolean;
      result?: { project: unknown };
      error?: string;
      errorCode?: number;
    }>;
    serializeProjectFile: (payload: { project: unknown }) => Promise<{
      success: boolean;
      result?: { json: string };
      error?: string;
      errorCode?: number;
    }>;
    // R4-4/R4-5: エージェント用プロジェクトレシピの解析・展開
    // （src/agentProject/agentProject.ts の buildAgentProjectFile）を
    // rust-backend RPC 経由で公開するIPC。
    buildAgentProjectFile: (payload: { json: string }) => Promise<{
      success: boolean;
      result?: { project: unknown };
      error?: string;
      errorCode?: number;
    }>;
    // R4-8: rust-core の command 境界（`Command` を `SceneData` に適用し、
    // 新しい `SceneData` を返す）を rust-backend RPC 経由で公開するIPC。
    // renderer 側の消費は src/store/slices/historySlice.ts（undo/redo の
    // command stack 化）。
    applyCommand: (payload: { scene: unknown; command: unknown }) => Promise<{
      success: boolean;
      result?: { scene: unknown };
      error?: string;
      errorCode?: number;
    }>;
    requestAudioWaveformSamples: (payload: {
      source: string;
      sampleRate: number;
      maxSamples: number;
      startSeconds?: number;
      durationSeconds?: number;
    }) => Promise<{
      success: boolean;
      result?: {
        source: string;
        sampleRate: number;
        sampleCount: number;
        samples: number[];
      };
      error?: string;
    }>;
    listFonts: () => Promise<{
      success: boolean;
      result?: {
        families: string[];
      };
      error?: string;
    }>;
  };
  rustVideoEncoder: {
    nativeDirectEncodeEnabled?: boolean;
    startVideoEncode: (payload: {
      sessionId: string;
      filePath: string;
      audioPath?: string | null;
      width: number;
      height: number;
      fps: number;
      pixelFormat: 'rgba8Srgb';
      colour: {
        primaries: 'bt709';
        transfer: 'srgb';
        matrix: 'rgb';
        range: 'full';
      };
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    writeVideoEncodeFrame: (payload: {
      sessionId: string;
      frameIndex: number;
      timestampUs: number;
      slotCount: number;
      frame: {
        descriptor: {
          memoryId: string;
          slotIndex: number;
          generation: number;
          byteOffset: number;
          byteLen: number;
          width: number;
          height: number;
          strideBytes: number;
          format: 'rgba8Srgb';
          colour: {
            primaries: 'bt709';
            transfer: 'srgb';
            matrix: 'rgb';
            range: 'full';
          };
        };
        ptsFrame: number;
      };
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    writeNativeEncodeFrame: (payload: {
      sessionId: string;
      renderId: string;
      frameIndex: number;
      timestampUs: number;
      width: number;
      height: number;
      snapshot: unknown;
      media: readonly unknown[];
      sources: readonly unknown[];
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    writeResidentSceneEncodeFrame?: (payload: {
      sessionId: string;
      sceneId: string;
      revision: number;
      frameIndex: number;
      sources?: readonly unknown[];
      audioWaveforms?: readonly unknown[];
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    transcodeVideo?: (payload: {
      sessionId?: string;
      inputPath: string;
      outputPath: string;
      width: number;
      height: number;
      fps: number;
      durationSeconds: number;
      startSeconds?: number;
      includeAudio?: boolean;
      audioVolume?: number;
      objectX?: number;
      objectY?: number;
      objectWidth?: number;
      objectHeight?: number;
      overlays?: Array<
        | {
            kind: 'solidColour';
            x: number;
            y: number;
            width: number;
            height: number;
            colour: string;
            opacity: number;
          }
        | {
            kind: 'image';
            path: string;
            x: number;
            y: number;
            width: number;
            height: number;
            opacity: number;
          }
        | {
            kind: 'psd';
            path: string;
            activeLayerIds: string[];
            x: number;
            y: number;
            width: number;
            height: number;
            opacity: number;
          }
      >;
      audioPath?: string | null;
      qualityPreset?: string;
      videoBitrateKbps?: number;
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    onTranscodeProgress?: (listener: (event: {
      sessionId: string;
      completedFrames: number;
      totalFrames: number;
      percent: number;
      status?: string;
    }) => void) => (() => void);
    finishVideoEncode: (payload: {
      sessionId: string;
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    abortVideoEncode?: (payload: {
      sessionId: string;
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
  };
  sharedVideoFrame: {
    getPresentedFrameHandoffCapabilities?: () => {
      available: boolean;
      reason?: string;
    };
    takePresentedFrameSharedFrame?: (
      payload: {
        encodeSessionId: string;
        memoryId: string;
        frameIndex: number;
        timestampUs: number;
        width: number;
        height: number;
        fps: number;
        device: unknown;
        texture: unknown;
        format: string;
        canvasSize: {
          width: number;
          height: number;
        };
      }
    ) => Promise<{
      success: boolean;
      result?: {
        sessionId: string;
        frameIndex: number;
        timestampUs: number;
        slotCount: number;
        frame: {
          descriptor: {
            memoryId: string;
            slotIndex: number;
            generation: number;
            byteOffset: number;
            byteLen: number;
            width: number;
            height: number;
            strideBytes: number;
            format: 'rgba8Srgb';
            colour: {
              primaries: 'bt709';
              transfer: 'srgb';
              matrix: 'rgb';
              range: 'full';
            };
          };
          ptsFrame: number;
        };
      };
      error?: string;
    }>;
    copyIntoUploadBuffer: (
      payload: {
        memoryId: string;
        slotCount: number;
        slotByteLen: number;
        slotIndex: number;
        generation: number;
        ptsFrame: number;
      },
      target: Uint8Array
    ) => Promise<{
      success: boolean;
      result?: {
        sequence: number;
        slotIndex: number;
        generation: number;
        byteLen: number;
        checksumAlgorithm: 'crc32';
        expectedChecksum: number;
        actualChecksum: number;
      };
      copiedBytes?: Uint8Array;
      error?: string;
    }>;
    copyIntoSharedUploadBuffer?: (
      payload: {
        memoryId: string;
        slotCount: number;
        slotByteLen: number;
        slotIndex: number;
        generation: number;
        ptsFrame: number;
        sharedUploadBufferId: string;
      }
    ) => Promise<{
      success: boolean;
      result?: {
        sequence: number;
        slotIndex: number;
        generation: number;
        byteLen: number;
        checksumAlgorithm: 'crc32';
        expectedChecksum: number;
        actualChecksum: number;
      };
      sharedUploadUnavailable?: boolean;
      error?: string;
    }>;
  };
  nativeOverlay: {
    getCapabilities: () => Promise<{
      available: boolean;
      reason?: string;
    }>;
    attach: (payload: {
      windowId?: number;
      x: number;
      y: number;
      width: number;
      height: number;
      scaleFactor: number;
    }) => Promise<{
      success: boolean;
      attached: boolean;
      fallback?: 'webgpuPresenter';
      reason?: string;
    }>;
    detach: (payload: {
      windowId?: number;
    }) => Promise<{
      success: boolean;
      attached: boolean;
      fallback?: 'webgpuPresenter';
      reason?: string;
    }>;
    presentScene: (payload: {
      windowId?: number;
      snapshot: unknown;
      media: readonly unknown[];
      selectionDecoration?: {
        canvasWidth: number;
        canvasHeight: number;
        quads: readonly {
          topLeftX: number;
          topLeftY: number;
          topRightX: number;
          topRightY: number;
          bottomRightX: number;
          bottomRightY: number;
          bottomLeftX: number;
          bottomLeftY: number;
        }[];
      };
    }) => Promise<{
      success: boolean;
      attached: boolean;
      fallback?: 'webgpuPresenter';
      reason?: string;
    }>;
    presentSharedFrame: (payload: {
      windowId?: number;
      mediaId: string;
      snapshot?: unknown;
      media?: readonly unknown[];
      slotCount: number;
      frame: {
        descriptor: {
          memoryId: string;
          slotIndex: number;
          generation: number;
          byteOffset: number;
          byteLen: number;
          width: number;
          height: number;
          strideBytes: number;
          format: 'rgba8Srgb';
        };
        ptsFrame: number;
      };
      // Bug B対策 — この present と同じ (objects, time) から計算された
      // 選択デコレーション。省略可（addon 未対応時は無視される）。
      selectionDecoration?: {
        canvasWidth: number;
        canvasHeight: number;
        quads: readonly {
          topLeftX: number;
          topLeftY: number;
          topRightX: number;
          topRightY: number;
          bottomRightX: number;
          bottomRightY: number;
          bottomLeftX: number;
          bottomLeftY: number;
        }[];
      };
    }) => Promise<{
      success: boolean;
      attached: boolean;
      fallback?: 'webgpuPresenter';
      reason?: string;
      releaseFrame?: {
        memoryId: string;
        slotIndex: number;
        generation: number;
        ptsFrame: number;
        copyOutState: 'gpuUploadFenceSignalled';
      };
    }>;
    // Bug D — clip 削除後 overlay の drawable に古いフレームが残る症状に
    // 対する単発 transparent clear。scene 空遷移 / unmount / project 切替の
    // 3 経路から呼ばれる。
    clearSurface: (payload: {
      windowId?: number;
    }) => Promise<{
      success: boolean;
      attached: boolean;
      fallback?: 'webgpuPresenter';
      reason?: string;
    }>;
    // 選択デコレーション — 選択枠・リサイズハンドルの見た目を native overlay
    // 側（Rust/wgpu）で描くための quad 送信。空配列でデコレーション解除。
    setSelectionDecoration: (payload: {
      windowId?: number;
      canvasWidth: number;
      canvasHeight: number;
      quads: readonly {
        topLeftX: number;
        topLeftY: number;
        topRightX: number;
        topRightY: number;
        bottomRightX: number;
        bottomRightY: number;
        bottomLeftX: number;
        bottomLeftY: number;
      }[];
    }) => Promise<{
      success: boolean;
      attached: boolean;
      fallback?: 'webgpuPresenter';
      reason?: string;
    }>;
    // Phase 7 (W7) 需要駆動staged attach（Phase 2）— nv12パイプラインの
    // バックグラウンド構築完了をポーリングする。addon未対応/無効時は
    // `true`（常時ready扱い、後方互換のデフォルト）。
    isNv12PipelineReady: (payload: { windowId?: number }) => Promise<boolean>;
  };
}

// Webview Tag Definition
declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      src?: string;
      autosize?: string;
      nodeintegration?: string;
      plugins?: string;
      preload?: string;
      httpreferrer?: string;
      useragent?: string;
      disablewebsecurity?: string;
      partition?: string;
      allowpopups?: string;
      webpreferences?: string;
      enableblinkfeatures?: string;
      disableblinkfeatures?: string;
    }, HTMLElement>;
  }
}
