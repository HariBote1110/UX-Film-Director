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

## バッチB: `PsdLayerNode` の Rust 正本移送（2026-08-22）

### `PsdLayerStruct` vs `PsdLayerNode` の重複調査と判断

着手前に `PsdLayerStruct`（`seq`/`checked`/`isRadio`/`blobUrl`、
`PropertyPanel.tsx` の `renderPsdTree` が表示に使う）が `PsdLayerNode` の
兄弟型として重複していないかを調査した。

**証拠**:
- `src/utils/psdParser.ts` の `buildPsdLayerTree(rootNode, activeLayerIds)` /
  `toLayerStruct` は `PsdLayerNode` ツリーと `activeLayerIds` から
  `PsdLayerStruct[]` を**都度再構築**する純粋関数。`seq` は `isGroup` なら
  `null`、そうでなければ `node.id`。`checked` は `isGroup` なら常に
  `true`、そうでなければ `activeLayerIds[node.id]`。どちらも `PsdLayerNode`
  側の値から導出でき、`PsdLayerStruct` 独自の状態は持たない。
- `src/utils/projectFile.ts` の `restorePsdObjectFromFile` は
  プロジェクトロード時に `nextLayerTree = buildPsdLayerTree(...)` を
  **必ず呼び直して**保存済み `layerTree` を上書きする（保存済みの値を
  信頼しない）。`sanitiseObjectForSave` も `rootLayer` だけを
  `stripPsdLayerNodeForPersistence` で剥がし、`layerTree` はそのまま
  JSON 化するだけで独自の正規化ロジックを持たない。
- 結論として `PsdLayerStruct` は「編集可能な永続状態」ではなく、
  `PsdLayerNode`（+ `activeLayerIds`）から都度導出される**表示専用の
  派生ビュー**。二重の正本を作らないため、`PsdLayerStruct` は TS 側の
  手書き型のまま残し、`PsdLayerNode` のみを rust-core 側の正本
  （`PsdLayerNodeFields`）へ移送した。

### 型移送

- `rust-core/src/schema.rs` に自己参照構造体 `PsdLayerNodeFields`
  （`children: Vec<PsdLayerNodeFields>`、バッチAのスパイクどおり
  `Box<>` 不要）を追加。`id`/`name`/`children`/`width`/`height`/`left`/
  `top` は素の camelCase 名でリネーム不要、`isGroup`/`isRadio`/
  `defaultVisible` のみ `#[serde(rename = ...)]` + `#[ts(rename = ...)]`
  が必要（既存の `ImageObjectFields` 等と同じ命名規約）。
- `src?: string` は `Option<String>` + `#[serde(default,
  skip_serializing_if = "Option::is_none")]`（`missing key` と
  `null`/`undefined` の区別を維持）。
- `textureSource?: ImageBitmap`（GPU 専用・非シリアライズ）は Rust 側に
  含めない。TS 側は psd を「平坦な intersection ではなく明示的な合成」の
  唯一の例外として扱う設計を踏襲し、
  `PsdLayerNodeRuntimeFields { textureSource?: ImageBitmap }` を別レイヤーに
  分離、
  `PsdLayerNode = Omit<PsdLayerNodeFields, 'children'> & PsdLayerNodeRuntimeFields & { children: PsdLayerNode[] }`
  として組み立てる（`children` は自己参照のため `Omit` してから
  `PsdLayerNode[]` として付け替える必要がある）。
- `rust-core/src/bin/codegen_types.rs` に `PsdLayerNodeFields` の TS
  export と JSON Schema 書き出しを登録し `npm run codegen:types` で再生成。
- **健全性の実地確認**: 生成済み `src/generated/rustCore/PsdLayerNodeFields.ts`
  にフィールドを1個手動追加した状態で `npx tsc --noEmit` を実行し、
  `PsdLayerNode` を使う全消費者（`psdParser.ts` / `projectFile.ts` /
  `projectFile.test.ts` / `remoteDeckSelectionContext.ts` /
  `remoteDeckSelectionContext.test.ts`）で
  `Property 'extraField' is missing in type ... 'Omit<PsdLayerNodeFields, "children">'`
  エラーが出ることを確認してから元に戻した。合成型がフィールド増減を
  正しく tsc エラーとして伝播することを裏付けた。

### 永続化互換性（最大リスク）の担保

