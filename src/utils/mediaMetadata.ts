type ElectronFileWithPath = File & { path?: string };

type RustMediaProbeResult = {
  filePath: string;
  duration: number;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
  ffprobePath: string;
};

type ProbeMediaSuccessResponse = {
  success: true;
  result: RustMediaProbeResult;
};

type ProbeMediaFailureResponse = {
  success: false;
  error?: string;
};

type ProbeMediaResponse = ProbeMediaSuccessResponse | ProbeMediaFailureResponse;

export type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
};

export type AudioMetadata = {
  duration: number;
};

const DEFAULT_DURATION_SECONDS = 10;
const DEFAULT_VIDEO_WIDTH = 1280;
const DEFAULT_VIDEO_HEIGHT = 720;

const isPositiveNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
);

const hasIpcRenderer = (): boolean => {
  const maybeWindow = window as Partial<Window>;
  return Boolean(maybeWindow.ipcRenderer && typeof maybeWindow.ipcRenderer.invoke === 'function');
};

export const getElectronFilePath = (file: File): string | null => {
  const filePath = (file as ElectronFileWithPath).path;
  if (typeof filePath !== 'string') {
    return null;
  }

  const trimmed = filePath.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const toFileProtocolUrl = (filePath: string): string => {
  const trimmed = filePath.trim();
  if (!trimmed) return '';

  const normalised = trimmed.replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(normalised)) {
    return encodeURI(`file:///${normalised}`);
  }
  if (normalised.startsWith('/')) {
    return encodeURI(`file://${normalised}`);
  }
  return encodeURI(`file://${normalised}`);
};

export const probeMediaWithRust = async (file: File): Promise<RustMediaProbeResult | null> => {
  const filePath = getElectronFilePath(file);
  if (!filePath || !hasIpcRenderer()) {
    return null;
  }

  try {
    const response = await window.ipcRenderer.invoke('probe-media', { filePath }) as ProbeMediaResponse;
    if (!response || response.success !== true || !response.result) {
      return null;
    }
    return response.result;
  } catch {
    return null;
  }
};

export const mergeResolvedVideoMetadata = (
  probed: RustMediaProbeResult | null
): VideoMetadata => {
  if (!probed || !probed.hasVideo) {
    throw new Error('Failed to load video metadata.');
  }

  return {
    duration: isPositiveNumber(probed.duration)
      ? probed.duration
      : DEFAULT_DURATION_SECONDS,
    width: isPositiveNumber(probed.width)
      ? probed.width
      : DEFAULT_VIDEO_WIDTH,
    height: isPositiveNumber(probed.height)
      ? probed.height
      : DEFAULT_VIDEO_HEIGHT,
  };
};

const loadAudioElementMetadata = (url: string): Promise<AudioMetadata> => {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      resolve({
        duration: isPositiveNumber(audio.duration) ? audio.duration : DEFAULT_DURATION_SECONDS,
      });
    };
    audio.onerror = () => reject(new Error('Failed to load audio metadata.'));
    audio.src = url;
  });
};

export const resolveVideoMetadata = async (file: File, _url: string): Promise<VideoMetadata> => {
  const probed = await probeMediaWithRust(file);
  return mergeResolvedVideoMetadata(probed);
};

export const resolveAudioMetadata = async (file: File, url: string): Promise<AudioMetadata> => {
  const probed = await probeMediaWithRust(file);
  if (probed && (probed.hasAudio || isPositiveNumber(probed.duration))) {
    return {
      duration: isPositiveNumber(probed.duration) ? probed.duration : DEFAULT_DURATION_SECONDS,
    };
  }

  return loadAudioElementMetadata(url);
};
