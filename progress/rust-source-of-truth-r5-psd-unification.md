# R5 PSD 単一実装化: R5-1 depth guard / R5-2 psd-wasm 削除 / R5-3 import経路の単一化

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

## R5-3: `src/utils/psdParser.ts` の import 経路を `psd.parseMeta` 単一経路化

### Decision

- `parsePsdAsObject`（PSD ドロップ/ファイル選択インポートの唯一の入口）が
  持っていた 4 段フォールバック
  （① `parsePsdViaRustMeta`（`?psdRustImport=1` 限定・研究フラグ）→
  ② `parsePsdViaWasm`（既定・実体は ag-psd を Web Worker で回す
  `psdWasm.ts`/`psdAgPsdWorker.ts`）→
  ③ `parsePsdViaRust`（Electron 限定・フル pixel decode + tmpfile の
  アンチパターン）→
  ④ `parsePsdArrayBufferAsObject`（ag-psd メインスレッド）) を、
  `parsePsdViaRustMeta`（IPC `parse-psd-meta` → Rust `psd.parseMeta`、
  meta-only）1 本に畳んだ。`?psdRustImport=1` の URL フラグゲート
  （`isPsdRustImportEnabled`）は恒久化に伴い削除。
- `parsePsdViaWasm` と `parsePsdViaRust` は import フロー以外から呼ばれて
  いなかった（`rg` で確認済み）ため、関数ごと削除した。
- `parsePsdArrayBufferAsObject`（export 関数）は import フローの呼び出しを
  削除しつつ、関数自体は残した。`src/utils/projectFile.ts` の
  `restorePsdObjectFromFile`（保存済みプロジェクトの復元経路）が
  R5-5 まで引き続き必要とするため。削除するとその経路が壊れる。
  関数直上に「移行中（R5-5 で削除予定）」の注記コメントを追加した。
  `psdWasm.ts`/`psdAgPsdWorker.ts` のファイル削除は R5-4 のスコープであり
  本バッチでは触っていない（`parsePsdArrayBufferAsObject` が内部で
  `parsePsdWithWasm`（`psdWasm.ts`）を第一候補として呼び続けているため、
  まだ削除できない）。
- 失敗時 UX: 旧経路は 4 段フォールバックがあり、末尾の ag-psd まで全滅した
  場合のみ例外が呼び出し元へ伝播していた（`useTimelineDrop.ts` は
  `console.error` のみで無言、`Timeline.tsx` の `handlePsdChange` は
  `alert('Failed to parse PSD file.')` を出していた）。単一経路化後は
  フォールバックが無いため、(a) `file.path` が無い、または
  `window.ipcRenderer.invoke` が無い（非 Electron 環境）、(b) RPC が
  `success: false` を返す、のいずれの場合も `parsePsdAsObject` が
  日本語メッセージ付きの `Error` を必ず投げるようにした
  （「PSDファイルの読み込みには Rust バックエンドへの接続が必要です
  （Electron 環境でのみ利用できます）。」/
  「PSDファイルの解析に失敗しました: <detail>」）。呼び出し元
  （`useTimelineDrop.ts`・`Timeline.tsx`）のキャッチ処理は無改修
  （スコープ外、`useTimelineDrop.ts` は元々無言失敗だったため後退なし、
  `Timeline.tsx` は既存の `alert` がそのまま新しいメッセージの例外にも
  効く）。
- `textureSource` は meta-only 経路のまま常に `undefined`。
  UI 側の読み手が無いこと（display は rust-backend の native-overlay が
  ファイルパスから独立に再デコードする、double-decode-discovery.md の
  知見どおり）は `rg 'textureSource'` で確認済みで、`buildPsdLayerTree`
  消費・`activeLayerIds` 初期化・ラジオグループ（`*` 接頭辞）/
  強制表示（`!` 接頭辞）ロジックは meta 経路（`parsePsdViaRustMeta`）に
  既に実装済み（R5-1 以前から存在、変更なし）で R4 世代のテストが緑のまま。
- パリティベースライン（R5-7 が使う予定）: `parsePsdViaWasm`（削除前の
  既定 import 経路の実体）と同じ抽出ロジック（ag-psd の pre-order DFS、
  `ownGroupId`/`parentGroupId`/`order` の採番方式は `psdAgPsdWorker.ts`
  の `walkLayers` と同一）で 葵ちゃん.psd（171 ノード、2700×3700）を
  meta-only dump した JSON を
  `rust-backend/tests/fixtures/psd-parity/aoi-chan-agpsd-baseline.json`
  に置いた。生成スクリプトは同ディレクトリの
  `dump-agpsd-parity-baseline.mjs`（一度だけ手動実行する one-off、
  テストスイートには組み込まない）。R5-7 はこのファイルを
  `psd.parseMeta` の出力と diff するベースラインとして使う想定。

### Alternatives considered

- **`parsePsdArrayBufferAsObject` も削除する案**: 却下。R5-5
  （`projectFile.ts` の Rust 側移行）より前に消すと、保存済みプロジェクトの
  復元が壊れる。スコープ外ファイルへの影響を避けるため、R5-5 まで
  残置する設計判断を維持。
- **失敗時に旧 `parsePsdViaWasm` へフォールバックする案**: 却下。
  タスクの意図（ag-psd を import フローから完全に外す）に反する。
  単一実装化の価値は「解析経路が 1 本しかない」ことそのものにあるため、
  RPC 失敗時に ag-psd へ静かに退避すると経路が実質 2 本のまま残る。

### Constraints / Gotchas

- `RustPsdNode`（旧 `parsePsdViaRust` 用の型）は `parsePsdViaRustMeta` の
  `RustPsdMetaNode`（`Omit<RustPsdNode, 'pixelOffset' | 'pixelByteLen' |
  'pixelData'>`）が依然として参照しているため、型定義自体は残している。
- `npx tsc --noEmit` / `npx vitest run`（257 files / 1856 tests、
  ベースライン 1854 + `psdParserRustMeta.test.ts` の新規テスト2件の純増）/
  `npm run codegen:types:check`（diff ゼロ）/ `cargo test`
  （rust-backend・rust-core フル）/ `npm run fixture:evaluation-parity`
  （447 フレーム）/ `cargo test --test ts_evaluation_parity`
  （`KNOWN_DIFFERENCES.json` は `[]` のまま）を全て確認済み（2026-08-22）。
- Rust 側（`rust-backend/src`）・`electron/main.ts`・`projectFile.ts`・
  `package.json` の ag-psd 依存・`psdWasm.ts`/`psdAgPsdWorker.ts` の
  ファイル削除には触れていない（それぞれ R5-4/R5-5/R5-6 のスコープ）。
