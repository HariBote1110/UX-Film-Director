# 実施内容

## 20. AviUtl互換ギャップ分析と優先順位策定
- `markdown/AviUtl_Gap_Analysis.md` を新規作成し、AviUtl 本体 (`aviutl110`) / 拡張編集 (`exedit92`) と現行実装の差分を整理。
- 不足機能を「編集基盤」「オブジェクト/エフェクト」「入出力/運用」に分類し、P0〜P3 の優先順位を定義。
- 直近着手順として、`プロジェクト永続化 -> レイヤー拡張 -> 複数選択編集 -> フィルタスタック基盤 -> 音声統合エクスポート` を明文化。
- `markdown/Task.md` と `markdown/Implementation_Plan.md` にも今回タスクとロードマップを反映し、`markdown/` を単一の正とする方針に合わせて同期。

## 21. P0-1 プロジェクト保存/読込の実装
- `electron/main.ts`
- `save-project-file` / `open-project-file` / `read-file-bytes` の IPC を追加し、プロジェクト JSON 保存・読み込みとファイルバイト読込を実装。
- `src/utils/projectFile.ts`（新規）
- プロジェクトファイル形式（`uxfd-project` / version `1`）を定義し、保存時シリアライズと読込時バリデーションを実装。
- 読込時に `filePath` からメディア `src` を再解決し、PSD はバイナリ再読込 + `ag-psd` 再解析で復元する処理を追加。
- PSD の `activeLayerIds` は保存値を優先してマージし、`layerTree` を再構築して表情状態が復元されるようにした。
- `src/App.tsx`
- タイトルバーへ「プロジェクトを開く」「プロジェクトを保存」を追加し、保存/読込導線を実装。
- 読込完了時は `useStore.loadProject` で `projectSettings` / `objects` / `duration` / 履歴を一括復元するようにした。
- `src/store/useStore.ts`
- `loadProject` を追加し、プロジェクト読込時に状態を初期化しつつ復元できるようにした。
- `src/components/ProjectSetup.tsx`
- 初期画面に「既存プロジェクトを開く」ボタンを追加。
- `src/components/Timeline.tsx`
- `src/hooks/useTimelineDrop.ts`
- 画像/動画/音声/PSD 追加時に `filePath` を保持するよう変更し、保存後の再読込で再解決可能にした。
- `src/types.ts`
- `image` / `video` / `audio` / `psd` に `filePath?: string` を追加。
- `src/utils/mediaMetadata.ts`
- `filePath` から `file://` URL を生成する `toFileProtocolUrl` を追加。

## 22. P0-2 レイヤー運用拡張（100レイヤー/表示/ロック/名称）
- `src/components/timelineConstants.ts`
- レイヤー上限を `20 -> 100` に拡張した。
- `src/types.ts`
- `LayerState`（`name` / `visible` / `locked`）を追加した。
- `src/store/useStore.ts`
- `layers` 状態と `setLayerName` / `toggleLayerVisibility` / `toggleLayerLock` を追加した。
- `initializeProject` / `loadProject` でレイヤー状態を初期化・復元するように変更した。
- ロックレイヤー上の `addObject` / `updateObject` / `deleteObject` / `splitObject` を拒否し、編集禁止をストア層で保証した。
- `src/components/Timeline.tsx`
- タイムライン左ヘッダに表示切替（`V`）/ロック切替（`L`）/名称編集（ダブルクリック）を追加した。
- PSD 追加位置をコンテキストレイヤーに合わせ、ロックレイヤーへの追加を抑止した。
- `src/components/TimelineItem.tsx`
- レイヤー状態に応じて見た目を反映し、ロック時のドラッグ/リサイズを禁止した。
- `src/hooks/useTimelineDrop.ts`
- ドロップ追加時にロックレイヤーへの投入を抑止した。
- `src/hooks/usePixiInteraction.ts`
- ビューポート上ドラッグ時にロックレイヤーを編集対象外にした。
- `src/components/Viewport.tsx`
- レイヤー非表示時は描画対象から除外し、ロック時カーソルを `not-allowed` に変更した。
- `src/utils/projectFile.ts`
- プロジェクトファイルに `layers` を保存し、読込時に復元するように拡張した（既存ファイルは `layers` なしでも読込可能）。
- `src/App.tsx`
- 保存時に `layers` を含め、読込時に `loadProject(..., layers)` へ渡すように変更した。

## 23. P0-3 複数選択/コピー貼り付け/複製/グループ化
- `src/store/useStore.ts`
- `selectedIds` / `clipboard` を追加し、複数選択状態とコピー元スナップショットを管理するようにした。
- `copySelectedObjects` / `pasteClipboardObjects` / `duplicateSelectedObjects` / `groupSelectedObjects` / `ungroupSelectedObjects` / `deleteSelectedObjects` を追加した。
- 既存 `selectObject` と併用できるように `toggleObjectSelection` / `selectObjects` / `clearSelection` を追加し、単一選択との後方互換を維持した。
- `src/types.ts`
- オブジェクト同士の論理グループ識別用に `groupId?: string` を追加した。
- `src/components/TimelineItem.tsx`
- `Ctrl/Cmd` クリックで選択トグル、`Shift` クリックで選択追加できるようにした。
- 複数選択時の視覚反映と、グループ所属オブジェクトの `[G]` 表示を追加した。
- `src/hooks/usePixiInteraction.ts`
- ビューポート上でも `Ctrl/Cmd` / `Shift` を使った選択操作を追加し、タイムライン操作と整合させた。
- `src/components/Viewport.tsx`
- 選択枠描画を `selectedIds` ベースに変更し、複数選択を可視化した。
- `src/hooks/useAppLogic.ts`
- キー操作を拡張し、`Ctrl/Cmd + C/V/D/G`、`Ctrl/Cmd + Shift + G`、`Delete` を複数選択対応にした。
- `src/components/TimelineControlBar.tsx`
- `Copy` / `Paste` / `Dup` / `Group` / `Ungroup` ボタンを追加した。
- `src/components/TimelineContextMenu.tsx`
- オブジェクト右クリックメニューに `コピー/複製/貼り付け/グループ化/グループ解除` を追加した。
- `src/components/PropertyPanel.tsx`
- 複数選択中は件数表示（`(N objects selected)`）を表示し、編集中オブジェクトを明示した。

## 24. P0-4 フィルタスタック基盤
- `src/types.ts`
- `FilterType` / `ObjectFilter` を追加し、オブジェクトへ `filters` 配列を保持できるようにした。
- `src/utils/filterStack.ts`（新規）
- フィルタ生成、正規化、追加/削除/順序変更/ON-OFF、パラメータ更新、既存エフェクトとの同期ロジックを実装した。
- `src/store/useStore.ts`
- `addObjectFilter` / `toggleObjectFilter` / `moveObjectFilter` / `removeObjectFilter` / `updateObjectFilterParams` を追加した。
- `addObject` / `loadProject` / `updateObject` / 複製系処理でフィルタ同期を行い、既存プロジェクトと新形式を共存できるようにした。
- `src/components/PropertyPanel.tsx`
- `Filter Stack` セクションを追加し、フィルタ追加・有効無効・並び替え・削除と、選択フィルタのパラメータ編集を実装した。
- 既存エフェクト UI をフィルタスタック編集へ集約した。

