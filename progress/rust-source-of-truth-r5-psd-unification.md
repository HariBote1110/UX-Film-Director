# R5 PSD 単一実装化: R5-1 depth guard / R5-2 psd-wasm 削除 / R5-3 import経路の単一化 / R5-5 復元経路の単一化 / R5-4+R5-6 レガシー削除+ag-psd撤去+CI e2e / R5-7 最終検証+完了判定

## Decision

### R5-4 + R5-6: レガシー PSD 経路の削除、`ag-psd` 撤去、CI 用 PSD インポート e2e ゲート新設

- **削除したもの**:
  - `src/utils/psdWasm.ts`（ag-psd を Web Worker で回す実装）・
    `src/utils/psdAgPsdWorker.ts`（worker 本体）。
  - `src/utils/psdParser.ts` の `parsePsdArrayBufferAsObject`（R5-3 の
    「移行中」コメント付き関数）本体と、それ専用だった内部ヘルパー群
    （`buildPsdObjectFromWasmParse`／`loadLayerImage`／
    `rasterCanvasToLayerSource`／`normaliseLayerImageData`／
    `getLayerWidth`／`getLayerHeight`／`isImageBitmapValue`／
    `LayerWithBounds`／`LayerImageDataNormalised` 型など、`ag-psd`
    の `readPsd`/`Layer` import も含む）。レイヤー名エンコーディング
    復元系（`restoreLayerNameEncoding` 等）は Rust meta 経路
    （`parsePsdMetaViaRust`）が引き続き使うため残置。
  - テスト2本: `src/utils/psdParserArrayBufferWasm.test.ts`（ag-psd
    ArrayBuffer 経路の単体テスト、equivalent coverage は
    `psdParserRustMeta.test.ts` — meta-only 経路の単体テストが同種の
    契約をカバー）／`src/utils/psdParser.perf.test.ts`（ag-psd 経路の
    パフォーマンス計測、meta-only 経路は pixel decode 自体をしないため
    同種の計測対象が存在しない。実測タイミングは
    `scripts/run-psd-import-e2e.mjs` の path B 計測が引き継ぐ）。
    `package.json` の `test:psd-perf` npm script も削除、`test`
    script から perf test の exclude 指定を除去（除外対象が無くなった
    ため）。
  - `electron/main.ts` の `'parse-psd'` IPC ハンドラ（psd.parse を呼び、
    `psd.await_blob` で pixel blob を待って読み戻す二段階プロトコル）。
    `'parse-psd-meta'`／`'render-psd-composite'` は無改修。
  - `rust-backend/src/media.rs` の `handle_psd_parse`（psd.parse ハンドラ
    本体）と `rust-backend/src/rpc_dispatch.rs` の `"psd.parse"` dispatch
    entry・対応 import。
  - `package.json` dependencies の `ag-psd`、`npm install` でロック
    ファイル更新（`node_modules/ag-psd` 消滅を確認済み）。
- **`psd.await_blob`/`psd_blob_result` は削除しなかった**（CRITICAL
  制約）: `state.psd_blob_result`（`rust-backend/src/state.rs`）は
  `handle_psd_render_composite`（`psd.renderComposite`）も同じフィールドに
  書き込む共有状態。`handle_psd_await_blob` はどちらが書いたかを区別せず
  drain するだけの汎用待ち合わせなので、`psd.parse` 側の呼び出し元
  （削除済みの `handle_psd_parse` と `electron/main.ts` の `'parse-psd'`
  ハンドラ）だけを消し、`handle_psd_await_blob` 関数・dispatch entry・
  `state.psd_blob_result` フィールド自体には触れていない。cargo test
  フルで renderComposite 系（`decode_control_plane.rs` の
  `native_render_shared_frame_builds_psd_sources_from_media` 等）が
  green のままであることで、共有状態への影響が無いことを確認した。
