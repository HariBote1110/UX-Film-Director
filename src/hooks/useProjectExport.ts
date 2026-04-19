import { useEffect } from 'react';
import * as PIXI from 'pixi.js';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import { shallow } from 'zustand/shallow';
import { buildExportAudioBuffer } from '../utils/audioMixdown';

const { ipcRenderer } = window;

// PCM AudioBuffer を AudioEncoder で AAC にエンコードし muxer に渡す
const encodeAudioToMuxer = async (
  audioBuffer: AudioBuffer,
  muxer: Muxer<ArrayBufferTarget>
): Promise<void> => {
  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;
  const totalSamples = audioBuffer.length;
  const frameSize = 1024; // AAC-LC のフレームサイズ

  const config: AudioEncoderConfig = {
    codec: 'mp4a.40.2',
    sampleRate,
    numberOfChannels,
    bitrate: 128_000,
  };
  const support = await AudioEncoder.isConfigSupported(config);
  if (!support.supported) throw new Error('AudioEncoder AAC not supported');

  await new Promise<void>((resolve, reject) => {
    const encoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: reject,
    });
    encoder.configure(config);

    // PCM データを 1024 サンプルのチャンクに分割して投入（f32-planar 形式）
    let offset = 0;
    while (offset < totalSamples) {
      const count = Math.min(frameSize, totalSamples - offset);
      // f32-planar: チャンネルデータを連結して 1 つの ArrayBuffer に
      const planar = new Float32Array(count * numberOfChannels);
      for (let ch = 0; ch < numberOfChannels; ch++) {
        planar.set(audioBuffer.getChannelData(ch).subarray(offset, offset + count), ch * count);
      }
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: count,
        numberOfChannels,
        timestamp: Math.round(offset * 1_000_000 / sampleRate),
        data: planar,
      });
      encoder.encode(audioData);
      audioData.close();
      offset += count;
    }

    encoder.flush().then(() => { encoder.close(); resolve(); }).catch(reject);
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

        // VideoEncoder のコーデックサポート確認
        // Apple Silicon / 各環境で使えるコーデックを順番に試す
        const codecCandidates = [
          'avc1.640028', // H.264 High Level 4.0（Apple Silicon で推奨）
          'avc1.4d0028', // H.264 Main Level 4.0
          'avc1.42E01E', // H.264 Baseline Level 3.0
          'avc1.42001f', // H.264 Baseline Level 3.1
          'avc1.420034', // H.264 Baseline Level 5.2
        ];
        // H.264 は幅・高さが偶数でなければならない
        const encWidth = width % 2 === 0 ? width : width - 1;
        const encHeight = height % 2 === 0 ? height : height - 1;
        const baseConfig = {
          width: encWidth,
          height: encHeight,
          bitrate: 10_000_000,
          framerate: fps,
          hardwareAcceleration: 'prefer-hardware' as HardwareAcceleration,
        };
        let videoConfig: VideoEncoderConfig | null = null;
        for (const codec of codecCandidates) {
          const cfg: VideoEncoderConfig = { ...baseConfig, codec };
          const result = await VideoEncoder.isConfigSupported(cfg);
          console.log(`[Export] VideoEncoder codec ${codec} supported =`, result.supported);
          if (result.supported) { videoConfig = cfg; break; }
        }
        if (!videoConfig) {
          throw new Error(
            'VideoEncoder H.264 がサポートされていません。\n' +
            '試したコーデック: ' + codecCandidates.join(', ')
          );
        }
        console.log('[Export] 使用コーデック:', videoConfig.codec);

        // ファイル保存先を先に決定（ユーザー操作が必要なため）
        const savePath = await ipcRenderer.invoke('show-save-dialog', {
          defaultPath: 'output.mp4',
          filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
        });
        if (!savePath) { setExporting(false); return; }

        // mp4-muxer セットアップ
        const target = new ArrayBufferTarget();
        const audioBuffer = await buildExportAudioBuffer(exportObjects, exportDuration, sampleRate);
        const muxer = new Muxer({
          target,
          video: { codec: 'avc', width: encWidth, height: encHeight },
          ...(audioBuffer ? { audio: { codec: 'aac', sampleRate, numberOfChannels: audioBuffer.numberOfChannels } } : {}),
          fastStart: 'in-memory',
        });

        // VideoEncoder セットアップ（エラーは Promise で即時伝播）
        let rejectEncoding!: (e: Error) => void;
        const encodingError = new Promise<never>((_, reject) => { rejectEncoding = reject; });
        const videoEncoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e) => rejectEncoding(e),
        });
        videoEncoder.configure(videoConfig);

        // 動画を一時停止
        Array.from(videoElementsRef.current.values()).forEach(v => v.pause());

        // フレームレンダリングループ
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

          // PixiJS レンダー → VideoFrame 作成
          renderScene(t, exportObjects);
          const canvas = getExportCanvas?.() ?? app.canvas;
          const timestamp = Math.round(i * 1_000_000 / fps);

          // OffscreenCanvas / HTMLCanvasElement 両方に対応するため ImageBitmap を経由
          const bitmap = await createImageBitmap(canvas, 0, 0, encWidth, encHeight);
          const frame = new VideoFrame(bitmap, { timestamp });
          bitmap.close();
          // 2 秒ごとにキーフレーム
          videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
          frame.close();

          // エンコードキューが溜まりすぎないように間引き待機
          if (videoEncoder.encodeQueueSize > 10) {
            await Promise.race([
              new Promise(r => setTimeout(r, 0)),
              encodingError,
            ]);
          }
        }

        // VideoEncoder フラッシュ（エラー競合）
        await Promise.race([videoEncoder.flush(), encodingError]);
        videoEncoder.close();

        // オーディオエンコード
        if (audioBuffer) {
          await encodeAudioToMuxer(audioBuffer, muxer);
        }

        // mp4-muxer 確定
        muxer.finalize();
        const { buffer } = target;

        // ファイル保存（IPC 経由で一括書き込み）
        const saved = await ipcRenderer.invoke('save-buffer-to-file', {
          filePath: savePath,
          buffer,
        });
        if (!saved?.success) throw new Error(saved?.error || 'ファイル保存に失敗しました');

        if (!cancelled) alert('エクスポートが完了しました！');

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
