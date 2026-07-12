# UX Film Director 使い方ガイド

## 1. 画面構成
- 上部バー: `プロジェクトを開く` / `プロジェクトを保存` / `Snapshot` / `Export MP3` / `Export Video`
- 中央: プレビュー（Viewport）
- 右: プロパティ（PropertyPanel）
- 下: タイムライン（編集の中心）

## 2. 最短手順（はじめて触る方向け）
1. タイムライン上部の `+ Shape` / `+ Text` / `+ Image` / `+ Video` / `+ Audio` / `+ PSD` で素材を追加する。
2. タイムラインでクリップをドラッグして位置・長さを調整する。
3. 右パネル `Transform` で `X/Y/Scale/Rotation/Opacity` を調整する。
4. 必要に応じて `Filter Stack` と `Keyframes` を設定する。
5. `プロジェクトを保存` で `*.uxfd.json` として保存する。
6. `Export Video` で動画を書き出す、または `Export MP3` で音声のみを書き出す。

## 3. タイムライン操作
- 再生/停止: `Space`
- 再生ヘッド移動: ルーラーをドラッグ
- クリップ移動: クリップ本体をドラッグ
- 長さ変更: クリップ右端をドラッグ
- 分割: `Split` ボタン
- 右クリックメニュー: 追加/コピー/切り取り/貼り付け/複製/グループ化など

## 4. 複数選択と一括編集
- 複数選択追加: `Ctrl/Cmd + クリック` または `Shift + クリック`
- 範囲選択: タイムライン空白をドラッグ（矩形選択）
- コピー: `Ctrl/Cmd + C`
- 切り取り: `Ctrl/Cmd + X`
- 貼り付け: `Ctrl/Cmd + V`
- 複製: `Ctrl/Cmd + D`
- グループ化: `Ctrl/Cmd + G`
- グループ解除: `Ctrl/Cmd + Shift + G`
- 複数選択中は右パネルに `一括変形` が表示される。
  - `移動 X/Y`
  - `拡大率X/Y %`
  - `回転 Δ`
  - `不透明度 Δ%`

## 5. プロパティパネル主要項目
- `Transform`: 位置・拡大縮小・回転・不透明度
- `Transform` のScaleはデフォルトで縦横比を固定する。自由変形したい場合は `比率を固定` をOFFにする。
- `Keyframes`: 中間点の追加/編集/削除、補間設定
- `Filter Stack`: フィルタ追加、順序変更、ON/OFF、パラメータ編集（色調補正/クリッピング/振動/影/グラデーション）
- `Group Gradient`（グループ選択時）: 同一グループへグラデーションを適用（`Scope` 切替UIは現在一時非表示）
- `Audio`（動画/音声選択時）: `Mute` / `Volume`
- `PSD`（PSD選択時）: `Scale`、レイヤーON/OFF

## 6. レイヤー操作
- `V`: 表示/非表示
- `L`: ロック/解除
- レイヤー名変更: 左ヘッダをダブルクリック
- ロック中のレイヤー上オブジェクトは編集不可

## 7. 保存・再開・書き出し
- 保存形式: `*.uxfd.json`
- 再開: `プロジェクトを開く`
- 書き出し: `Export Video`
- 音声のみ書き出し: `Export MP3`
- 静止画保存: `Snapshot`
- iPhone 画面収録素材など一部動画は内部で canvas 経由描画し、WebGPU での読込安定性を優先する。
- 開発中の動画書き出しpresetは `compact` / `speed` / `balanced` / `quality`。現時点では環境変数 `VITE_UXFD_VIDEO_EXPORT_QUALITY_PRESET` で切り替え、必要なら `VITE_UXFD_VIDEO_EXPORT_BITRATE_KBPS` で任意bitrateを指定する。

## 7.1 書き出し品質の検証
- 実素材で速度・容量・品質を比較する場合は `npm run test:video-export:quality` を使う。
- 複数presetを比較する場合は `UXFD_VIDEO_EXPORT_QUALITY_PRESET_MATRIX=compact,speed,balanced,quality` を指定する。
- 結果は `.codex/video-export-quality/quality-report.json` と `.codex/video-export-quality/quality-matrix-report.json` に出力される。

