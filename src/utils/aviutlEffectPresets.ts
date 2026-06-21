import type { FilterType, ObjectFilter, TimelineObject } from '../types';
import { getObjectFiltersInOrder, syncLegacyEffectsWithFilters } from './filterStack';

export type AviUtlEffectPresetId =
  | 'luminance-wipe-basic'
  | 'edge-outline-soft'
  | 'colour-aberration-rgb'
  | 'fan-clipping-diagonal';

export interface AviUtlEffectPreset {
  id: AviUtlEffectPresetId;
  labelJa: string;
  sourceCandidateId:
    | 'tim-luminance-wipe'
    | 'tim-edge-outline'
    | 'tim-colour-aberration'
    | 'fan-clipping-r';
  filterType: FilterType;
}

const presets: AviUtlEffectPreset[] = [
  {
    id: 'luminance-wipe-basic',
    labelJa: '輝度ワイプ近似',
    sourceCandidateId: 'tim-luminance-wipe',
    filterType: 'wipe'
  },
  {
    id: 'edge-outline-soft',
    labelJa: '縁取りT近似',
    sourceCandidateId: 'tim-edge-outline',
    filterType: 'shadow'
  },
  {
    id: 'colour-aberration-rgb',
    labelJa: '色収差',
    sourceCandidateId: 'tim-colour-aberration',
    filterType: 'colour_aberration'
  },
  {
    id: 'fan-clipping-diagonal',
    labelJa: '扇クリッピング近似',
    sourceCandidateId: 'fan-clipping-r',
    filterType: 'clipping'
  }
];

export const getAviUtlPackEffectPresets = (): AviUtlEffectPreset[] =>
  presets.map((preset) => ({ ...preset }));

export const buildAviUtlEffectPresetFilter = (presetId: AviUtlEffectPresetId): ObjectFilter => {
  switch (presetId) {
    case 'edge-outline-soft': {
      return {
        id: `aviutl-${presetId}`,
        type: 'shadow',
        enabled: true,
        params: {
          colour: '#000000',
          blur: 0,
          offsetX: 0,
          offsetY: 0,
          opacity: 0.85
        }
      };
    }
    case 'colour-aberration-rgb': {
      return {
        id: `aviutl-${presetId}`,
        type: 'colour_aberration',
        enabled: true,
        params: {
          offsetX: 3,
          offsetY: 0
        }
      };
    }
    case 'fan-clipping-diagonal': {
      return {
        id: `aviutl-${presetId}`,
        type: 'clipping',
        enabled: true,
        params: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          angle: 45,
          radius: 0
        }
      };
    }
    case 'luminance-wipe-basic':
    default: {
      return {
        id: `aviutl-${presetId}`,
        type: 'wipe',
        enabled: true,
        params: {
          edge: 'left',
          reverse: false
        }
      };
    }
  }
};

export const applyAviUtlEffectPresetToObject = <T extends TimelineObject>(
  object: T,
  presetId: AviUtlEffectPresetId
): T => {
  const nextFilters = [
    ...getObjectFiltersInOrder(object),
    buildAviUtlEffectPresetFilter(presetId)
  ];
  return syncLegacyEffectsWithFilters({ ...object, filters: nextFilters } as T);
};
