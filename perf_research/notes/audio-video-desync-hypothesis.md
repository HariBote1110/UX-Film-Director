# 音声・映像の同期ズレ仮説（fps不一致説の検討と代替仮説）

## 目的 / 仮説

ユーザー報告:「おそらくfpsの不一致によって音と映像がズレる」。

### fps不一致説（コードリーディングでは支持されず — 実測未実施）

- frameIndex→デコードフレームの変換は `native-overlay/src/lib.rs:668-769` で
  `source_rate`（有理数、プロジェクトfps）から `target_seconds` を毎回再導出する
  時刻/PTSベース。`fps=` リサンプルフィルタ（`lib.rs:1056/1060`）で素材を
  プロジェクトfpsのケイデンスに変換しており、素材の 29.97/23.976 等の分数レートが
  この計算に入る余地がない。フレーム単位の誤差蓄積経路は見つからなかった。
- そもそも素材fpsはスキーマに存在しない（`rust-core/src/schema.rs:376-397` の Clip /
  MediaReference にfpsフィールドなし。`src/utils/mediaMetadata.ts` は
  avg_frame_rate を解析していない）。

### 代替仮説 H3: 独立自走クロック間の無補正ドリフト／エンゲージ時のエポックずれ

- 音声は `HTMLAudioElement`（`src/components/Viewport.tsx:2184-2214`）で、
  アプリの `currentTime` 状態に対して閾値スナップ（再生中 0.2s、停止中 0.05s）。
- 映像はネイティブクロック（`electron/rustScenePlaybackController.ts:263-323`）が
  自前の `setTimeout` ＋壁時計で自走。renderer への時刻反映は UI state IPC
  （200ms スロットル）経由のみ。
- 両クロックを相互補正する仕組みは存在しない。特に native の start() には
  約370msのエンゲージ遅延（コード内コメント）があり、音声再生開始との間に
  **最大 ~0.2s（スナップ閾値未満）の恒常オフセット**が残り得る。
- 0.2s 閾値超過時は audio.currentTime を強制スナップ → 断続的な「音の飛び」として
  知覚される可能性。

## 検証手段（未実施）

再生中に3クロックの差分を定期ログ:
1. native `currentTimeSeconds`（UI state IPC の値）
2. renderer `currentTime`（store）
3. 各 `audio.currentTime` − audioLocalTime
エンゲージ前後・負荷有無でオフセットの発生と推移を観測する。

## 結論

fps不一致説はコード構造上は支持されない（実測での最終確定は未了）。
H3（独立クロック＋エンゲージエポックずれ）が有力。未検証。

## 次の一手

上記3クロック差分プローブを video-load E2E に載せて実測。

---

## 実測（2026-08-22 追記）— H3 REJECTED（前提が成立しない）

### 環境

- ホスト: ローカル macOS（`/Users/yuki/GitHub/UX-Film-Director`, branch `feature-proxy`）
- 素材: `perf/heavy-media/hevc36m_30fps_174s.mp4`（hevc, 30fps, 174秒。
  `ffprobe` で音声ストリーム(aac, 48kHz, 2ch)を含むこと確認済み。
  他候補 `GX010052.MP4` / `10000kbps_60fps.mp4` / `20000kbps_60fps.mp4` も
  いずれも音声あり）
- E2E: `scripts/run-video-load-e2e.mjs`（一時計測用に
  `UXFD_VPLAYBACK_PROBE_OBSERVE_MS` 環境変数を追加。再生検知成功後に
  追加でsleepするだけ。revert済み）
- 実行コマンド:
  ```
  UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS=200000 \
  UXFD_VIDEO_LOAD_E2E_EXPECT_RUST_NATIVE_PLAYBACK=1 \
  UXFD_VPLAYBACK_PROBE_OBSERVE_MS=65000 \
  UXFD_VIDEO_LOAD_E2E_VIDEO_PATH=/Users/yuki/GitHub/UX-Film-Director/perf/heavy-media/hevc36m_30fps_174s.mp4 \
  node scripts/run-video-load-e2e.mjs
  ```
  2回実行（run1, run2）。両方 `passed: true`（1回目のrun2試行はvite-plugin-electron
  のビルド途中でElectronを起動してしまうレース失敗で、再実行で解消。
  この失敗は本調査の変更とは無関係のハーネス既知の不安定さ）。

### ステップ0（重要な前提の再検証）: 動画クリップに音声オブジェクトは存在しない

タスク前提だった「音声は `HTMLAudioElement`（Viewport.tsx:2184-2214、
0.2s/0.05sスナップ）」を再検証したところ、**この経路は動画クリップに対して
一度も発火しない**ことが判明した:

- `src/components/Timeline.tsx:392` / `src/hooks/useTimelineDrop.ts:139` の
  動画インポートは `type: 'video'` の TimelineObject を1個追加するのみで、
  対になる `type: 'audio'` オブジェクトは作らない。
- Viewport.tsx:2184-2214 の音声同期ブロック（0.2s/0.05sスナップ）は
  `obj.type !== 'audio'` を弾くガードがあり、`type: 'video'` では通らない。
  → E2Eを拡張しなくても、既存の動画インポートだけで「動画の音」は
  別経路で鳴っていることになる。

