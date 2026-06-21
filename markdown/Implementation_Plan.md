# 実装計画

## AviUtlPackV4標準搭載ロードマップ（2026-06-21）
詳細は `markdown/AviUtlPackV4_Inventory.md` と `src/utils/aviutlPackFeatureCatalog.ts` を正とする。

### 方針
1. iCloud Driveの利用中Packを「機能の参照元」として棚卸しする。
2. 第三者スクリプト本体の同梱やLua実行を初手にせず、UX FDネイティブの互換再実装として標準搭載する。
3. UI以外のCanvas/描画に関わる効果はRust/WebGPUへ寄せる。
4. ボイロ動画で使用頻度が高く、実装効果が大きいものからP0/P1へ置く。

### 優先順位
1. `P0`: AviUtl/YMM4系イージング、登場退場、ランダム、反復モーション
2. `P1`: 輝度ワイプ、縁取り、色収差、扇クリッピング、音声波形
3. `P2`: パーティクル、モーションパス、より複雑な生成オブジェクト
4. `P3`: カメラ補助、Luaスクリプト互換ランタイム、Pack由来の高度互換

### 直近実装順
1. ✅ AviUtlPackV4棚卸しと標準搭載候補カタログの追加
2. ✅ `P0` motion presetの中核を既存キーフレーム/easingへ接続
3. ✅ PropertyPanelへP0 AviUtl motion presetを露出
4. ✅ `P1` 標準効果プリセットの中核を既存Filter Stackへ接続
5. ✅ PropertyPanelのFilter StackへP1標準搭載候補を露出
6. ✅ `P1` Rust/WebGPU effectの境界型へ色収差を追加
7. ✅ `P1` Rust/WebGPU effectの境界型へ縁取りを追加
8. ✅ `P1` Rust/WebGPU effectの境界型へ輝度ワイプを追加
9. ✅ `P1` Rust/WebGPU effectの境界型へ扇クリッピング近似を追加
10. ✅ `P1` Audio waveform RをRust生成メディア境界へ追加
11. ✅ `P1` Audio waveform RのRust波形生成コアを追加
12. ✅ `P1` Audio waveform Rをnative-wgpu-rendererへ接続
13. ✅ `P1` Audio waveform R用PCM供給RPCをRust backendへ追加
14. ✅ `P1` Audio waveform RのElectron bridgeを追加
15. ✅ `P1` Audio waveform Rをnative render payloadへ接続
16. ✅ `P1` Audio waveform Rをexport native encode payloadへ接続
17. ✅ `P2` 標準パーティクルを生成メディア境界へ追加
18. ✅ `P2` 標準パーティクルをRust backend/native rendererで描画
19. ✅ `P2` 標準パーティクルをsource frame対応の動的生成へ拡張
20. ✅ `P2` 標準パーティクル追加UIをTimeline context menuへ接続
21. ✅ `P2` 標準パーティクルのプロジェクト保存/読込許可を追加
22. ✅ `P2` 標準パーティクルPropertyPanel編集を追加
23. `P2` E2Eで代表素材に効果を載せ、preview/exportの一致を検証（境界E2Eと実Electron生成効果exportは確認済み。実画素一致は継続）

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
fail-loud error mapping を確認する。Electron preload も control-plane pixel payload を返さず、
renderer-owned target buffer への copy 成否だけを扱う。

45. Phase5: Electron contextBridge の返却bytes fallbackを禁止する
Electron `contextBridge` 越しでも `copyIntoUploadBuffer` の戻り値に pixel bytes を載せない。
preload は native addon の copy report をそのまま返し、renderer helper は `target` mutation が成立しない環境を
fail-loudとして扱う。control plane は descriptor / checksum / status だけを返し、pixel data-plane は
shared memory / native copy bridge / renderer-owned upload buffer に限定する。

46. Phase5: Viewport orchestration から Rust video upload を起動する
Viewport presenter 起動前に `prepareSharedRendererViewportVideoUpload` を呼び、最初の visible video request について
Rust backend `decode.start` / `decode.requestFrame` / shared memory copy を行って WebGPU upload object を presenter に渡す。
同じ source/layout の active decode job は再利用する。現段階では Rust backend が単一 decode session 前提のため、
複数動画や source 切替は stop / replace / multi-session API を追加するまで Pixi fallback を維持する。
`uploadFailed` は上位の失敗分類として維持しつつ、`copyReportChecksumMismatch` などの低レベル
`uploadFailureReason` を保持し、shared memory copy / WebGPU upload 診断へそのまま渡せるようにする。
保持した失敗理由は `uxfdSharedRendererPresenterVideoUploadFailureReason` /
`uxfdSharedRendererPresenterVideoUploadFailureDetail` としてpresenter datasetへ公開し、Pixi fallback中でも
Rust data-plane側の拒否理由を追跡できるようにする。
export frame sourceがこの失敗でblockedになる場合も、blocked errorのdetailへ低レベル
`uploadFailureReason` を含め、書き出し失敗時にRust/shared memory copy側の拒否理由を失わない。

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
`VITE_UXFD_SHARED_RENDERER_EXPORT !== '0'` の既定ON gate配下で、2D editor / WebGPU available / non-fallback adapter /
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
`VITE_UXFD_RUST_VIDEO_ONLY=1` をViteへ渡す。shared renderer exportは
`VITE_UXFD_SHARED_RENDERER_EXPORT !== '0'` の既定ON gateに移行する。
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

107. Phase5: rendererからnative render shared-frame RPCを呼べるbridgeを追加する
Electron main/preload は `rust-backend-render-native-shared-frame` を公開し、rendererの
`window.rustBackend.renderNativeSharedFrame` から `render.nativeSharedFrame` を呼べるようにする。
renderer側には `rustBackendNativeRenderControl` を追加し、source/output shared-frame descriptorを型付きpayloadで渡す。
次段ではこのbridgeをexport frame sourceへ接続し、Rust decode → Rust render → Rust encode を実経路にする。

108. Phase5: export frame sourceをRust native render shared-frame経路へ接続する
`sharedRendererExportFrameSource` は `renderEncodeFrame` の先頭で、Rust decode済みの
`SharedFrame` descriptorを `prepareSharedRendererViewportNativeRenderSources` から受け取り、
`render.nativeSharedFrame` へ渡す。成功時は返却されたrender output descriptorを
`RustBackendVideoEncodeWriteFramePayload` に包み、WebGPU presenter / `readPresentedFrameRgbaBytes` /
JS shared-frame writerを呼ばずにRust encoderへ渡す。
動画decode requestがないsceneでは従来のpresenter/readback fallbackを維持し、native render準備またはRPC失敗は
`nativeRenderFailed` としてfail-loudに扱う。

109. Phase5: native render output ringのencode後lifecycleを閉じる
Rust backendは `render.nativeSharedFrame` で生成したoutput ringを `native_render_outputs` に保持するが、
`encode.writeFrame` がそのdescriptorを読み終えて `EncoderFrameWritten` へreleaseしたら、対応する `memoryId` を
backend stateから削除する。owner dropによりPOSIX shared memoryをunlinkし、長いexportでframeごとに
native render output ringが残り続ける状態を防ぐ。

110. Phase5: native/reference rendererで部分sourceのidentity配置を許可する
native-wgpu renderer / reference renderer は、identity transformでもsource sizeがcanvas sizeと一致することを要求しない。
source samplingの境界判定により、左上に置かれた小さいRGBA sourceは該当範囲だけを描き、それ以外はtransparentにする。
これによりSolidColour rectangleや小さいimage/video planeを、不要なfull-canvas sourceへ膨らませずに扱える。

111. Phase5: `render.nativeSharedFrame` でSolidColour mediaをRust source化する
rendererはnative render payloadに `media` を含め、Rust backendは `kind=SolidColour` / `source=#rrggbb` のmediaを
RGBA frameへ変換してrender sourcesへ合流させる。動画sourceはshared-frame descriptorのまま受け取り、
SolidColourはbackend内生成sourceとして扱うことで、動画＋矩形sceneをWebGPU presenter / Pixiへ戻さずnative renderできる入口を作る。

112. Phase5: `render.nativeSharedFrame` でPNG Image mediaをRust source化する
Rust backendは `kind=Image` のmedia sourceをPNGとして読み込み、RGBA frameへ変換してnative render sourcesへ合流させる。
declared media dimensionsとdecoded PNG dimensionsが一致しない場合はfail-loudにし、control planeへframe bytesを返さない。
これにより静止画像clipをPixi/WebGPU presenterへ戻さず、Rust backend decode/source生成 → Rust/wgpu render → Rust encodeの経路へ寄せる。
同じ `mediaId` がmedia由来sourceとshared-frame sourceの両方から登録される場合は、source ownershipを曖昧にしないため
`render.nativeSharedFrame` がfail-loudに拒否する。

113. Phase5: PNG Imageが動画の上にあるsceneでもvideo cutoverを維持する
video cutover stack safetyは、動画clipより上にある `Image` mediaのsourceがPNGの場合、Rust native renderでsource化可能な要素として扱う。
未対応画像形式は引き続き `pixiOnlyObjectAboveVideo` としてブロックする。これにより動画＋PNG画像＋SolidColourの積層sceneを
Pixiへ戻さず、Rust decode/shared memory → Rust native render → Rust encodeへ進める。