## 25. P0-5 音声統合エクスポート
- `src/utils/audioMixdown.ts`（新規）
- タイムラインの `audio` / `video` オブジェクトを対象に、`startTime` / `duration` / `offset` / `volume` / `muted` を反映したオフライン音声ミックスを生成する処理を追加した。
- ミックス結果を WAV (`ArrayBuffer`) へエンコードする処理を実装した。
- `src/hooks/useProjectExport.ts`
- 書き出し開始前に音声ミックスを生成し、`save-temp-audio` で一時 WAV ファイルへ保存したうえで `start-export.audioPath` に渡すよう変更した。
- 書き出し完了/失敗時に `delete-temp-file` を呼び出し、一時ファイルを削除するようにした。
- `electron/main.ts`
- 一時 WAV 削除用 IPC `delete-temp-file` を追加した。

## 26. P1-1 中間点 UI と補間管理
- `src/types.ts`
- `PositionKeyframe` を追加し、オブジェクトへ `keyframes` を保持できるようにした。
- `src/utils/keyframes.ts`（新規）
- キーフレーム正規化、補間計算、オブジェクト位置評価、複製/移動時シフト処理、始点終点生成処理を実装した。
- `src/store/useStore.ts`
- `loadProject` / `addObject` / `updateObject` でキーフレーム整合を取るようにし、`startTime` / `duration` / `x` / `y` 更新時のキーフレーム追従を追加した。
- 複製/貼り付け/分割時にキーフレームを再計算・再ID化するよう変更した。
- `src/components/Viewport.tsx`
- 位置計算でキーフレーム補間を優先し、既存 `enableAnimation` はフォールバックとして扱うようにした。
- `src/utils/pixiRenderHelper.ts`
- `group_control` の位置補間にもキーフレーム評価を適用した。
- `src/components/PropertyPanel.tsx`
- `Keyframes` セクションを追加し、現在時刻への中間点追加、始点/終点生成、時刻/座標/easing 編集、削除を実装した。
- `src/components/TimelineItem.tsx`
- キーフレーム保持オブジェクトに `◆` マーカーを表示し、識別しやすくした。

## 27. P0-3 追加: 切り取り（Cut）操作の実装
- `src/store/useStore.ts`
- `cutSelectedObjects` を追加し、選択オブジェクトを `clipboard` へ保存してからタイムラインから削除する処理を実装。
- ロックレイヤー上のオブジェクトは切り取り対象から除外し、編集制約を維持した。
- 既存 `copySelectedObjects` とアンカー計算を共有する `buildClipboardState` を追加し、貼り付け位置の一貫性を確保した。
- `src/hooks/useAppLogic.ts`
- `Ctrl/Cmd + X` ショートカットを追加し、キーボードから切り取りできるようにした。
- `src/components/TimelineControlBar.tsx`
- `切り取り` ボタンを追加し、コピー/貼り付けと同列の操作導線を追加した。
- `src/components/TimelineContextMenu.tsx`
- オブジェクト右クリックメニューに `切り取り` を追加し、対象未選択時は自動選択して実行する既存挙動に統一した。

## 28. P0-3 追加: 範囲選択と選択一括変形の実装
- `src/components/Timeline.tsx`
- タイムライン空白領域のドラッグで選択矩形を表示し、矩形と交差したオブジェクトを複数選択する処理を追加した。
- `Shift/Ctrl/Cmd` 修飾時は既存選択への加算、非修飾時は選択置き換えになるよう制御した。
- ドラッグ量がほぼ 0 の場合は空白クリックとして扱い、非修飾時は選択解除できるようにした。
- `src/components/TimelineItem.tsx`
- 範囲選択開始判定のため、タイムラインアイテムに識別属性（`data-timeline-item`）を追加した。
- `src/components/PropertyPanel.tsx`
- 複数選択時に `一括変形` セクションを表示し、移動 X/Y、拡大率 X/Y %、回転 Δ、不透明度 Δ% を入力して同時適用できる UI を追加した。
- 適用時は `pushHistory` を 1 回だけ実行し、`updateObject` を各選択オブジェクトへ反映することで Undo/Redo の粒度を保った。

## 29. 利用ガイド文書の追加
- `markdown/User_Guide.md`
- 現行実装の操作方法を、画面構成・最短手順・主要操作・ショートカットに分けて整理した。
- 複数選択（矩形選択/一括変形/切り取り）と保存・書き出しの流れを初心者向けに追記した。

## 30. PSD レイヤー名文字化けの修正
- `src/utils/psdParser.ts`
- `restoreLayerNameEncoding` を追加し、制御文字を含む 1 バイト文字列レイヤー名のみ `utf-8` / `shift_jis` / `euc-jp` で再デコードして可読性を比較する処理を実装した。
- `layer.name` が Unicode（> `0xFF` を含む）として取得できている場合は再解釈せず、既存の正常ケースを破壊しないようにした。
- `buildNode` で補正済み名称を `name` と `isRadio` 判定の双方へ適用し、文字化け名でも PSD レイヤーツリー表示とラジオ判定が崩れないようにした。
- `package.json`
- バージョンを `0.1.1-Beta-2l` に更新した。
- `markdown/Task.md` / `markdown/Implementation_Plan.md`
- 本修正タスクと実装計画を追記し、`markdown/` を単一の正として同期した。

## 確認
- `npx tsc --noEmit` を実行し、型エラーなしを確認。

## 1. ストア更新最適化
- `src/store/useStore.ts`
- `setTime` / `setDuration` に同値更新ガードを追加。
- `updateObject` に差分判定を追加し、差分がない場合は状態更新をスキップ。
- `duration` 再計算を `startTime` / `duration` 更新時のみに限定。

## 2. ストア購読の細粒度化
- `src/App.tsx`
- `src/components/Timeline.tsx`
- `src/components/TimelineItem.tsx`
- `src/components/TimelineControlBar.tsx`
- `src/components/PropertyPanel.tsx`
- `src/components/Viewport.tsx`
- `src/components/PsdRenderer.tsx`
- `src/hooks/useAppLogic.ts`
- `src/hooks/useTimelineDrop.ts`
- `src/hooks/usePixiInteraction.ts`
- `selector + shallow` を導入し、全体購読を削減。

## 3. タイムライン再レンダリング削減
- `src/components/TimelineItem.tsx` を `React.memo` 化。
- `src/components/Timeline.tsx` のコンテキストメニューコールバックを `useCallback` 化し、`TimelineItem` 側メモ化が有効になるよう調整。

## 4. エクスポート処理最適化
- `src/hooks/useProjectExport.ts`
- `electron/main.ts`
- フレーム転送を `base64` から `ArrayBuffer` に変更。
- `ffmpeg` への `stdin.write` でバックプレッシャー待機を追加。
- エクスポート中の `setTime` 更新頻度を間引き。

## 5. PSD 同期負荷軽減
- `src/utils/psdToolBridge.ts`
- ポーリング間隔を 300ms に調整。
- レイヤーツリー同期を 1 秒間隔に間引き。

