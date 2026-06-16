# 実装計画

## AviUtl互換ロードマップ（2026-02-11）
詳細は `markdown/AviUtl_Gap_Analysis.md` を正とする。

### 優先順位
1. `P0`: プロジェクト永続化、レイヤー基盤、複数選択/コピー貼り付け、フィルタスタック基盤、音声統合エクスポート
2. `P1`: 中間点 UI、シーン、カメラ制御、主要フィルタ第1群
3. `P2`: 主要フィルタ第2群、`.exo` 系入出力、グリッド/スナップ詳細、バッチ出力
4. `P3`: スクリプト制御、エイリアス/プリセット、拡張プラグインモデル

### 直近実装順
1. ✅ プロジェクト保存/読込（完了）
2. ✅ レイヤー運用拡張（100レイヤー、ロック、表示、名称、保存復元）（完了）
3. ✅ 複数選択とクリップボード編集（完了）
4. ✅ フィルタスタック基盤（完了）
5. ✅ エクスポート音声統合（完了）
6. ✅ 中間点 UI と補間管理（完了）
7. ✅ 複数選択オブジェクトの切り取り（完了）
8. ✅ タイムライン範囲選択（完了）
9. ✅ 選択オブジェクト一括変形（完了）

## 方針
1. 変更範囲は「効果が大きく、挙動リスクが低い箇所」を優先する。
2. `useStore()` の全体購読を減らし、必要な値だけ購読する。
3. 高頻度ループ（再生・ドラッグ・書き出し）での不要処理を削減する。

## 実施ステップ
1. `useStore` の更新処理を最適化する  
`updateObject` で実際に差分がある場合のみ更新し、`duration` 再計算は時間系変更時のみに限定する。

2. UI 側の購読をセレクタ化する  
`App`、`Timeline`、`TimelineItem`、`Viewport`、`PropertyPanel` などで `selector + shallow` を導入する。

3. タイムライン再描画を抑制する  
`TimelineItem` を `React.memo` 化し、コールバックの参照を安定化して再生中の無駄な再レンダリングを減らす。

4. エクスポート転送を軽量化する  
`toDataURL(base64)` をやめ、`Blob -> ArrayBuffer` で IPC 転送する。  
Electron 側は `stdin` バックプレッシャーを考慮して書き込みを待機する。

5. PSD 同期処理を間引く  
ポーリング間隔とレイヤーツリー取得頻度を調整し、`executeJavaScript` の連打を減らす。

6. TypeScript エラーを解消する  
型定義不足（`PsdLayerNode` 等）を補完し、Pixi v8 API と合わない箇所を修正する。

7. Rust バックエンドの第1段階を構築する  
`rust-backend/` を新設し、`stdio` JSON-RPC で `health` 応答できる最小プロセスを実装する。  
Electron メインプロセスに Rust プロセス管理と IPC ラッパーを追加し、将来の書き出し移管の土台を整える。

8. 書き出しパイプライン制御を Rust 側へ移管する  
`export.start` / `export.write_frame` / `export.end` を Rust 側に実装し、Electron の `start-export` / `write-frame` / `end-export` ハンドラは Rust API 呼び出しへ切り替える。

9. メディアメタデータ解析を Rust 側へ移管する  
`media.probe` を Rust 側に実装し、動画/音声の追加時は `probe-media` を優先して `duration`・`width`・`height` を取得する。  
`filePath` が取れない環境や `ffprobe` 失敗時のみ、`HTMLMediaElement` での既存メタデータ取得へフォールバックする。

10. PSD 同期処理を即時反映 + 低負荷化する  
`PsdToolBridge` に即時同期 API を追加し、レイヤートグル後は強制同期でプレビューとツリーを更新する。  
常時ポーリング間隔を緩め、重い処理（`toDataURL` / ツリー収集）の実行回数を削減する。

11. ビルド署名を無効化する  
`build` スクリプトに `CSC_IDENTITY_AUTO_DISCOVERY=false` を適用し、macOS 証明書がない環境でもパッケージングを進められるようにする。

12. PSDToolKit 依存を撤廃して再構築する  
PSD の追加時に `ag-psd` で `rootLayer` / `activeLayerIds` / `layerTree` を生成し、Pixi 描画はレイヤーツリーを直接レンダリングする。  
PropertyPanel の表情切り替えは `activeLayerIds` を直接更新する方式へ置き換え、webview ブリッジを削除する。

13. PSD 画像データ変換の互換性不具合を修正する  
`layer.imageData` が `ImageData` 形式で返るケースを考慮した正規化処理を追加し、0 要素配列による `ImageData` 生成失敗を防止する。

14. PSD レイヤーテクスチャ生成の互換性を改善する  
`Texture.from(img)` をやめ、canvas 経由でテクスチャを生成して Pixi の WebGPU 警告を抑制する。  
同時に `Uint16Array` / `Float32Array` などの `PixelArray` を 8bit RGBA へ正規化する。

