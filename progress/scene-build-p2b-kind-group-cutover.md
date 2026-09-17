# Scene Build P2b: kind 群ごとの cut-over 拡張

## 決定

- `UXFD_SCENE_BUILDER_CUTOVER` の5群すべてを実際のゲートとして機能させた。P2aでは `basic` だけが
  `basic_media_kind()` 経由で効いており、`generated` / `audio` / `getcolor` / `group_control` は
  解析されるだけで無視されていた。
- 群の所属は `kind_group(&MediaKind) -> SceneKindGroup` の一箇所で決める。
  - `basic`: `SolidColour`、`GeneratedGradient`、`GeneratedShape`、`Text`、`Image`、`Video`、`Psd`（P2aから不変）
  - `audio`: `GeneratedAudioWaveform`、`GeneratedAudioSphere`
  - `getcolor`: `GeneratedGetColorDots`
  - `generated`: 上記以外の `Generated*` 32種
- `group_control` は `MediaKind` ではないため、built project の `group_controls` が非空かどうかで
  ゲートする。無効時は disabled 名一覧へ文字列 `groupControl` を載せ、`kindGroupDisabled` で
  TS 送信値へ戻す。
- `kind_group` はワイルドカード arm を置かない網羅 match にした。将来 `MediaKind` が増えたとき、
  分類を書くまでコンパイルが通らないようにするためである。
- cut-over の試行条件は「`basic` が有効」から「いずれかの群が有効」へ変えた。fallback 理由の優先順位
  （`noEditableScene` → `flagOff` → resident 不適格 → `kindGroupDisabled`）、wire 形状、
  未知群名のエラー文言は変えていない。

## 代替案として退けたもの

- 群ごとに `matches!` を並べる方法。群が増えるたびに分岐が分散し、`MediaKind` 追加時の漏れを
  コンパイラが検出できないため退けた。
- `group_control` を専用の疑似 `MediaKind` として扱う方法。schema を汚すうえ、TS 側の wire と
  ずれるため退けた。

## 制約 / 注意点

- 既定は従来どおり全面 TypeScript 経路である。環境変数を設定しない限り挙動は変わらない。
- `rust-backend` の `scene.replace` テストは lib ではなく bin ターゲット（`rpc_dispatch::tests`）に
  ある。`cargo test --manifest-path rust-backend/Cargo.toml --lib` では走らないので、
  `--bin uxfd-rust-backend` で実行する必要がある。
- TS 側の混在 kind パリティは `src/utils/mixedKindDualRunParity.test.ts` で、
  `buildEditableRustScene` と `buildRustSceneSnapshotForTimeline` の media list を
  `collect_structural_diffs` / `comparable_value` と同じ意味論（数値1e-5許容、`.source` は
  JSON parse 後に比較）で照合している。現時点で乖離はない。ただし比較対象は media list であり、
  project 全体および 447-frame 評価パリティは未実施である。
- 実機（Electron）での群ごとの cut-over 検証は未実施である。`scripts/run-video-export-e2e.mjs` に
  `UXFD_VIDEO_EXPORT_E2E_ADD_GROUP_CONTROL`（既定OFF）を足したが、対応する renderer hook
  `window.__UXFD_VIDEO_EXPORT_E2E_ADD_GROUP_CONTROL__` は未実装で、有効化すると明示エラーで落ちる。
  実機検証はこの hook 実装が前提になる。
