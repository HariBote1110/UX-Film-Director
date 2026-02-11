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
