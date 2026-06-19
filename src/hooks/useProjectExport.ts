import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import { shallow } from 'zustand/shallow';
import { buildExportAudioBuffer, buildExportAudioMixWav } from '../utils/audioMixdown';
import { resolveProjectExportEncodePlanFromBridge } from '../utils/projectExportEncodePlan';
import { runRustBackendVideoEncodeExport } from '../utils/rustBackendVideoEncodeExport';
import { renderProjectExportRustEncodeFrame } from '../utils/projectExportRustEncodeFrame';
import {
  buildProjectExportFrameSourcePlan,
  createSingleUseProjectExportFrameSourceCloser,
  resolveProjectExportFrameSourcePolicyForEncode,
  resolveProjectExportFrameRuntimePlan,
  resolveProjectExportFrameCanvas,
  resolveProjectExportRustFrameSourceContext,
  shouldSynchroniseTimelineForProjectExportFrame,
  type ProjectExportRustFrameSourceContext,
  type ProjectExportRustFrameSource,
} from '../utils/projectExportFrameCanvas';
import { isSharedRendererExportFrameSourceBlockedError } from '../utils/sharedRendererExportFrameSource';
import { createSharedVideoFramePresentedFrameTaker } from '../utils/sharedVideoFramePresentedFrameHandoff';
import { captureProjectExportLegacyCanvasFrame } from '../utils/projectExportLegacyCanvasCapture';
import { encodeProjectExportCompatibilityVideo } from '../utils/projectExportCompatibilityEncoder';
import { updateExportProgressPhase } from '../utils/exportProgressDiagnostics';
import type {
  RustBackendVideoEncodeFrame,
  RustBackendVideoEncodeSharedFramePayloadFrame,
} from '../utils/rustBackendVideoEncodeExport';

const { ipcRenderer } = window;

const createRustEncodeSessionId = (): string =>
  `uxfd-export-${Date.now().toString(36)}`;

