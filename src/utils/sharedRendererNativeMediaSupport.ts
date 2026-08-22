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
      radius?: unknown;
      saturation?: unknown;
      brightness?: unknown;
      ringWidthPercent?: unknown;
      segmentCount?: unknown;
    };
    return (
      typeof parsed.radius === 'number'
      && Number.isFinite(parsed.radius)
      && parsed.radius >= 1
      && parsed.radius <= 2000
      && typeof parsed.saturation === 'number'
      && Number.isFinite(parsed.saturation)
      && parsed.saturation >= 0
      && parsed.saturation <= 100
      && typeof parsed.brightness === 'number'
      && Number.isFinite(parsed.brightness)
      && parsed.brightness >= 0
      && parsed.brightness <= 100
      && typeof parsed.ringWidthPercent === 'number'
      && Number.isFinite(parsed.ringWidthPercent)
      && parsed.ringWidthPercent > 0
      && parsed.ringWidthPercent <= 100
      && typeof parsed.segmentCount === 'number'
      && Number.isInteger(parsed.segmentCount)
      && parsed.segmentCount >= 3
      && parsed.segmentCount <= 360
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedGourdSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      bodyRadius?: unknown;
      bodyWidth?: unknown;
      waistRadius?: unknown;
      squashPercent?: unknown;
      repeatCount?: unknown;
      fillColour?: unknown;
    };
    return (
      typeof parsed.bodyRadius === 'number'
      && Number.isInteger(parsed.bodyRadius)
      && parsed.bodyRadius > 0
      && parsed.bodyRadius <= 2000
      && typeof parsed.bodyWidth === 'number'
      && Number.isInteger(parsed.bodyWidth)
      && parsed.bodyWidth > 0
      && parsed.bodyWidth <= 4000
      && typeof parsed.waistRadius === 'number'
      && Number.isInteger(parsed.waistRadius)
      && parsed.waistRadius >= 0
      && parsed.waistRadius <= 2000
      && typeof parsed.squashPercent === 'number'
      && Number.isFinite(parsed.squashPercent)
      && parsed.squashPercent >= 0
      && parsed.squashPercent <= 100
      && typeof parsed.repeatCount === 'number'
      && Number.isInteger(parsed.repeatCount)
      && parsed.repeatCount >= 1
      && parsed.repeatCount <= 36
      && typeof parsed.fillColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.fillColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedGearSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      outerRadius?: unknown;
      innerRadiusPercent?: unknown;
      toothCount?: unknown;
      toothDepthPercent?: unknown;
      toothSkewPercent?: unknown;
      fillColour?: unknown;
    };
    return (
      typeof parsed.outerRadius === 'number'
      && Number.isInteger(parsed.outerRadius)
      && parsed.outerRadius > 0
      && parsed.outerRadius <= 2000
      && typeof parsed.innerRadiusPercent === 'number'
      && Number.isFinite(parsed.innerRadiusPercent)
      && parsed.innerRadiusPercent >= 0
      && parsed.innerRadiusPercent < 100
      && typeof parsed.toothCount === 'number'
      && Number.isInteger(parsed.toothCount)
      && parsed.toothCount >= 3
      && parsed.toothCount <= 240
      && typeof parsed.toothDepthPercent === 'number'
      && Number.isFinite(parsed.toothDepthPercent)
      && parsed.toothDepthPercent > 0
      && parsed.toothDepthPercent <= 95
      && typeof parsed.toothSkewPercent === 'number'
      && Number.isFinite(parsed.toothSkewPercent)
      && parsed.toothSkewPercent >= -100
      && parsed.toothSkewPercent <= 100
      && typeof parsed.fillColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.fillColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedTrackBarSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      trackValues?: unknown;
      trackRanges?: unknown;
      labels?: unknown;
      barColour?: unknown;
      backgroundOpacity?: unknown;
    };
    return (
      isFiniteNumberArrayOfLength(parsed.trackValues, 4)
      && isTrackBarRangeArray(parsed.trackRanges)
      && Array.isArray(parsed.labels)
      && parsed.labels.length === 4
      && parsed.labels.every((label) => typeof label === 'string' && label.length <= 64)
      && typeof parsed.barColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.barColour)
      && typeof parsed.backgroundOpacity === 'number'
      && Number.isFinite(parsed.backgroundOpacity)
      && parsed.backgroundOpacity >= 0
      && parsed.backgroundOpacity <= 1
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedPieChartSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      values?: unknown;
      sortMode?: unknown;
      normaliseToHundred?: unknown;
      labelMode?: unknown;
      progressPercent?: unknown;
      strokeWidth?: unknown;
      sliceColours?: unknown;
    };
    return (
      Array.isArray(parsed.values)
      && parsed.values.length > 0
      && parsed.values.length <= 64
      && parsed.values.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)
      && (parsed.sortMode === 'none' || parsed.sortMode === 'descending' || parsed.sortMode === 'ascending')
      && typeof parsed.normaliseToHundred === 'boolean'
      && (parsed.labelMode === 'none' || parsed.labelMode === 'percentage' || parsed.labelMode === 'input')
      && typeof parsed.progressPercent === 'number'
      && Number.isFinite(parsed.progressPercent)
      && parsed.progressPercent >= 0
      && parsed.progressPercent <= 100
      && typeof parsed.strokeWidth === 'number'
      && Number.isFinite(parsed.strokeWidth)
      && parsed.strokeWidth > 0
      && Array.isArray(parsed.sliceColours)
      && parsed.sliceColours.length > 0
      && parsed.sliceColours.length <= 64
      && parsed.sliceColours.every((colour) => typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour))
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedHistogramSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      binValues?: unknown;
      heightScalePercent?: unknown;
      lineWidth?: unknown;
      showLuminance?: unknown;
      showRed?: unknown;
      showGreen?: unknown;
      showBlue?: unknown;
      channelColours?: unknown;
      backgroundColour?: unknown;
    };
    return (
      Array.isArray(parsed.binValues)
      && parsed.binValues.length > 0
      && parsed.binValues.length <= 256
      && parsed.binValues.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
      && typeof parsed.heightScalePercent === 'number'
      && Number.isFinite(parsed.heightScalePercent)
      && parsed.heightScalePercent > 0
      && parsed.heightScalePercent <= 1000
      && typeof parsed.lineWidth === 'number'
      && Number.isFinite(parsed.lineWidth)
      && parsed.lineWidth > 0
      && typeof parsed.showLuminance === 'boolean'
      && typeof parsed.showRed === 'boolean'
      && typeof parsed.showGreen === 'boolean'
      && typeof parsed.showBlue === 'boolean'
      && Array.isArray(parsed.channelColours)
      && parsed.channelColours.length === 4
      && parsed.channelColours.every((colour) => typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour))
      && typeof parsed.backgroundColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.backgroundColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedSunburstSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      rayCount?: unknown;
      rayCoveragePercent?: unknown;
      rotationOffsetDegrees?: unknown;
      centreXPercent?: unknown;
      centreYPercent?: unknown;
      motifSize?: unknown;
      motifShape?: unknown;
      rayColour?: unknown;
      backgroundColour?: unknown;
    };
    return (
      typeof parsed.rayCount === 'number'
      && Number.isInteger(parsed.rayCount)
      && parsed.rayCount >= 1
      && parsed.rayCount <= 360
      && typeof parsed.rayCoveragePercent === 'number'
      && Number.isFinite(parsed.rayCoveragePercent)
      && parsed.rayCoveragePercent >= 0
      && parsed.rayCoveragePercent <= 100
      && typeof parsed.rotationOffsetDegrees === 'number'
      && Number.isFinite(parsed.rotationOffsetDegrees)
      && typeof parsed.centreXPercent === 'number'
      && Number.isFinite(parsed.centreXPercent)
      && parsed.centreXPercent >= -100
      && parsed.centreXPercent <= 200
      && typeof parsed.centreYPercent === 'number'
      && Number.isFinite(parsed.centreYPercent)
      && parsed.centreYPercent >= -100
      && parsed.centreYPercent <= 200
      && typeof parsed.motifSize === 'number'
      && Number.isFinite(parsed.motifSize)
      && parsed.motifSize >= 0
      && (parsed.motifShape === 'circle' || parsed.motifShape === 'rect')
      && typeof parsed.rayColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.rayColour)
      && typeof parsed.backgroundColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.backgroundColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedCircularArrowSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      radius?: unknown;
      lineWidth?: unknown;
      headSize?: unknown;
      angleDegrees?: unknown;
      centreAngleDegrees?: unknown;
      headShape?: unknown;
      showTailHead?: unknown;
      flipVertical?: unknown;
      flipHorizontal?: unknown;
      arrowColour?: unknown;
    };
    return (
      typeof parsed.radius === 'number'
      && Number.isFinite(parsed.radius)
      && parsed.radius > 0
      && parsed.radius <= 2000
      && typeof parsed.lineWidth === 'number'
      && Number.isFinite(parsed.lineWidth)
      && parsed.lineWidth > 0
      && parsed.lineWidth <= 1000
      && typeof parsed.headSize === 'number'
      && Number.isFinite(parsed.headSize)
      && parsed.headSize >= 0
      && parsed.headSize <= 1000
      && typeof parsed.angleDegrees === 'number'
      && Number.isFinite(parsed.angleDegrees)
      && parsed.angleDegrees >= 0
      && parsed.angleDegrees <= 360
      && typeof parsed.centreAngleDegrees === 'number'
      && Number.isFinite(parsed.centreAngleDegrees)
      && (parsed.headShape === 'triangle' || parsed.headShape === 'circle')
      && typeof parsed.showTailHead === 'boolean'
      && typeof parsed.flipVertical === 'boolean'
      && typeof parsed.flipHorizontal === 'boolean'
      && typeof parsed.arrowColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.arrowColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedTriangleBracketSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      bracketWidth?: unknown;
      angleDegrees?: unknown;
      armLength?: unknown;
      offsetDistance?: unknown;
      bracketColour?: unknown;
    };
    return (
      typeof parsed.bracketWidth === 'number'
      && Number.isFinite(parsed.bracketWidth)
      && parsed.bracketWidth > 0
      && parsed.bracketWidth <= 2000
      && typeof parsed.angleDegrees === 'number'
      && Number.isFinite(parsed.angleDegrees)
      && parsed.angleDegrees >= 1
      && parsed.angleDegrees <= 180
      && typeof parsed.armLength === 'number'
      && Number.isFinite(parsed.armLength)
      && parsed.armLength >= 0
      && parsed.armLength <= 2000
      && typeof parsed.offsetDistance === 'number'
      && Number.isFinite(parsed.offsetDistance)
      && parsed.offsetDistance >= -10000
      && parsed.offsetDistance <= 10000
      && typeof parsed.bracketColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.bracketColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedTartanCheckSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      tileSize?: unknown;
      blurRadius?: unknown;
      baseColour?: unknown;
      stripeColourA?: unknown;
      stripeColourB?: unknown;
      lineColour?: unknown;
    };
    return (
      typeof parsed.tileSize === 'number'
      && Number.isFinite(parsed.tileSize)
      && parsed.tileSize >= 10
      && parsed.tileSize <= 800
      && typeof parsed.blurRadius === 'number'
      && Number.isFinite(parsed.blurRadius)
      && parsed.blurRadius >= 0
      && parsed.blurRadius <= 300
      && typeof parsed.baseColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.baseColour)
      && typeof parsed.stripeColourA === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.stripeColourA)
      && typeof parsed.stripeColourB === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.stripeColourB)
      && typeof parsed.lineColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.lineColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedHoundstoothSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      patternSize?: unknown;
      foregroundColour?: unknown;
      backgroundColour?: unknown;
    };
    return (
      typeof parsed.patternSize === 'number'
      && Number.isFinite(parsed.patternSize)
      && parsed.patternSize >= 10
      && parsed.patternSize <= 200
      && typeof parsed.foregroundColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.foregroundColour)
      && typeof parsed.backgroundColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.backgroundColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedYagasuriSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      arrowWidth?: unknown;
      arrowHeight?: unknown;
      lineWidth?: unknown;
      staggered?: unknown;
      foregroundColour?: unknown;
      backgroundColour?: unknown;
    };
    return (
      typeof parsed.arrowWidth === 'number'
      && Number.isFinite(parsed.arrowWidth)
      && parsed.arrowWidth >= 1
      && parsed.arrowWidth <= 500
      && typeof parsed.arrowHeight === 'number'
      && Number.isFinite(parsed.arrowHeight)
      && parsed.arrowHeight >= 1
      && parsed.arrowHeight <= 500
      && typeof parsed.lineWidth === 'number'
      && Number.isFinite(parsed.lineWidth)
      && parsed.lineWidth >= 0
      && parsed.lineWidth <= 100
      && typeof parsed.staggered === 'boolean'
      && typeof parsed.foregroundColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.foregroundColour)
      && typeof parsed.backgroundColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.backgroundColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedPaperAirplaneSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      bodyLength?: unknown;
      wingWidth?: unknown;
      foldHeight?: unknown;
      gap?: unknown;
      followMotionDirection?: unknown;
      axisMode?: unknown;
      fillColour?: unknown;
    };
    return (
      typeof parsed.bodyLength === 'number'
      && Number.isFinite(parsed.bodyLength)
      && parsed.bodyLength > 0
      && parsed.bodyLength <= 2000
      && typeof parsed.wingWidth === 'number'
      && Number.isFinite(parsed.wingWidth)
      && parsed.wingWidth >= 0
      && parsed.wingWidth <= 1000
      && typeof parsed.foldHeight === 'number'
      && Number.isFinite(parsed.foldHeight)
      && parsed.foldHeight >= 0
      && parsed.foldHeight <= 1000
      && typeof parsed.gap === 'number'
      && Number.isFinite(parsed.gap)
      && parsed.gap >= 0
      && parsed.gap <= 1000
      && typeof parsed.followMotionDirection === 'boolean'
      && typeof parsed.axisMode === 'number'
      && Number.isFinite(parsed.axisMode)
      && parsed.axisMode >= 0
      && parsed.axisMode <= 1
      && typeof parsed.fillColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.fillColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedAsanohaPatternSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      patternSize?: unknown;
      lineWidth?: unknown;
      foregroundColour?: unknown;
      backgroundColour?: unknown;
    };
    return (
      typeof parsed.patternSize === 'number'
      && Number.isFinite(parsed.patternSize)
      && parsed.patternSize >= 10
      && parsed.patternSize <= 500
      && typeof parsed.lineWidth === 'number'
      && Number.isFinite(parsed.lineWidth)
      && parsed.lineWidth >= 0
      && parsed.lineWidth <= 50
      && typeof parsed.foregroundColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.foregroundColour)
      && typeof parsed.backgroundColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.backgroundColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedFocusLinesPlusSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      rayWidth?: unknown;
      gap?: unknown;
      centreRadius?: unknown;
      rotationDegrees?: unknown;
      centreX?: unknown;
      centreY?: unknown;
      centreJitterPercent?: unknown;
      seed?: unknown;
      keyframeInterval?: unknown;
      lineColour?: unknown;
    };
    return (
      typeof parsed.rayWidth === 'number'
      && Number.isFinite(parsed.rayWidth)
      && parsed.rayWidth >= 0.1
      && parsed.rayWidth <= 10
      && typeof parsed.gap === 'number'
      && Number.isFinite(parsed.gap)
      && parsed.gap >= 1
      && parsed.gap <= 20
      && typeof parsed.centreRadius === 'number'
      && Number.isFinite(parsed.centreRadius)
      && parsed.centreRadius >= 0
      && parsed.centreRadius <= 800
      && typeof parsed.rotationDegrees === 'number'
      && Number.isFinite(parsed.rotationDegrees)
      && parsed.rotationDegrees >= -720
      && parsed.rotationDegrees <= 720
      && typeof parsed.centreX === 'number'
      && Number.isFinite(parsed.centreX)
      && typeof parsed.centreY === 'number'
      && Number.isFinite(parsed.centreY)
      && typeof parsed.centreJitterPercent === 'number'
      && Number.isFinite(parsed.centreJitterPercent)
      && parsed.centreJitterPercent >= 0
      && parsed.centreJitterPercent <= 100
      && typeof parsed.seed === 'number'
      && Number.isInteger(parsed.seed)
      && typeof parsed.keyframeInterval === 'number'
      && Number.isFinite(parsed.keyframeInterval)
      && parsed.keyframeInterval >= 0
      && typeof parsed.lineColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.lineColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedRandomLineExSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      lineCount?: unknown;
      lineWidth?: unknown;
      threshold?: unknown;
      noiseCellSize?: unknown;
      widthVariance?: unknown;
      seed?: unknown;
      lineColour?: unknown;
    };
    return (
      typeof parsed.lineCount === 'number'
      && Number.isInteger(parsed.lineCount)
      && parsed.lineCount >= 1
      && parsed.lineCount <= 100
      && typeof parsed.lineWidth === 'number'
      && Number.isFinite(parsed.lineWidth)
      && parsed.lineWidth >= 0
      && parsed.lineWidth <= 2000
      && typeof parsed.threshold === 'number'
      && Number.isFinite(parsed.threshold)
      && parsed.threshold >= 0
      && parsed.threshold <= 255
      && typeof parsed.noiseCellSize === 'number'
      && Number.isFinite(parsed.noiseCellSize)
      && parsed.noiseCellSize >= 0
      && parsed.noiseCellSize <= 50
      && typeof parsed.widthVariance === 'number'
      && Number.isFinite(parsed.widthVariance)
      && parsed.widthVariance >= 0
      && parsed.widthVariance <= 2000
      && typeof parsed.seed === 'number'
      && Number.isInteger(parsed.seed)
      && typeof parsed.lineColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.lineColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedContourTraceSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      lineWidth?: unknown;
      contourCount?: unknown;
      jitterAmount?: unknown;
      traceColour?: unknown;
      backgroundOpacity?: unknown;
      seed?: unknown;
    };
    return (
      typeof parsed.lineWidth === 'number'
      && Number.isFinite(parsed.lineWidth)
      && parsed.lineWidth >= 1
      && parsed.lineWidth <= 200
      && typeof parsed.contourCount === 'number'
      && Number.isInteger(parsed.contourCount)
      && parsed.contourCount >= 1
      && parsed.contourCount <= 64
      && typeof parsed.jitterAmount === 'number'
      && Number.isFinite(parsed.jitterAmount)
      && parsed.jitterAmount >= 0
      && parsed.jitterAmount <= 100
      && typeof parsed.traceColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.traceColour)
      && typeof parsed.backgroundOpacity === 'number'
      && Number.isFinite(parsed.backgroundOpacity)
      && parsed.backgroundOpacity >= 0
      && parsed.backgroundOpacity <= 1
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
      columns?: unknown;
      rows?: unknown;
      displacementScale?: unknown;
      depthScale?: unknown;
      meshOpacity?: unknown;
      fillOpacity?: unknown;
      lineColour?: unknown;
      fillColour?: unknown;
      seed?: unknown;
    };
    return (
      typeof parsed.columns === 'number'
      && Number.isInteger(parsed.columns)
      && parsed.columns >= 1
      && parsed.columns <= 128
      && typeof parsed.rows === 'number'
      && Number.isInteger(parsed.rows)
      && parsed.rows >= 1
      && parsed.rows <= 128
      && typeof parsed.displacementScale === 'number'
      && Number.isFinite(parsed.displacementScale)
      && parsed.displacementScale >= 0
      && parsed.displacementScale <= 1000
      && typeof parsed.depthScale === 'number'
      && Number.isFinite(parsed.depthScale)
      && parsed.depthScale >= 0
      && parsed.depthScale <= 1000
      && typeof parsed.meshOpacity === 'number'
      && Number.isFinite(parsed.meshOpacity)
      && parsed.meshOpacity >= 0
      && parsed.meshOpacity <= 1
      && typeof parsed.fillOpacity === 'number'
      && Number.isFinite(parsed.fillOpacity)
      && parsed.fillOpacity >= 0
      && parsed.fillOpacity <= 1
      && typeof parsed.lineColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.lineColour)
      && typeof parsed.fillColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.fillColour)
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
      tileSize?: unknown;
      rotationDegrees?: unknown;
      gradientAngleDegrees?: unknown;
      colourMode?: unknown;
      tintColour?: unknown;
    };
    return (
      typeof parsed.tileSize === 'number'
      && Number.isInteger(parsed.tileSize)
      && parsed.tileSize >= 10
      && parsed.tileSize <= 1000
      && typeof parsed.rotationDegrees === 'number'
      && Number.isFinite(parsed.rotationDegrees)
      && parsed.rotationDegrees >= -720
      && parsed.rotationDegrees <= 720
      && typeof parsed.gradientAngleDegrees === 'number'
      && Number.isFinite(parsed.gradientAngleDegrees)
      && parsed.gradientAngleDegrees >= -720
      && parsed.gradientAngleDegrees <= 720
      && typeof parsed.colourMode === 'number'
      && Number.isInteger(parsed.colourMode)
      && parsed.colourMode >= 0
      && parsed.colourMode <= 2
      && typeof parsed.tintColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.tintColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedPlainEffectorLineSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      radius?: unknown;
      strength?: unknown;
      randomness?: unknown;
      zoom?: unknown;
      invert?: unknown;
      lineCount?: unknown;
      lineWidth?: unknown;
      colour?: unknown;
      colourAmount?: unknown;
      seed?: unknown;
    };
    return (
      typeof parsed.radius === 'number'
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
      && typeof parsed.lineCount === 'number'
      && Number.isInteger(parsed.lineCount)
      && parsed.lineCount >= 1
      && parsed.lineCount <= 128
      && typeof parsed.lineWidth === 'number'
      && Number.isFinite(parsed.lineWidth)
      && parsed.lineWidth >= 0.25
      && parsed.lineWidth <= 200
      && typeof parsed.colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.colour)
      && typeof parsed.colourAmount === 'number'
      && Number.isFinite(parsed.colourAmount)
      && parsed.colourAmount >= 0
      && parsed.colourAmount <= 1
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
      radius?: unknown;
      measuredAngleDegrees?: unknown;
      tickStepDegrees?: unknown;
      majorTickStepDegrees?: unknown;
      decimalPlaces?: unknown;
      lineColour?: unknown;
      textColour?: unknown;
      shadowColour?: unknown;
    };
    return (
      typeof parsed.radius === 'number'
      && Number.isInteger(parsed.radius)
      && parsed.radius >= 1
      && parsed.radius <= 2000
      && typeof parsed.measuredAngleDegrees === 'number'
      && Number.isFinite(parsed.measuredAngleDegrees)
      && parsed.measuredAngleDegrees >= 0
      && parsed.measuredAngleDegrees <= 180
      && typeof parsed.tickStepDegrees === 'number'
      && Number.isInteger(parsed.tickStepDegrees)
      && parsed.tickStepDegrees >= 1
      && parsed.tickStepDegrees <= 90
      && typeof parsed.majorTickStepDegrees === 'number'
      && Number.isInteger(parsed.majorTickStepDegrees)
      && parsed.majorTickStepDegrees >= 1
      && parsed.majorTickStepDegrees <= 180
      && typeof parsed.decimalPlaces === 'number'
      && Number.isInteger(parsed.decimalPlaces)
      && parsed.decimalPlaces >= 0
      && parsed.decimalPlaces <= 5
      && typeof parsed.lineColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.lineColour)
      && typeof parsed.textColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.textColour)
      && typeof parsed.shadowColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.shadowColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedShakingPolygonSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      lineWidth?: unknown;
      vertexCount?: unknown;
      fixedDiameter?: unknown;
      verticalDistortionPercent?: unknown;
      repeatCount?: unknown;
      repeatFrequency?: unknown;
      fill?: unknown;
      jitterRange?: unknown;
      jitterInterval?: unknown;
      stepped?: unknown;
      colour?: unknown;
      seed?: unknown;
    };
    return (
      typeof parsed.lineWidth === 'number'
      && Number.isInteger(parsed.lineWidth)
      && parsed.lineWidth >= 1
      && parsed.lineWidth <= 100
      && typeof parsed.vertexCount === 'number'
      && Number.isInteger(parsed.vertexCount)
      && parsed.vertexCount >= 2
      && parsed.vertexCount <= 16
      && typeof parsed.fixedDiameter === 'number'
      && Number.isInteger(parsed.fixedDiameter)
      && parsed.fixedDiameter >= 0
      && parsed.fixedDiameter <= 2000
      && typeof parsed.verticalDistortionPercent === 'number'
      && Number.isFinite(parsed.verticalDistortionPercent)
      && parsed.verticalDistortionPercent >= -100
      && parsed.verticalDistortionPercent <= 100
      && typeof parsed.repeatCount === 'number'
      && Number.isInteger(parsed.repeatCount)
      && parsed.repeatCount >= 1
      && parsed.repeatCount <= 100
      && typeof parsed.repeatFrequency === 'number'
      && Number.isInteger(parsed.repeatFrequency)
      && parsed.repeatFrequency >= 1
      && typeof parsed.fill === 'boolean'
      && typeof parsed.jitterRange === 'number'
      && Number.isFinite(parsed.jitterRange)
      && parsed.jitterRange >= 0
      && parsed.jitterRange <= 2000
      && typeof parsed.jitterInterval === 'number'
      && Number.isInteger(parsed.jitterInterval)
      && parsed.jitterInterval >= 1
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
      gridDivisions?: unknown;
      lineWidth?: unknown;
      curvePoints?: unknown;
      curveColour?: unknown;
      gridColour?: unknown;
      backgroundColour?: unknown;
    };
    return (
      typeof parsed.gridDivisions === 'number'
      && Number.isInteger(parsed.gridDivisions)
      && parsed.gridDivisions >= 1
      && parsed.gridDivisions <= 16
      && typeof parsed.lineWidth === 'number'
      && Number.isInteger(parsed.lineWidth)
      && parsed.lineWidth >= 1
      && parsed.lineWidth <= 100
      && Array.isArray(parsed.curvePoints)
      && parsed.curvePoints.length >= 2
      && parsed.curvePoints.length <= 64
      && parsed.curvePoints.every((point) => typeof point === 'number' && Number.isFinite(point) && point >= 0 && point <= 1)
      && typeof parsed.curveColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.curveColour)
      && typeof parsed.gridColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.gridColour)
      && typeof parsed.backgroundColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.backgroundColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedHksyCheckerGridSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      pattern?: unknown;
      cellSize?: unknown;
      lineWidth?: unknown;
      checkerEnabled?: unknown;
      gridEnabled?: unknown;
      foregroundColour?: unknown;
      secondaryColour?: unknown;
      backgroundColour?: unknown;
      paletteColours?: unknown;
      separateInterval?: unknown;
      separateLineWidth?: unknown;
      anchorPoints?: unknown;
      roundCaps?: unknown;
      maxJoinDistance?: unknown;
    };
    const paletteColoursSupported = parsed.paletteColours === undefined || (
      Array.isArray(parsed.paletteColours)
      && parsed.paletteColours.length >= 2
      && parsed.paletteColours.length <= 16
      && parsed.paletteColours.every((colour) => (
        typeof colour === 'string'
        && /^#[0-9a-f]{6}$/i.test(colour)
      ))
    );
    const measuredGridFieldsSupported = parsed.pattern !== 'measured-grid' || (
      typeof parsed.separateInterval === 'number'
      && Number.isFinite(parsed.separateInterval)
      && parsed.separateInterval >= 1
      && parsed.separateInterval <= 1000
      && typeof parsed.separateLineWidth === 'number'
      && Number.isFinite(parsed.separateLineWidth)
      && parsed.separateLineWidth >= 0
      && parsed.separateLineWidth <= 100
    );
    const anchorLineFieldsSupported = parsed.pattern !== 'anchor-line' || (
      Array.isArray(parsed.anchorPoints)
      && parsed.anchorPoints.length >= 2
      && parsed.anchorPoints.length <= 16
      && parsed.anchorPoints.every((point) => (
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
      && typeof parsed.roundCaps === 'boolean'
      && typeof parsed.maxJoinDistance === 'number'
      && Number.isFinite(parsed.maxJoinDistance)
      && parsed.maxJoinDistance >= 0
      && parsed.maxJoinDistance <= 300
    );
    return (
      (parsed.pattern === undefined || parsed.pattern === 'checker-grid' || parsed.pattern === 'diamond' || parsed.pattern === 'measured-grid' || parsed.pattern === 'anchor-line')
      && typeof parsed.cellSize === 'number'
      && Number.isFinite(parsed.cellSize)
      && parsed.cellSize >= 1
      && parsed.cellSize <= 1000
      && typeof parsed.lineWidth === 'number'
      && Number.isFinite(parsed.lineWidth)
      && parsed.lineWidth >= 0
      && parsed.lineWidth <= 100
      && typeof parsed.checkerEnabled === 'boolean'
      && typeof parsed.gridEnabled === 'boolean'
      && typeof parsed.foregroundColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.foregroundColour)
      && typeof parsed.secondaryColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.secondaryColour)
      && typeof parsed.backgroundColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.backgroundColour)
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
      lineWidth?: unknown;
      shape?: unknown;
      cornerCut?: unknown;
      extraWidth?: unknown;
      extraHeight?: unknown;
      backgroundOpacity?: unknown;
      frameColour?: unknown;
      backgroundColour?: unknown;
    };
    return (
      typeof parsed.lineWidth === 'number'
      && Number.isFinite(parsed.lineWidth)
      && parsed.lineWidth >= 0
      && parsed.lineWidth <= 5000
      && (parsed.shape === undefined || parsed.shape === 'rectangle' || parsed.shape === 'ellipse' || parsed.shape === 'cut_corner')
      && (parsed.shape !== 'cut_corner' || (typeof parsed.cornerCut === 'number' && Number.isFinite(parsed.cornerCut) && parsed.cornerCut >= 0 && parsed.cornerCut <= 5000))
      && typeof parsed.extraWidth === 'number'
      && Number.isFinite(parsed.extraWidth)
      && parsed.extraWidth >= -5000
      && parsed.extraWidth <= 5000
      && typeof parsed.extraHeight === 'number'
      && Number.isFinite(parsed.extraHeight)
      && parsed.extraHeight >= -5000
      && parsed.extraHeight <= 5000
      && typeof parsed.backgroundOpacity === 'number'
      && Number.isFinite(parsed.backgroundOpacity)
      && parsed.backgroundOpacity >= 0
      && parsed.backgroundOpacity <= 1
      && typeof parsed.frameColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.frameColour)
      && typeof parsed.backgroundColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.backgroundColour)
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedSimpleTubeSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      radius?: unknown;
      depth?: unknown;
      segments?: unknown;
      rings?: unknown;
      twistDegrees?: unknown;
      randomAmount?: unknown;
      strokeWidth?: unknown;
      colour?: unknown;
      secondaryColour?: unknown;
      colourPattern?: unknown;
      fogStrength?: unknown;
      fogColour?: unknown;
      seed?: unknown;
      torus?: unknown;
    };
    return (
      typeof parsed.radius === 'number'
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
      && typeof parsed.twistDegrees === 'number'
      && Number.isFinite(parsed.twistDegrees)
      && parsed.twistDegrees >= -1800
      && parsed.twistDegrees <= 1800
      && typeof parsed.randomAmount === 'number'
      && Number.isFinite(parsed.randomAmount)
      && parsed.randomAmount >= -300
      && parsed.randomAmount <= 300
      && typeof parsed.strokeWidth === 'number'
      && Number.isFinite(parsed.strokeWidth)
      && parsed.strokeWidth >= 0
      && parsed.strokeWidth <= 200
      && typeof parsed.colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.colour)
      && typeof parsed.secondaryColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.secondaryColour)
      && (parsed.colourPattern === undefined || parsed.colourPattern === 'single' || parsed.colourPattern === 'ring' || parsed.colourPattern === 'depth')
      && (parsed.fogStrength === undefined || (typeof parsed.fogStrength === 'number' && Number.isFinite(parsed.fogStrength) && parsed.fogStrength >= 0 && parsed.fogStrength <= 1))
      && (parsed.fogColour === undefined || (typeof parsed.fogColour === 'string' && /^#[0-9a-f]{6}$/i.test(parsed.fogColour)))
      && typeof parsed.seed === 'number'
      && Number.isFinite(parsed.seed)
      && typeof parsed.torus === 'boolean'
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedSphereDotsSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      radius?: unknown;
      columns?: unknown;
      rows?: unknown;
      rotationDegrees?: unknown;
      offsetDegrees?: unknown;
      luminanceInfluence?: unknown;
      pointSize?: unknown;
      latitudeLineWidth?: unknown;
      colour?: unknown;
      secondaryColour?: unknown;
      seed?: unknown;
      planeMode?: unknown;
    };
    return (
      typeof parsed.radius === 'number'
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
      && typeof parsed.rotationDegrees === 'number'
      && Number.isFinite(parsed.rotationDegrees)
      && parsed.rotationDegrees >= -1000
      && parsed.rotationDegrees <= 1000
      && typeof parsed.offsetDegrees === 'number'
      && Number.isFinite(parsed.offsetDegrees)
      && parsed.offsetDegrees >= -360
      && parsed.offsetDegrees <= 360
      && typeof parsed.luminanceInfluence === 'number'
      && Number.isFinite(parsed.luminanceInfluence)
      && parsed.luminanceInfluence >= -5000
      && parsed.luminanceInfluence <= 5000
      && typeof parsed.pointSize === 'number'
      && Number.isFinite(parsed.pointSize)
      && parsed.pointSize >= 0
      && parsed.pointSize <= 200
      && typeof parsed.latitudeLineWidth === 'number'
      && Number.isFinite(parsed.latitudeLineWidth)
      && parsed.latitudeLineWidth >= 0
      && parsed.latitudeLineWidth <= 100
      && typeof parsed.colour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.colour)
      && typeof parsed.secondaryColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.secondaryColour)
      && typeof parsed.seed === 'number'
      && Number.isFinite(parsed.seed)
      && typeof parsed.planeMode === 'boolean'
    );
  } catch {
    return false;
  }
};