実際に動画クリップの音を出しているのは
`src/utils/sharedRendererExternalVideoSource.ts` の
`createSharedRendererExternalVideoSource`（`document.createElement('video')`、
`muted`/`volume`を設定）＋`syncSharedRendererExternalVideoPlayback`
（再生中ドリフト許容 0.35s、一時停止中 1/120s ≈ 8.3ms）。
呼び出し元は `Viewport.tsx` の `syncSharedRendererExternalVideoSources`
（`rustVideoOnlyEnabled`（ビルド時 `VITE_UXFD_RUST_VIDEO_ONLY`）が **false**
の場合のみ呼ばれる。true の場合は
`disposeSharedRendererExternalVideoSources` で**破棄**される — 音声が
一切鳴らないモードになる）。

`npm run dev` / `npm run build` はどちらも `VITE_UXFD_RUST_VIDEO_ONLY` を
設定しない（`rustVideoOnlyEnabled` は既定 false）。つまり通常起動・
パッケージビルドの両方で、動画クリップの音声と映像は**同一の
`HTMLVideoElement`（decode）から出ている**。HTML5 の仕様上、同一要素内の
音声・映像はブラウザが内部で同期を保証するため、「2つの独立自走クロック」
という H3 の前提そのものが、この構成では成立しない。

（`VITE_UXFD_RUST_VIDEO_ONLY=1` を明示的に指定する `dev:rust-video` 等の
別モードでは逆に音声が完全に無音になる — これは「ズレ」ではなく
「無音」という別種の不具合であり、今回のタスク範囲外）。

### 計測結果

`sharedRendererExternalVideoSource.ts` の `syncSharedRendererExternalVideoPlayback`
（動画の音声+映像ソースとなる `HTMLVideoElement` の同期処理）にドリフトログを
仕込んだところ、**再生中の65〜74秒間、一度も呼ばれなかった**:

| run | 観測時間 | `[avsync-probe] extvideo` 発火回数 | 発火タイミング |
|---|---|---|---|
| run1 | 65s要求（実測 ~74s） | 3回 | すべて再生開始前後（t=7817〜9020ms、seek→play直後）。以降0回 |
| run2 | 65s要求（実測 ~74s） | 3回 | すべて再生開始前後（t=7457〜8420ms、seek→play直後）。以降0回 |

つまりこの同期関数はセッション構築（presenter起動）時にしか呼ばれず、
再生中は呼ばれ続けない。`HTMLVideoElement` は一度 `play()` されたあとは
ブラウザ内部のデコーダに完全に委ねられ、アプリ側から追加のドリフト補正は
行われない。ただしこれは「補正されない別クロックとレースする」という
H3の懸念とは異なり、**単一要素なので補正すべき別クロックが最初から
存在しない**というだけである。

Rust側クロック（`electron/rustScenePlaybackController.ts`）も計測した:

| run | engage所要時間（`startPlayback`合計） | wall時間74,075〜73,947ms に対するnative `currentTimeSeconds`進行 | 誤差 |
|---|---|---|---|
| run1 | 30.3ms | wall 74075ms → native +74102.6ms相当 | +0.04%（式で壁時計から直接算出しているため定義上ほぼ一致） |
| run2 | 23.5ms | wall 73947ms → native +73968.0ms相当 | +0.03%（同上） |

engage遅延は今回いずれも30ms台で、既存ノート（`engage-delay-breakdown.md`）の
216〜370msより大幅に短い。これは今回のセッションが
`videoPresentationSource: external-video-source`（音声・映像とも
`HTMLVideoElement` 由来）であり、`presentScene` の重い経路
（native overlay 単独ソース）を通っていないためと考えられる
（`playbackSurfaceIsolationOk: true` — Chromiumのcaptured surfaceは
不変=実際の映像出力はCAMetalLayer側。native側は"rustPlaybackFrame"という
並走カウンタを持つが、これはこのセッション種別では映像の実出力ソースでは
ない。詳細な役割分担は未検証・別調査が必要）。

### 結論

**H3（独立自走クロック間の無補正ドリフト、0.2s閾値スナップによる音飛び）は
REJECTED。** ただし棄却の理由は「ドリフトが小さかった」ではなく、
**そもそもその前提となる二重クロック構成（HTMLAudioElement vs native video
clock）が、動画クリップの通常再生では存在しない**ため。

- fps不一致説（先の棄却）、H3（この棄却）のいずれも、コード上
  「音ズレ」を説明できていない。ユーザー報告の再現条件（どのビルド設定・
  どの再生モードか）を先に特定しないと、次の仮説を立てられない。
- 唯一残る構造的な疑わしさ: `type: 'audio'` の**独立音声クリップ**
  （BGM等）を動画と併置した場合は、Viewport.tsx:2184-2214 の
  0.2s/0.05sスナップが本当に発火する。これは今回検証していない
  （動画自体の内蔵音声の話とは別問題）。
- `VITE_UXFD_RUST_VIDEO_ONLY=1` モードでは動画の音声が完全に出ない
  （無音）という、"desync" とは異なる副作用が構造的に存在する。
  ユーザー報告が実はこちらの体感（音が途切れる/来ない）を「ズレ」と
  表現している可能性は要確認。

### 次の一手 / 未検証事項

1. `type: 'audio'` の独立音声クリップ＋動画の同時再生シナリオで
   Viewport.tsx:2184-2214 の0.2s/0.05sスナップが実際に発火するか、
   発火頻度・振幅を計測する（H3の"生き残った"部分）。
2. `videoPresentationSource` が `external-video-source` 以外
   （native-render-only / mixed）になる具体的な条件を特定し、その場合の
   実際の音声経路（鳴るのか、鳴るなら何が音源か）を確認する。
3. ユーザー報告の再現手順（ビルド設定・素材・操作）を本人から追加ヒアリングし、
   上記のどのモードで発生しているかを切り分ける。
