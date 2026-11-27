# 音声付きIOSurface書き出しの末尾フレーム欠落

## 結論

- 根本原因は、音声ありのIOSurface書き出しだけが通る後段ffmpeg muxに渡していた`-shortest`である。`-shortest`は、`-c:v copy`との組合せでAACへの再符号化時の音声終了時刻を基準に出力を止め、映像パケットを切り捨てる。親のffmpeg単独実験では60fps・135フレーム入力が正確に133フレーム・2.216667秒へ短縮された。
- `-shortest`を除去するだけでは不十分だった。短い音声では135フレームを保持できる一方、3.0秒の音声と2.25秒の映像をmuxすると、映像は2.25秒のままコンテナ全体が3.0秒へ延長されるため、映像タイムラインを双方向で正とできない。
- `-fflags +shortest`は導入しない。インストール済みffmpegでは`Unable to parse option value shortest`としてmux自体が失敗し、利用可能な代替ではなかった。
- `PendingAudioMux`に開始時のfps（整数分母）を保持し、`encode.finish`で確定した書込みフレーム数を`finish_encode_transport`へ渡すようにした。`frame_count / fps`を浮動小数点へ変換せず整数演算で小数点以下6桁へ丸め、muxの出力側`-t`に指定する。これにより短い音声でも最後の映像フレームを保持し、長い音声は映像尺で切り詰める。フレームが0件の場合は正とする映像タイムラインが存在しないため、音声のみの出力を作らずmuxをエラーにする。
- `mux_audio_into_video_preserves_video_tail_when_audio_is_one_frame_shorter`は、60fps・135フレーム（映像2.25秒）と2.24秒の音声から映像135フレーム・映像duration 2.250000を要求する。`mux_audio_into_video_caps_longer_audio_at_video_duration`は3.0秒の音声で同じ135フレーム・映像/コンテナ2.25秒（1フレーム許容）および音声尺の上限を要求する。
- `macos-video-encode/tests/iosurface_h264.rs`も60fps・135フレームを実際にIOSurface→AVAssetWriterへ渡し、video-only出力が135フレーム・2.250000秒になることを検査するよう強化した。これにより、AVAssetWriterの完了処理が全フレームを保持することをmacOS実機で別途検証できる。

## 調査証跡

- 現在の重量E2E成果物`.codex/realistic-heavy-edit-e2e/realistic-heavy-edit-preview.mp4`は、video streamが133フレーム・2.216667秒、audio streamが2.240000秒だった。video PTSは0から2.200000まで連続しており、末尾2フレームだけが無い。
- `encode.finish`は全135回の`writeNativeFrame`成功後に`finish_encode_transport`へ入り、`VideoEncodeSession::finish()`の同期`AVAssetWriter::finishWriting()`が成功してからmuxを開始する。VideoToolboxの非同期コールバックや`VTCompressionSessionCompleteFrames`を使う実装は存在しないため、この経路で「未drainのVTCompressionSession」が直接の原因ではない。
- `ffmpeg -shortest`を単独で再現すると、60fps・135フレーム映像と2.24秒WAVから132フレームの出力になった。一方、同一入力で`-shortest`を除くと135フレーム・2.250000秒になった。ユニットテストでの実入力形式では修正前は134フレーム、修正後は135フレームとなった。切捨て数はmuxer/音声パケット境界で変動するが、末尾欠落を発生させる条件は立証済みである。
- `git blame`では`-shortest`は音声muxを導入した`098f261f`（2026-08-21）で追加された。従って今回133フレームになった追加の欠落は同コミットによる回帰である。

## 未確定事項

- 2026-07-25の記録にある134/135フレームは`098f261f`より前であり、このmux回帰では説明できない。当時のvideo-only AVAssetWriter出力またはE2Eのフレーム期待値・計測境界に、1フレーム差の別要因があった可能性は残る。履歴には当時のMP4・ffprobeパケット列がないため、根本原因は未証明である。
- 強化したmacOS実機テスト`iosurface_h264`は、親環境（sandbox外、GPU adapterあり）で成功した。60fps・135フレームをIOSurface→AVAssetWriterへ渡したvideo-only出力は135フレーム・2.250000秒であり、現行AVAssetWriter実装が全フレームを保持することは立証された。したがって今回の末尾欠落は、AVAssetWriter側ではなく後段muxの`-shortest`で生じていた。

## 検証

- 追加した長音声テストは、実装前にmux関数へ渡すフレーム数・fps引数が存在せずコンパイル失敗（Red）した。整数有理数で`-t`を渡す実装後に成功（Green）。
- `cargo test --manifest-path rust-backend/Cargo.toml encode::tests::mux_audio_into_video -- --nocapture`は4件成功した。
- `cargo test --manifest-path rust-backend/Cargo.toml`は182件成功、3件失敗だった。失敗はsandboxが`shm_open(create)`を拒否する2件と、VideoToolbox/AVAssetWriter開始が`StartFailed("The operation could not be completed")`となる既存のmacOS実機muxテスト1件であり、今回のmux論理テストは成功した。
- `cargo test --manifest-path macos-video-encode/Cargo.toml --test iosurface_h264 -- --nocapture`は、ワーカーのsandboxではGPU adapterが利用できず実機本体をskipした。親環境（sandbox外）で再実行し、skipせず成功した（135フレーム・2.250000秒）。
- 親環境で`-t`修正後にrust-backendの`cargo test`を全件実行し、失敗0件だった（185 passed ほか）。
- 親環境でrealistic heavy-edit E2E（export有効）を実行し、**総合PASS**した。書き出しは約37.1秒、最終MP4はvideo 135フレーム・2.250000秒、audio（AAC）2.240000秒、コンテナ2.250000秒で、期待値135フレームと一致した。roundTrip・画面検査・最終snapshotも成功し、実行時エラーは0件。
