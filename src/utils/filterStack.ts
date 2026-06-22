import {
  TimelineObject,
  FilterType,
  ObjectFilter,
  ColorCorrection,
  ClippingParams,
  Vibration,
  ShadowEffect,
  GradientFill,
  SpotLightFilterParams,
  DisplacementMapFilterParams,
  FakeDofFilterParams,
  AutoBlurFilterParams
} from '../types';

const DEFAULT_COLOR_CORRECTION: Omit<ColorCorrection, 'enabled'> = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0
};

const DEFAULT_COLOUR_ABERRATION = {
  offsetX: 3,
  offsetY: 0
};

const DEFAULT_OUTLINE = {
  colour: '#000000',
  thickness: 3,
  opacity: 0.85
};

const DEFAULT_CLIPPING: Omit<ClippingParams, 'enabled'> = {
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
  angle: 0,
  radius: 0
};

const DEFAULT_VIBRATION: Omit<Vibration, 'enabled'> = {
  strength: 0,
  speed: 1
};

const DEFAULT_SHADOW: Omit<ShadowEffect, 'enabled'> = {
  colour: '#000000',
  blur: 4,
  offsetX: 2,
  offsetY: 2,
  opacity: 0.5
};

const DEFAULT_GRADIENT: Omit<GradientFill, 'enabled'> = {
  type: 'linear',
  colours: ['#ffffff', '#000000'],
  stops: [0, 1],
  direction: 0
};

const DEFAULT_BLUR = {
  strength: 4,
  quality: 3
};

const DEFAULT_FADE = {
  opacity: 1
};

const DEFAULT_WIPE = {
  edge: 'left' as const,
  reverse: false
};

const DEFAULT_SPOT_LIGHT: SpotLightFilterParams = {
  centreX: 0.5,
  centreY: 0.5,
  radius: 0.65,
  intensity: 0.75,
  colour: '#fff4c2'
};

const DEFAULT_DISPLACEMENT_MAP: DisplacementMapFilterParams = {
  amountX: 24,
  amountY: 12,
  size: 128,
  strength: 1
};

const DEFAULT_FAKE_DOF: FakeDofFilterParams = {
  focusX: 0.5,
  focusY: 0.5,
  focusRadius: 0.25,
  blur: 8,
  strength: 1
};

const DEFAULT_AUTO_BLUR: AutoBlurFilterParams = {
  blur: 10,
  speed: 1,
  strength: 1,
  colourShift: 0
};