114. Phase5: media-only exportをRust native renderへ接続する
export `renderEncodeFrame` は動画decode requestが無い場合でも、visible clipがRust生成可能な `SolidColour` / PNG `Image` だけなら
`render.nativeSharedFrame` を `sources: []` で呼び、WebGPU presenter readback / JS shared-frame writerへ戻らない。
Electron native render bridgeが無い環境、空scene、未対応画像形式を含むsceneでは従来fallbackを維持する。

115. Phase5: JPG/JPEG Image mediaをRust native render source化する
`golden-harness` にJPEG decode補助を追加し、Rust backendは `kind=Image` の `.jpg` / `.jpeg` sourceをRGBA frameへ変換して
native render sourcesへ合流させる。TS側のnative media support判定もPNG/JPG/JPEGを同じ対応範囲として扱い、
動画上のJPG画像やmedia-only JPG exportをPixi/WebGPU readbackへ戻さない。

116. Phase5: native render outputの明示release RPCを追加する
Rust backendは `render.releaseNativeSharedFrame` を公開し、`render.nativeSharedFrame` が保持したoutput ringをencode以外の経路からも
明示的に解放できるようにする。Electron/preload/renderer controlにもrelease bridgeを追加し、previewや診断用途のnative render outputが
backend stateに残り続けないlifecycleを作る。
Rust direct encode runnerは `encode.writeFrame` が失敗した場合にも、このrelease bridgeを使って未消費のnative render outputを掃除する。

117. Phase5: file URL画像sourceをRust native renderで扱う
TS側のnative media support判定は、ローカルパスと `file://` / `file://localhost/` のPNG/JPG/JPEGだけをRust対応として扱い、
HTTP・blob・dataなど同期ファイル読み込みできないsourceをRust native renderへ誤投入しない。
Rust backendはImage media sourceのquery/hashを除去し、`file://` のpercent encodingを実ファイルパスへ戻してからPNG/JPEG loaderへ渡す。
これによりElectron実運用でURL化された静止画像clipもPixi/WebGPU presenterへ戻さず、Rust backend source生成からnative renderへ進める。

118. Phase5: preview native render frame表示入口を追加する
preview presenterはRust backend native render output相当のRGBA shared frame uploadを受け取り、WebGPU textureへ書き込んだ後、
動画planeではなくcanvas全面へそのままpresentできるようにする。GPU fence完了後にrelease callbackを呼び、
native render outputをpreviewでも明示的に解放できる入口を作る。
この段階では `render.nativeSharedFrame` のpreview orchestration呼び出しは未接続で、次段で
Rust backend native render result -> shared memory copy bridge -> preview presenterの縦スライスを接続する。

119. Phase5: preview orchestrationをRust native render resultへ接続する
Viewport presenter orchestrationは、video cutover有効時に `render.nativeSharedFrame` preview pathを先に試す。
動画clipがある場合はRust decode済みshared frameをnative render sourceとして渡し、media-only sceneではRust生成可能な
`SolidColour` / PNG/JPG/JPEG `Image` mediaだけを `sources: []` でrenderする。
成功時はnative render output descriptorをshared memory copy bridgeでrenderer upload bufferへ移し、
`sharedRendererNativeRenderFrameUpload` としてpreview presenterへ渡す。GPU upload完了またはabort時には
`render.releaseNativeSharedFrame` でnative render outputを解放し、成功した場合は従来のper-video preview uploadをスキップする。

120. Phase5: native render preview成功時にPixi ownershipを移管する
native render frameは最終合成済みpreviewなので、表示成功時は含まれる `Video` / `SolidColour` clipを
shared renderer ownershipとして公開する。`Viewport` は既存のPixi cleanup hookを通じて該当video/shapeをPixi描画から外し、
同じclipがPixiとnative render canvasで二重に合成される状態を防ぐ。
ownership reasonには `nativeRenderFrameReady` を追加し、dataset diagnosticsからもnative render frame由来のcutoverを識別できるようにする。

121. Phase5: native render preview成功時にImage ownershipを移管する
PNG/JPG/JPEG `Image` mediaはRust native render source化済みなので、native render preview frame成功時は
該当Image clipもshared renderer ownershipとして公開する。`Viewport` はImage ownership idをPixi helperへ渡し、
Pixi image spriteをcleanupしてhitAreaだけ残す。これによりnative render canvasとPixi image spriteの二重合成を防ぐ。
dataset diagnosticsには image owner / reason / count を追加し、Image cutover状態を確認できるようにする。

122. Phase5: native render preview失敗理由をdataset診断へ出す
preview orchestrationがRust native render uploadを試して失敗した場合、Pixi/per-video fallbackで表示を継続しつつ、
`sharedRendererNativeRenderFailure` としてreason/detailをpreview presenterへ渡す。
presenter diagnosticsはready状態でも `uxfdSharedRendererPresenterNativeRenderFailureReason` /
`uxfdSharedRendererPresenterNativeRenderFailureDetail` をdatasetへ残し、PSD/textなど未対応mediaやbackend失敗で
Rust previewへ進めなかった理由を実機上で追えるようにする。
また、Rust native render output自体は生成できたがrenderer側WebGPU texture uploadで失敗した場合も同じ診断欄へ
upload失敗reason/detailを残し、単体video fallbackはnative render準備で更新されたactive decode jobを引き継ぐ。
`requireSharedRendererVideo` がfail-loud fallbackへ進む場合も、主reasonとは別にnative render failure reason/detailを保持する。

123. Phase5: PSD media kindをRust境界へ追加する
`RustSceneMediaReference` / rust-core `MediaKind` / boundary validator に `Psd` を追加し、PSD objectを
Rust scene snapshot上の正式なmedia referenceとして表現できるようにする。
この段階ではPSD native source生成はまだ有効化せず、`sharedRendererNativeMediaSupport` はPsdをunsupportedのまま扱う。
これによりvideo cutover安全判定を崩さず、次段のRust backend PSD layer composite source生成へ進める入口を作る。

124. Phase5: PSD visible layerをRust backend内でRGBA合成する
`psd_fast` の `PsdFastResult` から、visibleなleaf layerだけをPSD視覚順のbottom-to-topで透明キャンバスへ
source-over合成し、1枚の `RgbaFrame` を作る純粋関数を追加する。
この段階ではPSDファイル読み込みやnative render payload接続はまだ行わず、layer順序・非表示layer除外・group除外・alpha合成を
Rust単体テストで固定する。

125. Phase5: PSD mediaをRust native render sourceへ接続する
Rust backendの `render.nativeSharedFrame` が `MediaKind::Psd` を受けた場合、ローカルPSD file path / file URLを読み込み、
`psd_fast::parse_psd_fast` と `composite_visible_psd_layers` で1枚のRGBA source frameを生成してnative render sourcesへ合流させる。
PSD寸法がmedia referenceと一致しない場合はfail-loudにし、remote URLはImageと同じlocal source gateで拒否する。
この段階ではPSDファイル内のvisible状態を使い、UI側 `activeLayerIds` の橋渡しは次段で扱う。

126. Phase5: native render preview成功時にPSD ownershipを移管する
PSD mediaはRust native render source化済みなので、native render preview frame成功時は該当PSD clipも
shared renderer ownershipとして公開する。`Viewport` はPSD ownership idをPixi helperへ渡し、
Pixi PSD tree/sprite描画をcleanupしてhitAreaだけ残す。これによりnative render canvasとPixi PSD描画の二重合成を防ぐ。
dataset diagnosticsにはPSD owner / reason / countを追加し、PSD cutover状態を確認できるようにする。

127. Phase5: PSDをnative media supportへ公開する
TS側のnative media support判定で、ローカルpath / `file://` / `file://localhost` の `.psd` をRust native-renderable mediaとして扱う。
これによりPSD-only previewは `nativeRenderUnsupportedMediaOnly` でPixi fallbackせず `render.nativeSharedFrame` へ進み、
動画の前面にあるローカルPSDもvideo cutover stack safetyを止めない。remote / blob / data sourceのPSDは引き続きunsupportedとして扱う。

128. Phase5: PSD active layer idsをRust境界へ追加する
`PsdObject.activeLayerIds` のtrueキーをdeterministicにsortし、`RustSceneMediaReference.active_layer_ids` として
TS/Rust boundaryへ渡す。rust-coreの `SceneMediaReference` も同fieldを受け取り、PSDのUIレイヤー選択状態を
native render payload内で失わないようにする。この段階ではbackend合成への反映はまだ行わず、次段で
`psd_fast` composite対象layerのfilterへ接続する。

129. Phase5: PSD layer idをRust照合可能に安定化する
WASM/Rust PSD parser fast pathの `PsdLayerNode.id` を、Rust backendのPSD layer識別と同じ
`psd-layer-{layer_index}` / `psd-group-{group_id}` へ寄せる。これにより `activeLayerIds` を
Rust native render payloadへ渡したとき、backendが再parseしたPSD layerと照合できる。

130. Phase5: PSD active layer idsをRust合成へ反映する
`psd_fast` のlayerにstable idを持たせ、`SceneMediaReference.active_layer_ids` が指定されている場合は
選択されたvisible leaf layerだけをsource-over合成する。指定が空の場合は従来どおりPSDファイル内のvisible状態を使う。
`render.nativeSharedFrame` のPSD source生成はこのactive layer filterを使い、UIのPSDレイヤー選択を
native preview/exportへ反映する。

