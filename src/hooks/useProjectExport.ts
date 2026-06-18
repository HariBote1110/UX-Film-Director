import { useEffect } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject, VideoObject } from '../types';
import { shallow } from 'zustand/shallow';
import { buildExportAudioBuffer } from '../utils/audioMixdown';
import { encodeVideoToMp4 } from '../utils/videoExportPipeline';
import { resolveProjectExportEncodePlan } from '../utils/projectExportEncodePlan';
import { VideoFrameProvider } from '../utils/videoFrameProvider';
import { PlaybackFrameProvider } from '../utils/playbackFrameProvider';
import type { FrameProvider } from '../utils/frameProvider';
import {
  buildProjectExportFrameSourcePlan,
  resolveProjectExportFrameRuntimePlan,
  resolveProjectExportFrameCanvas,
  type ProjectExportRustFrameSourceContext,
  type ProjectExportRustFrameSource,
} from '../utils/projectExportFrameCanvas';
import { isSharedRendererExportFrameSourceBlockedError } from '../utils/sharedRendererExportFrameSource';

const { ipcRenderer } = window;

export const useProjectExport = (
  pixiAppRef: React.MutableRefObject<PIXI.Application | null>,
  videoElementsRef: React.MutableRefObject<Map<string, HTMLVideoElement>>,
  renderScene: (time: number, objects: TimelineObject[]) => void,
  getExportCanvas?: () => HTMLCanvasElement | null,
  /** VideoDecoder ハイブリッドパス: フレームを renderScene 前に注入するための ref */
  exportFrameOverridesRef?: React.MutableRefObject<Map<string, ImageBitmap>>,
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
      const initialFrameSourcePlan = buildProjectExportFrameSourcePlan({
        rustFrameSource: getRustExportFrameSource?.({
          objects: exportObjects,
          time: 0,
        }) ?? null,
        rustFrameSourcePolicy: rustExportOnly ? 'requireRustFrameSource' : 'allowLegacyCanvas',
        rustFrameSourceBlockedFallback: rustExportOnly ? 'failExport' : 'legacyCanvas',
        getExportCanvas,
        pixiCanvas: pixiAppRef.current?.canvas as HTMLCanvasElement | null | undefined,
      });
      if (!initialFrameSourcePlan.ok) {
        alert(`エクスポート失敗: ${initialFrameSourcePlan.detail}`);
        setExporting(false);
        return;
      }
      const exportFrameSourcePlan = initialFrameSourcePlan;
      const exportEncodePlan = resolveProjectExportEncodePlan({
        rustExportOnly,
        rustEncoderAvailable: false,
      });
      if (!exportEncodePlan.ok) {
        alert(`エクスポート失敗: ${exportEncodePlan.detail}`);
        setExporting(false);
        return;
      }
      if (exportEncodePlan.engine === 'rustBackendVideoEncoder') {
        alert('エクスポート失敗: Rust backend video encoder path is not connected yet.');
        setExporting(false);
        return;
      }

      // フレームプロバイダ（VideoDecoder or 再生方式）のクリーンアップ用リスト
      const providers = new Map<string, FrameProvider>();

      try {
        const fps = projectSettings.fps;
        const dt = 1 / fps;
        const width = projectSettings.width;
        const height = projectSettings.height;
        const sampleRate = projectSettings.sampleRate || 44100;
        const videoObjects = exportObjects.filter(
          (obj): obj is Extract<TimelineObject, { type: 'video' }> => obj.type === 'video'
        );
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

        const audioBuffer = await buildExportAudioBuffer(exportObjects, exportDuration, sampleRate);

        // 動画を一時停止
        Array.from(videoElementsRef.current.values()).forEach(v => v.pause());

        const encWidth = width % 2 === 0 ? width : width - 1;
        const encHeight = height % 2 === 0 ? height : height - 1;

        if (exportFrameSourcePlan.requiresLegacyBrowserVideoProviders) {
          // ── フレームプロバイダを初期化 ───────────────────────────────────────
          // シーク方式(~9fps)は使わず、①VideoDecoder ②再生方式(rVFC) の順で高速取得を試み、
          // どちらも不可のときだけ従来のシーク方式へフォールバックする。
          for (const obj of videoObjects) {
            if (obj.reversed) continue; // 逆再生はシーク方式フォールバック

            const v = obj as VideoObject;

            // 中間ファイル（編集中にバックグラウンド生成した出力解像度の H.264）が
            // あれば最優先。4K HEVC/H.264 を出力解像度へダウンスケール済みなので
            // VideoDecoder で最速かつフレーム落ちなし。生成は待たない。
            let intermediateUrl: string | undefined;
            if (v.filePath) {
              try {
                const chk = await ipcRenderer.invoke('check-intermediate', { filePath: v.filePath, width });
                if (chk?.exists && chk.path) intermediateUrl = `file://${chk.path}`;
              } catch { /* ignore */ }
            }

            // 優先順: 中間ファイル → プロキシ(H.264) → ソース。
            const proxyPath = v.proxyFilePath;
            const sourceUrl = intermediateUrl
              ?? (proxyPath ? `file://${proxyPath}` : v.filePath ? `file://${v.filePath}` : v.src);
            if (!sourceUrl) continue; // URL 不明 → シーク方式フォールバック
            const sourceLabel = intermediateUrl ? 'intermediate' : proxyPath ? 'proxy' : 'source';

            const startSec = obj.offset || 0;
            const endSec = startSec + obj.duration + 1; // +1s のマージン
            const withTimeout = (p: Promise<void>, ms: number, msg: string) => Promise.race([
              p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
            ]);

            // ① VideoDecoder 経路（H.264/中間ファイルで最速・~700fps）。
            //    HEVC ソース直叩き・moov 末尾配置・不正コンテナでは hang し得るためタイムアウト付き。
            const vdProvider = new VideoFrameProvider(sourceUrl, startSec, endSec);
            let attached = false;
            try {
              await withTimeout(vdProvider.init(), 5000, 'VideoDecoder 初期化タイムアウト(5s)');
              providers.set(obj.id, vdProvider);
              attached = true;
              console.log(`[Export] VideoDecoder パス: ${obj.id} (${sourceLabel})`);
            } catch (e) {
              console.warn(`[Export] VideoDecoder 不可 → 再生方式を試行: ${obj.id}`, e);
              vdProvider.close();
            }

            // ② 再生方式（rVFC）。中間ファイル未生成の HEVC 等のフォールバック。
            if (!attached && !isCancelled()) {
              const pbProvider = new PlaybackFrameProvider(sourceUrl, startSec, endSec, { playbackRate: 2 });
              try {
                await withTimeout(pbProvider.init(), 8000, '再生方式 初期化タイムアウト(8s)');
                providers.set(obj.id, pbProvider);
                attached = true;
                console.log(`[Export] 再生方式(rVFC)パス: ${obj.id}`);
              } catch (e) {
                console.warn(`[Export] 再生方式も不可 → シーク方式フォールバック: ${obj.id}`, e);
                pbProvider.close();
              }
            }
            // ④ いずれも失敗時は providers に入れず、従来のシーク方式が担当する。
          }
        }

        const usingVideoDecoder = providers.size > 0;
        if (usingVideoDecoder) {
          console.log(`[Export] VideoDecoder ハイブリッドパス: ${providers.size} クリップ`);
        }

        async function* renderFrames() {
          let rustFrameSourceBlocked = false;

          for (let i = 0; i < totalFrames; i++) {
            if (isCancelled()) break;

            // 進捗を更新（スロットル）。
            if (i % progressStep === 0) {
              setExportProgress({ phase: 'rendering', currentFrame: i, totalFrames });
            }

            const t = i * dt;
            if (i % Math.max(1, Math.floor(fps / 2)) === 0) setTime(t);
            const frameRuntimePlan = resolveProjectExportFrameRuntimePlan({
              frameSourcePlan: exportFrameSourcePlan,
              rustFrameSourceBlocked,
            });

            if (
              frameRuntimePlan.source === 'sharedRendererRustFrameSource'
              && exportFrameSourcePlan.source === 'sharedRendererRustFrameSource'
            ) {
              exportFrameOverridesRef?.current.clear();
              const timestampUs = Math.round(i * 1_000_000 / fps);
              try {
                const bitmap = await exportFrameSourcePlan.frameSource.renderFrame({
                  frameIndex: i,
                  timestampUs,
                  time: t,
                  width: encWidth,
                  height: encHeight,
                  objects: exportObjects,
                });
                yield { timestamp: timestampUs, bitmap };
                bitmap.close();
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
                if (blockedRuntimePlan.shouldCloseRustFrameSource) {
                  await exportFrameSourcePlan.frameSource.close?.();
                }
                if (blockedRuntimePlan.shouldFailOnRustFrameSourceBlocked) {
                  throw error;
                }
                console.warn('[Export] Rust/shared renderer frame source blocked; falling back to legacy canvas capture.', error);
              }
            }

            const activeVideos = videoObjects.filter(
              obj => t >= obj.startTime && t < obj.startTime + obj.duration
            );

            // ── VideoDecoder パス: フレームを先取りして override に注入 ─────
            if (frameRuntimePlan.usesExportFrameOverrides && exportFrameOverridesRef) {
              exportFrameOverridesRef.current.clear();
              await Promise.all(activeVideos.map(async (obj) => {
                const provider = providers.get(obj.id);
                if (!provider) return; // シーク方式対象はスキップ
                const localUs = Math.round(((t - obj.startTime) + (obj.offset || 0)) * 1_000_000);
                const bitmap = await provider.getFrame(localUs);
                if (bitmap) exportFrameOverridesRef.current.set(obj.id, bitmap);
              }));
            }

            // ── シーク方式フォールバック: providers にないクリップのみシーク ─
            const seekTargets = frameRuntimePlan.requiresHtmlVideoElementSeekFallback
              ? activeVideos.filter(obj => !providers.has(obj.id))
              : [];
            if (seekTargets.length > 0) {
              await Promise.all(seekTargets.map(obj => {
                const video = videoElementsRef.current.get(obj.id);
                if (!video || video.readyState < 1) return Promise.resolve();
                const targetTime = (t - obj.startTime) + (obj.offset || 0);
                if (Math.abs(video.currentTime - targetTime) < 0.001) return Promise.resolve();
                return new Promise<void>(resolve => {
                  const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
                  setTimeout(() => { video.removeEventListener('seeked', onSeeked); resolve(); }, 1000);
                  video.addEventListener('seeked', onSeeked);
                  video.currentTime = targetTime;
                });
              }));
            }

            if (frameRuntimePlan.requiresRenderScene) {
              renderScene(t, exportObjects);
            }
            const frameCanvas = resolveProjectExportFrameCanvas({
              getExportCanvas,
              pixiCanvas: pixiAppRef.current?.canvas as HTMLCanvasElement | null | undefined,
            });
            if (!frameCanvas.ok) throw new Error(frameCanvas.detail);
            const canvas = frameCanvas.canvas;
            const bitmap = await createImageBitmap(canvas, 0, 0, encWidth, encHeight);
            yield { timestamp: Math.round(i * 1_000_000 / fps), bitmap };
            bitmap.close();
          }

          // フレームループ終了後に override をクリア
          exportFrameOverridesRef?.current.clear();
        }

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
          result = await encodeVideoToMp4({
            width,
            height,
            fps,
            frames: renderFrames(),
            audioBuffer,
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
          const decoderNote = usingVideoDecoder ? '\n（VideoDecoder 高速パス使用）' : '';
          alert(`エクスポート完了！\nコーデック: ${result.codecUsed}\nサイズ: ${(writtenBytes / 1024 / 1024).toFixed(1)}MB\n処理時間: ${(result.durationMs / 1000).toFixed(1)}秒${decoderNote}`);
        }

      } catch (error) {
        if (!isCancelled()) {
          alert(`エクスポート失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
      } finally {
        // 全プロバイダを解放
        if (exportFrameSourcePlan.source === 'sharedRendererRustFrameSource') {
          await exportFrameSourcePlan.frameSource.close?.();
        }
        for (const provider of providers.values()) provider.close();
        providers.clear();
        exportFrameOverridesRef?.current.clear();
        setExporting(false);
      }
    };

    runExport();
    return () => { cancelled = true; };
  }, [isExporting, renderScene, setExporting, setTime, setExportProgress, pixiAppRef, videoElementsRef, getExportCanvas, exportFrameOverridesRef, getRustExportFrameSource]);
};
