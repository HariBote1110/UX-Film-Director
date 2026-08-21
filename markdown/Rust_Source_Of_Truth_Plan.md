# Rust 正本集中 実装計画

最終更新: 2026-08-22

## 位置づけ

`architecture/00-overview.md` の基本方針 1・2・8 —

> 1. 編集状態と時間評価の正本は Rust に置く。
> 2. React/Zustand は UI 状態を持つが、編集モデルの正本にはしない。
> 8. JavaScript が独自に WGSL や scene logic を持つ構成にはしない。

— は現時点で **満たされていない**。本計画はその差分を埋めるまでの道筋を定める。

`Windows_Port_Plan.md` と同時期に走る計画であり、両者の順序関係は §3 で定める。

Single Source of Truth: 本ファイル。設計判断は確定し次第
`architecture/01-decision-record.md` へ ADR-014 以降として転記する。

本計画の「現在地」はすべてリポジトリ実物の読解に基づく。推測は「未確認」と明記する。

## 0. ゴールと非ゴール

### ゴール

- 編集モデル・保存形式・時間評価の正本を `rust-core` に一本化する。
- TypeScript の型を Rust からの **生成物** にし、手動ミラーを廃止する。
- 描画実装（WGSL 含む）を Rust 側の 1 本にし、TS 内蔵 WGSL を削除する。
- PSD 解析を自前 Rust 実装の 1 本にし、`ag-psd` 依存を落とす。
- 上記のすべてを、既存の見た目と export 結果を壊さずに行う。

### 非ゴール

- UI を Rust 化すること。React / Electron は UI シェルとして残す（ADR-002 を維持）。
- Zustand を廃止すること。選択状態・パネル開閉・ズーム・ドラッグ中の一時値といった
  **UI 状態**は TS が持ち続ける。移すのは編集モデルと評価だけ。
- 3D ステージ（`oxidise-engine`）の再設計。既に別リポジトリの Rust 実装であり、本計画の対象外。
- 機能追加。本計画は純粋に正本の移動であり、新しい object kind やエフェクトは足さない。

## 1. 現在地（実測で確定していること）

### 1.1 正本マップ（As-Is）

| 事実 | 現在の実質正本 | Rust 側の状態 | 二重か |
|---|---|---|---|
| 編集モデル（40+ object kind） | `src/types.ts` (1,109行) | `rust-core/src/schema.rs` (430行) に手動ミラー | 二重 |
| 保存形式 `.uxfd` | `src/utils/projectFile.ts` (1,021行) | 無し | TS 単独 |
| イージング関数 | `src/utils/easings.ts` (136行) | `rust-core/src/keyframe.rs::evaluate_easing` | **二重（同一関数群）** |
| キーフレーム評価 | `src/utils/keyframes.ts` (174行) | `rust-core/src/keyframe.rs` + `timeline.rs::evaluate_frame` | **二重** |
| 可視性判定 | `src/utils/objectVisibility.ts` (25行) | `timeline.rs` 内 | 二重 |
| グループ変換・振動 | `src/utils/sceneTransforms.ts` (69行) | `timeline.rs` の `GroupControl` | 二重 |
| フィルタスタック | `src/utils/filterStack.ts` (1,008行) | `schema.rs::Effect` enum のみ（評価は無し） | 部分二重 |
| scene snapshot 構築 | `src/utils/rustSceneSnapshot.ts` (2,722行) | 受け取るだけ | TS 単独 |
| preview 描画 | `src/utils/sharedRendererWebGpuPresenter.ts` (1,484行・**WGSL 内蔵**) と native overlay | `native-wgpu-renderer` (11,748行) | **二重** |
| PSD 解析 | `ag-psd`（Worker + main thread fallback） | `rust-backend/src/psd_fast.rs` (3,191行) | **二重** |
| 音声ミックス | `src/utils/audioMixdown.ts` (243行) | 無し | TS 単独 |
| エージェント用レシピ | `src/agentProject/agentProject.ts` (566行) | 無し | TS 単独 |
| コマンド / undo | `src/store/slices/historySlice.ts` | `rust-core/src/command.rs` (54行, MVP のみ) | 実質 TS 単独 |

