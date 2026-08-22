# R3 group_control kind移送

## Decision

- `GroupControlObject`（`src/types.ts`）を `rust-core/src/schema.rs` に
  `GroupControlObjectFields` として追加し、`src/types.ts` の
  `GroupControlObject` interface を
  `BaseObject & GroupControlObjectFields & { type: 'group_control' }`
  の交差型へ縮小した（batch1-6 と同じ基本パターン）。フィールドは
  `targetLayerCount: number` の1つのみで、`u32`（カウント系フィールド）
  として `#[serde(rename = "targetLayerCount")]` で camelCase 化した。
  既定値は `Timeline.tsx` の `addGroupControlAt` が生成する固定リテラル
  `0` を採用した。
- **wire 統一（stage 4）は見送り、型移送のみで完了とした**。事前調査
  （`progress/rust-source-of-truth-r3-generated-batch6.md` の申し送り）
  どおり `group_control` は本質的にクロスオブジェクト参照を持つ:
  `src/utils/editableRustScene.ts` の `groupControls` 構築ロジックが
  `targetLayerCount` を用いて「同一 layer 以下にある他オブジェクトを
  走査し、その `track_ids` を集めて Rust 側の評価用 `GroupControl`
  （`rust-core/src/schema.rs` の既存 struct、`Project.group_controls`
  が保持する）の `target_track_ids: Vec<String>` へ変換する」処理を
  行っている。これは単純な数値・文字列フィールドの1:1シリアライズでは
  なく、`audio_visualization`/`audio_sphere`/`getcolor_dot_field` と
  同種の「構造的に想定より複雑」なケースに該当するため、
  R3プランの precedent（型移送のみで打ち切り）を踏襲した。
  `src/utils/sceneTransforms.ts` も同様に `targetLayerCount` を使って
  「同一 layer 以下の他オブジェクトへ group の transform を積算する」
  処理を行っており、これも純粋な wire 変換ではなく編集モデル内の
  他オブジェクト走査ロジックである。

## Alternatives considered

- **`GroupControlObjectFields` を rust-backend 側の評価用 `GroupControl`
  デシリアライズ先へ直接向ける**: 却下。評価用 `GroupControl` は
  `target_track_ids: Vec<String>`（解決済みの track 参照リスト）を
  持つのに対し、編集モデルの `GroupControlObject` は
  `targetLayerCount`（解決前の layer 相対レンジ指定）のみを持つ。
  両者はフィールド形状そのものが異なり、`editableRustScene.ts` の
  解決ロジック（他オブジェクトを layer で走査して track_ids を作る）
  を rust-backend 側へ移植しない限り wire 統一はできない。この解決
  ロジックの移植は評価セマンティクスに踏み込む変更であり、本タスクの
  スコープ（型移送）を超えるため見送った。

## Constraints / Gotchas

- `native-wgpu-renderer`/`native-overlay`（第六の消費者）は
  `group_control` を扱わない。`rg "GroupControl" native-wgpu-renderer/src
  native-overlay/src` はヒット無し（`media.source` の JSON 文字列を
  持つ generative kind とは異なり、`group_control` はそもそも
  `SceneMediaReference.source` を持たない非描画オブジェクトのため）。
- 消費者grepの6グループ（`rustSceneSnapshot.test.ts`、
  `sharedRendererNativeMediaSupport.ts`（+test）、
  `allReadableMedia.e2e.test.ts`、`generated_frame_tests.rs`、
  `rustScenePlaybackController.test.ts`、native-wgpu-renderer/
  native-overlay の deserialiser + `tests/` fixture）を確認したが、
  いずれも `group_control`/`targetLayerCount` への言及は無かった
  （すべて `media.source` を持つ生成系・メディア系 kind 向けの消費者
  であり、`group_control` はそもそも wire 上の `media.source` を
  持たないため対象外）。
- `projectFile.ts` の永続化は他 kind と同様に編集状態全体を
  JSON シリアライズしており、`targetLayerCount` を含む
  `GroupControlObject` 形状は変更していないため、永続化 JSON の形は
  変わらない。

## 実測

| 合格条件 | 結果 |
|---|---|
| `npx tsc --noEmit` | エラー 0 |
| `cargo test --manifest-path rust-core/Cargo.toml` | 全 pass |
| `cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend` | 158 tests pass |
| `cargo test --manifest-path native-wgpu-renderer/Cargo.toml`（macOS） | 全 pass |
| `cargo test --manifest-path native-overlay/Cargo.toml`（macOS） | 99 tests pass |
| `npm run codegen:types:check` | exit 0 |
| `npm run fixture:evaluation-parity` → `cargo test --test ts_evaluation_parity` | fixture 差分ゼロ、pass |
| `KNOWN_DIFFERENCES.json` | `differences: []` のまま（変化なし） |
| `npx vitest run`（全スイート） | 252 files / 1833 tests 全 pass |

## コミット系列

1. `feat: GroupControlObjectFieldsをrust-core/schema.rsへ追加しcodegenへ登録`
2. `feat: GroupControlObjectをGroupControlObjectFields交差型へ縮小`

## 次工程（R3残り: psd / 3D系）への申し送り

これで R3 の生成系kind移送に続き `group_control` も完了した。残るは
`psd`（非シリアライズ可能フィールド・複雑なツリー構造）と3D系
（`worldPlacement` 等）のみで、いずれも `batch6.md` の申し送りどおり
個別の設計調査が必要。
