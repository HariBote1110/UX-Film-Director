# sourceUpload 残存2〜3msの帰属と除去 — 毎フレームのuploadフェンスが犯人、133〜139fps

## 目的 / 仮説

[generated-source-cache-verification.md](generated-source-cache-verification.md) の次の一手1。
キャッシュ全ヒットのはずの sourceUploadMs が毎フレーム 2.2〜2.8ms 残る理由を帰属する。

- **仮説A**: IOSurface エクスポート経路（`render_frame_to_bgra_iosurface_with_audio_reactive_sources`,
  native-wgpu-renderer/src/lib.rs）が `prepare_scene_clips_with_upload_fence` を
  `wait_for_upload=true` で呼び、キャッシュ全ヒットでも毎フレーム
  `queue.submit(empty)` + `wait_for_submitted_work` のフェンスを踏んでいる。
  反証条件: フェンス分割計測で 2ms 未満なら棄却。
- **仮説B（対抗）**: content_revisions の取りこぼしで毎フレームキャッシュミス。
  反証条件: hit/miss カウンタでミスが定常的に増えなければ棄却。

## 環境

- これまでと同一（focus-tips 720p60/720枠、release backend、residentScene+IOSurface、
  マージ ebe4a097 時点、Apple Silicon macOS / Darwin 25.5.0）
- 計測・実験パッチ: `encode_research/tools/upload-fence-split-and-removal.patch`（撤去済み）
  - `UXFD_ENCODE_RESEARCH_UPLOAD_SPLIT=1` で prepare のループ部/フェンス部と
    media テクスチャキャッシュ累計 hit/miss を stderr へ出力
  - 実験E-fence: IOSurface 経路の `wait_for_upload` を `false` に変更

## 手順

```bash
UXFD_ENCODE_RESEARCH_UPLOAD_SPLIT=1 \
VITE_UXFD_RUST_TIMELINE_SCENE_RPC=1 VITE_UXFD_NATIVE_DIRECT_ENCODE=1 \
UXFD_RUST_BACKEND_BIN=$PWD/rust-backend/target/release/uxfd-rust-backend \
UXFD_VIDEO_EXPORT_E2E_AGENT_PROJECT_PATH=$PWD/public/agent-projects/focus-tips.json \
UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=300000 node scripts/run-video-export-e2e.mjs
```

## 結果

分割計測（フェンスあり=現行、1run）:

| 区間 | ms/呼び出し |
|---|---|
| prepare ループ（bind group 構築等） | 0.70 |
| **uploadフェンス（submit(empty)+wait）** | **2.01**（最大 7.9） |
| キャッシュミス | 全run累計 42（起動時のみ、定常はゼロ） |

フェンス除去（3反復、720frames）:

| run | exportDurationMs | fps |
|---|---|---|
| フェンスあり（同日同環境） | 7293 | 98.7 |
| なし 1 | 5302 | 135.8 |
| なし 2 | 5403 | 133.3 |
| なし 3 | 5175 | 139.1 |

全runで e2e は success。sourceUpload はループ部 0.6〜0.8ms のみ残存。

## 結論

- **仮説A採択: 残存2〜3msの正体は毎フレームのuploadフェンス。** キャッシュヒットで
  write_texture が発生しないフレームでも `wait_for_submitted_work` のポーリング往復
  だけで平均2ms払っていた。
- **仮説B棄却済み**: ミスは起動時42回のみ。revision供給に取りこぼしはない。
- 除去の正当性: wgpu では同一 queue 上の `write_texture` は後続 `submit` の
  コマンドより先に完了することが保証されるため、レンダー submit 前の明示フェンスは
  正しさに不要（live surface 経路が既に `wait_for_upload=false` で運用されている
  こととも整合）。
- **中央値 135.8fps = 当初ベースライン 51.5fps の 2.64倍、2.26x realtime。**

## 次の一手 / 未検証事項

1. **/development でフェンス除去を本実装**（`render_frame_to_bgra_iosurface_with_audio_reactive_sources`
   の `wait_for_upload` を false に。テストで「キャッシュヒット時にフェンスを踏まない」
   ことと描画結果不変を担保）。
2. 残る prepare ループ 0.6〜0.8ms（毎フレームの create_view + bind group 再構築）。
   PreparedClip のキャッシュ（live surface の `prepare_base_scene_clips_cached` 相当を
   export 経路にも）で取れる可能性。効果は小さめ（~0.7ms ≒ +10fps級）。
3. 以降は render 3.7〜5.0ms が支配項 = 真のGPU律速。次の大物は
   既定経路の vsync 供給律速（residentScene の既定化）と 1080p/4K・動画ソース入り再プロファイル。
