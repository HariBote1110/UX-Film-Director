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

66. Phase5: Rust encode frame payload に slotCount を追加する
Rust backend encoder が `PosixSharedRing::attach_with_retry_for_layout` でshared memoryへattachできるよう、
renderer側の `writeVideoEncodeFrame` payloadに `slotCount` を追加する。
`memoryId` / `slotCount` / `descriptor.byteLen` を揃えて、次段のRust側session skeletonとshared-frame readに進む。

67. Phase5: Rust encode session skeleton を実装する
Rust backend の `encode.start` / `encode.writeFrame` / `encode.finish` をfail-loud予約からsession管理へ進める。
`encode.start` は `rgba8Srgb` / bt709+sRGB+full range のmetadataだけを受け付け、`encode.writeFrame` は
`slotCount` と `SharedFrame` descriptorを検証する。現段階ではshared memory attachとffmpeg書込はまだ行わず、
frame countとdescriptor整合性をRust側で保持する。

68. Phase5: Rust encode write で shared frame を読み解放する
`encode.writeFrame` は `memoryId` / `slotCount` / `descriptor.byteLen` から
`PosixSharedRing::attach_with_retry_for_layout` でshared memoryへattachし、`ptsFrame` のframeを読む。
読み終えたslotは `CopyOutState::EncoderFrameWritten` で解放する。現段階ではffmpeg stdinへはまだ書かず、
Rust backendがframe実体を受け取れることと、data-plane ownershipを返せることを確認する。

69. Phase5: Rust encode で rawvideo ffmpeg 出力を実装する
`encode.start` は raw RGBA input の ffmpeg processを起動し、`encode.writeFrame` はshared memoryから読んだ
padded RGBA frameをtight RGBAへ詰め直してstdinへ書く。`encode.finish` はstdinを閉じてffmpegをwaitし、
MP4 output fileを確定する。control planeには `sharedFrameByteLen` / `encodedFrameByteLen` のmetadataだけを返し、
frame bytes / base64 / pixel arrayは載せない。

70. Phase5: rendererからRust encoderへ渡す writable shared frame bridge を追加する
`shared-video-frame-bridge` / N-API addon / preloadに、renderer側がPOSIX shared memory ringを作成し、
RGBA frame bytesをwriteし、closeできるAPIを追加する。
これにより、Rust backend encoderが `memoryId` / `slotCount` / descriptorでattachして読むための
renderer→Rust data-planeを確保する。次段ではshared renderer export frameをこのringへ書き、
`useProjectExport` のRust encoder分岐から `startVideoEncode` / `writeVideoEncodeFrame` / `finishVideoEncode` を呼ぶ。

71. Phase5: Rust encoder shared frame writer を追加する
renderer側のtight RGBA export frameをGPU row pitch互換の256 byte strideへpaddingし、
writable shared frame ringへwriteした上で、Rust backend encoderへ渡す `RustBackendVideoEncodeWriteFramePayload` を組み立てる。
control planeにはframe bytes / base64 / pixel arrayを載せず、`memoryId` / `slotCount` / descriptorだけを渡す。
次段では `useProjectExport` の `rustBackendVideoEncoder` 分岐をこのwriterへ接続し、shared renderer export sourceから
Rust rawvideo encoderへ実フレームを流す。

72. Phase5: Rust encode export runner を追加する
`runRustBackendVideoEncodeExport` を追加し、rendered bitmap streamをRGBA readbackしてwritable shared frame writerへ渡し、
Rust backend encoderの `startVideoEncode` / `writeVideoEncodeFrame` / `finishVideoEncode` を順に呼ぶ。
この段階では映像frameのRust rawvideo encode orchestrationを固定し、音声muxはまだRust backend encode payloadへ接続しない。
次段では `useProjectExport` のRust encoder分岐からこのrunnerを呼び、WebCodecs/mp4-muxer stream writerを迂回する。

73. Phase5: useProjectExport の Rust encoder 分岐を接続する
`resolveProjectExportEncodePlanFromBridge` が `rustBackendVideoEncoder` を選んだ場合、旧alertで停止せず、
`runRustBackendVideoEncodeExport` へ `renderFrames()` を渡してRust backend rawvideo/ffmpeg encoderで映像を書き出す。
この経路ではElectron stream writerとWebCodecs/mp4-muxerを使わない。音声は未接続のため、
次段でRust `encode.start` payloadへaudio inputを追加し、映像・音声ともRust側でmuxする。

