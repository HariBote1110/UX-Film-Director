import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';

export const isSharedRendererNativeMediaReferenceSupported = (
  reference: RustSceneMediaReference
): boolean => {
  if (reference.kind === 'SolidColour') return true;
  if (reference.kind === 'GeneratedGradient') return isSharedRendererNativeGeneratedGradientSourceSupported(reference.source);
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
