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
}

export const buildEvaluationParityFixtureSet = (): EvaluationParityFixtureSetEntry[] => {
  const scenario = buildRealisticHeavyEditScenario({ ...FIXTURE_PATHS });

  return scenario.scenes.map((scene) => {
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
    };
  });
};

/** 生成物のフォーマット。生成器と drift 検出で同じ文字列にする必要がある。 */
export const serialiseEvaluationParityFixture = (
  entry: EvaluationParityFixtureSetEntry
): string => `${JSON.stringify(entry.fixture, null, 2)}\n`;
