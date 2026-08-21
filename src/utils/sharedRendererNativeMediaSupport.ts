import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';

export const isSharedRendererNativeMediaSourceSupported = (
  kind: string,
  source: string
): boolean => {
  if (kind === 'SolidColour') return true;
  if (kind === 'GeneratedGradient') return isSharedRendererNativeGeneratedGradientSourceSupported(source);
  if (kind === 'GeneratedAudioWaveform') return isSharedRendererNativeGeneratedAudioWaveformSourceSupported(source);
  if (kind === 'GeneratedAudioSphere') return isSharedRendererNativeGeneratedAudioSphereSourceSupported(source);
  if (kind === 'GeneratedParticle') return isSharedRendererNativeGeneratedParticleSourceSupported(source);
  if (kind === 'GeneratedBarcode') return isSharedRendererNativeGeneratedBarcodeSourceSupported(source);
  if (kind === 'GeneratedPuzzlePiece') return isSharedRendererNativeGeneratedPuzzlePieceSourceSupported(source);
  if (kind === 'GeneratedColourWheel') return isSharedRendererNativeGeneratedColourWheelSourceSupported(source);
  if (kind === 'GeneratedGourd') return isSharedRendererNativeGeneratedGourdSourceSupported(source);
  if (kind === 'GeneratedGear') return isSharedRendererNativeGeneratedGearSourceSupported(source);
  if (kind === 'GeneratedTrackBar') return isSharedRendererNativeGeneratedTrackBarSourceSupported(source);
  if (kind === 'GeneratedPieChart') return isSharedRendererNativeGeneratedPieChartSourceSupported(source);
  if (kind === 'GeneratedHistogram') return isSharedRendererNativeGeneratedHistogramSourceSupported(source);
  if (kind === 'GeneratedToneCurve') return isSharedRendererNativeGeneratedToneCurveSourceSupported(source);
  if (kind === 'GeneratedGetColorDots') return isSharedRendererNativeGeneratedGetColorDotsSourceSupported(source);
  if (kind === 'GeneratedHksyCheckerGrid') return isSharedRendererNativeGeneratedHksyCheckerGridSourceSupported(source);
  if (kind === 'GeneratedRegionFrame') return isSharedRendererNativeGeneratedRegionFrameSourceSupported(source);
  if (kind === 'GeneratedSimpleTube') return isSharedRendererNativeGeneratedSimpleTubeSourceSupported(source);
  if (kind === 'GeneratedSphereDots') return isSharedRendererNativeGeneratedSphereDotsSourceSupported(source);
  if (kind === 'GeneratedSphericalField') return isSharedRendererNativeGeneratedSphericalFieldSourceSupported(source);
  if (kind === 'GeneratedSunburst') return isSharedRendererNativeGeneratedSunburstSourceSupported(source);
  if (kind === 'GeneratedCircularArrow') return isSharedRendererNativeGeneratedCircularArrowSourceSupported(source);
  if (kind === 'GeneratedTriangleBracket') return isSharedRendererNativeGeneratedTriangleBracketSourceSupported(source);
  if (kind === 'GeneratedTartanCheck') return isSharedRendererNativeGeneratedTartanCheckSourceSupported(source);
  if (kind === 'GeneratedHoundstooth') return isSharedRendererNativeGeneratedHoundstoothSourceSupported(source);
  if (kind === 'GeneratedYagasuri') return isSharedRendererNativeGeneratedYagasuriSourceSupported(source);
  if (kind === 'GeneratedPaperAirplane') return isSharedRendererNativeGeneratedPaperAirplaneSourceSupported(source);
  if (kind === 'GeneratedAsanohaPattern') return isSharedRendererNativeGeneratedAsanohaPatternSourceSupported(source);
  if (kind === 'GeneratedFocusLinesPlus') return isSharedRendererNativeGeneratedFocusLinesPlusSourceSupported(source);
  if (kind === 'GeneratedRandomLineEx') return isSharedRendererNativeGeneratedRandomLineExSourceSupported(source);
  if (kind === 'GeneratedContourTrace') return isSharedRendererNativeGeneratedContourTraceSourceSupported(source);
  if (kind === 'GeneratedDisplacementPoly') return isSharedRendererNativeGeneratedDisplacementPolySourceSupported(source);
  if (kind === 'GeneratedPlainEffectorLine') return isSharedRendererNativeGeneratedPlainEffectorLineSourceSupported(source);
  if (kind === 'GeneratedHologram') return isSharedRendererNativeGeneratedHologramSourceSupported(source);
  if (kind === 'GeneratedProtractor') return isSharedRendererNativeGeneratedProtractorSourceSupported(source);
  if (kind === 'GeneratedShakingPolygon') return isSharedRendererNativeGeneratedShakingPolygonSourceSupported(source);
  if (kind === 'GeneratedShatteredSphere') return isSharedRendererNativeGeneratedShatteredSphereSourceSupported(source);
  if (kind === 'GeneratedShape') return isSharedRendererNativeGeneratedShapeSourceSupported(source);
  if (kind === 'Image') return isSharedRendererNativeImageSourceSupported(source);
  if (kind === 'Psd') return isSharedRendererNativePsdSourceSupported(source);
  if (kind === 'Text') return isSharedRendererNativeTextSourceSupported(source);
  return false;
};

export const isSharedRendererNativeMediaReferenceSupported = (
  reference: RustSceneMediaReference
): boolean => isSharedRendererNativeMediaSourceSupported(reference.kind, reference.source);

const isSharedRendererNativeTextStrokeSupported = (stroke: unknown): boolean => {
  if (stroke === null || stroke === undefined) return true;
  if (typeof stroke !== 'object') return false;
  const parsed = stroke as { colour?: unknown; width?: unknown };
  return (
    typeof parsed.colour === 'string'
    && /^#[0-9a-f]{6}$/i.test(parsed.colour)
    && typeof parsed.width === 'number'
    && Number.isFinite(parsed.width)
    && parsed.width >= 0
  );
};

const isSharedRendererNativeTextShadowSupported = (shadow: unknown): boolean => {
  if (shadow === null || shadow === undefined) return true;
  if (typeof shadow !== 'object') return false;
  const parsed = shadow as { colour?: unknown; offsetX?: unknown; offsetY?: unknown; blur?: unknown };
  return (
    typeof parsed.colour === 'string'
    && /^#[0-9a-f]{6}$/i.test(parsed.colour)
    && typeof parsed.offsetX === 'number'
    && Number.isFinite(parsed.offsetX)
    && typeof parsed.offsetY === 'number'
    && Number.isFinite(parsed.offsetY)
    && typeof parsed.blur === 'number'
    && Number.isFinite(parsed.blur)
    && parsed.blur >= 0
  );
};

const isSharedRendererNativeTextSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      text?: unknown;
      fontFamily?: unknown;
      fontSize?: unknown;
      fill?: unknown;
      textAlignment?: unknown;
      letterSpacing?: unknown;
      textStroke?: unknown;
      textShadow?: unknown;
    };
    return (
      typeof parsed.text === 'string'
      && typeof parsed.fontFamily === 'string'
      && typeof parsed.fontSize === 'number'
      && Number.isFinite(parsed.fontSize)
      && parsed.fontSize > 0
      && typeof parsed.fill === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.fill)
      && (parsed.textAlignment === undefined || parsed.textAlignment === null
        || parsed.textAlignment === 'left' || parsed.textAlignment === 'centre' || parsed.textAlignment === 'right')
      && (parsed.letterSpacing === undefined || parsed.letterSpacing === null
        || (typeof parsed.letterSpacing === 'number' && Number.isFinite(parsed.letterSpacing)))
      && isSharedRendererNativeTextStrokeSupported(parsed.textStroke ?? null)
      && isSharedRendererNativeTextShadowSupported(parsed.textShadow ?? null)
    );
  } catch {
    return false;
  }
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

const SUPPORTED_GENERATED_SHAPE_TYPES = new Set([
  'rounded_rect',
  'circle',
  'ellipse',
  'triangle',
  'star',
  'pentagon',
  'diamond',
  'arrow',
  'heart',
  'cross',
]);

const isSharedRendererNativeGeneratedShapeGradientSupported = (gradient: unknown): boolean => {
  if (gradient === null || gradient === undefined) return true;
  if (typeof gradient !== 'object') return false;
  const parsed = gradient as {
    enabled?: unknown;
    type?: unknown;
    colours?: unknown;
    stops?: unknown;
    direction?: unknown;
  };
  if (parsed.enabled !== true) return true;
  return (
    (parsed.type === 'linear' || parsed.type === 'radial')
    && Array.isArray(parsed.colours)
    && parsed.colours.every((colour) => typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour))
    && (parsed.stops === undefined || (
      Array.isArray(parsed.stops)
      && parsed.stops.every((stop) => typeof stop === 'number' && Number.isFinite(stop))
    ))
    && (parsed.direction === undefined || (typeof parsed.direction === 'number' && Number.isFinite(parsed.direction)))
  );
};

/**
 * `shape` kind の生成ワイヤーソース。R3 のワイヤースキーマ統一（rust-core の
 * `ShapeObjectFields` を rust-backend が直接デシリアライズする）に伴い、
 * ここでの受理判定も camelCase の編集モデル型と同じ形を見るようにしている。
 */
const isSharedRendererNativeGeneratedShapeSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      shapeType?: unknown;
      fill?: unknown;
      gradient?: unknown;
      cornerRadius?: unknown;
    };
    return (
      typeof parsed.shapeType === 'string'
      && SUPPORTED_GENERATED_SHAPE_TYPES.has(parsed.shapeType)
      && typeof parsed.fill === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.fill)
      && isSharedRendererNativeGeneratedShapeGradientSupported(parsed.gradient ?? null)
      && (parsed.cornerRadius === undefined || (
        typeof parsed.cornerRadius === 'number'
        && Number.isFinite(parsed.cornerRadius)
        && parsed.cornerRadius >= 0
      ))
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

const isSharedRendererNativeGeneratedAudioSphereSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      target_audio_id?: unknown;
      target_source?: unknown;
      sample_window_seconds?: unknown;
      columns?: unknown;
      rows?: unknown;
      base_radius?: unknown;
      audio_influence?: unknown;
      point_size?: unknown;
      polygon_size?: unknown;
      random_amount?: unknown;
      colour?: unknown;
      seed?: unknown;
    };
    return (
      parsed.generator === 'audio-sphere-93'
      && typeof parsed.target_audio_id === 'string'
      && parsed.target_audio_id.length > 0
      && typeof parsed.target_source === 'string'
      && parsed.target_source.length > 0
      && typeof parsed.sample_window_seconds === 'number'
      && Number.isFinite(parsed.sample_window_seconds)
      && parsed.sample_window_seconds > 0
      && parsed.sample_window_seconds <= 10
      && typeof parsed.columns === 'number'
      && Number.isInteger(parsed.columns)
      && parsed.columns >= 2
      && parsed.columns <= 64
      && typeof parsed.rows === 'number'
      && Number.isInteger(parsed.rows)
      && parsed.rows >= 2
      && parsed.rows <= 64
      && typeof parsed.base_radius === 'number'
      && Number.isFinite(parsed.base_radius)
      && parsed.base_radius > 0
      && parsed.base_radius <= 2000
      && typeof parsed.audio_influence === 'number'
      && Number.isFinite(parsed.audio_influence)
      && parsed.audio_influence >= 0
      && parsed.audio_influence <= 4
      && typeof parsed.point_size === 'number'
      && Number.isFinite(parsed.point_size)
      && parsed.point_size >= 0
      && parsed.point_size <= 200
      && typeof parsed.polygon_size === 'number'
      && Number.isFinite(parsed.polygon_size)
      && parsed.polygon_size >= 0
      && parsed.polygon_size <= 4
      && typeof parsed.random_amount === 'number'
      && Number.isFinite(parsed.random_amount)
      && parsed.random_amount >= 0
      && parsed.random_amount <= 4
      && typeof parsed.colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.colour)
      && typeof parsed.seed === 'number'
      && Number.isInteger(parsed.seed)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedParticleSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      seed?: unknown;
      particleCount?: unknown;
      spread?: unknown;
      speed?: unknown;
      size?: unknown;
      colour?: unknown;
      lifetimeSeconds?: unknown;
    };
    return (
      Number.isInteger(parsed.seed)
      && typeof parsed.particleCount === 'number'
      && Number.isInteger(parsed.particleCount)
      && parsed.particleCount > 0
      && parsed.particleCount <= 10000
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
      && typeof parsed.lifetimeSeconds === 'number'
      && Number.isFinite(parsed.lifetimeSeconds)
      && parsed.lifetimeSeconds > 0
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedBarcodeSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      data?: unknown;
      minimumBarWidth?: unknown;
      horizontalMargin?: unknown;
      verticalMargin?: unknown;
      foregroundColour?: unknown;
      backgroundColour?: unknown;
    };
    return (
      typeof parsed.data === 'string'
      && parsed.data.length > 0
      && parsed.data.length <= 128
      && typeof parsed.minimumBarWidth === 'number'
      && Number.isFinite(parsed.minimumBarWidth)
      && parsed.minimumBarWidth >= 1
      && parsed.minimumBarWidth <= 32
      && typeof parsed.horizontalMargin === 'number'
      && Number.isFinite(parsed.horizontalMargin)
      && parsed.horizontalMargin >= 0
      && parsed.horizontalMargin <= 1000
      && typeof parsed.verticalMargin === 'number'
      && Number.isFinite(parsed.verticalMargin)
      && parsed.verticalMargin >= 0
      && parsed.verticalMargin <= 1000
      && typeof parsed.foregroundColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.foregroundColour)
      && typeof parsed.backgroundColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.backgroundColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedPuzzlePieceSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      size?: unknown;
      shapeVariant?: unknown;
      connectorMode?: unknown;
      fillColour?: unknown;
    };
    return (
      typeof parsed.size === 'number'
      && Number.isFinite(parsed.size)
      && parsed.size >= 1
      && parsed.size <= 2000
      && typeof parsed.shapeVariant === 'number'
      && Number.isInteger(parsed.shapeVariant)
      && parsed.shapeVariant >= 1
      && parsed.shapeVariant <= 22
      && (parsed.connectorMode === 'convex' || parsed.connectorMode === 'concave')
      && typeof parsed.fillColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.fillColour)
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

const isSharedRendererNativeGeneratedHistogramSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      bin_values?: unknown;
      height_scale_percent?: unknown;
      line_width?: unknown;
      show_luminance?: unknown;
      show_red?: unknown;
      show_green?: unknown;
      show_blue?: unknown;
      channel_colours?: unknown;
      background_colour?: unknown;
    };
    return (
      parsed.generator === 'simple-histogram'
      && Array.isArray(parsed.bin_values)
      && parsed.bin_values.length > 0
      && parsed.bin_values.length <= 256
      && parsed.bin_values.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
      && typeof parsed.height_scale_percent === 'number'
      && Number.isFinite(parsed.height_scale_percent)
      && parsed.height_scale_percent > 0
      && parsed.height_scale_percent <= 1000
      && typeof parsed.line_width === 'number'
      && Number.isFinite(parsed.line_width)
      && parsed.line_width > 0
      && typeof parsed.show_luminance === 'boolean'
      && typeof parsed.show_red === 'boolean'
      && typeof parsed.show_green === 'boolean'
      && typeof parsed.show_blue === 'boolean'
      && Array.isArray(parsed.channel_colours)
      && parsed.channel_colours.length === 4
      && parsed.channel_colours.every((colour) => typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour))
      && typeof parsed.background_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.background_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedSunburstSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      ray_count?: unknown;
      ray_coverage_percent?: unknown;
      rotation_offset_degrees?: unknown;
      centre_x_percent?: unknown;
      centre_y_percent?: unknown;
      motif_size?: unknown;
      motif_shape?: unknown;
      ray_colour?: unknown;
      background_colour?: unknown;
    };
    return (
      parsed.generator === 'sunrise'
      && typeof parsed.ray_count === 'number'
      && Number.isInteger(parsed.ray_count)
      && parsed.ray_count >= 1
      && parsed.ray_count <= 360
      && typeof parsed.ray_coverage_percent === 'number'
      && Number.isFinite(parsed.ray_coverage_percent)
      && parsed.ray_coverage_percent >= 0
      && parsed.ray_coverage_percent <= 100
      && typeof parsed.rotation_offset_degrees === 'number'
      && Number.isFinite(parsed.rotation_offset_degrees)
      && typeof parsed.centre_x_percent === 'number'
      && Number.isFinite(parsed.centre_x_percent)
      && parsed.centre_x_percent >= -100
      && parsed.centre_x_percent <= 200
      && typeof parsed.centre_y_percent === 'number'
      && Number.isFinite(parsed.centre_y_percent)
      && parsed.centre_y_percent >= -100
      && parsed.centre_y_percent <= 200
      && typeof parsed.motif_size === 'number'
      && Number.isFinite(parsed.motif_size)
      && parsed.motif_size >= 0
      && (parsed.motif_shape === 'circle' || parsed.motif_shape === 'rect')
      && typeof parsed.ray_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.ray_colour)
      && typeof parsed.background_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.background_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedCircularArrowSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      radius?: unknown;
      line_width?: unknown;
      head_size?: unknown;
      angle_degrees?: unknown;
      centre_angle_degrees?: unknown;
      head_shape?: unknown;
      show_tail_head?: unknown;
      flip_vertical?: unknown;
      flip_horizontal?: unknown;
      arrow_colour?: unknown;
    };
    return (
      parsed.generator === 'circular-arrow'
      && typeof parsed.radius === 'number'
      && Number.isInteger(parsed.radius)
      && parsed.radius > 0
      && parsed.radius <= 2000
      && typeof parsed.line_width === 'number'
      && Number.isInteger(parsed.line_width)
      && parsed.line_width > 0
      && parsed.line_width <= 1000
      && typeof parsed.head_size === 'number'
      && Number.isInteger(parsed.head_size)
      && parsed.head_size >= 0
      && parsed.head_size <= 1000
      && typeof parsed.angle_degrees === 'number'
      && Number.isFinite(parsed.angle_degrees)
      && parsed.angle_degrees >= 0
      && parsed.angle_degrees <= 360
      && typeof parsed.centre_angle_degrees === 'number'
      && Number.isFinite(parsed.centre_angle_degrees)
      && (parsed.head_shape === 'triangle' || parsed.head_shape === 'circle')
      && typeof parsed.show_tail_head === 'boolean'
      && typeof parsed.flip_vertical === 'boolean'
      && typeof parsed.flip_horizontal === 'boolean'
      && typeof parsed.arrow_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.arrow_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedTriangleBracketSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      bracket_width?: unknown;
      angle_degrees?: unknown;
      arm_length?: unknown;
      offset_distance?: unknown;
      bracket_colour?: unknown;
    };
    return (
      parsed.generator === 'triangle-bracket'
      && typeof parsed.bracket_width === 'number'
      && Number.isInteger(parsed.bracket_width)
      && parsed.bracket_width > 0
      && parsed.bracket_width <= 2000
      && typeof parsed.angle_degrees === 'number'
      && Number.isFinite(parsed.angle_degrees)
      && parsed.angle_degrees >= 1
      && parsed.angle_degrees <= 180
      && typeof parsed.arm_length === 'number'
      && Number.isInteger(parsed.arm_length)
      && parsed.arm_length >= 0
      && parsed.arm_length <= 2000
      && typeof parsed.offset_distance === 'number'
      && Number.isInteger(parsed.offset_distance)
      && parsed.offset_distance >= -10000
      && parsed.offset_distance <= 10000
      && typeof parsed.bracket_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.bracket_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedTartanCheckSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      tile_size?: unknown;
      blur_radius?: unknown;
      base_colour?: unknown;
      stripe_colour_a?: unknown;
      stripe_colour_b?: unknown;
      line_colour?: unknown;
    };
    return (
      parsed.generator === 'tartan-check'
      && typeof parsed.tile_size === 'number'
      && Number.isInteger(parsed.tile_size)
      && parsed.tile_size >= 10
      && parsed.tile_size <= 800
      && typeof parsed.blur_radius === 'number'
      && Number.isInteger(parsed.blur_radius)
      && parsed.blur_radius >= 0
      && parsed.blur_radius <= 300
      && typeof parsed.base_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.base_colour)
      && typeof parsed.stripe_colour_a === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.stripe_colour_a)
      && typeof parsed.stripe_colour_b === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.stripe_colour_b)
      && typeof parsed.line_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.line_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedHoundstoothSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      pattern_size?: unknown;
      foreground_colour?: unknown;
      background_colour?: unknown;
    };
    return (
      parsed.generator === 'houndstooth'
      && typeof parsed.pattern_size === 'number'
      && Number.isInteger(parsed.pattern_size)
      && parsed.pattern_size >= 10
      && parsed.pattern_size <= 200
      && typeof parsed.foreground_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.foreground_colour)
      && typeof parsed.background_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.background_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedYagasuriSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      arrow_width?: unknown;
      arrow_height?: unknown;
      line_width?: unknown;
      staggered?: unknown;
      foreground_colour?: unknown;
      background_colour?: unknown;
    };
    return (
      parsed.generator === 'yagasuri'
      && Number.isInteger(parsed.arrow_width)
      && typeof parsed.arrow_width === 'number'
      && parsed.arrow_width >= 1
      && parsed.arrow_width <= 500
      && Number.isInteger(parsed.arrow_height)
      && typeof parsed.arrow_height === 'number'
      && parsed.arrow_height >= 1
      && parsed.arrow_height <= 500
      && Number.isInteger(parsed.line_width)
      && typeof parsed.line_width === 'number'
      && parsed.line_width >= 0
      && parsed.line_width <= 100
      && typeof parsed.staggered === 'boolean'
      && typeof parsed.foreground_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.foreground_colour)
      && typeof parsed.background_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.background_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedPaperAirplaneSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      body_length?: unknown;
      wing_width?: unknown;
      fold_height?: unknown;
      gap?: unknown;
      follow_motion_direction?: unknown;
      axis_mode?: unknown;
      fill_colour?: unknown;
    };
    return (
      parsed.generator === 'paper-airplane'
      && typeof parsed.body_length === 'number'
      && Number.isInteger(parsed.body_length)
      && parsed.body_length >= 1
      && parsed.body_length <= 2000
      && typeof parsed.wing_width === 'number'
      && Number.isInteger(parsed.wing_width)
      && parsed.wing_width >= 0
      && parsed.wing_width <= 1000
      && typeof parsed.fold_height === 'number'
      && Number.isInteger(parsed.fold_height)
      && parsed.fold_height >= 0
      && parsed.fold_height <= 1000
      && typeof parsed.gap === 'number'
      && Number.isInteger(parsed.gap)
      && parsed.gap >= 0
      && parsed.gap <= 1000
      && typeof parsed.follow_motion_direction === 'boolean'
      && (parsed.axis_mode === 0 || parsed.axis_mode === 1)
      && typeof parsed.fill_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.fill_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedAsanohaPatternSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      pattern_size?: unknown;
      line_width?: unknown;
      foreground_colour?: unknown;
      background_colour?: unknown;
    };
    return (
      parsed.generator === 'asanoha-pattern'
      && typeof parsed.pattern_size === 'number'
      && Number.isInteger(parsed.pattern_size)
      && parsed.pattern_size >= 10
      && parsed.pattern_size <= 500
      && typeof parsed.line_width === 'number'
      && Number.isInteger(parsed.line_width)
      && parsed.line_width >= 0
      && parsed.line_width <= 50
      && typeof parsed.foreground_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.foreground_colour)
      && typeof parsed.background_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.background_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedFocusLinesPlusSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      ray_width?: unknown;
      gap?: unknown;
      centre_radius?: unknown;
      rotation_degrees?: unknown;
      centre_x?: unknown;
      centre_y?: unknown;
      centre_jitter_percent?: unknown;
      seed?: unknown;
      keyframe_interval?: unknown;
      line_colour?: unknown;
    };
    return (
      parsed.generator === 'focus-lines-plus'
      && typeof parsed.ray_width === 'number'
      && Number.isFinite(parsed.ray_width)
      && parsed.ray_width >= 0.1
      && parsed.ray_width <= 10
      && typeof parsed.gap === 'number'
      && Number.isFinite(parsed.gap)
      && parsed.gap >= 1
      && parsed.gap <= 20
      && typeof parsed.centre_radius === 'number'
      && Number.isFinite(parsed.centre_radius)
      && parsed.centre_radius >= 0
      && parsed.centre_radius <= 800
      && typeof parsed.rotation_degrees === 'number'
      && Number.isFinite(parsed.rotation_degrees)
      && parsed.rotation_degrees >= -720
      && parsed.rotation_degrees <= 720
      && typeof parsed.centre_x === 'number'
      && Number.isFinite(parsed.centre_x)
      && typeof parsed.centre_y === 'number'
      && Number.isFinite(parsed.centre_y)
      && typeof parsed.centre_jitter_percent === 'number'
      && Number.isFinite(parsed.centre_jitter_percent)
      && parsed.centre_jitter_percent >= 0
      && parsed.centre_jitter_percent <= 100
      && typeof parsed.seed === 'number'
      && Number.isInteger(parsed.seed)
      && typeof parsed.keyframe_interval === 'number'
      && Number.isInteger(parsed.keyframe_interval)
      && parsed.keyframe_interval >= 0
      && typeof parsed.line_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.line_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedRandomLineExSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      line_count?: unknown;
      line_width?: unknown;
      threshold?: unknown;
      noise_cell_size?: unknown;
      width_variance?: unknown;
      seed?: unknown;
      line_colour?: unknown;
    };
    return (
      parsed.generator === 'random-line-ex'
      && typeof parsed.line_count === 'number'
      && Number.isInteger(parsed.line_count)
      && parsed.line_count >= 1
      && parsed.line_count <= 100
      && typeof parsed.line_width === 'number'
      && Number.isFinite(parsed.line_width)
      && parsed.line_width >= 0
      && parsed.line_width <= 2000
      && typeof parsed.threshold === 'number'
      && Number.isInteger(parsed.threshold)
      && parsed.threshold >= 0
      && parsed.threshold <= 255
      && typeof parsed.noise_cell_size === 'number'
      && Number.isInteger(parsed.noise_cell_size)
      && parsed.noise_cell_size >= 0
      && parsed.noise_cell_size <= 50
      && typeof parsed.width_variance === 'number'
      && Number.isFinite(parsed.width_variance)
      && parsed.width_variance >= 0
      && parsed.width_variance <= 2000
      && typeof parsed.seed === 'number'
      && Number.isInteger(parsed.seed)
      && typeof parsed.line_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.line_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedContourTraceSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      line_width?: unknown;
      contour_count?: unknown;
      jitter_amount?: unknown;
      trace_colour?: unknown;
      background_opacity?: unknown;
      seed?: unknown;
    };
    return (
      parsed.generator === 'contour-trace-93'
      && typeof parsed.line_width === 'number'
      && Number.isFinite(parsed.line_width)
      && parsed.line_width >= 1
      && parsed.line_width <= 200
      && typeof parsed.contour_count === 'number'
      && Number.isInteger(parsed.contour_count)
      && parsed.contour_count >= 1
      && parsed.contour_count <= 64
      && typeof parsed.jitter_amount === 'number'
      && Number.isFinite(parsed.jitter_amount)
      && parsed.jitter_amount >= 0
      && parsed.jitter_amount <= 100
      && typeof parsed.trace_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.trace_colour)
      && typeof parsed.background_opacity === 'number'
      && Number.isFinite(parsed.background_opacity)
      && parsed.background_opacity >= 0
      && parsed.background_opacity <= 1
      && typeof parsed.seed === 'number'
      && Number.isInteger(parsed.seed)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedDisplacementPolySourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      columns?: unknown;
      rows?: unknown;
      displacement_scale?: unknown;
      depth_scale?: unknown;
      mesh_opacity?: unknown;
      fill_opacity?: unknown;
      line_colour?: unknown;
      fill_colour?: unknown;
      seed?: unknown;
    };
    return (
      parsed.generator === 'displacement-poly-93'
      && typeof parsed.columns === 'number'
      && Number.isInteger(parsed.columns)
      && parsed.columns >= 1
      && parsed.columns <= 128
      && typeof parsed.rows === 'number'
      && Number.isInteger(parsed.rows)
      && parsed.rows >= 1
      && parsed.rows <= 128
      && typeof parsed.displacement_scale === 'number'
      && Number.isFinite(parsed.displacement_scale)
      && parsed.displacement_scale >= 0
      && parsed.displacement_scale <= 1000
      && typeof parsed.depth_scale === 'number'
      && Number.isFinite(parsed.depth_scale)
      && parsed.depth_scale >= 0
      && parsed.depth_scale <= 1000
      && typeof parsed.mesh_opacity === 'number'
      && Number.isFinite(parsed.mesh_opacity)
      && parsed.mesh_opacity >= 0
      && parsed.mesh_opacity <= 1
      && typeof parsed.fill_opacity === 'number'
      && Number.isFinite(parsed.fill_opacity)
      && parsed.fill_opacity >= 0
      && parsed.fill_opacity <= 1
      && typeof parsed.line_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.line_colour)
      && typeof parsed.fill_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.fill_colour)
      && typeof parsed.seed === 'number'
      && Number.isInteger(parsed.seed)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedHologramSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      tile_size?: unknown;
      rotation_degrees?: unknown;
      gradient_angle_degrees?: unknown;
      colour_mode?: unknown;
      tint_colour?: unknown;
    };
    return (
      parsed.generator === 'hologram'
      && typeof parsed.tile_size === 'number'
      && Number.isInteger(parsed.tile_size)
      && parsed.tile_size >= 10
      && parsed.tile_size <= 1000
      && typeof parsed.rotation_degrees === 'number'
      && Number.isFinite(parsed.rotation_degrees)
      && parsed.rotation_degrees >= -720
      && parsed.rotation_degrees <= 720
      && typeof parsed.gradient_angle_degrees === 'number'
      && Number.isFinite(parsed.gradient_angle_degrees)
      && parsed.gradient_angle_degrees >= -720
      && parsed.gradient_angle_degrees <= 720
      && typeof parsed.colour_mode === 'number'
      && Number.isInteger(parsed.colour_mode)
      && parsed.colour_mode >= 0
      && parsed.colour_mode <= 2
      && typeof parsed.tint_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.tint_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedPlainEffectorLineSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      radius?: unknown;
      strength?: unknown;
      randomness?: unknown;
      zoom?: unknown;
      invert?: unknown;
      line_count?: unknown;
      line_width?: unknown;
      colour?: unknown;
      colour_amount?: unknown;
      seed?: unknown;
    };
    return (
      parsed.generator === 'plain-effector-line-93'
      && typeof parsed.radius === 'number'
      && Number.isFinite(parsed.radius)
      && parsed.radius >= 1
      && parsed.radius <= 2000
      && typeof parsed.strength === 'number'
      && Number.isFinite(parsed.strength)
      && parsed.strength >= -10
      && parsed.strength <= 10
      && typeof parsed.randomness === 'number'
      && Number.isFinite(parsed.randomness)
      && parsed.randomness >= -1000
      && parsed.randomness <= 1000
      && typeof parsed.zoom === 'number'
      && Number.isFinite(parsed.zoom)
      && parsed.zoom >= -2
      && parsed.zoom <= 5
      && typeof parsed.invert === 'boolean'
      && typeof parsed.line_count === 'number'
      && Number.isInteger(parsed.line_count)
      && parsed.line_count >= 1
      && parsed.line_count <= 128
      && typeof parsed.line_width === 'number'
      && Number.isFinite(parsed.line_width)
      && parsed.line_width >= 0.25
      && parsed.line_width <= 200
      && typeof parsed.colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.colour)
      && typeof parsed.colour_amount === 'number'
      && Number.isFinite(parsed.colour_amount)
      && parsed.colour_amount >= 0
      && parsed.colour_amount <= 1
      && typeof parsed.seed === 'number'
      && Number.isInteger(parsed.seed)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedProtractorSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      radius?: unknown;
      measured_angle_degrees?: unknown;
      tick_step_degrees?: unknown;
      major_tick_step_degrees?: unknown;
      decimal_places?: unknown;
      line_colour?: unknown;
      text_colour?: unknown;
      shadow_colour?: unknown;
    };
    return (
      parsed.generator === 'protractor'
      && typeof parsed.radius === 'number'
      && Number.isInteger(parsed.radius)
      && parsed.radius >= 1
      && parsed.radius <= 2000
      && typeof parsed.measured_angle_degrees === 'number'
      && Number.isFinite(parsed.measured_angle_degrees)
      && parsed.measured_angle_degrees >= 0
      && parsed.measured_angle_degrees <= 180
      && typeof parsed.tick_step_degrees === 'number'
      && Number.isInteger(parsed.tick_step_degrees)
      && parsed.tick_step_degrees >= 1
      && parsed.tick_step_degrees <= 90
      && typeof parsed.major_tick_step_degrees === 'number'
      && Number.isInteger(parsed.major_tick_step_degrees)
      && parsed.major_tick_step_degrees >= 1
      && parsed.major_tick_step_degrees <= 180
      && typeof parsed.decimal_places === 'number'
      && Number.isInteger(parsed.decimal_places)
      && parsed.decimal_places >= 0
      && parsed.decimal_places <= 5
      && typeof parsed.line_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.line_colour)
      && typeof parsed.text_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.text_colour)
      && typeof parsed.shadow_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.shadow_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedShakingPolygonSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      line_width?: unknown;
      vertex_count?: unknown;
      fixed_diameter?: unknown;
      vertical_distortion_percent?: unknown;
      repeat_count?: unknown;
      repeat_frequency?: unknown;
      fill?: unknown;
      jitter_range?: unknown;
      jitter_interval?: unknown;
      stepped?: unknown;
      colour?: unknown;
      seed?: unknown;
    };
    return (
      parsed.generator === 'shaking-polygon'
      && typeof parsed.line_width === 'number'
      && Number.isInteger(parsed.line_width)
      && parsed.line_width >= 1
      && parsed.line_width <= 100
      && typeof parsed.vertex_count === 'number'
      && Number.isInteger(parsed.vertex_count)
      && parsed.vertex_count >= 2
      && parsed.vertex_count <= 16
      && typeof parsed.fixed_diameter === 'number'
      && Number.isInteger(parsed.fixed_diameter)
      && parsed.fixed_diameter >= 0
      && parsed.fixed_diameter <= 2000
      && typeof parsed.vertical_distortion_percent === 'number'
      && Number.isFinite(parsed.vertical_distortion_percent)
      && parsed.vertical_distortion_percent >= -100
      && parsed.vertical_distortion_percent <= 100
      && typeof parsed.repeat_count === 'number'
      && Number.isInteger(parsed.repeat_count)
      && parsed.repeat_count >= 1
      && parsed.repeat_count <= 100
      && typeof parsed.repeat_frequency === 'number'
      && Number.isInteger(parsed.repeat_frequency)
      && parsed.repeat_frequency >= 1
      && typeof parsed.fill === 'boolean'
      && typeof parsed.jitter_range === 'number'
      && Number.isFinite(parsed.jitter_range)
      && parsed.jitter_range >= 0
      && parsed.jitter_range <= 2000
      && typeof parsed.jitter_interval === 'number'
      && Number.isInteger(parsed.jitter_interval)
      && parsed.jitter_interval >= 1
      && typeof parsed.stepped === 'boolean'
      && typeof parsed.colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.colour)
      && typeof parsed.seed === 'number'
      && Number.isInteger(parsed.seed)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedShatteredSphereSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      fracture_amount?: unknown;
      delay?: unknown;
      radius?: unknown;
      limit_distance?: unknown;
      thickness?: unknown;
      fragment_size?: unknown;
      random_shape?: unknown;
      speed?: unknown;
      impact?: unknown;
      gravity?: unknown;
      spin?: unknown;
      direction_diffusion?: unknown;
      colour?: unknown;
      seed?: unknown;
    };
    return (
      parsed.generator === 'shattered-sphere-93'
      && finiteNumberInRange(parsed.fracture_amount, 0, 5000)
      && finiteNumberInRange(parsed.delay, 0, 1000)
      && finiteNumberInRange(parsed.radius, 1, 10000)
      && finiteNumberInRange(parsed.limit_distance, 0, 10000)
      && finiteNumberInRange(parsed.thickness, 0, 1000)
      && finiteNumberInRange(parsed.fragment_size, 1, 1000)
      && finiteNumberInRange(parsed.random_shape, 0, 100)
      && finiteNumberInRange(parsed.speed, 0, 1000)
      && finiteNumberInRange(parsed.impact, 0, 1000)
      && Array.isArray(parsed.gravity)
      && parsed.gravity.length === 3
      && parsed.gravity.every((value) => finiteNumberInRange(value, -1000, 1000))
      && finiteNumberInRange(parsed.spin, 0, 1000)
      && finiteNumberInRange(parsed.direction_diffusion, 0, 1000)
      && typeof parsed.colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.colour)
      && typeof parsed.seed === 'number'
      && Number.isInteger(parsed.seed)
    );
  } catch {
    return false;
  }
};