131. Phase5: PSD-only exportのnative render直通診断を追加する
PSD-only exportが動画decode requestなしで `render.nativeSharedFrame` へ進んだ場合、export frame diagnosticsへ
`uxfdRustExportFrameSourceFramePath=nativeRenderSharedFrame` を残す。これによりPSD-only exportが
Pixi presenter / WebGPU readback / JS shared-frame writerへ戻っていないことをdatasetから確認できる。

132. Phase5: export encode fallback経路を診断へ記録する
native render直通に進めない場合でも、presenter shared-frame handoffなら `presentedSharedFrame`、
WebGPU readback + JS shared-frame writerなら `webGpuReadbackSharedFrameWriter` を
`uxfdRustExportFrameSourceFramePath` へ残す。これによりRust中心のexportがどの段階でfallbackしたかを実機datasetから追える。

133. Phase5: 保存済みPSD復元をstable id経路へ接続する
プロジェクト保存済みPSDを `restoreProjectObjects` で再読込する場合も、ArrayBufferをWASM PSD metadata pathへ通し、
`psd-layer-{layer_index}` / `psd-group-{group_id}` のstable idで `rootLayer` / `layerTree` / `activeLayerIds` を復元する。
WASM parse失敗時だけ既存ag-psd経路へfallbackし、保存済みPSDのlayer選択がRust backendのactive layer filterと照合不能に
戻らないようにする。

134. Phase5: 旧PSD active idを復元後stable idへ移植する
保存済みprojectに旧ag-psd由来の不安定なPSD layer idが残っている場合、再parse後のstable `rootLayer` を正としつつ、
保存済み `rootLayer` の同名・同種・同位置ノードからactive状態を移植する。これにより旧projectでOFFにしていたPSD leaf layerが
復元後にdefault visibleへ戻り、Rust backendの `active_layer_ids` filterで再表示される事故を避ける。

135. Phase5: video+PSD混在exportのnative render内訳診断を追加する
video decode shared frame sourceとPSD media sourceが同じ `render.nativeSharedFrame` payloadへ入った場合、
export frame datasetへnative render media count / media kinds / source count / source media idsを残す。
これによりGoPro等の動画にPSD overlayを重ねたexportがPixi presenter / WebGPU readbackへ戻らず、
Rust native render直通で合成されているかを実機で確認できる。

136. Phase5: video混在exportのunsupported overlay mediaを事前blockする
video decode shared frame sourceが準備できていても、snapshot内の非video mediaがRust native render未対応の場合は
`render.nativeSharedFrame` を呼ぶ前に `nativeRenderUnsupportedMedia` としてfail-loudにする。
remote PSD / remote画像などをbackendへ渡してから失敗させず、Pixi fallbackへ黙って戻る余地を減らす。

137. Phase5: preview native renderにもunsupported overlay media gateを揃える
previewのnative render uploadも、video sourceが準備できている場合にremote PSD / remote画像などの非video未対応mediaを
backendへ渡す前に `nativeRenderUnsupportedMedia` で止める。exportとpreviewは同じmedia gate helperを使い、
Rust native renderへ渡せるscene envelopeの判断を揃える。

138. Phase5: preview native render内訳診断をexportと揃える
native render preview frameがreadyになった場合、presenter datasetへnative render media count / media kinds /
source count / source media idsを残す。video+PSD混在previewで `Video,Psd` とvideo source idを確認できるようにし、
export frame diagnosticsと同じ粒度でRust native renderへのownership cutoverを追跡する。

139. Phase5: export sessionにnative render envelopeを公開する
`buildSharedRendererExportSession` が実 `TimelineObject` から生成したsurface gateに対して、native render media count /
media kinds / source count / source media idsを `nativeRenderEnvelope` として公開する。video+PSD混在sceneでは
`Video,Psd` とvideo source idをsession時点で確認でき、unsupported overlay mediaも同じenvelopeでfail-loudに見えるようにする。

140. Phase5: Viewport export source診断へnative render envelopeを接続する
`buildViewportRustExportFrameSource` のpreflightで得た `nativeRenderEnvelope` をsource selection decisionへ保持し、
DOM dataset診断へ envelope status / media count / media kinds / source count / source media idsを残す。
surface gateやunsupported mediaでblockedになった場合も envelope reason/detail を記録し、
video+PSD混在exportがRust native render直通に進める状態かをsource選択時点で確認できるようにする。

141. Phase5: native renderer未接続時のexport native render準備を抑止する
Electron preload / native bridge が `render.nativeSharedFrame` を公開していない環境では、
動画sourceが存在しても `prepareSharedRendererViewportNativeRenderSources` を呼ばず、presenter shared-frame handoff /
WebGPU readback経路へ戻す。未接続のRPCや不要なRust decode jobを発生させず、native render capability gateを
source準備より前に評価する。

142. Phase5: Rust export blocked後の同一frame fallbackを正しく再計算する
shared renderer Rust frame sourceがframe途中でblockedになり、legacy canvas fallbackを許可する場合、
同じframe内の `requiresHtmlVideoElementSeekFallback` / `requiresRenderScene` 判定へblocked後のruntime planを使う。
これによりblocked発生frameだけ古いcanvasや未seek動画をcaptureする事故を防ぐ。
blocked時の明示closeとexport終了時のcleanup closeは単回化し、同じRust/shared renderer frame sourceを二重closeしない。

143. Phase5: native render output shared frameのrelease所有権を明示する
Rust native render直通で生成したshared frameだけに `releaseAfterEncodeFailure` metadataを付与し、
encode.writeFrame失敗時の `render.releaseNativeSharedFrame` 呼び出し対象をnative render outputへ限定する。
presenter handoff / WebGPU readback writer由来のshared frameはそれぞれの所有者が管理し、native render release APIでは扱わない。

144. Phase5: encode.writeFrame reject時もnative render outputをreleaseする
`writeVideoEncodeFrame` が `{ success: false }` を返す場合だけでなく、Promise reject / throw で失敗した場合も
`releaseAfterEncodeFailure.kind === 'nativeRenderOutput'` の `memoryId` を `render.releaseNativeSharedFrame` へ渡して解放する。
これによりcustom bridgeや予期しないIPC rejectでもnative render output ringが残らないようにする。

145. Phase5: preview native render output release callbackを単回化する
preview native render uploadが成功した後、`releaseAfterGpuUpload` と `releaseAfterUploadAbort` の両callbackが呼ばれても
同じ `memoryId` の `render.releaseNativeSharedFrame` は一度だけ実行する。WebGPU fence/abortの順序揺れや二重disposeでも
native render output ringのlifecycleが二重解放に依存しないようにする。

146. Phase5: Rust backend encode-only exportではnative renderを必須にする
Rust backend encoderがshared-frame payloadを直接encodeする `preferEncodeOnly` 経路では、
`render.nativeSharedFrame` bridgeが未接続の場合に WebGPU readback + JS shared-frame writerへ戻らず
`nativeRenderUnavailable` としてfail-loudにする。これによりRust encoder使用時のJS readback依存を狭め、
native render output shared frameを正本とするexportへ寄せる。

147. Phase5: encode-only media-only exportの非対応native mediaをblockする
Rust backend encode-only exportで動画decode sourceが不要なmedia-only frameになった場合も、全clipがRust native-renderable
mediaでないなら `nativeRenderUnsupportedMedia` としてfail-loudにする。
remote画像や未対応media-only sceneで WebGPU readback + JS shared-frame writerへ戻らず、native render正本の契約を維持する。

148. Phase5: 動画exportのRust frame source必須化
動画を含むexportでは、WebCodecs互換encoderを使う場合でも `ProjectExportRustFrameSource` を必須にする。
Rust/shared renderer frame sourceが無い、またはblockedになった場合は legacy Pixi canvas / VideoDecoder /
HTMLVideoElement seek / `createImageBitmap(canvas)` へ戻さずfail-loudにし、動画exportの正本をRust/shared renderer側へ寄せる。

149. Phase5: export用途のPixi passthroughを拒否する
shared renderer export frame source が preview presenter を使う場合は `requireSharedRendererOutput` を立て、
SolidColour / native render / Rust decoded video frame の実出力がない `pixi-passthrough` を `sharedRendererOutputUnavailable`
としてblockする。これによりRust frame source readyに見えながら実ピクセルはPixi canvas側、というexport診断と実体のずれを防ぐ。

150. Phase5: encode-only exportのnative renderを暗黙必須化する
`bitmapCaptureEnabled: false` の encode-only source では、呼び出し側が `nativeRenderRequired` を明示しなくても
Rust backend `render.nativeSharedFrame` を必須にする。native render bridge未接続時は presenter readback /
JS shared-frame writerへ戻らず `nativeRenderUnavailable` でblockし、encode-onlyの意味をRust native render直通に固定する。

151. Phase5: export encodeのWebGPU readback writerを削除する
shared renderer export frame source の `renderEncodeFrame` から `readPresentedFrameRgbaBytes` + JS shared-frame writer経路を削除する。
encode frameは Rust native render output または既存のpresented shared-frame handoffだけを受け付け、GPU readback bytesを
renderer JSでshared memoryへ詰め替える経路をexport encodeの正規経路から外す。

152. Phase5: 動画exportのRust backend encoderを必須化する
動画オブジェクトを含むexportでは、`rustVideoOnly` の有無に関係なく Rust backend video encoder bridgeを必須にする。
bridge未接続時は WebCodecs/mp4-muxer へ戻らず `rustEncoderRequired` で停止し、動画exportの最終encodeもRust側へ寄せる。