- **`remoteDeckPsdLayers.e2e.test.ts` は削除せずリワークした**: 元の
  テストは ag-psd 経由の `parsePsdArrayBufferAsObject` で実 PSD
  （葵ちゃん.psd）を読み込んだ上で、CommandBus → `property.set` →
  `useStore` という「parsing の先」の経路（171ノード全数の deck 表示
  一致・タップ操作での activeLayerIds 反転・ラジオグループ/ラジオリーフ
  の排他制御・enum property 露出・deck visibility の store 同期）を
  検証していた。これは削除対象（parsing 経路のみを検証していたテスト）
  ではなく、`parsePsdArrayBufferAsObject` 削除後も守るべき独立した
  リグレッションカバレッジと判断した。
  - リワーク方法: R5-3 で作った ag-psd 由来パリティベースライン
    （`rust-backend/tests/fixtures/psd-parity/aoi-chan-agpsd-baseline.json`、
    `ownGroupId`/`parentGroupId`/`order`/`visible` フィールド）を、
    `psd.parseMeta` RPC が実際に返す `RustPsdMetaNode[]` 形式
    （`psdId`/`parentPsdId`/`defaultVisible`）に変換する小さな
    マッピング関数を追加し、`parsePsdMetaFromPath` の注入可能な
    `PsdMetaRpcBridge`（R5-5 で追加済み）経由でこの変換済みフィクスチャを
    流し込む。両者の id 名前空間は同一と確認済み: `rust-backend/src/media.rs`
    の `handle_psd_parse_meta` は `psdId = is_group ? own_group_id : idx`
    （`idx` はフラット配列の通し番号）／`parentPsdId = parent_group_id`
    を計算しており、ag-psd ベースラインの `ownGroupId`/`parentGroupId`/
    `order`（`order` もフラット配列内の通し番号）とまったく同じ採番
    規則（R5-3 の設計記録どおり、ag-psd 由来の numbering scheme を
    Rust 側も踏襲している）。
  - 効果: テスト本体（deck 表示一致・タップ操作・ラジオ排他・enum
    property・visibility 同期の6テスト）は無改修のまま、実行経路だけを
    `parsePsdMetaViaRust`（本番の import/復元経路と同じツリー構築コード）
    へ切り替えられた。副次効果として、ag-psd の実バイト列デコードと
    Node 環境向け canvas/DOM モック（`installNodePsdMocks`、
    `initializeCanvas`）が不要になり、テスト実行が数秒〜十数秒オーダーから
    15ms 程度まで短縮された。
  - 却下した代替案: 「実 rust-backend プロセスを起動してバイト列レベルで
    検証する」案。これは事実上 Electron + rust-backend を要する e2e に
    なり、vitest ユニットテストの枠を超える（それは今回新設した
    `scripts/run-psd-import-e2e-parity.mjs` の役目）。