const closeEncodedFrameBitmap = (frame: RustBackendVideoEncodeFrame): void => {
  if ('bitmap' in frame) {
    frame.bitmap.close();
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
      const rustExportOnly = import.meta.env.VITE_UXFD_RUST_EXPORT_ONLY === '1';
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
      const frameSourcePolicy = resolveProjectExportFrameSourcePolicyForEncode({
        rustExportOnly,
        hasVideoObjects,
        encodeEngine: exportEncodePlan.engine,
      });
      const initialFrameSourcePlan = buildProjectExportFrameSourcePlan({
        rustFrameSource: getRustExportFrameSource?.(resolveProjectExportRustFrameSourceContext({
          objects: exportObjects,
          time: 0,
          encodeEngine: exportEncodePlan.engine,
          presentedFrameSharedFrameTaker: createSharedVideoFramePresentedFrameTaker() ?? undefined,
        })) ?? null,
        rustFrameSourcePolicy: frameSourcePolicy.rustFrameSourcePolicy,
        rustFrameSourceBlockedFallback: frameSourcePolicy.rustFrameSourceBlockedFallback,
        hasVideoObjects,
        getExportCanvas,
      });
      if (!initialFrameSourcePlan.ok) {
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
        const dt = 1 / fps;
        const width = projectSettings.width;
        const height = projectSettings.height;
        const sampleRate = projectSettings.sampleRate || 44100;
        const lastEnd = Math.max(...exportObjects.map(o => o.startTime + o.duration), 0);
        const exportDuration = Math.max(lastEnd, 1);
        const totalFrames = Math.ceil(exportDuration * fps);
        // 進捗更新のスロットル間隔（約 10 回/秒）。
        const progressStep = Math.max(1, Math.round(fps / 10));

        setExportProgress({ phase: 'preparing', currentFrame: 0, totalFrames });

        // ファイル保存先を先に決定（ユーザー操作が必要なため）
        const savePath = await ipcRenderer.invoke('show-save-dialog', {
          defaultPath: 'output.mp4',
          filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
        });
        if (!savePath) { setExporting(false); return; }

        const encWidth = width % 2 === 0 ? width : width - 1;
        const encHeight = height % 2 === 0 ? height : height - 1;
        const rustEncodeSessionId = createRustEncodeSessionId();

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
              }));
            }

            const t = i * dt;
            let frameRuntimePlan = resolveProjectExportFrameRuntimePlan({
              frameSourcePlan: exportFrameSourcePlan,
              rustFrameSourceBlocked,
            });
            if (
              shouldSynchroniseTimelineForProjectExportFrame(frameRuntimePlan)
              && i % Math.max(1, Math.floor(fps / 2)) === 0
            ) {
              setTime(t);
            }

            if (
              frameRuntimePlan.source === 'sharedRendererRustFrameSource'
              && exportFrameSourcePlan.source === 'sharedRendererRustFrameSource'
            ) {
              const timestampUs = Math.round(i * 1_000_000 / fps);
              try {
                const frame = await renderProjectExportRustEncodeFrame({
                  frameSource: exportFrameSourcePlan.frameSource,
                  encodeSessionId: rustEncodeSessionId,
                  preferSharedFrame,
                  request: {
                    frameIndex: i,
                    timestampUs,
                    time: t,
                    width: encWidth,
                    height: encHeight,
                    objects: exportObjects,
                  },
                });
                yield frame;
                closeEncodedFrameBitmap(frame);
                continue;
              } catch (error) {
                if (!isSharedRendererExportFrameSourceBlockedError(error)) {
                  throw error;
                }
                rustFrameSourceBlocked = true;
                const blockedRuntimePlan = resolveProjectExportFrameRuntimePlan({
                  frameSourcePlan: exportFrameSourcePlan,
                  rustFrameSourceBlocked,
                });
                const currentProgress = useStore.getState().exportProgress;
                if (currentProgress) {
                  setExportProgress({
                    ...currentProgress,
                    rustFrameSourceBlocked: {
                      reason: error.reason,
                      frameIndex: error.frameIndex,
                      legacyCanvasFallbackAllowed: error.legacyCanvasFallbackAllowed,
                      detail: error.message,
                    },
                  });
                }
                if (blockedRuntimePlan.shouldCloseRustFrameSource) {
                  await closeRustFrameSource?.();
                }
                if (blockedRuntimePlan.shouldFailOnRustFrameSourceBlocked) {
                  throw error;
                }
                frameRuntimePlan = blockedRuntimePlan;
                console.warn('[Export] Rust/shared renderer frame source blocked; falling back to legacy canvas capture.', error);
              }
            }

            if (frameRuntimePlan.requiresRenderScene) {
              renderScene(t, exportObjects);
            }
            const frameCanvas = resolveProjectExportFrameCanvas({
              getExportCanvas,
            });
            if (!frameCanvas.ok) throw new Error(frameCanvas.detail);
            const frame = await captureProjectExportLegacyCanvasFrame({
              canvas: frameCanvas.canvas,
              width: encWidth,
              height: encHeight,
              timestamp: Math.round(i * 1_000_000 / fps),
            });
            yield frame;
            frame.bitmap.close();
          }

        }

        async function* renderRustEncodeFrames(): AsyncGenerator<RustBackendVideoEncodeSharedFramePayloadFrame> {
          for await (const frame of renderFrames(true)) {
            if ('sharedFramePayload' in frame) {
              yield frame;
              continue;
            }
            frame.bitmap.close();
            throw new Error('Rust backend encoder requires shared-frame payloads from the export frame source.');
          }
        }

        if (exportEncodePlan.engine === 'rustBackendVideoEncoder') {
          let audioPath: string | null = null;
          try {
            const mixedAudioWav = await buildExportAudioMixWav(exportObjects, exportDuration, sampleRate);
            if (mixedAudioWav) {
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
              onNativeRenderOutputRelease: (event) => {
                const currentProgress = useStore.getState().exportProgress;
                if (!currentProgress) return;
                setExportProgress({
                  ...currentProgress,
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
      }
    };

    runExport();
    return () => { cancelled = true; };
  }, [isExporting, renderScene, setExporting, setTime, setExportProgress, getExportCanvas, getRustExportFrameSource]);
};
