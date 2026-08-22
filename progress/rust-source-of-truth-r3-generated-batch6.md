# R3 生成系kind移送 バッチ6: plain_effector_line / hologram / protractor / shaking_polygon / shattered_sphere（生成系kind移送 最終バッチ）

## Decision

- 5 kind とも `rust-core/src/schema.rs` に `XxxObjectFields` を追加し、
  `src/types.ts` の対応する `interface` を
  `BaseObject & XxxObjectFields & { type: '...' }` の交差型へ縮小した
  （batch1-5 と同じ基本パターン）。今回はbatch5までと異なり、1kindずつ
  段階的に「schema登録 → codegen+types.ts交差型化 → wire統一(rust-backend
  ＋TSコンシューマ＋必要なら第六の消費者)」の3ステップをコミットし、各kind
  完了後に受け入れゲート（tsc/cargo test 4系統/codegen:types:check/
  fixture parity）を実行した。
- 5 kind ともクロスオブジェクト参照・optional フィールドが無い
  （各 `xxxObjectFactory.ts` を確認済み）ため、batch2-5 と同じく
  全 kind wire 統一（stage 4）まで一括で完了させた。
- 既定値はいずれも `TimelineContextMenu.tsx` から呼ばれる
  `src/utils/objectFactories/xxxObjectFactory.ts` の固定リテラルから採った。
  `width`/`height` は各 factory の固定リテラル
  （plain_effector_line/hologram: 800×450、protractor: 420×240、
  shaking_polygon/shattered_sphere: 360×360）をそのまま採用した。
- 数値フィールドは原則 f32 に統一した。カウント系フィールド
  （`lineCount`/`tileSize`/`radius`(protractor)/`tickStepDegrees`/
  `majorTickStepDegrees`/`decimalPlaces`/`colourMode`/`lineWidth`
  (shaking_polygon)/`vertexCount`/`fixedDiameter`/`repeatCount`/
  `repeatFrequency`/`jitterInterval`）は batch3-5 と同じ理由で u32 とした。
  `seed` フィールドも u32 とした（元の rust-backend 側は i64 だったが、
  他バッチとの一貫性を優先）。
- `shattered_sphere` の重力は、rust-backend/native-wgpu-renderer 側の旧
  `gravity: [f32; 3]` 配列表現をやめ、TS 側が持つ `gravityX`/`gravityY`/
  `gravityZ` の3フィールドをそのままミラーする設計にした。配列添字アクセス
  だと `[f32; 3]` の JSON 表現が `[0, 100, 0]` のような配列になり、
  TS 側の個別プロパティと形が食い違うため。

## Alternatives considered

- **`shattered_sphere` の `gravity` を `[f32; 3]` のまま schema フィールドに
  残し、シリアライザ側で `[object.gravityX, object.gravityY, object.gravityZ]`
  へ変換する**: 却下。他の全 kind が「TS フィールド名をそのままミラーする」
  方針を貫いているのに対し、配列表現だけ変換ロジックを残すのは一貫性を欠く。
  rust-backend・native-wgpu-renderer 双方の配列添字アクセス（`gravity[0]`/
  `gravity[1]`）を個別フィールドアクセスへ書き換えるコストは小さかった。

## Constraints / Gotchas

- **第六の消費者 `native-wgpu-renderer`/`native-overlay` は、batch6 の5 kind
  中 `hologram`/`shaking_polygon`/`shattered_sphere` の3 kind分を自前の
  `Deserialize` 構造体で直接パースしていた**（`plain_effector_line`/
  `protractor` はrust-backend側のみが消費しており対象外だった）。
  各kindのrust-backend側wire統一と同一コミットで
  `native-wgpu-renderer/src/{hksy,shaking_polygon,shattered_sphere}.rs`
  のローカル struct を camelCase へ rename し、`generator` タグ検証を
  削除した。
- **`hksy.rs` の `GeneratedSourceKind` ディスパッチャ**は、batch5時点では
  `generator` フィールドの有無で `hksy_checker_grid`（新形式）と
  `hologram`（旧形式）を振り分けていたが、`hologram` も新形式化すると
  両kindとも `generator` を持たなくなる。`hologram` 固有の必須フィールド
  `tileSize` の有無で振り分ける方式へ変更した
  （`hksy_checker_grid` には存在しないフィールドを選んだ）。