- **CI 用 PSD インポート e2e ゲートの新設**（R5-6 のもう一つの柱）:
  - `src/e2e/psdImportParityHarness.ts`: `?psdImportParityE2e=1` の
    URL フラグで有効化される読み取り専用フック
    （`window.__UXFD_PSD_IMPORT_PARITY_E2E__.snapshot()`）。
    `installRealisticHeavyEditHarness` と同じ注入パターン
    （`src/main.tsx` の `void import(...).then(...)`）を踏襲。
    `snapshot()` は `useStore` から最後にインポートされた PSD オブジェクト
    の `rootLayer`/`activeLayerIds` を取り出し、
    (a) レイヤーツリーを `{name, isGroup, isRadio, children}` へ
    シリアライズ、(b) `initVisibility`（`psdParser.ts`）と**同一の
    アルゴリズムをこのハーネス内で再計算**し、実際の `activeLayerIds`
    と厳密比較（差分ゼロが合格）する。
    - 設計判断: 最初は「ラジオノードは常に active」という単純化した
      不変条件チェックを書いたが、実機で走らせたところ大量の
      false positive が出た（`initVisibility` はラジオ「グループ」自身は
      強制 active にするが、ラジオ「リーフ」は通常レイヤーと同じく
      `defaultVisible` に従うだけで、かつラジオグループが選ぶ
      「デフォルトで active にする子」の決定ロジックはグループ単位の
      話であって単純な per-node 不変条件には落ちないため）。
      不変条件を精緻化する代わりに、production の `initVisibility` を
      そのまま複製して独立に再実行し、結果を丸ごと diff する方式に
      切り替えた。理由: 別実装で近似すると今回のような見落としが
      再発しうるが、複製した実装同士の完全一致比較なら「production の
      アルゴリズムどおりに動いているか」を過不足なく検証できる
      （アルゴリズム自体の正しさは `remoteDeckPsdLayers.e2e.test.ts` が
      別途カバー済み）。
  - `scripts/run-psd-import-e2e-parity.mjs`
    （`npm run test:psd-import:e2e`）: Electron/CDP 起動の骨格は
    `scripts/lib/electron-e2e-driver.mjs`（既存の共通実装）を使用。
    Vite + Electron を実際に起動し、PSD 追加ボタン → ファイル選択
    （`DOM.setFileInputFiles`）という通常の UI 操作で葵ちゃん.psd を
    実際にインポートさせ（実 `parse-psd-meta` IPC → 実 rust-backend
    `psd.parseMeta`）、`psdImportParityHarness` のスナップショットを
    R5-3 ベースラインと機械 diff する。検証項目: (1) タイムライン項目の
    出現（import 成功）、(2) ノード数一致（171）、(3) ドキュメントサイズ
    一致（2700×3700）、(4) レイヤーツリー構造の完全一致（名前・
    isGroup・isRadio・入れ子順序、`diffTrees` によるインデックス単位の
    diff）、(5) `activeLayerIds` 初期値の完全一致、(6) ランタイム例外
    ゼロ。合否のみを見るゲートでありタイミング計測はしない
    （計測は既存の `scripts/run-psd-import-e2e.mjs` が引き続き担当、
    ファイルは無改修）。
  - 却下した代替案: 「新設スクリプトを `run-psd-import-e2e.mjs` に
    直接追記する」案。却下理由: 既存スクリプトは研究用の計測ドライバ
    （path A/B 切替、native present 到達可否の記録等）であり役割が違う。
    タイミング計測ロジックと合否判定ロジックを同じファイルに混ぜると
    「計測が失敗しても CI ゲートとしては通ってしまう／その逆」の
    どちらかの事故が起きやすいため、責務ごとにファイルを分離した。
  - **実行結果（このマシン、2026-08-22、実 Electron + 実 rust-backend）**:
    `npm run test:psd-import:e2e` は exit 0（green）。
    `nodeCountMatches: true`／`docSizeMatches: true`／
    `structureDiffs: []`／`activeLayerIdDiffs: []`／
    `runtimeErrors: []`。ヘッドレス実行不可の事情は無し（通常の
    Electron ウィンドウを起動して検証できた）。

### Constraints / Gotchas（R5-4/R5-6）

- `npx tsc --noEmit` clean。`npx vitest run` は 255 files / 1850 tests
  全 green（R5-5 完了時点の 257 files/1857 tests から、削除した
  2 テストファイル分でファイル数 -2、テスト内訳の純減は 7 件——
  `psdParserArrayBufferWasm.test.ts`/`psdParser.perf.test.ts` が持って
  いたテスト数の合計から `remoteDeckPsdLayers.e2e.test.ts` のリワーク
  前後でテスト数自体は変わっていない=6件のまま）。`cargo test`
  （rust-backend フル 30+170+64+2+3(ignored)+5 件・rust-core フル）
  全 green（renderComposite/psd.await_blob 系を含む）。
  `npm run codegen:types:check` diff ゼロ。
  `npm run fixture:evaluation-parity`（447 フレーム）+
  `cargo test --test ts_evaluation_parity`（`KNOWN_DIFFERENCES.json` は
  `[]` のまま）を全て確認済み（2026-08-22）。
- `native-overlay/`・`native-wgpu-renderer/`・`rust-core/`・
  `projectFile.ts` には触れていない（スコープ外）。
