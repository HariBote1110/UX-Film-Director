import { useEffect } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import { shallow } from 'zustand/shallow';
import { buildExportAudioMixWav } from '../utils/audioMixdown';

const { ipcRenderer } = window;

const canvasToJpegBuffer = (canvas: HTMLCanvasElement | OffscreenCanvas): Promise<ArrayBuffer> => {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })
      .then(blob => blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('toBlob returned null')); return; }
      blob.arrayBuffer().then(resolve).catch(reject);
    }, 'image/jpeg', 0.92);
  });
};

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

      let tempAudioPath: string | null = null;

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

        // 音声を一時 WAV ファイルとして保存
        const wavBuffer = await buildExportAudioMixWav(exportObjects, exportDuration, sampleRate);
        if (wavBuffer && wavBuffer.byteLength > 0) {
          const audioResult = await ipcRenderer.invoke('save-temp-audio', wavBuffer);
          if (audioResult?.success) tempAudioPath = audioResult.path;
        }

        // エクスポート開始（保存ダイアログ + FFmpeg VideoToolbox 起動）
        const startResult = await ipcRenderer.invoke('start-export', {
          width,
          height,
          fps,
          audioPath: tempAudioPath,
        });

        if (!startResult?.success) {
          if (startResult?.reason === 'cancelled') { setExporting(false); return; }
          throw new Error(startResult?.error || 'エクスポート開始に失敗しました');
        }

        const savedPath: string = startResult.filePath;

        // 動画を一時停止
        Array.from(videoElementsRef.current.values()).forEach(v => v.pause());

        const encWidth = width % 2 === 0 ? width : width - 1;
        const encHeight = height % 2 === 0 ? height : height - 1;

        // フレームを 1 枚ずつ JPEG → Rust FFmpeg に送信
        for (let i = 0; i < totalFrames; i++) {
          if (cancelled) break;

          const t = i * dt;
          if (i % Math.max(1, Math.floor(fps / 2)) === 0) setTime(t);

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
          const rawCanvas = getExportCanvas?.() ?? app!.canvas;

          // OffscreenCanvas の場合は encWidth/encHeight でクロップした ImageBitmap 経由
          let jpegBuffer: ArrayBuffer;
          if (rawCanvas instanceof OffscreenCanvas) {
            const bmp = await createImageBitmap(rawCanvas, 0, 0, encWidth, encHeight);
            const oc = new OffscreenCanvas(encWidth, encHeight);
            oc.getContext('2d')!.drawImage(bmp, 0, 0);
            bmp.close();
            jpegBuffer = await oc.convertToBlob({ type: 'image/jpeg', quality: 0.92 }).then(b => b.arrayBuffer());
          } else {
            jpegBuffer = await canvasToJpegBuffer(rawCanvas);
          }

          await ipcRenderer.invoke('write-frame', jpegBuffer);
        }

        await ipcRenderer.invoke('end-export');

        if (!cancelled) {
          const sizeMb = '—'; // FFmpeg が直接ファイルに書き込むためサイズ不明
          alert(`エクスポート完了！\nコーデック: h264_videotoolbox\nファイル: ${savedPath}`);
        }

      } catch (error) {
        if (!cancelled) {
          // エラー時も FFmpeg を終了しておく
          await ipcRenderer.invoke('end-export').catch(() => {});
          alert(`エクスポート失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
      } finally {
        if (tempAudioPath) {
          await ipcRenderer.invoke('delete-temp-file', { filePath: tempAudioPath }).catch(() => {});
        }
        setExporting(false);
      }
    };

    runExport();
    return () => { cancelled = true; };
  }, [isExporting, renderScene, setExporting, setTime, pixiAppRef, videoElementsRef, getExportCanvas]);
};