## 6. TypeScript エラー解消
- `src/types.ts`
- `PsdLayerNode` の定義追加、`PsdObject` の実態に合わせた型補完（`rootLayer`/`activeLayerIds` 等）を追加。
- `src/components/PropertyPanel.tsx`
- ユニオン型キー制約で発生していた更新ハンドラの型不整合を修正。
- `src/utils/psdParser.ts`
- `ag-psd` のレイヤ型差分を吸収する補助型を追加し、`ImageData` 生成の型不整合を修正。
- `src/utils/pixiRenderHelper.ts`
- `DiagonalClippingFilter` を Pixi v8 の初期化形式へ変更。
- `src/main.tsx`
- `.tsx` 拡張子付き import を拡張子なしへ修正。

## 7. Rust バックエンド基盤の追加
- `rust-backend/Cargo.toml`
- `rust-backend/src/main.rs`
- `stdio` ベースの JSON-RPC 風プロトコルを実装し、`health` / `echo` メソッドを追加。
- `electron/main.ts`
- Rust バイナリ探索、プロセス起動、リクエスト送信、レスポンス待機、タイムアウト処理を追加。
- IPC ハンドラ `rust-backend-health` / `rust-backend-echo` を追加。
- `electron/preload.ts`
- `window.rustBackend` を公開し、Renderer から直接 `health` / `echo` を呼べるようにした。
- `src/vite-env.d.ts`
- `window.rustBackend` の型定義を追加。
- `package.json`
- Rust のビルド/実行スクリプト (`rust:build:debug`, `rust:build:release`, `rust:run`) を追加。

## 8. 書き出しパイプライン制御の Rust 移管
- `rust-backend/src/main.rs`
- `export.start` / `export.write_frame` / `export.end` を追加し、Rust 側で FFmpeg プロセスを保持するセッション管理を実装。
- フレームは `base64` デコード後に FFmpeg stdin へ書き込み、`export.end` で待機して終了コードを判定する。
- `rust-backend/Cargo.toml`
- `base64` 依存を追加。
- `electron/main.ts`
- 既存 IPC (`start-export`, `write-frame`, `end-export`) を維持しつつ、内部実装を Rust バックエンド呼び出しへ切り替え。
- 出力先ファイル選択は従来どおり Electron ダイアログで行い、選択結果を Rust `export.start` に渡す。
- `FFmpeg` パスは `UXFD_FFMPEG_BIN` または既定候補 (`/opt/homebrew/bin/ffmpeg`, `/usr/local/bin/ffmpeg`, `ffmpeg`) を解決して渡す。
- `src/hooks/useProjectExport.ts`
- フレーム書き込み失敗時の例外処理と、キャンセル時の `end-export` 呼び出しを追加して Rust セッションが残らないように調整。

## 9. メディアメタデータ解析の Rust 移管
- `rust-backend/src/main.rs`
- `media.probe` を追加し、`ffprobe` から `duration` / `width` / `height` / `hasAudio` / `hasVideo` を抽出して返すようにした。
- `electron/main.ts`
- IPC `probe-media` を追加し、`filePath` バリデーション後に Rust `media.probe` を呼び出す経路を実装。
- `src/utils/mediaMetadata.ts`
- `probe-media` 優先 + `HTMLVideoElement` / `HTMLAudioElement` フォールバックの共通ロジックを追加。
- `src/components/Timeline.tsx`
- ファイル選択アップロード時（動画/音声）に共通メタデータ解決ロジックを適用。
- `src/hooks/useTimelineDrop.ts`
- ドラッグ&ドロップ時（動画/音声）にも同ロジックを適用し、入力経路差を解消。

## 確認
- `npx tsc --noEmit` を実行し、成功を確認。
- `cargo build --manifest-path rust-backend/Cargo.toml` を実行し、成功を確認。
- `printf '{"id":1,"method":"health"}' | rust-backend/target/debug/uxfd-rust-backend` を実行し、`status: ok` 応答を確認。
- Node から `export.start -> export.write_frame -> export.end` の順で呼び出し、MP4 ファイルが生成されることを確認。
- `probe-media` 経由で `ffprobe` が利用可能な場合、DOM メタデータ解析なしで動画/音声の長さ・解像度が取り込まれることを確認。

## 10. PSD 同期レスポンス改善
- `src/utils/psdToolBridge.ts`
- 同期間隔を 300ms から 800ms に緩和し、常時ポーリング負荷を削減。
- `requestImmediateSync(forceTree)` を追加し、レイヤートグル直後や PSD ロード直後に強制同期できるようにした。
- レイヤーツリー取得を「初回同期 / 明示的強制同期 / 画像変更時」に限定し、不要な DOM 走査を減らした。
- `src/components/PropertyPanel.tsx`
- PSD レイヤートグル後に `requestImmediateSync(true)` を実行し、表情変更を即時反映。
- `Reload Layers` でも同 API を優先利用し、遅延時に明示的再同期できるようにした。

## 11. 署名無効化
- `package.json`
- `build` スクリプトを `CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder` に変更し、macOS 証明書自動検出を無効化。

## 12. PSDToolKit 依存の撤廃
- `src/App.tsx`
- hidden webview (`PsdRenderer`) と bridge レジストリを削除し、PSD 表示パイプラインをストアデータ駆動へ一本化した。
- `src/utils/psdParser.ts`
- `buildPsdLayerTree` / `togglePsdLayer` を追加し、`parsePsdAsObject` で `layerTree` / `rootLayer` / `activeLayerIds` を初期生成するよう変更した。
- `src/components/Timeline.tsx`
- PSD ファイル追加時に `parsePsdAsObject` を実行し、解析済みオブジェクトを直接タイムラインへ追加するよう変更。
- `src/hooks/useTimelineDrop.ts`
- PSD ドロップ時も同様に `parsePsdAsObject` を実行し、追加経路の挙動差を解消。
- `src/components/PropertyPanel.tsx`
- `window.psdBridge` 依存を削除し、`togglePsdLayer` で `activeLayerIds` を直接更新して表情切り替えを反映する方式へ置換。
- `src/utils/pixiRenderHelper.ts`
- PSD を `Sprite` 1枚で扱う方式から、`renderPsdTree` によるレイヤー合成レンダリング方式へ切り替え。
- `src/components/PsdRenderer.tsx`
- `src/utils/psdToolBridge.ts`
- 役割を失ったため削除。

## 13. PSD 画像変換不具合の修正
- `src/utils/psdParser.ts`
- `layer.imageData` を `ImageData` / `Uint8Array` / `Uint8ClampedArray` から正規化する処理を追加。
- `ImageData` を直接 `Array.from` して 0 要素になる不具合を解消し、`Failed to construct 'ImageData': The input data has zero elements.` を回避。
- ピクセル配列長と `width * height * 4` を検証し、過不足がある場合は安全にスキップまたはトリムするよう変更。

