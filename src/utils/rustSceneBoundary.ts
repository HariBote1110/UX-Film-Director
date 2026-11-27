import type {
  RustSceneSnapshotBoundaryIssue,
  RustSceneSnapshotBoundaryIssueCode,
  RustSceneSnapshotBoundaryPayload,
  RustSceneSnapshotBoundaryValidation,
} from './rustSceneContract';

export const validateRustSceneSnapshotBoundary = ({
  snapshot,
  media,
}: RustSceneSnapshotBoundaryPayload): RustSceneSnapshotBoundaryValidation => {
  const issues: RustSceneSnapshotBoundaryIssue[] = [];
  validateSnapshot(snapshot, issues);
  validateMediaReferences(media, snapshot, issues);

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
};

const validateSnapshot = (
  snapshot: unknown,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!isRecord(snapshot)) {
    addIssue(issues, 'schemaMismatch', 'snapshot', 'SceneSnapshot must be a JSON object.');
    return;
  }

  validateKnownKeys(snapshot, 'snapshot', ['frame_index', 'colour', 'clips'], issues);
  validateInteger(snapshot.frame_index, 'snapshot.frame_index', issues);
  validateColourPipeline(snapshot.colour, 'snapshot.colour', issues);

  if (!Array.isArray(snapshot.clips)) {
    addIssue(issues, 'schemaMismatch', 'snapshot.clips', 'clips must be an array.');
    return;
  }

  snapshot.clips.forEach((clip, index) => {
    validateClip(clip, `snapshot.clips[${index}]`, issues);
  });
};

const validateColourPipeline = (
  colour: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!isRecord(colour)) {
    addIssue(issues, 'schemaMismatch', path, 'colour must be a JSON object.');
    return;
  }

  validateKnownKeys(colour, path, ['profile', 'working_space', 'alpha'], issues);
  validateEnum(colour.profile, `${path}.profile`, ['rec709-sdr'], issues);
  validateEnum(colour.working_space, `${path}.working_space`, ['linear-light'], issues);
  validateEnum(colour.alpha, `${path}.alpha`, ['premultiplied'], issues);
};

const validateClip = (
  clip: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!isRecord(clip)) {
    addIssue(issues, 'schemaMismatch', path, 'clip must be a JSON object.');
    return;
  }

  validateKnownKeys(
    clip,
    path,
    ['clip_id', 'track_id', 'media_id', 'source_frame', 'z_index', 'transform', 'opacity', 'effects'],
    issues
  );
  validateString(clip.clip_id, `${path}.clip_id`, issues);
  validateString(clip.track_id, `${path}.track_id`, issues);
  validateString(clip.media_id, `${path}.media_id`, issues);
  validateInteger(clip.source_frame, `${path}.source_frame`, issues);
  validateInteger(clip.z_index, `${path}.z_index`, issues);
  validateTransform(clip.transform, `${path}.transform`, issues);
  validateUnitInterval(clip.opacity, `${path}.opacity`, issues);
  validateEffects(clip.effects, `${path}.effects`, issues);
};

const validateTransform = (
  transform: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!isRecord(transform)) {
    addIssue(issues, 'schemaMismatch', path, 'transform must be a JSON object.');
    return;
  }

  validateKnownKeys(
    transform,
    path,
    ['translation_x', 'translation_y', 'scale_x', 'scale_y', 'rotation_degrees', 'sampling'],
    issues
  );
  validateFiniteNumber(transform.translation_x, `${path}.translation_x`, issues);
  validateFiniteNumber(transform.translation_y, `${path}.translation_y`, issues);
  validateFiniteNumber(transform.scale_x, `${path}.scale_x`, issues);
  validateFiniteNumber(transform.scale_y, `${path}.scale_y`, issues);
  validateFiniteNumber(transform.rotation_degrees, `${path}.rotation_degrees`, issues);
  validateEnum(transform.sampling, `${path}.sampling`, ['nearest', 'bilinear'], issues);
};

