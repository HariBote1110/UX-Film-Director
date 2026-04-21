import { useEffect } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject, VideoObject } from '../types';
import { shallow } from 'zustand/shallow';
import { buildExportAudioBuffer } from '../utils/audioMixdown';
import { encodeVideoToMp4 } from '../utils/videoExportPipeline';
import { VideoFrameProvider } from '../utils/videoFrameProvider';

const { ipcRenderer } = window;

export const useProjectExport = (
  pixiAppRef: React.MutableRefObject<PIXI.Application | null>,
  videoElementsRef: React.MutableRefObject<Map<string, HTMLVideoElement>>,
  renderScene: (time: number, objects: TimelineObject[]) => void,
  getExportCanvas?: () => HTMLCanvasElement | null,
  /** VideoDecoder ハイブリッドパス: フレームを renderScene 前に注入するための ref */
  exportFrameOverridesRef?: React.MutableRefObject<Map<string, ImageBitmap>>,
) => {
  const { isExporting, setExporting, setTime } = useStore((state) => ({
    isExporting: state.isExporting,
    setExporting: state.setExporting,
    setTime: state.setTime,
  }), shallow);

  useEffect(() => {
    if (!isExporting) return;

    let cancelled = false;

    const runExport = async () => {
      const app = pixiAppRef.current;
      if (!app) return;

      // VideoFrameProvider のクリーンアップ用リスト
      const providers = new Map<string, VideoFrameProvider>();

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

        // ── VideoDecoder プロバイダを初期化 ──────────────────────────────────
        // プロキシがある H.264 素材のみ VideoDecoder 高速パス、それ以外はシーク方式
        for (const obj of videoObjects) {
          if (obj.reversed) continue; // 逆再生はシーク方式フォールバック
          const proxyPath = (obj as VideoObject).proxyFilePath;
          if (!proxyPath) continue; // プロキシなし → シーク方式フォールバック

          const fileUrl = `file://${proxyPath}`;
          const startSec = obj.offset || 0;
          const endSec = startSec + obj.duration + 1; // +1s のマージン
          const provider = new VideoFrameProvider(fileUrl, startSec, endSec);
          try {
            await provider.init();
            providers.set(obj.id, provider);
            console.log(`[Export] VideoDecoder パス: ${obj.id} (proxy: ${proxyPath})`);
          } catch (e) {
            console.warn(`[Export] VideoDecoder 初期化失敗 → シーク方式フォールバック: ${obj.id}`, e);
            provider.close();
          }
        }

        const usingVideoDecoder = providers.size > 0;
        if (usingVideoDecoder) {
          console.log(`[Export] VideoDecoder ハイブリッドパス: ${providers.size} クリップ`);
        }

        async function* renderFrames() {
          for (let i = 0; i < totalFrames; i++) {
            if (cancelled) break;

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

        const result = await encodeVideoToMp4({
          width,
          height,
          fps,
          frames: renderFrames(),
          audioBuffer,
        });

        const saved = await ipcRenderer.invoke('save-buffer-to-file', {
          filePath: savePath,
          buffer: result.buffer,
        });
        if (!saved?.success) throw new Error(saved?.error || 'ファイル保存に失敗しました');

        if (!cancelled) {
          const decoderNote = usingVideoDecoder ? '\n（VideoDecoder 高速パス使用）' : '';
          alert(`エクスポート完了！\nコーデック: ${result.codecUsed}\nサイズ: ${(result.buffer.byteLength / 1024 / 1024).toFixed(1)}MB\n処理時間: ${(result.durationMs / 1000).toFixed(1)}秒${decoderNote}`);
        }

      } catch (error) {
        if (!cancelled) {
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
  }, [isExporting, renderScene, setExporting, setTime, pixiAppRef, videoElementsRef, getExportCanvas, exportFrameOverridesRef]);
};
