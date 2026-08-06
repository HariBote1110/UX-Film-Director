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

  it('imageカインドを画像オブジェクトへ展開する', () => {
    const project = buildAgentProjectFile({
      ...baseSpec,
      objects: [{
        id: 'photo',
        kind: 'image',
        layer: 'background',
        start: 0,
        duration: 6,
        x: 10,
        y: 20,
        width: 400,
        height: 300,
        src: '/icon.jpg',
      }],
    });
    const photo = project.scenes[0].objects.find((object) => object.id === 'photo');
    expect(photo).toMatchObject({
      type: 'image',
      src: '/icon.jpg',
      width: 400,
      height: 300,
    });
  });

  it('videoカインドを動画オブジェクトへ展開し既定のvolume/mutedを補う', () => {
    const project = buildAgentProjectFile({
      ...baseSpec,
      objects: [{
        id: 'clip',
        kind: 'video',
        layer: 'background',
        start: 0,
        duration: 6,
        width: 640,
        height: 360,
        src: '/clip.mp4',
      }],
    });
    const clip = project.scenes[0].objects.find((object) => object.id === 'clip');
    expect(clip).toMatchObject({
      type: 'video',
      src: '/clip.mp4',
      width: 640,
      height: 360,
      volume: 1,
      muted: false,
    });
  });

  it('audioカインドを音声オブジェクトへ展開する', () => {
    const project = buildAgentProjectFile({
      ...baseSpec,
      objects: [{
        id: 'narration',
        kind: 'audio',
        layer: 'background',
        start: 0,
        duration: 6,
        src: '/narration.wav',
        volume: 0.8,
      }],
    });
    const narration = project.scenes[0].objects.find((object) => object.id === 'narration');
    expect(narration).toMatchObject({
      type: 'audio',
      src: '/narration.wav',
      volume: 0.8,
      muted: false,
    });
  });

  it('image/video/audioのsrc欠落を日本語のエラーで拒否する', () => {
    expect(() => parseAgentProjectSpec({
      ...baseSpec,
      objects: [{ id: 'x', kind: 'image', layer: 'background', start: 0, duration: 1 }],
    })).toThrow('objects[0].src');
  });

  it('shapeのgradientを展開する', () => {
    const project = buildAgentProjectFile({
      ...baseSpec,
      objects: [{
        ...baseSpec.objects[0],
        id: 'bg-gradient',
        gradient: { type: 'radial', colours: ['#08111f', '#000000'], stops: [0, 1], direction: 90 },
      }],
    });
    const bg = project.scenes[0].objects.find((object) => object.id === 'bg-gradient');
    expect(bg).toMatchObject({
      gradient: {
        enabled: true,
        type: 'radial',
        colours: ['#08111f', '#000000'],
        stops: [0, 1],
        direction: 90,
      },
    });
  });

  it('align.x/align.yでプロジェクト中央に配置する', () => {
    const project = buildAgentProjectFile({
      ...baseSpec,
      objects: [{
        id: 'centred',
        kind: 'shape',
        layer: 'background',
        start: 0,
        duration: 6,
        width: 400,
        height: 200,
        shape: 'rect',
        fill: '#ffffff',
        align: { x: 'center', y: 'center' },
      }],
    });
    const centred = project.scenes[0].objects.find((object) => object.id === 'centred');
    expect(centred).toMatchObject({ x: 440, y: 260 });
  });

  it('align:startとpaddingで左上から余白を空けて配置する', () => {
    const project = buildAgentProjectFile({
      ...baseSpec,
      objects: [{
        id: 'padded',
        kind: 'shape',
        layer: 'background',
        start: 0,
        duration: 6,
        width: 100,
        height: 50,
        shape: 'rect',
        fill: '#ffffff',
        align: { x: 'start', y: 'start' },
        padding: 24,
      }],
    });
    const padded = project.scenes[0].objects.find((object) => object.id === 'padded');
    expect(padded).toMatchObject({ x: 24, y: 24 });
  });

  it('relativeToで先に定義したオブジェクトの内側に整列する', () => {
    const project = buildAgentProjectFile({
      ...baseSpec,
      objects: [
        {
          id: 'card',
          kind: 'shape',
          layer: 'background',
          start: 0,
          duration: 6,
          x: 100,
          y: 100,
          width: 800,
          height: 400,
          shape: 'rounded_rect',
          fill: '#0c2033',
        },
        {
          id: 'label',
          kind: 'shape',
          layer: 'title',
          start: 0,
          duration: 6,
          width: 200,
          height: 40,
          shape: 'rect',
          fill: '#ffffff',
          align: { x: 'end', y: 'end' },
          relativeTo: 'card',
          padding: 20,
        },
      ],
    });
    const label = project.scenes[0].objects.find((object) => object.id === 'label');
    expect(label).toMatchObject({ x: 680, y: 440 });
  });

  it('未定義または後方参照のrelativeToを日本語のエラーで拒否する', () => {
    expect(() => buildAgentProjectFile({
      ...baseSpec,
      objects: [{
        ...baseSpec.objects[0],
        id: 'orphan',
        align: { x: 'center' },
        relativeTo: 'missing-card',
      }],
    })).toThrow('relativeTo「missing-card」が見つかりません');
  });

  it('blurフィルターを展開する', () => {
    const project = buildAgentProjectFile({
      ...baseSpec,
      objects: [{
        ...baseSpec.objects[0],
        id: 'bg-blur',
        filters: [{ type: 'blur', strength: 24, quality: 3 }],
      }],
    });
    const bg = project.scenes[0].objects.find((object) => object.id === 'bg-blur');
    expect(bg?.filters).toMatchObject([{
      type: 'blur',
      enabled: true,
      params: { strength: 24, quality: 3 },
    }]);
  });
});