- 型移送の前に `src/utils/projectFile.test.ts` へ
  「PSD-bearing project の `rootLayer`/`layerTree`/`activeLayerIds` が
  保存 → JSON 往復 → 復元まで完全に一致する」テストを追加（Red 相当の
  安全網、追加前後で常に green）。`textureSource` を含むノードを保存し、
  `stripPsdLayerNodeForPersistence` 後の JSON に `textureSource` という
  文字列が一切含まれないこと、`src` は明示的に保持されること、
  `rootLayer` 全体が期待する厳密な key 集合と一致すること
  （`toEqual` による missing-key vs null の区別込みの厳密比較）、
  `haveMatchingPsdLayerShape` 経由の `activeLayerIds` 復元が
  `psd.activeLayerIds` と一致することを確認した。
- 型移送後も同テストおよび既存の
  `maps saved PSD active layer state from legacy ids onto restored stable ids`
  テストが green のまま。

### 合格条件

`npx tsc --noEmit` / `cargo test --manifest-path rust-backend/Cargo.toml`
（フィルタなしフル実行、64+2+3(ignored)+5 件すべて green）/
`cargo test --manifest-path rust-core/Cargo.toml`（既存件数のまま green）/
`npm run codegen:types:check`（差分は新規 `PsdLayerNodeFields.ts` の
追加のみ、コミット済み）/ `npm run fixture:evaluation-parity` +
`cargo test --manifest-path rust-core/Cargo.toml --test ts_evaluation_parity`
（`KNOWN_DIFFERENCES.json` は差分ゼロのまま）/ `npx vitest run`
（252ファイル / 1834件 = 既存1833件 + 追加1件、すべて green）。

### バッチC（`PsdObjectFields`）への申し送り

- `PsdObject` 自体（`file`/`filePath`/`src`/`width`/`height`/`scale`/
  `layerTree`/`rootLayer`/`activeLayerIds`/`lipSync`/`worldPlacement`）は
  未着手。`rootLayer?: PsdLayerNode` と `layerTree?: PsdLayerStruct[]` は
  今回の移送でそれぞれ生成型ベースの `PsdLayerNode` / 手書きの
  `PsdLayerStruct[]` を指す形のまま変化していないため、バッチCでは
  `PsdObjectFields` に両方をそのままフィールドとして持たせればよい
  （`layerTree` は表示専用ビューだが `PsdObject` 上のフィールドとしては
  引き続き JSON に載る点に注意）。
- `activeLayerIds?: Record<string, boolean>` はクロスオブジェクト参照は
  無いが、キー集合が動的（レイヤーIDに依存）なので `HashMap<String, bool>`
  として移送すれば足りる。
- `lipSync?: LipSyncSetting` / `worldPlacement?: PsdWorldPlacement` は
  バッチAで既に移送済みの型をそのまま `Option` で参照すればよい。
- `stripPsdLayerNodeForPersistence` / `haveMatchingPsdLayerShape` /
  `restorePsdObjectFromFile` は今回のバッチBの範囲では変更していない
  （型参照は `PsdLayerNode` のままで shape 互換）。バッチCで
  `PsdObject` 自体の構造が変わる場合は、今回追加した
  `projectFile.test.ts` のラウンドトリップテストが回帰検知に使える。

## バッチC: `PsdObject` 本体の Rust 正本移送（2026-08-22）

R3の`psd` kind移送・生成系kind移送を含む「40+ kind移送」の最終スライス。

### 型移送

- `rust-core/src/schema.rs` に `PsdObjectFields`（`src`/`filePath`/`width`/
  `height`/`scale`/`rootLayer: Option<PsdLayerNodeFields>`/
  `activeLayerIds: Option<BTreeMap<String, bool>>`/
  `lipSync: Option<LipSyncSetting>`/`worldPlacement: Option<PsdWorldPlacement>`）
  を追加。`layerTree`（バッチBの結論どおり表示専用の派生ビュー）と
  `file`（ブラウザ `File`、ランタイム専用）はこの型に**含めない**。
- `activeLayerIds` は `HashMap` ではなく `BTreeMap<String, bool>` を採用
  （バッチB申し送りどおり）。**根拠**: `projectFile.test.ts` の
  `round-trips a PSD-bearing project` テストは保存後の JSON を
  `JSON.parse(JSON.stringify(...))` してから `toEqual` で構造比較しており、
  オブジェクトキーの列挙順には依存しない。`restorePsdObjectFromFile` /
  `mergeRestoredPsdActiveLayerIds` も `Object.entries`/
  `Object.prototype.hasOwnProperty` でアクセスするのみでキー順に依存する
  ロジックは無い。よって `BTreeMap`（ソート順）と手書き `Record`
  （挿入順が変わりうる）の間でJSONのキー並びがズレても、消費側の shape
  互換は保たれる。バイト互換ではなく shape 互換が必要十分という設計判断を
  ここで確定させ、`rust-core/tests/psd_object_schema.rs` の
  `psd_object_fields_serialise_with_camel_case_field_names` で
  ソート順シリアライズを固定テストにした。