## 14. PSD レイヤー表示互換性の追加修正
- `src/utils/psdParser.ts`
- `Uint16Array` / `Float32Array` / `Int16Array` / `Int32Array` / `Uint32Array` の `PixelArray` を 8bit RGBA へ正規化する処理を追加。
- 一部レイヤー（顔パーツなど）が `imageData` 形式差異で欠落する問題を解消。
- `src/utils/pixiUtils.ts`
- `cacheTextureFromUrl` を追加し、`Texture.from(img)` ではなく canvas 経由でテクスチャ化する方式へ変更。
- `src/utils/pixiRenderHelper.ts`
- 画像/PSD フォールバック読込時のテクスチャ生成を `cacheTextureFromUrl` に統一し、`Image element passed` 警告を抑制。

## 15. PSD レイヤー順序逆転の修正
- `src/utils/psdParser.ts`
- `layer.children` / `psd.children` の取り込み時に使っていた `reverse()` を除去。
- `ag-psd` の順序をそのまま保持することで、髪・顔などの前後関係が PSD 上の見え方と一致するように修正。

## 16. 動画/音声の音量調整と PSD スケーリング追加
- `src/components/PropertyPanel.tsx`
- `video` / `audio` 選択時に `Audio` セクションを追加し、`Mute` と `Volume`（スライダー 0〜1 + 数値 0〜100%）を編集可能にした。
- 音量入力は 0〜1 にクランプし、ミュート切り替えは `updateObject` へ即時反映するよう実装。
- `psd` 選択時に `PSD Transform` セクションを追加し、`scale`（0.1〜10）をスライダーと数値入力の両方で編集可能にした。
- 既存の `pixiRenderHelper` 側 `psdContent.scale.set(obj.scale || 1.0)` へそのまま反映されるため、追加の描画側改修なしで即時プレビューされる構成にした。

## 17. 立ち絵選択枠の位置ずれ修正
- `src/components/Viewport.tsx`
- 選択時の黄色枠を `content.width/height` 固定値で描く方式から、`content.getBounds()` を `container.toLocal()` へ変換した実境界ベースへ変更した。
- PSD レイヤーの `left/top` オフセットや内部スケールを含めて枠を計算することで、立ち絵左端が枠中央に来るズレを解消した。

## 18. ffmpeg stderr 詰まりによる書き出し停止の防止
- `rust-backend/src/main.rs`
- `export.start` の `ffmpeg` 起動時に `stderr(Stdio::piped())` を `stderr(Stdio::null())` へ変更した。
- 未読 `stderr` パイプが長尺エクスポート中に埋まって `ffmpeg` 側が停止する経路を除去し、`export.write_frame` タイムアウトの再発を防止した。

## 19. ラジオグループ排他制御の祖先適用
- `src/utils/psdParser.ts`
- `togglePsdLayer` の排他判定を「直近の親がラジオか」から「ターゲットへ至る経路上の全ラジオ祖先」へ拡張した。
- ラジオ祖先の非選択枝は `setSubtreeActiveState` でサブグループ配下まで再帰的に無効化し、ネスト構造でも同時有効が残らないように修正した。
- これにより、ラジオグループ配下の孫以深レイヤーを選択した場合でも PSDTool 互換の「1つだけ有効」挙動を維持できるようにした。

## 30. PR レビュー指摘のバグ修正
- `src/store/useStore.ts`
- `splitObject` で分割時刻の座標を補間計算し、前半終端と後半始端の位置を同値に揃える処理を追加した。
- 分割時刻にキーフレームがない場合は境界キーフレームを前後オブジェクトへ挿入し、分割後のジャンプを防止した。
- `src/hooks/useProjectExport.ts`
- エクスポート時に `layers[layer].visible !== false` の条件で可視オブジェクトのみ抽出し、音声ミックスへ渡す対象を制限した。
- 非表示レイヤー上の `audio` / `video` が書き出し音声へ混入しないようにした。
- `src/utils/projectFile.ts`
- プロジェクト読込時に `objects` を要素単位で検証し、必須の基本フィールド・キーフレーム配列形式が不正な場合は明示的エラーを返すようにした。
- 破損した JSON の混入時に、復元処理中の実行時クラッシュを起こさず読込段階で停止できるようにした。

## 31. グラデーションフィルタの実装
- `src/types.ts`
- `FilterType` / `ObjectFilter` に `gradient` を追加し、フィルタスタック上で型安全に扱えるようにした。
- `src/utils/filterStack.ts`
- `gradient` のデフォルト値・正規化処理を追加し、`shape.gradient`（既存プロパティ）との双方向同期を実装した。
- `filters` 側で追加/削除/有効無効を操作すると `shape.gradient` が追従し、逆にレガシー値からの復元時も `gradient` フィルタが生成されるようにした。
- `src/store/useStore.ts`
- `updateObject` のレガシー効果更新判定に `gradient` を追加し、直接更新時も同期経路を通るようにした。
- `src/components/PropertyPanel.tsx`
- `shape` 選択時のみ `+ グラデーション` を追加し、`Type`（Linear/Radial）・`Colour A/B`・`Stop A/B`・`Direction` の編集 UI を実装した。
- `markdown/Task.md` / `markdown/Implementation_Plan.md` / `markdown/User_Guide.md`
- フィルタスタックの対象一覧に `グラデーション` を追記し、仕様ドキュメントと実装の整合を取った。

## 32. グループ単位グラデーションの実装
- `src/types.ts`
- オブジェクトへ `groupGradient` を追加し、グループ単位のグラデーション設定を保持できるようにした。
- `src/store/useStore.ts`
- `setGroupGradient` を追加し、同一 `groupId` のオブジェクトへ設定を同期反映できるようにした。
- `groupSelectedObjects` / `ungroupSelectedObjects` 時に `groupGradient` を初期化し、古い設定の持ち越しを防止した。
- `src/components/PropertyPanel.tsx`
- グループ化済みオブジェクト選択時に `Group Gradient` セクションを表示し、`Enable` / `Type` / `Colour A/B` / `Stop A/B` / `Direction` を編集可能にした。
- `src/utils/pixiRenderHelper.ts`
- `GroupGradientFilter`（シェーダーフィルタ）を追加し、入力アルファ形状を維持したままグラデーション色を適用できるようにした。
- `src/components/Viewport.tsx`
- `groupId` ごとに Pixi コンテナを生成し、グループ内オブジェクトを再配置した。
- グループコンテナへ `applyGroupGradientEffect` を適用し、複数図形を1つの形状として勾配処理できるようにした。

## 33. グループグラデーションの分離図形補正
- `src/components/Viewport.tsx`
- グループ内図形の表示境界が接しているものを同一コンポーネントとして扱い、離れている図形はコンポーネントごとに自動分割してグラデーションを適用するようにした。
- これにより、離れた図形配置で外接矩形全体に引き伸ばされた見え方になる問題を抑えた。

## 34. Group Gradient の適用範囲モード追加
- `src/types.ts`
- `GradientFill` に `scope`（`group` / `connected`）を追加し、グループグラデーションの適用範囲を指定できるようにした。
- `src/components/PropertyPanel.tsx`
- `Group Gradient` に `Scope` UI を追加した（現在は一時的に非表示）。
- `src/components/Viewport.tsx`
- `Scope` が `group` の場合はグループ全体へ一本の勾配、`connected` の場合は連結コンポーネント単位の勾配を適用するよう分岐を追加した。