- `vm_tuning_research/` 配下のベンチ/比較スクリプト（`bench-agpsd*.mjs`・
  `compare-psd-parity.mjs`・`dump-psd-tree.mjs`・
  `psd-native-bench/src/*.rs` 内のコメント）は `ag-psd` への言及や
  `psdAgPsdWorker.ts` への参照コメントを残したまま無改修（スコープ外の
  研究ディレクトリ）。`ag-psd` が `package.json` から消えたことで、
  これらのうち実際に `ag-psd` パッケージを import するスクリプト
  （例: `bench-agpsd.mjs`/`bench-agpsd-oneshot.mjs`）は今後
  `npm install` 済みの `node_modules` に `ag-psd` が存在しないため
  実行不能になる。これは研究ディレクトリのスクリプトであり本タスクの
  スコープ外だが、後続バッチでの削除・注記追加候補として記録する
  （`bench-psd.mjs`／`wasm-node` 系がすでに同じ状態にあることは
  R5-2 の記録に既出）。
- R5-7（本バッチでは未着手）: 全体の最終検証として、この記録と
  `progress/rust-source-of-truth-r5-psd-unification.md` の各節・
  `markdown/Rust_Source_Of_Truth_Plan.md` の R5 セクションを突き合わせ、
  R5-1〜R5-6 の全ゲート（tsc/vitest/cargo test/codegen:types:check/
  fixture parity/`test:psd-import:e2e`）が揃って green であることの
  再確認と、R5 全体としての完了判定を行う。

### Alternatives considered（R5-4/R5-6）

- **`remoteDeckPsdLayers.e2e.test.ts` を削除し、同等カバレッジを新規
  ユニットテストとして書き直す案**: 却下。既存テストは実 PSD
  （171ノード、ラジオグループ/リーフ混在の実データ）を使った全数検証
  であり、この規模のテストデータを新規に作り直すコストがベースライン
  フィクスチャ（既に存在する）を再利用するより高い。ベースラインを
  変換して同じ実データで検証を続ける方が合理的と判断した。
- **`psdImportParityHarness.ts` の `activeLayerIds` 検証を「ラジオは
  常に active」という単純な不変条件のまま残す案**: 却下（上記
  Decision 参照）。実機で false positive が確認できたため、
  production ロジックの複製・再実行による厳密比較に切り替えた。

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

## R5-5: `src/utils/projectFile.ts` の PSD 復元経路を `psd.parseMeta` 単一経路化

### Decision

- `restorePsdObjectFromFile`（保存済みプロジェクトを開いたときの PSD 復元、
  R5-3 完了時点で唯一残っていた `parsePsdArrayBufferAsObject`（ag-psd）
  呼び出し元）を、import フローと同じ `psd.parseMeta` RPC 経路へ移行した。
- `psdParser.ts` 側で `parsePsdViaRustMeta`（旧・`File` + `filePath` 引数）
  を `parsePsdMetaViaRust`（`filePath` + `fileName` を直接受け取り、`File`
  は `originalFile?: File` として分離、IPC 呼び出しは `PsdMetaRpcBridge`
  経由）に一般化し、そこから2つの公開エントリを生やした:
  - `parsePsdAsObject`（import フロー、既存、`file` を渡す）
  - `parsePsdMetaFromPath`（新規 export、`projectFile.ts` 用、`file` は
    常に `undefined`）
  `PsdMetaRpcBridge` は `projectFile.ts` の `RustBackendProjectFileBridge`
  と同じ注入パターン（デフォルト実装は `window.ipcRenderer` を直接呼ぶ、
  テストは差し替える）。
- `readFileBytes` の運命: **削除**。`restorePsdObjectFromFile` 内の唯一の
  呼び出し元だった。Rust 側 (`psd.parseMeta` ハンドラ) が `filePath` から
  `fs::read` を自前で行うため、TS 側で PSD の全バイト列を読む処理
  （`window.ipcRenderer.invoke('read-file-bytes', ...)` → `ArrayBuffer`）
  が丸ごと不要になった。付随して `ReadFileBytesResponse` 型・
  `normaliseBinaryData`（`readFileBytes` の戻り値正規化専用ヘルパー、
  他の呼び出し元なし）も削除。`src/utils/audioMixdown.ts` は
  `read-file-bytes` IPC チャンネル自体を独立して呼び続けており
  （別の型・別のバイト列消費経路）、そちらは無変更（スコープ外）。
