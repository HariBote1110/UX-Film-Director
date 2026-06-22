import type { FilterType, ObjectFilter, TimelineObject } from '../../types';
import { getObjectFiltersInOrder, syncLegacyEffectsWithFilters } from '../filterStack';

export type AviUtlEffectPresetId =
  | 'luminance-wipe-basic'
  | 'edge-outline-soft'
  | 'colour-aberration-rgb'
  | 'fan-clipping-diagonal'
  | '93-spotlight-soft'
  | '93-displacement-map-b-wave'
  | '93-fake-dof2-focus'
  | '93-auto-blur-plus-motion'
  | '93-stretch-directional';

export interface AviUtlEffectPreset {
  id: AviUtlEffectPresetId;
  labelJa: string;
  sourceCandidateId:
    | 'tim-luminance-wipe'
    | 'tim-edge-outline'
    | 'tim-colour-aberration'
    | 'fan-clipping-r'
    | '93-spotlight'
    | '93-displacement-map-b'
    | '93-fake-dof2'
    | '93-auto-blur-plus'
    | '93-stretch';
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
    labelJa: '縁取りT',
    sourceCandidateId: 'tim-edge-outline',
    filterType: 'outline'
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
  },
  {
    id: '93-spotlight-soft',
    labelJa: '93 SpotLight',
    sourceCandidateId: '93-spotlight',
    filterType: 'spot_light'
  },
  {
    id: '93-displacement-map-b-wave',
    labelJa: '93 ディスプレイスメントマップB',
    sourceCandidateId: '93-displacement-map-b',
    filterType: 'displacement_map'
  },
  {
    id: '93-fake-dof2-focus',
    labelJa: '93 偽被写界深度2',
    sourceCandidateId: '93-fake-dof2',
    filterType: 'fake_dof'
  },
  {
    id: '93-auto-blur-plus-motion',
    labelJa: '93 オートブラー+',
    sourceCandidateId: '93-auto-blur-plus',
    filterType: 'auto_blur'
  },
  {
    id: '93-stretch-directional',
    labelJa: '93 Stretch',
    sourceCandidateId: '93-stretch',
    filterType: 'stretch'
  }
];

export const getAviUtlPackEffectPresets = (): AviUtlEffectPreset[] =>
  presets.map((preset) => ({ ...preset }));

export const buildAviUtlEffectPresetFilter = (presetId: AviUtlEffectPresetId): ObjectFilter => {
  switch (presetId) {
    case 'edge-outline-soft': {
      return {
        id: `aviutl-${presetId}`,
        type: 'outline',
        enabled: true,
        params: {
          colour: '#000000',
          thickness: 3,
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
    case '93-spotlight-soft': {
      return {
        id: `aviutl-${presetId}`,
        type: 'spot_light',
        enabled: true,
        params: {
          centreX: 0.5,
          centreY: 0.5,
          radius: 0.65,
          intensity: 0.75,
          colour: '#fff4c2'
        }
      };
    }
    case '93-displacement-map-b-wave': {
      return {
        id: `aviutl-${presetId}`,
        type: 'displacement_map',
        enabled: true,
        params: {
          amountX: 24,
          amountY: 12,
          size: 128,
          strength: 1
        }
      };
    }
    case '93-fake-dof2-focus': {
      return {
        id: `aviutl-${presetId}`,
        type: 'fake_dof',
        enabled: true,
        params: {
          focusX: 0.5,
          focusY: 0.5,
          focusRadius: 0.25,
          blur: 8,
          strength: 1
        }
      };
    }
    case '93-auto-blur-plus-motion': {
      return {
        id: `aviutl-${presetId}`,
        type: 'auto_blur',
        enabled: true,
        params: {
          blur: 10,
          speed: 1,
          strength: 1,
          colourShift: 0
        }
      };
    }
    case '93-stretch-directional': {
      return {
        id: `aviutl-${presetId}`,
        type: 'stretch',
        enabled: true,
        params: {
          angle: 0,
          amount: 1,
          strength: 1
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
