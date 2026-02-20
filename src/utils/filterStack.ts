import {
  TimelineObject,
  FilterType,
  ObjectFilter,
  ColorCorrection,
  ClippingParams,
  Vibration,
  ShadowEffect,
  GradientFill
} from '../types';

const DEFAULT_COLOR_CORRECTION: Omit<ColorCorrection, 'enabled'> = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0
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
    || value === 'clipping'
    || value === 'vibration'
    || value === 'shadow'
    || value === 'gradient';
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
  return resolveOrderedFilters(object).filter((filter) => filter.enabled);
};

const findLastFilter = (filters: ObjectFilter[], type: FilterType): ObjectFilter | null => {
  for (let i = filters.length - 1; i >= 0; i -= 1) {
    if (filters[i].type === type) return filters[i];
  }
  return null;
};

export const syncLegacyEffectsWithFilters = <T extends TimelineObject>(object: T): T => {
  const filters = resolveOrderedFilters(object);

  const colorFilter = findLastFilter(filters, 'color_correction');
  const clippingFilter = findLastFilter(filters, 'clipping');
  const vibrationFilter = findLastFilter(filters, 'vibration');
  const shadowFilter = findLastFilter(filters, 'shadow');
  const gradientFilter = findLastFilter(filters, 'gradient');

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

  return syncLegacyEffectsWithFilters({ ...object, filters: nextFilters });
};

export const addFilterToObject = (object: TimelineObject, type: FilterType): TimelineObject => {
  const currentFilters = getObjectFiltersInOrder(object);
  const nextFilters = [...currentFilters, createDefaultFilter(type)];
  return syncLegacyEffectsWithFilters({ ...object, filters: nextFilters });
};

export const toggleFilterEnabledInObject = (object: TimelineObject, filterId: string): TimelineObject => {
  const currentFilters = getObjectFiltersInOrder(object);
  const nextFilters = currentFilters.map((filter) => {
    if (filter.id !== filterId) return filter;
    return { ...filter, enabled: !filter.enabled };
  });
  return syncLegacyEffectsWithFilters({ ...object, filters: nextFilters });
};

export const removeFilterFromObject = (object: TimelineObject, filterId: string): TimelineObject => {
  const currentFilters = getObjectFiltersInOrder(object);
  const nextFilters = currentFilters.filter((filter) => filter.id !== filterId);
  return syncLegacyEffectsWithFilters({ ...object, filters: nextFilters });
};

export const moveFilterInObject = (object: TimelineObject, filterId: string, direction: 'up' | 'down'): TimelineObject => {
  const currentFilters = getObjectFiltersInOrder(object);
  const index = currentFilters.findIndex((filter) => filter.id === filterId);
  if (index < 0) return syncLegacyEffectsWithFilters({ ...object, filters: currentFilters });

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= currentFilters.length) {
    return syncLegacyEffectsWithFilters({ ...object, filters: currentFilters });
  }

  const nextFilters = currentFilters.slice();
  const [moved] = nextFilters.splice(index, 1);
  nextFilters.splice(targetIndex, 0, moved);
  return syncLegacyEffectsWithFilters({ ...object, filters: nextFilters });
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
  return syncLegacyEffectsWithFilters({ ...object, filters: nextFilters });
};