74. Phase5: Rust encode audio mux を接続する
Rust backend `encode.start` が `audioPath` を受け取り、rawvideo stdinをvideo input、WAV temp fileをaudio inputとして
ffmpegでMP4へmuxする。renderer側ではRust encoder経路だけ `buildExportAudioMixWav` で音声をWAVへmixdownし、
`save-temp-audio` で一時ファイル化して `runRustBackendVideoEncodeExport` へ渡す。
書き出し完了・失敗後は `delete-temp-file` で一時WAVを削除する。

75. Phase5: Rust export frame source の direct encode payload 経路を追加する
`runRustBackendVideoEncodeExport` は `ImageBitmap` だけでなく、prepacked `RustBackendVideoEncodeWriteFramePayload` を
受け取れるようにする。`ProjectExportRustFrameSource` には任意の `renderEncodeFrame` を追加し、
Rust encoder時の `useProjectExport` はこのdirect shared-frame経路を優先する。
これにより、次段でshared renderer export sourceがcanvas `ImageBitmap` readbackを返さず、shared memory descriptorを
直接Rust backend encoderへ渡せる。

76. Phase5: SharedRendererExportFrameSource で direct encode frame を生成する
shared renderer export sourceが `renderEncodeFrame` を実装し、既存のWebGPU presenter / ownership gateで描画したframeを
source内部のwritable shared frame writerへ書き込んで、Rust backend encoder payloadを返す。
`useProjectExport` のRust encoder経路ではrunner側のwritable ring copyを使わず、このpayloadをそのまま
`writeVideoEncodeFrame` へ渡す。現段階ではcanvas `ImageBitmap` capture後のRGBA readbackをsource内で行うため、
次段でWebGPU readback / mapped bufferからshared memoryへ直接copyする。

77. Phase5: WebGPU presented frame readback API を追加する
shared renderer WebGPU presenterはcanvas textureを `COPY_SRC` 付きでconfigureし、最後にpresentしたtextureを
`copyTextureToBuffer` で256 byte aligned row pitchのreadback bufferへcopyできるAPIを持つ。
これにより、次段で `SharedRendererExportFrameSource.renderEncodeFrame` は `ImageBitmap` captureを挟まず、
presenterのmapped buffer bytesをshared memory writerへ渡せる。

78. Phase5: export source direct encode を WebGPU readback へ接続する
`SharedRendererPreviewPresenterControl` が `readPresentedFrameRgbaBytes` を公開し、
`SharedRendererExportFrameSource.renderEncodeFrame` はcontrol readbackが使える場合に `ImageBitmap` captureを行わない。
WebGPU readbackで得た256 byte aligned RGBA bytesは `writePaddedFrame` でwritable shared frame ringへ直接書き、
Rust backend encoderへshared-frame descriptorだけを渡す。fallbackとしてreadback未対応controlでは従来の
`ImageBitmap` capture経路を残す。

79. Phase5: 通常exportを Rust encoder 優先へ切り替える
`resolveProjectExportEncodePlan` は `window.rustVideoEncoder` のbridgeが利用可能な通常起動でも
`rustBackendVideoEncoder` を選ぶ。Rust encoderが利用できない通常環境ではWebCodecs/mp4-muxer fallbackを残し、
`VITE_UXFD_RUST_EXPORT_ONLY=1` では従来どおりRust encoder未接続をfail-loudにする。
これにより、開発時に明示フラグを立てなくてもRust backend rawvideo/ffmpeg export経路を主経路にし、
WebCodecsを互換fallbackへ降格する。

80. Phase5: Rust encoder時の legacy frame source fallback を禁止する
Rust backend encoder が選ばれた時点で、export frame source は shared renderer Rust frame source を必須にする。
Rust frame source が無い、またはrender中にblockedになった場合はPixi canvas / HTMLVideoElement / ImageBitmap captureへ
退避せずfail-loudにする。WebCodecs互換encoderが選ばれた未接続環境だけ、従来のlegacy canvas fallbackを許可する。
これにより、Rust encoder経路が「Pixiで描いてRustで包む」状態へ戻らないようにする。

