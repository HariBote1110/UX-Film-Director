import { TimelineObject } from '../types';

// AudioBufferをWAV形式のArrayBufferに変換する関数
const bufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
  const length = buffer.length * buffer.numberOfChannels * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);
  const channels = [];
  let sample = 0;
  let offset = 0;
  let pos = 0;

  // 1. WAV Header
  // "RIFF"
  writeString(view, 0, 'RIFF');
  // file length - 8
  view.setUint32(4, 36 + buffer.length * buffer.numberOfChannels * 2, true);
  // "WAVE"
  writeString(view, 8, 'WAVE');
  // "fmt " chunk
  writeString(view, 12, 'fmt ');
  // length = 16
  view.setUint32(16, 16, true);
  // PCM (uncompressed)
  view.setUint16(20, 1, true);
  // Number of channels
  view.setUint16(22, buffer.numberOfChannels, true);
  // Sample rate
  view.setUint32(24, buffer.sampleRate, true);
  // Byte rate (sampleRate * blockAlign)
  view.setUint32(28, buffer.sampleRate * 4, true);
  // Block align (channels * bytes/sample)
  view.setUint16(32, buffer.numberOfChannels * 2, true);
  // Bits per sample
  view.setUint16(34, 16, true);
  // "data" chunk
  writeString(view, 36, 'data');
  // data length
  view.setUint32(40, buffer.length * buffer.numberOfChannels * 2, true);

  // 2. Write Interleaved Data
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  offset = 44;
  while (pos < buffer.length) {
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // Clip
      // Convert float to 16-bit PCM
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
    pos++;
  }

  return out;
};

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

// メイン関数: タイムラインをレンダリングする
export const renderTimelineAudio = async (
  objects: TimelineObject[],
  duration: number,
  sampleRate: number = 44100
): Promise<ArrayBuffer> => {
  // 1. OfflineAudioContextを作成
  // durationが短すぎるとエラーになるので最低1秒確保
  const ctx = new OfflineAudioContext(2, Math.max(1, duration) * sampleRate, sampleRate);

  // 2. 音声を持つオブジェクト（Video）をフィルタリング
  const audioObjects = objects.filter(obj => obj.type === 'video');

  // 3. 各オブジェクトの音声を配置
  // 並列でデコードして配置
  await Promise.all(audioObjects.map(async (obj) => {
    if (obj.type !== 'video' || obj.muted) return;

    try {
      // Blob URLからデータを取得
      const response = await fetch(obj.src);
      const arrayBuffer = await response.arrayBuffer();
      
      // デコード (mp4などのコンテナから音声を抽出)
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      // SourceNode作成
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // GainNode (音量)
      const gainNode = ctx.createGain();
      gainNode.gain.value = obj.volume;

      // 接続
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      // タイミング設定
      // start(いつ再生するか, 素材のどこから再生するか, どれくらいの長さ再生するか)
      const offset = obj.offset || 0;
      
      // 注意: durationが素材の残りを上回る場合のエラーハンドリングが必要だが、
      // WebAudioは自動で止まるので基本OK
      source.start(obj.startTime, offset, obj.duration);

    } catch (e) {
      console.warn(`Failed to process audio for object ${obj.name}:`, e);
    }
  }));

  // 4. レンダリング実行
  const renderedBuffer = await ctx.startRendering();

  // 5. WAV形式に変換して返す
  return bufferToWav(renderedBuffer);
};