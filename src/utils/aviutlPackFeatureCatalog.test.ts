import { describe, expect, it } from 'vitest';
import {
  getAviUtlPackV4InventorySummary,
  getStandardAviUtlNativeEffectRoadmap,
  resolveAviUtlPackV4FeatureCandidates
} from './aviutlPackFeatureCatalog';

describe('AviUtlPackV4 feature catalogue', () => {
  it('records the observed iCloud Pack inventory shape without copying script bodies', () => {
    expect(getAviUtlPackV4InventorySummary()).toMatchObject({
      sourceName: 'AviUtlPackV4',
      observedRootHint: 'iCloud Drive/AviUtlPackV4',
      fileCounts: {
        anm: 137,
        obj: 61,
        tra: 12,
        cam: 6,
        scn: 2,
        lua: 15,
        stg: 18
      }
    });
  });

  it('selects native UXFD implementations for the effects most useful to voice-video editing', () => {
    const candidates = resolveAviUtlPackV4FeatureCandidates();
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

    expect(byId.get('aviutl-easing')?.sourceRelativePaths).toContain('script/@イージング.tra');
    expect(byId.get('ymm4-entrance-exit')?.implementationTarget).toBe('native-motion-preset');
    expect(byId.get('tim-colour-aberration')?.implementationTarget).toBe('rust-webgpu-effect');
    expect(byId.get('tim-luminance-wipe')?.implementationTarget).toBe('rust-webgpu-effect');
    expect(byId.get('audio-waveform-r')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('particle-standard')?.implementationTarget).toBe('native-generated-object');

    expect(candidates.every((candidate) => candidate.bundlingMode !== 'copy-third-party-script')).toBe(true);
  });

  it('orders the first standard bundle by quick usability before script-runtime compatibility', () => {
    const roadmap = getStandardAviUtlNativeEffectRoadmap();

    expect(roadmap.map((item) => item.id).slice(0, 8)).toEqual([
      'aviutl-easing',
      'ymm4-entrance-exit',
      'ymm4-random-motion',
      'ymm4-repeat-motion',
      'tim-luminance-wipe',
      'tim-edge-outline',
      'tim-colour-aberration',
      'fan-clipping-r'
    ]);

    expect(roadmap.filter((item) => item.phase === 'P0').map((item) => item.id)).toEqual([
      'aviutl-easing',
      'ymm4-entrance-exit',
      'ymm4-random-motion',
      'ymm4-repeat-motion'
    ]);
  });
});
