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

37. Phase5: Rust backend 実動画フレーム decode gate を追加する  
`decode.requestFrame` は指定 `frameIndex` を Rust backend 側で `ffmpeg` decode し、GPU row pitch に合わせた descriptor と CRC32 verification を返す。  
frame bytes / pixel array / base64 は control plane に載せず、WebGPU upload 未完了の間は `videoFrameUploadReady=false` により Pixi preview を維持する。  
`ffprobe` で source `color_range` を読み、`pc` / `tv` を明示して full-range RGBA へ正規化する。  
次段では transfer / matrix の strict metadata gate と、POSIX shm / mmap への decoded RGBA 書き込み、WebGPU texture upload を接続する。

38. Phase5: Rust backend decoded RGBA を POSIX shared memory へ書き込む  
`decode.start` は attach 可能な `/uxfd-...` memory id を返し、Rust backend は decoded RGBA を POSIX shared memory ring へ書く。  
consumer は `memoryId` / `slotByteLen` / `strideBytes` を使って frame を読み、WebGPU upload fence 完了後に `decode.releaseFrame` で slot を解放する。  
初期実装では control plane に frame bytes を載せず、Rust backend が POSIX shm data-plane へ padded RGBA を書く。

39. Phase5: Rust backend decode data-plane を multi-slot shared memory 化する
POSIX shared memory ring は `slotCount` に合わせて複数 slot を確保し、1枚目の frame が consumer 側で読み取り中でも
Rust backend が2枚目を別 slot へ decode / write できるようにする。
次段では preload/native bridge で shm から WebGPU upload 用 buffer へ copy し、renderer 側で `queue.writeTexture` する。

40. Phase5: Rust decoded video frame の WebGPU upload / draw gate を追加する
renderer presenter は `rgba8Srgb` decoded frame descriptor と bridge 由来の `Uint8Array` を受け取り、
WebGPU `rgba8unorm-srgb` texture へ `queue.writeTexture` する。`bytesPerRow` は必ず `descriptor.strideBytes` を使う。
upload 成功後だけ `videoFrameUploadReady=true` とし、GPU queue 完了後に release callback を呼ぶ。
uploaded texture は video plane vertex scene と sampler で描画する。次段では POSIX shm から upload buffer へ copy する
preload/native bridge を実装する。

41. Phase5: shared video frame bridge core をRustで追加する
POSIX shared memory ring から renderer upload buffer 相当の mutable byte slice へ decoded frame を copy する
Rust core crate を追加する。copy 後も slot は `READING` のまま保持し、WebGPU upload fence 後の
`decode.releaseFrame` で解放する。次段ではこの core を N-API / Electron preload へ接続する。

42. Phase5: shared video frame preload bridge API を追加する
renderer は `SharedFrame` descriptor から `Uint8Array` upload buffer を確保し、preload の
`window.sharedVideoFrame.copyIntoUploadBuffer` へ control payload と target buffer を渡す。
control payload に frame bytes は載せず、native bridge 未接続時は fail-loud で Pixi fallback を維持する。
次段では `shared-video-frame-bridge` core を N-API module として接続し、Viewport の decode orchestration へ組み込む。

43. Phase5: Rust decoded video upload pipeline helper を追加する
Rust backend の verified decoded frame response を受け取り、shared memory copy bridge で renderer upload buffer を満たし、
WebGPU upload 後に `decode.releaseFrame(copyOutState=gpuUploadFenceSignalled)` を呼ぶ release callback 付きの
upload object へ変換する。次段ではこの pipeline を Viewport の preview presenter 起動前に呼ぶ。

44. Phase5: shared video frame N-API addon を追加する
`shared-video-frame-bridge-node` を追加し、既存 Rust core を N-API 経由で
`copyIntoUploadBuffer(payload, target)` として Node / preload から呼べるようにする。
`npm run test:bridge-node` は addon を build し、Node 直 require で `Uint8Array` in-place mutation と
fail-loud error mapping を確認する。次段では Electron `contextBridge` 越しに target buffer が更新されるかを
実機テストで確認し、失敗時は return-buffer / transferable 形式へ契約を切り替える。

45. Phase5: Electron contextBridge 返却bytes契約へ切り替える
Electron `contextBridge` 越しでは renderer の元 `Uint8Array` target は preload/native 側の mutation を反映しない。
preload は clone された target へ native addon で copy した後、その `Uint8Array` を `result.rgbaBytes` として返す。
renderer helper は `result.rgbaBytes` が存在する場合にそれを upload buffer へ採用し、Node 直 require と
Electron isolated world の両方を扱えるようにする。

