import { useEffect } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject, VideoObject } from '../types';
import { shallow } from 'zustand/shallow';
import { buildExportAudioBuffer } from '../utils/audioMixdown';
import { encodeVideoToMp4 } from '../utils/videoExportPipeline';
import { VideoFrameProvider } from '../utils/videoFrameProvider';
import { PlaybackFrameProvider } from '../utils/playbackFrameProvider';
import type { FrameProvider } from '../utils/frameProvider';

const { ipcRenderer } = window;

export const useProjectExport = (
  pixiAppRef: React.MutableRefObject<PIXI.Application | null>,
  videoElementsRef: React.MutableRefObject<Map<string, HTMLVideoElement>>,
  renderScene: (time: number, objects: TimelineObject[]) => void,
  getExportCanvas?: () => HTMLCanvasElement | null,
  /** VideoDecoder ハイブリッドパス: フレームを renderScene 前に注入するための ref */
  exportFrameOverridesRef?: React.MutableRefObject<Map<string, ImageBitmap>>,
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
      const app = pixiAppRef.current;
      if (!app) return;

      // フレームプロバイダ（VideoDecoder or 再生方式）のクリーンアップ用リスト
      const providers = new Map<string, FrameProvider>();

      try {
        const { projectSettings, objects, layers } = useStore.getState();
        const fps = projectSettings.fps;
        const dt = 1 / fps;
        const width = projectSettings.width;
        const height = projectSettings.height;
        const sampleRate = projectSettings.sampleRate || 44100;
        const exportObjects = objects.filter((obj) => layers[obj.layer]?.visible !== false);
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

        // ── フレームプロバイダを初期化 ───────────────────────────────────────
        // シーク方式(~9fps)は使わず、①VideoDecoder ②再生方式(rVFC) の順で高速取得を試み、
        // どちらも不可のときだけ従来のシーク方式へフォールバックする。
        for (const obj of videoObjects) {
          if (obj.reversed) continue; // 逆再生はシーク方式フォールバック

          // プロキシ(H.264)があれば最優先、無ければソースを直接扱う。
          const v = obj as VideoObject;
          const proxyPath = v.proxyFilePath;
          const sourceUrl = proxyPath
            ? `file://${proxyPath}`
            : v.filePath
              ? `file://${v.filePath}`
              : v.src;
          if (!sourceUrl) continue; // URL 不明 → シーク方式フォールバック

          const startSec = obj.offset || 0;
          const endSec = startSec + obj.duration + 1; // +1s のマージン
          const withTimeout = (p: Promise<void>, ms: number, msg: string) => Promise.race([
            p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
          ]);

          // ① VideoDecoder 経路（H.264 等で最速・~700fps）。
          //    HEVC・moov 末尾配置・不正コンテナでは hang し得るためタイムアウト付き。
          const vdProvider = new VideoFrameProvider(sourceUrl, startSec, endSec);
          let attached = false;
          try {
            await withTimeout(vdProvider.init(), 5000, 'VideoDecoder 初期化タイムアウト(5s)');
            providers.set(obj.id, vdProvider);
            attached = true;
            console.log(`[Export] VideoDecoder パス: ${obj.id} (${proxyPath ? 'proxy' : 'source'})`);
          } catch (e) {
            console.warn(`[Export] VideoDecoder 不可 → 再生方式を試行: ${obj.id}`, e);
            vdProvider.close();
          }

          // ② 再生方式（rVFC）。OS デコーダ依存なので HEVC 等も可。約 2倍速。
          if (!attached) {
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
          // ③ どちらも失敗時は providers に入れず、従来のシーク方式が担当する。
        }

        const usingVideoDecoder = providers.size > 0;
        if (usingVideoDecoder) {
          console.log(`[Export] VideoDecoder ハイブリッドパス: ${providers.size} クリップ`);
        }

        async function* renderFrames() {
          for (let i = 0; i < totalFrames; i++) {
            if (isCancelled()) break;

            // 進捗を更新（スロットル）。
            if (i % progressStep === 0) {
              setExportProgress({ phase: 'rendering', currentFrame: i, totalFrames });
            }

            const t = i * dt;
            if (i % Math.max(1, Math.floor(fps / 2)) === 0) setTime(t);

            const activeVideos = videoObjects.filter(
              obj => t >= obj.startTime && t < obj.startTime + obj.duration
            );

            // ── VideoDecoder パス: フレームを先取りして override に注入 ─────
            if (exportFrameOverridesRef) {
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
            const seekTargets = activeVideos.filter(obj => !providers.has(obj.id));
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

            renderScene(t, exportObjects);
            const canvas = getExportCanvas?.() ?? app!.canvas;
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
        for (const provider of providers.values()) provider.close();
        providers.clear();
        exportFrameOverridesRef?.current.clear();
        setExporting(false);
      }
    };

    runExport();
    return () => { cancelled = true; };
  }, [isExporting, renderScene, setExporting, setTime, setExportProgress, pixiAppRef, videoElementsRef, getExportCanvas, exportFrameOverridesRef]);
};