- **`native-wgpu-renderer/tests/bgra_iosurface_target.rs` に、grep対象
  5ファイル＋第六消費者リストのどちらにも現れない旧形式 fixture literal が
  残っていた**（`shaking_polygon` 分）。`cargo test --manifest-path
  native-wgpu-renderer/Cargo.toml` の GPU テストが
  `missing field 'lineWidth'` で失敗したことで発見した。
  `native-wgpu-renderer/src/lib.rs`・`native-overlay/src/lib.rs` の
  テストモジュール内 fixture だけでなく、`tests/` ディレクトリ配下の
  統合テストファイルにも同種の literal が独立して存在しうるため、次に
  同様の作業をする場合は
  `rg -l '"generator":"' native-wgpu-renderer/tests native-overlay/tests`
  のように `tests/` 配下も含めて grep することを推奨する。
- **`shattered_sphere` の重力を配列から個別フィールドへ分解した際、
  rust-backend の `validators.rs` の `.gravity.iter().any(...)` と
  `rust-backend/src/generated/shattered_sphere.rs` の
  `sphere.gravity[0]`/`sphere.gravity[1]`、および
  native-wgpu-renderer の `shattered_sphere.rs` の同種の配列アクセス箇所を
  すべて個別フィールドアクセスへ書き換える必要があった。** 配列型
  フィールドをオブジェクト形式へ変更するときは、validators だけでなく
  実際に消費する frame builder / GPU shader パラメータ組み立て箇所まで
  grep すること。

## 実測（5 kind 全体、最終状態）

| 合格条件 | 結果 |
|---|---|
| `npx tsc --noEmit` | エラー 0 |
| `cargo test --manifest-path rust-core/Cargo.toml` | 全 pass |
| `cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend` | 158 tests pass |
| `cargo test --manifest-path native-wgpu-renderer/Cargo.toml`（macOS） | 全 pass |
| `cargo test --manifest-path native-overlay/Cargo.toml`（macOS） | 全 pass |
| `npm run codegen:types:check` | exit 0 |
| `npm run fixture:evaluation-parity` → `cargo test --test ts_evaluation_parity` | fixture 差分ゼロ、pass |
| `KNOWN_DIFFERENCES.json` | `differences: []` のまま（変化なし） |
| `npx vitest run`（全スイート、kind 1/3/5 完了時点） | 252 files / 1833 tests 全 pass |

## コミット系列（各kindごとに3コミット、計15コミット + 本ドキュメント）

1. `plain_effector_line`: schema追加(5kind分の構造体を一括追加) → codegen登録+交差型化 → wire統一
2. `hologram`: codegen登録+交差型化 → wire統一(第六消費者hksy.rs追随込み)
3. `protractor`: codegen登録+交差型化 → wire統一
4. `shaking_polygon`: codegen登録+交差型化 → wire統一(第六消費者shaking_polygon.rs追随込み、tests/配下の見落とし修正込み)
5. `shattered_sphere`: codegen登録+交差型化 → wire統一(第六消費者shattered_sphere.rs追随込み、gravity配列分解込み)

## 次工程（R3残り: psd / group_control / 3D系）への申し送り

これでR3の**生成系kind移送は全件完了**した。生成系以外に残っている kind は
`psd`・`group_control`・3D系（`worldPlacement` 等、`PsdObject.worldPlacement`
経由で3Dステージに関わるもの）であり、これらは生成系と性質が大きく異なる
ため、着手前に個別調査が必要:

- `psd` (`PsdObject`, `src/types.ts`): `file`/`filePath`/`layerTree`/
  `rootLayer`/`activeLayerIds`/`textureSource`（`ImageBitmap`、JSON化不可）
  など、生成系kindには無い非シリアライズ可能フィールドや複雑なツリー構造
  (`PsdLayerStruct`/`PsdLayerNode`)を持つ。`lipSync`/`worldPlacement`も
  他objectへの参照を伴う可能性がある。rust-core側での表現方針の設計が
  必要（生成系kindのような単純な数値/文字列フィールドの列挙では済まない）。
- `group_control` (`GroupControlObject` と思われるが要確認): 他objectを
  束ねる制御構造のため、本質的にクロスオブジェクト参照を持つ。
  `getcolor_dot_field`/`audio_visualization`等で確立した「型移送のみで
  wire統一は見送る」precedentを踏襲する可能性が高い。
- 3D系: `PsdWorldPlacement`型やその他3Dステージ関連の型（要調査、
  `src/types.ts`の3D関連interface・`oxidise-engine`統合ドキュメント
  `progress/oxidise-engine-integration.md`を参照）。

いずれも生成系kindの確立済みパターン（f32/u32ポリシー、
`#[serde(rename)]`によるcamelCase化、`generator`タグ廃止）は再利用できるが、
クロスオブジェクト参照・非シリアライズ可能フィールド・3D固有の型の扱いは
個別設計が要る。着手前に対象object型の全フィールドと参照関係を洗い出す
ことを推奨する。