規模: TypeScript 約 116,000 行（うちテスト 250 ファイル）に対し Rust 約 62,000 行。

### 1.2 決定的な事実: 評価経路が 2 本走っている

現在、同じ「フレーム t の評価済みシーン」を作る経路が 2 本ある。

```text
経路A（Rust 評価）
  Zustand → editableRustScene.ts → EditableRustProject
    → scene.replace(project) → rust-core::evaluate_frame → scene.evaluate(frame)

経路B（TS 評価）
  Zustand → rustSceneSnapshot.ts（keyframes/easings/visibility/sceneTransforms/filterStack を
            TS 側で評価）→ 評価済み SceneSnapshot → Rust へ渡す
```

`rust-core::timeline.rs` の `evaluate_frame` と、`rustSceneSnapshot.ts` が
`evaluateObjectPositionAtTime` などを呼んで作る結果は、**同じものを別実装で計算している**。
イージング関数に至っては `easings.ts` と `keyframe.rs::evaluate_easing` に
同じ 30 種以上が並んでいる。

本計画の中核は「経路 B を消して経路 A に一本化する」ことである。

### 1.3 副次的に判明したこと

- **`psd-wasm` クレートは現在デッドコード。** `src/wasm/psd/` の成果物を含め、
  TS からの import が 1 箇所も無い。名前が紛らわしいが `src/utils/psdWasm.ts` は
  ag-psd を Web Worker で回す実装であり、Rust とは無関係。
- **native overlay は既定 ON。** `Viewport.tsx:731` は
  `VITE_UXFD_NATIVE_OVERLAY !== '0'` の opt-out 判定で、
  `Windows_Port_Plan.md` Phase 7 の「`VITE_UXFD_NATIVE_OVERLAY=1` で opt-in」という記述は古い。
  Windows 側の記述を修正する必要がある。
- `rust-core-wasm` が公開しているのは 5 関数だけで、
  solid colour / video plane の頂点生成と decode request 生成に限られる。
  wasm 経路は正本移管の受け皿としてはほぼ空。
- `scene.evaluate` の実測コストは 0.4〜4ms（`src/e2e/realisticHeavyEditSecondPlaybackStart.ts`）。
  評価を Rust に寄せても RPC 往復が支配的にはならない見込みだが、
  UI ハンドルの 60fps 追従に耐えるかは未確認（§7 の設計判断 4）。

## 2. 目標状態（To-Be）

```text
Electron / React
  UI 状態のみ（選択、パネル、ズーム、ドラッグ中の一時値）
  編集モデルの型は rust-core からの生成物を import するだけ

rust-core  ★唯一の正本
  project model（全 object kind）
  保存形式 .uxfd の読み書き
  timeline / keyframe / easing / visibility / group transform / filter stack の評価
  command / undo / validation
  ts-rs による TS 型 + JSON Schema 生成

native-wgpu-renderer / shared-renderer  ★唯一の描画実装
  WGSL はここにしか存在しない

rust-backend
  PSD 解析、decode / encode / mux、音声
```

判定基準: 以下がすべて成立したら完了とする。

- `src/` 配下に `@vertex` / `@fragment` を含む文字列が存在しない。
- `src/` 配下に easing 関数・キーフレーム補間・可視性判定の実装が存在しない。
- `package.json` の依存から `ag-psd` が消えている。
- `src/types.ts` の編集モデル型が生成ファイルの re-export になっている。
- 既存の golden-frame parity と E2E export が全て緑のまま。

## 3. Windows 移植計画との関係と全体順序

両計画の唯一の強い結合は **wgpu のバージョン**である。それ以外は軸が違う。

- Windows 移植は「プラットフォーム / GPU / ウィンドウ合成」の軸。
- 本計画は「モデル / 評価 / 型」の軸で、大半は GPU に触れない。

したがって、wgpu 昇格を片付けたあとは並行して進められる。

