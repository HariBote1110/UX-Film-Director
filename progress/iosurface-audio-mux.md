# IOSurface VideoToolboxエクスポートの音声mux対応

## Decision
- `rust-backend/src/encode.rs`の`start_encode_transport`は、`iosurfaceEncode`かつ`audioPath`が指定されている場合に、最終出力パスの隣に一時映像専用ファイル（`<final>.uxfd-video-tmp.mp4`）を作り、VideoToolboxエンコーダをそこへ書き込む。`EncodeTransport::VideoToolbox`にオプションの`PendingAudioMux { temp_video_path, audio_path, final_path }`を持たせてセッション状態として保持する。
- `finish_encode_transport`は`encoder.finish()`成功後、mux待ちがあれば`mux_audio_into_video()`でffmpegを起動し`-c:v copy -c:a aac -shortest`で音声を合成、成功したら一時映像ファイルを削除する。ステータス文字列は音声ありの場合`"iosurfaceVideoToolboxAudioMux"`、なしの場合は従来どおり`"iosurfaceVideoToolbox"`を返す。
- フロントエンドの`src/hooks/useProjectExport.ts`から`iosurfaceEncode`ゲートの`audioPath === null`条件を削除し、音声ありプロジェクトでもIOSurface経路（〜135fps）を使えるようにした。従来は音声があると自動的に遅いffmpeg raw-RGBA経路（〜51fps）へフォールバックしていた。
- これにより、音声つきプロジェクトの書き出し速度が大幅に改善される見込み（`encode_research`系の既存計測を参照）。

## Alternatives considered
- **AVAssetWriterに音声トラックを直接追加する案**: VideoToolboxエンコーダ自体（`macos-video-encode`クレート）を拡張してCMSampleBufferで音声も書き込む方式。より「正攻法」だが、WAVデコード・タイムスタンプ同期・AVAssetWriterの複数入力管理など変更範囲が大きく、既存のシンプルな単一トラックwriterの構造を大きく崩す。今回は変更を最小化するため、既存の`start_encode_ffmpeg`が持つffmpeg音声muxパターンを踏襲し、VideoToolboxで映像だけ書いてffmpegの後段stream copy muxに任せる方式を採用した。

## Constraints / Gotchas
- 一時ファイル名は`derive_pending_mux_temp_video_path()`で最終パスから決定的に導出される（`<final>.uxfd-video-tmp.mp4`）。セッション開始時に同名の残骸ファイルがあれば削除してから使う（クラッシュ・異常終了後の再実行を想定）。
- `abort_encode_transport`でも、mux待ちが設定されていれば一時映像ファイルをベストエフォートで削除する。
- mux失敗時も一時ファイルはベストエフォートで削除される（`finish_encode_transport`内で`mux_audio_into_video`の結果に関わらず`remove_file`を試みる）。
- `mux_audio_into_video`は`UXFD_FFMPEG_BIN`環境変数（未設定時は`ffmpeg`）を使う。`start_encode_ffmpeg`と同じ解決方法。
- テストは`rust-backend/src/encode.rs`の`#[cfg(test)]`モジュールに追加。ffmpeg未インストール環境ではmux関連テストは`eprintln`で理由を出してスキップする（既存の`write_tight_rgba_frame_to_encoder`系テストと異なり、この機能はffmpeg起動が本質のため完全スキップが必要）。
- macOS実機でのIOSurface + 音声のフルエンドツーエンドテスト（`iosurface_transport_with_audio_path_mux_es_into_final_file`）は`#[cfg(target_os = "macos")]`限定。CI等の非macOS環境ではコンパイルされない。
