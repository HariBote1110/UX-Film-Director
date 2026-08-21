# 動画素材再生時の「巻き戻り＋FPS崩壊」計測結果（H1/H2検証）

## 目的 / 仮説

`video-playback-backward-jump-fps-collapse.md` に記録した仮説チェーンのうち
H1（メインスレッド同期デコード→追いつきスキップ→非シーケンシャル要求→
O(GOP)同期シークの自己増幅ループ）と H2（遅れたメディアクロックの
無方向スナップが `setTime` の単調性ガード欠如を突いて巻き戻る）を、
一時的な計測ログを仕込んで実測し、採否を確定させる。

## 環境

- ホスト: Apple M4, macOS 26.5.2 (Build 25F84)
- Node.js v26.0.0 / Electron 30.5.1
- リポジトリ: UX-Film-Director branch `feature-proxy`, version `0.1.1-Beta-497a`
- 素材: `perf/heavy-media/GX010052.MP4`（4K/高ビットレート、E2Eデフォルト）
- 計測は本ノート専用の一時的ログ（すべて `[vplayback-probe]` プレフィクス）で行い、
  ノート確定後に revert 済み（コード自体は非永続）

## 手順

1. 以下4箇所に一時ログを仕込んだ（すべて revert 済み）。
   - `electron/rustScenePlaybackController.ts` `tick()`: フレームインデックスの
     delta（!=1のときのみ）と `renderFrame` await の所要時間。
   - `native-overlay/src/lib.rs` `NativeOverlayResidentVideoDecoder::request_frame`:
     sequential/seek 分岐と seek+decode ループの所要時間（`eprintln!`）。
   - `src/store/slices/playbackSlice.ts` `setTime`: 再生中に1フレーム
     （0.017s）超で後退したときの後退量と呼び出し元スタック。
   - `src/utils/sharedRendererExternalVideoMasterClock.ts`
     `resolveSharedRendererExternalVideoMasterClockSnapTime`: 発火時の
     スナップ方向と量。
2. `native-overlay` を `node scripts/build-native-overlay-addon.mjs` で再ビルド。
3. `node scripts/run-video-load-e2e.mjs` で再現。
4. **重要な補正**: このリポジトリは native rust playback
   （`rustPlaybackClockOwner === 'main'`）が既定パスだが、
   `scripts/run-video-load-e2e.mjs` の再生検知ヘルパー
   `waitForPlaybackFrameAdvance` は既定で legacy パス判定しか行わず、
   `UXFD_VIDEO_LOAD_E2E_EXPECT_RUST_NATIVE_PLAYBACK=1` を渡さないと
   20秒の内部タイムアウトで「未再生」扱いになり、後段の長時間観測に
   到達しない。1回目の予備実行はこれで観測時間が実質20秒未満に短縮
   されていたことが判明したため、以降はこのフラグを付与した。
5. 長時間再生を観測するため、E2Eスクリプトに一時的な
   `UXFD_VPLAYBACK_PROBE_OBSERVE_MS` 環境変数（デフォルト0、
   再生検知成功後に追加でsleepするだけ）を仕込んだ（revert済み）。
6. 実行コマンド例（run1b）:
   `UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS=200000 UXFD_VIDEO_LOAD_E2E_EXPECT_RUST_NATIVE_PLAYBACK=1 UXFD_VPLAYBACK_PROBE_OBSERVE_MS=80000 node scripts/run-video-load-e2e.mjs`
7. 予備実行（フラグ未補正、参考値、本文の結論には使用せず）を含め計3回実行。
   本文の表は補正後の2回（run1b, run2）。

## 結果

### request_frame の sequential / non-sequential 比率と所要時間

| run | 総呼び出し数 | non-sequential数 | non-sequential比率 | non-sequential elapsed 最大 |
|---|---|---|---|---|
| run1b (~80s観測) | 4991 | 1582 | 31.7% | 797.6ms |
| run2 (~60s観測、途中でハーネス自体がタイムアウト) | 5511 | 987 | 17.9% | 377.4ms |

### JS側 `tick()` の frameIndex delta（本来は毎tick+1が正常）

| run | delta!=1 の tick数 | 最大delta（フレーム） |
|---|---|---|
| run1b | 1902 | 67 |
| run2 | 1291 | 31 |

delta の内訳（run1b）: delta=2が568件、3が542件、4が314件、5以上も
139件あり、最大は67フレーム分の飛び越し。

### JS側 `renderFrame` await（`presentScene` を含む同期N-API呼び出し全体）

| run | 5ms超の回数 | 最大所要時間 |
|---|---|---|
| run1b | 1699 | 1087.3ms |
| run2 | 1138 | 488.4ms |

60fpsのフレーム予算(16.7ms)を大幅に超える1000ms超のブロッキングが
run1bで確認できた。これは Electron main thread が `presentScene`
（`presentNativeOverlayScene`、同期N-API）の1回の呼び出し中に
1秒以上専有されることを意味し、その間 CDP の
`Page.captureScreenshot` すら応答できずタイムアウトした
（run2は `Page.captureScreenshot timed out` で失敗終了。副次的な
main thread starvationの直接証拠）。

### `setTime` の後退呼び出しと `masterClockSnap` の発火

