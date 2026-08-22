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
| `keyframe-clamp` | `clips[].transform.translation_x` / `_y` | 各 170 | 19.20px / 9.60px |
| `ts-only-animation` | `clips[].effects.length` | 137 | （構造差） |
| `ts-only-animation` | `clips[].effects[].Clipping.{left,right,top,bottom}` | 各 137 | 最大 51.12px |

- `source_frame`: TS は静止メディアに 0 を返し、rust-core は全 clip に経過フレームを返す。規約差。
- `translation_x/y`: keyframe 時刻の clamp 規約差（当初「振動が原因」としたのは誤り。2026-08-22 訂正）。
  **今日のアプリに実在する不具合**で、native overlay と他経路が同じクリップを最大 19.2px ずれて描いている。
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
  2. keyframe 時刻の clamp 規約を揃える。path A は `[startTime, startTime+duration]` へ
     clamp し、path B は生の時刻を使う。**振動フィルタは無関係だった**（2026-08-22 訂正）。
     振動の `rust-core` 実装は依然として計画上の宿題だが、現在どの fixture でも
     行使されていないため、先に振動付きオブジェクトを代表シーンへ足す必要がある。
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

### R3: 編集モデルの正本移管（推定 10-15日）★完了（2026-08-22）

`src/types.ts` の 40+ object kind を `rust-core/src/schema.rs` へ移す。