46. Phase5: Viewport orchestration から Rust video upload を起動する
Viewport presenter 起動前に `prepareSharedRendererViewportVideoUpload` を呼び、最初の visible video request について
Rust backend `decode.start` / `decode.requestFrame` / shared memory copy を行って WebGPU upload object を presenter に渡す。
同じ source/layout の active decode job は再利用する。現段階では Rust backend が単一 decode session 前提のため、
複数動画や source 切替は stop / replace / multi-session API を追加するまで Pixi fallback を維持する。

47. Phase5: shared video frame native addon の自動解決を追加する
preload は `UXFD_SHARED_VIDEO_FRAME_BRIDGE_MODULE` を最優先し、未指定時は dev build output
`shared-video-frame-bridge-node/shared-video-frame-bridge.node`、packaged resources
`shared-video-frame-bridge/shared-video-frame-bridge.node` の順で native addon を探す。
electron-builder `extraResources` に `.node` 配置先を追加し、dev / packaged の両方で同じ bridge API を使えるようにする。

48. Phase5: Rust decode session stop / source 切替を追加する
Rust backend に `decode.stop(jobId)` を追加し、active decode session を明示的に破棄してから別 source/layout の
`decode.start` を受けられるようにする。renderer bridge と Electron IPC も `stopVideoDecode` を公開し、
Viewport orchestration は stale active job を検出したら stop 後に新しい job を start する。

49. Phase5: Rust video upload cutover のレビュー指摘を修正する
uploaded texture を `presentVideoFrameScene` へ渡して実際に描画し、copy / upload / stale response 失敗時は
`rendererUploadAborted` で decoded slot を release する。Viewport orchestration は in-flight decode job を
presenter 完了前に記録し、cancelled effect 後の `decode.start` 連打を避ける。Electron `contextBridge` 返却bytesは
再コピーせず、そのまま WebGPU upload buffer として採用する。

50. Phase5: export frame canvas のPixi必須条件を解除する
export frame capture の canvas 選択を resolver に分離し、shared renderer export canvas が明示されている場合は
Pixi app / Pixi canvas がなくても export を開始できるようにする。移行中は Pixi canvas fallback を維持し、
canvas が一切ない場合は fail-loud にする。

51. Phase5: Rust export frame source plan を追加する
canvas capture ではなく Rust/shared renderer frame source を優先する source plan を追加し、
`VideoFrameProvider` / `PlaybackFrameProvider` / `HTMLVideoElement` seek fallback を Rust frame source ready 時に通らないようにする。
次段では `Viewport` / shared renderer 側から実際の export frame source を渡し、Rust/WASM/WebGPU render target 由来の
`ImageBitmap` を直接 `encodeVideoToMp4` へ流す。

52. Phase5: shared renderer export session を追加する
preview session は `isExporting` 中に surface gate を塞ぐため、export専用 session builder を別に用意する。
Rust boundary validation、WebGPU availability、fallback adapter拒否、unsupported scene gate は維持しつつ、
supported 2D scene は export中でも shared renderer frame source 準備へ進めるようにする。

53. Phase5: shared renderer export frame source を追加する
export frameごとに shared renderer export session を構築し、Viewport presenter orchestration で描画したcanvasを
`ImageBitmap` として返す `ProjectExportRustFrameSource` を追加する。active Rust decode jobs は source 内で保持し、
multi-session decodeをframe間で引き継ぐ。次段では `Viewport` から `useProjectExport` へこのsourceを渡す。

54. Phase5: Viewport から Rust export frame source を接続する
`VITE_UXFD_SHARED_RENDERER_EXPORT=1` の実験flag配下で、2D editor / WebGPU available / non-fallback adapter /
video cutover enabled / shared renderer canvas available の条件が揃った時だけ `ProjectExportRustFrameSource` を
`useProjectExport` へ渡す。条件が閉じている場合は `null` を返し、従来の Pixi / canvas export を維持する。

55. Phase5: Rust export source selection に preflight を追加する
`useProjectExport` は export 開始時に実際の可視オブジェクト集合を `getRustExportFrameSource` へ渡す。
`Viewport` 側は `buildSharedRendererExportSession` で代表時刻 `0` の surface gate を先に確認し、
Rust/shared renderer で描けないシーンでは `ProjectExportRustFrameSource` を生成せず legacy canvas export へ戻す。
これにより、保存先選択や音声mixdown後に最初のframeでようやくblockedになる無駄を減らす。
続いて、代表時刻だけでなく各可視オブジェクトの開始時刻もpreflight対象にし、後半で初めて現れるunsupported sceneも
export開始前に検出できるようにする。

