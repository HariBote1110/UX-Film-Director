# NV12リングの満杯停止によるエクスポート退行

## 調査結果

- realistic heavy-edit E2E は、`EXPORT_FRAME_WAIT_TIMEOUT` の約15秒後に `in-process decoder ring has no frame available yet` で失敗する。
- 前回の仮説（`should_seek` が、要求PTSより最大100ms先に着地した正常フレームを後退と誤認して同じseekを繰り返す）は、100msの着地許容（`BACKWARD_SEEK_LANDING_TOLERANCE_SECONDS = 0.1`）を入れた状態で実Electron E2Eを再実行しても同じエラー・同じ約15.5秒で失敗したため、今回の失敗原因としては反証された。この変更と着地許容テストは取り消し、`BACKWARD_SEEK_EPSILON_SECONDS = 1e-6` に戻した。
- `export_sequential_requests_stay_within_one_frame_of_target` は、119.88fpsのHEVC 4K原本とH.264 720p proxyの双方で、0秒から1/60秒刻みの要求を実ファイルに対して実行すると成功した。したがって、VideoToolboxデコーダ自体や通常の先頭からの連続要求は主因ではない。
- `request_nv12_frame_with` は初回に一度だけ `trim_consumed_frames` を呼ぶ。workerはリング長が `PREFETCH_RING_DEPTH`（12）以上になると、最新PTSが要求PTSに追いついたかを確認せず待機する。
- 実際のE2Eでは、harnessの編集操作が`realistic-main-video-a`の`offset`を0.25秒ずらすため、書き出し用に新しく開いたdecoderへの最初の要求が0.25秒になる（119.88fpsの12フレームは約0.1秒分しかない）。新しいdecoderの最初の要求がこのように先の時刻で、リングが0秒付近から12フレームまで埋まる場合、`should_seek` は前方差が2秒未満なのでfalseになる。trim後にworkerが12フレームまで再充填しても、最新PTSは要求より古いままで、exact判定は`None`、workerはcondvar待機となり、呼び出し側だけが15秒でタイムアウトする。previewは`nearest_frame`のhold-last-frame契約により、この状態でも古いフレームを即時返すため、同じ停止を表面化させない。

## 修正

- workerの満杯待機判定を純粋関数`should_worker_wait_for_full_ring`へ抽出した。
- リングが満杯でも、最新フレームのPTSが`target_pts_seconds`未満ならdecoderを止めず、次フレームのdecodeを継続する。最新PTSが要求へ到達した場合だけ従来どおりcondvarで待機する。
- preview側の`nearest_frame`と、`request_nv12_frame`のhold-last-frame挙動は変更していない。
- `UXFD_REPRO_VIDEO`を使うignored実ファイルテストを追加し、新しいdecoderで0.5秒から開始し、約0.3秒先へジャンプするexact要求が1フレーム以内かつ2秒未満で返ることを検証する。

## 検証

- 満杯リング・最新PTS不足を直接表す単体テストを追加した。これはVideoToolboxを使わない純粋判定テストで、修正前の判定では失敗し、修正後は成功する設計である。
- 親環境（sandbox外のmacOS）での確認結果:
  - ignored実ファイルテスト`export_sequential_requests_stay_within_one_frame_of_target`と`export_fresh_decoder_starts_midstream_without_ring_stall`は、HEVC 4K原本（8.9秒）とH.264 720p proxy（1.1秒）の双方で成功した。
  - rust-backendの`cargo test`は全件成功した（182 passed、2 ignored ほか）。
  - realistic heavy-edit E2E（export有効）は、修正前は約15.5秒でこのリング停止により失敗していたが、修正後は約1.5秒でリング停止を通過した。ただし次の段で`Native WebGPU IOSurface render failed: MissingSource { media_id: "realistic-main-audio-waveform" }`という別原因で失敗しており、export全体の成功は未確認である（別件として調査する）。

## 判定

リング満杯停止の仮説は、`worker_loop`・`request_nv12_frame_with`・`trim_consumed_frames`・`should_seek`の制御フローと、満杯かつ要求より古いリングを作る純粋単体テストによって、現行コードの停止条件として立証された。修正後に実ファイルignoredテストとElectron E2Eを親環境で実行し、実際のheavy-edit失敗との対応を確認する。
