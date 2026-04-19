import { useEffect } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import { shallow } from 'zustand/shallow';
import { buildExportAudioBuffer } from '../utils/audioMixdown';
import { encodeVideoToMp4 } from '../utils/videoExportPipeline';

const { ipcRenderer } = window;

export const useProjectExport = (
  pixiAppRef: React.MutableRefObject<PIXI.Application | null>,
  videoElementsRef: React.MutableRefObject<Map<string, HTMLVideoElement>>,
  renderScene: (time: number, objects: TimelineObject[]) => void,
  getExportCanvas?: () => HTMLCanvasElement | null
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

        // フレームイテレータ: PixiJS レンダー → ImageBitmap
        const encWidth = width % 2 === 0 ? width : width - 1;
        const encHeight = height % 2 === 0 ? height : height - 1;

        async function* renderFrames() {
          for (let i = 0; i < totalFrames; i++) {
            if (cancelled) break;

            const t = i * dt;
            if (i % Math.max(1, Math.floor(fps / 2)) === 0) setTime(t);

            // 動画シーク
            const activeVideos = videoObjects.filter(
              obj => t >= obj.startTime && t < obj.startTime + obj.duration
            );
            if (activeVideos.length > 0) {
              await Promise.all(activeVideos.map(obj => {
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
        }

        const result = await encodeVideoToMp4({
          width,
          height,
          fps,
          frames: renderFrames(),
          audioBuffer,
        });

        // ファイル保存（IPC 経由で一括書き込み）
        const saved = await ipcRenderer.invoke('save-buffer-to-file', {
          filePath: savePath,
          buffer: result.buffer,
        });
        if (!saved?.success) throw new Error(saved?.error || 'ファイル保存に失敗しました');

        if (!cancelled) {
          alert(`エクスポート完了！\nコーデック: ${result.codecUsed}\nサイズ: ${(result.buffer.byteLength / 1024 / 1024).toFixed(1)}MB\n処理時間: ${(result.durationMs / 1000).toFixed(1)}秒`);
        }

      } catch (error) {
        if (!cancelled) {
          alert(`エクスポート失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
      } finally {
        setExporting(false);
      }
    };

    runExport();
    return () => { cancelled = true; };
  }, [isExporting, renderScene, setExporting, setTime, pixiAppRef, videoElementsRef, getExportCanvas]);
};