81. Phase5: Rust direct encode で WebGPU readback を必須化する
Rust backend encoderへ渡すdirect shared-frame payloadは `renderEncodeFrame` と
`readPresentedFrameRgbaBytes` を必須にする。direct encode中に presenter readback が使えない場合は
`webGpuReadbackUnavailable` としてblockedにし、`createImageBitmap` / canvas 2D RGBA extraction /
tight RGBA write fallbackへ戻らない。ImageBitmap経路はWebCodecs互換encoder、または通常 `renderFrame`
用途に限定する。

82. Phase5: Rust encode runner を shared-frame payload 専用にする
`runRustBackendVideoEncodeExport` はprepacked `sharedFramePayload` だけを受け取り、
bitmap frameをwritable ringへ詰め替えるfallbackを削除する。Rust backend encoder runnerは
`startVideoEncode` / `writeVideoEncodeFrame` / `finishVideoEncode` の制御だけを担い、
ImageBitmap readback、canvas 2D extraction、runner側writable ring copyを行わない。
これによりdirect encodeのdata-planeは shared renderer export source 側のWebGPU readback -> shared memory writerへ集約する。

83. Phase5: Rust encode runner 入力型を shared-frame 専用にする
`runRustBackendVideoEncodeExport` の `frames` 入力型を `RustBackendVideoEncodeSharedFramePayloadFrame` に限定し、
TypeScript上でも `ImageBitmap` frameを渡せないようにする。`useProjectExport` のRust encoder分岐は
`renderRustEncodeFrames()` を通してshared-frame payloadだけをrunnerへ渡し、万一bitmap frameが混入した場合は
即時fail-loudにする。

84. Phase5: Rust video必須時は export中も Pixi video fallback を禁止する
`requireSharedRendererVideo` が有効な経路では、previewだけでなくexport中も
`shouldSkipPixiVideoForSharedRenderer` が動画clipをPixiから外す。shared renderer所有済みIDだけに基づく通常cutoverは
互換性のためexport中は従来どおりPixi fallbackを残すが、Rust video必須モードではHTMLVideoElement / Pixi videoへ戻らない。

85. Phase5: Rust export時は DOM動画pause副作用を発生させない
shared renderer Rust frame source が有効なexportでは、`useProjectExport` が既存 `HTMLVideoElement` 群を
一時停止しない。DOM動画のpauseはlegacy canvas / browser video providerが必要な互換exportだけに限定し、
Rust frame source -> shared-frame encodeの経路ではブラウザ動画状態を触らない。

86. Phase5: Rust direct encode source から ImageBitmap 必須型を外す
`ProjectExportRustFrameSource.renderFrame` をoptionalにし、Rust direct encodeでは `renderEncodeFrame` だけを持つ
frame source を正規に扱う。WebCodecs互換やbitmap captureが必要な経路は `renderFrame` の存在を明示確認してから使い、
shared-frame encode経路に `ImageBitmap` capture能力を要求しない。

87. Phase5: Rust video-only export では legacy canvas fallback を禁止する
`VITE_UXFD_RUST_VIDEO_ONLY=1` かつexport対象に動画が含まれる場合は、WebCodecs互換encoderが選ばれたとしても
`ProjectExportRustFrameSource` を必須にする。Rust frame source が無い場合は `failExport` とし、
動画を含むexportがPixi canvas / HTMLVideoElement seek / ImageBitmap captureへ戻らないようにする。

88. Phase5: Rust video-only previewの所有権失敗をfail-loudにする
`VITE_UXFD_RUST_VIDEO_ONLY=1` のpreviewでは、shared rendererが動画所有権を取れない状態を成功扱いにしない。
`requireSharedRendererVideo` をpresenter orchestrationへ渡し、動画sceneで `videoOwnership.owner !== 'sharedRenderer'` の場合は
`requiredVideoOwnershipUnavailable` を diagnostics に出して `ok:false` を返す。

