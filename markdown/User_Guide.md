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
