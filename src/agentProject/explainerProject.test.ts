import { describe, expect, it } from 'vitest';
import explainerSpec from '../../public/agent-projects/explainer.json';
import { buildAgentProjectFile } from './agentProject';

describe('解説動画レシピ', () => {
  it('4つの編集ステップを含むプロジェクトへ展開できる', () => {
    const project = buildAgentProjectFile(explainerSpec);
    const scene = project.scenes[0];
    const objectIds = new Set(scene.objects.map((object) => object.id));
    const textContents = scene.objects
      .filter((object): object is Extract<typeof object, { type: 'text' }> => object.type === 'text')
      .map((object) => object.text);

    expect(project.projectSettings).toMatchObject({ width: 1280, height: 720, fps: 60 });
    expect(scene.duration).toBe(10);
    expect(objectIds).toEqual(new Set([
      'intro-title',
      'step-1',
      'step-2',
      'step-3',
      'step-4',
      'closing-title',
    ]));
    expect(textContents).toEqual(expect.arrayContaining([
      'AIエージェントで動画を作る流れ',
      '1  意図をJSONにする',
      '2  シーンを組み立てる',
      '3  プレビューで確認',
      '4  MP4へ出力',
    ]));
  });
});