```text
W0  連続描画の実機検証（1日）                     ┐ 先行。ここで破綻したら W5 の設計を見直す
R0  二重評価の差分ハーネス（1-2日）               ┘ GPU 非依存。W4 の回帰検出にも使うので前倒しする
                    │
                    ▼
W4  wgpu 0.20 → 25（5-10日）★単独レーン  上げ先は 25 で確定済み
    macOS の golden-frame parity が合格条件。ここは他の作業を止める。
    並行作業があると parity 崩壊時の切り分けができなくなる。
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
  Windows レーン            Rust 正本レーン
  W1 → W2 → W3              R1 → R2 → R3 → R4 → R5
  → W5 → W6 → W7                                │
        │                                       │
        └───────────┬───────────────────────────┘
                    ▼
              R6（presenter 削除）→ R7
              W7 完了が前提。両プラットフォームで native overlay が
              既定になるまで TS presenter は消せない。
```

**R0 を W4 の前に置く理由**: R0 が作る差分ハーネスは「同じ project・同じ frame index に対する
評価結果の一致」を見るもので、GPU に依存しない。これは W4 の wgpu 昇格で
scene 構築側に回帰が入っていないことの確認にも使える。1-2 日の投資でレーンをまたいで効く。

**R6 が Windows レーンに人質を取られる点**: R5 までで本計画の価値は大半確定する
（型の二重管理・評価の二重実装・PSD の二重実装がすべて解消する）。
R6 だけは W7 を待つので、そこで一度区切りを入れる。

## 4. フェーズ計画

### R0: 二重評価の差分ハーネス（推定 1-2日）★他フェーズの合格条件 ─ 完了 2026-08-22

移管を始める前に「経路 A と経路 B が今どれだけ違うか」を測る。
これが無いと R2 以降はすべて手探りになる。

- 代表シーン（`src/e2e/realisticHeavyEditScenario.ts` と GetColor/hksy/93 混在シーン）を固定入力にする。
- 同一 project から経路 A（`scene.replace` → `scene.evaluate`）と
  経路 B（`buildRustSceneSnapshotForTimeline`）の両方を回し、
  全フレームで評価済み clip 列を JSON 比較する。
- 差分を「許容できる丸め差」「TS 側にしか無い暗黙仕様」「バグ」に分類して記録する。
  `rustSceneSnapshot.ts` の 2,722 行には UI 都合の暗黙仕様が埋まっている可能性が高く、
  それを洗い出すのがこのフェーズの実質的な目的。
- CI に常設する。以降のフェーズはすべて「このハーネスが緑」を合格条件にする。

成果物: [rust-source-of-truth-evaluation-diff.md](../progress/rust-source-of-truth-evaluation-diff.md)。
ハーネスは `rust-core/tests/ts_evaluation_parity.rs`（比較本体）と
`src/utils/rustSceneEvaluationParityFixtureDrift.test.ts`（fixture の陳腐化検出）の 2 本立て。
再生成は `npm run fixture:evaluation-parity`。

**測定結果: 447 フレームで差分 5,099 件。丸め差は 0 件で、全部が実装差だった。**

| 分類 | フィールド | 件数 | 最大差 |
|---|---|---|---|
| `convention` | `clips[].source_frame` | 4,074 | 1435 frame |
| `ts-only-feature` | `clips[].transform.translation_x` / `_y` | 各 170 | 19.20px / 9.60px |
| `ts-only-animation` | `clips[].effects.length` | 137 | （構造差） |
| `ts-only-animation` | `clips[].effects[].Clipping.{left,right,top,bottom}` | 各 137 | 最大 51.12px |

- `source_frame`: TS は静止メディアに 0 を返し、rust-core は全 clip に経過フレームを返す。規約差。
- `translation_x/y`: 振動フィルタが rust-core に無く、TS が translation へ畳み込んでいる。
- `Clipping`: TS はフレームごとに値を変えるが rust-core は静的値を返す。

既知の差分は `rust-core/tests/fixtures/ts-evaluation-parity/KNOWN_DIFFERENCES.json` で
**ラチェット管理**する。件数が増えたら失敗し、減ったらベースライン更新を促す。R2 でゼロにする。