const createFilterId = (type: FilterType): string => {
  return `${type}-${crypto.randomUUID()}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object';
};

const toNumber = (value: unknown, fallback: number): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const toBoolean = (value: unknown, fallback: boolean): boolean => {
  return typeof value === 'boolean' ? value : fallback;
};

const isFilterType = (value: unknown): value is FilterType => {
  return value === 'color_correction'
    || value === 'colour_aberration'
    || value === 'outline'
    || value === 'clipping'
    || value === 'vibration'
    || value === 'shadow'
    || value === 'gradient'
    || value === 'blur'
    || value === 'fade'
    || value === 'wipe'
    || value === 'spot_light'
    || value === 'displacement_map'
    || value === 'fake_dof'
    || value === 'auto_blur';
};

const normaliseOutlineParams = (params: unknown): import('../types').OutlineFilterParams => {
  const source = isRecord(params) ? params : {};
  return {
    colour: typeof source.colour === 'string' && source.colour.trim() !== ''
      ? source.colour
      : DEFAULT_OUTLINE.colour,
    thickness: Math.max(0, toNumber(source.thickness, DEFAULT_OUTLINE.thickness)),
    opacity: Math.max(0, Math.min(1, toNumber(source.opacity, DEFAULT_OUTLINE.opacity)))
  };
};

const normaliseColourAberrationParams = (params: unknown): import('../types').ColourAberrationFilterParams => {
  const source = isRecord(params) ? params : {};
  return {
    offsetX: Math.max(0, toNumber(source.offsetX, DEFAULT_COLOUR_ABERRATION.offsetX)),
    offsetY: Math.max(0, toNumber(source.offsetY, DEFAULT_COLOUR_ABERRATION.offsetY))
  };
};

const normaliseBlurParams = (params: unknown): import('../types').BlurFilterParams => {
  const source = isRecord(params) ? params : {};
  return {
    strength: Math.max(0, toNumber(source.strength, DEFAULT_BLUR.strength)),
    quality: Math.max(1, Math.min(4, Math.round(toNumber(source.quality, DEFAULT_BLUR.quality))))
  };
};

const normaliseFadeParams = (params: unknown): import('../types').FadeFilterParams => {
  const source = isRecord(params) ? params : {};
  return {
    opacity: Math.max(0, Math.min(1, toNumber(source.opacity, DEFAULT_FADE.opacity)))
  };
};

const isWipeEdge = (value: unknown): value is import('../types').WipeEdge => {
  return value === 'left' || value === 'right' || value === 'top' || value === 'bottom';
};

const normaliseWipeParams = (params: unknown): import('../types').WipeFilterParams => {
  const source = isRecord(params) ? params : {};
  return {
    edge: isWipeEdge(source.edge) ? source.edge : DEFAULT_WIPE.edge,
    reverse: toBoolean(source.reverse, DEFAULT_WIPE.reverse)
  };
};

const normaliseSpotLightParams = (params: unknown): SpotLightFilterParams => {
  const source = isRecord(params) ? params : {};
  return {
    centreX: Math.max(0, Math.min(1, toNumber(source.centreX, DEFAULT_SPOT_LIGHT.centreX))),
    centreY: Math.max(0, Math.min(1, toNumber(source.centreY, DEFAULT_SPOT_LIGHT.centreY))),
    radius: Math.max(0, toNumber(source.radius, DEFAULT_SPOT_LIGHT.radius)),
    intensity: Math.max(0, toNumber(source.intensity, DEFAULT_SPOT_LIGHT.intensity)),
    colour: typeof source.colour === 'string' && source.colour.trim() !== ''
      ? source.colour
      : DEFAULT_SPOT_LIGHT.colour
  };
};

const normaliseDisplacementMapParams = (params: unknown): DisplacementMapFilterParams => {
  const source = isRecord(params) ? params : {};
  return {
    amountX: Math.max(0, toNumber(source.amountX, DEFAULT_DISPLACEMENT_MAP.amountX)),
    amountY: Math.max(0, toNumber(source.amountY, DEFAULT_DISPLACEMENT_MAP.amountY)),
    size: Math.max(1, toNumber(source.size, DEFAULT_DISPLACEMENT_MAP.size)),
    strength: Math.max(0, Math.min(1, toNumber(source.strength, DEFAULT_DISPLACEMENT_MAP.strength)))
  };
};

const normaliseFakeDofParams = (params: unknown): FakeDofFilterParams => {
  const source = isRecord(params) ? params : {};
  return {
    focusX: Math.max(0, Math.min(1, toNumber(source.focusX, DEFAULT_FAKE_DOF.focusX))),
    focusY: Math.max(0, Math.min(1, toNumber(source.focusY, DEFAULT_FAKE_DOF.focusY))),
    focusRadius: Math.max(0.01, Math.min(1, toNumber(source.focusRadius, DEFAULT_FAKE_DOF.focusRadius))),
    blur: Math.max(0, toNumber(source.blur, DEFAULT_FAKE_DOF.blur)),
    strength: Math.max(0, Math.min(1, toNumber(source.strength, DEFAULT_FAKE_DOF.strength)))
  };
};

const normaliseAutoBlurParams = (params: unknown): AutoBlurFilterParams => {
  const source = isRecord(params) ? params : {};
  return {
    blur: Math.max(0, toNumber(source.blur, DEFAULT_AUTO_BLUR.blur)),
    speed: Math.max(0, toNumber(source.speed, DEFAULT_AUTO_BLUR.speed)),
    strength: Math.max(0, Math.min(1, toNumber(source.strength, DEFAULT_AUTO_BLUR.strength))),
    colourShift: Math.max(0, Math.min(1, toNumber(source.colourShift, DEFAULT_AUTO_BLUR.colourShift)))
  };
};

const normaliseColorParams = (params: unknown): Omit<ColorCorrection, 'enabled'> => {
  const source = isRecord(params) ? params : {};
  return {
    brightness: toNumber(source.brightness, DEFAULT_COLOR_CORRECTION.brightness),
    contrast: toNumber(source.contrast, DEFAULT_COLOR_CORRECTION.contrast),
    saturation: toNumber(source.saturation, DEFAULT_COLOR_CORRECTION.saturation),
    hue: toNumber(source.hue, DEFAULT_COLOR_CORRECTION.hue)
  };
};

const normaliseClippingParams = (params: unknown): Omit<ClippingParams, 'enabled'> => {
  const source = isRecord(params) ? params : {};
  return {
    top: toNumber(source.top, DEFAULT_CLIPPING.top),
    bottom: toNumber(source.bottom, DEFAULT_CLIPPING.bottom),
    left: toNumber(source.left, DEFAULT_CLIPPING.left),
    right: toNumber(source.right, DEFAULT_CLIPPING.right),
    angle: toNumber(source.angle, DEFAULT_CLIPPING.angle),
    radius: toNumber(source.radius, DEFAULT_CLIPPING.radius)
  };
};

const normaliseVibrationParams = (params: unknown): Omit<Vibration, 'enabled'> => {
  const source = isRecord(params) ? params : {};
  return {
    strength: toNumber(source.strength, DEFAULT_VIBRATION.strength),
    speed: toNumber(source.speed, DEFAULT_VIBRATION.speed)
  };
};

const normaliseShadowParams = (params: unknown): Omit<ShadowEffect, 'enabled'> => {
  const source = isRecord(params) ? params : {};
  return {
    colour: typeof source.colour === 'string' && source.colour.trim() !== ''
      ? source.colour
      : DEFAULT_SHADOW.colour,
    blur: toNumber(source.blur, DEFAULT_SHADOW.blur),
    offsetX: toNumber(source.offsetX, DEFAULT_SHADOW.offsetX),
    offsetY: toNumber(source.offsetY, DEFAULT_SHADOW.offsetY),
    opacity: toNumber(source.opacity, DEFAULT_SHADOW.opacity)
  };
};

const normaliseGradientParams = (params: unknown): Omit<GradientFill, 'enabled'> => {
  const source = isRecord(params) ? params : {};
  const type = source.type === 'radial' ? 'radial' : 'linear';
  const rawColours = Array.isArray(source.colours)
    ? source.colours.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    : [];
  let colours = rawColours.slice(0, 8);
  if (colours.length === 0) colours = [...DEFAULT_GRADIENT.colours];
  if (colours.length === 1) colours = [colours[0], colours[0]];

  const rawStops = Array.isArray(source.stops)
    ? source.stops.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
    : [];
  const stops = colours.map((_, index) => {
    const fallback = colours.length === 1 ? 0 : index / (colours.length - 1);
    const value = rawStops[index];
    return Math.max(0, Math.min(1, typeof value === 'number' ? value : fallback));
  });

  return {
    type,
    colours,
    stops,
    direction: toNumber(source.direction, DEFAULT_GRADIENT.direction)
  };
};

export const createDefaultFilter = (type: FilterType): ObjectFilter => {
  switch (type) {
    case 'color_correction':
      return {
        id: createFilterId(type),
        type,
        enabled: true,
        params: { ...DEFAULT_COLOR_CORRECTION }
      };
    case 'colour_aberration':
      return {
        id: createFilterId(type),
        type,
        enabled: true,
        params: { ...DEFAULT_COLOUR_ABERRATION }
      };
    case 'outline':
      return {
        id: createFilterId(type),
        type,
        enabled: true,
        params: { ...DEFAULT_OUTLINE }
      };
    case 'clipping':
      return {
        id: createFilterId(type),
        type,
        enabled: true,
        params: { ...DEFAULT_CLIPPING }
      };
    case 'vibration':
      return {
        id: createFilterId(type),
        type,
        enabled: true,
        params: { ...DEFAULT_VIBRATION }
      };
    case 'shadow':
      return {
        id: createFilterId(type),
        type,
        enabled: true,
        params: { ...DEFAULT_SHADOW }
      };
    case 'gradient':
      return {
        id: createFilterId(type),
        type,
        enabled: true,
        params: {
          ...DEFAULT_GRADIENT,
          colours: [...DEFAULT_GRADIENT.colours],
          stops: [...DEFAULT_GRADIENT.stops]
        }
      };
    case 'blur':
      return {
        id: createFilterId(type),
        type,
        enabled: true,
        params: { ...DEFAULT_BLUR }
      };
    case 'fade':
      return {
        id: createFilterId(type),
        type,
        enabled: true,
        params: { ...DEFAULT_FADE }
      };
    case 'wipe':
      return {
        id: createFilterId(type),
        type,
        enabled: true,
        params: { ...DEFAULT_WIPE }
      };
    case 'spot_light':
      return {
        id: createFilterId(type),
        type,
        enabled: true,
        params: { ...DEFAULT_SPOT_LIGHT }
      };
    case 'displacement_map':
      return {
        id: createFilterId(type),
        type,
        enabled: true,
        params: { ...DEFAULT_DISPLACEMENT_MAP }
      };
    case 'fake_dof':
      return {
        id: createFilterId(type),
        type,
        enabled: true,
        params: { ...DEFAULT_FAKE_DOF }
      };
    case 'auto_blur':
      return {
        id: createFilterId(type),
        type,
        enabled: true,
        params: { ...DEFAULT_AUTO_BLUR }
      };
    default:
      return {
        id: createFilterId('color_correction'),
        type: 'color_correction',
        enabled: true,
        params: { ...DEFAULT_COLOR_CORRECTION }
      };
  }
};

const normaliseFilter = (value: unknown): ObjectFilter | null => {
  if (!isRecord(value) || !isFilterType(value.type)) return null;
  const id = typeof value.id === 'string' && value.id.trim() !== ''
    ? value.id
    : createFilterId(value.type);
  const enabled = toBoolean(value.enabled, true);

  switch (value.type) {
    case 'color_correction':
      return {
        id,
        type: 'color_correction',
        enabled,
        params: normaliseColorParams(value.params)
      };
    case 'colour_aberration':
      return {
        id,
        type: 'colour_aberration',
        enabled,
        params: normaliseColourAberrationParams(value.params)
      };
    case 'outline':
      return {
        id,
        type: 'outline',
        enabled,
        params: normaliseOutlineParams(value.params)
      };
    case 'clipping':
      return {
        id,
        type: 'clipping',
        enabled,
        params: normaliseClippingParams(value.params)
      };
    case 'vibration':
      return {
        id,
        type: 'vibration',
        enabled,
        params: normaliseVibrationParams(value.params)
      };
    case 'shadow':
      return {
        id,
        type: 'shadow',
        enabled,
        params: normaliseShadowParams(value.params)
      };
    case 'gradient':
      return {
        id,
        type: 'gradient',
        enabled,
        params: normaliseGradientParams(value.params)
      };
    case 'blur':
      return {
        id,
        type: 'blur',
        enabled,
        params: normaliseBlurParams(value.params)
      };
    case 'fade':
      return {
        id,
        type: 'fade',
        enabled,
        params: normaliseFadeParams(value.params)
      };
    case 'wipe':
      return {
        id,
        type: 'wipe',
        enabled,
        params: normaliseWipeParams(value.params)
      };
    case 'spot_light':
      return {
        id,
        type: 'spot_light',
        enabled,
        params: normaliseSpotLightParams(value.params)
      };
    case 'displacement_map':
      return {
        id,
        type: 'displacement_map',
        enabled,
        params: normaliseDisplacementMapParams(value.params)
      };
    case 'fake_dof':
      return {
        id,
        type: 'fake_dof',
        enabled,
        params: normaliseFakeDofParams(value.params)
      };
    case 'auto_blur':
      return {
        id,
        type: 'auto_blur',
        enabled,
        params: normaliseAutoBlurParams(value.params)
      };
    default:
      return null;
  }
};

export const normaliseObjectFilters = (filters: ObjectFilter[] | undefined): ObjectFilter[] => {
  if (!Array.isArray(filters)) return [];
  const normalised: ObjectFilter[] = [];
  filters.forEach((filter) => {
    const parsed = normaliseFilter(filter);
    if (parsed) {
      normalised.push(parsed);
    }
  });
  return normalised;
};

export const buildFiltersFromLegacyEffects = (object: TimelineObject): ObjectFilter[] => {
  const filters: ObjectFilter[] = [];

  if (object.colorCorrection) {
    filters.push({
      id: createFilterId('color_correction'),
      type: 'color_correction',
      enabled: object.colorCorrection.enabled,
      params: normaliseColorParams(object.colorCorrection)
    });
  }

  if (object.customClipping) {
    filters.push({
      id: createFilterId('clipping'),
      type: 'clipping',
      enabled: object.customClipping.enabled,
      params: normaliseClippingParams(object.customClipping)
    });
  }

  if (object.vibration) {
    filters.push({
      id: createFilterId('vibration'),
      type: 'vibration',
      enabled: object.vibration.enabled,
      params: normaliseVibrationParams(object.vibration)
    });
  }

  if (object.shadow) {
    filters.push({
      id: createFilterId('shadow'),
      type: 'shadow',
      enabled: object.shadow.enabled,
      params: normaliseShadowParams(object.shadow)
    });
  }

  if (object.type === 'shape' && object.gradient) {
    filters.push({
      id: createFilterId('gradient'),
      type: 'gradient',
      enabled: object.gradient.enabled,
      params: normaliseGradientParams(object.gradient)
    });
  }

  return filters;
};

const resolveOrderedFilters = (object: TimelineObject): ObjectFilter[] => {
  if (Array.isArray(object.filters)) {
    return normaliseObjectFilters(object.filters);
  }
  return buildFiltersFromLegacyEffects(object);
};

export const getObjectFiltersInOrder = (object: TimelineObject): ObjectFilter[] => {
  return resolveOrderedFilters(object);
};

export const getEnabledObjectFiltersInOrder = (object: TimelineObject): ObjectFilter[] => {
  const resolved = resolveOrderedFilters(object);
  const enabled: ObjectFilter[] = [];
  for (let i = 0; i < resolved.length; i += 1) {
    if (resolved[i].enabled) enabled.push(resolved[i]);
  }
  return enabled;
};

export const getFadeOpacityMultiplier = (object: TimelineObject): number => {
  const resolved = resolveOrderedFilters(object);
  let acc = 1;
  for (let i = 0; i < resolved.length; i += 1) {
    const filter = resolved[i];
    if (filter.enabled && filter.type === 'fade') {
      acc *= Math.max(0, Math.min(1, filter.params.opacity));
    }
  }
  return acc;
};

export const getPrimaryWipeFilter = (
  object: TimelineObject
): Extract<ObjectFilter, { type: 'wipe' }> | null => {
  const resolved = resolveOrderedFilters(object);
  for (let i = 0; i < resolved.length; i += 1) {
    const filter = resolved[i];
    if (filter.enabled && filter.type === 'wipe') {
      return filter;
    }
  }
  return null;
};

type LastLegacyFilters = {
  color: ObjectFilter | null;
  clipping: ObjectFilter | null;
  vibration: ObjectFilter | null;
  shadow: ObjectFilter | null;
  gradient: ObjectFilter | null;
};

const collectLastLegacyFilters = (filters: ObjectFilter[]): LastLegacyFilters => {
  let color: ObjectFilter | null = null;
  let clipping: ObjectFilter | null = null;
  let vibration: ObjectFilter | null = null;
  let shadow: ObjectFilter | null = null;
  let gradient: ObjectFilter | null = null;
  for (let i = filters.length - 1; i >= 0; i -= 1) {
    const entry = filters[i];
    switch (entry.type) {
      case 'color_correction':
        if (!color) color = entry;
        break;
      case 'clipping':
        if (!clipping) clipping = entry;
        break;
      case 'vibration':
        if (!vibration) vibration = entry;
        break;
      case 'shadow':
        if (!shadow) shadow = entry;
        break;
      case 'gradient':
        if (!gradient) gradient = entry;
        break;
      default:
        break;
    }
    if (color && clipping && vibration && shadow && gradient) break;
  }
  return { color, clipping, vibration, shadow, gradient };
};

const materialiseSyncedObject = <T extends TimelineObject>(object: T, filters: ObjectFilter[]): T => {
  const { color: colorFilter, clipping: clippingFilter, vibration: vibrationFilter, shadow: shadowFilter, gradient: gradientFilter } = collectLastLegacyFilters(filters);

  const syncedBase = {
    ...object,
    filters,
    colorCorrection: colorFilter && colorFilter.type === 'color_correction'
      ? { enabled: colorFilter.enabled, ...colorFilter.params }
      : undefined,
    customClipping: clippingFilter && clippingFilter.type === 'clipping'
      ? { enabled: clippingFilter.enabled, ...clippingFilter.params }
      : undefined,
    vibration: vibrationFilter && vibrationFilter.type === 'vibration'
      ? { enabled: vibrationFilter.enabled, ...vibrationFilter.params }
      : undefined,
    shadow: shadowFilter && shadowFilter.type === 'shadow'
      ? { enabled: shadowFilter.enabled, ...shadowFilter.params }
      : undefined
  };

  if (object.type !== 'shape') {
    return syncedBase as T;
  }

  return {
    ...syncedBase,
    gradient: gradientFilter && gradientFilter.type === 'gradient'
      ? { enabled: gradientFilter.enabled, ...gradientFilter.params }
      : undefined
  } as T;
};

export const syncLegacyEffectsWithFilters = <T extends TimelineObject>(object: T): T => {
  return materialiseSyncedObject(object, resolveOrderedFilters(object));
};

const upsertLegacyFilter = (
  filters: ObjectFilter[],
  type: FilterType,
  payload: { enabled: boolean; params: unknown } | null
): ObjectFilter[] => {
  if (!payload) return filters;
  const params = isRecord(payload.params) ? payload.params : {};

  const nextFilters = filters.slice();
  for (let i = nextFilters.length - 1; i >= 0; i -= 1) {
    if (nextFilters[i].type === type) {
      const nextCandidate = {
        ...nextFilters[i],
        enabled: payload.enabled,
        params: {
          ...nextFilters[i].params,
          ...params
        }
      };
      const normalised = normaliseFilter(nextCandidate);
      if (normalised) {
        nextFilters[i] = normalised;
      }
      return nextFilters;
    }
  }

  const appended = createDefaultFilter(type);
  const nextCandidate = {
    ...appended,
    enabled: payload.enabled,
    params: {
      ...appended.params,
      ...params
    }
  };
  const normalised = normaliseFilter(nextCandidate);
  return normalised ? [...nextFilters, normalised] : nextFilters;
};

export const syncFiltersFromLegacyValues = <T extends TimelineObject>(object: T): T => {
  let nextFilters = normaliseObjectFilters(object.filters);

  nextFilters = upsertLegacyFilter(nextFilters, 'color_correction', object.colorCorrection
    ? { enabled: object.colorCorrection.enabled, params: object.colorCorrection }
    : null);
  nextFilters = upsertLegacyFilter(nextFilters, 'clipping', object.customClipping
    ? { enabled: object.customClipping.enabled, params: object.customClipping }
    : null);
  nextFilters = upsertLegacyFilter(nextFilters, 'vibration', object.vibration
    ? { enabled: object.vibration.enabled, params: object.vibration }
    : null);
  nextFilters = upsertLegacyFilter(nextFilters, 'shadow', object.shadow
    ? { enabled: object.shadow.enabled, params: object.shadow }
    : null);
  if (object.type === 'shape') {
    nextFilters = upsertLegacyFilter(nextFilters, 'gradient', object.gradient
      ? { enabled: object.gradient.enabled, params: object.gradient }
      : null);
  }

  return materialiseSyncedObject({ ...object, filters: nextFilters }, nextFilters);
};

export const addFilterToObject = (object: TimelineObject, type: FilterType): TimelineObject => {
  const currentFilters = getObjectFiltersInOrder(object);
  const nextFilters = [...currentFilters, createDefaultFilter(type)];
  return materialiseSyncedObject({ ...object, filters: nextFilters }, nextFilters);
};

export const toggleFilterEnabledInObject = (object: TimelineObject, filterId: string): TimelineObject => {
  const currentFilters = getObjectFiltersInOrder(object);
  const nextFilters = currentFilters.map((filter) => {
    if (filter.id !== filterId) return filter;
    return { ...filter, enabled: !filter.enabled };
  });
  return materialiseSyncedObject({ ...object, filters: nextFilters }, nextFilters);
};

export const removeFilterFromObject = (object: TimelineObject, filterId: string): TimelineObject => {
  const currentFilters = getObjectFiltersInOrder(object);
  const nextFilters = currentFilters.filter((filter) => filter.id !== filterId);
  return materialiseSyncedObject({ ...object, filters: nextFilters }, nextFilters);
};

export const moveFilterInObject = (object: TimelineObject, filterId: string, direction: 'up' | 'down'): TimelineObject => {
  const currentFilters = getObjectFiltersInOrder(object);
  const index = currentFilters.findIndex((filter) => filter.id === filterId);
  if (index < 0) return materialiseSyncedObject({ ...object, filters: currentFilters }, currentFilters);

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= currentFilters.length) {
    return materialiseSyncedObject({ ...object, filters: currentFilters }, currentFilters);
  }

  const nextFilters = currentFilters.slice();
  const [moved] = nextFilters.splice(index, 1);
  nextFilters.splice(targetIndex, 0, moved);
  return materialiseSyncedObject({ ...object, filters: nextFilters }, nextFilters);
};

export const updateFilterParamsInObject = (
  object: TimelineObject,
  filterId: string,
  paramsPatch: Record<string, unknown>
): TimelineObject => {
  const currentFilters = getObjectFiltersInOrder(object);
  const nextFilters = currentFilters.map((filter) => {
    if (filter.id !== filterId) return filter;
    const nextCandidate = {
      ...filter,
      params: {
        ...filter.params,
        ...paramsPatch
      }
    };
    const normalised = normaliseFilter(nextCandidate);
    return normalised ?? filter;
  });
  return materialiseSyncedObject({ ...object, filters: nextFilters }, nextFilters);
};
