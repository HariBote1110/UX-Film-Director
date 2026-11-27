# Phase 4a: macOS 動画デコードコア（`macos-video-decode`）

## 決定

### AVAssetReader ベース（vs 生 VTDecompressionSession）

`AVAssetReader` + `AVAssetReaderTrackOutput` を採用した。理由：

- デマックス（`AVURLAsset`/`AVAssetTrack`）とデコード（VideoToolbox）が一つの
  API に統合されており、NALU 分解・パラメータセット管理・タイムスタンプ復元
  などを自前実装する必要がない。
- `AVAssetReaderTrackOutput` の `outputSettings` に
  `kCVPixelBufferPixelFormatTypeKey`（NV12 系）+
  `kCVPixelBufferIOSurfacePropertiesKey` を指定するだけで、対応コーデック・
  フォーマットなら自動的に VideoToolbox のハードウェアデコードに落ちる
  （生 `VTDecompressionSession` を直接叩く場合と比べてコード量が大幅に少ない）。
- 生 `VTDecompressionSession` は非同期コールバックベースで、フレーム順序制御
  や再構成が煩雑。`AVAssetReaderTrackOutput.copyNextSampleBuffer()` は同期・
  逐次で、`next_frame()` の設計（1呼び出し=1フレーム）と自然に一致する。

却下理由：生 VTDecompressionSession は "resident decoder thread" 化する
Phase 4c で必要になれば改めて検討するが、4a の時点では demux+decode 統合の
利点がコールバック制御の複雑さを上回ると判断した。

### seek はリーダー再生成（forward-only の制約を逆手に取る）

`AVAssetReader` は forward-only（`timeRange` は開始後に変更不可）。
`seek(target_seconds)` は新しい `AVAssetReader`/`AVAssetReaderTrackOutput` を
`timeRange.start = target_seconds` で作り直す実装にした。

- `AVURLAsset`/`AVAssetTrack` は使い回すため、`ffprobe`/`ffmpeg` の再起動
  （150〜400ms、`markdown/Rust_Preview_Jank_Handoff.md` 参照）のようなコール
  ドスタートは発生しない。
- AVFoundation は内部で「target 直前の sync sample から実デコードを開始し、
  target 未満のフレームは出力側に見せない」という挙動をする（Apple のドキュ
  メントに明記はないが広く知られた実装挙動で、`tests/seek.rs` で実測検証
  済み）。よって `seek()` 側で「直前の sync sample を探す」ロジックを自前実装
  する必要がない。
- **契約**：`seek(target)` 後の最初の `next_frame()` は
  `pts >= target`（"at-or-after"）を返す。"nearest"（target 未満のフレームを
  返す可能性がある）ではない。`tests/seek.rs` で前方 seek・後方 seek 双方を
  検証。

### 出力ピクセルフォーマットはソースの `FullRangeVideo` タグから決定

`CMFormatDescriptionGetExtension(kCMFormatDescriptionExtension_FullRangeVideo)`
を読み、真なら `kCVPixelFormatType_420YpCbCr8BiPlanarFullRange`、それ以外
（false・タグなし）なら `...VideoRange` を要求する。タグ無しは「tv（limited）
扱い」にフォールバックする方針は `rust-backend/src/decode.rs` の
`probe_video_input_metadata` の規約（unknown/空/tv → tv）と揃えてある。

デコード後は実際に返ってきた `CVPixelBufferGetPixelFormatType()` を
`DecodedVideoFrame.colour.range` の正とする（要求と結果を突き合わせる形にして
おき、要求だけを信じない）。

### 色行列（BT.601/709/2020）はフレーム attachment 優先、無ければ次元フォールバック

`CVBufferGetAttachment`(→ `CVBuffer::attachment`) で
`kCVImageBufferYCbCrMatrixKey` を読み、`ITU_R_709_2`/`ITU_R_601_4` の既知定数
と `CFEqual` 相当の比較（`CFString` の `PartialEq`）で判定。BT.2020 やタグ無し
の場合は `ColourMatrix::fallback_for_dimensions`（長辺 ≥1280px → BT.709、
それ未満 → BT.601）にフォールバックする。これも
`rust-backend/src/decode.rs`/ffmpeg の慣例と揃えた。

### CF/NS 相互変換は `cast_unchecked` 経由（NSString/NSNumber を都度作らない）

`AVAssetReaderTrackOutput` の `outputSettings` は
`NSDictionary<NSString, AnyObject>` を要求するが、値は CoreVideo の
`&'static CFString` 定数（`kCVPixelBufferPixelFormatTypeKey` 等）由来。
`CFString`/`NSString`・`CFDictionary`/`NSDictionary`・`CFType`/`AnyObject` は
すべて toll-free bridge（ABI 同一）なので、`objc2-core-foundation` が提供する
`AsRef<NSDictionary<K,V>> for CFDictionary<K,V>` と
`NSDictionary::cast_unchecked::<NewK,NewV>()` を組み合わせ、CF 側だけで
辞書を組み立てて最後に1回だけ参照キャストする設計にした。`NSString::from_str`
でキー文字列をコピーして作り直す方式（内容が同じなら `-isEqual:` で通る）も
検討したが、余計なアロケーションと保守コストがあるため不採用。

## 却下案

