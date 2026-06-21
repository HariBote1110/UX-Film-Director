import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import { shallow } from 'zustand/shallow';
import { buildExportAudioBuffer, buildExportAudioMixWav } from '../utils/audioMixdown';
import { resolveProjectExportEncodePlanFromBridge } from '../utils/projectExportEncodePlan';
import { runRustBackendVideoEncodeExport } from '../utils/rustBackendVideoEncodeExport';
import { transcodeRustBackendVideo } from '../utils/rustBackendVideoEncodeControl';
import { renderProjectExportFrame } from '../utils/projectExportFrameRenderer';
import type { RenderProjectExportFrameResult } from '../utils/projectExportFrameRenderer';
import {
  buildProjectExportFrameSourcePlan,
  createSingleUseProjectExportFrameSourceCloser,
  formatProjectExportRustFrameSourceUnavailableDetail,
  hasProjectExportNativeRenderMediaObjects,
  resolveProjectExportFrameSourcePolicyForEncode,
  resolveProjectExportRustFrameSourceContext,
  type ProjectExportRustFrameSourceContext,
  type ProjectExportRustFrameSource,
} from '../utils/projectExportFrameCanvas';
import { createSharedVideoFramePresentedFrameTaker } from '../utils/sharedVideoFramePresentedFrameHandoff';
import { encodeProjectExportCompatibilityVideo } from '../utils/projectExportCompatibilityEncoder';
import { updateExportProgressPhase } from '../utils/exportProgressDiagnostics';
import { logLastExportDiagnostics } from '../utils/exportDiagnosticsLog';
import { resolveProjectExportVideoTranscodeFastPath } from '../utils/projectExportVideoTranscodeFastPath';
import { resolveVideoExportEncodeSettings } from '../utils/videoExportEncodeSettings';
import type {
  RustBackendVideoEncodeFrame,
  RustBackendVideoEncodeNativeFramePayloadFrame,
  RustBackendVideoEncodeSharedFramePayloadFrame,
} from '../utils/rustBackendVideoEncodeExport';

const createRustEncodeSessionId = (): string =>
  `uxfd-export-${Date.now().toString(36)}`;

const getProjectExportIpcRenderer = (): Window['ipcRenderer'] => {
  const maybeIpcRenderer = (window as Partial<Window>).ipcRenderer;
  if (!maybeIpcRenderer || typeof maybeIpcRenderer.invoke !== 'function') {
    throw new Error('Electron IPC is unavailable. Export must be run from the Electron app window, not a plain browser tab.');
  }
  return maybeIpcRenderer;
};

const closeEncodedFrameBitmap = (frame: RustBackendVideoEncodeFrame): void => {
  if ('bitmap' in frame) {
    frame.bitmap.close();
  }
};

const prepareProjectExportTranscodeAudioPath = async ({
  objects,
  exportDuration,
  sampleRate,
  ipcRenderer,
}: {
  objects: TimelineObject[];
  exportDuration: number;
  sampleRate: number;
  ipcRenderer: Window['ipcRenderer'];
}): Promise<string> => {
  const mixedAudioWav = await buildExportAudioMixWav(objects, exportDuration, sampleRate);
  if (!mixedAudioWav) {
    throw new Error('混在音声の一時WAVを生成できませんでした');
  }
  const audioSaveResult = await ipcRenderer.invoke('save-temp-audio', mixedAudioWav);
  if (!audioSaveResult?.success || typeof audioSaveResult.path !== 'string') {
    throw new Error(audioSaveResult?.error || '音声一時ファイルを保存できませんでした');
  }
  return audioSaveResult.path;
};

