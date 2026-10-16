/**
 * TS 評価 / rust-core 評価の差分比較で使う fixture の集合定義。
 *
 * 生成器（`scripts/generate-evaluation-parity-fixture.mts`）と drift 検出テスト
 * （`rustSceneEvaluationParityFixtureDrift.test.ts`）の双方がここを見る。
 * 定義が 2 箇所に分かれると、生成物と検証が食い違っても気付けない。
 */
import {
  buildEvaluationParityFixture,
  type EvaluationParityFixtureBuild,
} from '../utils/rustSceneEvaluationParityFixture';
import { buildRealisticHeavyEditScenario } from './realisticHeavyEditScenario';
import { buildEditableRustScene } from '../utils/editableRustScene';
import type { GroupControlObject, LayerState, ProjectSettings, TextObject, TimelineObject } from '../types';

/** frame を間引く歩幅。キーフレーム境界と揃わないよう素数にする。 */
export const EVALUATION_PARITY_FRAME_STEP = 7;

/** 素材パスは snapshot に出ないので、fixture を安定させるため固定のダミーを使う。 */
const FIXTURE_PATHS = {
  videoPath: '/fixtures/interview.mp4',
  proxyPath: '/fixtures/interview.proxy.mp4',
  audioPath: '/fixtures/narration.wav',
  imagePath: '/fixtures/logo.png',
  imageWidth: 1920,
  imageHeight: 1080,
} as const;

export interface EvaluationParityFixtureSetEntry extends EvaluationParityFixtureBuild {
  fileName: string;
  objectCount: number;
  requestedFrameCount: number;
  editableScene: unknown;
}

export const buildEvaluationParityFixtureSet = (): EvaluationParityFixtureSetEntry[] => {
  const scenario = buildRealisticHeavyEditScenario({ ...FIXTURE_PATHS });

  const entries = scenario.scenes.map((scene) => {
    const frameCount = Math.round(scene.duration * scenario.settings.fps);
    const frameIndices: number[] = [];
    for (let frame = 0; frame <= frameCount; frame += EVALUATION_PARITY_FRAME_STEP) {
      frameIndices.push(frame);
    }

    const built = buildEvaluationParityFixture({
      name: scene.id,
      sceneId: scene.id,
      projectSettings: {
        width: scenario.settings.width,
        height: scenario.settings.height,
        fps: scenario.settings.fps,
      },
      layers: scene.layers,
      objects: scene.objects,
      frameIndices,
    });

    return {
      ...built,
      fileName: `${scene.id}.json`,
      objectCount: scene.objects.length,
      requestedFrameCount: frameIndices.length,
      editableScene: {
        graph: { settings: scenario.settings, layers: scene.layers, objects: scene.objects },
        result: buildEditableRustScene({ sceneId: scene.id, projectSettings: scenario.settings, layers: scene.layers, objects: scene.objects }),
      },
    };
  });

  const vibrationSettings: ProjectSettings = {
    width: 1920,
    height: 1080,
    fps: 30,
    sampleRate: 48_000,
  };
  const vibrationLayers: LayerState[] = [
    { id: 'layer-0', name: 'Group', visible: true, locked: false },
    { id: 'layer-1', name: 'Text', visible: true, locked: false },
  ];
  const vibrationText: TextObject = {
    id: 'vibration-text',
    type: 'text',
    name: 'Vibration text',
    layer: 1,
    startTime: 1,
    duration: 1,
    x: 100,
    y: 200,
    rotation: 17,
    scaleX: 1.5,
    scaleY: 0.75,
    opacity: 0.9,
    enableAnimation: true,
    endX: 130,
    endY: 220,
    easing: 'linear',
    text: 'Vibration parity',
    fontSize: 48,
    fontFamily: 'Arial',
    fill: '#ffffff',
    measuredWidth: 360,
    measuredHeight: 60,
    textStroke: { colour: '#000000', width: 5 },
    textShadow: { colour: '#111111', offsetX: -8, offsetY: 3, blur: 10 },
    filters: [
      { id: 'vibration-a', type: 'vibration', enabled: true, params: { strength: 8, speed: 1.5 } },
      { id: 'vibration-disabled', type: 'vibration', enabled: false, params: { strength: 100, speed: 9 } },
      { id: 'vibration-zero-strength', type: 'vibration', enabled: true, params: { strength: 0, speed: 2 } },
      { id: 'vibration-zero-speed', type: 'vibration', enabled: true, params: { strength: 2, speed: 0 } },
      { id: 'vibration-c', type: 'vibration', enabled: true, params: { strength: -3, speed: 0.5 } },
    ],
  };
  const vibrationGroup: GroupControlObject = {
    id: 'vibration-group',
    type: 'group_control',
    name: 'Vibration group transform',
    layer: 0,
    targetLayerCount: 1,
    startTime: 1.4,
    duration: 0.2,
    x: 11,
    y: -6,
    rotation: 23,
    scaleX: 0.8,
    scaleY: 1.2,
    opacity: 0.7,
    enableAnimation: false,
    endX: 11,
    endY: -6,
    easing: 'linear',
  };
  const vibrationObjects: TimelineObject[] = [vibrationGroup, vibrationText];
  const frameIndices = [29, 30, 31, 42, 43, 47, 48, 59, 60];
  const vibrationFixture = buildEvaluationParityFixture({
    name: 'vibration-resident',
    sceneId: 'vibration-resident',
    projectSettings: vibrationSettings,
    layers: vibrationLayers,
    objects: vibrationObjects,
    frameIndices,
  });
  entries.push({
    ...vibrationFixture,
    fileName: 'vibration-resident.json',
    objectCount: vibrationObjects.length,
    requestedFrameCount: frameIndices.length,
    editableScene: {
      graph: { settings: vibrationSettings, layers: vibrationLayers, objects: vibrationObjects },
      result: buildEditableRustScene({
        sceneId: 'vibration-resident',
        projectSettings: vibrationSettings,
        layers: vibrationLayers,
        objects: vibrationObjects,
      }),
    },
  });
  return entries;
};

/** 生成物のフォーマット。生成器と drift 検出で同じ文字列にする必要がある。 */
export const serialiseEvaluationParityFixture = (
  entry: EvaluationParityFixtureSetEntry
): string => `${JSON.stringify({ ...entry.fixture, editable_scene: entry.editableScene }, null, 2)}\n`;
