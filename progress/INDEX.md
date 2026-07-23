# 決定ログ索引

- [phase4c-electron-diagnostics-and-export.md](phase4c-electron-diagnostics-and-export.md) — 実Electron混在シーンでのNV12 zero-copy確認、描画経路診断の可視化、`encode.writeNativeFrame`のNV12対応、全体型・境界契約・PSDフォールバック整備（2026-07-23）
- [phase4c-inprocess-decode-integration.md](phase4c-inprocess-decode-integration.md) — Phase 4c Stage 1+2: `macos-video-decode` の decode.* RPC 面への統合とNV12 zero-copy本番合成。実Electron検証で判明した`jobId`/`mediaId`相関不具合を修正し、本番形式の異なるIDでもzero-copyが発火する契約を追加（2026-07-23）
- [phase4b-nv12-iosurface-gpu-import.md](phase4b-nv12-iosurface-gpu-import.md) — Phase 4b: NV12 IOSurface のゼロコピー import（wgpu-hal Metal）とGPU上YCbCr→RGB合成の設計・依存バージョン一致方針・エフェクト統合ポイント・却下案・制約（2026-07-20）
- [phase4a-macos-video-decode-core.md](phase4a-macos-video-decode-core.md) — Phase 4a: `macos-video-decode`（AVAssetReaderベースのin-process動画デコードコア）のAVAssetReader採用理由・forward-only seek契約・色域判定規約・Send/Sync境界・このサンドボックス環境でのHEVCピクセルデコード制約（2026-07-20）
- [phase3b-present-path-unification.md](phase3b-present-path-unification.md) — Phase 3b: presenter reuseの全セッション化（混在セッションの毎pointermoveフル再起動解消）とnative-render-onlyセッションのnative overlay同時配信（DOM canvas経路からの一本化）の現状トレース・設計・却下案・残課題（2026-07-20）
- [phase3a-per-clip-gpu-texture-cache.md](phase3a-per-clip-gpu-texture-cache.md) — Phase 3a: `render.nativeSharedFrame` の per-clip GPU テクスチャキャッシュ（media_id＋revision キー・退避・リサイズ耐性）の設計・却下案・制約（2026-07-20）
- [selection-decoration-phase2-visibility-and-codelivery.md](selection-decoration-phase2-visibility-and-codelivery.md) — 選択枠フェーズ2: 時間帯可視性の唯一実装（isObjectVisibleAtTime）とnative overlayデコレーション同時配信（body co-delivery）の設計・却下案・制約（2026-07-20）
- [five-bugs-structural-redesign.md](five-bugs-structural-redesign.md) — 5件のバグ（選択枠ズレ・デコーダ性能・フォント選択・幽霊選択枠・赤テキスト）の根本原因と構造的解決の設計方針（2026-07-20）