- object kind ごとに段階移送する。1 コミット 1 kind を原則にする。
  順序は依存の少ないものから: `shape` → `text` → `image` → `video` → `audio` →
  生成系（GetColor / hksy / 93 系）→ `psd` → `group_control` → 3D 系。
  生成系 kind のうち `audio_visualization`/`audio_sphere`/`particle`/
  `barcode`/`puzzle_piece`/`colour_wheel` の6 kindは2026-08-22に移送完了
  （`progress/rust-source-of-truth-r3-generated-batch1.md`）。
  `audio_visualization`/`audio_sphere` は wire 統一（stage 4）を構造的な
  複雑さ（クロスオブジェクト参照を含む共有ワイヤー型）のため見送り、
  型移送のみで完了とした。続けて `gourd`/`gear`/`track_bar`/`pie_chart`/
  `histogram`/`tone_curve` の6 kindも2026-08-22に wire 統一まで完了
  （`progress/rust-source-of-truth-r3-generated-batch2.md`）。続けて
  `getcolor_dot_field`/`hksy_checker_grid`/`region_frame`/`simple_tube`/
  `sphere_dots`/`spherical_field` の6 kindも2026-08-22に移送した
  （`progress/rust-source-of-truth-r3-generated-batch3.md`）。
  `getcolor_dot_field` は `sampleSourceObjectId`/`sampleSourceLayer`
  経由のクロスオブジェクト参照があり `audio_visualization`/`audio_sphere`
  と同じ理由で wire 統一を見送り、型移送のみで完了とした。残り5 kindは
  wire 統一まで完了。続けて `sunburst`/`circular_arrow`/`triangle_bracket`/
  `tartan_check`/`houndstooth`/`yagasuri` の6 kindも2026-08-22に wire 統一
  まで完了した（`progress/rust-source-of-truth-r3-generated-batch4.md`）。
  6 kind ともクロスオブジェクト参照・optional フィールドが無いことを
  確認済み。続けて `paper_airplane`/`asanoha_pattern`/`focus_lines_plus`/
  `random_line_ex`/`contour_trace`/`displacement_poly` の6 kindも
  2026-08-22に wire 統一まで完了した
  （`progress/rust-source-of-truth-r3-generated-batch5.md`）。6 kind とも
  クロスオブジェクト参照・optional フィールドが無いことを確認済み。
  `focus_lines_plus` は `rust-core/src/focus_lines.rs` の
  `focus_lines_frame_bucket_from_source`（wire 文字列を直接パースする
  独立ヘルパー）とフィールド名を共有しており、wire 統一時に追随修正が
  必要だった。続けて `plain_effector_line`/`hologram`/`protractor`/
  `shaking_polygon`/`shattered_sphere` の5 kindも2026-08-22に wire 統一
  まで完了した（`progress/rust-source-of-truth-r3-generated-batch6.md`）。
  5 kind ともクロスオブジェクト参照・optional フィールドが無いことを
  確認済み。この5 kindの着手前に、batch5完了後の追記で
  `native-wgpu-renderer`/`native-overlay` が `media.source` を独自
  `Deserialize` 構造体で直接パースする「第六の消費者」であることが判明して
  いたため（`hologram`/`shaking_polygon`/`shattered_sphere` の3 kind分）、
  rust-backend側の wire 統一と同時に `native-wgpu-renderer/src/{hksy,
  shaking_polygon,shattered_sphere}.rs` のローカル struct・fixture literal
  も追随させた。`shattered_sphere` は TS 側の `gravityX`/`gravityY`/
  `gravityZ` の3フィールドに対し rust-backend/native-wgpu-renderer 双方が
  旧 `gravity: [f32; 3]` 表現を持っていたため、個別フィールドへ分解した。
  **これでR3の生成系 kind 移送は全件完了した**
  （`psd`/`group_control`/3D 系は未着手で残っている）。続けて
  `group_control` kindも2026-08-22に型移送のみで完了した
  （`progress/rust-source-of-truth-r3-group-control-kind.md`）。
  `group_control` は `targetLayerCount` を用いて同一 layer 以下の
  他オブジェクトを走査し評価用 `GroupControl.target_track_ids` や
  transform 積算へ変換するクロスオブジェクト参照を内包するため、
  `audio_visualization`/`getcolor_dot_field` と同じ理由で wire 統一
  （stage 4）は見送った。続けて `psd`/3D 系着手前のバッチAとして
  自己参照型（`SpikeNode`、使い捨て検証後に削除）で ts-rs/schemars が
  追加対処なしに自己参照型を生成できることを確認し、3D 共有値型
  `Vec3`/`StageCamera3D`/`PsdWorldPlacement`/`LipSyncSetting` を
  2026-08-22に型移送した（`progress/rust-source-of-truth-r3-psd-kind.md`）。
  oxidise-engine 統合（`OxidiseStageViewport.tsx`）は3D型を wire ではなく
  TS オブジェクトとして消費していることを確認済み。`EditorMode` は
  `ProjectSettings` 自体が未移送のため見送った。続けて `PsdLayerNode`
  （バッチB）も2026-08-22に移送完了した（`progress/rust-source-of-truth-r3-psd-kind.md`）。
  `PsdLayerStruct` は `buildPsdLayerTree` が `PsdLayerNode` + `activeLayerIds`
  から都度再構築する表示専用の派生ビューであり独立した永続状態ではないと
  判断し、二重の正本を避けるため TS 側の手書き型のまま残した。
  `PsdLayerNode` は再帰構造 `PsdLayerNodeFields`（`children: Vec<Self>`、
  バッチAのスパイクどおり `Box<>` 不要）として移送し、`textureSource`
  （GPU 専用・非シリアライズ）は `PsdLayerNodeRuntimeFields` として TS 側
  だけに残す明示合成型（psd は平坦 intersection パターンの例外）で
  組み立てた。続けて `PsdObject` 本体（バッチC）も2026-08-22に移送完了
  した（`progress/rust-source-of-truth-r3-psd-kind.md`）。
  `PsdObjectFields`（`src`/`filePath`/`width`/`height`/`scale`/
  `rootLayer`/`activeLayerIds`/`lipSync`/`worldPlacement`）を
  rust-core/schema.rs へ追加し、`layerTree`（表示専用の派生ビュー）と
  `file`（ブラウザ `File`、ランタイム専用）は Rust 型に含めず TS 側だけの
  合成フィールドとして残した。`activeLayerIds` はキー順が決定的な
  `BTreeMap<String, bool>` を採用（消費側が構造比較のみでキー順に
  依存しないことを確認済み）。`psd` は `image`/`video` と同じ media kind
  パターンで専用ワイヤー型が無いため stage 3/4（wire統一）は対象外と確認。
  **これで R3 の 40+ kind 編集モデル移送は全件完了した。**
  ただし以下は意図的に未対応のまま次段階へ申し送り: `audio_visualization`/
  `audio_sphere`/`getcolor_dot_field`/`group_control` の4 kindは
  クロスオブジェクト参照・共有ワイヤー型の構造的複雑さにより wire統一
  （stage4）を見送り型移送のみで完了させている。3D系のうち
  `ProjectSettings` 自体（`EditorMode` を含む）は未移送のまま
  （`worldPlacement`/`lipSync`/`Vec3`/`StageCamera3D` は移送済み）。
- 各 kind の移送で、`rustSceneSnapshot.ts` の
  `mediaReferenceForEditableRustScene`（約 870 行のパラメータ写像）から
  対応部分が消えることを確認する。ここが消えないなら移送できていない。
