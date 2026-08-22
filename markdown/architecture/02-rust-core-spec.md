# Rust Core 仕様

## 目的

`rust-core` は UX Film Director vNext の編集モデル・保存形式・時間評価・コマンド/undo の
唯一の正本である（`Rust_Source_Of_Truth_Plan.md` R0-R4、★2026-08-22 全完了）。UI、レンダラ、
sidecar は `rust-core` の評価結果に従う。

実装コードは正本ではない。正本はこの仕様書とテストスイートである。この文書は仕様レベルの
記述にとどめ、網羅的な API 一覧は載せない。個々の型・関数は `rust-core/src/` のソースを
参照すること。

**この文書は元々「MVP 仕様」として書かれたものを、R0-R4 で実装が実際に到達した範囲へ
更新したものである。** 以下の節は実装済みの全体像を記述する。MVP 時代の記述で今も
成立するもの（時間表現の原則、premultiplied alpha 等）はそのまま残し、規模が変わった
箇所（object kind 数、command の構成）は実装値に更新した。

## モデル概要

現在の `rust-core/src/schema.rs` が持つモデル:

- project（`ProjectFile`、V1/V2 のバージョン管理、`ProjectSettings`、`SceneData`）
- 42 kind の判別共用体 `TimelineObject`（`shape`/`text`/`image`/`video`/`audio`/
  生成系（GetColor/hksy/93 系）/`psd`/`group_control`/3D 系など。個別 kind の仕様は
  各 `progress/rust-source-of-truth-r3-*.md` を参照）
- track / layer（`LayerState`）
- keyframe / property
- command / undo（二層構成、下記「Command / Undo」参照）
- agent project（レシピ解析、下記「Agent Project」参照）
- validation

`ProjectSettings` 自体（`EditorMode` を含む）は本計画のスコープでは未移送のまま TS 側に
残っている（3D の `worldPlacement`/`lipSync`/`Vec3`/`StageCamera3D` は移送済み）。

## 時間表現

`rust-core` では float 秒を正本にしない。

正本の時間表現は以下のどちらかとする。

- 整数 frame index
- rational time base

MVP では、project の `fps` を rational として表現し、timeline evaluation の入力は整数 frame index を基本にする。UI が秒表示を必要とする場合のみ、表示用に秒へ変換する。

禁止:

- project model の正本として `f32` / `f64` 秒を保存する。
- keyframe time の正本として float 秒を使う。
- golden-frame の時刻指定に float 秒を使う。

理由:

- `30000/1001` などのフレームレートで drift を避ける。
- 同じ project と同じ frame index の評価を決定的にする。
- preview / export / golden の frame selection を一致させる。

## MVP 時代の縦スライス仕様（歴史的記述、現在も成立する部分のみ有効）

以下の「Project」〜「Command / Undo（MVP）」の各節は、当初の parity spike 用 MVP
（project/track/clip/property/keyframe/command/undo の最小縦スライス）を記述したもので、
`rust-core/src/schema.rs` が実際に持つ 42 kind の `TimelineObject` モデルの前段にあたる。
時間表現・alpha 合成などの原則は今も正本として有効だが、「1 track のみ」「clip 種別は
video/image/solid colour のみ」「effect は LinearGain のみ」といった数量的な制約は
R3（編集モデル移管）で既に超えられている。実装済みの全体像は「モデル概要」節と、
本節のあとの「Timeline Evaluation（実装）」以降を参照。

### Project

Project は timeline、media references、colour metadata を持つ。

MVP では以下だけを必須とする。

- project id
- version
- canvas width / height
- fps numerator / denominator
- tracks
- media references
- colour pipeline metadata

### Track

MVP では 1 track のみを対象にする。ただし schema は複数 track に拡張できる形にする。

### Clip

MVP では以下の clip 種別だけを対象にする。

- video plane
- image plane
- solid colour plane（Phase5 の既存 UI bridge では矩形 shape の最小表現として使用）

Clip は以下を持つ。

- id
- media reference id
- start frame
- duration frames
- transform
- opacity
- keyframes
- effects

MVP の `transform` は以下の幾何値と sampling mode で表現する。

- `translation_x`
- `translation_y`
- `scale_x`
- `scale_y`
- `rotation_degrees`
- `sampling`（`nearest` / `bilinear`）

既定値は identity transform（translation 0、scale 1、rotation 0、sampling `nearest`）とする。

`bilinear` は renderer が texture sample を sRGB encoded RGBA8 から linear light へ decode し、linear light 上で補間してから合成する。encoded sRGB 値を直接補間してはならない。

### Solid Colour Plane