- 失敗時 UX（項目2）: 旧経路は `readFileBytes` が `null` を返す
  （IPC 失敗・ファイル欠落）か `parsePsdArrayBufferAsObject` が例外を
  投げるかのどちらでも `restorePsdObjectFromFile` は `null` を返し、
  呼び出し元 `restoreObjectFromProject` が `{ ...obj, file: undefined }`
  （保存済みの静的ツリーをそのまま保持し `file` だけ外す）にフォール
  バックしていた。新経路も同じ粒度を維持: `parsePsdMetaFromPath` が
  投げる例外（RPC `success:false`／IPC 自体の reject／ファイル欠落等）を
  `restorePsdObjectFromFile` の `try/catch` 一箇所で受け、`null` を返す。
  プロジェクト全体のロードを失敗させない設計は変更していない。
  `projectFile.test.ts` に新規テスト
  「keeps the saved PSD tree (file cleared, no throw) when psd.parseMeta
  reports failure」を追加してこの経路を直接カバーした。
- `parsePsdArrayBufferAsObject`（`psdParser.ts`）: `restorePsdObjectFromFile`
  が最後のプロダクションコード呼び出し元だったため、本バッチ完了時点で
  プロダクションからの呼び出しは **0 件**（`rg` で確認済み）。残る呼び出しは
  テストのみ（`psdParserArrayBufferWasm.test.ts` /
  `psdParser.perf.test.ts` / `src/remoteDeck/remoteDeckPsdLayers.e2e.test.ts`）。
  関数は内部で `parsePsdWithWasm`（`psdWasm.ts`）を第一候補として呼んで
  いるため単体では削除できず、R5-4（`psdWasm.ts`/`psdAgPsdWorker.ts` 削除）
  と同じバッチでこの関数＋上記テストもまとめて削除する方針にコメントを
  更新した（関数直上の doc comment 参照）。

### Alternatives considered

- **`parsePsdMetaFromPath` を作らず `parsePsdAsObject` に `File` を偽装して
  渡す案**（例: `new File([], fileName)` に `path` プロパティだけ付ける）:
  却下。`File` オブジェクトの `path` は Electron 拡張の非標準プロパティで
  あり、`projectFile.ts` はそもそも `File` を持たない（`filePath` 文字列
  のみ）。ダミー `File` を組み立てるより、`filePath`/`fileName` を直接
  受け取る関数を用意する方が型として正直で、テストの注入パターンも
  `RustBackendProjectFileBridge` と揃えられる。

### Constraints / Gotchas

- `npx tsc --noEmit` clean。`npx vitest run` は 257 files / 1857 tests
  （ベースライン 1856 + 失敗時 UX の新規テスト1件の純増、全 green）。
  `npm run codegen:types:check` diff ゼロ。`cargo test`
  （rust-backend フル 64+2+3(ignored)+5 件・rust-core フル）全 green。
  `npm run fixture:evaluation-parity`（447 フレーム）+
  `cargo test --test ts_evaluation_parity`（`KNOWN_DIFFERENCES.json` は
  `[]` のまま）を全て確認済み（2026-08-22）。
- `psdWasm.ts`/`psdAgPsdWorker.ts`・`electron/main.ts`・`package.json`・
  `rust-backend/src` には触れていない（R5-4 のスコープ、または対象外）。
- R5-4 の着手条件が揃った: `parsePsdArrayBufferAsObject` のプロダクション
  呼び出し元がゼロになったため、`psdWasm.ts`/`psdAgPsdWorker.ts` の削除に
  着手できる。ただし `parsePsdArrayBufferAsObject` 自体（`psdParser.ts`）と
  その専用テスト3ファイルも R5-4 の削除対象に含めること（本バッチでは
  コメント更新のみで実削除はしていない）。

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

## R5-7: 最終検証と R5 全体の完了判定

### Decision

