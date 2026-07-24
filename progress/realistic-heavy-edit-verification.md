# 現実的な重量編集の検証基盤

## 目的

軽い単機能サンプルではなく、実際の編集で起こり得る重い構成を毎回同じ条件で作り、次を一度に判定する。

- 編集画面が黒化・停止・クラッシュしない
- スクラブ、複製、Undo/Redo、シーン切替、再生が成立する
- 保存したプロジェクトを同じ内容として復元できる
- `MissingSource` の誤診断や未処理例外が発生しない
- 画面に有色ピクセルが十分あり、合成結果が空でない
- 書き出した動画の解像度、長さ、フレーム数が期待値と一致する

## シナリオ

`src/e2e/realisticHeavyEditScenario.ts` が決定論的に3シーンを生成する。初期状態は全54オブジェクト、メインシーン32オブジェクトで、操作後は全63オブジェクト、メインシーン41オブジェクトになる。

メインシーンには次を同時に配置する。

- 4K動画とそのプロキシ
- 時間的・空間的に重なる動画2本
- WAV音声と静止画
- テキスト、矩形、グリッド、線、波形などの図形
- キーフレーム
- グループ制御
- GetColor、HKSY、SimpleTubeを含む複数エフェクト

入力動画の既定値は `perf/heavy-media/GX010052.MP4`、プロキシは `perf/heavy-media/GX010052.proxy.mp4` である。音声は検証時に決定論的に生成する。

## 実行方法

```bash
npm run test:realistic-heavy-edit:e2e
```

CLIは独立したViteポート、Electronプロファイル、CDP接続を用意し、次の順に検証する。

1. Native Overlay、共有フレームbridge、Rust backendを再ビルドし、古いdebugバイナリによる偽陽性を防ぐ
2. resident scene RPCとNative Overlayを有効にして重量プロジェクトを生成する
3. 360回のスクラブ、複数選択・複製、Undo/Redo、シーン切替、3秒再生を行う
4. プロジェクトをJSONへ直列化し、復元前後のフィンガープリントとID一意性を比較する
5. ビューポートを撮影し、可視・有色ピクセル数を検査する
6. 短い1920×1080動画を書き出し、`ffprobe`で長さとフレーム数を検査する
7. 未処理例外、コンソール上の`MissingSource`、resident/presenter状態、WGPU shader validation errorを集計する

主な環境変数は次のとおり。

| 変数 | 用途 | 既定値 |
| --- | --- | --- |
| `UXFD_REALISTIC_HEAVY_EDIT_VIDEO_PATH` | 4K入力動画 | `perf/heavy-media/GX010052.MP4` |
| `UXFD_REALISTIC_HEAVY_EDIT_PROXY_PATH` | プロキシ動画 | `perf/heavy-media/GX010052.proxy.mp4` |
| `UXFD_REALISTIC_HEAVY_EDIT_IMAGE_PATH` | 静止画 | `public/icon.jpg` |
| `UXFD_REALISTIC_HEAVY_EDIT_SCRUB_ITERATIONS` | スクラブ回数 | `360` |
| `UXFD_REALISTIC_HEAVY_EDIT_PLAYBACK_MS` | 再生時間 | `3000` |
| `UXFD_REALISTIC_HEAVY_EDIT_EXPORT_SECONDS` | 書き出し対象長 | `2` |
| `UXFD_REALISTIC_HEAVY_EDIT_SKIP_EXPORT` | `1`で書き出しを省略 | 未設定 |
| `UXFD_REALISTIC_HEAVY_EDIT_TIMEOUT_MS` | 全体タイムアウト | `300000` |

成果物は `.codex/realistic-heavy-edit-e2e/` に出力する。

- `result.json`: 機械判定結果と測定値
- `viewport.png`: 編集画面のスクリーンショット
- `realistic-heavy-edit.uxfd.json`: 実アプリでも開ける保存済みプロジェクト
- `realistic-heavy-edit-preview.mp4`: 短い書き出し結果
- `result.log`: 実行ログ

## 初回の検証結果

2026-07-24の開発ビルドでは、書き出しを含む代表実行を繰り返して総合判定がPASSした。

- 360回スクラブ: 約485～486 ms
- requestAnimationFrame: 平均16.68～16.69 ms、p95 18.22～20.66 ms、最大21.77～29.34 ms
- long task: 0～1件
- 保存復元: フィンガープリント一致、63件すべてID一意
- presenter: `ready`、`sharedRenderer`、surface gate `ok`
- `MissingSource`: 0件
- 未処理例外: 0件
- 書き出し: 1920×1080、2.24秒、134フレーム、約2.6 MB
- 書き出し所要時間: 約45.1～45.6秒
- Computer Use: 保存済みプロジェクトを実アプリで開き、黒化せず再生・停止できることを確認

一方、再生中の瞬間サンプルはElectronメイン約70～74%、Renderer約89～95%、Rust backend約99～102%であり、CPU負荷は依然として高い。今回のPASSは正しさと耐壊性を示すもので、十分な性能やGPUオフロード完了を意味しない。

## resident移行後の再検証

2026-07-24にresident scene RPCを強制し、ネイティブ成果物を毎回再ビルドする条件へ
検証基盤を更新した。旧debugバイナリではParticle WGSLの過去版がvalidation errorを
出してもE2EがPASSしていたため、現在は`wgpu uncaptured error`または
`Shader validation error`を1件でも検出すると失敗する。再ビルド後の実行では
これらは0件、`MissingSource`も0件だった。

対応済み部分では360回スクラブ、複製・Undo/Redo、保存JSONのフィンガープリント一致、
1920×1080・2.24秒・134フレームの書き出しまで成立した。再生中の瞬間サンプルは
Electronメイン約25～29%、Renderer約36～37%、Rust backend 0%で、初回測定より
低下した。ただし現在の総合判定は意図どおりFAILである。resident V1が次を明示拒否
しており、Chromium旧描画へ黙って戻さないためである。

- SpotLight以外のfilter
- subject crop
- 音声、group control、RegionFrame、AudioSphere
- groupIdを持つオブジェクト

拒否内容は`result.json`の`rustTimelineStatus`と`rustTimelineDetail`へ残る。
したがって、このシナリオの総合PASSをresident移行完了の出口条件として使える。

## 検証で発見した不具合

初回のシナリオ投入によって次を検出し、修正した。

- `group_control`を描画対象としてRustへ渡し、シーン全体が非対応扱いになって黒化する問題
- テキスト影に8桁カラーを渡し、native書き出しが拒否される問題
- 4Kシーク直後のデコード待機が200 msしかなく、初回ハードウェアデコード完了前に失敗する問題
- 静止画の実寸ではなく表示寸法をデコーダへ渡し、書き出し時に寸法不一致になる問題

## 制約と次の観測点

- 現在の値は1台のMac、開発ビルド、1回の代表測定であり、性能回帰の閾値にはまだ使わない
- CPU値は短い瞬間サンプルで、スレッド別・GPU別の時系列ではない
- 音声はファイルの存在とプロジェクト復元を検証するが、聴感上の同期までは自動判定しない
- 書き出しは短区間であり、長尺時のメモリ増加や熱による性能低下は別途ソーク試験が必要
- 次段階では同じシナリオを基準に、Instruments/Metal System Traceまたは符号化された時系列メトリクスでCPU・GPU・フレーム落ちを分離する
