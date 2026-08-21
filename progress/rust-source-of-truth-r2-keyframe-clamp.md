# R2 第2スライス: keyframe時刻のclamp規約を統一

## Decision

- `src/utils/keyframes.ts` の `evaluateObjectPositionAtTime`（path B が使う唯一の
  choke point）に、path A（`editableRustScene.ts` の `positionKeyframesForObject`）
  と同じ `normaliseKeyframesForObject` を通した。これにより `keyframe.time` は
  両経路とも `[startTime, startTime + duration]` へ clamp されてから評価される。
- 修正箇所を `evaluateObjectPositionAtTime` に選んだ理由: `evaluateKeyframesPositionAtTime`
  （生の配列を受けて補間するだけの低レベル関数）を直接呼んでいる本番コードは
  `evaluateObjectPositionAtTime` の内部だけだった（`grep` で確認）。
  `sceneHitTest.ts` / `sceneTransforms.ts` / `visionTrackingKeyframes.ts` /
  `PropertyPanel.tsx` / `SceneSelectionDecorationLayer.tsx` / `useStore.ts` は
  すべて `evaluateObjectPositionAtTime` 経由でしか呼んでいないため、この1箇所を
  直すだけで path B の全呼び出し元に修正が伝播する。
- native overlay（path A）が既定 ON（`Viewport.tsx:731` の `!== '0'`）で今日の
  ユーザーが実際に見ている経路のため、**path B を path A の clamp 規約へ寄せる**
  （逆ではない）。タスク側で最初から決定済みの方針を踏襲した。

## Alternatives considered

- **`evaluateKeyframesPositionAtTime` 自体にclampを埋め込む**: 却下。
  この関数は「ソート済み配列を渡せば補間するだけ」という低レベル契約で、
  `object` のstartTime/durationを知らない。呼び出し側で正規化してから渡す
  現行の分担（path Aは`positionKeyframesForObject`内、path Bは今回追加した
  `evaluateObjectPositionAtTime`内）の方が責務が素直。
- **シナリオ側で `realistic-cutaway-video` のkeyframe時刻をduration内に収める**:
  禁止事項として明示されていたため不採用。この不一致は`buildVideo`の
  デフォルトkeyframeテンプレート（`MAIN_DURATION_SECONDS=24`用の
  `[0, 12, 24]`）を、`duration: 16`のcutaway動画がpatchで上書きし忘れて
  そのまま使っている偶発的な不一致だった。ただし偶発的であっても、
  これを直すとR2のこの不具合を検知できるfixtureが消えてしまうため、
  意図的に残す。

## Constraints / Gotchas

- 既存テストで範囲外keyframe時刻を明示的にピン留めしていたものは無かった。
  `src/utils/keyframes.test.ts` / `heavyEffectsStress.test.ts` /
  `rustSceneSnapshotVibration.test.ts` / `editableRustScene.test.ts` /
  `aviutlObjectCopyExt.test.ts` の keyframe 関連テストを全て確認したが、
  いずれも `keyframe.time` を `[startTime, startTime+duration]` の範囲内で
  組んでいた（`heavyEffectsStress.test.ts` は `normaliseKeyframesForObject` を
  先に通してから `evaluateObjectPositionAtTime` に渡しており、finite性だけを
  検証していた）。したがって本修正でテスト内容を書き換えたファイルは無く、
  `npx vitest run` は 251ファイル/1823テスト（既存1822 + 今回追加の回帰テスト1）
  で全緑になった。
- 回帰テストは `src/utils/keyframes.test.ts` に追加した。
  `evaluateObjectPositionAtTime` の出力が `normaliseKeyframesForObject` で
  明示的にclampした配列を`evaluateKeyframesPositionAtTime`に渡した結果と一致し、
  かつ生時刻のまま補間した結果とは一致しないことを確認する。fixture全体を
  使わない小さい自己完結テストなので、`realistic-cutaway-video` のような
  実データに依存せず高速に不具合を検知できる。
- `rust-core/tests/fixtures/ts-evaluation-parity/*.json` を
  `npm run fixture:evaluation-parity` で再生成すると、`realistic-heavy-main.json`
  と `realistic-heavy-cutaway.json` が変化した（`realistic-heavy-titles.json` は
  範囲外keyframeを持つobjectが無いため無変化）。`KNOWN_DIFFERENCES.json` から
  `snapshot.clips[].transform.translation_x` / `translation_y`（各170件）を
  削除し、`cargo test --test ts_evaluation_parity` が緑になることを確認した。
  `effects.length` と `Clipping.*` の4エントリ（各137件）は今回のスライスの
  対象外であり、件数・内容とも変更していない。
- 受け入れ基準を全て満たした: `cargo test`(rust-core) 116 passed / 0 failed
  （変更前と同数）、`ts_evaluation_parity` 緑（`translation_x/y` バケット消滅、
  `effects.length`/`Clipping.*` は137件のまま）、`npx vitest run` 251ファイル/
  1823テスト全緑、`npx tsc --noEmit` exit 0、`npm run codegen:types:check` exit 0。
