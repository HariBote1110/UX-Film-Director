# R3 三番目のスライス: `image` kind の編集モデルを rust-core へ移す

## Decision

- `rust-core/src/schema.rs` に `ImageObjectFields`（`src` / `filePath` /
  `width` / `height`）を追加した。`shape` / `text` と同じく編集モデルは
  TS 側の既存命名（camelCase）を保つため `#[serde(rename = "filePath")]` /
  `#[ts(rename = "filePath")]` を付けた。
- `ImageObjectFields::default()` は **ニュートラルな空値**にした
  （`src: ""`, `file_path: None`, `width: 0.0`, `height: 0.0`）。
  `shape`/`text` は `Timeline.tsx` の `addShapeAt`/`addTextAt` が固定既定値を
  生成していたが、`image` は `handleImageChange`（`src/components/Timeline.tsx:351`）
  がファイル選択ダイアログで選ばれた実ファイルの実サイズから
  `src`/`filePath`/`width`/`height` をその場で決めており、`objectFactories/`
  にも専用ファイルが無い。つまり「今日のアプリに実在する既定値」がそもそも
  存在しない kind であり、shape/text の Default 方針をそのまま持ち込めない。
- `src/types.ts` の `ImageObject` は
  `BaseObject & ImageObjectFields & { type: 'image' }` に縮めた。手書きの
  `interface ImageObject` は削除し、生成型からのフィールドに置き換えた。

## Alternatives considered

- **`ImageObjectFields::default()` に何らかの「典型的な画像サイズ」を
  持たせる（例: 640x480 のような仮値）**: 却下。shape/text の Default は
  「UI が今日生成している既定値と一致させる」ことが目的だったが、image には
  一致対象となる既定値が UI 側に存在しない。存在しない既定値をでっち上げると
  「UI 都合の値を Rust 側が勝手に決める」ことになり、正本移管の趣旨に反する。
  ニュートラルな空値（0 / 空文字列 / None）の方が「値は常に呼び出し側が
  与える」という実態を正確に表す。

## Constraints / Gotchas

- **`image` には wire 統一フェーズ（stage 3）が実質適用されない。**
  shape/text の wire 統一は「編集モデルのフィールドを JSON 化した文字列」
  （`GeneratedShapeSource`/`GeneratedTextSource` 相当）を rust-backend が
  デシリアライズする形だったが、`image` の `RustSceneMediaReference.source`
  は **JSON ではなく生のファイルパス文字列そのもの**
  （`mediaSourceForObject` = `object.filePath || object.src || ''`）。
  `rustSceneSnapshot.ts` の `mediaReferenceForObject` に `image` 専用の
  分岐は無く、デフォルトの media 分岐（`mediaKindForObject` が
  `'Image'`/`'Video'`/`'Psd'` を返すだけ）を通る。rust-backend 側
  （`rust-backend/src/source_frames.rs:300` の
  `local_media_source_path(&media.source, "Image")`）も同じ生パスをそのまま
  読むだけで、`GeneratedImageSource` のような専用ワイヤー型は最初から
  存在しない。したがって「rust-backend のデシリアライズ先を rust-core の
  型へ向け直す」という shape/text のパターンに相当する作業は image には
  無い。`sharedRendererNativeMediaSupport.ts` の
  `isSharedRendererNativeImageSourceSupported(source)`（132行目）も同様に
  `source` を生パスとして扱っており、変更不要だった。
- **`mediaReferenceForObject` / `mediaSourceForObject` は今回一切変更していない。**
  型定義の移送だけで完結する kind だった、という点が shape/text との最大の違い。
  R3 計画の「対応部分が消えることを確認する」という合格基準は、image の場合
  「そもそも消すべき専用変換コードが最初から無かった」という形で満たされる。
- **`filePath` は `Option<String>` のため生成 TS は `filePath?: string | null`
  になる（R1/shape/text と同じ既知の癖）。** `projectFile.ts` の
  `restoreObjectFromProject`（845行目）は
  `typeof obj.filePath === 'string'` で判定しており、`null` は
  `undefined` と同様に弾かれるため既存ロジックは無修正で動く。
- **持続化（`.uxfd` プロジェクトファイル）への影響は無い。**
  `filePath`/`src`/`width`/`height` は元々 `ImageObject` のフィールドとして
  そのまま保存されており、今回の変更は型の定義元を変えただけで
  シリアライズされる JSON の形は不変。`projectFile.ts` を grep した限り、
  image 用の派生ワイヤー文字列を保存している箇所は無い
  （そもそも派生ワイヤー文字列自体が存在しない、上記の通り）。

## 実測

| 合格条件 | 結果 |
|---|---|
| `npx tsc --noEmit` | エラー 0 |
| `cargo test --manifest-path rust-core/Cargo.toml` | 全 pass |
| `cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend` | 158 tests pass |
| `npm run codegen:types:check` | exit 0 |
| `npm run fixture:evaluation-parity` → `cargo test --test ts_evaluation_parity` | fixture 差分ゼロ、pass |
| `KNOWN_DIFFERENCES.json` | `differences: []` のまま（変化なし） |
| `npx vitest run`（全スイート） | 252 files / 1833 tests pass |

## 次の kind（`video`）への申し送り

- `video` は `image` と同じ「media kind」で、`src/types.ts` の `VideoObject`
  にも専用ワイヤー型は無さそうだが、`proxyFilePath` / `videoSourceMode`
  （previewProxy / exportOriginal）による分岐や `source_rate`
  （`fpsToFrameRate(projectFps)`）、`subject_crop`（動的 Clipping 評価）など
  image には無い複雑さがある。移送前に必ず
  `mediaReferenceForObject` の `object.type === 'video'` 分岐
  （`mediaSourceScaleForObject`・`fpsToFrameRate` 付与部分）と、
  `editableRustScene.ts` 側の video 固有ロジックを先に確認すること。
- image の経験から得られる教訓: **「wire 統一が必要かどうか」は
  `mediaReferenceForObject` にその kind 専用の `serialiseXxxSource` 関数が
  存在するかどうかで機械的に判定できる。** 存在すれば shape/text と同じ
  3 コミット構成、存在しなければ image と同じく型移送のみで完結する
  （stage 3 は「専用ワイヤーが無いことの確認」に縮む）。`video` は
  `source_rate` の付与はあるが、それは `RustSceneMediaReference` 全体の
  付加フィールドであって `source` 文字列自体の JSON 化ではないため、
  現時点の観測では video も image と同じパターンになる可能性が高い
  （要現地確認）。
