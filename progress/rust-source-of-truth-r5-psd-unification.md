# R5 PSD 単一実装化: R5-1 depth guard / R5-2 psd-wasm 削除

## Decision

### R5-1: 16-bit/32-bit depth の明示拒否ガード

- `rust-backend/src/psd_fast.rs` の `parse_psd_meta_only` はヘッダの depth を
  `_depth` として読み捨てており、16-bit/32-bit PSD を渡しても無警告で
  meta-only 結果を返していた。`PsdFastResult` に `pub depth: u16` を追加して
  解析結果面へ露出させ、`parse_psd_meta_only` 内で depth != 8 を
  `Err(format!("16bit/32bit PSD は未対応です（depth={depth}）"))` として
  明示的に拒否するようにした。
- ガードの配置場所は `parse_psd_meta_only` 自体を選んだ（呼び出し元の
  `handle_psd_parse_meta`＝media.rs 側ではない）。理由: 現状の呼び出し元は
  1 箇所のみだが、関数自体にガードを持たせることで将来別の RPC ハンドラが
  同じ関数を呼んでも自動的に保護される。
- 既存動作からの後退ではない: ag-psd 経路（`src/utils/psdWasm.ts`）も
  `depth: 8` を決め打ちで返しており、16-bit PSD の実対応はそもそも
  どちらの経路にも無かった。
- 16-bit/32-bit の実デコード対応は本バッチの非ゴール。`parse_psd_fast`
  （フル pixel decode）は既に 16-bit を「上位バイトのみ保持」する近似で
  通しているが、これは既存動作として維持し変更していない。

### R5-2: `psd-wasm` クレートの削除

- §8 設計判断 5 を **削除で確定**。判断理由: `psd-wasm` クレートは
  TS からの import が 0 件のデッドコードであり（`src/utils/psdWasm.ts` は
  名前が紛らわしいだけで ag-psd を Web Worker で回す別実装）、
  ブラウザ側で PSD を解析する要件は今後 `psd.parse` / `psd.parseMeta` RPC
  （rust-backend 常駐プロセス経由）に統合する方針のため、wasm 版を
  再生する理由が無い。
- 削除したもの:
  - `psd-wasm/`（クレート本体、git 管理下）
  - `src/wasm/psd/`（wasm-pack ビルド成果物、未追跡のローカル生成物）
  - `perf/wasm-node/`（Node.js 向け WASM ビルド、未追跡のローカル生成物）
  - `perf/bench-psd.mjs`（git 管理下）
- `perf/bench-psd.mjs` は削除とし、`vm_tuning_research/tools/` への移送は
  行わなかった。理由: `vm_tuning_research/tools/bench-wasm.mjs` が既に
  「事前ビルド済み `perf/wasm-node/` package を再利用して WASM 単一スレッド
  フォールバックを計測する」という同じ計測を持っており、`bench-psd.mjs`
  はそれと重複するベンチだった。また `bench-psd.mjs` は wasm-pack の
  ビルド成果物が無いと動かない点も同じで、`psd-wasm` クレート削除後は
  そのビルド成果物を再生成する手段自体が無くなるため、移送しても
  「動かないスクリプトを別の場所に置く」だけになる。
- `package.json` / `.gitignore` に `psd-wasm` 由来のスクリプトやエントリは
  無かった（確認済み、変更なし）。root に workspace 用 `Cargo.toml` は
  存在しない（各 crate が独立 `Cargo.toml` を持つ構成）ため、workspace
  members の削除は不要だった。

## Alternatives considered

- **R5-1 のガードを `handle_psd_parse_meta`（media.rs）側に置く案**:
  却下。将来 `parse_psd_meta_only` を呼ぶ RPC ハンドラが増えたときに
  ガード漏れが起きる。関数自体に置く方が安全側に倒せる。
- **`perf/bench-psd.mjs` を `vm_tuning_research/tools/` へ移送する案**:
  却下。`bench-wasm.mjs` と機能重複する上、`psd-wasm` 削除後はどちらも
  ビルド成果物を再生成できず実行不能になる。動かないコードを増やす
  だけなので削除を選んだ。

## Constraints / Gotchas

- `vm_tuning_research/tools/bench-wasm.mjs` は本バッチの scope files
  （`vm_tuning_research/` は対象外）に含まれないため変更していないが、
  `psd-wasm` クレート削除後は `./wasm-node/psd_wasm.js` を再ビルドする
  手段が無くなり、事実上恒久的に実行不能なスクリプトになった。
  後続バッチでの削除・注記追加候補として記録する。
- `PsdFastResult` へ `depth` フィールドを追加したため、構造体リテラルで
  組み立てている箇所（フル parse / meta-only / display 系 4 関数の実ヘッダ
  読み取り + テストフィクスチャ）を全て更新した。テストフィクスチャ側は
  実ファイルヘッダを読まないため `depth: 8` で固定している。