153. Phase5: presented shared-frame handoffのreadback writer fallbackを削除する
shared renderer WebGPU presenter の `takePresentedFrameSharedFrame` は、native `presentedFrameSharedFrameTaker` が
shared-frame payloadを返した場合だけ成功する。native handoff未接続または失敗時は WebGPU readback +
JS shared-frame writerへ戻らず、明示エラーで停止する。

154. Phase5: 動画export sourceを暗黙encode-onlyにする
Viewport の Rust export frame source生成では、`objects` に動画が含まれる場合、呼び出し側が `preferEncodeOnly` を
指定し忘れても `bitmapCaptureEnabled=false` / `nativeRenderRequired=true` を渡す。これにより動画export sourceが
`renderFrame` / `createImageBitmap(canvas)` 能力を持ってしまう入口を塞ぎ、Rust native render + Rust encodeを正規経路にする。

155. Phase5: 動画renderFrameのbitmap captureを拒否する
`createSharedRendererExportFrameSource` をfactory直呼びされた場合でも、`renderFrame` requestに動画objectが含まれるなら
presenter起動や `createImageBitmap(canvas)` へ進まず `videoBitmapCaptureDisabled` で停止する。動画export frameは
`renderEncodeFrame` の Rust native render shared-frame、またはnative presented shared-frame handoffだけを正規経路にする。

156. Phase5: 動画exportのRust frame source contextを純関数でencode-only化する
`useProjectExport` が `getRustExportFrameSource` へ渡すcontext生成を `resolveProjectExportRustFrameSourceContext` に分離し、
動画objectが含まれる場合はencoder hintに関係なく `preferEncodeOnly=true` にする。これによりhook内の条件式の回帰で
動画export sourceがbitmap-capableになり、legacy browser/canvas経路へ戻る事故をテストで検出できるようにする。

157. Phase5: export source testからJS shared-frame writer fixtureを削除する
`sharedRendererExportFrameSource` のproduction境界に加え、同テスト内にも `createEncodeFrameWriter` fixtureを残さない。
古いWebGPU readback + JS shared-frame writer経路をテスト語彙としても復活させず、Rust native render /
presented shared-frame handoffだけをencode shared-frameの正規語彙にする。

158. Phase5: WebGPU readback writer diagnostic pathを削除する
`sharedRendererExportFrameSource` の `uxfdRustExportFrameSourceFramePath` は `nativeRenderSharedFrame` または
`presentedSharedFrame` だけを成功pathとして扱う。削除済みの `webGpuReadbackSharedFrameWriter` を型・diagnosticからも外し、
dataset上でもJS writer経路を正規pathとして表現しない。

159. Phase5: Pixi video render pathでRust必須を優先する
Pixi video分岐の経路選択を `resolvePixiVideoRenderPath` に分離し、`requireSharedRendererVideo=true` の場合は
export frame overrideやPixi `HTMLVideoElement` / `VideoSource` pathより先に `sharedRendererOnly` を返す。
これによりRust video-only previewでPixi video fallbackが見えているだけの状態を避ける。

160. Phase5: export必須presenter controlからWebGPU readbackを非公開にする
`requireSharedRendererOutput=true` で開始した presenter control は `readPresentedFrameRgbaBytes` を公開せず、
native `takePresentedFrameSharedFrame` handoffだけをexport向けの共有frame取得口にする。
WebGPU readbackはpreview/parity診断用controlに限定し、export経路へ再接続されないようにする。

161. Phase5: export source testからWebGPU readback fixtureを削除する
`sharedRendererExportFrameSource.test.ts` から `readPresentedFrameRgbaBytes` fixtureを削除し、
export sourceテスト上もpresented shared-frame handoff不在時はblocked、handoffありならpayload直渡しという語彙に揃える。
WebGPU readbackはexport sourceのテスト語彙としても復活させない。

162. Phase5: handoff不在のexport理由名をWebGPU readbackから切り離す
`renderEncodeFrame` がnative renderにもpresented shared-frame handoffにも進めない場合のblocked reasonを
`webGpuReadbackUnavailable` から `presentedSharedFrameHandoffUnavailable` へ変更する。
export診断上も「readbackが必要」ではなく「native handoffが必要」と表現し、削除済みreadback経路を失敗理由名として残さない。

163. Phase5: JS shared-frame writer moduleを削除する
WebGPU readback bytesをJS側でshared memory ringへ詰め替えていた
`rustBackendVideoEncodeSharedFrameWriter` moduleと専用テストを削除する。
export encodeのshared-frame生成はRust native render outputまたはnative presented-frame handoffだけに限定し、JS writer実装を再接続できない状態にする。

164. Phase5: 動画export planのlegacy canvas直落ちを拒否する
`buildProjectExportFrameSourcePlan` は `hasVideoObjects=true` の場合、呼び出し側が `rustFrameSourcePolicy` を指定し忘れても
Pixi/explicit canvas captureへ落とさず `rustFrameSourceRequired` で停止する。
これにより `useProjectExport` 以外からresolverを直呼びした場合も、動画exportが legacy browser provider /
HTMLVideoElement seek / `createImageBitmap(canvas)` へ戻らない。

165. Phase5: 動画Rust frame source blocked時のlegacy復帰を拒否する
`buildProjectExportFrameSourcePlan` は動画objectを含むRust frame source planのblocked fallbackを `failExport` に正規化する。
これにより初期接続できたRust frame sourceが実行中にblockedになっても、runtime planが `legacyCanvasAfterRustBlocked` /
HTMLVideoElement seek / canvas captureへ復帰しない。

166. Phase5: preview動画のPixi video pathを既定で拒否する
`resolvePixiVideoRenderPath` は通常preview動画をshared renderer専用として扱い、`HTMLVideoElement` / Pixi `VideoSource` /
canvas upload pathへ進まない。export互換分岐だけは明示的なRust必須がない場合に旧pathを残す。
これにより再生・停止・scrub中の動画所有権もRust/shared renderer側へ寄せ、Pixiは動画planeを描かない。

167. Phase5: 動画preview controlからWebGPU readbackを非公開にする
動画sceneを含む shared renderer preview control は `readPresentedFrameRgbaBytes` を公開しない。
solid/空sceneの診断用readbackは残しつつ、動画previewからWebGPU readback bytesを経由してJS側へ戻る入口を閉じる。

168. Phase5: renderer writable shared-frame writer APIを削除する
renderer utility `sharedVideoFrameWritableBridge` と `window.sharedVideoFrame` の
`createWritableSharedFrameRing` / `writeIntoSharedFrameRing` / `closeWritableSharedFrameRing` 公開を削除する。
native addonの低レベル検証口は残しつつ、renderer JSからshared-frame ringへRGBAを書き込む旧writer経路を再接続できない状態にする。

169. Phase5: preview動画cutoverを既定ONにする
`Viewport` と `startSharedRendererPreviewPresenter` の video cutover 既定値を
`VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER !== '0'` に変更する。
通常preview動画はPixi video pathを既定で拒否済みのため、明示OFF時以外はRust/shared renderer decode/uploadを起動し、
動画plane所有権の正本をRust側にする。

170. Phase5: shared renderer preview surfaceを既定ONにする
`Viewport` の preview gateを `VITE_UXFD_SHARED_RENDERER_PREVIEW !== '0'` に変更し、
明示OFF時以外は shared renderer surface canvas / WebGPU probe / presenter orchestration を起動する。
Pixi video pathを既定拒否した状態でも、通常preview動画がRust/shared renderer planeへ流れるようにする。

171. Phase5: 動画なしexportでlegacy browser video provider importを避ける
`useProjectExport` は `exportFrameSourcePlan.requiresLegacyBrowserVideoProviders` に加えて
`videoObjects.length > 0` の場合だけ `VideoFrameProvider` / `PlaybackFrameProvider` をdynamic importする。
非動画exportからVideoDecoder/rVFC/HTMLVideoElement系providerの読み込みを外し、動画依存を実際の動画clipに限定する。

172. Phase5: production export hookからlegacy browser video providerを削除する
動画exportはRust frame source / Rust backend encoder必須になったため、`useProjectExport` から
`VideoFrameProvider` / `PlaybackFrameProvider` のdynamic import、provider map、HTMLVideoElement seek fallback、
VideoDecoder hybrid完了表示を削除する。WebCodecs互換branchは非動画canvas export用として残す。

173. Phase5: 未参照VideoFrameProvider moduleを削除する
production export hookから旧providerを外したため、`src/utils/videoFrameProvider.ts` を削除する。
`videoDecodeStream` はexport test harnessの比較・診断用途に残し、production hookへ再接続しない境界テストで保護する。

174. Phase5: export hookからHTMLVideoElement refを削除する
`useProjectExport` の引数から `videoElementsRef` を外し、`pauseLegacyBrowserVideosForExport` 呼び出しを削除する。
export hookはDOM動画要素を受け取らず、Rust frame source / canvas compatibility sourceだけを扱う。

175. Phase5: Pixi video element fallbackを削除する
`resolvePixiVideoRenderPath` はexport override以外の動画を `sharedRendererOnly` として扱う。
旧 `allowLegacyPixiVideo` opt-inと `pixiVideoElement` pathは削除し、Viewport通常経路から
HTMLVideoElement / Pixi VideoSourceへ戻る出口を閉じる。

