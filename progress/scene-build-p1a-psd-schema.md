# P1a PSD スキーマ互換性の棚卸し

## 判断

`TimelineObject::Psd` は、保存済み JSON に現れうる `PsdObject` の値を
Rust の編集モデルで失わず往復できるようにする。P1 の builder が必要とする
PSD の選択レイヤー、ローカルパス、描画/GetColor 用のレイヤーメタデータは
runtime context へ逃がさない。ユーザー決定 #3（完全一致）に従う。

## フィールド棚卸し

| TS 上の由来 | フィールド | 区分 | Rust での扱い |
| --- | --- | --- | --- |
| `BaseObject` | `id`、`groupId`、`type`、`name`、`layer`、`startTime`、`duration`、`offset`、座標/変形/不透明度、アニメーション、keyframe、filter、clipping、色補正、vibration | (a) 保存対象 | `BaseObject` と enum の `type` タグで既に往復する。|
| `PsdObjectFields` | `src`、`filePath`、`width`、`height`、`scale` | (a) 保存対象かつ builder 入力 | 既存フィールドを維持する。`filePath` は proxy/original 選択と PSD 読込の入力、寸法は renderer/cache の入力である。|
| `PsdObjectFields` | `rootLayer`（`id`、名称、group/radio、子、寸法、位置、defaultVisible、`src`） | (a) 保存対象かつ builder 入力 | 既存の再帰 `PsdLayerNodeFields` を維持する。GetColor と PSD 合成に必要な metadata を含む。|
| `PsdObjectFields` | `activeLayerIds` | (a) 保存対象かつ builder 入力 | 既存の `BTreeMap<String, bool>` を維持する。canonical な順序で往復する。|
| `PsdObjectFields` | `lipSync`（mapping、`audioId`、`targetLayer` を含む） | (a) 保存対象 | 既存 `LipSyncSetting` を維持する。layer 操作時の command 修正対象でもある。|
| `PsdObjectFields` | `worldPlacement` | (a) 保存対象 | 既存 `PsdWorldPlacement` を維持する。|
| `PsdObject` | `layerTree`（`seq`、名称、checked、radio、子、`blobUrl`） | (c) `rootLayer` + `activeLayerIds` からの表示用派生値。ただし現在の TS 保存処理が JSON に含める | 旧 `.uxfd` を Rust 経由で保存しても落とさないため `PsdLayerStruct` として保持・往復する。builder は読まない。復元時の TS は従来どおり再計算してよい。|
| `PsdRuntimeFields` | `file?: File` | (b) ブラウザの非 JSON runtime handle | Rust 編集モデルには入れない。TS が保存前に `undefined` にし、JSON には現れない。JSON に変換不能な実体を Rust が擬似的に保持することはしない。|
| `PsdLayerNodeRuntimeFields` | 各 node の `textureSource?: ImageBitmap` | (b) GPU 専用・非 JSON raster | Rust 編集モデルには入れない。TS が保存前に除去する。|
| `PsdLayerStruct` | `blobUrl?: string` | (b) 表示用 URL だが JSON に混入しうる | `layerTree` の互換保持範囲として JSON 値は往復する。builder は利用しない。|

## 互換性上の注意

- `file` と `textureSource` は JSON の値ではないため、Rust の project-file
  deserialize/serialize 境界に到達しない。到達した場合も JSON 化された任意の
  オブジェクトを File/ImageBitmap と見なして保存することはしない。
- `layerTree` は意味論上は派生データだが、既存の `sanitiseObjectForSave` が
  除去していない。そのため Rust が未知フィールドとして捨てると、既存保存
  プロジェクトを開いて再保存した際に静かなデータ損失になる。P1a では
  明示型で保持してこれを防ぐ。
- JSON object のキー順は契約に含めない。`activeLayerIds` は Rust 側で
  `BTreeMap` により決定的に出力する。

## 検証

- TS 形状の PSD（レイヤーツリー、active layers、file path、lip sync、3D 配置を
  含む）の Rust deserialize → serialize 構造比較を追加した。
- 既存の実プロジェクト fixture に PSD を加えた `.uxfd` load/save 構造往復と、
  P1a 前の `layerTree` を持たない旧形 PSD の読込を追加した。
- layer track command の PSD `lipSync` 修正後も `layerTree` が保持されることを
  確認した。
- `cargo test --manifest-path rust-core/Cargo.toml`、`npx tsc --noEmit`、
  `npx vitest run`、447 フレーム evaluation parity、P0 fixture drift test が
  すべて成功した。`npm run codegen:types` を連続2回実行し、2回目に追加差分が
  無いことも確認した。
