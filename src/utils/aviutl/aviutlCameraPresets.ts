import type { StageCamera3D, TimelineObject } from '../../types';

export type AviUtlCameraPresetId = '93-camera-target-selected';

export interface AviUtlCameraPreset {
  id: AviUtlCameraPresetId;
  labelJa: string;
  sourceCandidateId: '93-camera-target';
  defaultDistanceZ: number;
}

export interface AviUtlCameraTargetOptions {
  projectWidth: number;
  projectHeight: number;
  distanceZ?: number;
  targetZ?: number;
}

const presets: AviUtlCameraPreset[] = [
  {
    id: '93-camera-target-selected',
    labelJa: '93: 選択オブジェクトを目標にする',
    sourceCandidateId: '93-camera-target',
    defaultDistanceZ: 900
  }
];

export const getAviUtlPackCameraPresets = (): AviUtlCameraPreset[] =>
  presets.map((preset) => ({ ...preset }));

export const buildAviUtlCameraTargetPatch = (
  object: Pick<TimelineObject, 'x' | 'y'>,
  options: AviUtlCameraTargetOptions
): StageCamera3D => {
  const projectWidth = positiveNumberOr(options.projectWidth, 1920);
  const projectHeight = positiveNumberOr(options.projectHeight, 1080);
  const distanceZ = positiveNumberOr(options.distanceZ, presets[0].defaultDistanceZ);
  const targetZ = finiteNumberOr(options.targetZ, 0);
  const targetX = roundForCamera(finiteNumberOr(object.x, projectWidth / 2) - projectWidth / 2);
  const targetY = roundForCamera(projectHeight / 2 - finiteNumberOr(object.y, projectHeight / 2));

  return {
    target: {
      x: targetX,
      y: targetY,
      z: targetZ
    },
    position: {
      x: targetX,
      y: targetY,
      z: targetZ + distanceZ
    }
  };
};

const finiteNumberOr = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const positiveNumberOr = (value: unknown, fallback: number): number => {
  const numberValue = finiteNumberOr(value, fallback);
  return numberValue > 0 ? numberValue : fallback;
};

const roundForCamera = (value: number): number => Math.round(value * 1000) / 1000;