176. Phase5: video readiness診断をcutover時もRust必須にする
`Viewport` が `buildSharedRendererVideoMediaReadiness` に渡す `requireSharedRendererVideo` を
`sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled` にする。
通常cutover中の動画診断をHTMLVideoElement ready/missingではなくRust/shared renderer requiredとして扱う。

177. Phase5: Pixi content routingをcutover条件へ揃える
`Viewport` が `updatePixiContent` に渡す `requireSharedRendererVideo` も
`sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled` にする。
診断と描画の双方で通常cutover中の動画をRust/shared renderer必須として扱い、
HTMLVideoElement/Pixi VideoSource fallbackへ戻る入口をさらに狭める。

178. Phase5: video readiness診断からDOM Map依存を外す
`buildSharedRendererVideoMediaReadiness` の `videoElements` 入力を任意化し、
Viewportのcutover診断では `videoElementsRef.current` を渡さない。
Rust/shared renderer必須時はHTMLVideoElementのreadyStateを参照せず、
診断もRust側のcutover状態を単一の判断軸にする。

179. Phase5: presenter orchestrationをcutover条件へ揃える
`Viewport` が `startSharedRendererViewportPresenter` に渡す `requireSharedRendererVideo` を
`sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled` にする。
診断、Pixi content routing、presenter orchestrationの動画cutover条件を同一化し、
通常cutover時もRust/shared renderer側の動画所有を要求する。

180. Phase5: Viewportからlegacy Pixi動画リソース所有を削除する
`Viewport` が `videoElementsRef` / `videoFrameTexturesRef` を所有せず、
`updatePixiContent` へ `videoElements` / `videoFrameTextures` を渡さない構造へ変更する。
legacy Pixi動画リソースは `updatePixiContent` の任意互換入力としてのみ残し、
通常Viewport経路の動画所有はRust/shared rendererへ寄せ切る。

181. Phase5: pixiRenderHelperからlegacy動画fallback実装を削除する
`pixiRenderHelper` の動画分岐から `document.createElement('video')`、
`PIXI.VideoSource`、VideoFrameTexture生成、HTMLVideoElementシーク同期を削除する。
Pixi側の動画処理はshared renderer専有時にchildrenを空にするか、
export override bitmapをSpriteへ反映する経路だけに限定する。

182. Phase5: legacy Pixi動画opt-in経路を削除する
`ResolvePixiVideoRenderPathInput.allowLegacyPixiVideo`、`pixiVideoElement` path、
`clearPixiVideoForSharedRenderer` を削除する。
staleなcompat入力が渡されても `resolvePixiVideoRenderPath` は `sharedRendererOnly` を返し、
Rust/shared renderer cutover後にPixi動画要素へ戻れない契約へ更新する。

183. Phase5: export overlay cleanupをPixi動画helperから独立させる
`destroyExportOverlayCanvases` を `videoElementForPixi` から `exportOverlayCanvases` utilityへ移し、
旧 `videoElementForPixi.ts` とそのテストを削除する。
export override bitmap cleanupは残しつつ、通常動画パイプラインからPixi動画helper命名と
HTMLVideoElement cleanupの足場を取り除く。

184. Phase5: legacy playback providerをexportTestへ隔離する
`PlaybackFrameProvider` と `FrameProvider` を `src/utils` から `src/exportTest` へ移す。
HTMLVideoElement / requestVideoFrameCallback ベースの比較providerはexport test harness専用とし、
production utilitiesから旧ブラウザ動画providerの足場を除去する。

185. Phase5: video readiness診断をRust/shared renderer必須へ一本化する
`buildSharedRendererVideoMediaReadiness` から `videoElements` 入力、
`HTMLVideoElement` readyState判定、`requireSharedRendererVideo` 分岐を削除する。
Viewportはmedia一覧だけを渡し、動画mediaは常に `rustRendererRequired` として診断する。

186. Phase5: export frame canvasのbrowser video pause helperを削除する
`projectExportFrameCanvas` から `ProjectExportBrowserVideoElement` と
`pauseLegacyBrowserVideosForExport` を削除する。
production export planning utilityがHTMLVideoElement pause型を公開しないようにし、
動画exportの副作用管理をRust/shared renderer側へ寄せる。

187. Phase5: video metadataをRust probe中心にする
`mediaMetadata` から `document.createElement('video')` metadata fallbackを削除する。
`resolveVideoMetadata` はRust/Electron `probe-media` 結果だけを使い、
動画読み込み時の寸法・duration取得もブラウザ動画要素に依存しない。

188. Phase5: export frame planからbrowser video provider flagを削除する
`ProjectExportFrameSourcePlanResult` と `ProjectExportFrameRuntimePlan` から
`requiresLegacyBrowserVideoProviders` / `requiresHtmlVideoElementSeekFallback` を削除する。
legacy canvas互換exportは `requiresRenderScene` と `usesExportFrameOverrides` だけで表し、
export計画からHTMLVideoElement seek fallback概念を取り除く。

189. Phase5: production動画依存境界テストを追加する
`src/exportTest` とテストファイルを除くproduction実装を走査し、
`document.createElement('video')`、`PIXI.VideoSource`、`HTMLVideoElement`、
legacy Pixi video / browser provider / metadata fallbackトークンが戻らないことを検証する。
比較・診断用のブラウザ動画コードは `src/exportTest` に隔離し、production経路はRust/shared rendererを正本にする。

190. Phase5: Rust decode responseのJSON pixel payload混入を拒否する
`rustBackendVideoDecodeControl` の decoded frame availability 判定で、
`bytes` / `pixels` / `frameBase64` / `rgbaBytes` がresponse内に混入した場合は利用不可にする。
Rust backend decodeのdata-planeはshared memory descriptorとnative copy bridgeに限定し、
renderer境界がJSON pixel payloadを受け入れない契約にする。

191. Phase5: decoded frame descriptor layoutをTS bridgeでも検証する
`memoryId`、`slotIndex`、`byteOffset`、`byteLen`、`width`、`height`、`strideBytes` が
shared memory ring layoutとして成立しない場合、decoded frameを利用不可にする。
`strideBytes >= width * 4`、256 byte row alignment、`byteLen === strideBytes * height` を
renderer upload前のTS境界で再確認し、壊れたdescriptorがWebGPU uploadへ流れないようにする。

192. Phase5: shared frame copy bridgeでring範囲を検証する
`prepareSharedRendererDecodedVideoFrameUpload` が `slotCount` とdescriptorを照合し、
`slotIndex >= slotCount`、`byteOffset !== byteLen * slotIndex`、ring範囲外のdescriptorでは
native copy bridgeを呼ばずにblocked resultを返す。
Rust backend decodeから来たshared memory descriptorが、宣言されたring layout外へcopyを要求しないようにする。

193. Phase5: shared frame copy reportからpixel payload fallbackを削除する
`SharedVideoFrameCopyReport` と `window.sharedVideoFrame.copyIntoUploadBuffer` の戻り値型から
`rgbaBytes` を削除し、実行時に `bytes` / `pixels` / `frameBase64` / `rgbaBytes` が混入した場合は拒否する。
shared memory / native copy bridge は渡されたrenderer-owned upload bufferへcopyするだけにし、
Electron contextBridge経由でpixel bytesを返す互換fallbackを廃止する。

194. Phase5: shared frame copy payloadへslot leaseを通す
`copyIntoUploadBuffer` のpayloadに `slotIndex` / `generation` を追加し、
TS helper、preload型、N-API wrapper、Rust bridge coreまで同じlease tokenを通す。
Rust bridgeはsequenceで読めたframeの実slotとpayloadの `slotIndex` を照合し、
descriptorが指すslotと異なるready frameをcopyしない。

195. Phase5: shared frame copy reportのslot leaseを照合する
`prepareSharedRendererDecodedVideoFrameUpload` はcopy reportの `slotIndex` / `generation` が
decoded frame descriptorと一致しない場合、upload objectを成功扱いしない。
native bridgeが返したreportもrenderer境界で再検証し、stale slot leaseのままWebGPU uploadへ進まないようにする。

196. Phase5: decode data-plane releaseをslot指定にする
POSIX shared memory data-planeのreleaseを「最初のREADING slot」ではなく、descriptor由来の `slotIndex` 指定で行う。
control-plane ringの `release_read_slot` とdata-plane ringのrelease対象を揃え、
複数slotがREADINGのときに別slotを誤ってfreeにしない。

197. Phase5: Rust video-only control-plane fallbackを禁止する
`VITE_UXFD_RUST_VIDEO_ONLY=1` では、video plane geometryとdecode request builderがRust/WASMで解決できない場合、
TypeScript fallbackへ黙って戻らず `requiredRustVideoControlPlaneUnavailable` でfail-loudにする。
通常のshared renderer previewでは移行互換のTypeScript fallbackを残すが、Rust video-only検証ではRust control-planeだけを正本にする。

198. Phase5: 複数動画upload失敗時に先行decoded slotをabort releaseする
複数visible videoのRust upload orchestrationで、後続clipのstart / decode / stale response / uploadが失敗した場合、
すでに準備済みのdecoded upload objectへ `releaseAfterUploadAbort` を流す。
失敗clip自身のslot releaseに加えて先行成功slotも `rendererUploadAborted` に戻し、multi-video previewでshared memory ringが詰まることを防ぐ。
decoded video upload objectの `releaseAfterGpuUpload` / `releaseAfterUploadAbort` は同じslot leaseに対して単回実行とし、
WebGPU fence成功後のabort callbackや二重disposeでRust backend slotを二重releaseしない。
native copy bridgeが失敗結果を返す場合だけでなく、reject / throwした場合も同じslot leaseを `rendererUploadAborted` で解放する。