Phase5 の既存 UI bridge では、`shapeType: "rect"` かつ gradient 無しの shape を `SolidColour` media と
`SolidColourPlane` clip として扱う。`rust-core` は `SceneSnapshot + SceneMediaReference + CanvasSize` から、
premultiplied colour の矩形 draw list と WebGPU vertex buffer 用の float 配列を生成する。

この経路の責務:

- `#rrggbb` colour source の parse。
- clip opacity を掛けた premultiplied colour の生成。
- SceneSnapshot 境界では finite translation / positive finite scale / finite rotation を保持する。
- 旧 solid-colour vertex helper は限定的なpreview補助として残し、実出力はnative render pathで扱う。
- canvas pixel 座標から clip-space 座標への変換。

円、丸角、anti-aliasing coverage はまだ別 gate とし、既存 bridge では
fail-loud または Pixi fallback に留める。

### Video Plane Geometry

Phase5 の動画移行は、まず `Video` media と `VideoPlane` clip から plane metadata と WebGPU vertex buffer 用の
float 配列を Rust/WASM で生成するところから開始する。

この経路の責務:

- `Video` media だけを抽出し、z order 順に video plane を並べる。
- `clip_id` / `media_id` / `source_frame` / `opacity` / `z_index` を renderer 境界へ渡す。
- canvas pixel 座標から clip-space 座標へ変換し、texture UV と opacity を含む vertex 配列を生成する。

この段階では、動画フレームの decode、YUV->RGB、色 metadata 正規化、WebGPU external texture sampling はまだ
Rust の責務ではない。動画フレームの実描画は、次 gate で readiness 診断、preview decode / export decode 比較、
external texture 表示、sidecar decode の順に移す。

### Video Frame Decode Request

Phase5 の動画移行では、video plane geometry の次に `SceneSnapshot + SceneMediaReference` から
`VideoFrameDecodeRequest` を Rust/WASM で生成する。

この経路の責務:

- `Video` media だけを抽出し、z order 順に decode request を並べる。
- `clip_id` / `media_id` / `source` / `source_frame` / `timeline_frame` / `width` / `height` を保持する。
- `source_rate` を rational (`numerator` / `denominator`) として保持し、float 秒を sidecar 境界へ渡さない。
- MVP の decode output を `rgba8Srgb`、colour contract を `rec709SrgbFullRange` に固定する。
- Video media に `source_rate` が無い場合、または `0/x`、`x/0` の場合は fail-loud にする。

この段階でも frame bytes は Rust/WASM から browser へ返さない。Rust/WASM は「どの source のどの frame を
どの colour contract で要求するか」を決めるだけで、実 pixel decode は `rust-backend` / sidecar の責務とする。
shared renderer の正確性経路では、将来的に sidecar decoded RGBA -> shared memory / mmap -> WebGPU texture
upload を使う。`HTMLVideoElement` / `importExternalTexture` は parity source ではなく、将来の近似 fast path として
別 gate に隔離する。

### Property

MVP の keyframe 対象 property は `opacity` を既定とする。`position` や `scale` は schema 上の拡張余地を持つが、MVP の必須実装にはしない。

### Effect

MVP の effect は `LinearGain` のみを実装する。

- `LinearGain { gain }`

`gain` は linear light 上の per-pixel 乗算係数として renderer が解釈する。`rust-core` は effect の順序と値を
scene snapshot に渡すが、pixel 演算そのものは renderer の責務とする。

## Timeline Evaluation

指定 frame index に対して、`rust-core` は評価済み scene snapshot を返す。

MVP の評価結果:

- 可視 clip の一覧
- 各 clip の media reference
- 各 clip の evaluated opacity
- 各 clip の transform
- 各 clip の effects
- clip の z order
- colour metadata

scene snapshot は renderer に渡す境界契約である。MVP では snapshot 自体が project の `colour` metadata を持ち、
各 evaluated clip が transform と effects を持つ。transform keyframe は MVP では扱わず、clip の静的 transform を
そのまま渡す。

評価は決定的でなければならない。同じ project と同じ frame index に対して、常に同じ評価結果を返す。

## Keyframe Evaluation

MVP では linear interpolation を実装する。

必須仕様:

- keyframe より前の時刻では最初の値を返す。
- keyframe より後の時刻では最後の値を返す。
- keyframe の境界時刻では keyframe の値を正確に返す。
- 2 つの keyframe 間では linear interpolation を行う。
- keyframe time は frame index または rational time で表現する。
- NaN / infinite / 負 duration は validation で拒否する。

MVP のエフェクト:

- per-pixel gain / exposure 系の単純な linear light 演算を採用する。
- blur、gaussian、scale、warp などの空間 sampling 系エフェクトは MVP に含めない。
- 最初の parity spike では、色の正しさと texture sampling 差を混ぜない。

## Command / Undo

MVP では UI を持たないが、`rust-core` は command と undo の基礎を持つ。

必須 property:

- `undo(do(state)) == state`
- redo 後の state は do 後の state と一致する。
- command 適用は validation を通過した state だけを生成する。

MVP の最初の command は `SetClipOpacity` とする。command 適用は入力 `Project` を破壊せず、新しい `Project` と
逆操作用の undo command を返す。対象 clip が存在しない場合、または適用後 state が validation を通らない場合は失敗する。

## Timeline Evaluation（実装）

R2（評価ロジックの一本化、★2026-08-22 完了）以降、`scene.evaluate` 経路（`timeline.rs`）が
評価の唯一の正本である。TS 側に評価ロジックを持つ経路（旧 `rustSceneSnapshot.ts` の
evaluation 部分）は撤去済み。評価は 42 kind の `TimelineObject` すべてに対して行う。

評価が対象とする値: keyframe 補間、easing、可視性判定、group transform（振動を含む）、
subject crop、filter stack（`Clipping` 等のアニメーション込み）。`source_frame` は
静止メディアも含めて全 clip に「clip 開始からの経過フレーム」を返す規約に統一されている
（TS 側が静止メディアに `0` を返していた旧規約は R2 で廃止）。

`rust-core/tests/ts_evaluation_parity.rs` が「経路 A（`scene.evaluate`）と経路 B の
記録済み出力」との一致を CI で常設検証する。既知差分は
`rust-core/tests/fixtures/ts-evaluation-parity/KNOWN_DIFFERENCES.json` でラチェット管理し、
R2 完了時点で空（`[]`）。

## Command / Undo（実装、二層構成）

R4（★2026-08-22 完了）で `command.rs` は MVP の `SetClipOpacity` 単体から、
`historySlice.ts` が実際にスナップショットしていた対象（`SceneData` = `objects`/
`layers`/`camera`/`stageCamera3D`）を扱う二層構成へ拡張された。

1. **汎用フィールドコマンド**: `Command::SetObjectField { object_id, field, next, previous }`。
   42 kind 共通のフィールド編集を 1 コマンドで表現する。`SetClipOpacity` はこれへ fold し廃止済み。
2. **構造コマンド**: `AddObject`/`RemoveObject`（index 保持で invert 対称性を厳密に固定）、
   `SetLayerState`/`ReorderLayers`、`AddFilter`/`RemoveFilter`/`ToggleFilterEnabled`/
   `MoveFilter`/`UpdateFilterParams`（`filterStack.ts` の編集操作に 1:1 対応。適用末尾で
   `sync_legacy_effects_with_filters` を呼び、`colorCorrection`/`customClipping`/
   `vibration`/`shadow`/`gradient` の legacy ミラーフィールドも同期する）、`SetCamera`/
   `SetStageCamera3D`。
3. **`Command::Batch { commands }`**: 複数オブジェクトへ同時作用する UI 操作（提案時点の
   ADR-014 では想定していなかった）を 1 コマンドとして扱う。apply は all-or-nothing、
   invert は逆順 + 各要素 invert。入れ子 Batch と空 Batch は `CommandError` で拒否。

`undo(do(state)) == state` は実フィクスチャ由来の `SceneData` と実在する (object, field)
ペアの網羅で proptest 検証している。TS 側 `historySlice.ts` は command stack 方式
（`pastCommands`/`futureCommands`）へ全面移行済みで、undo/redo は `command.apply` IPC
往復の非同期処理。詳細は `progress/rust-source-of-truth-r4-commands.md` /
`-r4-7b-command-batch.md` / `-r4-8-command-ipc.md` / `-r4-filter-stack.md` を参照。

`layerTrackOps.ts` の swap/insert/delete track 系リマップ計算は、複雑な object.layer
リマップのため意図的に TS 側へ残っている（`Rust_Source_Of_Truth_Plan.md` の
「思想上の残り（責務台帳）」項目 3 を参照）。

## Project File API（実装）

R4-1〜R4-3（★2026-08-22 完了）で `.uxfd` 保存形式の読み書きを `rust-core/src/project_file.rs`
へ移管した。

- `ProjectFile`/`ProjectFileV1`/`ProjectFileVersioned`（V1/V2 の untagged union）を
  `schema.rs` に定義し、`From<ProjectFileV1> for ProjectFile` で旧 TS `migrateV1ToV2` を移植。
- 純粋関数 `project_file_from_json`/`project_file_to_json_value`/
  `project_file_to_json_string`/`_pretty` を提供する。JSON Value 経由の精度劣化
  （f32→f64 拡大で小数が変化する問題）を避けるため、文字列直接生成の経路を別途用意している。