const finiteNumberInRange = (value: unknown, min: number, max: number): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const isSharedRendererNativeGeneratedToneCurveSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      grid_divisions?: unknown;
      line_width?: unknown;
      curve_points?: unknown;
      curve_colour?: unknown;
      grid_colour?: unknown;
      background_colour?: unknown;
    };
    return (
      parsed.generator === 'simple-tone-curve'
      && typeof parsed.grid_divisions === 'number'
      && Number.isInteger(parsed.grid_divisions)
      && parsed.grid_divisions >= 1
      && parsed.grid_divisions <= 16
      && typeof parsed.line_width === 'number'
      && Number.isInteger(parsed.line_width)
      && parsed.line_width >= 1
      && parsed.line_width <= 100
      && Array.isArray(parsed.curve_points)
      && parsed.curve_points.length >= 2
      && parsed.curve_points.length <= 64
      && parsed.curve_points.every((point) => typeof point === 'number' && Number.isFinite(point) && point >= 0 && point <= 1)
      && typeof parsed.curve_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.curve_colour)
      && typeof parsed.grid_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.grid_colour)
      && typeof parsed.background_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.background_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedHksyCheckerGridSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      pattern?: unknown;
      cell_size?: unknown;
      line_width?: unknown;
      checker_enabled?: unknown;
      grid_enabled?: unknown;
      foreground_colour?: unknown;
      secondary_colour?: unknown;
      background_colour?: unknown;
      palette_colours?: unknown;
      separate_interval?: unknown;
      separate_line_width?: unknown;
      anchor_points?: unknown;
      round_caps?: unknown;
      max_join_distance?: unknown;
    };
    const paletteColoursSupported = parsed.palette_colours === undefined || (
      Array.isArray(parsed.palette_colours)
      && parsed.palette_colours.length >= 2
      && parsed.palette_colours.length <= 16
      && parsed.palette_colours.every((colour) => (
        typeof colour === 'string'
        && /^#[0-9a-f]{6}$/i.test(colour)
      ))
    );
    const measuredGridFieldsSupported = parsed.pattern !== 'measured-grid' || (
      typeof parsed.separate_interval === 'number'
      && Number.isInteger(parsed.separate_interval)
      && parsed.separate_interval >= 1
      && parsed.separate_interval <= 1000
      && typeof parsed.separate_line_width === 'number'
      && Number.isInteger(parsed.separate_line_width)
      && parsed.separate_line_width >= 0
      && parsed.separate_line_width <= 100
    );
    const anchorLineFieldsSupported = parsed.pattern !== 'anchor-line' || (
      Array.isArray(parsed.anchor_points)
      && parsed.anchor_points.length >= 2
      && parsed.anchor_points.length <= 16
      && parsed.anchor_points.every((point) => (
        typeof point === 'object'
        && point !== null
        && typeof (point as { x?: unknown }).x === 'number'
        && Number.isFinite((point as { x: number }).x)
        && (point as { x: number }).x >= -1000
        && (point as { x: number }).x <= 1000
        && typeof (point as { y?: unknown }).y === 'number'
        && Number.isFinite((point as { y: number }).y)
        && (point as { y: number }).y >= -1000
        && (point as { y: number }).y <= 1000
      ))
      && typeof parsed.round_caps === 'boolean'
      && typeof parsed.max_join_distance === 'number'
      && Number.isFinite(parsed.max_join_distance)
      && parsed.max_join_distance >= 0
      && parsed.max_join_distance <= 300
    );
    return (
      parsed.generator === 'hksy-checker-grid'
      && (parsed.pattern === undefined || parsed.pattern === 'checker-grid' || parsed.pattern === 'diamond' || parsed.pattern === 'measured-grid' || parsed.pattern === 'anchor-line')
      && typeof parsed.cell_size === 'number'
      && Number.isInteger(parsed.cell_size)
      && parsed.cell_size >= 1
      && parsed.cell_size <= 1000
      && typeof parsed.line_width === 'number'
      && Number.isInteger(parsed.line_width)
      && parsed.line_width >= 0
      && parsed.line_width <= 100
      && typeof parsed.checker_enabled === 'boolean'
      && typeof parsed.grid_enabled === 'boolean'
      && typeof parsed.foreground_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.foreground_colour)
      && typeof parsed.secondary_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.secondary_colour)
      && typeof parsed.background_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.background_colour)
      && paletteColoursSupported
      && measuredGridFieldsSupported
      && anchorLineFieldsSupported
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedGetColorDotsSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      columns?: unknown;
      rows?: unknown;
      dot_size?: unknown;
      size_influence?: unknown;
      luminance_influence?: unknown;
      hue_shift_degrees?: unknown;
      alternate_rows?: unknown;
      foreground_colour?: unknown;
      secondary_colour?: unknown;
      background_colour?: unknown;
      seed?: unknown;
      dot_shape?: unknown;
      stroke_width?: unknown;
      source_image?: unknown;
      source_active_layer_ids?: unknown;
      sample_strength?: unknown;
      sample_hue_shift_degrees?: unknown;
    };
    const dotShapeSupported = parsed.dot_shape === undefined
      || parsed.dot_shape === 'circle'
      || parsed.dot_shape === 'square'
      || parsed.dot_shape === 'diamond';
    const strokeWidthSupported = parsed.stroke_width === undefined || (
      typeof parsed.stroke_width === 'number'
      && Number.isFinite(parsed.stroke_width)
      && parsed.stroke_width >= 0
      && parsed.stroke_width <= 200
    );
    const sourceImageSupported = parsed.source_image === undefined || (
      typeof parsed.source_image === 'string'
      && parsed.source_image.length > 0
      && isLocalNativeMediaSource(parsed.source_image)
      && /\.(png|jpe?g|psd)$/i.test(nativeMediaSourcePathname(parsed.source_image))
    );
    const sourceActiveLayerIdsSupported = parsed.source_active_layer_ids === undefined || (
      Array.isArray(parsed.source_active_layer_ids)
      && parsed.source_active_layer_ids.every((layerId) => typeof layerId === 'string' && layerId.length > 0)
    );
    const sampleStrengthSupported = parsed.sample_strength === undefined || (
      typeof parsed.sample_strength === 'number'
      && Number.isFinite(parsed.sample_strength)
      && parsed.sample_strength >= 0
      && parsed.sample_strength <= 1
    );
    const sampleHueShiftSupported = parsed.sample_hue_shift_degrees === undefined || (
      typeof parsed.sample_hue_shift_degrees === 'number'
      && Number.isFinite(parsed.sample_hue_shift_degrees)
      && parsed.sample_hue_shift_degrees >= -720
      && parsed.sample_hue_shift_degrees <= 720
    );
    return (
      parsed.generator === 'getcolor-v2r-dot-field'
      && typeof parsed.columns === 'number'
      && Number.isInteger(parsed.columns)
      && parsed.columns >= 1
      && parsed.columns <= 512
      && typeof parsed.rows === 'number'
      && Number.isInteger(parsed.rows)
      && parsed.rows >= 1
      && parsed.rows <= 512
      && typeof parsed.dot_size === 'number'
      && Number.isFinite(parsed.dot_size)
      && parsed.dot_size >= 0
      && parsed.dot_size <= 2000
      && typeof parsed.size_influence === 'number'
      && Number.isFinite(parsed.size_influence)
      && parsed.size_influence >= 0
      && parsed.size_influence <= 4
      && typeof parsed.luminance_influence === 'number'
      && Number.isFinite(parsed.luminance_influence)
      && parsed.luminance_influence >= 0
      && parsed.luminance_influence <= 4
      && typeof parsed.hue_shift_degrees === 'number'
      && Number.isFinite(parsed.hue_shift_degrees)
      && parsed.hue_shift_degrees >= -720
      && parsed.hue_shift_degrees <= 720
      && typeof parsed.alternate_rows === 'boolean'
      && typeof parsed.foreground_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.foreground_colour)
      && typeof parsed.secondary_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.secondary_colour)
      && typeof parsed.background_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.background_colour)
      && typeof parsed.seed === 'number'
      && Number.isInteger(parsed.seed)
      && dotShapeSupported
      && strokeWidthSupported
      && sourceImageSupported
      && sourceActiveLayerIdsSupported
      && sampleStrengthSupported
      && sampleHueShiftSupported
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedRegionFrameSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      line_width?: unknown;
      shape?: unknown;
      corner_cut?: unknown;
      extra_width?: unknown;
      extra_height?: unknown;
      background_opacity?: unknown;
      frame_colour?: unknown;
      background_colour?: unknown;
    };
    return (
      parsed.generator === 'region-frame-93'
      && typeof parsed.line_width === 'number'
      && Number.isFinite(parsed.line_width)
      && parsed.line_width >= 0
      && parsed.line_width <= 5000
      && (parsed.shape === undefined || parsed.shape === 'rectangle' || parsed.shape === 'ellipse' || parsed.shape === 'cut_corner')
      && (parsed.shape !== 'cut_corner' || (typeof parsed.corner_cut === 'number' && Number.isFinite(parsed.corner_cut) && parsed.corner_cut >= 0 && parsed.corner_cut <= 5000))
      && typeof parsed.extra_width === 'number'
      && Number.isFinite(parsed.extra_width)
      && parsed.extra_width >= -5000
      && parsed.extra_width <= 5000
      && typeof parsed.extra_height === 'number'
      && Number.isFinite(parsed.extra_height)
      && parsed.extra_height >= -5000
      && parsed.extra_height <= 5000
      && typeof parsed.background_opacity === 'number'
      && Number.isFinite(parsed.background_opacity)
      && parsed.background_opacity >= 0
      && parsed.background_opacity <= 1
      && typeof parsed.frame_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.frame_colour)
      && typeof parsed.background_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.background_colour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedSimpleTubeSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      radius?: unknown;
      depth?: unknown;
      segments?: unknown;
      rings?: unknown;
      twist_degrees?: unknown;
      random_amount?: unknown;
      stroke_width?: unknown;
      colour?: unknown;
      secondary_colour?: unknown;
      colour_pattern?: unknown;
      fog_strength?: unknown;
      fog_colour?: unknown;
      seed?: unknown;
      torus?: unknown;
    };
    return (
      parsed.generator === 'simple-tube-93'
      && typeof parsed.radius === 'number'
      && Number.isFinite(parsed.radius)
      && parsed.radius >= 0
      && parsed.radius <= 9000
      && typeof parsed.depth === 'number'
      && Number.isFinite(parsed.depth)
      && parsed.depth >= -12000
      && parsed.depth <= 12000
      && typeof parsed.segments === 'number'
      && Number.isInteger(parsed.segments)
      && parsed.segments >= 3
      && parsed.segments <= 128
      && typeof parsed.rings === 'number'
      && Number.isInteger(parsed.rings)
      && parsed.rings >= 2
      && parsed.rings <= 128
      && typeof parsed.twist_degrees === 'number'
      && Number.isFinite(parsed.twist_degrees)
      && parsed.twist_degrees >= -1800
      && parsed.twist_degrees <= 1800
      && typeof parsed.random_amount === 'number'
      && Number.isFinite(parsed.random_amount)
      && parsed.random_amount >= -300
      && parsed.random_amount <= 300
      && typeof parsed.stroke_width === 'number'
      && Number.isFinite(parsed.stroke_width)
      && parsed.stroke_width >= 0
      && parsed.stroke_width <= 200
      && typeof parsed.colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.colour)
      && typeof parsed.secondary_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.secondary_colour)
      && (parsed.colour_pattern === 'single' || parsed.colour_pattern === 'ring' || parsed.colour_pattern === 'depth')
      && typeof parsed.fog_strength === 'number'
      && Number.isFinite(parsed.fog_strength)
      && parsed.fog_strength >= 0
      && parsed.fog_strength <= 1
      && typeof parsed.fog_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.fog_colour)
      && Number.isInteger(parsed.seed)
      && typeof parsed.torus === 'boolean'
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedSphereDotsSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      radius?: unknown;
      columns?: unknown;
      rows?: unknown;
      rotation_degrees?: unknown;
      offset_degrees?: unknown;
      luminance_influence?: unknown;
      point_size?: unknown;
      latitude_line_width?: unknown;
      colour?: unknown;
      secondary_colour?: unknown;
      seed?: unknown;
      plane_mode?: unknown;
    };
    return (
      parsed.generator === 'sphere-drawpixel-93'
      && typeof parsed.radius === 'number'
      && Number.isFinite(parsed.radius)
      && parsed.radius >= 1
      && parsed.radius <= 5000
      && typeof parsed.columns === 'number'
      && Number.isInteger(parsed.columns)
      && parsed.columns >= 3
      && parsed.columns <= 256
      && typeof parsed.rows === 'number'
      && Number.isInteger(parsed.rows)
      && parsed.rows >= 2
      && parsed.rows <= 256
      && typeof parsed.rotation_degrees === 'number'
      && Number.isFinite(parsed.rotation_degrees)
      && parsed.rotation_degrees >= -1000
      && parsed.rotation_degrees <= 1000
      && typeof parsed.offset_degrees === 'number'
      && Number.isFinite(parsed.offset_degrees)
      && parsed.offset_degrees >= -360
      && parsed.offset_degrees <= 360
      && typeof parsed.luminance_influence === 'number'
      && Number.isFinite(parsed.luminance_influence)
      && parsed.luminance_influence >= -5000
      && parsed.luminance_influence <= 5000
      && typeof parsed.point_size === 'number'
      && Number.isFinite(parsed.point_size)
      && parsed.point_size >= 0
      && parsed.point_size <= 200
      && typeof parsed.latitude_line_width === 'number'
      && Number.isFinite(parsed.latitude_line_width)
      && parsed.latitude_line_width >= 0
      && parsed.latitude_line_width <= 100
      && typeof parsed.colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.colour)
      && typeof parsed.secondary_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.secondary_colour)
      && Number.isInteger(parsed.seed)
      && typeof parsed.plane_mode === 'boolean'
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedSphericalFieldSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      generator?: unknown;
      radius?: unknown;
      strength?: unknown;
      colour_amount?: unknown;
      alpha_amount?: unknown;
      line_width?: unknown;
      ring_count?: unknown;
      vector_count?: unknown;
      field_colour?: unknown;
      secondary_colour?: unknown;
      background_opacity?: unknown;
      container?: unknown;
      seed?: unknown;
    };
    return (
      parsed.generator === 'spherical-field-93'
      && typeof parsed.radius === 'number'
      && Number.isFinite(parsed.radius)
      && parsed.radius >= 0
      && parsed.radius <= 5000
      && typeof parsed.strength === 'number'
      && Number.isFinite(parsed.strength)
      && parsed.strength >= -200
      && parsed.strength <= 200
      && typeof parsed.colour_amount === 'number'
      && Number.isFinite(parsed.colour_amount)
      && parsed.colour_amount >= -100
      && parsed.colour_amount <= 100
      && typeof parsed.alpha_amount === 'number'
      && Number.isFinite(parsed.alpha_amount)
      && parsed.alpha_amount >= -100
      && parsed.alpha_amount <= 100
      && typeof parsed.line_width === 'number'
      && Number.isFinite(parsed.line_width)
      && parsed.line_width >= 0
      && parsed.line_width <= 100
      && typeof parsed.ring_count === 'number'
      && Number.isInteger(parsed.ring_count)
      && parsed.ring_count >= 1
      && parsed.ring_count <= 64
      && typeof parsed.vector_count === 'number'
      && Number.isInteger(parsed.vector_count)
      && parsed.vector_count >= 0
      && parsed.vector_count <= 256
      && typeof parsed.field_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.field_colour)
      && typeof parsed.secondary_colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.secondary_colour)
      && typeof parsed.background_opacity === 'number'
      && Number.isFinite(parsed.background_opacity)
      && parsed.background_opacity >= 0
      && parsed.background_opacity <= 1
      && typeof parsed.container === 'boolean'
      && Number.isInteger(parsed.seed)
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