| run | setTime後退（再生中、>1フレーム） | 呼び出し元 | masterClockSnap発火 |
|---|---|---|---|
| run1b | 1件、-41.42s（67.25s→25.83s） | `handleSeekMouseDown`（`src/components/Timeline.tsx:191`）経由 | 0件 |
| run2 | 0件 | — | 0件 |

`resolveSharedRendererExternalVideoMasterClockSnapTime`
（H2で疑ったマスタークロックの無方向スナップ）は両runとも
**1回も発火しなかった**。native rust playback
（`rustPlaybackClockOwner === 'main'`）経路では、この関数の呼び出し元
（`Viewport.tsx` の external-video-source 系ロジック）自体が
条件的に無効化されているとみられる。

一方で唯一観測された `setTime` の大幅後退（-41.42s）は、
マスタークロックのスナップではなく **Timeline のシークUIハンドラ
（`handleSeekMouseDown`）経由**だった。E2Eハーネスの自動操作
（`Page.captureScreenshot` やCDPのマウスイベント）がタイムライン上に
意図せず着地した可能性が高く、H2で想定した経路とは異なる。ただし
これは **`setTime` に再生中の単調性ガードが存在しない**という
構造的事実そのものの実証にはなっている。

## 結論

### H1: CONFIRMED（メインスレッド同期デコード起因のFPS崩壊）

- `presentNativeOverlayScene` は `#[napi]`（`catch_unwind` ラップのみ、
  `AsyncTask` なし）で同期実行され、`resolve_video_sources` →
  `NativeOverlayResidentVideoDecoder::request_frame` の seek+decode
  ループを **Electron main thread 上で直接ブロッキング実行**している
  ことをコード上・実測上の両方で確認。
- 非シーケンシャル要求は 18〜32% の頻度で発生し、1回あたり最大
  377〜798ms（run間）かかる。これに対応する形で JS側 `renderFrame`
  await も最大488〜1087msブロックし、`tick()` の frameIndex は
  1回のtickで最大31〜67フレーム分飛ぶ（＝60fpsなら0.5〜1.1秒分の
  フレームをまとめてスキップ）。
- `load_overlay_native_sources_for_scene_cached_impl`
  （`native-overlay/src/lib.rs:2840`付近）は `MediaKind::Image`,
  `Psd`, `Generated*` のみを prewarm し、`MediaKind::Video` は
  ハンドルせず `continue` で読み飛ばしている（未修正のまま）ことも
  併せて確認。ノート記載の「動画だけ pre-warm 経路から漏れている」
  仮説はコード上も現時点で正しい。
- 「一過性の遅延→非シーケンシャル要求→シークコスト増大→次tickでさらに
  飛ぶ」の自己増幅ループはログ上でも観測でき（例:
  `tick frameIndex delta=30``→47``→67` と徐々に拡大する系列が
  run1bログに存在）、H1のメカニズムは棄却されず支持された。

### H2: 一部棄却・一部確認（部分的採用）

- 仮説の中核だった「`resolveSharedRendererExternalVideoMasterClockSnapTime`
  による無方向スナップが巻き戻りの主犯」という **具体的な発火経路は
  2回の観測で1度も発火せず、棄却**。native rust playback
  経路ではこの関数自体が実効的に無効なパスにある可能性が高い
  （要追加コードリーディング）。
- ただし「`setTime` に再生中の単調性ガードがない」という
  仮説の根拠自体は実測でも確認され（-41.42sの後退が実際に
  `currentTime` へ適用された）、**巻き戻りを引き起こしうる無防備な
  APIが存在するという意味では棄却されない**。ただし今回観測された
  唯一の後退の呼び出し元は `Timeline.tsx` の `handleSeekMouseDown`
  であり、ノートが名指ししたマスタークロック経路とは別の入口だった。

### 全体の因果関係（統合シナリオの検証）

ノートが提示した「一過性ヒッチ→H1のシーク暴走→FPS崩壊→
メディアクロックがヘッドより遅れる→H2の無方向スナップで巻き戻る」
という単一の連鎖は、**後半（H2部分）の具体的経路については
支持する証拠が得られなかった**。FPS崩壊（H1）は明確に確認できたが、
今回のnative rust playback設定では、それが直接
`resolveSharedRendererExternalVideoMasterClockSnapTime` 経由の
巻き戻りへ繋がる証拠は得られていない。巻き戻りの再現には別条件
（legacy/external-video-source経路での再生、または実際のユーザー操作
に近いタイムラインシーク）での追加計測が必要。

## 次の一手 / 未検証事項

1. `UXFD_VIDEO_LOAD_E2E_EXPECT_EXTERNAL_TEXTURE=1` 相当の
   legacy/external-video-source経路（`rustPlaybackClockOwner !== 'main'`）
   でも同じ計測を行い、`masterClockSnap` が発火する条件を特定する。
   今回は native rust playback 経路に限定されていた可能性が高い。
2. `handleSeekMouseDown`（`src/components/Timeline.tsx:191`）が
   E2Eの自動操作でなぜ発火したかを切り分ける（本物のUIバグか、
   CDPの座標計算がテスト環境固有の問題かを判別）。
3. H1の修正候補（動画のpre-warm化）を `/development` で実装した後、
   同じ計測プロトコルで before/after 比較を行い、non-sequential比率と
   renderFrame最大所要時間の改善を数値で確認する。
4. `setTime` への単調前進ガード導入（明示シーク・pause時のスナップは
   除外）を実装後、同様に本プロトコルで検証する。
