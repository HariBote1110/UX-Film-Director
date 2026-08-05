import { describe, expect, it } from 'vitest';
import {
  buildAgentProjectFile,
  parseAgentProjectSpec,
  type AgentProjectSpec,
} from './agentProject';

const baseSpec: AgentProjectSpec = {
  version: 1,
  project: {
    width: 1280,
    height: 720,
    fps: 60,
    sampleRate: 48_000,
    duration: 6,
  },
  layers: [
    { id: 'background', name: 'Background' },
    { id: 'title', name: 'Title' },
  ],
  objects: [
    {
      id: 'bg',
      kind: 'shape',
      layer: 'background',
      start: 0,
      duration: 6,
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
      shape: 'rect',
      fill: '#08111f',
    },
    {
      id: 'headline',
      kind: 'text',
      layer: 'title',
      start: 0.5,
      duration: 5,
      x: 100,
      y: 200,
      text: 'Agent-ready motion',
      fontSize: 72,
      fill: '#ffffff',
      to: { x: 140, y: 200 },
      easing: 'easeOutCubic',
    },
  ],
};

describe('agent project recipe', () => {
  it('コンパクトなレシピをv2プロジェクトへ展開する', () => {
    const project = buildAgentProjectFile(baseSpec);
    const scene = project.scenes[0];
    const headline = scene.objects.find((object) => object.id === 'headline');

    expect(project.format).toBe('uxfd-project');
    expect(project.version).toBe(2);
    expect(project.projectSettings).toMatchObject({ width: 1280, height: 720, fps: 60 });
    expect(scene.layers.slice(0, 2).map((layer) => layer.name)).toEqual(['Background', 'Title']);
    expect(headline).toMatchObject({
      type: 'text',
      layer: 1,
      startTime: 0.5,
      duration: 5,
      endX: 140,
      endY: 200,
      enableAnimation: true,
      easing: 'easeOutCubic',
    });
  });

  it('同じ入力から決定的なシーンIDを生成する', () => {
    expect(buildAgentProjectFile(baseSpec).activeSceneId).toBe('agent-scene-1');
    expect(buildAgentProjectFile(baseSpec).scenes[0].objects.map((object) => object.id)).toEqual(['bg', 'headline']);
  });

  it('未知のレイヤー参照を日本語のエラーで拒否する', () => {
    expect(() => buildAgentProjectFile({
      ...baseSpec,
      objects: [{ ...baseSpec.objects[0], layer: 'missing-layer' }],
    })).toThrow('オブジェクト「bg」のレイヤー「missing-layer」が見つかりません');
  });

  it('外部JSONのversionと必須フィールドを検証する', () => {
    expect(() => parseAgentProjectSpec({ ...baseSpec, version: 2 })).toThrow('version は 1');
    expect(parseAgentProjectSpec({ ...baseSpec, objects: [] })).toMatchObject({ objects: [] });
    expect(() => parseAgentProjectSpec({ ...baseSpec, project: { ...baseSpec.project, width: 0 } })).toThrow('project.width');
  });
});
