import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';

export const isSharedRendererNativeMediaReferenceSupported = (
  reference: RustSceneMediaReference
): boolean => {
  if (reference.kind === 'SolidColour') return true;
  if (reference.kind === 'GeneratedGradient') return isSharedRendererNativeGeneratedGradientSourceSupported(reference.source);
  if (reference.kind === 'GeneratedAudioWaveform') return isSharedRendererNativeGeneratedAudioWaveformSourceSupported(reference.source);
  if (reference.kind === 'Image') return isSharedRendererNativeImageSourceSupported(reference.source);
  if (reference.kind === 'Psd') return isSharedRendererNativePsdSourceSupported(reference.source);
  return false;
};

export const canRenderSharedRendererNativeMediaOnlyFrame = ({
  snapshot,
  media,
}: {
  snapshot: RustSceneSnapshot;
  media: readonly RustSceneMediaReference[];
}): boolean => {
  if (snapshot.clips.length === 0) return false;
  const mediaById = new Map(media.map((reference) => [reference.id, reference]));
  return snapshot.clips.every((clip) => {
    const reference = mediaById.get(clip.media_id);
    return reference != null && isSharedRendererNativeMediaReferenceSupported(reference);
  });
};

export const isSharedRendererNativeImageSourceSupported = (source: string): boolean =>
  isLocalNativeMediaSource(source) && /\.(png|jpe?g)$/i.test(nativeMediaSourcePathname(source));

export const isSharedRendererNativePsdSourceSupported = (source: string): boolean =>
  isLocalNativeMediaSource(source) && /\.psd$/i.test(nativeMediaSourcePathname(source));

const isSharedRendererNativeGeneratedGradientSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      type?: unknown;
      colours?: unknown;
      stops?: unknown;
      direction?: unknown;
    };
    return (
      (parsed.type === 'linear' || parsed.type === 'radial')
      && Array.isArray(parsed.colours)
      && parsed.colours.length > 0
      && parsed.colours.every((colour) => typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour))
      && (parsed.stops === undefined || (
        Array.isArray(parsed.stops)
        && parsed.stops.every((stop) => typeof stop === 'number' && Number.isFinite(stop))
      ))
      && (parsed.direction === undefined || (typeof parsed.direction === 'number' && Number.isFinite(parsed.direction)))
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedAudioWaveformSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      target_audio_id?: unknown;
      target_source?: unknown;
      sample_window_seconds?: unknown;
      colour?: unknown;
      thickness?: unknown;
      amplitude?: unknown;
    };
    return (
      parsed.generator === 'audio-waveform-r'
      && typeof parsed.target_audio_id === 'string'
      && parsed.target_audio_id.length > 0
      && typeof parsed.target_source === 'string'
      && parsed.target_source.length > 0
      && typeof parsed.sample_window_seconds === 'number'
      && Number.isFinite(parsed.sample_window_seconds)
      && parsed.sample_window_seconds > 0
      && typeof parsed.colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.colour)
      && typeof parsed.thickness === 'number'
      && Number.isFinite(parsed.thickness)
      && parsed.thickness > 0
      && typeof parsed.amplitude === 'number'
      && Number.isFinite(parsed.amplitude)
      && parsed.amplitude >= 0
    );
  } catch {
    return false;
  }
};

const isLocalNativeMediaSource = (source: string): boolean => {
  if (isWindowsLocalPath(source)) return true;

  const schemeMatch = source.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!schemeMatch) return true;
  if (schemeMatch[1].toLowerCase() !== 'file') return false;

  try {
    const url = new URL(source);
    return url.hostname === '' || url.hostname === 'localhost';
  } catch {
    return false;
  }
};

const nativeMediaSourcePathname = (source: string): string => {
  if (/^file:/i.test(source)) {
    try {
      return new URL(source).pathname;
    } catch {
      return source;
    }
  }

  const queryIndex = source.search(/[?#]/);
  return queryIndex >= 0 ? source.slice(0, queryIndex) : source;
};

const isWindowsLocalPath = (source: string): boolean => /^[a-z]:[\\/]/i.test(source);