経路 A が受け付けなかった object は 0 件、経路 B が組めなかった frame も 0 件で、
比較対象の縮退は起きていない。

### R1: 型の codegen 化（推定 3-4日）★完了 2026-08-22

**結果: 完了。** 詳細は [rust-type-codegen.md](../progress/rust-type-codegen.md)。
`ts-rs` で TS 型 22 件、`schemars` で JSON Schema 22 件を生成し、手書きミラーを全廃した。
wire format は不変で R0 の fixture は byte 一致。`npm run codegen:types:check` で drift 検出。

以降のフェーズで型が増えるたびに手動ミラーを書き足すのを止める。**先に入れる。**

- `rust-core` に `ts-rs` を導入し、`schema.rs` の型に `#[derive(TS)]` を付ける。
- 生成先は `src/generated/rustCore/`。`npm run codegen:types` で再生成。
- 既存の手動ミラー — `src/utils/editableRustScene.ts` の
  `EditableRustProject` / `EditableRustClip` 等と、
  `src/utils/rustSceneSnapshot.ts` の `RustSceneSnapshot` / `RustEffect` 等 —
  を生成型に置き換える。この時点ではまだ**値の流れは変えない**。型の出どころを変えるだけ。
- CI に drift 検出を足す（`npm run codegen:types && git diff --exit-code`）。
- JSON Schema も同時に出す（`schemars`）。`schema/agent-project.schema.json` は R4 で生成物に置換する。

**合格条件**: `npx tsc --noEmit` が現状と同じ、R0 ハーネスが緑。

### R2: 評価ロジックの一本化（推定 8-12日）

経路 B を消す。本計画で最も行数が動くフェーズ。

- 削除対象（評価部分のみ）:
  - `src/utils/easings.ts` の `easingFunctions`
  - `src/utils/keyframes.ts` の `evaluateObjectPositionAtTime` 等
  - `src/utils/objectVisibility.ts`
  - `src/utils/sceneTransforms.ts` の `getGroupTransforms` / `getVibrationOffset`
  - `src/utils/subjectCropKeyframes.ts`
  - `src/utils/filterStack.ts` の `getEnabledObjectFiltersInOrder` /
    `getFadeOpacityMultiplier` / `getPrimaryWipeFilter`（**編集操作は R4 まで残す**）
- R0 が特定した 3 クラスを潰す。これが R2 の合格条件そのもの:
  1. `source_frame` の規約を **Rust 側（全 clip に経過フレーム）へ揃える**。
     着手前の確認（renderer が静止メディアの `source_frame` を本当に無視しているか）は
     2026-08-22 に完了し、**寄せてよいと確定した**。静止系は生成関数の引数に
     `source_frame` が無く、キャッシュキーにも入らない
     （[rust-source-of-truth-evaluation-diff.md](../progress/rust-source-of-truth-evaluation-diff.md)）。
     ただし `src/utils/rustSceneSnapshot.test.ts` が静止系ほぼ全種で `source_frame: 0` を
     ピン留めしているので、その更新が実作業の大半になる。
  2. 振動（`sceneTransforms.getVibrationOffset`）を `rust-core` へ移す。
  3. Clipping のアニメーションを `rust-core` へ移す（`effects` の件数差もここで解消する）。
- `rust-core` 側に不足があれば足す。R0 の差分分類で「TS にしか無い暗黙仕様」と判定したものは、
  Rust 側にテスト付きで移送する。**TS のテストを消すだけにしない。**
  評価系の TS テストは Rust のテストとして書き直す（Red を Rust 側で立て直す）。
- `rustSceneSnapshot.ts` は「Zustand の状態から `Project` を組み立てる」だけに縮み、
  評価は `scene.evaluate` の結果を使う形になる。2,722 行の大半が消える見込み。
- UI が評価済み値を必要とする箇所（選択枠の描画、PropertyPanel の現在値表示）は
  `scene.evaluate` の結果を購読する形に付け替える。ここが性能上の要注意点（§7 の設計判断 4）。