- 編集モデルの型を `rust-core/src/schema.rs` へ移しただけでは、
  `rustSceneSnapshot.ts` 側のフィールド写像コードは消えない。rust-backend が
  評価・描画時に読む「ワイヤー」（`SceneMediaReference.source` の JSON 文字列）
  が別の手書き snake_case 型のままだと、TS 側にその変換ロジックが残り続ける。
  各 kind の移送では、rust-backend 側のデシリアライズ先も rust-core の
  編集モデル型（camelCase, serde）に直接向け直し、ワイヤースキーマ自体を
  統一する必要がある（`shape` kind, 2026-08 で実施。
  `progress/rust-source-of-truth-r3-shape-kind.md` 参照。`text` kind も
  同じ 3 コミット構成で完了、`progress/rust-source-of-truth-r3-text-kind.md`
  参照）。これにより
  `serialiseXxxSource` は「オブジェクトのフィールドをそのまま JSON 化するだけ」
  の薄いパススルーになり、正規化・フォールバックの知識は Rust 側だけに残る。
  ただし、この wire 統一が要るのは `mediaReferenceForObject` に
  その kind 専用の `serialiseXxxSource`（JSON 化された専用ワイヤー型）が
  存在する場合に限る。`image` kind のように `source` が生のファイルパス
  文字列そのもので専用ワイヤー型が最初から存在しない「media kind」では、
  型移送だけで完結し stage 3 は「専用ワイヤーが無いことの確認」に縮む
  （`progress/rust-source-of-truth-r3-image-kind.md` 参照）。`video` kind も
  同じ media kind パターンで完結した
  （`progress/rust-source-of-truth-r3-video-kind.md` 参照）。
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

**進捗（R4-1a・2026-08-22）**: ファイル形式スキャフォールディングの第一歩として
`BaseObject`/`TimelineObject`（42 kind 判別共用体）/`SceneData`/`ProjectSettings`/
`CameraState`/`LayerState` を `rust-core/src/schema.rs` へ追加。詳細は
`progress/rust-source-of-truth-r4-project-file.md` を参照。`ProjectFile` 型・
マイグレーション・IPC・`projectFile.ts` の書き換えは未着手（R4-1b 以降）。

**進捗（R4-1b・2026-08-22）**: `ProjectFile`/`ProjectFileV1`/`ProjectFileVersioned`
（V1/V2 untagged union）を `rust-core/src/schema.rs` へ追加し、
`From<ProjectFileV1> for ProjectFile` で TS 側 `migrateV1ToV2` を移植。
`rust-core/src/project_file.rs` の純粋関数 `project_file_from_json`/
`project_file_to_json_value` と、実プロジェクト fixture によるラウンドトリップ
テスト（`rust-core/tests/project_file_round_trip.rs`）を追加。IPC・
`electron/`・`projectFile.ts` の書き換えは引き続き未着手（R4-2 以降）。詳細は
`progress/rust-source-of-truth-r4-project-file.md` を参照。

**進捗（R4-2・2026-08-22）**: `project_file_from_json` の `format`/`version`
検証を明示チェックへ変更（TS 側 `parseProjectPayloadV2` と同じエラー
意味論）、`serde_json::Value` 経由の精度劣化（f32→f64 拡大で `1.03` が
`1.0299999713897705` 化）を避ける `project_file_to_json_string`/
`_pretty` を新設し、rust-backend RPC（`project.deserialize`/
`project.serialize`）と Electron IPC
（`rust-backend-project-deserialize`/`-serialize`、preload・
`window.rustBackend` 型込み）に配線した。`src/utils/projectFile.ts` の
実際の置き換え（renderer 側消費）は未着手のまま R4-3 へ持ち越し。詳細は
`progress/rust-source-of-truth-r4-project-file.md` を参照。

**進捗（R4-3・2026-08-22）**: `src/utils/projectFile.ts` を上記 IPC 経由の
薄いオーケストレーション層へ縮小（1021 行 → 318 行）。手書き
`parseProjectPayloadV2` 本体・`migrateV1ToV2`・約 40 個のバリデータを
削除し、load/save とも `window.rustBackend.deserializeProjectFile`/
`serializeProjectFile` に一本化（並行 TS 実装は残していない）。
**これで「保存形式（`.uxfd.json` の読み書き）の Rust 移管」（stream-1A）
は完了**。R4 の残り 2 ストリーム（`historySlice` の undo/redo コマンド化、
`agentProject.ts` のレシピ解析移管）は本バッチのスコープ外で未着手のまま。
詳細は `progress/rust-source-of-truth-r4-project-file.md` を参照。

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