const isSharedRendererNativeGeneratedSphericalFieldSourceSupported = (source: string): boolean => {
  try {
    const parsed = JSON.parse(source) as {
      radius?: unknown;
      strength?: unknown;
      colourAmount?: unknown;
      alphaAmount?: unknown;
      lineWidth?: unknown;
      ringCount?: unknown;
      vectorCount?: unknown;
      fieldColour?: unknown;
      secondaryColour?: unknown;
      backgroundOpacity?: unknown;
      container?: unknown;
      seed?: unknown;
    };
    return (
      typeof parsed.radius === 'number'
      && Number.isFinite(parsed.radius)
      && parsed.radius >= 0
      && parsed.radius <= 5000
      && typeof parsed.strength === 'number'
      && Number.isFinite(parsed.strength)
      && parsed.strength >= -200
      && parsed.strength <= 200
      && typeof parsed.colourAmount === 'number'
      && Number.isFinite(parsed.colourAmount)
      && parsed.colourAmount >= -100
      && parsed.colourAmount <= 100
      && typeof parsed.alphaAmount === 'number'
      && Number.isFinite(parsed.alphaAmount)
      && parsed.alphaAmount >= -100
      && parsed.alphaAmount <= 100
      && typeof parsed.lineWidth === 'number'
      && Number.isFinite(parsed.lineWidth)
      && parsed.lineWidth >= 0
      && parsed.lineWidth <= 100
      && typeof parsed.ringCount === 'number'
      && Number.isInteger(parsed.ringCount)
      && parsed.ringCount >= 1
      && parsed.ringCount <= 64
      && typeof parsed.vectorCount === 'number'
      && Number.isInteger(parsed.vectorCount)
      && parsed.vectorCount >= 0
      && parsed.vectorCount <= 256
      && typeof parsed.fieldColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.fieldColour)
      && typeof parsed.secondaryColour === 'string'
      && /^#[0-9a-f]{6}$/i.test(parsed.secondaryColour)
      && typeof parsed.backgroundOpacity === 'number'
      && Number.isFinite(parsed.backgroundOpacity)
      && parsed.backgroundOpacity >= 0
      && parsed.backgroundOpacity <= 1
      && typeof parsed.container === 'boolean'
      && typeof parsed.seed === 'number'
      && Number.isFinite(parsed.seed)
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
