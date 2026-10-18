# 残タスク一覧（2026-10-18 更新）

`feature-proxy`のコード、計画書、決定ログ、コミット履歴を照合した再開用一覧。
優先順位は今回の再開に向けた推奨順。未検証事項は不具合確定と区別する。

## 直近の完了事項

- Scene Build P0・P1・P2a/bの実装、P2cの常駐scene export修正。P2cは全群ON混在E2Eで60/60フレーム出力を確認済み。
- H.264 / HEVC / ProResのコーデック選択と書き出し経路への接続。
- テキスト末尾文字の折り返し欠落、選択・ドラッグ不可、不要なリサイズハンドル、文字サイズ変更後の古い選択枠を修正済み。
- 新規プロジェクトのfps整数自由入力（1〜240）。
- Windows移植W0〜W7、Remote Control Deckの各計画フェーズは完了扱い。下記の追加検証・仕上げは別に残る。

## 再開順

| 順位 | タスク | 現状・完了条件 |
| --- | --- | --- |
| 1 | P2c一時診断の撤去 | **完了（2026-10-16）**。controller lifecycleの全イベント履歴を撤去。export確認中・成功・失敗の通常statusと回帰テストを維持。関連8ファイル101テスト・型チェック成功。 |
| 2 | P2全体の完了条件を棚卸し | **部分完了（2026-10-16）**。direct exportのRust resident評価、原本参照、失敗伝播、cancelに加え、未対応だった生成25型を統合。42 object kind中40 visual clipをTS/Rustで一致確認。AutoBlur欠落と振動の動的評価も修正。既存447フレームと振動境界9フレームの計456フレームが一致。既存混在動画はnativeDirect有効/無効の両構成で60/60フレーム成功。graph-only既定経路も混在MP4を60/60フレーム出力済み。 |
| 3 | P3: TS serializer撤去 | **完了（2026-10-18）**。raw EditableSceneGraphを既定の唯一のproduction経路とし、export評価providerを必須化。旧TS builder・serializer・位置評価をReference実装へ隔離し、production buildから除外。比較fixtureは維持。 |
| 4 | P4: UI評価値をRustへ移行 | **機能移行・再生実UI確認済み（2026-10-18）**。キー追加・分割・Vision追跡のRust位置queryを必須化。分割の単一Undo/Redo、取消、Visionの実UIで68キー適用を確認。f64のJSON往復ずれを修正し93時刻すべて一致。選択枠・hit-testはRust評価snapshotへ接続。native本体/選択枠の同時提示、旧通知破棄、再生中scrubと即Pauseも実Electronで確認済み。停止スクラブ後の図形・装飾Textのクリック/ドラッグ、図形resizeも実UI確認し、preview原点混入によるresize過大を修正した。以前の基準値に対する遅延比較が残る。 |
| 5 | テキストの縁取り・影のクリップ | **完了（2026-10-16）**。装飾分の領域拡張と描画原点補正を全経路に接続。回転・負scale・keyframe・途中group_control開始/終了の位置不変性を検証。447-frame parityと影付き日本語テキストのMP4書き出し360/360フレームが成功。 |
| 6 | フィルタ値編集のUndo/Redo | **完了（2026-10-16）**。入力開始〜終了を1操作として履歴化。連続入力・非同期応答・scene切替・フォーカス中Undo/Redo・通常テキスト入力のnative Undo維持を検証。実Electron/CDPのPropertyPanel操作でも確認。 |

出典: [Scene Build計画](Scene_Build_In_Rust_Plan.md)、[P2c決定ログ](../progress/scene-build-p2c-resident-scene-export-revision.md)、[テキスト装飾クリップ](../progress/text-stroke-shadow-clipping.md)、`src/store/useStore.ts`の`updateObjectFilterParams`。

## 検証・判断が必要な項目

