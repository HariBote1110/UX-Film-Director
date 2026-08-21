# Rust 正本集中リファクタリングの現状監査

## Decision

- 編集モデル・保存形式・時間評価の正本を `rust-core` へ移し、TS 型を `ts-rs` 生成物にする方針を採る。
  描画（TS 内蔵 WGSL）と PSD 解析（ag-psd）も Rust 単一実装へ寄せる。
  計画の正本は `markdown/Rust_Source_Of_Truth_Plan.md`（ADR-014/015/016 を提案）。
- `Windows_Port_Plan.md` との唯一の強い結合は wgpu バージョン。
  W4（wgpu 0.20→25+）を単独レーンで先に片付け、以降は Windows レーンと Rust 正本レーンを並行させる。
  R6（TS presenter 削除）だけは W7 完了が前提。

## Alternatives considered

- **TS を正本にして Rust を従属させる**: 却下。export / native overlay / sidecar が全て Rust 側にあり、
  正本を TS に置くと毎フレーム TS の評価結果を Rust へ送り続けることになる（現状がそれ）。
- **手動ミラー + 境界テストで担保を継続**: 却下。object kind が 40 を超え、
  テストの網羅コストが実装コストを上回っている。
- **JSON Schema を人手の正本にして双方生成**: 保留。Rust enum の内部タグ表現が制約される。
  `ts-rs`（TS 型）と `schemars`（Schema）の併用を第一候補にする。

## Constraints / Gotchas

- **評価経路が 2 本走っている。** `scene.replace(Project)` → `rust-core::evaluate_frame` →
  `scene.evaluate(frame)`（`editableRustScene.ts` 経由）と、
  TS 側で評価済み snapshot を渡す経路（`rustSceneSnapshot.ts` 経由、2,722 行）が並存する。
  イージング関数は `src/utils/easings.ts` と `rust-core/src/keyframe.rs::evaluate_easing` に
  同じ 30 種以上が二重実装されている。キーフレーム評価も同様。
- **`psd-wasm` クレートは現在デッドコード。** `src/wasm/psd/` の成果物を含め TS からの import が 0 件。
  名前が紛らわしいが `src/utils/psdWasm.ts` は **ag-psd を Web Worker で回す実装**であり Rust とは無関係。
  実稼働している PSD 経路は ag-psd（TS）と `rust-backend/src/psd_fast.rs`（native RPC）の 2 本。
- **native overlay は既に既定 ON（opt-out）。** `src/components/Viewport.tsx:731` は
  `VITE_UXFD_NATIVE_OVERLAY !== '0'`。`Windows_Port_Plan.md` Phase 7 にあった
  「`VITE_UXFD_NATIVE_OVERLAY=1` で opt-in」の記述は古かったので修正済み。
- **TS 側に WGSL が存在する。** `src/utils/sharedRendererWebGpuPresenter.ts`（1,484 行）に
  `@vertex` / `@fragment` を含むシェーダ文字列がある。
  `architecture/00-overview.md` 基本方針 8 に反しており、R6 の削除対象。
- `rust-core-wasm` の公開関数は 5 つだけ（solid colour / video plane の頂点生成、decode request 生成）。
  wasm 経路は正本移管の受け皿としてはほぼ空。
- `scene.evaluate` の実測は 0.4〜4ms（`src/e2e/realisticHeavyEditSecondPlaybackStart.ts`）。
  評価を Rust へ寄せても RPC 往復が支配的にはならない見込みだが、
  UI ハンドルの 60fps 追従に耐えるかは未確認。R2 の冒頭で実測して呼び出し経路を決める。
- 評価系の TS テストは **削除ではなく Rust へ移送**する。単純削除すると退行検出力が落ちる。