89. Phase5: Rust video-only は shared renderer video cutover を暗黙有効化する
Rust動画が必須のpreviewでは、旧 `VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER` がOFFでも動画upload準備を実行する。
orchestrationは `videoCutoverEnabled || requireSharedRendererVideo` を effective cutover とし、
presenterにも同じ値を渡して、Rust video-only設定だけでdecode/upload/ownership判定が進むようにする。

90. Phase5: Rust動画検証用のcross-platform dev scriptを用意する
`npm run dev:rust-video` を追加し、Node wrapperから `VITE_UXFD_SHARED_RENDERER_PREVIEW=1` /
`VITE_UXFD_SHARED_RENDERER_EXPORT=1` / `VITE_UXFD_RUST_VIDEO_ONLY=1` をViteへ渡す。
shellのenv代入に依存せず、Mac/Windowsの検証入口を揃える。

91. Phase5: Rust video-only export は Rust backend encoder を必須にする
`VITE_UXFD_RUST_VIDEO_ONLY=1` かつ動画を含むexportでは、Rust frame sourceだけでなくRust backend encoderも必須にする。
renderer bridgeに `startVideoEncode` / `writeVideoEncodeFrame` / `finishVideoEncode` が揃わない場合は
WebCodecsへfallbackせず開始前にfail-loudにする。`npm run dev:rust-video` は `VITE_UXFD_RUST_EXPORT_ONLY=1` も渡し、
検証時のpreview/exportをRust経路へ固定する。

92. Phase5: Rust export path から legacy browser export module の静的依存を外す
`useProjectExport` は `VideoFrameProvider` / `PlaybackFrameProvider` / `encodeVideoToMp4` を静的importしない。
legacy canvas / WebCodecs互換branchに入った時だけ動的importし、Rust backend encoder + shared-frame payload経路では
browser decode provider と WebCodecs encoder module を初期ロードしない。

93. Phase5: Rust video-only preview診断はDOM動画readinessを見ない
`VITE_UXFD_RUST_VIDEO_ONLY=1` のpreviewでは、shared renderer video readiness診断が `HTMLVideoElement` の
`readyState` / `videoWidth` / `currentTime` を参照しない。動画mediaは `rustRendererRequired` として集計し、
DOM動画が存在しないことを `missingElement` と誤診断しない。

94. Phase5: Rust direct encode sourceはbitmap capture能力を持たない
Rust backend encoderがexport frameを所有する場合、Viewportからshared renderer export sourceへ
`preferEncodeOnly` を渡し、`createImageBitmap(canvas)` を使う `renderFrame` を公開しない。
Rust direct encodeはWebGPU presenter readbackからshared-frame payloadを作る `renderEncodeFrame` のみを使い、
legacy WebCodecs / canvas export branchだけがbitmap capture能力を保持する。

95. Phase5: presenter shared-frame payloadをRust direct encodeへ直結できるようにする
shared renderer presenter controlが `takePresentedFrameSharedFrame` を提供する場合、export frame sourceは
`readPresentedFrameRgbaBytes` とJS側shared-frame writerを使わず、そのpayloadをRust backend encoderへ渡す。
現行WebGPU readback経路はfallbackとして残し、Rust renderer / encoder直結実装へ差し替える受け口を先に固定する。

96. Phase5: WebGPU presenterがshared-frame payload生成を所有する
`createSharedRendererWebGpuPresenter` は最後にpresentしたtextureをGPU readbackし、presenter内のshared-frame writerで
Rust backend encoder用payloadへ変換する `takePresentedFrameSharedFrame` を公開する。
export source側のwriter責務を下ろし、将来のnative/Rust GPU handoff実装ではこのpresenter APIの内部だけを差し替える。

97. Phase5: export sourceはJS shared-frame writerを静的ロードしない
`sharedRendererExportFrameSource` は `rustBackendVideoEncodeSharedFrameWriter` を静的importしない。
presenterが `takePresentedFrameSharedFrame` を持たない古い/fallback制御だけで動的importし、通常のRust direct encode初期ロードから
JS shared-frame writer実装を外す。

