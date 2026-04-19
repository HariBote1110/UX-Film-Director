import { TimelineObject } from '../types';

type MediaWithAudio = Extract<TimelineObject, { type: 'audio' | 'video' }>;

type ReadFileBytesResponse =
  | { success: true; data: unknown }
  | { success: false; error?: string };

const normaliseBinaryData = (value: unknown): ArrayBuffer | null => {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    const copied = new Uint8Array(view.byteLength);
    copied.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return copied.buffer;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    return new Uint8Array(value).buffer;
  }

  return null;
};

const readMediaBytes = async (media: MediaWithAudio): Promise<ArrayBuffer | null> => {
  const filePath = media.filePath?.trim();
  if (filePath) {
    try {
      const response = await window.ipcRenderer.invoke('read-file-bytes', { filePath }) as ReadFileBytesResponse;
      if (!response || response.success !== true) return null;
      return normaliseBinaryData(response.data);
    } catch {
      return null;
    }
  }

  if (!media.src) return null;

  try {
    const response = await fetch(media.src);
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
};

const encodeWavBuffer = (audioBuffer: AudioBuffer): ArrayBuffer => {
  const channels = Math.max(1, Math.min(2, audioBuffer.numberOfChannels));
  const sampleRate = audioBuffer.sampleRate;
  const sampleCount = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = sampleCount * blockAlign;
  const totalSize = 44 + dataSize;

  const output = new ArrayBuffer(totalSize);
  const view = new DataView(output);

  const writeAscii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: channels }, (_, index) => audioBuffer.getChannelData(index));
  let offset = 44;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const value = Math.max(-1, Math.min(1, channelData[channel][sample] || 0));
      const intValue = value < 0 ? value * 0x8000 : value * 0x7fff;
      view.setInt16(offset, intValue, true);
      offset += bytesPerSample;
    }
  }

  return output;
};

const createAudioContext = (sampleRate: number): AudioContext => {
  return new AudioContext({ sampleRate });
};

const createOfflineAudioContext = (channels: number, length: number, sampleRate: number): OfflineAudioContext => {
  const safeLength = Math.max(1, length);
  return new OfflineAudioContext(channels, safeLength, sampleRate);
};

export const buildExportAudioMixWav = async (
  objects: TimelineObject[],
  exportDuration: number,
  sampleRate: number
): Promise<ArrayBuffer | null> => {
  const candidates = objects.filter((obj): obj is MediaWithAudio => {
    if (obj.type !== 'audio' && obj.type !== 'video') return false;
    if (obj.muted) return false;
    if ((obj.volume ?? 1) <= 0) return false;
    return typeof obj.src === 'string' && obj.src.trim() !== '';
  });
  if (candidates.length === 0) return null;

  let decodeContext: AudioContext | null = null;
  try {
    decodeContext = createAudioContext(sampleRate);
  } catch {
    return null;
  }

  const decodedItems: Array<{ media: MediaWithAudio; buffer: AudioBuffer }> = [];
  try {
    for (const media of candidates) {
      const bytes = await readMediaBytes(media);
      if (!bytes || bytes.byteLength === 0) continue;

      try {
        const decoded = await decodeContext.decodeAudioData(bytes.slice(0));
        if (decoded.length === 0) continue;
        decodedItems.push({ media, buffer: decoded });
      } catch {
        // decode 失敗は無視し、他トラックの統合は継続する
      }
    }
  } finally {
    try {
      await decodeContext.close();
    } catch {
      // no-op
    }
  }

  if (decodedItems.length === 0) return null;

  const totalDuration = Math.max(
    exportDuration,
    ...decodedItems.map(({ media, buffer }) => {
      const offset = Math.max(0, media.offset || 0);
      const available = Math.max(0, buffer.duration - offset);
      const playback = Math.max(0, Math.min(media.duration, available));
      return media.startTime + playback;
    })
  );
  const length = Math.ceil(totalDuration * sampleRate);
  const offline = createOfflineAudioContext(2, length, sampleRate);

  decodedItems.forEach(({ media, buffer }) => {
    const offset = Math.max(0, media.offset || 0);
    const available = Math.max(0, buffer.duration - offset);
    const clipDuration = Math.max(0, Math.min(media.duration, available, totalDuration - media.startTime));
    if (clipDuration <= 0) return;

    const source = offline.createBufferSource();
    source.buffer = buffer;
    const gain = offline.createGain();
    gain.gain.value = Math.max(0, Math.min(4, media.volume ?? 1));
    source.connect(gain);
    gain.connect(offline.destination);
    source.start(Math.max(0, media.startTime), offset, clipDuration);
  });

  const rendered = await offline.startRendering();
  return encodeWavBuffer(rendered);
};
