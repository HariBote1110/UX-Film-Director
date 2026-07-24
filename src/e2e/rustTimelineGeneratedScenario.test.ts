import { describe, expect, it } from 'vitest';
import { buildEditableRustScene } from '../utils/editableRustScene';
import { buildRustTimelineGeneratedScenario } from './rustTimelineGeneratedScenario';

describe('Rust常駐タイムライン生成エフェクトシナリオ', () => {
  it('GetColor・HKSY・SimpleTubeだけを重ならない領域へ構築する', () => {
    const scenario = buildRustTimelineGeneratedScenario();

    expect(scenario.objects.map((object) => object.type)).toEqual([
      'getcolor_dot_field',
      'hksy_checker_grid',
      'simple_tube',
    ]);
    expect(scenario.objects.map((object) => object.id)).toEqual([
      'rust-e2e-getcolor',
      'rust-e2e-hksy',
      'rust-e2e-simple-tube',
    ]);
    expect(scenario.objects.every((object) => object.duration === 5)).toBe(true);
    expect(new Set(scenario.objects.map((object) => object.layer)).size).toBe(3);
  });

  it('3エフェクトを未対応issueなしでRust Projectへ変換できる', () => {
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
    ]);
  });

  it('重量検証用に各種類12個・計36個を一意なIDで構築してRust変換できる', () => {
    const scenario = buildRustTimelineGeneratedScenario(12);
    const ids = scenario.objects.map((object) => object.id);
    const result = buildEditableRustScene({
      sceneId: 'rust-timeline-generated-heavy-e2e',
      projectSettings: scenario.settings,
      layers: scenario.layers,
      objects: scenario.objects,
    });

    expect(scenario.objects).toHaveLength(36);
    expect(new Set(ids).size).toBe(36);
    expect(scenario.layers).toHaveLength(37);
    expect(result.ok).toBe(true);
  });
});