199. Phase5: legacy base64 export IPC/RPCを削除する
Electron mainの旧 `start-export` / `write-frame` / `end-export` と、Rust backendの旧 `export.start` /
`export.write_frame` / `export.end` を削除する。
frame bytesを `frameBase64` としてcontrol-planeへ載せる経路をproduction境界から外し、
exportは `export-stream-*` またはshared-frame `encode.*` 経路だけにする。

200. Phase5: useProjectExportからPixi application型依存を外す
export hookが `PIXI.Application` refを直接受け取らないようにし、frame canvas取得は `getExportCanvas`
providerへ一本化する。
Viewport内では移行中のlegacy Pixi canvas fallbackを provider 内に閉じ込め、hook本体はRust/shared renderer
frame sourceとcanvas providerだけを見る境界にする。
provider内部の局所名も `pixiCanvas` ではなくlegacy export canvasとして扱い、export境界でPixiを正本名にしない。

201. Phase5: export frame canvas境界のPixi名をlegacy canvasへ一般化する
`projectExportFrameCanvas` の public input / source 名から `pixiCanvas` を外し、移行中のcanvas fallbackは
`legacyCanvas` として扱う。
Pixi固有の参照はViewport内部の provider 実装に閉じ込め、export utilityはRust frame source /
explicit export canvas / legacy canvasの抽象だけを見る。

202. Phase5: legacy canvas captureをexport hookからadapterへ隔離する
`useProjectExport` から `createImageBitmap` の直接呼び出しを外し、互換WebCodecs branchのcanvas captureを
`projectExportLegacyCanvasCapture` adapterへ移す。
Rust backend encoder / shared-frame pathをhook本体の主経路に保ち、browser canvas capture語彙はlegacy互換adapterに閉じ込める。

203. Phase5: WebCodecs互換encoder importをadapterへ隔離する
`useProjectExport` から `videoExportPipeline` のdynamic importを外し、WebCodecs/mp4-muxer互換encoderは
`projectExportCompatibilityEncoder` adapterでだけ読み込む。
Rust backend encoder / shared-frame pathのhook本体からbrowser encoder依存をさらに遠ざける。

204. Phase5: export計画のRust必須条件からrustVideoOnly入力を外す
動画を含むexportでは `rustVideoOnly` flagの有無に関係なくRust backend encoder / Rust frame sourceを必須にする。
そのため `projectExportEncodePlan` と `projectExportFrameCanvas` のpolicy入力から `rustVideoOnly` を削除し、
export判定の正本を `hasVideoObjects` とRust encoder availabilityへ寄せる。

205. Phase5: WebCodecs互換encoderを非動画export専用に固定する
`projectExportCompatibilityEncoder` は静止画・図形だけの互換export adapterとし、`hasVideoObjects` がtrueの入力を
`videoExportPipeline` dynamic import前に拒否する。
上流のencode planが壊れた場合でも、動画exportがWebCodecs/mp4-muxer経路へ漏れないようにする。
adapter入力の `hasVideoObjects` は必須booleanとし、呼び出し側が動画sentinelを渡し忘れた場合は型で検出する。

206. Phase5: export hookからoverride ref境界を外す
`useProjectExport` が旧VideoDecoder/Pixi注入用の `exportFrameOverridesRef` を直接受け取らないようにする。
動画exportのframe供給はRust/shared renderer frame sourceを正本とし、hookの公開境界を
`renderScene` / `getExportCanvas` / `getRustExportFrameSource` に絞る。

207. Phase5: Pixi動画override経路を削除する
`pixiVideoCutover` から `exportFrameOverride` / `hasExportFrameOverride` を削除し、動画はpreview/exportとも
Pixi bitmap overrideへ戻らないようにする。
`shouldSkipPixiVideoForSharedRenderer` はexport中でもvideo objectを常にPixi描画から外し、
Pixi動画所有へ復帰しない。
このため `pixiVideoCutover` の公開入力は `objectType` だけに縮約し、`isExporting` /
`sharedRendererVideoObjectIds` / `requireSharedRendererVideo` を所有判定へ持ち込まない。
Viewportと `pixiRenderHelper` から旧VideoDecoder overlay canvas cacheとframe override resourceを外し、
動画frame供給をRust/shared renderer側に寄せる。
未使用になった `exportOverlayCanvases` utilityもproduction utilsから削除する。
ViewportはPixi content routingへ `sharedRendererVideoObjectIds` / `requireSharedRendererVideo` を渡さず、
presenter orchestration側だけで動画cutover必須条件を扱う。

208. Phase5: production中間動画生成hookを削除する
`useMediaOptimization` はWebCodecs向けのH.264中間ファイルをproduction起動中に自動生成するため、
Rust backend decode / shared memory data-planeへ移す方針と競合する。
`useAppLogic` から接続を外し、production srcから `check-intermediate` / `generate-intermediate` を呼ばないようにする。
Electron mainから旧 `check-intermediate` / `generate-intermediate` / `cancel-intermediate` IPCも削除し、
WebCodecs用中間ファイル生成をproduction境界へ戻さない。
`videoDecodeStream` は `src/exportTest/` 配下へ移し、export test harnessの比較・診断用途に限定する。
production起動時の `VideoDecoder.isConfigSupported` probeも削除し、WebCodecs decode依存を通常起動境界から外す。
Electron mainのproduction IPCからも `resolve-4k-proxy-video` のようなVideoDecoder検証専用fixture resolverを外し、
WebCodecs診断用proxy解決を通常アプリ境界へ戻さない。
Electron起動flagからも `VideoToolboxVideoCodecFactory` / `VaapiVideoDecoder` / `VaapiVideoEncoder` /
`UseChromeOSDirectVideoDecoder` のようなbrowser video codec強制設定を削除し、動画decode/encodeの正本をRust backend側へ寄せる。

209. Phase5: presenter controlからWebGPU readback公開口を削除する
`SharedRendererPreviewPresenterControl` のready controlは `readPresentedFrameRgbaBytes` を公開しない。
export必須時・動画preview時だけでなく、preview presenter orchestrationの公開口全体を
native `takePresentedFrameSharedFrame` handoffへ寄せる。
低レベルの `sharedRendererWebGpuPresenter` readbackは単体診断・parity検証用に残しても、production preview/export controlから
RGBA bytesをJS側へ取り出す入口として再接続しない。

210. Phase5: export計画の動画sentinelを必須化する
`resolveProjectExportEncodePlan` / `resolveProjectExportEncodePlanFromBridge` /
`resolveProjectExportFrameSourcePolicyForEncode` / `buildProjectExportFrameSourcePlan` は
`hasVideoObjects` を必須booleanとして受け取る。
動画object有無を呼び出し側が明示しないままWebCodecs互換encoderやlegacy canvas fallbackへ進む状態を型境界で禁止する。

211. Phase5: 動画exportでRust cutoverを実効有効化する
`buildViewportRustExportFrameSource` は動画objectを含むexportでは
`videoCutoverEnabled || hasVideoObjects(objects)` を実効cutover条件にする。
preview用cutover flagが明示OFFでも、動画exportのframe sourceはRust native render / shared renderer encode-only pathへ進み、
legacy canvas captureやPixi動画fallbackへ戻らない。

212. Phase5: Rust export sourceへ動画sentinelを明示する
`ProjectExportRustFrameSourceContext` と `BuildViewportRustExportFrameSourceInput` は `hasVideoObjects` を必須booleanとして持つ。
Viewport Rust export sourceは optional `objects` から動画有無を推測せず、export planningで確定済みのsentinelを使って
effective cutover / encode-only / native render requiredを決める。
これによりpreflight用objectsの渡し忘れが、動画exportのRust必須判定を無効化しない。

213. Phase5: shared renderer export surfaceを既定ONにする
`Viewport` の export gateを `VITE_UXFD_SHARED_RENDERER_EXPORT !== '0'` に変更し、
明示OFF時以外はshared renderer export surface / WebGPU probe / Rust export frame sourceを利用可能にする。
動画exportはRust frame source必須のため、実験flag未指定でもsurface未生成で `rustFrameSourceRequired` へ落ちない状態にする。

214. Phase5: presenter orchestration fixtureからreadback再接続口を削除する
`sharedRendererViewportPresenterOrchestration.test.ts` の `SharedRendererPreviewPresenterControl` fixtureは
`readPresentedFrameRgbaBytes` を持たない。
production control型だけでなく、orchestrationテストfixture上もpresented frame取得口を
`takePresentedFrameSharedFrame` / native handoff側へ寄せ、WebGPU RGBA readbackを再接続する足場を残さない。

215. Phase5: Rust decode検証frame indexを照合する
`rustBackendVideoDecodeControl` の decoded frame availability 判定で、
`verification.frameIndex` / `result.frameIndex` / `frame.ptsFrame` が一致しない場合はdecoded frameを利用不可にする。
Rust backend decodeのchecksum検証結果が別フレームを指したままshared memory descriptorだけ通過し、
WebGPU uploadへ進む抜け道を塞ぐ。

