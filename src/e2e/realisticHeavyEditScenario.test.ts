import { describe, expect, it } from 'vitest';
import {
  buildRealisticHeavyEditScenario,
  inspectRealisticHeavyEditScenario,
} from './realisticHeavyEditScenario';
import { buildSharedRendererPreviewPlan } from '../utils/sharedRendererPreviewBridge';
import { isSharedRendererNativeMediaReferenceSupported } from '../utils/sharedRendererNativeMediaSupport';

const paths = {
  videoPath: '/fixtures/4k-source.mov',
  proxyPath: '/fixtures/4k-source.proxy.mp4',
  audioPath: '/fixtures/bed.wav',
  imagePath: '/fixtures/overlay.png',
  imageWidth: 1024,
  imageHeight: 768,
};

describe('現実的な重量編集シナリオ', () => {
  it('複数動画・音声・画像・生成物・テキスト・フィルタを含む3シーンを構築する', () => {
    const scenario = buildRealisticHeavyEditScenario(paths);
    const allObjects = scenario.scenes.flatMap((scene) => scene.objects);
    const types = new Set(allObjects.map((object) => object.type));

    expect(scenario.settings).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 60,
      sampleRate: 48000,
    });
    expect(scenario.activeSceneId).toBe('realistic-heavy-main');
    expect(scenario.scenes).toHaveLength(3);
    expect(scenario.scenes[0].objects.length).toBeGreaterThanOrEqual(32);
    expect(allObjects.length).toBeGreaterThanOrEqual(48);
    expect(types).toEqual(expect.objectContaining(new Set([
      'video',
      'audio',
      'audio_visualization',
      'image',
      'text',
      'shape',
      'particle',
      'getcolor_dot_field',
      'hksy_checker_grid',
      'simple_tube',
      'focus_lines_plus',
    ])));
  });

  it('実編集で壊れやすい参照・キーフレーム・フィルタ・複数動画を含める', () => {
    const scenario = buildRealisticHeavyEditScenario(paths);
    const main = scenario.scenes.find((scene) => scene.id === scenario.activeSceneId);
    const allObjects = scenario.scenes.flatMap((scene) => scene.objects);
    const ids = allObjects.map((object) => object.id);
    const videos = main?.objects.filter((object) => object.type === 'video') ?? [];

    expect(new Set(ids).size).toBe(ids.length);
    expect(videos).toHaveLength(2);
    expect(videos.every((video) => video.filePath === paths.videoPath)).toBe(true);
    expect(videos.every((video) => video.proxyFilePath === paths.proxyPath)).toBe(true);
    expect(allObjects.some((object) => (object.keyframes?.length ?? 0) >= 3)).toBe(true);
    expect(allObjects.some((object) => (object.filters?.length ?? 0) >= 3)).toBe(true);
    expect(allObjects.some((object) => typeof object.groupId === 'string')).toBe(true);
    expect(allObjects.some((object) => object.type === 'audio' && object.filePath === paths.audioPath)).toBe(true);
    expect(allObjects).toContainEqual(expect.objectContaining({
      type: 'audio_visualization',
      targetAudioId: 'realistic-main-audio',
    }));
    expect(allObjects.some((object) => object.type === 'image' && object.filePath === paths.imagePath)).toBe(true);
    expect(
      allObjects
        .filter((object) => object.type === 'getcolor_dot_field')
        .every((object) => (
          object.sampleSourcePath === paths.imagePath
          && object.sampleSourceObjectId === undefined
        )),
    ).toBe(true);
    expect(allObjects.find((object) => object.type === 'image')).toMatchObject({
      width: 1024,
      height: 768,
    });
  });

  it('構築結果の破損を機械判定できる', () => {
    const scenario = buildRealisticHeavyEditScenario(paths);
    const report = inspectRealisticHeavyEditScenario(scenario);

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.sceneCount).toBe(3);
    expect(report.objectCount).toBeGreaterThanOrEqual(48);
    expect(report.uniqueObjectIdCount).toBe(report.objectCount);
    expect(report.nonFiniteNumberCount).toBe(0);
    expect(report.danglingReferenceCount).toBe(0);
  });

  it('代表フレームを共有レンダラーで描画・書出しでき、黒画面へ退化しない', () => {
    const scenario = buildRealisticHeavyEditScenario(paths);
    const activeScene = scenario.scenes.find((scene) => scene.id === scenario.activeSceneId);
    expect(activeScene).toBeDefined();

    const plan = buildSharedRendererPreviewPlan({
      enabled: true,
      projectSettings: scenario.settings,
      layers: activeScene!.layers,
      objects: activeScene!.objects,
      time: 2,
    });
    expect(plan).toMatchObject({ mode: 'sharedRenderer' });
    if (plan.mode !== 'sharedRenderer') throw new Error('shared renderer plan is required');
    expect(
      plan.media
        .filter((reference) => reference.kind !== 'Video')
        .filter((reference) => !isSharedRendererNativeMediaReferenceSupported(reference))
        .map((reference) => ({ id: reference.id, kind: reference.kind })),
    ).toEqual([]);
  });
});
