# R3 `psd` kind移送・準備（バッチA）

## Step 0: 自己参照型スパイクの結果

`PsdLayerNode`（バッチB）は `children: PsdLayerNode[]` のような自己参照構造を持つ想定のため、
先に `struct SpikeNode { children: Vec<SpikeNode> }` で ts-rs / schemars が自己参照型を
問題なく生成できるか使い捨て検証した（検証後は完全に削除、コードは残さない）。

### 結果：**追加の対処なしでそのまま動く**

- `#[derive(TS, JsonSchema)]` を付けた `Vec<SpikeNode>` フィールドだけで、
  素の `Vec<SpikeNode>`（`Box<SpikeNode>` や `#[ts(...)]` の特別な属性は不要）。
- 生成された TS: `export type SpikeNode = { children: Array<SpikeNode>, };`
  → 自己参照な型として文法的に正しく、`tsc --noEmit` もエラーなしで通過。
- 生成された JSON Schema: `children.items` が `{ "$ref": "#" }`（ルート自身への参照）。
  schemars は循環をルート `$ref` で正しく表現しており、展開ループや不正な出力は無い。
- `cargo run --bin codegen_types` もエラーや警告なく完走。

### バッチBへの示唆

`PsdLayerNode` はそのまま `Vec<PsdLayerNode>` 形の子要素フィールドを持たせて設計してよい。
`Box<>` でラップする必要はない（`Vec` 自体がヒープ間接参照のため無限サイズにならない）。
ts-rs/schemars 側の追加ワークアラウンドは不要と判断し、この点はバッチBのリスクから外せる。

## Step 0.5: 3D系型の消費者調査（read-only）

`rg "stageCamera3D|worldPlacement|StageCamera3D|PsdWorldPlacement|billboard" src electron rust-backend rust-core`
で確認した消費者は以下（すべて `src/` 配下、`electron/`・`rust-backend/`・`rust-core/` 側は未着手でヒットなし）。

- `src/store/useStore.ts`, `src/store/storeTypes.ts`, `src/store/slices/historySlice.ts`
  — Zustand ストア内で `StageCamera3D` を state として保持。`createDefaultStageCamera3D` /
    `sanitiseStageCamera3D`（`src/utils/sceneState.ts`）で生成・サニタイズ。
- `src/utils/projectFile.ts` — プロジェクト永続化。`worldPlacement`/`stageCamera3D` は
  **永続化される** フィールドであり、構造チェック関数 `isStageCamera3D` / `isPsdWorldPlacement`
  （手書きの構造検証、独自の型ガード）を通してロード時に検証・サニタイズしている。
- `src/utils/stage3d/*`（`stageCameraSyncPolicy.ts`, `orbitCamera.ts`, `hitTest.ts` 等）、
  `src/utils/psdBillboardSync.ts`, `src/utils/stage3dMath.ts`
  — 3D ステージのカメラ同期・ビルボード計算ロジック。すべて TS の値として演算するのみ。
- `src/components/OxidiseStageViewport.tsx` — oxidise-engine 統合コンポーネント。
  `PsdWorldPlacement` / `StageCamera3D` を **props の型** として受け取り、JS オブジェクトとして
  oxidise-engine 側 API（`syncBillboards(entries, stageCamera)` 等）に渡している。
  IPC/wire 経由のシリアライズは行っておらず、**プロセス内の通常の TS オブジェクトとして**
  消費している（wire representation ではない）。
- `src/agentProject/agentProject.ts`, `src/i18n.ts`, `src/App.tsx`, `src/components/PropertyPanel.tsx`
  — 型参照のみ、または UI 表示用。
- `src/e2e/realisticHeavyEditHarness.ts` / `realisticHeavyEditScenario.ts` — E2E フィクスチャで
  `stageCamera3D` を含むシーンデータを構築。

### 結論

- oxidise-engine 統合（`OxidiseStageViewport.tsx`）は 3D 型を **wire 越しではなく TS オブジェクトとして**
  消費しているため、型定義の移送（手書き interface → 生成型の re-export）は挙動に影響しない。
- 一方で `projectFile.ts` は **JSON 永続化** の対象であり、`worldPlacement` / `stageCamera3D` の
  JSON shape はバイト互換を維持する必要がある。今回の移送は型定義（TS 型）のみの置き換えで
  ランタイムのシリアライズ形は変えないため、既存の `projectFile.test.ts` のラウンドトリップ
  テストで担保する。

## Step 1: 型移送（`Vec3` / `StageCamera3D` / `PsdWorldPlacement` / `LipSyncSetting`）

- `rust-core/src/schema.rs` に4型を追加（`serde(rename_all = "camelCase")` 方針を踏襲）。
- `LipSyncSetting.mapping` はネストされた固定フィールド構造体 `LipSyncMapping` として表現
  （`{ a, i, u, e, o, n }` の6フィールド、すべて `String`）。
- `LipSyncSetting.audioId: Option<String>`（`string | null` 相当。クロスオブジェクト参照だが
  過去の precedent（`getcolor_dot_field` 等）と同様、型移送のみで解決ロジックには触れない）。
- `PsdWorldPlacement` の `enabled`/`rotationYDeg`/`scale`/`billboard` は必須フィールド（TS 側で
  `?:` が付いていないため `Option` 化しない）。
- `EditorMode`（`'2d' | '3d_stage'`）は `ProjectSettings.editorMode?: EditorMode` の1箇所でのみ
  参照されており、`ProjectSettings` 自体はまだ rust-core 側に移送されていないため、今回のスコープ
  （`Vec3`/`StageCamera3D`/`PsdWorldPlacement`/`LipSyncSetting`）には含めずリスクを避けて見送った。
  Rust 側の enum 定義自体は用意しても `ProjectSettings` を跨がないと意味が薄いため、
  `ProjectSettings` 移送のタイミングで再検討する。