- **scene.replace性能**: 標準入出力RPCの初期測定は完了（shape 1/100/1000件の中央値0.048/0.956/8.719ms）。Electron往復・実編集シーンの計測と許容上限の判断は未完了。[測定範囲と限界](../progress/raw-scene-replace-performance.md)。
- **Windows仕上げ**: **DXC同梱は完了**。固定版・checksum取得、pack前検証、exe横へのDLL/ライセンス配置を実装し、macOSからWindows x64のunpacked配置まで確認した（[記録](../progress/windows-dxc-packaging.md)）。初回attachの同期パイプライン生成は後続のAsyncTask・段階構築で対処済み（[実装・実測記録](../progress/windows-w7-async-attach.md)）。残りはWindows実機build/起動・高DPI・HTML UI重なり検証。旧mainpc撤去とWindows接続サービス停止のため、実機検証は環境待ち。
- **外部video経路の色差**: 既存のmatrix / colourSpace明示修正は完了。再現素材のffprobeと、現在のnative描画経路で影響が残るかの確認が必要。過去経路の仮説だけで新規修正を始めない。[調査ログ](../progress/external-video-colour-mismatch.md)。
- **実機確認の追補**: NV12リング停止は原本/proxy実測と後続混在E2Eを含め検証済み。resident評価exportの音声waveform/sphereも混在E2Eの画素検査で確認済み。native direct encodeも音声反応を含む混在シーンで60/60フレーム出力・画素検査成功。3D Stage exportの経路選択不具合は修正済み。空の静的stageをH.264で30/30フレーム出力し、約3.2秒を観測（[範囲と制約](../progress/stage3d-export-readback-frame-alignment.md)）。動的scene・実コンテンツのpreview/export一致とGPU別の性能比較は未検証。速度未測定を性能劣化と判定しない。

## 後続の機能・改善候補

- エージェントレシピのテキスト実測による自動整列、blur fallbackの負荷改善。
- GetColor / hksy / 93混在の保存・読込・描画品質を継続検証する代表シーンの充足確認。既存の重量編集・parity fixtureと重複する基盤は増設しない。
- アニメ撮影機能と3D空間オーディオ。[構想書](Anime_Compositing_And_Spatial_Audio_Plan.md)は実装計画化前に、現行合成モード・多段フィルタとの差分を再調査する。
- React commit / DOM layoutの性能研究。研究記録は`perf_research/`を正とする。
- 小数fpsは未対応。対応時は分子・分母をencodeまで通す（整数入力機能の未完了扱いにはしない）。
- `main` / `feature-proxy`の統合・運用方針。統合操作は別途方針を確定して実施する。

## 旧一覧（2026-08-07〜08-08、履歴資料）

以下は当時の記録。現在の着手判断には上の一覧と各計画書の最新追記を用いる。

### 旧一覧の調査時点

`feature-proxy` ブランチの作業ツリーがクリーンな状態で、ドキュメントとコミット履歴から
洗い出した未着手タスクをまとめる。着手時はこのファイルの該当項目へ進捗を追記する。

---

## 1. 未修正バグ

### 1-1. 外部ビデオ経路のシーク後の色崩れ（優先度: 高）

- 出典: [Bug_ExternalVideoPausedFrameZero.md](./Bug_ExternalVideoPausedFrameZero.md) §5
- 症状: シーク後、外部ビデオ経路（`importExternalTexture` + `externalVideoFrameShaderCode`）の
  出力色が Rust デコード RGBA 経路と食い違う。
- 想定原因: `importExternalTexture` が video のネイティブ色空間（bt709 等）を内部変換するため、
  シェーダ側の前提（sRGB / linear、premultiplied alpha）とズレる。
- 完了条件: `markdown/architecture/03-colour-pipeline.md` の規約に沿って両経路の色を一致させ、
  画素比較テストで固定する。
- 備考: プレビューと export の色が食い違う状態は他の見た目の判断すべてを狂わせるため、
  UI 整理や機能追加より優先する価値がある。
- **進捗（2026-08-08）**: 診断完了（[progress/external-video-colour-mismatch.md](../progress/external-video-colour-mismatch.md)）。
  エンコード/リニア不一致説は棄却。契約違反2件を修正済み：
  ffmpeg フォールバックの `in_color_matrix` 明示化（`c922644d`）と
  `importExternalTexture` の `colorSpace: 'srgb'` 明示固定（`cfe29058`、版 488b）。
  残り: 再現素材の ffprobe による H1（タグ無し素材のヒューリスティック不一致）実証待ち。
  素材が bt709 タグ付きなら transfer 微差説（H2）へ移行する。