56. Phase5: Rust export 動画upload失敗を blocked fallback にする
previewでは Rust video upload が失敗しても Pixi が動画所有を維持できるが、export frame sourceではPixiを通らない。
そのため、Rust/shared renderer export中に `videoUploadResult` / `videoUploadsResult` が失敗した場合は
`videoUploadFailed` の blocked error に変換し、bitmap captureへ進まずlegacy canvas exportへ退避する。

57. Phase5: Rust-only export source policy を追加する
`VITE_UXFD_RUST_EXPORT_ONLY=1` の実験flag配下では、Rust frame sourceが取得できない場合にlegacy canvas captureへ戻らず、
`rustFrameSourceRequired` としてexport開始前に失敗する。Rust frame sourceが実行中にblockedになった場合も
legacy canvasへ戻さず、`sharedRendererRustFrameSourceBlocked` runtime planでexport失敗へ流す。

58. Phase5: Rust export 動画ownership失敗を blocked fallback にする
export frame sourceでは Pixi が動画ownerになる余地がないため、presenter control の `videoOwnership.owner` が
`sharedRenderer` 以外で、かつ `noVideoScene` でない場合は `videoOwnershipUnavailable` のblocked errorへ変換する。
これにより、動画clipが欠けたshared renderer canvasを成功frameとしてcaptureしない。

59. Phase5: Rust-only export で WebCodecs encoder を拒否する
`resolveProjectExportEncodePlan` を追加し、通常互換モードでは `webCodecsMp4Muxer` を維持しつつ、
`VITE_UXFD_RUST_EXPORT_ONLY=1` では Rust video encoder backend が無い限りexportを開始前に失敗させる。
これにより、Rust-only検証中に WebCodecs `VideoEncoder` / mp4-muxer へ暗黙に戻る経路を塞ぐ。

60. Phase5: Rust video必須時は Pixi preview fallback を禁止する
`VITE_UXFD_RUST_VIDEO_ONLY=1` の実験flag配下では、shared renderer video ownership がまだ取れていない動画clipでも
Pixi preview側の `HTMLVideoElement` / `VideoSource` / canvas upload fallback を作らず、shared renderer側だけを正とする。
これにより、preview検証中にPixi videoが見えているだけの状態をRust移管完了と誤認しない。

61. Phase5: Rust video encode bridge control を追加する
renderer側に `rustBackendVideoEncodeControl` を追加し、Rust encoder session の start / shared-frame write / finish を
base64やRGBA bytesではなく shared memory descriptor のcontrol payloadで扱う契約にする。
`resolveProjectExportEncodePlanFromBridge` は `window.rustVideoEncoder` のshapeからRust encoder availabilityを判断し、
bridgeが接続された時点でRust backend encoderを選べるようにする。

62. Phase5: Rust video encode IPC境界を追加する
`rustVideoEncodeIpcChannels` を追加し、preloadから `window.rustVideoEncoder` として
`startVideoEncode` / `writeVideoEncodeFrame` / `finishVideoEncode` を露出する。
Electron mainは旧base64 `start-export` / `write-frame` / `end-export` へ流さず、現段階では
`Rust shared-frame video encoder backend is not connected yet.` としてfail-loudにする。

63. Phase5: Rust shared-frame encode RPC を予約する
Rust backend に `encode.start` / `encode.writeFrame` / `encode.finish` を追加し、旧 `export.write_frame`
のbase64/MJPEG stdin経路とは別のshared-frame encoder入口を確保する。
本体未実装の間は `Rust shared-frame video encoder backend is not connected yet.` を返し、Method not foundやlegacy fallbackにしない。

64. Phase5: Rust encode IPC を backend RPC へ接続する
Electron main の `rust-backend-encode-start` / `rust-backend-encode-write-frame` / `rust-backend-encode-finish` は、
旧 `start-export` / `write-frame` / `end-export` へ戻らず、Rust backend の
`encode.start` / `encode.writeFrame` / `encode.finish` へ payload をそのまま渡す。
`callRustBackend` の error / timeout / backend 起動失敗は renderer bridge の
`{ success: false, error }` へflattenし、未実装時のfail-loud位置をElectron stubからRust backend側へ移す。

65. Phase5: encoder書込後の shared slot 解放状態を追加する
Rust encoder が shared memory ring から frame を読み、ffmpeg / encoder stdin へ書き終えた後にslotを返せるよう、
`CopyOutState::EncoderFrameWritten` を追加する。decode preview向けの `gpuUploadFenceSignalled` と区別し、
encode data-plane では「encoderへの書込完了」を所有権返却条件として扱う。

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