216. Phase5: Rust decode応答job idの鮮度を確認する
Viewport decode orchestrationは、Rust backend decoded frame responseの `jobId` が要求中のdecode jobと一致しない場合、
shared memory copy bridgeへ進まず `staleDecodeResponse` として扱う。
返却されたframeのslotは返却 `jobId` / `slotIndex` / `generation` で `rendererUploadAborted` releaseし、
source切替や複数動画中に別jobのshared-memory slotを現在clipとしてWebGPU uploadしない。

217. Phase5: upload buffer checksumをcopy reportと照合する
`copyIntoUploadBuffer` のcopy reportが `checksumAlgorithm: 'crc32'` を返す場合、
renderer-owned upload bufferのCRC32をTypeScript境界でも再計算し、reportの `actualChecksum` と一致しない場合はupload不可にする。
native bridgeのreportだけを信じず、実際にWebGPUへ渡す `Uint8Array` がshared memory copy結果と一致していることを確認する。

218. Phase5: stale decode診断をclip/media id付きで伝播する
Rust backend decoded frame responseがstale `requestId` / `jobId` で拒否された場合も、
Viewport upload result、presenter diagnostics、export block messageへ対象 `clipId` / `mediaId` を残す。
copy失敗と同じ粒度で、source切替・複数動画中のstale decodeを実機ログから追えるようにする。

219. Phase5: decoded frame identityを必須にする
`isRustBackendDecodedVideoFrameAvailable` は、verified frameとして扱う前に `jobId` / `requestId` / `frameIndex` のidentityを検証する。
空の `jobId`、欠落した `requestId`、非整数frame identityを拒否し、slot releaseやstale判定の前提が崩れたresponseを
shared memory copy / WebGPU uploadへ進ませない。

220. Phase5: native render sourceのstale job idを拒否する
`prepareSharedRendererViewportNativeRenderSources` でも、decoded frame responseの `jobId` が要求jobと一致しない場合は
native render sourceとして採用しない。
stale frameは返却response側の `jobId` / `slotIndex` / `generation` で `rendererUploadAborted` releaseし、
別jobのshared frame descriptorがRust native render入力へ混入しないようにする。

221. Phase5: multi-video stale時にprepared native render sourceをabort releaseする
複数動画のnative render source準備中に、後続video decode responseがstaleになった場合、
既にpreparedになった先行video sourceのdecoded slotも `rendererUploadAborted` としてreleaseする。
stale frame自身のreleaseだけでなく、途中成功したsourceのslot leakを防ぎ、Rust decode ring bufferを詰まらせない。

222. Phase5: native render sourceのstale診断へclip/media idを含める
`prepareSharedRendererViewportNativeRenderSources` のstale decode detailは、対象decode requestの `clipId` / `mediaId` を含める。
native render source準備失敗のdetailはpreview/export側へ流れるため、source切替・複数動画中のstale decodeを
`clip=... media=...` 付きで追跡できるようにする。

223. Phase5: prepared native render source abort release失敗を分離する
multi-video native render source準備中のstale検出では、stale frame自身のrelease失敗と、
既にpreparedになった先行sourceのabort release失敗を別reasonで返す。
これにより、返却stale slotの後始末失敗か、途中成功sourceのslot leak防止失敗かを診断上で切り分けられる。

224. Phase5: preview native render uploadでprepared source abort診断を保持する
`prepareSharedRendererViewportNativeRenderUpload` は、native render source準備が
`preparedNativeRenderSourceAbortReleaseFailed` を返した場合、`nativeRenderSourcesUnavailable` に丸めず同じreasonで返す。
preview presenter側で、途中成功sourceのabort release失敗をsource準備一般失敗と区別できるようにする。

225. Phase5: export frame sourceでprepared source abort診断を保持する
`createSharedRendererExportFrameSource` は、native render source準備が
`preparedNativeRenderSourceAbortReleaseFailed` を返した場合、`nativeRenderFailed` に丸めず同じblock reasonとdataset reasonを残す。
動画exportのRust必須経路で、slot leak防止失敗をnative render bridge失敗と区別できるようにする。

226. Phase5: presenter diagnosticsにprepared source abort診断labelを追加する
`writeSharedRendererPresenterDiagnostics` は `preparedNativeRenderSourceAbortReleaseFailed` を
読みやすい `prepared native render source abort release failed` labelとしてdatasetへ出す。
preview/exportから伝播したslot leak防止失敗を、camelCaseではなく実機ログで読める文言にする。

227. Phase5: prepared source abort失敗ではlegacy fallbackを禁止する
export native render source準備で `preparedNativeRenderSourceAbortReleaseFailed` が発生した場合、
`SharedRendererExportFrameSourceBlockedError` の `legacyCanvasFallbackAllowed` を `false` にする。
Rust decoded slot leak防止に失敗した状態で、legacy canvas/Pixi captureへ戻って成功扱いにしない。

228. Phase5: native render失敗ではRust必須時のlegacy fallbackを禁止する
動画を含むencode frame、または `bitmapCaptureEnabled=false` / `nativeRenderRequired=true` のRust native render必須経路では、
`nativeRenderFailed` の `SharedRendererExportFrameSourceBlockedError` も `legacyCanvasFallbackAllowed=false` にする。
Rust native render bridge失敗をPixi/legacy captureで隠さず、動画exportをfail-loudに止める。

229. Phase5: native render release失敗ではlegacy fallbackを禁止する
`nativeRenderSourceReleaseFailed` / `nativeRenderOutputReleaseFailed` のexport blockは、常に
`legacyCanvasFallbackAllowed=false` にする。
Rust decoded sourceやnative render outputの所有権解放に失敗した状態を、legacy canvas/Pixi captureで成功扱いにしない。

230. Phase5: native render source release callback欠落ではlegacy fallbackを禁止する
`nativeRenderSourceReleaseUnavailable` のexport blockも `legacyCanvasFallbackAllowed=false` にする。
decoded sourceのrelease callbackが欠けている状態ではRust側slot所有権を閉じられないため、legacy canvas/Pixi captureへ戻らずfail-loudに止める。

231. Phase5: unsupported native mediaではRust必須時のlegacy fallbackを禁止する
動画を含むmixed native render、または `nativeRenderRequired=true` / `bitmapCaptureEnabled=false` のmedia-only native renderで
`nativeRenderUnsupportedMedia` が発生した場合、`legacyCanvasFallbackAllowed=false` にする。
Rust必須exportで未対応mediaをPixi/legacy captureに退避させず、未対応範囲を明示的に止める。

232. Phase5: native renderer未接続ではRust必須時のlegacy fallbackを禁止する
動画encode frame、または `bitmapCaptureEnabled=false` / `nativeRenderRequired=true` のencode-only frameで
Rust native renderer bridgeが未接続の場合、`nativeRenderUnavailable` を `legacyCanvasFallbackAllowed=false` で返す。
native renderer未接続をPixi/legacy captureへ退避させず、Rust必須exportとして明示的に停止する。

233. Phase5: presented shared-frame handoffではlegacy fallbackを禁止する
Rust direct encode用のpresented shared-frame handoffが不可または失敗した場合、
`presentedSharedFrameHandoffUnavailable` / `presentedSharedFrameHandoffFailed` を `legacyCanvasFallbackAllowed=false` で返す。
presenterからencode用shared frameを受け取れない状態を、Pixi/legacy captureで成功扱いにしない。

234. Phase5: video upload/ownership失敗ではlegacy fallbackを禁止する
Rust video upload失敗、stale decode response、Pixi ownership残留、uploaded clip欠落で
`videoUploadFailed` / `videoOwnershipUnavailable` が発生した場合、`legacyCanvasFallbackAllowed=false` で返す。
Rust decode/upload/ownership cutoverが成立していない動画exportを、Pixi/legacy captureで成功扱いにしない。

235. Phase5: native render source準備失敗ではRust必須時のlegacy fallbackを禁止する
`prepareNativeRenderSources` がstale decode responseなどで失敗し `nativeRenderFailed` に丸められる場合も、
動画encode frameや `nativeRenderRequired=true` のRust/native render必須経路では `legacyCanvasFallbackAllowed=false` で返す。
Rust decode/source準備が成立しない状態を、Pixi/legacy captureで成功扱いにしない。

236. Phase5: blocked errorのlegacy fallbackを明示opt-inにする
`SharedRendererExportFrameSourceBlockedError` は既定で `legacyCanvasFallbackAllowed=false` とし、
互換fallbackとして残す場合だけ呼び出し側で `true` を明示する。
新しいRust export block reason追加時の指定漏れで、Pixi/legacy captureへ戻る事故を防ぐ。

237. Phase5: Rust video-onlyをexport cutover gateへ接続する
ViewportのRust export frame source生成では、`videoCutoverEnabled` を
`sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled` として渡す。
Rust video-only起動時に、previewだけでなくexportもRust video cutover必須の配線に揃える。

238. Phase5: Rust必須preview失敗をblocked診断にする
`requiredVideoOwnershipUnavailable` / `requiredRustVideoControlPlaneUnavailable` は
presenter datasetへ `uxfdSharedRendererPresenterStatus=blocked` として出す。
通常のPixi互換fallbackとRust必須failureを診断上で分離し、Rust-only検証でPixi退避に見えないようにする。

239. Phase5: 動画Rust export preflight失敗をblocked診断にする
動画を含むRust export preflightで `exportSessionBlocked` が発生した場合、
frame source diagnosticsへ `uxfdRustExportFrameSourceStatus=blocked` を出す。
非動画互換exportのclosed gateは `fallback` のまま維持し、Rust必須failureとlegacy fallbackを診断上で分離する。

