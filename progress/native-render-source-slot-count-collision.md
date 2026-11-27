# native render decode jobIdのslotCount衝突によるexport破損

## 症状

video exportが間欠的に48バイトの壊れた出力ファイル（`moov atom not
found`）を生成し、以下のアラートで失敗する。

```
エクスポート失敗: Failed to attach native render source shared memory:
SlotCountMismatch { expected: 2, actual: 6 }
```

`rust-backend/src/native_shared.rs:96` の `read_native_render_source_frame`
が `PosixSharedRing::attach_with_retry_for_layout` を `source.slot_count`
（=2）で呼び出し、既に別のslot数（6）で作られた同名shared memory
regionにattachしようとして失敗する
（`shared-memory-spike/src/lib.rs:594`, `PosixShmError::SlotCountMismatch`
定義は`:762`）。

## 発生条件（実測）

`npm run test:realistic-heavy-edit:e2e`（約6分）を7回実行して1回発生。
再生→exportの順で実行するシナリオでのみ踏む。

native再生中はElectron main所有の再生時計（`native-playback-clock.md`,
`native-playback-optimistic-revision-race.md`で修正）がほぼ確実に
engageするようになったのはごく最近で、修正前は175フレーム中161フレーム
がnative再生経路を通る状態にほとんど到達しなかった。「native再生が動いた
直後にexportする」という状態遷移は、この修正によって初めて日常的に
到達するようになった。**このバグはnative再生clockの修正が有効化した、
これまで実質到達しなかったコード経路である。**

## Root cause

`src/utils/sharedRendererViewportNativeRenderSource.ts` の
`buildViewportNativeRenderDecodeJob`（native render用decode job builder）
が生成する `jobId` は `mediaId + 出力サイズ + フレームレート` のみから
導出され、**slotCountを含んでいなかった**。

一方、同じmedia/size/rateの組に対して要求されるslotCountは呼び出し元
ごとに異なる：

- native再生（`src/utils/sharedRendererPlaybackPreviewSettings.ts:16`
  `SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT = 6`）
- export（`src/utils/sharedRendererExportFrameSource.ts`経由、
  `prepareSharedRendererViewportNativeRenderSources`のデフォルト
  `slotCount = 2`）

jobIdが一致するため、Rust側の
`rust-backend/src/decode.rs:45-54`（`handle_decode_start`のセッション
キャッシュ早期return）が、export側の`decode.start`要求（slotCount=2）
に対して、native再生が先に作った**slotCount=6のセッションをそのまま
返していた**。このreturnはslotCountの検証を一切していなかった。

export側は自分が要求したslotCount=2でshared memory ringにattachできる
と信じて `render.nativeSharedFrame` の`sources[].slotCount`に2を積み、
`native_shared.rs:96`の`attach_with_retry_for_layout`が実体（6スロット）
との不一致で失敗する。

decode.start自体は成功として返っているため、TS側の呼び出し元は失敗に
気づかず、後段のnative render呼び出しまで進んでからようやく
`SlotCountMismatch`として表面化する。

## Decision

二段の修正を行った。

1. **衝突の根絶（TS, 主修正）**: `buildViewportNativeRenderDecodeJob`の
   jobId生成にslotCountのセグメントを追加した
   （`shared-renderer-video-<media>-<size>-<rate>-slot<N>`）。
   異なるslotCountを要求する呼び出し元は最初から別のjobId、ひいては
   別の`memory_id`・別のPOSIX ringを得るため、衝突条件そのものが
   成立しなくなる。

2. **多重防御（Rust）**: `rust-backend/src/decode.rs`の
   `handle_decode_start`が、同一jobIdの既存セッションを再利用する際に
   要求されたslotCountと既存セッションのslotCountを比較し、不一致なら
   `response_error`（コード`-32055`）で即座に失敗させるガードを追加した。
   TS側の名前空間分離をすり抜けるケース（将来の別呼び出し元がjobIdに
   slotCountを含め忘れる、等）があっても、export段階まで進んで壊れた
   mp4を出力する代わりに、decode.start時点で大声で・回復可能な形で
   失敗するようにする保険。

## Alternatives considered

- **消費側が実際のレイアウトに従う（response.result.slotCountを信頼する）**:
  `startDecodeJob`が返す`resolvedJob`は`activeJobs`の同一性比較
  （`sameDecodeJob`、slotCountも比較対象）にも使われるため、
  actual slotCountで上書きすると次フレーム以降の呼び出しで
  「要求したjob（slotCount=2）」と「保持しているjob
  （実際のslotCount=6）」が毎回不一致になり、フレーム毎にdecodeを
  stop/restartし続けるリグレッションを生む。ジョブ管理用の状態と
  attach用の実測値の二重管理が必要になり複雑化するため見送った。
- **`attach_with_retry_for_layout`のslot_count検証を緩める（許容差を
  設ける）**: 実際のリング形状と異なるslot_countでの読み書きは
  スロットのバイトオフセット計算そのものを誤らせるため、許容しては
  いけない不変条件。症状を隠すだけで危険。不採用。
- **Rust側のガードのみで済ませる**: これだと衝突自体はexportのたびに
  発生し続け、`decode.start`が失敗した後、TS側の
  `isDecodeSessionAlreadyActiveForJobId`回復パス（既存の防御コードだが
  これまで実質到達しなかった）が「エラーだが成功とみなして進む」実装の
  ままだと、要求どおりのslotCountでjobを返してしまい同じ症状を
  再現しかねない。jobId名前空間分離を主修正とし、Rustガードは保険に
  留めた。

## Constraints / Gotchas

- `src/utils/sharedRendererViewportVideoUpload.ts`にも構造的に同一の
  jobId生成パターン（`buildViewportVideoDecodeJob`）が存在し、
  native render経路とは別ファイルだが同じ
  `shared-renderer-video-<media>-<size>-<rate>`形式を使っている。
  今回の実測された衝突（native再生↔export、共に
  `sharedRendererViewportNativeRenderSource.ts`内）とは別に、
  canvasアップロード経路とnative render経路が同一media/size/rateで
  異なるslotCountを要求した場合にも理論上同型の衝突が起こり得るが、
  本修正のスコープ外として意図的に対象外とした。踏んだ場合は同じ
  `-slot<N>`命名規則をそちらのjobId生成にも適用すること。
- `isDecodeSessionAlreadyActiveForJobId`エラー文字列マッチ
  （`sharedRendererViewportNativeRenderSource.ts`,
  `sharedRendererViewportVideoUpload.ts`）は今回追加したRust側エラー
  メッセージ（`Decode session already active for jobId=...`）とも
  部分一致する。jobId名前空間分離により実運用でこの経路を踏むことは
  なくなったはずだが、踏んだ場合は要求したslotCountでjobを返す
  現状の実装のままなので、根本修正（1）が効いていることを前提とした
  保険であることに注意。
- Rust側からRust側だけの再現テスト（decode.startを同一jobIdで異なる
  slotCountで2回呼ぶ）は`cargo test --manifest-path
  rust-backend/Cargo.toml decode::tests`で確定的に再現できる。
  重量E2E（`npm run test:realistic-heavy-edit:e2e`）でのループ再現は
  行っていない（1回6分・専有実行が必要なため）。