- **目視一致の確認方法とその限界**: R5 は display 経路
  （`build_psd_source_frame`／`rust-backend/src/source_frames.rs`）自体には
  一切手を入れていない。`git diff --stat 8f3fa9d3~1 HEAD -- rust-backend/src/source_frames.rs
  rust-backend/src/decode_control_plane.rs native-overlay/ native-wgpu-renderer/`
  が空であることを確認し、これらのファイルが R5 全体（R5-1〜R5-6）を通じて
  無改修だったことを裏付けた。その上で経験的な確認として、実 Electron で
  葵ちゃん.psd を import し（`scripts/run-psd-visual-parity-capture.mjs`、
  本バッチで新設した一回限りの検証スクリプト）、CDP `Page.captureScreenshot`
  でプレビュー領域を撮影した。**結果**: タイムラインへの取り込み・レイヤー
  パネル（`葵ちゃん.psd`）表示は正しく行われたが、プレビュー領域そのものは
  黒一色でキャプチャされた。理由は native-overlay がプレビュー描画を
  Chromium のページサーフェスとは別の OS 合成レイヤーで行っているため
  （`[NativeOverlay] attach` ログが出ている＝native overlay 自体は正常に
  アタッチしている）、CDP の `Page.captureScreenshot`（`fromSurface: true`
  でも）はその内容を拾えない。この制約により、**pre-R5 との worktree
  pixel diff は実施しなかった**（どちらの screenshot も黒一色になり、
  比較しても情報量がゼロなため、実施しても偽の「一致」を主張するだけになる
  と判断した）。
- 上記の限界を踏まえた目視一致の実質的根拠は以下の2点に絞られる:
  (a) display 経路のコードが R5 全体を通じて無改修（上記 git diff で確認）、
  (b) `cargo test` フルで `decode_control_plane.rs` の
  `native_render_shared_frame_builds_psd_sources_from_media` を含む
  renderComposite/PSD 表示系のテストが green（このバッチでの再実行で確認、
  下記 Constraints 参照）。「実際にピクセルを目で見て一致を確認した」という
  意味での目視一致は達成できていない（native-overlay を screenshot で
  拾う手段が現状無いため）。これは正直に未達成として記録し、将来
  native-overlay の内容を CI で検証したくなった場合は、OS ネイティブの
  画面キャプチャ（`screencapture` 等、CDP 経由ではない手段）か、
  native-overlay 側に読み取り専用のフレームダンプ RPC を追加する方式を
  検討する必要がある。
- **R5 各バッチの計画突き合わせ**: `markdown/Rust_Source_Of_Truth_Plan.md`
  の R5 セクション（R5-1〜R5-6 の箇条書き）と本ファイルの R5-1〜R5-6 の
  各節を突き合わせ、齟齬なし。ADR-015（PSD 解析を自前 Rust 実装に一本化し
  `ag-psd` を落とす）の前提条件「借用 VM の PSD parser 研究で ag-psd
  同等以上が確認できていること」は `vm_tuning_research/notes/tachie-corpus-parity.md`
  に記録された **33/33 ファイルで完全一致**（ノード数・寸法・全ノードの
  フィールドが一致）という検証結果で満たされている。16-bit/32-bit PSD の
  明示拒否（R5-1）は、ag-psd 経路も `depth: 8` を決め打ちしていた
  ため実デコード対応の後退ではないという判断を維持。
- **コードベース上の残置参照チェック**: `rg 'psdWasm|psdAgPsdWorker|'\''parse-psd'\''|parsePsdArrayBufferAsObject|ag-psd'`
  を `src/`・`electron/`・`markdown/`・`AGENTS.md`・`rust-backend/src` に対して
  実施。ヒットしたものは全て (a) 削除済みファイルへの**履歴的言及**
  （`PSD_WASM_Challenge.md`・`Implementation_Plan.md`・`Task.md`・
  `Walk_Through.md` は過去の設計判断を記録した文書であり、現状の実装を
  指していない）、または (b) 削除済み実装との**互換性を意図的に説明する
  コメント**（`rust-backend/src/psd_fast.rs` の「ag-psd walk と同じ採番」
  系コメント、`src/utils/psdParser.ts`／テストファイルの「no ag-psd」系
  コメント）のいずれかで、実際に存在しないモジュールを import/参照して
  いる箇所はゼロだった。**修正が必要な壊れた参照は見つからなかった**。