15. PSD レイヤー順序の逆転を修正する  
`ag-psd` から取得した `children` の順序を保持し、不要な `reverse()` を除去して PSD 上の前後関係と一致させる。

16. プロパティパネルにメディア音量/PSDスケール編集を追加する  
`video` / `audio` 選択時に `Mute` と `Volume` (0〜100%) を編集可能にし、既存再生経路へ即時反映する。  
`psd` 選択時に `scale` (0.1〜10) を編集可能にし、Pixi 側の `psdContent.scale` へ反映させる。

17. 選択枠の境界計算を実描画ベースへ修正する  
`Viewport` の黄色枠描画を `width/height` 固定から `content` の実境界 (`getBounds`) 基準へ変更し、PSD レイヤーオフセットを含む表示ずれを解消する。

18. ffmpeg の stderr パイプ詰まりを回避する  
Rust バックエンドの `export.start` で `stderr` を未読 `pipe` にしない構成へ変更し、長尺エクスポート時のバックプレッシャーで `export.write_frame` が停止するリスクを除去する。

19. ラジオグループ排他制御を祖先まで拡張する  
`togglePsdLayer` の排他判定を直近親だけでなく経路上の全ラジオグループに適用し、サブグループ配下の枝も含めて非選択側を無効化する。

20. P0-1 プロジェクト保存/読込を実装する  
Electron IPC で `save-project-file` / `open-project-file` / `read-file-bytes` を追加し、`*.uxfd.json` を入出力できるようにする。  
Renderer 側では `projectFile` ユーティリティを新設し、PSD を含むオブジェクト復元（ファイルパス再解決・PSD 再解析・レイヤー状態復元）を行う。

21. P0-2 レイヤー運用拡張を実装する  
`MAX_LAYERS` を 100 へ拡張し、レイヤー状態（`name` / `visible` / `locked`）をストアで管理する。  
タイムラインヘッダで表示/ロック切替と名称編集を可能にし、ロック時編集禁止・非表示時プレビュー非描画・プロジェクト保存復元まで通す。

22. P0-3 複数選択とクリップボード操作を実装する  
`selectedIds` ベースの複数選択状態を導入し、`Ctrl/Cmd` 修飾でトグル選択できるようにする。  
`copy` / `paste` / `duplicate` / `group` / `ungroup` / `deleteSelected` をストアアクション化し、ショートカット・ツールバー・コンテキストメニューから呼べるようにする。

23. P0-4 フィルタスタック基盤を実装する  
オブジェクトに `filters` 配列を追加し、`add/remove/move/toggle` とパラメータ更新 API をストアへ追加する。  
既存エフェクト（色調補正/クリッピング/振動/影/グラデーション）と双方向同期できるようにし、PropertyPanel でスタック編集を可能にする。

24. P0-5 音声統合エクスポートを実装する  
書き出し前にタイムライン上の `audio` / `video` オブジェクトから音声をミックスし、WAV 一時ファイルを生成する。  
`start-export.audioPath` へ渡して Rust バックエンドの `ffmpeg` 入力へ接続し、映像と同時に音声を出力する。

25. P1-1 中間点 UI と補間管理を実装する  
オブジェクトにキーフレーム配列（絶対時刻 + 座標 + easing）を持たせ、PropertyPanel で追加/編集/削除できるようにする。  
Viewport とグループ制御計算でキーフレーム補間を優先し、複製/貼り付け/分割時にもキーフレーム整合を維持する。

26. P0-3 追加: 切り取り（Cut）を実装する  
`selectedIds` を対象に `copy + delete` 相当のストアアクション `cutSelectedObjects` を追加し、ロックレイヤーは除外して安全に処理する。  
`Ctrl/Cmd + X`、ツールバー、タイムライン右クリックメニューから呼び出せるようにして、AviUtl 相当の編集フローを補完する。

27. P0-3 追加: タイムライン範囲選択を実装する  
空白領域のドラッグで選択矩形を表示し、重なったオブジェクトを複数選択できるようにする。  
`Shift/Ctrl/Cmd` 修飾時は既存選択へ加算し、非修飾時は選択を置き換える。

28. P0-3 追加: 選択一括変形を実装する  
複数選択時の `PropertyPanel` に一括変形 UI（移動、拡大率、回転、不透明度）を追加する。  
適用時は履歴を 1 ステップで記録し、各オブジェクトへまとめて反映する。

29. PR レビュー指摘の不具合を修正する  
`splitObject` で分割時刻の境界キーを補間挿入し、キーフレーム分割後の位置ジャンプを防止する。  
エクスポート時は非表示レイヤーを音声ミックス対象から除外し、映像の可視状態と整合させる。  
プロジェクト読込時は `objects` を要素単位で検証し、不正データでの実行時クラッシュを防止する。

