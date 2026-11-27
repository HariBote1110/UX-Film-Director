import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * renderTick flip-flop 回帰防止契約。
 *
 * 重量E2Eの再生区間（約178フレーム）で `Viewport` が196回コミットしていた
 * 原因は、生成効果（GeneratedEffect）の object-id 変化検出だけが
 * `updateSharedRendererGeneratedEffectObjectIds` の供給元を2つ持ち、
 * 毎tick実行される `publishSharedRendererPreviewSession` 内（session の
 * surfaceGate から無条件に収集した値）と、presenter 起動完了コールバック内
 * （`control.generatedEffectObjectIds` — presenter 側は
 * `nativeRenderFrameReady` でゲートされており、native render フレームが
 * 準備できていない tick では空配列を返す）とが、同じ ref を交互に
 * 「まるごと追加→まるごと削除」で上書きし合っていたことだった
 * （2026-06-21 commit c951f8ed で PixiJS 二重描画レース対策として
 * publish 側の即時更新が足された。だが Phase 4 で PixiJS 描画そのものが
 * 撤去された今、この即時更新の存在意義は失われている）。
 *
 * 他の4種（solidColour / image / psd / text）は最初から presenter 完了
 * コールバックのみが単一の供給元であり、flip-flop していなかった。
 * この契約は、生成効果も同じ「presenter 完了コールバックのみが供給元」
 * という単一供給源（SSOT）構造に揃っていることを固定する。
 */

const viewportSource = () => readFileSync(resolve(__dirname, 'Viewport.tsx'), 'utf8');

const extractPublishFunctionBody = (code: string): string => {
  const startMarker = 'const publishSharedRendererPreviewSession = useCallback((';
  const start = code.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const depsEnd = code.indexOf('\n  }, [', start);
  expect(depsEnd).toBeGreaterThan(start);
  return code.slice(start, depsEnd);
};

describe('generated effect object ids: single source of truth', () => {
  it('publishSharedRendererPreviewSession（毎tick実行）は generated effect の object id を更新しない', () => {
    const publishBody = extractPublishFunctionBody(viewportSource());
    expect(publishBody).not.toContain('updateSharedRendererGeneratedEffectObjectIds(');
  });

  it('updateSharedRendererGeneratedEffectObjectIds の呼び出し箇所は presenter 完了コールバック内の2箇所（成功時／前世代フォールバック時）だけになる', () => {
    const code = viewportSource();
    const countCalls = (fnName: string): number =>
      (code.match(new RegExp(`${fnName}\\(`, 'g')) ?? []).length;

    // updateSharedRendererPsdObjectIds / updateSharedRendererTextObjectIds は
    // presenter 完了コールバック内（前世代フォールバック時・成功時）と失敗時
    // リセットの計3箇所のみで呼ばれており、毎tick実行される publish 側の
    // 即時更新を持たない。generatedEffect も同じ配線（presenter 完了
    // コールバック内の2箇所のみ）に揃えるのがこの修正のゴール。
    // ※ psd/text は presenter 起動失敗時の catch ブロックでもリセットされる
    // （+1箇所）が、generatedEffect はその catch ブロックでリセットされない
    // 既存仕様なのでここでは含めない。
    // 確認済みの根拠: sharedRendererGeneratedEffectObjectIdsRef は
    // updateSharedRendererGeneratedEffectObjectIds 内でしか読み書きされず
    // （Viewport.tsx 全体を grep しても他に参照箇所は無い）、renderScene 等
    // 描画内容を決める側では一切参照されない。つまりこの ref は「前回との
    // 差分検出で renderTick を1つ進めるだけ」の変化通知トリガーであり、
    // 描画内容そのもののソースではない。さらに renderTick が上がらなくても
    // renderScene は再生中の currentTime tick（onCurrentTimeTick 経由）や
    // objects 変化のたびに独立して再実行されるため、catch ブロックで
    // このリセットを省いても再描画が漏れることはない（最悪でも presenter
    // 復帰時の updateSharedRendererGeneratedEffectObjectIds 呼び出しで
    // 新しい id 集合との差分を正しく検出できる）。
    // なお、これは presenter 起動失敗時に generatedEffect オブジェクトの
    // 描画内容自体が正しく扱われるかとは別軸の話であり、その点は本テストの
    // 検証対象外。
    expect(countCalls('updateSharedRendererGeneratedEffectObjectIds')).toBe(2);
  });
});