## 35. プロパティパネルのスライダー操作改善
- `src/components/PropertyPanel.tsx`
- `type="range"` の入力処理を `onInput` ベースへ変更し、ドラッグ中の値更新を安定化した。
- `src/index.css`
- `input[type="range"]` を `-webkit-app-region: no-drag` に固定し、Electron のウィンドウドラッグ領域と競合しないようにした。

## 36. スライダーのドラッグ継続性を改善
- `src/components/PropertyPanel.tsx`
- `Slider` コンポーネントを追加し、`pointerdown` で `setPointerCapture` を行うようにした。
- これにより、ドラッグ中にポインタがスライダー領域外へ出ても操作が中断しにくくなるようにした。

## 37. スライダー再マウントによるドラッグ中断の修正
- `src/components/PropertyPanel.tsx`
- `Slider` を `PropertyPanel` の関数内定義からモジュールスコープへ移動し、値更新ごとの再生成・再マウントを防止した。
- これにより、ドラッグ中の再レンダリングでスライダーが一瞬で外れる問題を解消した。

## 38. Row/SectionHeader再生成による入力中断の修正
- `src/components/PropertyPanel.tsx`
- `Row` と `SectionHeader` もモジュールスコープへ移動し、各入力行が更新ごとに再マウントされる問題を解消した。
- これにより、スライダーを含む入力コンポーネントのドラッグ/フォーカスが継続するようにした。

## 39. PR 指摘対応（フィルタスタック整合）
- `src/components/PropertyPanel.tsx`
- 複数選択の一括移動で `enableAnimation` オブジェクトの `endX/endY` も平行移動するように修正し、通常ドラッグとの挙動差を解消した。
- `src/utils/filterStack.ts`
- `filters` が配列として存在する場合は空配列でもそれを正とするよう変更し、legacy 逆流で順序・削除結果が崩れる経路を遮断した。
- `src/utils/pixiRenderHelper.ts`
- 描画時エフェクトを `filters` 配列順で適用する方式に切り替え、同種複数フィルタと順序入替を反映するようにした。
- `src/components/Viewport.tsx`
- 影エフェクトも `filters` から評価して描画し、フィルタスタック UI と実描画の不一致を解消した。

## 40. クリッピング・範囲選択移動・初期配置・MP3 書き出し
- `src/utils/pixiRenderHelper.ts`
- `DiagonalClippingFilter` へ WebGPU 用 `gpuProgram`（WGSL）を追加し、`webgpu` 優先環境で `clipping` フィルタが無効化される問題を修正した。
- クリッピングサイズを `obj.width/height` 固定から `container.getLocalBounds()` 優先に変更し、テキスト/PSD でも切り取り範囲が実表示と合うようにした。
- `src/components/Viewport.tsx`
- マスク式クリッピング（`obj.clipping`）で、対象レイヤーの「実際に描画中コンテナがあるオブジェクト」を優先して解決するように変更した。
- `src/components/TimelineItem.tsx`
- 範囲選択後に単一選択へ潰れないよう、複数選択を保持したままドラッグ移動できる処理を追加した。
- 複数移動時は `startTime` と `layer` を同時更新し、レイヤー範囲外やロックレイヤー遷移を抑止する制御を入れた。
- `src/components/Timeline.tsx` / `src/hooks/useTimelineDrop.ts` / `src/components/TimelineContextMenu.tsx`
- 追加・ドロップ・音声波形追加の初期座標を固定値（`640/360`, `400/300` など）から `projectSettings.width/height` 基準の中央配置へ変更した。
- `src/App.tsx` / `electron/main.ts`
- タイトルバーに `Export MP3` を追加し、タイムライン音声ミックス（WAV）を IPC `export-audio-mp3` で `ffmpeg` 変換して保存できるようにした。
- MP3 書き出し中は主要 UI ボタンを一時的に無効化し、動画書き出しと競合しないようにした。
- `package.json`
- バージョンを `0.1.1-Beta-2n` に更新した。

## 確認
- `npx tsc --noEmit` を実行し、型エラーなしを確認。
- `cargo build --manifest-path rust-backend/Cargo.toml` を実行し、成功を確認。

## 41. iPhone 画面収録動画の WebGPU 例外修正
- `src/utils/pixiRenderHelper.ts`
- `video` 描画経路を `PIXI.Texture.from(video)` から「`canvas` にフレーム描画してテクスチャ更新する方式」へ変更した。
- `video.videoWidth/video.videoHeight` が確定している場合のみフレームを描画し、解像度が変化した場合は canvas/texture を再生成する処理を追加した。
- これにより `GPUQueue.copyExternalImageToTexture: Copy rect is out of bounds of external image` が発生する経路を回避した。
- `src/components/Viewport.tsx`
- 動画フレームテクスチャキャッシュを `useRef` で保持し、動画オブジェクトの非表示化・削除・アンマウント時に `texture.destroy(true)` で明示解放するようにした。
- `package.json`
- バージョンを `0.1.1-Beta-2o` に更新した。

## 確認
- `npx tsc --noEmit` を実行し、型エラーなしを確認。