30. グループ単位グラデーションを実装する  
`groupId` を共有する可視オブジェクトを Pixi のグループコンテナへ再配置し、コンテナへグラデーションフィルタを適用する。  
PropertyPanel では `Group Gradient` を編集可能にし、同一グループ全メンバーへ設定を同期して「複合形状全体に1つの勾配」を実現する。

31. PSD レイヤー名の文字化けを補正する  
`ag-psd` の 1 バイト名読み込みで文字化けしたレイヤー名を `utf-8` / `shift_jis` / `euc-jp` で再評価し、可読性スコアの高い結果を採用する。  
Unicode 名は再解釈せずそのまま保持し、既存の ASCII レイヤー名の挙動を維持する。

32. クリッピング不具合・複数移動・初期配置・MP3 出力をまとめて修正する  
`DiagonalClippingFilter` に WebGPU 用 `gpuProgram` を追加し、`webgpu` 優先環境でも `clipping` フィルタを有効化する。  
範囲選択後のドラッグで選択集合を維持したまま複数オブジェクトを同時移動（時間 + レイヤー）できるようにする。  
追加/ドロップ/波形追加の初期座標を固定値から `projectSettings.width/height` 基準の中央配置へ置き換える。  
`Export MP3` ボタンと `export-audio-mp3` IPC を追加し、既存音声ミックス（WAV）を `ffmpeg` で MP3 へ変換して保存する。

33. iPhone 画面収録動画の WebGPU 例外を修正する  
`Texture.from(video)` をやめ、動画フレームを canvas へ描画してから Pixi テクスチャへ反映する方式へ切り替える。  
動画解像度変化時はフレーム用 canvas/texture を再生成し、非表示化・破棄時に関連テクスチャを明示的に `destroy` してリークを防止する。

34. Phase5: Pixi video cutover ownership gate を追加する  
shared renderer が `rust-wasm` video decode request と decoded frame upload readiness を確認できる時だけ video ownership を取る。  
`Viewport` は ownership 対象 clip id を Pixi 更新へ渡し、`pixiRenderHelper` は該当 video の Pixi children / `HTMLVideoElement` / video texture を cleanup して video 分岐を抜ける。  
actual pixel decode / shared memory / WebGPU texture upload が未実装の間は `videoFrameUploadReady=false` により Pixi preview を維持する。

35. Phase5: video cutover z-order safety を追加する  
shared renderer canvas が Pixi 全体の上に重なる構造を前提に、cutover 候補 video より前面に Pixi-only object がある場合は video ownership を Pixi に戻す。  
前面の `SolidColour` と同時 cutover 対象の `Video` は shared renderer stack として許可し、`Image` / PSD / text / unsupported object は blocker とする。

36. Phase5: SolidColour rectangle を Pixi から shared renderer ownership へ移管する  
`rust-wasm` geometry と z-order safety を満たす SolidColour rectangle だけを shared renderer owner とし、presenter draw list を owned id に絞る。  
Pixi 側では該当 shape の children を cleanup して `hitArea` だけ残し、preview の interaction は維持する。  
export は現行 Pixi canvas を正本にしているため、`isExporting` 中は Pixi shape rendering を維持する。

## UI 刷新（2026-04-19）

### デザインシステム定義
1. **カラーパレット**: 
   - Base: Zinc 系（`#09090b` 〜 `#27272a`）
   - Primary: Indigo/Blue 系（`#3f51b5` / `#007acc`）
   - Surface: グラスモフィズム（`rgba(24, 24, 27, 0.8)` + `backdrop-filter: blur(12px)`）
2. **タイポグラフィ**: 
   - `Inter`, `Roboto`, システムフォント（英字）+ `Hiragino Sans`, `Meiryo`（日本語）
3. **エフェクト**: 
   - 1px の微妙なボーダー（`rgba(255, 255, 255, 0.1)`）
   - ソフトなドロップシャドウ

### 実施内容
34. **グローバルスタイルの更新 (`index.css`)**
    - デザインシステムのトークン定義とスクロールバー、ボタン、入力フォームの基本スタイルを現代化する。

35. **App レイアウトのリファクタリング (`App.tsx`)**
    - インラインスタイルを CSS クラスへ移行。
    - タイトルバーとメインエリアのレイアウトを洗練させる。

36. **各コンポーネントのデザインアップグレード**
    - `ProjectSetup`: ウェルカム画面をより魅力的に。
    - `PropertyPanel`: セクション区切りや入力フィールドを整理し、使いやすく。
    - `Timeline`: タイムラインバー、トラック、アイテムの視覚的フィードバックを強化。
    - `Viewport`: プレビュー領域の背景や枠線をプレミアムな質感に。
