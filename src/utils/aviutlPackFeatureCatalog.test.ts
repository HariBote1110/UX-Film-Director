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
    expect(byId.get('tim-aura-emission')?.sourceRelativePaths).toContain('script/てぃむ/オーラ放出.anm');
    expect(byId.get('tim-bubbles')?.sourceRelativePaths).toContain('script/てぃむ/泡.obj');
    expect(byId.get('tim-focus-lines')?.sourceRelativePaths).toContain('script/てぃむ/@集中線T.obj');
    expect(byId.get('tim-ink-splash')?.sourceRelativePaths).toContain('script/てぃむ/インクTM.obj');
    expect(byId.get('tim-barcode')?.sourceRelativePaths).toContain('script/てぃむ/バーコードT.obj');
    expect(byId.get('tim-puzzle-piece')?.sourceRelativePaths).toContain('script/てぃむ/パズルピース.obj');
    expect(byId.get('tim-colour-wheel')?.sourceRelativePaths).toContain('script/てぃむ/色相環.obj');
    expect(byId.get('tim-gourd')?.sourceRelativePaths).toContain('script/てぃむ/ひょうたんTM.obj');
    expect(byId.get('tim-gear')?.sourceRelativePaths).toContain('script/てぃむ/歯車.anm');
    expect(byId.get('tim-simple-histogram')?.sourceRelativePaths).toContain('script/てぃむ/簡易ヒストグラム.obj');
    expect(byId.get('ssd-sunburst')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/日の出.obj');
    expect(byId.get('ssd-circular-arrow')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/円矢印.obj');
    expect(byId.get('ssd-triangle-bracket')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/三角括弧.obj');
    expect(byId.get('ssd-tartan-check')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/タータンチェック_ISTN.obj');
    expect(byId.get('custom-track-bar')?.sourceRelativePaths).toContain('script/93/カスタムトラックバー.obj');
    expect(byId.get('pie-sheet-graph')?.sourceRelativePaths).toContain('script/93/パイシートグラフ.obj');
    expect(byId.get('tim-motion-path')?.sourceRelativePaths).toEqual(expect.arrayContaining([
      'script/てぃむ/@モーションパスA-V2.anm',
      'script/てぃむ/@モーションパスD.anm',
      'script/てぃむ/ベジェ軌道T.obj'
    ]));
    expect(byId.get('tim-wind-sway')?.sourceRelativePaths).toContain('script/てぃむ/風揺れT.anm');

    expect(candidates.map((candidate) => candidate.bundlingMode)).not.toContain('copy-third-party-script');
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