const validateEffects = (
  effects: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!Array.isArray(effects)) {
    addIssue(issues, 'schemaMismatch', path, 'effects must be an array.');
    return;
  }

  effects.forEach((effect, index) => {
    const effectPath = `${path}[${index}]`;
    if (!isRecord(effect) || Object.keys(effect).length !== 1) {
      addIssue(issues, 'schemaMismatch', effectPath, 'Only known Rust effects are supported at the Rust boundary.');
      return;
    }
    if (isRecord(effect.LinearGain)) {
      validateFiniteNumber(effect.LinearGain.gain, `${effectPath}.LinearGain.gain`, issues);
      return;
    }
    if (isRecord(effect.ColourAberration)) {
      validateFiniteNumber(effect.ColourAberration.offset_x, `${effectPath}.ColourAberration.offset_x`, issues);
      validateFiniteNumber(effect.ColourAberration.offset_y, `${effectPath}.ColourAberration.offset_y`, issues);
      return;
    }
    if (isRecord(effect.Outline)) {
      validateNumberArray(effect.Outline.colour, `${effectPath}.Outline.colour`, 3, issues);
      validateFiniteNumber(effect.Outline.thickness, `${effectPath}.Outline.thickness`, issues);
      validateUnitInterval(effect.Outline.opacity, `${effectPath}.Outline.opacity`, issues);
      return;
    }
    if (isRecord(effect.Wipe)) {
      validateEnum(effect.Wipe.edge, `${effectPath}.Wipe.edge`, ['left', 'right', 'top', 'bottom'], issues);
      validateUnitInterval(effect.Wipe.progress, `${effectPath}.Wipe.progress`, issues);
      return;
    }
    if (isRecord(effect.Clipping)) {
      validateFiniteNumber(effect.Clipping.top, `${effectPath}.Clipping.top`, issues);
      validateFiniteNumber(effect.Clipping.bottom, `${effectPath}.Clipping.bottom`, issues);
      validateFiniteNumber(effect.Clipping.left, `${effectPath}.Clipping.left`, issues);
      validateFiniteNumber(effect.Clipping.right, `${effectPath}.Clipping.right`, issues);
      validateFiniteNumber(effect.Clipping.angle_degrees, `${effectPath}.Clipping.angle_degrees`, issues);
      return;
    }
    if (isRecord(effect.SpotLight)) {
      validateUnitInterval(effect.SpotLight.centre_x, `${effectPath}.SpotLight.centre_x`, issues);
      validateUnitInterval(effect.SpotLight.centre_y, `${effectPath}.SpotLight.centre_y`, issues);
      validateFiniteNumber(effect.SpotLight.radius, `${effectPath}.SpotLight.radius`, issues);
      validateFiniteNumber(effect.SpotLight.intensity, `${effectPath}.SpotLight.intensity`, issues);
      validateNumberArray(effect.SpotLight.colour, `${effectPath}.SpotLight.colour`, 3, issues);
      return;
    }
    if (isRecord(effect.DisplacementMap)) {
      validateFiniteNumber(effect.DisplacementMap.amount_x, `${effectPath}.DisplacementMap.amount_x`, issues);
      validateFiniteNumber(effect.DisplacementMap.amount_y, `${effectPath}.DisplacementMap.amount_y`, issues);
      validateFiniteNumber(effect.DisplacementMap.size, `${effectPath}.DisplacementMap.size`, issues);
      validateUnitInterval(effect.DisplacementMap.strength, `${effectPath}.DisplacementMap.strength`, issues);
      return;
    }
    if (isRecord(effect.FakeDof)) {
      validateUnitInterval(effect.FakeDof.focus_x, `${effectPath}.FakeDof.focus_x`, issues);
      validateUnitInterval(effect.FakeDof.focus_y, `${effectPath}.FakeDof.focus_y`, issues);
      validateFiniteNumber(effect.FakeDof.focus_radius, `${effectPath}.FakeDof.focus_radius`, issues);
      validateFiniteNumber(effect.FakeDof.blur, `${effectPath}.FakeDof.blur`, issues);
      validateUnitInterval(effect.FakeDof.strength, `${effectPath}.FakeDof.strength`, issues);
      return;
    }
    if (isRecord(effect.AutoBlur)) {
      validateFiniteNumber(effect.AutoBlur.angle_degrees, `${effectPath}.AutoBlur.angle_degrees`, issues);
      validateFiniteNumber(effect.AutoBlur.radius, `${effectPath}.AutoBlur.radius`, issues);
      validateUnitInterval(effect.AutoBlur.strength, `${effectPath}.AutoBlur.strength`, issues);
      validateUnitInterval(effect.AutoBlur.colour_shift, `${effectPath}.AutoBlur.colour_shift`, issues);
      return;
    }
    if (isRecord(effect.Stretch)) {
      validateFiniteNumber(effect.Stretch.angle_degrees, `${effectPath}.Stretch.angle_degrees`, issues);
      validateFiniteNumber(effect.Stretch.amount, `${effectPath}.Stretch.amount`, issues);
      validateUnitInterval(effect.Stretch.strength, `${effectPath}.Stretch.strength`, issues);
      return;
    }
    if (isRecord(effect.MultiSlicer)) {
      validateFiniteNumber(effect.MultiSlicer.angle_degrees, `${effectPath}.MultiSlicer.angle_degrees`, issues);
      validateFiniteNumber(effect.MultiSlicer.offset, `${effectPath}.MultiSlicer.offset`, issues);
      validateFiniteNumber(effect.MultiSlicer.slices, `${effectPath}.MultiSlicer.slices`, issues);
      validateFiniteNumber(effect.MultiSlicer.expansion, `${effectPath}.MultiSlicer.expansion`, issues);
      validateUnitInterval(effect.MultiSlicer.strength, `${effectPath}.MultiSlicer.strength`, issues);
      return;
    }
    if (isRecord(effect.OctTransform)) {
      validateFiniteNumber(effect.OctTransform.scale, `${effectPath}.OctTransform.scale`, issues);
      validateFiniteNumber(effect.OctTransform.rotation_degrees, `${effectPath}.OctTransform.rotation_degrees`, issues);
      validateFiniteNumber(effect.OctTransform.vertex_count, `${effectPath}.OctTransform.vertex_count`, issues);
      validateFiniteNumber(effect.OctTransform.warp, `${effectPath}.OctTransform.warp`, issues);
      validateUnitInterval(effect.OctTransform.strength, `${effectPath}.OctTransform.strength`, issues);
      return;
    }
    if (isRecord(effect.AreaExpand)) {
      validateFiniteNumber(effect.AreaExpand.top, `${effectPath}.AreaExpand.top`, issues);
      validateFiniteNumber(effect.AreaExpand.bottom, `${effectPath}.AreaExpand.bottom`, issues);
      validateFiniteNumber(effect.AreaExpand.left, `${effectPath}.AreaExpand.left`, issues);
      validateFiniteNumber(effect.AreaExpand.right, `${effectPath}.AreaExpand.right`, issues);
      if (typeof effect.AreaExpand.fill !== 'boolean') {
        addIssue(issues, 'schemaMismatch', `${effectPath}.AreaExpand.fill`, 'fill must be a boolean.');
      }
      return;
    }
    if (isRecord(effect.ColourCorrection)) {
      validateFiniteNumber(effect.ColourCorrection.brightness, `${effectPath}.ColourCorrection.brightness`, issues);
      validateFiniteNumber(effect.ColourCorrection.contrast, `${effectPath}.ColourCorrection.contrast`, issues);
      validateFiniteNumber(effect.ColourCorrection.saturation, `${effectPath}.ColourCorrection.saturation`, issues);
      validateFiniteNumber(effect.ColourCorrection.hue_degrees, `${effectPath}.ColourCorrection.hue_degrees`, issues);
      return;
    }
    if (isRecord(effect.Blur)) {
      validateFiniteNumber(effect.Blur.radius, `${effectPath}.Blur.radius`, issues);
      validateUnitInterval(effect.Blur.strength, `${effectPath}.Blur.strength`, issues);
      return;
    }
    if (isRecord(effect.DropShadow)) {
      validateNumberArray(effect.DropShadow.colour, `${effectPath}.DropShadow.colour`, 3, issues);
      validateFiniteNumber(effect.DropShadow.offset_x, `${effectPath}.DropShadow.offset_x`, issues);
      validateFiniteNumber(effect.DropShadow.offset_y, `${effectPath}.DropShadow.offset_y`, issues);
      validateUnitInterval(effect.DropShadow.opacity, `${effectPath}.DropShadow.opacity`, issues);
      return;
    }
    if (isRecord(effect.GradientOverlay)) {
      validateFiniteNumber(effect.GradientOverlay.direction_degrees, `${effectPath}.GradientOverlay.direction_degrees`, issues);
      validateUnitInterval(effect.GradientOverlay.stop_a, `${effectPath}.GradientOverlay.stop_a`, issues);
      validateUnitInterval(effect.GradientOverlay.stop_b, `${effectPath}.GradientOverlay.stop_b`, issues);
      if (typeof effect.GradientOverlay.is_radial !== 'boolean') {
        addIssue(issues, 'schemaMismatch', `${effectPath}.GradientOverlay.is_radial`, 'is_radial must be a boolean.');
      }
      validateNumberArray(effect.GradientOverlay.colour_a, `${effectPath}.GradientOverlay.colour_a`, 4, issues);
      validateNumberArray(effect.GradientOverlay.colour_b, `${effectPath}.GradientOverlay.colour_b`, 4, issues);
      validateFiniteNumber(effect.GradientOverlay.bounds_x, `${effectPath}.GradientOverlay.bounds_x`, issues);
      validateFiniteNumber(effect.GradientOverlay.bounds_y, `${effectPath}.GradientOverlay.bounds_y`, issues);
      validateFiniteNumber(effect.GradientOverlay.bounds_width, `${effectPath}.GradientOverlay.bounds_width`, issues);
      validateFiniteNumber(effect.GradientOverlay.bounds_height, `${effectPath}.GradientOverlay.bounds_height`, issues);
      return;
    }
    addIssue(issues, 'schemaMismatch', effectPath, 'Unknown Rust effect.');
  });
};

