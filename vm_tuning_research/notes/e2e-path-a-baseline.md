# path A（現行PSDインポート）end-to-end計測ベースライン

## 目的

PSDインポートの実装計画（path B試作）に先立ち、現行経路（path A: ag-psd Worker経由）の
end-to-endレイテンシを file input → native present まで実測し、どの区間が支配的かを
特定する。`agpsd-baseline.md`のreadPsd単体計測（405〜460ms）が、実際のUIフローの中で
どれだけ増幅・希釈されるかを見る。

## 環境

- macOS Apple M4（開発機、`macos-calibration.md`と同一機）
- ブランチ: feature-proxy
- アプリバージョン: `0.1.1-Beta-489a`
- 対象PSD: `葵ちゃん.psd`（30MB、171レイヤー）
- 計測フラグ: `psdImportTrace=1`（`src/perf/psdImportTrace.ts`）
- native present判定に必要な `VITE_UXFD_RUST_TIMELINE_SCENE_RPC=1` / `VITE_UXFD_NATIVE_OVERLAY=1`
  をvite dev serverへ渡した状態でElectronを起動（後述の理由により必須）

## 手順

```
node scripts/run-psd-import-e2e.mjs
```

同一Electronセッション内で以下を実施:
1. プロジェクト作成 → PSD追加ボタンをクリック → `input[accept=".psd"]`へ実ファイルを
   `DOM.setFileInputFiles`で注入（1回目）
2. `[data-timeline-item="true"]`に葵ちゃん.psdが出現するまで待機
3. `window.__UXFD_PSD_IMPORT_TRACE__.snapshot()`でinput/parsed/objectAdded/evaluateReadyの
   4点を回収
4. 同じPSDをもう一度同じ手順で追加（2回目・コールドコスト分離用）し、同様に記録

3回のアプリ起動（app boot）×各2回importで計6サンプル取得。

## 結果

### 計測点ごとの経過時間（msec、input=0起点）

| 起動# | import順 | input | parsed(+Δ) | objectAdded(+Δ) | evaluateReady(+Δ) |
|---|---|---|---|---|---|
| 1 | 1回目 | 0 | 936.7 (+936.7) | 940.6 (+3.8) | 1022.6 (+82.0) |
| 1 | 2回目 | 0 | 638.0 (+638.0) | 639.4 (+1.5) | 667.0 (+27.6) |
| 2 | 1回目 | 0 | 812.4 (+812.4) | 813.8 (+1.4) | 885.6 (+71.8) |
| 2 | 2回目 | 0 | 633.8 (+633.8) | 636.2 (+2.4) | 680.1 (+43.9) |
| 3 | 1回目 | 313.2* | 1502.8 (+1189.5*) | 1505.8 (+3.1) | 1637.1 (+131.3) |
| 3 | 2回目 | 0 | 680.7 (+680.7) | 682.1 (+1.3) | 711.1 (+29.1) |

\* 起動3の1回目のみ`input`マークが2回発火し（file inputのonChangeが二重発火した痕跡）、
2回目の発火分だけがsnapshotに残った。区間長そのもの（input→parsed差）は他の起動と
同程度（1189.5ms、ただし絶対値は最大）のため傾向解釈への影響は小さいと判断し、
そのまま記載する。

### 1回目 vs 2回目（input→parsed区間、ag-psdデコード＋主スレッド処理相当）

| 起動# | 1回目 | 2回目 | 差分 |
|---|---|---|---|
| 1 | 936.7ms | 638.0ms | -298.7ms |
| 2 | 812.4ms | 633.8ms | -178.6ms |
| 3 | 1189.5ms | 680.7ms | -508.8ms |

1回目は2回目よりinput→parsed区間が平均+328ms遅い。`present-scene-cold-start.md`が
指摘する「presentSceneの初回のみのコールドコスト（~200〜350ms）」と同じオーダーの
一回性コストが、PSDインポートのUIフロー側（ワーカー起動・WASM初期化等）にも
存在すると解釈できる。

### T5（native present確定）: 到達せず

`document.documentElement.dataset`の`uxfdSharedRendererPresenterPsdOwner`は
6サンプル全てで`'pixi'`のまま、`uxfdSharedRendererPresenterPsdCutoverReason`は
`'nativeRenderFrameUnavailable'`のまま20秒のポーリングでタイムアウトした。

コード調査の結果、原因はタスク前提の誤りではなく実装側の未配線であることを確認した。
`nativeRenderFrameReady`を`true`にする唯一の経路は
`sharedRendererViewportPresenterOrchestration.ts`の`sharedRendererNativeRenderFrameUpload`
（`prepareNativeRenderUpload`が返した結果）だが、`prepareNativeRenderUpload`を実引数として
渡している呼び出し元は`sharedRendererPreviewPresenterController.test.ts`のみで、
`src/components/Viewport.tsx`からは一度も呼ばれていない
（`grep -rn prepareNativeRenderUpload src`で確認）。つまり現行ビルドでは
PSD単体のプレビューが「native present」状態（sharedRenderer所有）へ遷移すること自体が
実装として未接続であり、evaluateReady（T4）が事実上の終端信号になっている。

## 結論

- 支配区間は**input→parsed**（ag-psdワーカーでの読み込み・デコード）。1回目・2回目とも
  全体の70〜90%をこの区間が占め、`parsed→objectAdded`（数ms）・
  `objectAdded→evaluateReady`（30〜130ms、scene RPC evaluate往復）は相対的に小さい。
- `agpsd-baseline.md`のreadPsd単体中央値（405〜460ms、VM実測）と比較すると、
  macOS実機のUIフロー内input→parsedは2回目でも633〜681msとやや大きい。
  `psdParser.ts`側のファイル読み込み・Worker起動・postMessage往復など
  「readPsd本体以外」の周辺コストが数百ms単位で乗っていることが示唆される
  （本実験では内訳をこれ以上分解していない。次の一手で切り分ける）。
- 1回目は2回目より平均+328ms遅く、一回性のコールドコストが確かに存在する。
  ただし`present-scene-cold-start.md`のpresentScene側コストとは別に、
  PSDインポート固有のコールドコストがinput→parsed区間に乗っている可能性が高い
  （evaluateReady以降のnative present遷移そのものが未配線のため、その区間のコールド
  コストは今回測れていない）。
- T5（native present）は現行実装では未到達。path Bの効果を「体感表示までの時間」で
  語るには、まずT5に至る配線（`prepareNativeRenderUpload`のViewport.tsxからの実配線）
  自体が別タスクとして必要になる。

## 次の一手

1. path B（`double-decode-discovery.md`が示す「ag-psdスキップ＋メタデータをRustから」）
   の試作をこのcurrent baseline（input→parsed中央値 約680〜940ms、1回目コールド込み）
   と同一条件（同一PSD・同一計測点）で比較する。
2. input→parsed区間をさらに分解する計測点（Worker起動完了・postMessage送出・
   ag-psd内部完了）を追加し、「読み込み待ち」と「デコード」のどちらが支配的かを
   macOS実機で切り分ける。
3. `prepareNativeRenderUpload`のViewport.tsx配線状況は本タスクの担当範囲外だが、
   T5を将来計測可能にするための前提条件として別途フラグを立てる。
