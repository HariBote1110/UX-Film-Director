# resident export の audio waveform MissingSource

## 結論

- 根本原因は**コード経路と発生したエラーから立証済み**である。`encode.writeResidentSceneFrame` は常駐sceneを評価して `media` を作るが、`GeneratedAudioWaveform` と `GeneratedAudioSphere` は `source_frames.rs` がCPU RGBA sourceから意図的に除外する。通常export/previewは別途PCMを `audioWaveforms` として渡すが、resident export はそれを渡さないため、native-wgpu-renderer が `MissingSource { media_id }` を返す。
- 実アプリでの修正後Electron E2Eは、このsandboxでは実行できないため**未検証**である。従って「修正後に実機exportが成功した」ことは未証明である。

## 根拠

- 現在の `src/components/Viewport.tsx` は `createResidentSceneExportFrameSource` を `sceneId` と `revision` のみで作る。`residentSceneExportFrameSource.ts` が持つ `prepareDynamicSources` / `audioWaveforms` の拡張点は呼び出されない。
- 通常exportは `sharedRendererExportFrameSource.ts` で `prepareNativeRenderAudioWaveforms` を呼び、`GeneratedAudioWaveform` / `GeneratedAudioSphere` のsource frame時刻に対応するPCMを `audioWaveforms` に入れる。previewの `sharedRendererViewportNativeRenderUpload.ts` も同じ関数を使う。
- resident RPCは、従来 `sources` が無いときだけ空配列を挿入し、`audioWaveforms` は挿入していなかった。直後の `handle_encode_write_native_frame` は空のaudio入力のままrendererを呼ぶ。
- `native-wgpu-renderer/src/lib.rs` はaudio-reactive mediaを `audioWaveforms` から分離して描画するため、該当入力が無いと提示された `MissingSource { media_id: "realistic-main-audio-waveform" }` になる。

## 履歴調査

- `git log -S` / `git blame` では、resident export と `ResidentSceneExportDynamicSources` は `f22a990e`（2026-07-24）で同時に導入された。しかし`Viewport`は導入時から `prepareDynamicSources` を渡していない。
- 通常のnative exportへwaveform PCMを接続した履歴は `22ed8f98`（2026-06-21）にある。resident exportへ同等の供給を追加または削除した履歴は見つからなかった。
- 重量シナリオの `realistic-main-audio-waveform` は `4856d133`（2026-07-24 22:28）で追加され、動画ありresident exportの選択制限は `5a26c13c`（同日）で解除された。`progress/realistic-heavy-edit-verification.md` にはresident移行後のexport PASSがあるが、選択されたframe sourceまたはRPC payloadは保存されていない。このため、resident exportがaudio waveformを実際に通過していたかは**未証明**である。少なくとも現在の失敗は、今回の経路が初めてその未配線を実行した、または以前の記録が経路を捕捉していなかったことと整合する。よって、既知の回帰ではなく**導入時からの潜在欠落である可能性が高い**（この分類自体は履歴証跡不足のため仮説）。

## 修正

- `native_render.rs` のresident RPCが評価済みsnapshotと対象mediaから、audio waveform / audio sphereごとのPCM要求を組み立てる。
- source frameを60fps基準の開始秒へ変換し、通常preview/exportと同じ8kHz・window長で既存FFmpeg PCM取得処理を使う。
- 取得したPCMを `audioWaveforms` としてnative encode payloadへ必ず入れる。FFmpeg・メタデータ・同一mediaの複数source frameの不整合は明示エラーとし、描画対象を黙って除外しない。
- `resident_scene_collects_pcm_requests_for_waveform_and_sphere_media` をRust unit testとして追加し、waveformとsphere双方のmedia ID、開始秒、window長を固定した。

## 検証

- `cargo test --manifest-path rust-backend/Cargo.toml`: 180 passed、2 ignored、3 failed。失敗はsandboxの `shm_open(create): Operation not permitted` が2件、および `Failed to start IOSurface VideoToolbox encoder` が1件で、変更箇所と無関係な環境制約。
- `npx tsc --noEmit`: 成功。
- `npx vitest run src/utils/residentSceneExportBoundary.test.ts src/utils/sharedRendererViewportNativeRenderUpload.test.ts`: 31 passed。
- Electronは実行不可のため、実アプリexportの再確認は未実施。