const validateMediaReferences = (
  media: unknown,
  snapshot: unknown,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!Array.isArray(media)) {
    addIssue(issues, 'schemaMismatch', 'media', 'media must be an array.');
    return;
  }

  const mediaIds = new Set<string>();
  const mediaIndexById = new Map<string, number>();
  media.forEach((reference, index) => {
    const path = `media[${index}]`;
    if (!isRecord(reference)) {
      addIssue(issues, 'schemaMismatch', path, 'media reference must be a JSON object.');
      return;
    }
    validateKnownKeys(reference, path, ['id', 'kind', 'source', 'width', 'height', 'source_rate', 'active_layer_ids'], issues);
    validateString(reference.id, `${path}.id`, issues);
    validateEnum(reference.kind, `${path}.kind`, ['Image', 'Video', 'SolidColour', 'GeneratedGradient', 'GeneratedAudioWaveform', 'GeneratedAudioSphere', 'GeneratedParticle', 'GeneratedBarcode', 'GeneratedPuzzlePiece', 'GeneratedColourWheel', 'GeneratedGourd', 'GeneratedGear', 'GeneratedTrackBar', 'GeneratedPieChart', 'GeneratedHistogram', 'GeneratedToneCurve', 'GeneratedGetColorDots', 'GeneratedHksyCheckerGrid', 'GeneratedRegionFrame', 'GeneratedSimpleTube', 'GeneratedSphereDots', 'GeneratedSphericalField', 'GeneratedSunburst', 'GeneratedCircularArrow', 'GeneratedTriangleBracket', 'GeneratedTartanCheck', 'GeneratedHoundstooth', 'GeneratedYagasuri', 'GeneratedPaperAirplane', 'GeneratedAsanohaPattern', 'GeneratedFocusLinesPlus', 'GeneratedRandomLineEx', 'GeneratedContourTrace', 'GeneratedDisplacementPoly', 'GeneratedPlainEffectorLine', 'GeneratedHologram', 'GeneratedProtractor', 'GeneratedShakingPolygon', 'GeneratedShatteredSphere', 'GeneratedShape', 'Psd', 'Text'], issues);
    validateString(reference.source, `${path}.source`, issues);
    validatePositiveInteger(reference.width, `${path}.width`, issues);
    validatePositiveInteger(reference.height, `${path}.height`, issues);
    if (reference.source_rate !== undefined) {
      validateFrameRate(reference.source_rate, `${path}.source_rate`, issues);
    }
    if (reference.active_layer_ids !== undefined) {
      validateStringArray(reference.active_layer_ids, `${path}.active_layer_ids`, issues);
    }
    if (typeof reference.id === 'string' && reference.id.trim() !== '') {
      if (mediaIds.has(reference.id)) {
        addIssue(issues, 'mediaMismatch', `${path}.id`, `Duplicate media reference '${reference.id}'.`);
      }
      mediaIds.add(reference.id);
      mediaIndexById.set(reference.id, index);
    }
  });

  if (!isRecord(snapshot) || !Array.isArray(snapshot.clips)) return;
  const referencedMediaIds = new Set<string>();
  snapshot.clips.forEach((clip, index) => {
    if (!isRecord(clip) || typeof clip.media_id !== 'string') return;
    referencedMediaIds.add(clip.media_id);
    if (!mediaIds.has(clip.media_id)) {
      addIssue(
        issues,
        'mediaMismatch',
        `snapshot.clips[${index}].media_id`,
        `No media reference exists for '${clip.media_id}'.`
      );
    }
  });

  mediaIndexById.forEach((index, mediaId) => {
    if (!referencedMediaIds.has(mediaId)) {
      addIssue(issues, 'mediaMismatch', `media[${index}].id`, `Media reference '${mediaId}' is not used by any clip.`);
    }
  });
};