- `PsdObject` は「平坦な intersection ではなく明示的な合成」というバッチBの
  例外パターンを踏襲し、
  `BaseObject & Omit<PsdObjectFields, 'rootLayer'> & PsdRuntimeFields & { type: 'psd'; rootLayer?: PsdLayerNode; layerTree?: PsdLayerStruct[] }`
  として組み立てた（`src/types.ts`）。`PsdRuntimeFields { file?: File }` を
  新設し、`rootLayer` は生成型ベースの `PsdLayerNodeFields` ではなく
  TS 側 `PsdLayerNode`（`textureSource` 込み）へ差し替え、`layerTree` は
  Rust 型を持たないため素の追加フィールドとして残した。
- Default は `image` kind と同じ「ファイル由来フィールドはニュートラルな
  空値」パターンに従うが、`scale` だけは `src/utils/psdParser.ts` の
  4つの構築箇所すべてで `scale: 1.0` の固定リテラル（ファイル由来ではない
  真の既定値）であるため `Default` にもその値を反映した。psd は
  toolbar からの新規追加が無く常に PSD ファイルの解析結果から構築される
  （専用の `objectFactories/psdObjectFactory.ts` は存在しない）ため、
  Default は主に schema 網羅性のテスト用途。

### stage 3/4（wire統一）は対象外

`rustSceneSnapshot.ts` の `mediaReferenceForObject` を確認したところ、
`psd` は `image`/`video` と同じ media kind パターンで、`SceneMediaReference`
の `active_layer_ids: Vec<String>`（`solid_colour_scene.rs` 既存）に
直接詰めるのみで `serialisePsdSource` のような専用ワイヤー型は最初から
存在しない。したがって `image`/`video` kind の precedent どおり、
stage 3（rust-backend側デシリアライズ先の統一）・stage 4（wire統一）は
「専用ワイヤーが無いことの確認」で完結する。

### 永続化互換性の担保

- 事前に確認した既存の
  `round-trips a PSD-bearing project (rootLayer/layerTree/activeLayerIds) with an identical JSON shape`
  テスト（バッチBで追加済み）は `scale`/`worldPlacement` を含む
  `minimalPsdWithWorldPlacement()` ベースで、型移送前後とも green のまま。
  `PsdObject` レベルのフィールド（`scale`/`worldPlacement`/`lipSync`）は
  既存テスト・`round-trips PSD worldPlacement through JSON payload` テストで
  カバー済みと確認したため、バッチCでの追加テストは不要と判断した。
- `sanitiseObjectForSave`/`restorePsdObjectFromFile` のロジックは無変更
  （型参照のみ `PsdObject` の新しい合成型に切り替わる）。

### 合格条件（すべて green、2026-08-22）

`npx tsc --noEmit` / フル `cargo test --manifest-path rust-core/Cargo.toml`
/ フル `cargo test --manifest-path rust-backend/Cargo.toml` / フル
`cargo test --manifest-path native-wgpu-renderer/Cargo.toml` / フル
`cargo test --manifest-path native-overlay/Cargo.toml` /
`npm run codegen:types:check`（差分は新規 `PsdObjectFields.ts` の追加のみ、
コミット済み）/ `npm run fixture:evaluation-parity` +
`cargo test --manifest-path rust-core/Cargo.toml --test ts_evaluation_parity`
（`KNOWN_DIFFERENCES.json` は差分ゼロのまま）/ `npx vitest run`
（252ファイル / 1834件、既存件数のまま green）。

### R3全体の完了判定

これで `psd` kind（バッチA/B/Cすべて）を含む R3 の 40+ kind 編集モデル移送が
全件完了した。`markdown/Rust_Source_Of_Truth_Plan.md` の R3 セクションを
★完了として更新する。ただし以下は**意図的に未対応のまま**（R3の合格条件
「R0ハーネス緑・保存済みプロジェクトの読込互換」自体には抵触しない、
将来のwire統一/クロスオブジェクト参照解決タスクとして残置）:

- `audio_visualization`/`audio_sphere`: 共有ワイヤー型の構造的複雑さにより
  wire統一（stage4）を見送り、型移送のみで完了。
- `getcolor_dot_field`: `sampleSourceObjectId`/`sampleSourceLayer` 経由の
  クロスオブジェクト参照があり同様にwire統一を見送り。
- `group_control`: `targetLayerCount` 経由のクロスオブジェクト参照
  （同一layer以下の他オブジェクト走査）があり同様にwire統一を見送り。
- 3D系（`EditorMode`/`ProjectSettings` そのもの）は `ProjectSettings` 自体が
  未移送のためR3スコープ外のまま（`worldPlacement`/`lipSync` は移送済み）。
