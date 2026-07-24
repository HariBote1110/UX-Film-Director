import { describe, expect, it } from 'vitest';
import { buildEditableRustScene } from '../utils/editableRustScene';
import { buildRustTimelineGeneratedScenario } from './rustTimelineGeneratedScenario';

describe('Rust常駐タイムライン生成エフェクトシナリオ', () => {
  it('GetColor・HKSY・SimpleTube・GPU Particle・SpotLightを重ならない領域へ構築する', () => {
    const scenario = buildRustTimelineGeneratedScenario();

    expect(scenario.objects.map((object) => object.type)).toEqual([
      'getcolor_dot_field',
      'hksy_checker_grid',
      'simple_tube',
      'particle',
      'shape',
    ]);
    expect(scenario.objects.map((object) => object.id)).toEqual([
      'rust-e2e-getcolor',
      'rust-e2e-hksy',
      'rust-e2e-simple-tube',
      'rust-e2e-particle',
      'rust-e2e-spotlight',
    ]);
    expect(scenario.objects.every((object) => object.duration === 5)).toBe(true);
    expect(new Set(scenario.objects.map((object) => object.layer)).size).toBe(5);
  });

  it('生成エフェクト・GPU Particle・SpotLightを未対応issueなしでRust Projectへ変換できる', () => {
    const scenario = buildRustTimelineGeneratedScenario();
    const result = buildEditableRustScene({
      sceneId: 'rust-timeline-generated-e2e',
      projectSettings: scenario.settings,
      layers: scenario.layers,
      objects: scenario.objects,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('生成エフェクトのRust scene変換に失敗しました');
    expect(result.media.map((media) => media.kind)).toEqual([
      'GeneratedGetColorDots',
      'GeneratedHksyCheckerGrid',
      'GeneratedSimpleTube',
      'GeneratedParticle',
      'SolidColour',
    ]);
    const clips = result.project.tracks.flatMap((track) => track.clips);
    expect(clips).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'rust-e2e-particle', kind: 'GeneratedParticlePlane' }),
      expect.objectContaining({
        id: 'rust-e2e-spotlight',
        effects: [expect.objectContaining({ SpotLight: expect.any(Object) })],
      }),
    ]));
    expect(clips.find((clip) => clip.id === 'rust-e2e-particle')).toMatchObject({
      start_frame: 0,
      duration_frames: 300,
      source_frame_offset: 0,
    });
  });

  it('重量検証用に各種類12個・計60個を一意なIDで構築してRust変換できる', () => {
    const scenario = buildRustTimelineGeneratedScenario(12);
    const ids = scenario.objects.map((object) => object.id);
    const result = buildEditableRustScene({
      sceneId: 'rust-timeline-generated-heavy-e2e',
      projectSettings: scenario.settings,
      layers: scenario.layers,
      objects: scenario.objects,
    });

    expect(scenario.objects).toHaveLength(60);
    expect(new Set(ids).size).toBe(60);
    expect(scenario.layers).toHaveLength(61);
    expect(result.ok).toBe(true);
  });
});
