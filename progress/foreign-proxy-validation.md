# 不正プロキシ採用によるA/Vずれの修正

## 決定
- `check-proxy` IPCハンドラ（`electron/main.ts`）が隣接する `<name>.proxy.mp4` を無検証で採用していたため、外部ツール製・古い生成物（例: `perf/heavy-media/GX010052.proxy.mp4`。libx264製・音声トラックあり・タイムラインが2.388倍圧縮: オリジナル536.5s→224.6s）が誤ってプレビュープロキシとして採用され、映像が音声より速く（圧縮比に応じて）再生される不具合の根本原因だった。
- 修正: アダプション時（`check-proxy`）・生成直後（`generate-proxy`）の両方で、オリジナルとプロキシ双方をffprobe（`media.probe` RPC経由、`resolveDefaultFfprobePath`を再利用）し、再生時間が一致するか純関数`validateProxyDuration`（`src/utils/proxyValidation.ts`）で検証してから採用する。
  - 許容誤差: オリジナル再生時間の2%、または0.5秒（短尺クリップ向けの下限）のうち大きい方。
  - 不一致の場合、`check-proxy`は`{ exists: false, invalidProxyPath, reason }`を返し呼び出し側（`detectExistingProxy`）が自動的に無視する。`generate-proxy`は`{ success: false, error }`を返す。
  - ffprobeが利用できない・probeに失敗した場合は警告ログを出して**従来どおりの挙動（存在確認のみで採用）にフォールバック**する。全プロキシ機能を壊さないための安全策。

## 検討した代替案
- 不正プロキシを検出時に自動削除・再生成する案 → 見送り。ユーザーの意図しないファイル削除やI/O時間の増加リスクがあり、今回はA/Vずれの根本原因除去（採用時点での拒否）だけをスコープとする最小安全策を優先した。削除・再生成の自動化は別タスクとして検討可能。
- ffprobeを直接spawnして自前でパースする案 → 見送り。既存の`callRustBackend('media.probe', ...)`が`resolveDefaultFfprobePath`を使ったffprobe呼び出しとパース済みのdurationを既に提供しており、これを再利用する方が実装重複を避けられ、失敗時のハンドリング（タイムアウト等）も既存実装に乗れる。

## 制約・注意点
- 検証は`generate-proxy`が返す`success`のみに依存せず、生成直後にも再度durationを確認する。rust-backend側の`proxy.generate`自体は本タスクの検証で問題なしと確認済み（`perf_research/notes/audio-video-desync-hypothesis.md`参照）だが、将来的な回帰を検知するための保険として残す。
- `validateProxyDuration`は純関数でI/Oを持たない。ffprobe呼び出し・ファイル存在確認は`electron/main.ts`側のハンドラが担う。
- `src/utils/proxyUtils.ts`の`detectExistingProxy`は`result.exists`のみを見るため、`invalidProxyPath`/`reason`フィールドの追加は既存呼び出し元（`useTimelineDrop.ts`含む）の挙動を変えない。