const withExportStepTimeout = async <T,>(
  promise: Promise<T>,
  detail: string,
  timeoutMs = 15000,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${detail} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const useProjectExport = (
  renderScene: (time: number, objects: TimelineObject[]) => void,
  getExportCanvas?: () => HTMLCanvasElement | null,
  getRustExportFrameSource?: (context: ProjectExportRustFrameSourceContext) => ProjectExportRustFrameSource | null,
) => {
  const { isExporting, setExporting, setTime, setExportProgress } = useStore((state) => ({
    isExporting: state.isExporting,
    setExporting: state.setExporting,
    setTime: state.setTime,
    setExportProgress: state.setExportProgress,
  }), shallow);

  useEffect(() => {
    if (!isExporting) return;

    let cancelled = false;
    // 副作用クリーンアップ（cancelled）とユーザーによるキャンセル要求の双方を見る。
    const isCancelled = () => cancelled || useStore.getState().exportCancelRequested;

    const runExport = async () => {
      const ipcRenderer = getProjectExportIpcRenderer();
      const rustExportOnly = import.meta.env.VITE_UXFD_RUST_EXPORT_ONLY === '1';
      const exportEncodeSettings = resolveVideoExportEncodeSettings({
        preset: import.meta.env.VITE_UXFD_VIDEO_EXPORT_QUALITY_PRESET,
        videoBitrateKbps: Number(import.meta.env.VITE_UXFD_VIDEO_EXPORT_BITRATE_KBPS),
      });
      const rustExportRenderAheadFrameCount = Number(import.meta.env.VITE_UXFD_RUST_EXPORT_RENDER_AHEAD_FRAMES);
      const { projectSettings, objects, layers } = useStore.getState();
      const exportObjects = objects.filter((obj) => layers[obj.layer]?.visible !== false);
      const hasVideoObjects = exportObjects.some((obj) => obj.type === 'video');
      const exportEncodePlan = resolveProjectExportEncodePlanFromBridge({
        rustExportOnly,
        hasVideoObjects,
        rustVideoEncoderBridge: window.rustVideoEncoder,
      });
      if (!exportEncodePlan.ok) {
        alert(`エクスポート失敗: ${exportEncodePlan.detail}`);
        setExporting(false);
        return;
      }
      const hasNativeRenderMediaObjects = hasProjectExportNativeRenderMediaObjects(exportObjects);
      const frameSourcePolicy = resolveProjectExportFrameSourcePolicyForEncode({
        rustExportOnly,
        hasVideoObjects,
        hasNativeRenderMediaObjects,
        encodeEngine: exportEncodePlan.engine,
      });
      setExportProgress({
        phase: 'preparing',
        currentFrame: 0,
        totalFrames: 0,
        stepDetail: 'Rust export: resolving shared-frame source',
      });
      let rustFrameSourceUnavailableDetail: string | undefined;
      const initialFrameSourcePlan = buildProjectExportFrameSourcePlan({
        rustFrameSource: getRustExportFrameSource?.(resolveProjectExportRustFrameSourceContext({
          objects: exportObjects,
          time: 0,
          encodeEngine: exportEncodePlan.engine,
          presentedFrameSharedFrameTaker: createSharedVideoFramePresentedFrameTaker() ?? undefined,
          onFrameSourceUnavailable: (decision) => {
            rustFrameSourceUnavailableDetail = formatProjectExportRustFrameSourceUnavailableDetail(decision);
          },
        })) ?? null,
        rustFrameSourceUnavailableDetail,
        rustFrameSourcePolicy: frameSourcePolicy.rustFrameSourcePolicy,
        rustFrameSourceBlockedFallback: frameSourcePolicy.rustFrameSourceBlockedFallback,
        hasVideoObjects,
        hasNativeRenderMediaObjects,
        getExportCanvas,
      });
      if (!initialFrameSourcePlan.ok) {
        setExportProgress({
          phase: 'preparing',
          currentFrame: 0,
          totalFrames: 0,
          stepDetail: 'Rust export: shared-frame source unavailable',
          exportFrameSourcePlanFailure: {
            reason: initialFrameSourcePlan.reason,
            detail: initialFrameSourcePlan.detail,
          },
        });
        alert(`エクスポート失敗: ${initialFrameSourcePlan.detail}`);
        setExporting(false);
        return;
      }
      const exportFrameSourcePlan = initialFrameSourcePlan;
      const closeRustFrameSource = exportFrameSourcePlan.source === 'sharedRendererRustFrameSource'
        ? createSingleUseProjectExportFrameSourceCloser(exportFrameSourcePlan.frameSource)
        : null;

      try {
        const fps = projectSettings.fps;
        const width = projectSettings.width;
        const height = projectSettings.height;
        const sampleRate = projectSettings.sampleRate || 44100;
        const lastEnd = Math.max(...exportObjects.map(o => o.startTime + o.duration), 0);
        const exportDuration = Math.max(lastEnd, 1);
        const totalFrames = Math.ceil(exportDuration * fps);
        // 進捗更新のスロットル間隔（約 10 回/秒）。
        const progressStep = Math.max(1, Math.round(fps / 10));

        setExportProgress({
          phase: 'preparing',
          currentFrame: 0,
          totalFrames,
          stepDetail: 'Rust export: waiting for save path',
        });

        // ファイル保存先を先に決定（ユーザー操作が必要なため）
        const savePath = await ipcRenderer.invoke('show-save-dialog', {
          defaultPath: 'output.mp4',
          filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
        });
        if (!savePath) { setExporting(false); return; }
        setExportProgress({
          phase: 'preparing',
          currentFrame: 0,
          totalFrames,
          stepDetail: 'Rust export: preparing encoder',
        });

        const encWidth = width % 2 === 0 ? width : width - 1;
        const encHeight = height % 2 === 0 ? height : height - 1;
        const rustEncodeSessionId = createRustEncodeSessionId();
        const transcodeFastPath = resolveProjectExportVideoTranscodeFastPath({
          objects: exportObjects,
          width: encWidth,
          height: encHeight,
          fps,
          durationSeconds: exportDuration,
        });

        if (
          exportEncodePlan.engine === 'rustBackendVideoEncoder'
          && transcodeFastPath
          && typeof window.rustVideoEncoder.transcodeVideo === 'function'
        ) {
          const { requiresAudioMix, ...transcodePayload } = transcodeFastPath;
          let preparedTranscodeAudioPath: string | null = null;
          setExportProgress({
            phase: 'transcoding',
            currentFrame: 0,
            totalFrames,
            startedAtMs: Date.now(),
            stepDetail: 'Rust export: direct video transcode running',
          });
          const unsubscribeTranscodeProgress = window.rustVideoEncoder.onTranscodeProgress?.((event) => {
            if (event.sessionId !== rustEncodeSessionId) return;
            const currentProgress = useStore.getState().exportProgress;
            setExportProgress(updateExportProgressPhase(currentProgress, {
              phase: 'transcoding',
              currentFrame: event.completedFrames,
              totalFrames: event.totalFrames,
              stepDetail: `Rust export: direct video transcode ${event.percent.toFixed(1)}%`,
            }));
          });
          const transcodeResponse = await (async () => {
            try {
              const transcodeAudioPath = requiresAudioMix
                ? await prepareProjectExportTranscodeAudioPath({
                  objects: exportObjects,
                  exportDuration,
                  sampleRate,
                  ipcRenderer,
                })
                : null;
              preparedTranscodeAudioPath = transcodeAudioPath;
              return await transcodeRustBackendVideo({
                ...transcodePayload,
                ...exportEncodeSettings,
                audioPath: transcodeAudioPath,
                sessionId: rustEncodeSessionId,
                outputPath: savePath,
              });
            } finally {
              unsubscribeTranscodeProgress?.();
              if (preparedTranscodeAudioPath) {
                await ipcRenderer.invoke('delete-temp-file', { filePath: preparedTranscodeAudioPath }).catch(() => {});
              }
            }
          })();
          if (!transcodeResponse.success) {
            throw new Error(transcodeResponse.error ?? 'Rust backend video transcode failed.');
          }
          const transcodeResult = transcodeResponse.result as { frameCount?: number } | undefined;
          if (isCancelled()) return;
          const savingProgress = useStore.getState().exportProgress;
          setExportProgress(updateExportProgressPhase(savingProgress, {
            phase: 'saving',
            currentFrame: totalFrames,
            totalFrames,
            stepDetail: 'Rust export: direct video transcode finished',
          }));
          alert(`エクスポート完了！\nコーデック: Rust backend direct transcode\nフレーム: ${transcodeResult?.frameCount ?? totalFrames}\n保存先: ${savePath}`);
          return;
        }

        async function* renderFrames(preferSharedFrame: boolean) {
          let rustFrameSourceBlocked = false;

          for (let i = 0; i < totalFrames; i++) {
            if (isCancelled()) break;

            // 進捗を更新（スロットル）。
            if (i % progressStep === 0) {
              const progress = useStore.getState().exportProgress;
              setExportProgress(updateExportProgressPhase(progress, {
                phase: 'rendering',
                currentFrame: i,
                totalFrames,
                stepDetail: preferSharedFrame
                  ? `Rust export: waiting for shared-frame source frame=${i}`
                  : `Rust export: rendering compatibility frame=${i}`,
              }));
            }

            const stepDetail = preferSharedFrame
              ? `Rust export shared-frame source frame=${i}`
              : `Rust export compatibility frame=${i}`;
            const result: RenderProjectExportFrameResult = await withExportStepTimeout(renderProjectExportFrame({
              frameSourcePlan: exportFrameSourcePlan,
              rustFrameSourceBlocked,
              frameIndex: i,
              fps,
              width: encWidth,
              height: encHeight,
              objects: exportObjects,
              encodeSessionId: rustEncodeSessionId,
              preferSharedFrame,
              renderScene,
              getExportCanvas,
              closeRustFrameSource: closeRustFrameSource ?? undefined,
              onSynchroniseTimeline: setTime,
              onRustFrameSourceBlocked: (event) => {
                const currentProgress = useStore.getState().exportProgress;
                if (currentProgress) {
                  setExportProgress({
                    ...currentProgress,
                    stepDetail: `Rust export: shared-frame source blocked frame=${event.frameIndex}`,
                    rustFrameSourceBlocked: event,
                  });
                }
              },
              onRustFrameSourceFallback: (event) => {
                console.warn('[Export] Rust/shared renderer frame source blocked.', event);
              },
            }), stepDetail);
            rustFrameSourceBlocked = result.rustFrameSourceBlocked;
            yield result.frame;
            closeEncodedFrameBitmap(result.frame);
          }

        }

        async function* renderRustEncodeFrames(): AsyncGenerator<RustBackendVideoEncodeSharedFramePayloadFrame | RustBackendVideoEncodeNativeFramePayloadFrame> {
          for await (const frame of renderFrames(true)) {
            if ('sharedFramePayload' in frame || 'nativeEncodeFramePayload' in frame) {
              yield frame;
              continue;
            }
            frame.bitmap.close();
            throw new Error('Rust backend encoder requires shared-frame or native encode payloads from the export frame source.');
          }
        }

        if (exportEncodePlan.engine === 'rustBackendVideoEncoder') {
          let audioPath: string | null = null;
          try {
            setExportProgress({
              phase: 'preparing',
              currentFrame: 0,
              totalFrames,
              stepDetail: 'Rust export: preparing audio mix',
            });
            const mixedAudioWav = await buildExportAudioMixWav(exportObjects, exportDuration, sampleRate);
            if (mixedAudioWav) {
              setExportProgress({
                phase: 'preparing',
                currentFrame: 0,
                totalFrames,
                stepDetail: 'Rust export: saving temporary audio',
              });
              const audioSaveResult = await ipcRenderer.invoke('save-temp-audio', mixedAudioWav);
              if (!audioSaveResult?.success || typeof audioSaveResult.path !== 'string') {
                throw new Error(audioSaveResult?.error || '音声一時ファイルを保存できませんでした');
              }
              audioPath = audioSaveResult.path;
            }

            const result = await runRustBackendVideoEncodeExport({
              filePath: savePath,
              audioPath,
              sessionId: rustEncodeSessionId,
              width: encWidth,
              height: encHeight,
              fps,
              frames: renderRustEncodeFrames(),
              renderAheadFrameCount: rustExportRenderAheadFrameCount,
              onNativeRenderOutputRelease: (event) => {
                const currentProgress = useStore.getState().exportProgress;
                if (!currentProgress) return;
                setExportProgress({
                  ...currentProgress,
                  stepDetail: currentProgress.stepDetail ?? 'Rust export: releasing native render output',
                  nativeRenderOutputRelease: event,
                });
              },
            });
            if (isCancelled()) return;

            const savingProgress = useStore.getState().exportProgress;
            setExportProgress(updateExportProgressPhase(savingProgress, {
              phase: 'saving',
              currentFrame: totalFrames,
              totalFrames,
              stepDetail: 'Rust export: finishing encoder',
            }));
            alert(`エクスポート完了！\nコーデック: Rust backend rawvideo/ffmpeg\nフレーム: ${result.frameCount}\n保存先: ${savePath}`);
          } finally {
            if (audioPath) {
              await ipcRenderer.invoke('delete-temp-file', { filePath: audioPath }).catch(() => {});
            }
          }
          return;
        }

        if (hasVideoObjects) {
          throw new Error('Video export requires the Rust backend encoder before opening the WebCodecs export stream.');
        }

        const audioBuffer = await buildExportAudioBuffer(exportObjects, exportDuration, sampleRate);
        setExportProgress({
          phase: 'preparing',
          currentFrame: 0,
          totalFrames,
          stepDetail: 'Rust export: opening compatibility stream',
        });

        // 出力をディスクへ逐次書き出す（出力全体をメモリに保持しない）。
        const openRes = await ipcRenderer.invoke('export-stream-open', { filePath: savePath });
        if (!openRes?.success) throw new Error(openRes?.error || '出力ファイルを開けませんでした');
        const streamId = openRes.id as number;
        let writtenBytes = 0;
        let streamClosed = false;
        const closeStream = async () => {
          if (streamClosed) return;
          streamClosed = true;
          await ipcRenderer.invoke('export-stream-close', { id: streamId }).catch(() => {});
        };

        let result;
        try {
          result = await encodeProjectExportCompatibilityVideo({
            width,
            height,
            fps,
            frames: renderFrames(false) as AsyncIterable<{ timestamp: number; bitmap: ImageBitmap }>,
            audioBuffer,
            hasVideoObjects,
            writeChunk: async (data, position) => {
              const end = position + data.byteLength;
              if (end > writtenBytes) writtenBytes = end;
              const w = await ipcRenderer.invoke('export-stream-write', {
                id: streamId,
                chunk: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
                position,
              });
              if (!w?.success) throw new Error(w?.error || 'チャンク書き込みに失敗しました');
            },
          });
        } finally {
          await closeStream();
        }

        if (isCancelled()) return;

        if (!isCancelled()) {
          const savingProgress = useStore.getState().exportProgress;
          setExportProgress(updateExportProgressPhase(savingProgress, {
            phase: 'saving',
            currentFrame: totalFrames,
            totalFrames,
            stepDetail: 'Rust export: compatibility encode finished',
          }));
          alert(`エクスポート完了！\nコーデック: ${result.codecUsed}\nサイズ: ${(writtenBytes / 1024 / 1024).toFixed(1)}MB\n処理時間: ${(result.durationMs / 1000).toFixed(1)}秒`);
        }

      } catch (error) {
        if (!isCancelled()) {
          alert(`エクスポート失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
      } finally {
        if (exportFrameSourcePlan.source === 'sharedRendererRustFrameSource') {
          await closeRustFrameSource?.();
        }
        setExporting(false);
        logLastExportDiagnostics(useStore.getState().lastExportDiagnostics);
      }
    };

    runExport();
    return () => { cancelled = true; };
  }, [isExporting, renderScene, setExporting, setTime, setExportProgress, getExportCanvas, getRustExportFrameSource]);
};