## 8. ショートカット一覧
- `Space`: 再生/停止
- `Ctrl/Cmd + Z`: Undo
- `Ctrl/Cmd + Shift + Z` または `Ctrl + Y`: Redo
- `Ctrl/Cmd + C`: コピー
- `Ctrl/Cmd + X`: 切り取り
- `Ctrl/Cmd + V`: 貼り付け
- `Ctrl/Cmd + D`: 複製
- `Ctrl/Cmd + G`: グループ化
- `Ctrl/Cmd + Shift + G`: グループ解除
- `Delete` / `Backspace`: 削除
- `Escape`: 選択解除

## 9. リモートデッキ（スマホ / タブレットからの操作）

Android / iPhone / iPad のブラウザから、Stream Deck / DaVinci コントローラーのように本体を遠隔操作できます。専用アプリのインストールは不要です（パッケージ版にはデッキ UI が同梱されており、`npm run remote-deck:build` などの事前ビルドも不要です）。

### 9.1 接続手順

1. 本体とスマホを**同じ Wi-Fi（同一 LAN）**に接続する。
2. 本体タイトルバーのスマホアイコンをクリックし、リモートデッキパネルを開く。
3. 表示された QR コードをスマホのカメラで読み取り、開いた URL にアクセスする（URL にはワンタイムトークンが含まれています）。
4. ホーム画面に追加すると全画面の PWA として利用できます。

初回起動時、macOS で「ネットワーク受信接続を許可しますか？」というファイアウォールダイアログが表示されることがあります。**「許可」を選択**してください。拒否するとスマホから接続できません。

### 9.2 できること

- **トランスポート操作**（非選択時のボタングリッド）: 再生/停止（再生中は点灯・タイムコード表示）・Undo/Redo・±1/±10/±60 フレーム移動・削除/リップル削除・選択解除
- **コンテキスト操作面**（オブジェクト選択時、TouchBar 風に自動切替）:
  - 共通: X/Y 位置（ドラッグ帯で相対移動）・回転・不透明度・スケール（スライダーは横スワイプで粗調整、指を縦にずらすほど微調整）
  - PSD 立ち絵: 一様スケール、表情・差分（'*' レイヤー/フォルダ）の排他切替ボタン列、レイヤーツリーの表示切替
  - 動画/音声: 音量
- 本体側での変更（PropertyPanel・再生状態）はスマホへ自動反映されます。

### 9.3 接続管理

リモートデッキパネルで以下を行えます。

- **接続中デバイス一覧**: 接続元 IP と接続時刻を表示
- **個別切断**: 一覧の「切断」ボタン
- **トークン再生成**: 押すと接続中の全デバイスが切断され、QR コードが新しいトークンで更新されます（誰かに URL を知られた場合等に）

### 9.4 ボタンレイアウトのカスタマイズ

非選択時のボタングリッドは JSON で差し替えられます。リモートデッキパネルの「レイアウトファイルを開く」を押すと、ユーザーデータフォルダの `remote-deck-layout.json` が（初回はデフォルト内容で作成されて）表示されます。編集後、スマホ側でページを再読み込みすると反映されます。不正な JSON の場合はデフォルトレイアウトに自動フォールバックします。

```json
{
  "columns": 3,
  "buttons": [
    { "id": "play", "label": "再生/停止", "commandId": "playback.toggle" },
    { "id": "fwd10", "label": "+10f", "commandId": "playback.seekRelative", "payload": 10 }
  ]
}
```

利用可能な commandId: `playback.toggle` / `playback.seekRelative`（payload: フレーム数） / `edit.undo` / `edit.redo` / `edit.delete`（payload: `{"ripple": true|false}`） / `selection.escape`

### 9.5 トラブルシュート

- **QR を読んでもページが開かない**: スマホと本体が同じ Wi-Fi にいるか確認。ゲスト用 Wi-Fi や「プライバシーセパレータ」有効の AP では端末間通信が遮断されます。
- **「切断」表示のまま繋がらない**: macOS のファイアウォールで本体アプリの受信接続が許可されているか確認（システム設定 → ネットワーク → ファイアウォール）。
- **突然切断された / 接続を拒否される**: トークンが再生成された可能性があります。パネルの QR を再読取りしてください。
- **操作が反映されない**: 本体のプロジェクトが読み込まれているか、対象オブジェクトが選択されているか確認してください。