98. Phase5: WebGPU presenterはnative/Rust frame handoffをreadbackより優先する
`createSharedRendererWebGpuPresenter` は `presentedFrameSharedFrameTaker` を受け取り、最後にpresentしたtextureと
WebGPU device/formatを渡せるようにする。handoffがpayloadを返した場合は `copyTextureToBuffer` とJS shared-frame writerを呼ばず、
未対応時だけ既存のreadback fallbackへ落とす。

99. Phase5: preview presenter controllerからnative/Rust handoffを配線する
`startSharedRendererPreviewPresenter` は `presentedFrameSharedFrameTaker` を受け取り、
`createSharedRendererWebGpuPresenter` へ渡す。これによりElectron/native bridge側のhandoff実装を
Viewport/exportのshared renderer controlへ差し込めるようにする。

100. Phase5: export sourceからnative/Rust handoffをcontrollerまで通す
`createSharedRendererExportFrameSource` と `startSharedRendererViewportPresenter` は
`presentedFrameSharedFrameTaker` をpass-throughし、Rust direct encode時にexport frame sourceから
WebGPU presenterのnative/Rust handoffまで1本の配線を持てるようにする。

101. Phase5: Viewport export source builderからnative/Rust handoffを渡せるようにする
`ProjectExportRustFrameSourceContext` / `buildViewportRustExportFrameSource` / `Viewport` の
Rust export source生成経路に `presentedFrameSharedFrameTaker` を追加する。
これにより上位のElectron/native bridge実装を、実アプリのRust direct encode経路へ注入できるようにする。

102. Phase5: native/Rust presented-frame handoff bridge factoryを用意する
`window.sharedVideoFrame.takePresentedFrameSharedFrame` を任意のpreload/native bridge APIとして公開し、
renderer側は `createSharedVideoFramePresentedFrameTaker` で可用性を判定してRust export frame sourceへ注入する。
native addonが未対応の場合はtakerを作らず、既存のWebGPU readback / JS shared-frame writer fallbackへ戻す。
この段階ではbridge境界と実アプリへの注入を固定し、次段でnative addon側のWebGPU texture handoff実装を詰める。

103. Phase5: shared video frame N-API addonにpresented-frame handoff入口を追加する
`shared-video-frame-bridge-node` は `takePresentedFrameSharedFrame(payload)` を公開する。
現段階ではWebGPU `GPUTexture` をRust側で直接取得できないため、native addonは明示的な未実装エラーを返し、
renderer側は既存のreadback fallbackへ戻る。次段ではこの入口を、Rust-owned texture/export surface または
別プロセス/ネイティブレンダラのshared memory出力へ置き換えて、成功payloadを返す実装へ進める。

104. Phase5: presented-frame handoffはcapability確認と例外fallbackで保護する
`getPresentedFrameHandoffCapabilities()` が `available: false` を返す場合、rendererはhandoff takerを作らない。
また、`contextBridge` 越しのWebGPU object受け渡しがclone/proxy例外を投げても、takerは `null` を返して
既存のWebGPU readback fallbackへ戻る。未実装native addonが存在するだけでRust direct encode exportを壊さない。

105. Phase5: native wgpu rendererの出力をshared-frame ringへ書けるようにする
`native-wgpu-renderer` は `render_native_wgpu_frame_to_shared_ring` を公開し、Rust/wgpuで描画したRGBAを
GPU row pitchに合わせてpadしたうえでPOSIX shared memory ringへ書き込む。戻り値は `SharedFrame` descriptorと
ring ownerを保持し、Rust backend encoderへclone可能なdescriptorだけを渡せる入口にする。
これにより、ブラウザWebGPU `GPUTexture` をElectron `contextBridge` 越しに渡す設計から、
Rust-owned render/export surfaceへ移行する足場を得る。

106. Phase5: Rust backendにnative render shared-frame RPCを追加する
`render.nativeSharedFrame` はsource shared-frame descriptorを受け取り、backend内でPOSIX shared memoryへattachして
tight RGBAへ戻す。Rust/wgpu rendererでSceneSnapshotを描画し、出力を別のshared-frame ringへ書いて
`SharedFrame` descriptorだけを返す。source ringはrender完了後にreleaseし、出力ringはbackend stateで保持する。
これにより、decode shared memory → Rust/wgpu render → encode shared memory の中間接続がcontrol plane bytesなしで成立する。

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