**合格条件**: R0 ハーネスが緑（そもそも経路 B が消えるので、ハーネスは
「移管前の経路 B の記録済み出力」と「移管後の経路 A」の比較に切り替える）、
golden-frame parity 維持、既存 E2E export の画素一致。

### R3: 編集モデルの正本移管（推定 10-15日）

`src/types.ts` の 40+ object kind を `rust-core/src/schema.rs` へ移す。

- object kind ごとに段階移送する。1 コミット 1 kind を原則にする。
  順序は依存の少ないものから: `shape` → `text` → `image` → `video` → `audio` →
  生成系（GetColor / hksy / 93 系）→ `psd` → `group_control` → 3D 系。
- 各 kind の移送で、`rustSceneSnapshot.ts` の
  `mediaReferenceForEditableRustScene`（約 870 行のパラメータ写像）から
  対応部分が消えることを確認する。ここが消えないなら移送できていない。
- `src/types.ts` は最終的に生成ファイルの re-export に縮める。
- `objectFactories` は「既定値を持つ側」なので、既定値も Rust に移す
  （`Default` 実装 + 生成型の初期値）。

**合格条件**: R0 ハーネス緑、保存済みプロジェクトの読込互換（R4 で正式化するまでは
既存の `projectFile.ts` が生成型を読める状態を維持）。

### R4: 保存形式・コマンド・レシピの移管（推定 8-12日）

- `projectFile.ts` の読み書きを `rust-core` へ。TS 側はファイル選択ダイアログと
  IPC だけを持つ。バージョン移行（V1→V2 等）のロジックも Rust へ。
- `historySlice` の undo / redo を `rust-core/src/command.rs` へ。
  MVP の `SetClipOpacity` しか無いところに、実際に使われている編集操作を移す。
  `filterStack.ts` の編集操作（`addFilterToObject` 等）もここで command 化する。
- `agentProject.ts` のレシピ解析を `rust-core` へ。
  `AGENTS.md` の「実行時の唯一の正は `src/agentProject/agentProject.ts` の
  `parseAgentProjectSpec`」という記述を Rust 側に書き換える。
  `schema/agent-project.schema.json` は R1 の `schemars` 生成物に置換する。
- `npm run agent:validate` は Rust を呼ぶ薄いラッパにする。

**合格条件**: `load → save → load` の round-trip identity（`02-rust-core-spec.md` の既存要件）、
既存 `.uxfd` ファイルの読込互換、`undo(do(state)) == state`。

### R5: PSD 単一実装化（推定 5-8日）

- まず `psd-wasm` クレートの扱いを決める。**現在デッドコード**なので、
  削除するか `rust-backend/psd_fast.rs` の wasm 版として再生するかを先に確定させる（§7 の設計判断 5）。
- `ag-psd` 経路（`psdWasm.ts` の Worker 実装と `psdParser.ts` の main thread fallback）を
  `psd.parse` / `psd.parseMeta` / `psd.renderComposite` RPC に置き換える。
- 合格条件は借用 VM で進めている PSD parser 研究の結果を使う。
  ag-psd と同等以上（速度・レイヤー名の文字化けを含む互換性）が出ていることを
  代表 PSD（`葵ちゃん.psd` を含む）で確認してから切る。
- `package.json` から `ag-psd` を削除。`src/utils/psdParser.ts` (1,266行) は
  UI 向けのレイヤーツリー構築だけを残して縮む。

**合格条件**: `npm run test:psd-import:e2e` 相当が緑、代表 PSD の目視一致。

### R6: 描画の単一実装化（推定 5-8日）★Windows W7 完了が前提

- `sharedRendererWebGpuPresenter.ts` (1,484行・内蔵 WGSL) を削除し、
  preview 描画を native overlay 経路のみにする。
- 依存している presenter 系ファイル群
  （`sharedRendererPreviewPresenterController.ts` 1,214行、
  `sharedRendererViewportPresenterOrchestration.ts` 426行など）の
  presenter 分岐を畳む。
- **前提**: macOS / Windows の両方で native overlay が既定 ON かつ 24 時間ベンチ済み
  （Windows_Port_Plan W7）。片方でも fallback が要るなら R6 は着手しない。
