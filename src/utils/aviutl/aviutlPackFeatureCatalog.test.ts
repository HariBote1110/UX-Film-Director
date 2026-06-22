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
    expect(byId.get('getcolor-v2r-dot-field')?.sourceRelativePaths).toContain('script/@GetColor/@GetColor-V2R.anm');
    expect(byId.get('getcolor-v2r-diamond-dots')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('getcolor-v2r-outlined-square-dots')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('getcolor-v2r-sampled-dots')?.sourceRelativePaths).toEqual(expect.arrayContaining([
      'script/@GetColor/@GetColor-V2R.anm',
      'script/93/@GetColor.anm',
    ]));
    expect(byId.get('getcolor-v2r-sampled-dots')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('hksy-checker-grid')?.sourceRelativePaths).toContain('script/@hksy/@hksy.obj');
    expect(byId.get('hksy-line')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('hksy-multi-colour-checker')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('hksy-diamond')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('hksy-measured-grid')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('hksy-anchor-line')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('93-audio-sphere')?.sourceRelativePaths).toContain('script/93/音声玉.obj');
    expect(byId.get('93-delay-move')?.sourceRelativePaths).toContain('script/93/@DelayMove.anm');
    expect(byId.get('93-spotlight')?.sourceRelativePaths).toContain('script/93/@SpotLight.anm');
    expect(byId.get('93-region-frame')?.sourceRelativePaths).toContain('script/93/@領域枠.anm');
    expect(byId.get('93-region-frame-ellipse')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('93-region-frame-cut-corner')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('93-simple-tube')?.sourceRelativePaths).toEqual(expect.arrayContaining([
      'script/93/SimpleTube.obj',
      'script/93/SimpleTube2.obj'
    ]));
    expect(byId.get('93-simple-tube-torus')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('93-sphere-drawpixel')?.sourceRelativePaths).toContain('script/93/@Sphere.anm');
    expect(byId.get('93-sphere-drawpixel')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('93-spherical-field')?.sourceRelativePaths).toContain('script/93/SphericalField.anm');
    expect(byId.get('93-spherical-field')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('93-contour-trace')?.sourceRelativePaths).toEqual(expect.arrayContaining([
      'script/93/Contour.anm',
      'script/93/輪郭トレス.anm'
    ]));
    expect(byId.get('93-contour-trace')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('93-displacement-poly')?.sourceRelativePaths).toContain('script/93/DisplacementPoly.anm');
    expect(byId.get('93-displacement-poly')?.implementationTarget).toBe('native-generated-object');
    expect(byId.get('93-displacement-map-b')?.sourceRelativePaths).toContain('script/93/@ディスプレイスメントマップB.anm');
    expect(byId.get('93-displacement-map-b')?.implementationTarget).toBe('rust-webgpu-effect');
    expect(byId.get('93-fake-dof2')?.sourceRelativePaths).toEqual(expect.arrayContaining([
      'script/93/偽被写界深度2.anm',
      'script/93/DOF2.lua'
    ]));
    expect(byId.get('93-fake-dof2')?.implementationTarget).toBe('rust-webgpu-effect');
    expect(byId.get('93-auto-blur-plus')?.sourceRelativePaths).toContain('script/93/オートブラー+.anm');
    expect(byId.get('93-auto-blur-plus')?.implementationTarget).toBe('rust-webgpu-effect');
    expect(byId.get('93-stretch')?.sourceRelativePaths).toContain('script/93/@Stretch.anm');
    expect(byId.get('93-stretch')?.implementationTarget).toBe('rust-webgpu-effect');
    expect(byId.get('93-multi-slicer')?.sourceRelativePaths).toContain('script/93/@MultiSlicer.anm');
    expect(byId.get('93-multi-slicer')?.implementationTarget).toBe('rust-webgpu-effect');
    expect(byId.get('93-oct-transform')?.sourceRelativePaths).toContain('script/93/簡易変形(oct).anm');
    expect(byId.get('93-oct-transform')?.implementationTarget).toBe('rust-webgpu-effect');
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
    expect(byId.get('tim-simple-tone-curve')?.sourceRelativePaths).toContain('script/てぃむ/簡易トーンカーブ.obj');
    expect(byId.get('ssd-sunburst')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/日の出.obj');
    expect(byId.get('ssd-circular-arrow')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/円矢印.obj');
    expect(byId.get('ssd-triangle-bracket')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/三角括弧.obj');
    expect(byId.get('ssd-tartan-check')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/タータンチェック_ISTN.obj');
    expect(byId.get('ssd-houndstooth')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/千鳥格子.obj');
    expect(byId.get('ssd-yagasuri')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/矢がすり.obj');
    expect(byId.get('ssd-paper-airplane')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/紙飛行機.obj');
    expect(byId.get('ssd-asanoha-pattern')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/麻の葉模様.obj');
    expect(byId.get('ssd-focus-lines-plus')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/集中線plus.obj');
    expect(byId.get('ssd-random-line-ex')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/ランダムラインEX.obj');
    expect(byId.get('ssd-hologram')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/ホログラム.obj');
    expect(byId.get('ssd-protractor')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/分度器.obj');
    expect(byId.get('ssd-shaking-polygon')?.sourceRelativePaths).toContain('script/ANM/ANM_ssd/多角形_震える.obj');
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

  it('promotes GetColor, hksy and 93 scripts into the next implementation lane', () => {
    const roadmapIds = getStandardAviUtlNativeEffectRoadmap().map((item) => item.id);
    const priorityIds = [
      'getcolor-v2r-dot-field',
      'getcolor-v2r-diamond-dots',
      'getcolor-v2r-outlined-square-dots',
      'getcolor-v2r-sampled-dots',
      '93-audio-sphere',
      '93-delay-move',
      '93-spotlight',
      '93-region-frame',
      'hksy-checker-grid',
      'hksy-line',
      'hksy-multi-colour-checker',
      'hksy-diamond',
      'hksy-measured-grid',
      'hksy-anchor-line',
      '93-contour-trace',
      '93-displacement-poly',
      '93-displacement-map-b',
      '93-fake-dof2',
      '93-auto-blur-plus',
      '93-stretch',
      '93-multi-slicer'
    ];

    expect(roadmapIds.slice(0, 34)).toEqual(expect.arrayContaining(priorityIds));
  });
});
