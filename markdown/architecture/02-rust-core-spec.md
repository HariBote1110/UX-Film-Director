# Rust Core 仕様

## 目的

`rust-core` は UX Film Director vNext の編集モデルと時間評価の正本である。UI、レンダラ、sidecar は `rust-core` の評価結果に従う。

実装コードは正本ではない。正本はこの仕様書とテストスイートである。

## MVP のモデル

MVP では最小の縦スライスに限定する。

- project
- track
- clip
- property
- keyframe
- command / undo
- validation

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
- integer translation / identity scale 前提の矩形 vertex 生成。
- canvas pixel 座標から clip-space 座標への変換。

円、丸角、グラデーション、回転、任意 scale、anti-aliasing coverage はまだ別 gate とし、既存 bridge では
fail-loud または Pixi fallback に留める。

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