- `Viewport.tsx` (2,726行) の presenter 分岐が消えることで、
  ADR-003 / 基本方針 8 が実装レベルで満たされる。

**合格条件**: 両プラットフォームで golden-frame parity、
`src/` 配下に WGSL 文字列が 0 件。

### R7: ドキュメント正本の更新（推定 1-2日）

- `architecture/00-overview.md` の層構成を実態に合わせる。
- ADR-014 / 015 / 016（§5）を `01-decision-record.md` へ転記。
- `AGENTS.md` のレシピ正本の記述を Rust 側へ。
- `02-rust-core-spec.md` を「MVP 仕様」から「実装済み全体仕様」へ更新。

## 5. 提案 ADR

ADR-012 は `Windows_Port_Plan.md` が予約済みのため、014 から採番する。

### 提案 ADR-014: `rust-core` を編集モデル・保存形式・評価の唯一の正本とし、TS 型を生成物にする

- **決定**: project model、`.uxfd` 保存形式、timeline / keyframe / easing / visibility /
  group transform / filter stack の評価、command / undo、validation の正本を `rust-core` に置く。
  TypeScript の対応する型は `ts-rs` による生成物とし、手書きしない。
- **理由**: 現在 easing とキーフレーム評価は TS と Rust に同じものが 2 実装あり、
  評価経路も 2 本走っている。preview と export の差異は動画編集アプリで最も避けるべき不具合であり
  （ADR-003 の理由と同じ）、評価が二重にある限り構造的に防げない。
- **却下案 (A)**: TS を正本にして Rust を従属させる。
  export / native overlay / sidecar のすべてが Rust 側にあり、
  正本を TS に置くと毎フレーム TS の評価結果を Rust へ送り続けることになる。現状がそれ。
- **却下案 (B)**: 手動ミラーのまま境界テストで担保する。
  object kind が 40 を超えた時点でテストの網羅コストが実装コストを上回っている。

### 提案 ADR-015: PSD 解析を自前 Rust 実装に一本化し `ag-psd` を落とす

- **決定**: PSD 解析は `rust-backend/src/psd_fast.rs` を唯一の実装とし、
  `ag-psd` 依存と `psdWasm.ts` の Worker 実装を削除する。
- **理由**: 解析実装が 3 つ（ag-psd / デッドコードの `psd-wasm` / `psd_fast.rs`）あり、
  レイヤー名の文字化けのような互換性バグを直すたびに複数箇所を触る必要がある。
- **前提条件**: 借用 VM の PSD parser 研究で ag-psd 同等以上が確認できていること。
  出ていなければ本 ADR は保留する。
- **却下案**: ag-psd を残し Rust をエクスポート専用にする。
  preview と export で PSD の解釈が割れる余地が残る。

### 提案 ADR-016: preview 描画を native overlay 単一経路にし TS WebGPU presenter を廃止する

- **決定**: `sharedRendererWebGpuPresenter.ts` の内蔵 WGSL と描画経路を削除し、
  preview 描画を native overlay（ADR-011 / ADR-013 / ADR-012）のみにする。
- **理由**: `architecture/00-overview.md` 基本方針 8 の実装。
  現状 WGSL が TS 側と `native-wgpu-renderer` の 2 箇所にある。
- **前提条件**: macOS / Windows の両方で native overlay が既定 ON（Windows_Port_Plan W7）。
- **却下案**: presenter を parity 比較用に残す。
  比較用に残すなら「使われない経路を保守し続ける」ことになり、
  実際には parity 検証は golden-frame harness が担っている。

## 6. リスクと退避