- **HEVC fixture を all-intra（`keyint=1`）にする案**：H.264 側で
  frame-exact な sync sample が得られて都合が良いため当初 HEVC にも適用したが、
  x265 は all-intra ストリームを HEVC の "Range Extensions"（Rext）プロファイル
  としてタグ付けする既知の癖があり、VideoToolbox は Rext のハードウェアデコー
  ダを持たないため `AVAssetReader.startReading()` が
  `"Cannot Decode"`（`AVFoundationErrorDomain` code -11833、根本原因は
  `VTCouldNotFindVideoDecoderErr` / OSStatus -12906）で失敗する。
  `keyint=15`（0.5秒 GOP）に変更して回避した
  （`macos-video-decode/tests/common/mod.rs` にコメントで記録）。
- **CMFormatDescription の拡張値を NSArray 経由で読む際、NSNumber/NSString を
  都度手動生成する案**：`Retained::cast_unchecked`/`CFRetained::downcast` で
  十分安全かつ簡潔なため不採用。

## 制約

### この開発環境（サンドボックス）では HEVC のピクセルデコードが失敗する

`AVAssetReaderTrackOutput` に何らかの `outputSettings`（NV12 Video/Full
range、IOSurface あり/なし、いずれの組み合わせでも）を指定して
`startReading()` すると、Main プロファイルの素直な HEVC ファイルでも
`VTCouldNotFindVideoDecoderErr`（OSStatus -12906）で失敗する。`outputSettings`
を `nil`（圧縮サンプルのままの pass-through）にすると成功する。

このマシン自体（Apple M4 / Mac16,10）は HEVC ハードウェアデコードをネイティブ
サポートしており、`sysctl security.mac.sandbox.*` が有効値を返すことから、
この開発 CLI プロセスに掛かっている macOS サンドボックスが VideoToolbox の
デコーダルックアップに使う XPC サービスへのアクセスを塞いでいるとみられる
（H.264 は同じコードパスで問題なく動作するため、HEVC 固有のデコーダ解決だけが
影響を受けている）。

このクレートのロジック自体は H.264 で完全に検証済み（open/次フレーム逐次
デコード/CPU 読み戻し/seek すべて green）であり、HEVC 側もデマックス・
メタデータ取得（duration/fps/dimensions/codec）・圧縮サンプル読み出しまでは
正常に動作する。ピクセルデコード開始のみが本サンドボックス制約で失敗する。
`tests/common/mod.rs::is_environment_hevc_pixel_decode_unavailable` でこの
既知エラー（"decoder required for this media cannot be found" /
"-12906"）を検出し、該当テストのみ明示的に skip する（他のエラーは通常どおり
fail する）。**サンドボックス外（通常のユーザーセッション／実アプリ内）で
再実行し、HEVC のハードウェアデコードが実際に完走することを確認するのは
Phase 4c 統合時の残タスク。**

### `next_frame()`/`seek()` は forward-only

`AVAssetReader` の性質上、`seek()` を呼ぶたびに内部で新しい
`AVAssetReader`/`AVAssetReaderTrackOutput` を作り直す。頻繁な後方 seek は
毎回「直前の sync sample から再デマックス」になるためコストがゼロではない
（が、サブプロセスは介さないため ffmpeg 再起動よりは大幅に軽い）。

### `Send` であって `Sync` ではない

`VideoDecodeSession`・`DecodedVideoFrame` はいずれも `unsafe impl Send` の
みで `Sync` は実装していない。

- AVFoundation/CoreMedia/CoreVideo のオブジェクトはいずれも Cocoa/CF の
  アトミック参照カウントを使うため、生成したスレッドと異なるスレッドで
  drop/retain すること自体は安全（`Send` の根拠）。
- `AVAssetReader` は「複数スレッドから同時に使ってはいけない」という制約が
  Apple のドキュメントにあり、`CVPixelBufferLockBaseAddress` も内部の seed
  管理が並行アクセス安全と明記されていない。両者ともメソッドはすべて
  `&mut self`（`VideoDecodeSession`）または一度だけロック/アンロックする
  形（`DecodedVideoFrame::read_nv12`）にしてあるため、Rust の借用検査だけで
  「一度に1スレッドしか触らない」を強制できる。これは Phase 4c で想定される
  「専用デコーダスレッドへ1回だけ移動し、以後はそのスレッドからのみ使う」
  という利用形態とちょうど一致する。

### `open()` はサブプロセスを起動しない

`AVURLAsset`/`AVAssetTrack`/`AVAssetReader` はすべてプロセス内 API であり、
`ffprobe`/`ffmpeg` のような外部プロセスは一切起動しない。フィクスチャ生成
（`tests/common/mod.rs`）のみテスト実行時に `ffmpeg` CLI を使うが、これは
本体コードではなくテストの都合であり、`ffmpeg` が `PATH` に無い環境では
明確なメッセージでテストを skip する。

### objc2 系クレートのバージョン

`objc2 0.6.4` / `objc2-foundation 0.3.2` / `objc2-core-foundation 0.3.2` /
`objc2-core-media 0.3.2`（`objc2-core-media` feature 追加） /
`objc2-core-video 0.3.2`（`objc2-io-surface` feature 追加） /
`objc2-av-foundation 0.3.2`（デフォルト機能に `AVAssetReader` 系は含まれるが
`CMTime` 等を扱うメソッドは `objc2-core-media` feature を明示しないと
コンパイルされないので注意）。`dispatch2`/`block2` はこのフェーズでは
未使用（同期 API のみで足りたため導入しなかった）。