## 42. Phase5: Viewport export source診断へのnative render envelope接続
- `src/utils/viewportRustExportFrameSource.ts`
- `resolveViewportRustExportFrameSource` がexport session preflightで得た `nativeRenderEnvelope` をdecisionへ保持するようにした。
- envelopeがreadyの場合、`uxfdRustExportFrameSourceNativeRenderMediaCount` / `MediaKinds` / `SourceCount` / `SourceMediaIds` をdatasetへ記録するようにした。
- envelopeがblockedの場合、`uxfdRustExportFrameSourceNativeRenderEnvelopeReason` と `Detail` をdatasetへ記録し、source作成前に `exportSessionBlocked` として扱うようにした。
- `src/utils/viewportRustExportFrameSource.test.ts`
- video+PSD混在相当の `Video,Psd` envelopeがDOM datasetへ出る契約と、surface gate blocked時の envelope診断契約を追加した。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-123a` に更新した。

## 確認
- `npm test -- viewportRustExportFrameSource sharedRendererExportSession` を実行し、15件成功を確認。
- `npx tsc --noEmit 2>&1 | rg "(viewportRustExportFrameSource|sharedRendererExportSession)"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 43. Phase5: native renderer未接続時のexport経路保護
- `src/utils/sharedRendererExportFrameSource.ts`
- `renderNativeEncodeFrame` の入口で `render.nativeSharedFrame` bridge が未接続の場合に即 `null` を返し、native render source準備へ進まないようにした。
- これにより、native renderer未接続環境では動画decode source準備や未接続RPCを走らせず、既存のpresenter shared-frame / WebGPU readback経路へ安全に戻る。
- `src/utils/sharedRendererExportFrameSource.test.ts`
- native renderer bridge未接続時に `prepareNativeRenderSources` が呼ばれず、`webGpuReadbackSharedFrameWriter` でencode frameを生成する契約を追加した。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-124a` に更新した。

## 確認
- `npm test -- sharedRendererExportFrameSource` を実行し、19件成功を確認。
- `npx tsc --noEmit 2>&1 | rg "(sharedRendererExportFrameSource|rustBackendNativeRenderControl)"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 44. Phase5: Rust export blocked後の同一frame fallback修正
- `src/hooks/useProjectExport.ts`
- `renderFrames` 内の `frameRuntimePlan` を `let` に変更し、Rust/shared renderer frame sourceがblockedになった場合は `blockedRuntimePlan` に差し替えるようにした。
- これにより、blockedが起きた同じframeでも `requiresHtmlVideoElementSeekFallback` と `requiresRenderScene` がlegacy fallback用の値になり、古いcanvasをcaptureするリスクを避けられる。
- `src/utils/useProjectExportBoundary.test.ts`
- blocked後に同一frameでruntime planを差し替える境界契約を追加した。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-124b` に更新した。

## 確認
- `npm test -- useProjectExportBoundary projectExportFrameCanvas` を実行し、22件成功を確認。
- `npx tsc --noEmit 2>&1 | rg "(useProjectExport|projectExportFrameCanvas)"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 45. Phase5: native render output shared frameのrelease所有権明示
- `src/utils/rustBackendVideoEncodeExport.ts`
- `RustBackendVideoEncodeSharedFramePayloadFrame` に `releaseAfterEncodeFailure` metadataを追加し、`kind: nativeRenderOutput` の場合だけ `render.releaseNativeSharedFrame` を呼ぶようにした。
- これによりpresenter handoff / WebGPU readback writer由来のshared frameをnative render outputとして誤releaseしない。
- `src/utils/sharedRendererExportFrameSource.ts`
- Rust native render直通で生成したencode frameへ `releaseAfterEncodeFailure: { kind: 'nativeRenderOutput', memoryId }` を付与した。
- `src/utils/rustBackendVideoEncodeExport.test.ts`
- 非native shared frameのencode write失敗時にnative render release bridgeを呼ばない契約を追加した。
- `src/utils/sharedRendererExportFrameSource.test.ts`
- native render直通frameがrelease ownership metadataを返す契約を追加した。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-125a` に更新した。

## 確認
- `npm test -- rustBackendVideoEncodeExport sharedRendererExportFrameSource projectExportRustEncodeFrame` を実行し、27件成功を確認。
- `npx tsc --noEmit 2>&1 | rg "(rustBackendVideoEncodeExport|sharedRendererExportFrameSource|projectExportRustEncodeFrame)"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 46. Phase5: encode.writeFrame reject時のnative render output解放
- `src/utils/rustBackendVideoEncodeExport.ts`
- `writeRustBackendVideoEncodeFrame` を `try/catch` で囲み、Promise reject / throw 時にも `releaseAfterEncodeFailure.kind === 'nativeRenderOutput'` の場合は `render.releaseNativeSharedFrame` を呼んでから元エラーを再throwするようにした。
- `{ success: false }` と reject の両方でnative render output ringの後始末が同じになる。
- `src/utils/rustBackendVideoEncodeExport.test.ts`
- `writeVideoEncodeFrame` がthrowした場合もnative render outputの `memoryId` でrelease bridgeを呼ぶ契約を追加した。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-125b` に更新した。

## 確認
- `npm test -- rustBackendVideoEncodeExport` を実行し、6件成功を確認。
- `npx tsc --noEmit 2>&1 | rg "rustBackendVideoEncodeExport"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 47. Phase5: preview native render output release callback単回化
- `src/utils/sharedRendererViewportNativeRenderUpload.ts`
- preview native render outputのrelease callbackを `createSingleUseNativeOutputReleaser` で包み、`releaseAfterGpuUpload` / `releaseAfterUploadAbort` のどちらから呼ばれても同じ `memoryId` は一度だけreleaseするようにした。
- `src/utils/sharedRendererViewportNativeRenderUpload.test.ts`
- GPU upload完了callbackとabort callbackが複数回呼ばれても `releaseNativeSharedFrame` が1回だけ呼ばれる契約を追加した。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-125c` に更新した。

## 確認
- `npm test -- sharedRendererViewportNativeRenderUpload sharedRendererPreviewPresenterController` を実行し、28件成功を確認。
- `npx tsc --noEmit 2>&1 | rg "(sharedRendererViewportNativeRenderUpload|sharedRendererPreviewPresenterController)"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 48. Phase5: encode-only exportのnative render必須化
- `src/utils/sharedRendererExportFrameSource.ts`
- `CreateSharedRendererExportFrameSourceInput` に `nativeRenderRequired` を追加し、必須時に `render.nativeSharedFrame` bridge が無ければ `nativeRenderUnavailable` でblocked errorを投げるようにした。
- `src/utils/viewportRustExportFrameSource.ts`
- `preferEncodeOnly` の場合は `bitmapCaptureEnabled: false` に加えて `nativeRenderRequired: true` を `createSharedRendererExportFrameSource` へ渡すようにした。
- `src/utils/sharedRendererExportFrameSource.test.ts`
- native render必須時に bridge未接続なら presenter readback / JS writerへ戻らず blocked になる契約を追加した。
- `src/utils/viewportRustExportFrameSource.test.ts`
- Rust backend encoder所有のencode-only source requestで `nativeRenderRequired: true` が渡る契約を追加した。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-126a` に更新した。

## 確認
- `npm test -- sharedRendererExportFrameSource viewportRustExportFrameSource projectExportFrameCanvas useProjectExportBoundary` を実行し、54件成功を確認。
- `npx tsc --noEmit 2>&1 | rg "(sharedRendererExportFrameSource|viewportRustExportFrameSource|projectExportFrameCanvas|useProjectExport)"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 49. Phase5: encode-only media-only unsupported native renderのblock
- `src/utils/sharedRendererExportFrameSource.ts`
- `nativeRenderRequired` が有効なencode-only exportで、`noVideoDecodeRequest` かつmedia-only sceneがRust native-renderableでない場合、`nativeRenderUnsupportedMedia` でblocked errorを投げるようにした。
- 通常互換モードでは従来どおり `null` を返し、presenter/readback fallbackを維持する。
- `src/utils/sharedRendererExportFrameSource.test.ts`
- remote画像のmedia-only frameで、native render必須時に presenter readback / JS writerへ戻らず blocked になる契約を追加した。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-127a` に更新した。

## 確認
- `npm test -- sharedRendererExportFrameSource sharedRendererNativeMediaSupport` を実行し、25件成功を確認。
- `npx tsc --noEmit 2>&1 | rg "(sharedRendererExportFrameSource|sharedRendererNativeMediaSupport)"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 50. Phase5: decoded video slot release callback単回化
- `src/utils/sharedRendererRustVideoUploadPipeline.ts`
- Rust backend decoded video frameのrelease callbackを `createSingleUseDecodedFrameReleaser` で包み、GPU upload成功後にabort callbackや再度GPU callbackが来ても同じslot leaseを一度だけreleaseするようにした。
- `src/utils/sharedRendererRustVideoUploadPipeline.test.ts`
- `releaseAfterGpuUpload` / `releaseAfterUploadAbort` / 再度GPU releaseが続いても `releaseVideoDecodeFrame` が1回だけ呼ばれる契約を追加した。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-197a` に更新した。

## 確認
- `npm test -- sharedRendererRustVideoUploadPipeline` を実行し、4件成功を確認。
- `npx tsc --noEmit 2>&1 | rg "sharedRendererRustVideoUploadPipeline|sharedVideoFrameUploadBridge|sharedRendererViewportVideoUpload"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 51. Phase5: decoded video copy例外時のslot解放
- `src/utils/sharedRendererRustVideoUploadPipeline.ts`
- `prepareSharedRendererDecodedVideoFrameUpload` がcopy bridge例外でrejectした場合も、decoded slotを `rendererUploadAborted` としてreleaseしてから元の例外を再throwするようにした。
- decoded slotのsingle-use releaserをPromise共有型にし、release失敗時のPromise伝播をnative render output側と揃えた。
- `src/utils/sharedRendererRustVideoUploadPipeline.test.ts`
- `copyIntoUploadBuffer` がthrowしても `releaseVideoDecodeFrame` がslot/generation指定で1回呼ばれる契約を追加した。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-197b` に更新した。

## 確認
- `npm test -- sharedRendererRustVideoUploadPipeline sharedVideoFrameUploadBridge sharedRendererViewportVideoUpload` を実行し、18件成功を確認。
- `npx tsc --noEmit 2>&1 | rg "sharedRendererRustVideoUploadPipeline|sharedVideoFrameUploadBridge|sharedRendererViewportVideoUpload"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 52. Phase5: export canvas providerのPixi命名一般化
- `src/components/Viewport.tsx`
- `getExportCanvas` 内のlegacy canvas fallbackを `legacyExportCanvas` として扱い、export境界へ渡るcanvas取得処理から `pixiCanvas` という局所名を外した。
- `src/utils/viewportRustVideoOnlyBoundary.test.ts`
- `getExportCanvas` ブロックが `pixiCanvas` を含まない契約を追加した。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-197c` に更新した。

## 確認
- `npm test -- viewportRustVideoOnlyBoundary` を実行し、13件成功を確認。
- `npx tsc --noEmit 2>&1 | rg "src/components/Viewport\\.tsx|viewportRustVideoOnlyBoundary|useProjectExport"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 53. Phase5: Electron mainのVideoDecoder proxy IPC削除
- `electron/main.ts`
- WebCodecs / VideoDecoder診断用の `resolve-4k-proxy-video` IPC handlerを削除した。
- `src/utils/productionVideoDependencyBoundary.test.ts`
- production Electron mainに `resolve-4k-proxy-video` / `VideoDecoder テスト用` / `GX010052.proxy.mp4` が戻らない契約を追加した。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-198a` に更新した。

## 確認
- `npm test -- productionVideoDependencyBoundary legacyBase64ExportBoundary` を実行し、3件成功を確認。
- `npx tsc --noEmit 2>&1 | rg "electron/main|productionVideoDependencyBoundary|legacyBase64ExportBoundary"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 54. Phase5: Electron mainのbrowser動画codec flag削除
- `electron/main.ts`
- `UseChromeOSDirectVideoDecoder` のdisable指定と、`VideoToolboxVideoCodecFactory` / `VaapiVideoDecoder` / `VaapiVideoEncoder` のenable指定を削除した。
- WebGPU / Canvas GPU rasterの起動flagは残し、動画decode/encodeの正本をRust backend側へ寄せる境界にした。
- `src/utils/productionVideoDependencyBoundary.test.ts`
- production Electron mainへbrowser動画codec強制flagが戻らない契約を追加した。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-199a` に更新した。

## 確認
- `npm test -- productionVideoDependencyBoundary legacyBase64ExportBoundary` を実行し、4件成功を確認。
- `npx tsc --noEmit 2>&1 | rg "electron/main|productionVideoDependencyBoundary|legacyBase64ExportBoundary"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 55. Phase5: Rust export frame source close単回化
- `src/utils/projectExportFrameCanvas.ts`
- `createSingleUseProjectExportFrameSourceCloser` を追加し、Rust/shared renderer frame sourceの `close` をPromise共有で一度だけ実行するようにした。
- `src/hooks/useProjectExport.ts`
- Rust frame sourceがblockedした時のcloseと、export終了時のfinally closeを同じsingle-use closer経由にした。
- `src/utils/projectExportFrameCanvas.test.ts`
- blocked cleanupとfinal cleanupが連続してもframe source closeが1回だけになる契約を追加した。
- `src/utils/useProjectExportBoundary.test.ts`
- hookが `exportFrameSourcePlan.frameSource.close?.()` を直接呼ばずsingle-use closerを使う契約を追加した。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-199b` に更新した。

## 確認
- `npm test -- projectExportFrameCanvas useProjectExportBoundary` を実行し、39件成功を確認。
- `npx tsc --noEmit 2>&1 | rg "projectExportFrameCanvas|useProjectExport"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 56. Phase5: checksum不一致時のshared frame slot解放
- `shared-video-frame-bridge/tests/copy_into_upload_buffer.rs`
- POSIX shared memory上のframe bytesを意図的に破損させ、checksum mismatchでcopyを拒否した後もproducerが次frameを書ける契約を追加した。
- `shared-memory-spike/src/lib.rs`
- `PosixSharedRing::read_frame` がchecksum mismatchを検出した場合、`READING` に遷移したslotを `FREE` へ戻してから `ChecksumMismatch` を返すようにした。
- `shared-video-frame-bridge/Cargo.toml` / `Cargo.lock`
- integration test用に `libc` をdev dependencyへ追加した。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-210a` に更新した。

## 確認
- `cargo test --manifest-path shared-video-frame-bridge/Cargo.toml --test copy_into_upload_buffer` を実行し、3件成功を確認。
- `cargo test --manifest-path shared-memory-spike/Cargo.toml --test atomic_ring_stress` を実行し、1件成功を確認。
- `cargo test --manifest-path shared-memory-spike/Cargo.toml --test sidecar_decode_checksum` を実行し、2件成功を確認。
- `cargo test --manifest-path shared-memory-spike/Cargo.toml posix_shm_multi_slot_allows_next_frame_while_previous_frame_is_reading` を実行し、1件成功を確認。

## 57. Phase5: Node addon checksum report algorithmを明示
- `scripts/test-shared-video-frame-node-addon.mjs`
- `writeIntoSharedFrameRing` の `checksum` と `copyIntoUploadBuffer` の `expectedChecksum` / `actualChecksum` が一致し、双方の `checksumAlgorithm` が `crc32` である契約を追加した。
- `shared-video-frame-bridge-node/src/lib.rs`
- writable write report と copy report に `checksumAlgorithm: 'crc32'` を追加した。
- `electron/preload.ts` / `src/vite-env.d.ts` / `src/utils/sharedVideoFrameUploadBridge.ts`
- Electron preload とrenderer型境界でもcopy reportのchecksum algorithmを受け取れるようにした。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-210b` に更新した。