const validateStringArray = (
  value: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!Array.isArray(value)) {
    addIssue(issues, 'schemaMismatch', path, 'Expected an array of strings.');
    return;
  }
  value.forEach((item, index) => validateString(item, `${path}[${index}]`, issues));
};

const validateNumberArray = (
  value: unknown,
  path: string,
  expectedLength: number,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!Array.isArray(value)) {
    addIssue(issues, 'schemaMismatch', path, 'Expected an array of numbers.');
    return;
  }
  if (value.length !== expectedLength) {
    addIssue(issues, 'schemaMismatch', path, `Expected ${expectedLength} numbers.`);
    return;
  }
  value.forEach((item, index) => validateFiniteNumber(item, `${path}[${index}]`, issues));
};

const validateFrameRate = (
  frameRate: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!isRecord(frameRate)) {
    addIssue(issues, 'schemaMismatch', path, 'source_rate must be a JSON object when provided.');
    return;
  }
  validateKnownKeys(frameRate, path, ['numerator', 'denominator'], issues);
  validatePositiveInteger(frameRate.numerator, `${path}.numerator`, issues);
  validatePositiveInteger(frameRate.denominator, `${path}.denominator`, issues);
};

const validateString = (
  value: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (typeof value !== 'string' || value.trim() === '') {
    addIssue(issues, 'schemaMismatch', path, 'Expected a non-empty string.');
  }
};

