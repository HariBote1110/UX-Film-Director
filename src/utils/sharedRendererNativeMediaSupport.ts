import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';

export const isSharedRendererNativeMediaReferenceSupported = (
  reference: RustSceneMediaReference
): boolean => {
  if (reference.kind === 'SolidColour') return true;
  if (reference.kind === 'GeneratedGradient') return isSharedRendererNativeGeneratedGradientSourceSupported(reference.source);
  if (reference.kind === 'GeneratedAudioWaveform') return isSharedRendererNativeGeneratedAudioWaveformSourceSupported(reference.source);
  if (reference.kind === 'GeneratedParticle') return isSharedRendererNativeGeneratedParticleSourceSupported(reference.source);
  if (reference.kind === 'GeneratedBarcode') return isSharedRendererNativeGeneratedBarcodeSourceSupported(reference.source);
  if (reference.kind === 'GeneratedPuzzlePiece') return isSharedRendererNativeGeneratedPuzzlePieceSourceSupported(reference.source);
  if (reference.kind === 'GeneratedColourWheel') return isSharedRendererNativeGeneratedColourWheelSourceSupported(reference.source);
  if (reference.kind === 'GeneratedGourd') return isSharedRendererNativeGeneratedGourdSourceSupported(reference.source);
  if (reference.kind === 'GeneratedGear') return isSharedRendererNativeGeneratedGearSourceSupported(reference.source);
  if (reference.kind === 'GeneratedTrackBar') return isSharedRendererNativeGeneratedTrackBarSourceSupported(reference.source);
  if (reference.kind === 'GeneratedPieChart') return isSharedRendererNativeGeneratedPieChartSourceSupported(reference.source);
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

const isSharedRendererNativeGeneratedParticleSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      seed?: unknown;
      particle_count?: unknown;
      spread?: unknown;
      speed?: unknown;
      size?: unknown;
      colour?: unknown;
      lifetime_seconds?: unknown;
    };
    return (
      parsed.generator === 'standard-particle'
      && Number.isInteger(parsed.seed)
      && typeof parsed.particle_count === 'number'
      && Number.isInteger(parsed.particle_count)
      && parsed.particle_count > 0
      && parsed.particle_count <= 10000
      && typeof parsed.spread === 'number'
      && Number.isFinite(parsed.spread)
      && parsed.spread >= 0
      && typeof parsed.speed === 'number'
      && Number.isFinite(parsed.speed)
      && parsed.speed >= 0
      && typeof parsed.size === 'number'
      && Number.isFinite(parsed.size)
      && parsed.size > 0
      && typeof parsed.colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.colour)
      && typeof parsed.lifetime_seconds === 'number'
      && Number.isFinite(parsed.lifetime_seconds)
      && parsed.lifetime_seconds > 0
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedBarcodeSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      data?: unknown;
      minimum_bar_width?: unknown;
      horizontal_margin?: unknown;
      vertical_margin?: unknown;
      foreground_colour?: unknown;
      background_colour?: unknown;
    };
    return (
      parsed.generator === 'barcode-t'
      && typeof parsed.data === 'string'
      && parsed.data.length > 0
      && parsed.data.length <= 128
      && typeof parsed.minimum_bar_width === 'number'
      && Number.isInteger(parsed.minimum_bar_width)
      && parsed.minimum_bar_width > 0
      && parsed.minimum_bar_width <= 32
      && typeof parsed.horizontal_margin === 'number'
      && Number.isInteger(parsed.horizontal_margin)
      && parsed.horizontal_margin >= 0
      && parsed.horizontal_margin <= 1000
      && typeof parsed.vertical_margin === 'number'
      && Number.isInteger(parsed.vertical_margin)
      && parsed.vertical_margin >= 0
      && parsed.vertical_margin <= 1000
      && typeof parsed.foreground_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.foreground_colour)
      && typeof parsed.background_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.background_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedPuzzlePieceSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      size?: unknown;
      shape_variant?: unknown;
      connector_mode?: unknown;
      fill_colour?: unknown;
    };
    return (
      parsed.generator === 'puzzle-piece'
      && typeof parsed.size === 'number'
      && Number.isInteger(parsed.size)
      && parsed.size > 0
      && parsed.size <= 2000
      && typeof parsed.shape_variant === 'number'
      && Number.isInteger(parsed.shape_variant)
      && parsed.shape_variant >= 1
      && parsed.shape_variant <= 22
      && (parsed.connector_mode === 'convex' || parsed.connector_mode === 'concave')
      && typeof parsed.fill_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.fill_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedColourWheelSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      radius?: unknown;
      saturation?: unknown;
      brightness?: unknown;
      ring_width_percent?: unknown;
      segment_count?: unknown;
    };
    return (
      parsed.generator === 'colour-wheel'
      && typeof parsed.radius === 'number'
      && Number.isInteger(parsed.radius)
      && parsed.radius > 0
      && parsed.radius <= 2000
      && typeof parsed.saturation === 'number'
      && Number.isFinite(parsed.saturation)
      && parsed.saturation >= 0
      && parsed.saturation <= 100
      && typeof parsed.brightness === 'number'
      && Number.isFinite(parsed.brightness)
      && parsed.brightness >= 0
      && parsed.brightness <= 100
      && typeof parsed.ring_width_percent === 'number'
      && Number.isFinite(parsed.ring_width_percent)
      && parsed.ring_width_percent > 0
      && parsed.ring_width_percent <= 100
      && typeof parsed.segment_count === 'number'
      && Number.isInteger(parsed.segment_count)
      && parsed.segment_count >= 3
      && parsed.segment_count <= 360
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedGourdSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      body_radius?: unknown;
      body_width?: unknown;
      waist_radius?: unknown;
      squash_percent?: unknown;
      repeat_count?: unknown;
      fill_colour?: unknown;
    };
    return (
      parsed.generator === 'gourd-tm'
      && typeof parsed.body_radius === 'number'
      && Number.isInteger(parsed.body_radius)
      && parsed.body_radius > 0
      && parsed.body_radius <= 2000
      && typeof parsed.body_width === 'number'
      && Number.isInteger(parsed.body_width)
      && parsed.body_width > 0
      && parsed.body_width <= 4000
      && typeof parsed.waist_radius === 'number'
      && Number.isInteger(parsed.waist_radius)
      && parsed.waist_radius >= 0
      && parsed.waist_radius <= 2000
      && typeof parsed.squash_percent === 'number'
      && Number.isFinite(parsed.squash_percent)
      && parsed.squash_percent >= 0
      && parsed.squash_percent <= 100
      && typeof parsed.repeat_count === 'number'
      && Number.isInteger(parsed.repeat_count)
      && parsed.repeat_count >= 1
      && parsed.repeat_count <= 36
      && typeof parsed.fill_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.fill_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedGearSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      outer_radius?: unknown;
      inner_radius_percent?: unknown;
      tooth_count?: unknown;
      tooth_depth_percent?: unknown;
      tooth_skew_percent?: unknown;
      fill_colour?: unknown;
    };
    return (
      parsed.generator === 'gear-t'
      && typeof parsed.outer_radius === 'number'
      && Number.isInteger(parsed.outer_radius)
      && parsed.outer_radius > 0
      && parsed.outer_radius <= 2000
      && typeof parsed.inner_radius_percent === 'number'
      && Number.isFinite(parsed.inner_radius_percent)
      && parsed.inner_radius_percent >= 0
      && parsed.inner_radius_percent < 100
      && typeof parsed.tooth_count === 'number'
      && Number.isInteger(parsed.tooth_count)
      && parsed.tooth_count >= 3
      && parsed.tooth_count <= 240
      && typeof parsed.tooth_depth_percent === 'number'
      && Number.isFinite(parsed.tooth_depth_percent)
      && parsed.tooth_depth_percent > 0
      && parsed.tooth_depth_percent <= 95
      && typeof parsed.tooth_skew_percent === 'number'
      && Number.isFinite(parsed.tooth_skew_percent)
      && parsed.tooth_skew_percent >= -100
      && parsed.tooth_skew_percent <= 100
      && typeof parsed.fill_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.fill_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedTrackBarSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      track_values?: unknown;
      track_ranges?: unknown;
      labels?: unknown;
      bar_colour?: unknown;
      background_opacity?: unknown;
    };
    return (
      parsed.generator === 'custom-track-bar'
      && isFiniteNumberArrayOfLength(parsed.track_values, 4)
      && isTrackBarRangeArray(parsed.track_ranges)
      && Array.isArray(parsed.labels)
      && parsed.labels.length === 4
      && parsed.labels.every((label) => typeof label === 'string' && label.length <= 64)
      && typeof parsed.bar_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.bar_colour)
      && typeof parsed.background_opacity === 'number'
      && Number.isFinite(parsed.background_opacity)
      && parsed.background_opacity >= 0
      && parsed.background_opacity <= 1
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedPieChartSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      values?: unknown;
      sort_mode?: unknown;
      normalise_to_hundred?: unknown;
      label_mode?: unknown;
      progress_percent?: unknown;
      stroke_width?: unknown;
      slice_colours?: unknown;
    };
    return (
      parsed.generator === 'pie-sheet-graph'
      && Array.isArray(parsed.values)
      && parsed.values.length > 0
      && parsed.values.length <= 64
      && parsed.values.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)
      && (parsed.sort_mode === 'none' || parsed.sort_mode === 'descending' || parsed.sort_mode === 'ascending')
      && typeof parsed.normalise_to_hundred === 'boolean'
      && (parsed.label_mode === 'none' || parsed.label_mode === 'percentage' || parsed.label_mode === 'input')
      && typeof parsed.progress_percent === 'number'
      && Number.isFinite(parsed.progress_percent)
      && parsed.progress_percent >= 0
      && parsed.progress_percent <= 100
      && typeof parsed.stroke_width === 'number'
      && Number.isFinite(parsed.stroke_width)
      && parsed.stroke_width > 0
      && Array.isArray(parsed.slice_colours)
      && parsed.slice_colours.length > 0
      && parsed.slice_colours.length <= 64
      && parsed.slice_colours.every((colour) => typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour))
    );
  } catch {
    return false;
  }
};

const isFiniteNumberArrayOfLength = (value: unknown, length: number): value is number[] =>
  Array.isArray(value)
  && value.length === length
  && value.every((item) => typeof item === 'number' && Number.isFinite(item));

const isTrackBarRangeArray = (value: unknown): value is [number, number][] =>
  Array.isArray(value)
  && value.length === 4
  && value.every((range) => (
    Array.isArray(range)
    && range.length === 2
    && typeof range[0] === 'number'
    && typeof range[1] === 'number'
    && Number.isFinite(range[0])
    && Number.isFinite(range[1])
    && range[0] !== range[1]
  ));

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