## 確認
- `npm run test:bridge-node` を実行し、Node addon契約成功を確認。
- `npm test -- sharedVideoFrameUploadBridge sharedVideoFrameUploadBridgeBoundary` を実行し、8件成功を確認。
- `cargo test --manifest-path shared-video-frame-bridge-node/Cargo.toml` を実行し、crate test成功を確認。
- `npx tsc --noEmit 2>&1 | rg "(electron/preload\\.ts|src/vite-env\\.d\\.ts|src/utils/sharedVideoFrameUploadBridge\\.ts|src/utils/sharedVideoFrameUploadBridge\\.test\\.ts|src/utils/sharedVideoFrameUploadBridgeBoundary\\.test\\.ts)"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 58. Phase5: renderer側でcopy report checksum algorithmを検証
- `src/utils/sharedVideoFrameUploadBridge.test.ts`
- copy reportが `crc32` 以外の `checksumAlgorithm` を返した場合、renderer upload準備を拒否する契約を追加した。
- `src/utils/sharedVideoFrameUploadBridge.ts`
- `prepareSharedRendererDecodedVideoFrameUpload` が未知のchecksum algorithmを `copyReportChecksumAlgorithmUnsupported` としてfail-loudにするようにした。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-210c` に更新した。

## 確認
- `npm test -- sharedVideoFrameUploadBridge` を実行し、Redで `adler32` reportが成功扱いになる失敗を確認した。
- `npm test -- sharedVideoFrameUploadBridge sharedRendererRustVideoUploadPipeline sharedRendererViewportVideoUpload` を実行し、26件成功を確認。
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedVideoFrameUploadBridge\\.ts|src/utils/sharedVideoFrameUploadBridge\\.test\\.ts|src/utils/sharedRendererRustVideoUploadPipeline\\.ts|src/utils/sharedRendererViewportVideoUpload\\.ts)"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 59. Phase5: Rust動画dev起動前にbridge buildを実行
- `src/utils/packageScripts.test.ts`
- `dev:rust-video` がVite起動前に `scripts/build-shared-video-frame-node-addon.mjs` を実行する契約を追加した。
- `scripts/dev-rust-video.mjs`
- shared-video-frame Node addonを先にbuildし、成功時だけRust video-only環境でViteを起動するようにした。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-210d` に更新した。

## 確認
- `npm test -- packageScripts` を実行し、Redでbridge build手順が無い失敗を確認した。
- `npm test -- packageScripts` を再実行し、1件成功を確認。
- `npm run bridge:node:build` を実行し、Node addon build成功を確認。
- `npx tsc --noEmit 2>&1 | rg "(src/utils/packageScripts\\.test\\.ts|scripts/dev-rust-video\\.mjs|package\\.json)"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 60. Phase5: 動画upload失敗clipをpresenter診断へ追加
- `src/utils/sharedRendererViewportVideoUpload.test.ts` / `src/utils/sharedRendererViewportVideoUpload.ts`
- Rust shared memory copy / WebGPU upload準備が失敗したrequestの `clipId` / `mediaId` をupload失敗結果へ保持する契約と実装を追加した。
- `src/utils/sharedRendererPresenterDiagnostics.test.ts` / `src/utils/sharedRendererViewportPresenterOrchestration.test.ts`
- presenter診断入力とdatasetに失敗clip/media idが届く契約を追加した。
- `src/utils/sharedRendererPresenterDiagnostics.ts` / `src/utils/sharedRendererPreviewPresenterController.ts` / `src/utils/sharedRendererViewportPresenterOrchestration.ts`
- `uxfdSharedRendererPresenterVideoUploadFailureClipId` / `uxfdSharedRendererPresenterVideoUploadFailureMediaId` をdatasetへ出すようにした。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-210e` に更新した。

## 確認
- `npm test -- sharedRendererViewportVideoUpload` を実行し、Redでupload失敗clip/media idが欠ける失敗を確認した。
- `npm test -- sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration` を実行し、Redでpresenter診断へclip/media idが届かない失敗を確認した。
- `npm test -- sharedRendererViewportVideoUpload sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController` を実行し、57件成功を確認した。
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportVideoUpload\\.ts|src/utils/sharedRendererViewportVideoUpload\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.test\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.test\\.ts)"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 61. Phase5: export動画upload失敗detailへclip/media idを追加
- `src/utils/sharedRendererExportFrameSource.test.ts`
- Rust video upload失敗でexportがblockedになる場合、messageに `copyReportChecksumMismatch clip=... media=...` を含める契約を追加した。
- `src/utils/sharedRendererExportFrameSource.ts`
- `resolveExportVideoUploadBlock` がviewport upload結果の `uploadFailureClipId` / `uploadFailureMediaId` をblocked detailへ含めるようにした。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-210f` に更新した。