const validateInteger = (
  value: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (typeof value !== 'number') {
    addIssue(issues, 'schemaMismatch', path, 'Expected a number.');
    return;
  }
  if (!Number.isFinite(value)) {
    addIssue(issues, 'nonFiniteNumber', path, 'Expected a finite number.');
    return;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    addIssue(issues, 'unsafeInteger', path, 'Expected a non-negative safe integer.');
  }
};

const validatePositiveInteger = (
  value: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  const issueCount = issues.length;
  validateInteger(value, path, issues);
  if (issues.length !== issueCount || typeof value !== 'number') return;
  if (value <= 0) {
    addIssue(issues, 'outOfRange', path, 'Expected a positive integer.');
  }
};

const validateFiniteNumber = (
  value: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (typeof value !== 'number') {
    addIssue(issues, 'schemaMismatch', path, 'Expected a number.');
    return;
  }
  if (!Number.isFinite(value)) {
    addIssue(issues, 'nonFiniteNumber', path, 'Expected a finite number.');
  }
};

const validateUnitInterval = (
  value: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  const issueCount = issues.length;
  validateFiniteNumber(value, path, issues);
  if (issues.length !== issueCount || typeof value !== 'number') return;
  if (value < 0 || value > 1) {
    addIssue(issues, 'outOfRange', path, 'Expected a value in the 0..1 range.');
  }
};

const validateEnum = (
  value: unknown,
  path: string,
  allowed: readonly string[],
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (typeof value !== 'string') {
    addIssue(issues, 'schemaMismatch', path, `Expected one of: ${allowed.join(', ')}.`);
    return;
  }
  if (!allowed.includes(value)) {
    addIssue(issues, 'unsupportedEnum', path, `Unsupported value '${value}'.`);
  }
};

const validateKnownKeys = (
  record: Record<string, unknown>,
  path: string,
  allowedKeys: readonly string[],
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  const allowed = new Set(allowedKeys);
  Object.keys(record).forEach((key) => {
    if (!allowed.has(key)) {
      addIssue(issues, 'schemaMismatch', `${path}.${key}`, `Unexpected field '${key}'.`);
    }
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const addIssue = (
  issues: RustSceneSnapshotBoundaryIssue[],
  code: RustSceneSnapshotBoundaryIssueCode,
  path: string,
  detail: string
) => {
  issues.push({ code, path, detail });
};