- `format`/`version` 検証は TS 側 `parseProjectPayloadV2` と同じエラー意味論を踏襲する。
- `rust-backend` の RPC `project.serialize`/`project.deserialize` 経由で Electron IPC
  （`rust-backend-project-serialize`/`-deserialize`）に配線されており、TS 側
  `src/utils/projectFile.ts`（1,021行 → 318行に縮小）はこの IPC を呼ぶ薄いオーケストレーション
  層（ファイル選択ダイアログ・IPC 呼び出しのみ）に徹する。
- 合格条件: `load -> save -> load` の round-trip identity、既存 `.uxfd` ファイルの読込互換。
  `rust-core/tests/project_file_round_trip.rs` が実プロジェクト fixture で検証する。

## Agent Project API（実装）

R4-4/R4-5（★2026-08-22 完了）で、エージェント用レシピ（`public/agent-projects/*.json`）の
解析・組み立てを `rust-core/src/agent_project.rs` へ移管した。実行時の唯一の正は
`parse_agent_project_spec`（判別共用体 `AgentProjectSpec` を解析）/
`build_agent_project_file` である（`AGENTS.md` もこの記述に更新済み）。

- `schema/agent-project.schema.json` は `codegen_types` の `schemars` 生成物に置換した。
  手書き版にあった `additionalProperties: false` 等の制約は生成物には出ないが、
  実際のパーサーはもともとそこまで厳格ではなかった既知の乖離として記録している。
- `rust-core/src/bin/agent_validate.rs`（CLI）が `npm run agent:validate` の実体になった。
- renderer（`src/main.tsx`）は実行時に `agent.buildProjectFile` RPC（`project.*` と同じ
  IPC パターン）を呼ぶ。`src/agentProject/agentProject.ts` はその薄い非同期デリゲーション
  のみ（566行 → 79行に縮小）。

## PSD Meta Parsing（実装）

R5（★2026-08-22 完了）で PSD 解析を `rust-backend/src/psd_fast.rs` の 1 実装に統一し、
`ag-psd` 依存を撤去した（詳細は ADR-015、`progress/rust-source-of-truth-r5-psd-unification.md`）。

- RPC は `psd.parseMeta`（meta-only、レイヤーツリー・`activeLayerIds` 等の構造情報のみ返す）
  1 本に統一。実ピクセルデコードは対象外。
- `PsdFastResult` は `depth` を露出し、8bit 以外（16-bit/32-bit）を明示拒否する
  （ag-psd 経路も `depth: 8` を決め打ちしていたため既存動作からの後退ではない）。
- `PsdObjectFields`（`src`/`filePath`/`width`/`height`/`scale`/`rootLayer`/
  `activeLayerIds`/`lipSync`/`worldPlacement`）と再帰構造 `PsdLayerNodeFields`
  （`children: Vec<Self>`）は `rust-core/src/schema.rs` へ移送済み。`activeLayerIds` は
  キー順が決定的な `BTreeMap<String, bool>`。表示専用の派生ビュー（`layerTree`）と
  ブラウザ `File` 実体・GPU 専用テクスチャは TS 側だけの合成フィールドとして残る
  （二重の正本を避けるための意図的な設計）。
- CI 用 e2e パリティゲート（`npm run test:psd-import:e2e`、
  `src/e2e/psdImportParityHarness.ts`）が、実 Electron + 実 rust-backend で実 PSD を
  インポートし、R5-3 パリティベースラインとレイヤーツリー構造・`activeLayerIds` を
  厳密比較する。

## Validation

Project load 時に不正データを拒否する。

MVP で拒否するもの:

- 空 id
- 重複 id
- 負の duration
- NaN / infinite
- fps numerator <= 0
- fps denominator <= 0
- canvas width / height <= 0
- media reference を持たない clip
- transform の NaN / infinite
- effect parameter の NaN / infinite
- keyframe time の不正 rational
- start frame / duration frames の不正値

## Serialization

`load -> save -> load` の round-trip は identity でなければならない。

schema 進化のため、version field を必須にする。未知の将来 field は原則として無視できるが、MVP では round-trip に必要な field を落としてはならない。

## 音声時間モデル

MVP では音声の実装を行わない。ただし仕様上は、将来の音声時間評価を `rust-core` に置く。

将来の責務:

- clip と audio source の対応
- timeline time から source sample time への変換
- mute / volume / gain automation
- A/V sync metadata

音声再生・ミックスの実装は MVP に含めない。

## テスト方針

`rust-core` は GPU や OS に依存しないため、厳密一致テストを行う。

浮動小数点を使う評価では fast-math や FMA 再順序化に依存しない。プラットフォーム間で厳密一致を期待する処理は、演算順序と丸めをテストで固定する。

必須テスト:

- project model serialize round-trip
- timeline evaluation の決定性
- keyframe の境界値
- keyframe の linear interpolation
- property-based test による rational time / frame index 入力の決定性、単調性、有限値保証
- command undo / redo
- validation error