## 確認
- `npm test -- sharedRendererExportFrameSource` を実行し、Redでclip/media idがmessageに含まれない失敗を確認した。
- `npm test -- sharedRendererExportFrameSource sharedRendererViewportVideoUpload` を実行し、45件成功を確認した。
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/sharedRendererViewportVideoUpload\\.ts)"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 62. Phase5: WebGPU動画upload失敗をpresenter診断へ追加
- `src/utils/sharedRendererPreviewPresenterController.test.ts`
- decoded Rust video frameのWebGPU texture uploadが失敗した場合、presenter datasetへ `webGpuUploadUnavailable` とdetailを出す契約を追加した。
- `src/utils/sharedRendererPreviewPresenterController.ts`
- decoded video uploadの `uploadVideoFrameTexture` 失敗を `resolvedVideoUploadFailure` に保持し、既存のvideo upload failure診断へ合流させた。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-210g` に更新した。

## 確認
- `npm test -- sharedRendererPreviewPresenterController` を実行し、RedでWebGPU upload失敗理由がdatasetに出ない失敗を確認した。
- `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration` を実行し、46件成功を確認した。
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts)"` を実行し、対象ファイルに型エラーが出ないことを確認。

## 63. Phase5: WebGPU動画upload失敗clip/media idを補完
- `src/utils/sharedRendererPreviewPresenterController.test.ts`
- 単一decoded Rust video uploadのWebGPU texture uploadが失敗した場合も、presenter datasetへclip/media idを出す契約を追加した。
- `src/utils/sharedRendererPreviewPresenterController.ts`
- `sharedRendererDecodedVideoFrameUpload` 単体入力ではsession上の単一Video clipからclip/media idを補完するようにした。
- `src/utils/sharedRendererViewportPresenterOrchestration.ts`
- 複数decoded upload入力でもrequest由来の `mediaId` をpresenterへ渡すようにした。
- `package.json` / `package-lock.json`
- バージョンを `0.1.1-Beta-210h` に更新した。

## 確認
- `npm test -- sharedRendererPreviewPresenterController` を実行し、Redでclip/media idがdatasetに出ない失敗を確認した。
- `npm test -- sharedRendererPreviewPresenterController sharedRendererViewportPresenterOrchestration sharedRendererPresenterDiagnostics` を実行し、46件成功を確認した。
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts)"` を実行し、対象ファイルに型エラーが出ないことを確認。
