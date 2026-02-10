# 実施内容

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