240. Phase5: 動画Rust blocked診断のfallback表示を不可へ正規化する
`videoOwnershipUnavailable` / `videoUploadFailed` は、古いpayloadが `legacyCanvasFallbackAllowed=true` を持つ場合でも
UI summaryとDevTools logではlegacy fallback不可として扱う。
Rust動画必須blockedが、表示上だけlegacy fallback可能に見えるズレを防ぐ。

241. Phase5: 動画Rust blocked診断をprogress保存時に正規化する
`setExportProgress` / `updateExportProgressPhase` は、`videoOwnershipUnavailable` / `videoUploadFailed` の
`rustFrameSourceBlocked` を保存時にも `legacyCanvasFallbackAllowed=false` へ正規化する。
UI/ログだけでなく、保持payload自体もRust動画必須blockedの意味に揃える。

242. Phase5: shared renderer実出力必須時のPixi passthroughをblocked診断にする
`requireSharedRendererOutput` が有効で、native render frameもuploaded video frameもなくPixi passthroughしか残らない場合、
presenter diagnosticsの `sharedRendererOutputUnavailable` を `blocked` として出す。
実出力必須のpreview検証で、Pixi passthroughを互換fallbackとして成功寄りに見せない。

243. Phase5: 実出力必須blocked診断にnative render upload失敗を保持する
`requireSharedRendererOutput` が有効でnative render frame uploadが失敗した場合、
`sharedRendererOutputUnavailable` のblocked diagnosticsへ `nativeRenderFailureReason` / `nativeRenderFailureDetail` を残す。
Pixi passthroughへ戻れない検証で、Rust/native render upload失敗の根本原因を失わない。

244. Phase5: export実出力blocked詳細を保持する
export direct encodeでpresenterが `sharedRendererOutputUnavailable` を返した場合、
`presentedSharedFrameHandoffUnavailable` に丸めず、同じreasonでexport blocked errorへ伝搬する。
`nativeRenderUploadResult` が失敗している場合は、その理由と詳細をblocked error messageへ含める。

245. Phase5: 実出力不可時のbitmap legacy captureを禁止する
bitmap export pathでpresenterが `sharedRendererOutputUnavailable` を返した場合、
`createFrameBitmap` / legacy bitmap canvas captureへ進まず、同じblocked errorとして停止する。
direct encodeとbitmap exportの両方で、実shared renderer出力がない状態を成功扱いにしない。

246. Phase5: shared renderer output blocked診断の表示ラベルを追加する
`sharedRendererOutputUnavailable` のRust frame source blocked診断は、UI summaryでraw reasonを出さず、
日本語では `shared renderer実出力なし`、英語では `shared renderer output unavailable` と表示する。
export実出力不可のblocked診断を、実機UIで原因追跡しやすい文言にする。

247. Phase5: 実出力必須時のSolidColour presentation失敗をblocked診断にする
`requireSharedRendererOutput` が有効なpreview presenterでは、SolidColour scene presentation失敗を
`fallback` ではなく `blocked` として出す。
通常previewの互換fallbackは維持しつつ、実shared renderer出力必須の検証でPixi退避に見えないようにする。

248. Phase5: 実出力必須時のvideo presentation失敗をblocked診断にする
`requireSharedRendererOutput` が有効なpreview presenterでは、Rust decoded video frame upload後の
video frame scene presentation失敗を `fallback` ではなく `blocked` として出す。
通常previewの互換fallbackは維持しつつ、実shared renderer出力必須の検証でPixi退避に見えないようにする。

249. Phase5: WebGPU draw不可時のbitmap legacy captureを禁止する
export bitmap pathでpresenterが `webGpuDrawUnavailable` を返した場合、
`createFrameBitmap` / legacy bitmap canvas captureへ進まず、同じblocked errorとして停止する。
実shared renderer出力のWebGPU drawが成立しない状態を、Pixi/legacy captureで成功扱いにしない。

250. Phase5: WebGPU draw不可blocked診断の表示ラベルを追加する
`webGpuDrawUnavailable` のRust frame source blocked診断は、UI summaryでraw reasonを出さず、
日本語では `WebGPU描画不可`、英語では `WebGPU draw unavailable` と表示する。
WebGPU draw不可でRust/shared renderer実出力が止まった原因を、実機UIで追いやすい文言にする。

251. Phase5: 実出力必須時のnative render presentation失敗をblocked診断にする
`requireSharedRendererOutput` が有効なpreview presenterでは、native render frame presentation失敗を
`fallback` ではなく `blocked` として出す。
Rust/native renderで合成済みフレームを受け取った後のWebGPU texture view失敗を、Pixi退避に見えないようにする。

252. Phase5: native render texture view失敗をexport blockedに伝搬する
exportのbitmap path/direct encode pathでは、presenter controlの `nativeRenderTextureViewUnavailable` を
`presentedSharedFrameHandoffUnavailable` へ丸めず、同じreasonのblocked errorとして扱う。
Rust/native render frameのWebGPU texture view欠落を、legacy bitmap captureで成功扱いにしない。

253. Phase5: native render texture view blocked診断の表示ラベルを追加する
`nativeRenderTextureViewUnavailable` のRust frame source blocked診断は、UI summaryでraw reasonを出さず、
日本語では `native render texture viewなし`、英語では `native render texture view unavailable` と表示する。
native render texture view欠落でRust/shared renderer実出力が止まった原因を、実機UIで追いやすい文言にする。

254. Phase5: 実出力必須時のImage/PSD Pixi所有をblocked診断にする
`requireSharedRendererOutput` が有効なpreview presenterでは、Image/PSD ownershipがPixiに残る場合に
diagnostic swatchで `ready` にせず、`sharedRendererOutputUnavailable` の `blocked` として出す。
blocked診断にはImage/PSD owner、cutover reason、shared object countを残し、native render未到達の原因を追えるようにする。

255. Phase5: Image/PSD ownership診断をexport blocked detailに保持する
export frame sourceは、preview presenterがdatasetへ残したImage/PSD ownerとcutover reasonを
`sharedRendererOutputUnavailable` のblocked detailにも付加する。
previewで検出したPixi ownership残留理由を、export progress/log側でも追えるようにする。

256. Phase5: blocked error単位のlegacy fallback禁止をruntimeで優先する
非動画exportで計画上はlegacy canvas fallback可能でも、`SharedRendererExportFrameSourceBlockedError` が
`legacyCanvasFallbackAllowed=false` を持つ場合はfallbackせずfail-loudにする。
Image/PSD ownership残留や実shared renderer出力不可のblocked errorを、runtime planの互換fallbackで成功扱いにしない。

257. Phase5: Image/PSD exportをRust frame source必須条件に追加する
export frame source policy/contextに `hasNativeRenderMediaObjects` を追加し、Image/PSDを含むexportは
WebCodecs互換encoderでもRust frame source必須・blocked時failとして扱う。
計画段階からImage/PSDをPixi/legacy canvas exportへ戻さず、Rust/native render mediaとして扱う。

258. Phase5: Image/PSD Rust frame source不在detailを明示する
`hasNativeRenderMediaObjects` が有効なexport planでRust frame sourceが不在の場合、plan failure detailを
汎用のRust-only文言ではなく `Image/PSD export requires...` として出す。
Image/PSD由来のnative render必須失敗を、export progress/logで追いやすくする。

259. Phase5: native render media preflight失敗をblocked診断にする
Viewport Rust export source生成では、`hasNativeRenderMediaObjects` が有効なpreflight失敗を
legacy fallbackではなく `blocked` 診断として出す。
Image/PSDなどnative render mediaのexport source不成立を、動画と同じfail-loud系の診断へ揃える。

260. Phase5: Rust frame source plan failure表示ラベルを追加する
export progress summaryでは、`rustFrameSourceRequired` をraw reasonのまま出さず、
日本語では `Rust frame source必須`、英語では `Rust frame source required` と表示する。
Image/PSD exportでRust frame sourceが不在のplan failureを、実機UIで追いやすい文言にする。

261. Phase5: GeneratedGradientをRust native render mediaへ追加する
Pixi依存を削る作業は、後方互換の診断追加に偏らせず、Rustで実際に描ける表現を増やす方向を優先する。
矩形グラデーションは `GeneratedGradient` mediaとしてRust scene snapshotへ出し、Rust backendがJSON定義からRGBA source frameを生成する。
既存のnative-wgpu-rendererには生成済みsource frameとして渡し、Image/PSD/SolidColourと同じnative render経路で合成する。
これにより、単色矩形だけでなくグラデーション矩形もPixiから降ろせる候補に入れる。

262. Phase5: GeneratedGradient native render ownershipを接続する
Rust native render frameがGeneratedGradientを含む場合、preview presenterはそのshapeをshared renderer ownershipへ入れる。
Pixi側は既存のshape skip経路を使い、native render済みのグラデーション矩形を二重描画しない。
z-order safetyではGeneratedGradientをSolidColourと同じshared-renderer paint候補として扱い、前面のGeneratedGradientが背面SolidColourのcutoverを不必要に塞がないようにする。

263. Phase5: multi-video native render source途中失敗時のslot解放を保証する
複数video clipのnative render source準備中に、後続clipのdecode start / request / frame availabilityが失敗した場合でも、
先に準備済みのdecoded sourceを `rendererUploadAborted` で解放する。
Rust decode slotを保持したままPixi fallbackや次フレームへ進まないようにし、multi-video native renderの再試行性を保つ。

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