| リスク | 影響 | 退避 |
|---|---|---|
| **R2 で `rustSceneSnapshot.ts` に埋もれた暗黙仕様を落とす** | 高 | R0 の差分ハーネスで先に洗い出す。分類できない差分が残る間は R2 に入らない |
| 評価系の TS テストを消して退行検出力が落ちる | 高 | 削除ではなく移送する。Rust 側で Red を立て直してから TS を消す規律を各コミットで守る |
| `scene.evaluate` の RPC 往復が UI 追従に間に合わない | 中 | 実測 0.4-4ms。間に合わなければ napi addon 直呼びへ切替（§7 の設計判断 4）。R2 の早期に測る |
| R3 の 40+ kind 移送が長期化し他の開発を止める | 中 | 1 コミット 1 kind。途中で止めても TS と Rust が混在した状態で動くように設計する |
| `ag-psd` 廃止で PSD 互換性が落ちる | 中 | 借用 VM の研究結果を合格条件にする。出ていなければ ADR-015 を保留し R5 を飛ばす |
| R6 が Windows W7 待ちで無期限に延びる | 中 | R5 で一度区切り、本計画の価値を確定させる。R6 は独立した後続扱いにする |
| codegen 生成物のコミット運用が崩れる | 低 | CI で drift 検出（`git diff --exit-code`）。生成物はコミットする（§7 の設計判断 2） |
| W4 の wgpu 昇格と R レーンが同時進行して切り分け不能になる | 中 | W4 は単独レーンにする。§3 の順序を守る |

## 7. 工数感

| Phase | 内容 | 推定 |
|---|---|---|
| R0 | 二重評価の差分ハーネス | 1-2日 |
| R1 | 型の codegen 化 | 3-4日 |
| R2 | **評価ロジックの一本化** | **8-12日** |
| R3 | **編集モデルの正本移管** | **10-15日** |
| R4 | 保存形式・コマンド・レシピの移管 | 8-12日 |
| R5 | PSD 単一実装化 | 5-8日 |
| R6 | 描画の単一実装化（W7 前提） | 5-8日 |
| R7 | ドキュメント正本の更新 | 1-2日 |

**本計画のみで 41-63 営業日。** R2 / R3 が支配的。

`Windows_Port_Plan.md` の 17-27 日と合わせると、両計画の合計は **58-90 営業日**。
ただし §3 のとおり W4 以降は並行できるため、直列合計にはならない。
R5 までで区切る場合（R6 / R7 を後続扱い）は本計画 35-53 日。

## 8. 着手前に確定したい設計判断

1. **`ts-rs` か `schemars` + quicktype か。**
   `ts-rs` は Rust の型から直接 TS を出す。`schemars` は JSON Schema を経由するため
   レシピ用スキーマと共通化しやすい。両方入れる案もある（`ts-rs` で TS 型、`schemars` で Schema）。
2. **生成物を git にコミットするか、ビルド時生成にするか。**
   コミットする案を推す（差分がレビューに乗る、Rust ツールチェーン無しで `npm install` が通る）。
3. **R2-R4 の間の「二重運転期間」をどこまで許すか。**
   object kind ごとに片方ずつ移す以上、混在期間は必ず発生する。
   混在中に R0 ハーネスをどう扱うか（kind 単位で allowlist を持つか）を決める。
4. **`rust-core` の評価をどの経路で呼ぶか。**
   現状の `scene.evaluate` RPC（実測 0.4-4ms）／napi addon 直呼び／wasm の 3 択。
   UI ハンドルの 60fps 追従が要件に入るかで答えが変わる。R2 の最初に実測して決める。
5. **`psd-wasm` クレートを削除するか再生するか。**
   現在デッドコード。ブラウザ側で PSD を解析する要件が今後あるかによる。
6. **`.uxfd` の後方互換をどこまで保証するか。**
   R4 で保存形式の正本が移るときに、既存ファイルの読込互換をどのバージョンまで保つか。

## 9. 関連文書

- `Windows_Port_Plan.md` — 並行して走る計画。順序関係は本文書 §3 が正本
- `architecture/00-overview.md` — 層構成と基本方針（R7 で更新する）
- `architecture/01-decision-record.md` — ADR-014/015/016 の転記先
- `architecture/02-rust-core-spec.md` — `rust-core` の振る舞い仕様（R7 で MVP 記述を更新する）
- `architecture/04-render-parity.md` — 全フェーズの合格条件
- `AGENTS.md` — レシピ正本の記述（R4 で更新する）
- `progress/INDEX.md` — 決定ログ
