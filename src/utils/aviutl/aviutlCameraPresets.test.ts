import { describe, expect, it } from 'vitest';
import {
  buildAviUtlCameraTargetPatch,
  getAviUtlPackCameraPresets
} from './aviutlCameraPresets';

describe('AviUtlPackV4 camera presets', () => {
  it('exposes the 93 camera target helper as a native camera tool', () => {
    expect(getAviUtlPackCameraPresets().map((preset) => ({
      id: preset.id,
      sourceCandidateId: preset.sourceCandidateId
    }))).toEqual([
      { id: '93-camera-target-selected', sourceCandidateId: '93-camera-target' }
    ]);
  });

  it('builds a centred 3D camera target patch from a selected timeline object', () => {
    const patch = buildAviUtlCameraTargetPatch(
      { x: 960, y: 540 },
      {
        projectWidth: 1920,
        projectHeight: 1080,
        distanceZ: 900
      }
    );

    expect(patch).toEqual({
      target: { x: 0, y: 0, z: 0 },
      position: { x: 0, y: 0, z: 900 }
    });
  });

  it('converts screen Y down coordinates into stage Y up coordinates', () => {
    const patch = buildAviUtlCameraTargetPatch(
      { x: 1260, y: 390 },
      {
        projectWidth: 1920,
        projectHeight: 1080,
        distanceZ: 1200
      }
    );

    expect(patch).toEqual({
      target: { x: 300, y: 150, z: 0 },
      position: { x: 300, y: 150, z: 1200 }
    });
  });
});