### 1-2. テキストの縁取り・影がプレーン境界でクリップされる（優先度: 中〜高）

- 出典: [text-stroke-shadow-clipping.md](../progress/text-stroke-shadow-clipping.md)
- 症状: `textStroke.width` / `textShadow.offset` / `textShadow.blur` で本体グリフより外側へ
  広がる装飾が、テキストプレーンの境界で切り落とされる。
- 想定原因: プレーン寸法が本体グリフのメトリクスだけで決まり、装飾のはみ出し分が加算されていない。
- 難所: プレーンを広げるだけだと回転軸が動くため、TS 側の寸法・位置と Rust 側の描画原点を
  協調して変更する必要がある。
- 備考: `textShadow.blur` 実装（Beta-483a）以降、影がさらに外側へ広がるため以前より目立つ。

---

## 2. エージェントレシピの詰め

出典: [ai-agent-editing.md](../progress/ai-agent-editing.md)

### 2-1. テキストの実測幅が不明で `align` が活きない

- 現状: `text` の実測幅はビルド時点で不明なため、厳密な中央寄せをしたいテキストは
  `width` / `height` に想定サイズを明示する必要がある（自動計測はしない）。
- 課題: 座標の手計算を減らすために `align` / `relativeTo` を入れたのに、テキストだけ
  手動指定が残るので効果が半減している。
- 方向性: フォントメトリクス計測の導線を用意し、レシピ展開時に実測幅を解決する。

### 2-2. `blur` のフォールバック経路が極端に遅い

- 現状: GPU 非対応のフォールバックレンダリング環境では、`strength` / 対象サイズを大きくするほど
  書き出しが極端に遅くなり、`agent:video` がタイムアウトする（400 秒でも完走しないケースを確認）。
- 現在の回避策: 運用で `strength: 20〜30` 程度・対象を画面の一部にとどめる、という約束のみ。
- 方向性: フォールバック経路のぼかし実装を分離可能フィルタ等で計算量を落とすか、
  上限を実装側で強制してタイムアウトを構造的に防ぐ。

---

## 3. Task.md 2026-06-23 方針の未消化分

出典: [Task.md](./Task.md) 「追加タスク（2026-06-23）」

AviUtlPackV4 の広範囲な新規移植を止め、既に入れた `GetColor` / `hksy` / `93` 系の詰めへ移る、
という方針が立っているが、以下がまだ手付かずである。

- 代表シーンを固定し、GetColor / hksy / 93 が混在した状態で、保存 / 読込、Rust scene snapshot、
  native media support、preview / export 品質確認を継続できるテスト基盤を整える。
- 以後の優先順位（機能数追加より上位に置くと宣言した軸）:
  UI 整理、パラメータ理解性、即時プレビュー、export との差分低減、画素検査、操作性改善。

---

## 4. パフォーマンス（→ `perf_research/` へ移管）

現状で困ってはいないが余力を詰める探索として、独立した研究ディレクトリで進める。
実測・仮説・棄却記録は [perf_research/notes/INDEX.md](../perf_research/notes/INDEX.md) を正とする。

未解決の主要な問いは次の 2 つ（出典: [renderer-per-frame-rerender.md](../progress/renderer-per-frame-rerender.md)）。

- `Viewport` の `commitCount` が 377 → 191 に半減した後も、再生区間 178 フレームに対して
  約 1 回 / フレームのコミットが残っている。発生源が未特定。
- `layoutCount` 213 の主体が「React のコミット」から「rAF 内の命令的 DOM 更新」へ移った。
  最有力候補は `TimelineCurrentTimeDisplay` の `textContent` 更新だが未確定。
  また、選択ありシナリオでの選択枠 SVG パッチの layout 影響は未測定。

---

## 5. ブランチ運用

- `main` と `feature-proxy` の差が 2906 コミットある。`feature-proxy` が事実上の開発線に
  なっているため、統合方針を決めるかブランチ運用を整理するかの判断がどこかで要る。