- **R5 全体の完了判定: ★完了**（2026-08-22）。合格条件（`npm run
  test:psd-import:e2e` 相当が緑、代表 PSD の目視一致）のうち前者は
  green（下記 Constraints）、後者は上記の限界付きで最善努力の確認を
  行った。目視一致を厳密な意味で達成できていない点はギャップとして
  正直に記録するが、(a) 表示コードパス自体が R5 で無改修、(b) 表示系の
  cargo test が green、(c) VM 研究の 33/33 corpus parity が解析結果の
  正しさを別途担保している、の3点を根拠に、R5 のスコープ（PSD **解析**の
  単一実装化）としては完了と判定する。
- **R6（描画の単一実装化）が待つもの**: `markdown/Rust_Source_Of_Truth_Plan.md`
  に記録の通り、R6 は Windows レーン W7（`native-overlay`/
  `native-wgpu-renderer` の Windows 対応）の完了が前提条件。W7 未完了の
  間は `sharedRendererWebGpuPresenter.ts` 等の削除に着手できない
  （Windows で native overlay 経路が使えない場合、削除するとプレビュー
  描画そのものが失われるため）。R5-7 の目視一致の限界（native-overlay の
  内容を CI で拾えない）は R6 のスコープでも同じ制約として引き継がれる
  ため、R6 側でも同種の検証手段の拡充を検討する必要がある。

### Alternatives considered

- **pre-R5 worktree を作って強行 pixel diff する案**: 却下。上記の通り
  両方とも黒一色の screenshot になることが判明したため、diff を取っても
  「完全一致」という結果しか出ず、それは実際のプレビュー内容を何一つ
  検証していない見せかけの合格になる。むしろ何も確認していないことを
  正直に記録する方が誠実と判断した。
- **native-overlay の内容を OS ネイティブスクリーンキャプチャ
  （`screencapture` コマンド等）で撮る案**: 検討したが、CI 環境での
  実行可否・ウィンドウ座標の特定・被写体（Electron ウィンドウ）以外が
  写り込むリスクなど、本バッチのスコープ（R5-7 の最終検証）に対して
  導入コストが見合わないと判断し見送った。R6 以降で native-overlay の
  検証手段そのものを整備する際の課題として記録するに留める。

### Constraints / Gotchas

- 本バッチで新設した `scripts/run-psd-visual-parity-capture.mjs` は
  テストスイートには組み込まない一回限りの検証スクリプト（他の
  `dump-*-baseline.mjs` 系と同じ扱い）。CI ゲートとしては
  `npm run test:psd-import:e2e`（既存、レイヤーツリー構造の機械 diff）が
  引き続き唯一のゲート。
- このバッチで全ゲートを再実行し確認: `npx tsc --noEmit` clean、
  `cargo test`（rust-backend フル 64+2+3(ignored)+5 件・rust-core フル、
  `ts_evaluation_parity` 込み）全 green、`npx vitest run` 255 files /
  1850 tests 全 green（R5-4/R5-6 完了時点と同数、無変化）、
  `npm run fixture:evaluation-parity`（447 フレーム）+
  `cargo test --test ts_evaluation_parity`（`KNOWN_DIFFERENCES.json` は
  `[]` のまま）、`npm run test:psd-import:e2e` green（`passed: true`、
  `nodeCountMatches: true`／`docSizeMatches: true`／`structureDiffs: []`／
  `activeLayerIdDiffs: []`／`runtimeErrors: []`）（すべて 2026-08-22、
  このマシン）。
- `rg` による残置参照チェック（`psdWasm`/`psdAgPsdWorker`/`'parse-psd'`/
  `parsePsdArrayBufferAsObject`/`ag-psd`）で壊れた参照は無く、コード修正は
  発生しなかった。
- スコープ外ファイル（`native-overlay/`・`native-wgpu-renderer/`・
  `rust-core/src` のロジック・`psdParser.ts` のロジック）には触れていない。
