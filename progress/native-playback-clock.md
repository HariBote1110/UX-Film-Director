# Native Playback Clock

日付: 2026-07-24

## 決定

CAMetalLayerへ直接提示できるシーンの再生時計はElectron mainが所有する。Chromium rendererは編集コマンドと低頻度のUI表示だけを担当し、60fpsの`requestAnimationFrame`、`advanceTime`、`scene.evaluate`、presentを実行しない。

mainは単調時計からフレーム番号を求め、resident sceneに対して`scene.evaluate`を呼び、結果をnative overlayへ直接渡す。評価または提示が遅れた場合は古いフレームを順番に処理せず、現在時刻に対応するフレームへ追いつく。UI時刻通知は200ms間隔とし、開始・停止・終端・失敗だけ即時通知する。

Video、PSD、音声生成物、PNG以外の画像を含むシーンは、対応するネイティブsource供給が完成するまで既存renderer時計へ戻す。途中失敗でも再生を止めずrendererへフォールバックし、失敗詳細を`data-uxfd-rust-playback-detail`へ残す。

## 境界契約

- `scene.evaluate`は既存の厳格なsnapshot契約を変更しない。
- プロジェクト解像度は評価結果トップレベルの`canvas: { width, height }`で返す。
- mainはsnake_caseのRust snapshotをN-API用camelCaseへ変換する。
- `effects`は`effectsJson`として渡し、GetColor、HKSY、SimpleTubeを含む既存Rust Effect enumを再利用する。
- 編集でrevisionが変わった場合は旧再生generationを破棄し、新revision・現在時刻から再開する。

## 実機検証

`?rustTimelineGeneratedE2e=1`でGetColor、HKSY、SimpleTubeを各12件、合計36オブジェクト配置し、5秒・60fpsを2回再生した。

- main所有の直接再生: 成功
- CAMetalLayer提示: 2回累計599フレーム成功、失敗0
- skip: 1フレーム
- renderer側`scene.evaluate`: 5回（初期化、同期、終端を含む）
- mainからrendererへのUI通知: 2回累計50回
- `top`の再生中サンプル: Electron main 0.0〜0.1%、renderer 0.0%、Rust backend 0.0%

`top`値は短時間サンプルで、GPU使用率そのものは示さない。ただし旧経路で観測したrenderer約47〜49%、main約55〜57%と比べ、Chromiumの毎フレーム処理が停止したこと、RPC診断が提示フレーム数に比例しないことは確認できた。

## Resident scene書き出し

非動画の2D native encodeは、プレビュー用に常駐している`viewport-rust-timeline`とrevisionを再利用する。Chromiumは各frameで`sessionId`、`sceneId`、`revision`、`frameIndex`だけを送る。Rust backendがprojectを評価し、参照mediaを選び、GPU合成結果をencoderへ書き込む。

36オブジェクト、1920×1080、60fps、5秒を実Electronから書き出し、次を確認した。

- 診断: `uxfdRustExportFrameSourceStatus=residentScene`
- H.264、1920×1080、60fps、300フレーム
- duration: 5.000秒
- 出力サイズ: 9,972,354 bytes
- 2.5秒フレームを抽出し、GetColor、HKSY、SimpleTubeの合成を目視確認

## Resident動画書き出し

resident scene exportが動画のdecode sessionも所有する。VideoToolboxのNV12 IOSurfaceをnative WGPU rendererへ直接渡し、この経路では共有RGBA ringを作らず、CPUの`nv12_to_rgba`とresizeを実行しない。encode終了・abort時に当該sessionのdecoderを解放する。

同じmediaを複数clipが同時参照する場合、同じsource frameなら1枚のNV12 surfaceを共有する。異なるsource frameを要求する場合は、rendererの動画texture keyをmedia idからclip idへ変更するまで明示的に拒否する。暗黙の上書きによる誤フレームは許容しない。

実ElectronでH.264動画を移動、0.8倍、12度回転し、1920×1080、60fps、1秒を書き出した。

- 診断: `uxfdRustExportFrameSourceStatus=residentScene`
- direct transcode: 未使用
- H.264、1920×1080、60フレーム、1.000秒
- 出力サイズ: 1,018,397 bytes
- 書き出し時間: 1.246秒（約48.2 frame/秒）
- 0.5秒フレームを抽出し、動画内容と移動・縮小・回転を目視確認
- Rust backend全テスト成功
- frontend 213 files / 1,531 tests成功

GPU合成結果からFFmpeg rawvideo入力へのRGBA readbackは残っている。次段階ではencoder入力をIOSurface/VideoToolboxへ接続してこのreadbackを外す。また、プレビューの動画decodeとCAMetalLayer直接提示、GeneratedAudioWaveform・Particle・SpotLightのresident scene対応も未完了である。
