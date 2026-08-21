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

---

## 実測（2026-08-22 追記2）— 指定シナリオでの2〜3倍速再現なし・proxy生成に別の実バグを発見

### 目的 / 仮説

前回追記時点の未検証事項を受け、タスク指示として「visible pixelはネイティブ
overlayの常駐デコーダ（PTSベース）、音声は別の`HTMLVideoElement`」という
二重クロック構成を前提に、実測でvisible video speed ratio（served pts /
wall time）とaudio speed ratio（`HTMLVideoElement.currentTime` / wall time）
を比較し、2〜3倍のズレが再現するかを検証する計画だった。

### 環境

- ホスト: ローカル macOS（`/Users/yuki/GitHub/UX-Film-Director`, branch `feature-proxy`）
- 素材: `perf/heavy-media/hevc36m_30fps_174s.mp4`（hevc, 30fps, 174秒）
- プロジェクトfps: 既定 60fps（`src/store/useStore.ts:74`
  `projectSettings: { width: 1920, height: 1080, fps: 60, sampleRate: 44100 }`）。
  E2Eはこの既定を上書きしていないため、seed変更は不要だった（30fps素材に
  対し60fpsタイムラインなので、2倍系のバグがあれば検出しやすい構成のまま）。
- E2E: `scripts/run-video-load-e2e.mjs` に `[vspeed-probe]` タグで一時計測を
  追加（`sampleVspeedProbe`関数。200ms間隔で
  `document.documentElement.dataset.uxfdRustPlaybackFrame`（native制御プレーンの
  frame index）、`...VideoPresentationSource`、`document.querySelectorAll('video')`
  の各要素の`currentTime`/`muted`/`paused`を`UXFD_VPLAYBACK_PROBE_OBSERVE_MS`
  ミリ秒ぶん収集し `/tmp/vspeed-probe-result.json` に書き出す）。
- 実行コマンド（2回）:
  ```
  UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS=200000 \
  UXFD_VIDEO_LOAD_E2E_EXPECT_RUST_NATIVE_PLAYBACK=1 \
  UXFD_VPLAYBACK_PROBE_OBSERVE_MS=50000 \
  UXFD_VIDEO_LOAD_E2E_VIDEO_PATH=/Users/yuki/GitHub/UX-Film-Director/perf/heavy-media/hevc36m_30fps_174s.mp4 \
  node scripts/run-video-load-e2e.mjs
  ```
  観測窓は当初65秒を狙ったが、CDP `send()`のハードタイムアウトが60秒固定
  （`scripts/run-video-load-e2e.mjs:133`）のため`Runtime.evaluate timed out`で
  失敗し、50秒に短縮して再実行（両runとも `passed: true`）。

### 判明した事実1: このシナリオでは `native-render-frame` 経路が一度も有効化されない

`sampleVspeedProbe` が拾った `videoPresentationSource` は両run・全250サンプル
とも一貫して `'external-video-source'` で、`'native-render-frame'` は一度も
観測されなかった。

- `'native-render-frame'` は `sharedRendererNativeRenderFrameUpload`（デコード
  済みフレームをWebGPUテクスチャとしてアップロードする経路）が存在する場合
  のみ `nativeRenderFrameReady = true` になる
  （`src/utils/sharedRendererPreviewPresenterController.ts:400-439`）。今回の
  プレビュー再生（`videoSourceMode`既定 `'previewProxy'`）ではこの経路が
  発火せず、`shouldPresentExternalVideoFrame` にフォールバックしている
  （同ファイル781-789行の判定式）。
- タスク前提だった「常駐デコーダのPTSが可視ピクセルの直接ソース」という
  構成は、少なくとも通常のプレビュー再生（`UXFD_VIDEO_LOAD_E2E_EXPECT_RUST_NATIVE_PLAYBACK=1`
  を含む）では成立していない。この点は前回追記（H3棄却）の結論と整合する
  ——`sharedRendererVideoCutoverEnabled`は既定trueだが、それが有効にする
  のは主にIOSurfaceエクスポート経路（決定ログ`0aadd487`）であり、本セッション
  のプレビュー描画自体は従来通り`external-video-source`（音声・映像とも同一
  `HTMLVideoElement`）に留まっている。
- 併せて `document.querySelectorAll('video')` は両runとも全サンプルで
  **0件**だった。`external-video-source`用の`HTMLVideoElement`は
  `document.createElement('video')`で生成されるが`document`にアタッチされて
  いない（`src/utils/sharedRendererExternalVideoSource.ts`）。そのため今回の
  DOM経由プローブでは`currentTime`を直接観測できず、audio speed ratioの
  実測は取得できなかった（未達成・要別アプローチ）。

### 判明した事実2: native制御プレーンのframe進行は壁時計と一致（異常なし）

`uxfdRustPlaybackFrame`（`rustPlaybackClockOwner: 'main'`、native側の
再生制御クロックが公開するframe index、プロジェクト60fps系列）の進行率:

| run | 区間 | frame変化 | wall時間変化 | 進行レート |
|---|---|---|---|---|
| run1 | 0〜50104ms | 542→3544（+3002） | 50.104s | 59.92 fps |
| run2 | 0〜50109ms | 547→3552（+3005） | 50.109s | 59.97 fps |

プロジェクトfps=60に対し誤差0.1%未満で、2〜3倍のズレは**この指標では
再現しなかった**。ただし、このframe indexは`clockOwner: 'main'`の
壁時計駆動ターゲット値であり、実際にデコード・提示された映像フレームの
PTSそのものではない（＝「要求側」の値。タスク手順1bで求められていた
「SERVEDフレームのpts_seconds」に相当するRust側ログは、上記の理由
（`external-video-source`経路のため常駐デコーダ`request_frame`が可視パスの
主役ではないと判明したこと、およびアドオン再ビルドを伴う計測コストの
兼ね合い）から本セッションでは実施しなかった。

### proxyのfps/フレーム数メタデータ調査

`ffprobe`実測（stream=avg_frame_rate,r_frame_rate,nb_frames,duration）:

| ファイル | r_frame_rate / avg_frame_rate | duration | nb_frames |
|---|---|---|---|
| `GX010052.MP4`（元） | 120000/1001（≈119.88fps） | 536.536 s | 64320 |
| `GX010052.proxy.mp4` | 120000/1001（元と同一） | **224.641 s** | **26930** |
| `20000kbps_60fps.mp4`（元） | 60/1 | 20.367 s | 1222 |
| `20000kbps_60fps.proxy.mp4` | 3055/51（≈59.90fps、ほぼ同一） | 20.400 s | 1222 |

**GX010052のproxyは、タグ上のfpsが元と同一（120000/1001）にもかかわらず、
実フレーム数・実尺が元の41.9%（536.536/224.641 = 2.388倍）しかない。**
60fps素材（`20000kbps_60fps`）ではフレーム数・尺とも元とほぼ一致しており、
この異常は約120fpsの高フレームレート素材（GoPro GX010052）に固有と見られる
（`rust-backend/src/proxy.rs`の`build_proxy_args`はmacOSで
`-hwaccel videotoolbox`＋`h264_videotoolbox`エンコード、`-r`等のフレーム
レート強制フラグは指定していない。おそらく高fps・GoPro特有の可変フレーム
レート/タイムスタンプ扱いをGPUデコード/エンコードのパイプラインが正しく
維持できず、フレームを間引いた状態でコンテナfpsタグだけ元と同じ値になった
ものと推測。原因の一次切り分け（`-hwaccel`未使用時の再現有無等）は未実施）。

### proxy置換の経路（コード調査）

- `videoSourceMode`の既定値は`'previewProxy'`
  （`src/utils/rustSceneSnapshot.ts:214`、`:2101`）。この場合
  `object.proxyFilePath`が存在すればproxyファイルのパスを返す
  （`:2103-2104`）。エクスポート時は`'exportOriginal'`固定
  （`src/utils/sharedRendererExportSession.ts:64`）でproxyを使わない。
- proxyパスは常駐デコーダの`NativeOverlayResidentVideoDecoder::open`に
  そのまま渡り（`native-overlay/src/lib.rs:651-652`、
  `native_video_source_path`は`file:`プレフィックスの有無で分岐するだけで
  fpsに関する処理は一切ない、`:798-810`）、実体ファイルとしてproxy(.mp4)が
  開かれる。
- 一方、`request_frame`内の`target_seconds`計算
  （`native-overlay/src/lib.rs:676-677`）は
  `request.source_frame * request.source_rate.denominator / request.source_rate.numerator`
  ——**タイムラインのソースフレーム番号×プロジェクトfpsのみで決まり、
  開いている物理ファイル（元 or proxy）のfpsや実尺を一切参照しない**。
  クリップの尺自体は取り込み時に元ファイルを`ffprobe`した値
  （`src/utils/mediaMetadata.ts`）から決まる。
- したがって、もしGX010052のようにproxyの実尺が元より大幅に短い場合、
  タイムライン後半へのシーク要求（`target_seconds`が元の536s基準で
  268s等）は、実際には224.6sしか収録されていないproxyファイルの
  範囲を超える。この場合`request_frame`は`session.next_frame()`が
  `None`を返す→`!seeked`なら1度だけseek再試行→それでも尽きれば
  `Err("...reached end of stream...")`（`lib.rs:736-741`）で**エラー終了**
  する経路に入る。これは「動画全体が滑らかに2〜3倍速に見える」という
  症状とは異なり（**むしろ再生がクリップ後半で失敗/停止する**）、
  タスクが想定した「2〜3倍速の視覚的先行」を直接説明するものではない。
  ただし体感として「動画の見た目の進みが音声より大幅に速く、途中で
  詰まる/止まる」という報告であれば整合しうる余地はある（未確認）。
- なお今回の主要検証素材`hevc36m_30fps_174s.mp4`にはproxyファイルが
  存在しない（`perf/heavy-media/`内に`.proxy.mp4`なし）ため、この
  proxy起因の経路は今回のE2E実測（判明した事実1・2）には関与していない
  ——両者は独立した論点。

### 結論

- タスクが指示した「常駐デコーダのPTS vs 別`HTMLVideoElement`」という
  二重クロック構成は、通常のプレビュー再生経路（`videoSourceMode:
  'previewProxy'`, `videoPresentationSource: 'external-video-source'`）
  では**成立していない**ことを2回のE2E実測で確認した（`native-render-frame`
  0発火、frame進行レートは59.92/59.97fpsで壁時計と誤差0.1%未満、2〜3倍速の
  兆候なし）。よって本タスクの主要仮説（visible pixelが常駐デコーダPTS
  由来で音声非同期にドリフトする）は、この構成・この素材では**再現しな
  かった（未確証、要件を満たす形での完全な反証ではない — audio側の実測
  ができておらずvideo側も「要求クロック」しか見れていない制約付き）**。
- 一方で、**GX010052（≈120fps GoPro素材）のproxy生成が実尺・実フレーム数
  を2.388倍も短く生成してしまうバグを新たに発見した**（タグ上のfpsは
  元と同一のため、メタデータだけを見ると気づきにくい）。これは
  `previewProxy`モードで常駐デコーダがproxyファイルを開く経路
  （`rust-core`側フレーム位置計算はproject fpsのみに依存）と組み合わさると、
  タイムライン後半で`request_frame`がEOFエラーに達する実害がある可能性が
  高い。ユーザー報告の「2〜3倍速」がこの種の高fps素材・proxy利用時の
  症状を指している可能性は残るが、今回検証した`hevc36m_30fps_174s.mp4`
  （proxyなし）のシナリオとは別原因であり、切り分けが必要。

### 次の一手 / 未検証事項

1. **GX010052のproxy生成バグの一次切り分け**: `-hwaccel videotoolbox`を
   外した場合・`libx264`パス（非macOS既定コーデック）を強制した場合に
   同じ2.388倍のフレーム欠落が起きるか確認する。VideoToolboxのGPUデコード
   段が可変フレームレート入力を誤処理している可能性が高い。
2. **GX010052 + previewProxyでの実再生確認**: 実際にタイムライン後半まで
   シークし、`request_frame`が`reached end of stream`エラーで止まるか、
   あるいは体感上「速く進んで止まる」ように見えるかをE2Eまたは手動で確認。
3. **audio側（`HTMLVideoElement.currentTime`）の実測**: 今回`document`に
   非アタッチのため`querySelectorAll('video')`で拾えなかった。
   `sharedRendererExternalVideoSourcesByClipId`等、モジュール内部の
   registryを`window`経由で露出するデバッグフックを追加するか、
   `syncSharedRendererExternalVideoPlayback`側に直接ログを仕込む
   アプローチに切り替える必要がある。
4. **`native-render-frame`経路を実際に発火させる条件の特定**: どの操作・
   設定（エクスポート、特定の素材種別等）で`sharedRendererNativeRenderFrameUpload`
   が生成され`nativeRenderFrameReady`になるかを特定し、その条件下で
   常駐デコーダの`request_frame`にPTSログ（`[vspeed-probe]`）を仕込んで
   再計測する。これができて初めてタスク本来の「常駐デコーダPTS vs
   HTMLVideoElement」比較が成立する。

## 最終確認（2026-08-22, feature-proxyブランチ）

上記の切り分けの続きとして根本原因を最終確認した。**`GX010052.proxy.mp4`自体は
本アプリのプロキシ生成（`rust-backend`の`proxy.generate`）が作ったものではなく、
外部ツール製（libx264・音声トラック付き）の異質なファイルだった。** 本アプリの
`check-proxy` IPCハンドラ（`electron/main.ts`）は隣接する`<name>.proxy.mp4`を
**無検証で**採用する仕様だったため、このタイムラインが2.388倍圧縮された
（オリジナル536.5s→プロキシ224.6s）異質プロキシがそのまま`previewProxy`モードの
映像ソースとして採用され、音声はオリジナルファイルから再生される、という
組み合わせが「映像が音声より2〜3倍速く見える」というユーザー報告の直接原因
だったと確認した。本アプリ自身のプロキシ生成ロジック（`proxy.generate`）は
このタイムライン圧縮を起こしておらず無実である。

修正: `check-proxy`／`generate-proxy`双方でオリジナルとプロキシの再生時間を
ffprobeで検証し、許容誤差（2%または0.5秒）を超えるプロキシは不採用にした。
詳細は `progress/foreign-proxy-validation.md`、実装は
`src/utils/proxyValidation.ts` / `electron/main.ts`（コミット: 64df2faa,
fcfafb06, 6b742f16）を参照。

---

## 実測（2026-08-22 追記3）— プロジェクトfps=24（ユーザー再現条件）でのH-60/24説 REJECTED

### 目的 / 仮説

ユーザーからの新規再現報告: `/Volumes/Datadrive/2026-01-07 18-19-31.mov`
（HEVC 1080p, 30fps CFR, 8570秒, 隣接proxyなし＝proxy起因は対象外）を
**プロジェクトfps=24**で再生すると、映像が音声より2〜3倍速く進む。
先行の追記1・2はいずれもプロジェクト既定fps=60（`useStore.ts`既定値と
一致）で計測しており、"projectFps÷60"系の不整合が仮に存在しても
60fpsプロジェクトでは原理的に顕在化しない（60/60=1）ため未検証だった。

仮説H4: `SHARED_RENDERER_PLAYBACK_PREVIEW_FPS = 60`
（`src/utils/sharedRendererPlaybackPreviewSettings.ts:1`）や
`electron/rustScenePlaybackController.ts`のどこかにfps=60のハードコード／
既定フォールバックが残っており、projectFps=24のときに
`60/24 = 2.5`倍（報告の「2〜3倍」と符合）の速度で映像側クロックが
進んでしまう。

### 環境

- ホスト: ローカル macOS（`/Users/yuki/GitHub/UX-Film-Director`, branch `feature-proxy`）
- 素材: `/Volumes/Datadrive/2026-01-07 18-19-31.mov`（ユーザー指定、HEVC,
  1080p, 8570秒。同ディレクトリに`.proxy.mov`等の隣接proxyは存在しないため
  `previewProxy`は原本ファイルをそのまま開く経路になる）
- E2E: `scripts/run-video-load-e2e.mjs`

### 手順・一時計測（すべてrevert済み）

1. **projectFpsの実際の注入経路を先に特定する必要があった**: 当初
   `src/store/useStore.ts:74`の既定値（`fps: 60`）を`24`に書き換えて
   E2Eを実行したところ、native側フレームレートは相変わらず約60fps
   （下記「誤った計測」参照）で進んだ。原因調査の結果、
   `scripts/run-video-load-e2e.mjs`が起動するElectronは
   `?videoLoadE2e=1`クエリでロードされ、**`src/main.tsx:18-32`が
   `videoLoadE2e`等のE2Eクエリを検知すると`initializeProject({..., fps: 60,
   ...})`を無条件に呼び出し、store既定値を上書きしていた**ことが判明。
   つまり`useStore.ts`側の既定値編集はE2E下では無意味であり、
   **先行の追記1・2の計測（"projectFps=60既定のため未上書き"という記述）
   も実際にはこの`main.tsx`の明示的な`fps:60`シードが効いていた**
   （既定値と明示シードが同じ60だったため当時は区別がつかなかった）。
   この事実そのものが、今後同種のfps条件を変えたE2E計測を行う際の
   注意点として重要（store既定値の編集だけでは不十分）。
2. 上記を踏まえ、`src/main.tsx`の`fps: 60`を
   `fps: Number(urlSearchParams.get('fps24Probe') ?? 60)`に変更し、
   `scripts/run-video-load-e2e.mjs`が環境変数
   `UXFD_FPS24_PROBE_PROJECT_FPS`をセットすると
   `?videoLoadE2e=1&fps24Probe=<値>`をElectronへ渡すようにした
   （`[fps24-probe]`タグ、revert済み）。
3. `scripts/run-video-load-e2e.mjs`に`[fps24-probe]`タグのプローブを追加。
   `playbackAdvanceResult.ok`後、`UXFD_FPS24_PROBE_OBSERVE_MS`ミリ秒間
   200ms間隔で以下をサンプリングし`/tmp/fps24-probe-result.json`へ出力
   （revert済み）:
   - `document.documentElement.dataset.uxfdRustPlaybackFrame`
     （native再生クロックの`frameIndex = floor(currentTimeSeconds * active.fps)`、
     `electron/rustScenePlaybackController.ts:296-300`／`:279-285`。
     `active.fps`は`Viewport.tsx:1756`で`fps: projectSettings.fps`として
     `startScenePlayback`に渡される値そのもの）
   - `...VideoPresentationSource`（`external-video-source` /
     `native-render-frame`の切替）
   - `...ExternalVideoMaxAbsDriftMs`（`Viewport.tsx:262-278`。
     `syncSharedRendererExternalVideoPlayback`が計算する
     `targetTimeSeconds - HTMLVideoElement.currentTime`のrun中最大絶対値。
     `targetTimeSeconds = sourceFrameToSeconds(clip.source_frame, media.source_rate)`
     で、`media.source_rate`は素材の実fpsではなく**projectFps自体**
     （`src/utils/rustSceneSnapshot.ts:1352` `source_rate:
     fpsToFrameRate(projectFps)`）なので、単位は自己無矛盾＝この経路には
     そもそも「60/24」のような単位不一致が入り込む余地がないことも
     コードリーディングで確認した）
   - 音声側`HTMLVideoElement.currentTime`の直接取得は今回も見送った
     （前回同様`document`非アタッチで`querySelectorAll('video')`が0件になる
     制約は変わらず、`ExternalVideoMaxAbsDriftMs`が実質的に同じ情報
     ——目標時刻と実際の要素`currentTime`の差——を継続的に公開している
     ためこちらを採用。理由は次項）。
4. CDP `send()`の60秒ハードタイムアウト（既知の制約）を踏まえ、観測窓は
   50秒（`UXFD_FPS24_PROBE_OBSERVE_MS=50000`）。
   `UXFD_VIDEO_LOAD_E2E_EXPECT_RUST_NATIVE_PLAYBACK=1`固定。
5. 実行（3回、いずれも`passed: true`）:
   ```
   UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS=220000 \
   UXFD_VIDEO_LOAD_E2E_EXPECT_RUST_NATIVE_PLAYBACK=1 \
   UXFD_FPS24_PROBE_OBSERVE_MS=50000 \
   UXFD_FPS24_PROBE_PROJECT_FPS=<24|23.976> \
   UXFD_VIDEO_LOAD_E2E_VIDEO_PATH='/Volumes/Datadrive/2026-01-07 18-19-31.mov' \
   node scripts/run-video-load-e2e.mjs
   ```
   - run1（誤り）: `UXFD_FPS24_PROBE_PROJECT_FPS`未実装の状態で
     `useStore.ts`既定値のみ24に書き換えて実行。前述の通り`main.tsx`の
     `fps:60`シードに上書きされ、**実際にはプロジェクトfps=60のまま**
     計測してしまっていた（下記表のrun1として結果は残すが、fps=24の
     計測としては無効）。
   - run2: `main.tsx`修正後、`UXFD_FPS24_PROBE_PROJECT_FPS=24`で実行
     （有効なfps=24計測）。
   - run3: 同上、`UXFD_FPS24_PROBE_PROJECT_FPS=23.976`で実行
     （60を割り切れない分数fpsのケース）。

### 結果

| run | プロジェクトfps（実際に適用された値） | 観測区間 | native `rustPlaybackFrame` 進行レート | 期待値 | 比率(実測/期待) | `ExternalVideoMaxAbsDriftMs` |
|---|---|---|---|---|---|---|
| run1（無効、参考値） | 60（意図は24だったが`main.tsx`に上書きされた） | 50.1s | 59.9〜60.1 frame/s相当（329→3332, 50.127s） | 60fps/s | ≈1.00 | 常時140ms（変化なし） |
| run2（有効） | 24 | 50.1s | 24.02 frame/s（196→1400, 50.115s） | 24fps/s | **1.001** | 常時0ms（変化なし） |
| run3（有効） | 23.976 | 50.1s | 23.97 frame/s（204→1406, 50.145s） | 23.976fps/s | **0.9998** | 常時19ms（変化なし） |

いずれもnativeクロックのframeIndex進行レートはプロジェクトfpsに対し
誤差0.1%未満で一致しており、**2〜3倍速の兆候はまったく観測されなかった**。
`ExternalVideoMaxAbsDriftMs`（目標時刻とHTMLVideoElementの実`currentTime`の
最大乖離）も各runで初期値から一切変化せず（0/19/140msのいずれも一定）、
50秒間の再生を通じて音声・映像ソースの実体である単一`HTMLVideoElement`が
目標時刻から継続的にドリフトしていく様子も確認できなかった。

`videoPresentationSource`は3run・全750サンプルとも一貫して
`external-video-source`（`native-render-frame`は一度も発火せず）で、
これは追記2の結果と同一構成。この素材・このプレビュー再生モードでは
可視ピクセルの実体は常に単一のブラウザ内蔵`HTMLVideoElement`のデコードで
あり、native側`frameIndex`は"要求クロック"（native制御プレーンの目標値）
であって可視ピクセルの直接ソースではない点は追記2と同じ限界として残る。

### 結論

**H4（`SHARED_RENDERER_PLAYBACK_PREVIEW_FPS=60`等の60fpsハードコードに
起因する60/24=2.5倍速）はREJECTED。** ユーザー報告の再現条件（プロジェクト
fps=24、FHD、proxyなし）を実際に再現してnativeクロックを計測したが、
frameIndex進行はプロジェクトfpsと誤差0.1%未満で一致しており、
`SHARED_RENDERER_PLAYBACK_PREVIEW_FPS`（プレビューtime量子化専用の定数、
`quantiseSharedRendererPlaybackPreviewTime`でのキャッシュ丸めにしか
使われず、`startScenePlayback`のfps値には一切混入しない
——コードリーディングでも確認済み）や、`rustSceneSnapshot.ts:2224`の
コメントが指す丸め誤差（クリップ終端1フレーム分のクランプ処理）も、
いずれも継続的な倍速化を起こす経路ではないことが実測でも裏付けられた。

一方で、この調査の副産物として**「E2Eでプロジェクトfpsを変えて計測する
際は`useStore.ts`の既定値を書き換えるだけでは不十分で、
`src/main.tsx`のE2E専用`initializeProject({ fps: 60, ... })`シードが
優先して効いてしまう」というハーネス上の落とし穴を発見・記録した**
（run1が事故的にこれを実証している）。今後同種の計測をする者は
`main.tsx`側のシードも確認すること。

### 次の一手 / 未検証事項

1. 本追記でも「音声側の実体である`HTMLVideoElement`の`currentTime`を
   壁時計に対して直接プロットする」計測は未達成のまま
   （`ExternalVideoMaxAbsDriftMs`という間接指標での代替に留まる）。
   `sharedRendererExternalVideoSourcesByClipId`相当のレジストリを
   `window`経由に露出するデバッグフックを追加すれば直接測れる
   （追記2の未検証事項3と同じ）。
2. 今回は8570秒中の先頭50秒しか観測していない。ユーザー報告が
   タイムライン後半・長時間再生後にのみ出る症状である可能性は
   未検証（対象ファイルは30fps・非proxyのため追記2で見つかった
   「120fps proxyのタイムライン圧縮」バグとは無関係だが、8570秒という
   長さ自体に起因する別の蓄積誤差経路は排除できていない）。
3. `native-render-frame`経路（常駐デコーダのPTSが可視ピクセルの直接
   ソースになるモード）を実際に発火させる条件はまだ特定できておらず、
   その経路での同様の計測は未実施（追記2の未検証事項4と同じ）。
4. ユーザー報告の実際の操作手順（プロジェクトfpsをどこで24に設定したか、
   単に既定新規プロジェクトなのか、既存プロジェクトの読み込みなのか）を
   まだ本人確認できていない。仮に別の未確認な操作（シーク、複数クリップ、
   特定の再生UI操作）が絡む場合、本追記の再現条件（新規インポート→
   即再生）ではカバーできていない。

---

## 静的調査（2026-08-22 追記4）— H6「fps設定変更の伝播バグ」はREJECTED（そもそもUI上に変更経路が存在しない）

### 目的 / 仮説

追記3の未検証事項4を受けた仮説: ユーザーは既定60fpsでプロジェクトを作成した後、
UI上でfpsを24へ**変更**しており、ネイティブ再生クロックのfps payload
（`electron/rustScenePlaybackController.ts` `startScenePlayback`）か、
シーンスナップショットの`source_rate`/frame domain（`src/utils/rustSceneSnapshot.ts`）の
どちらか片方が旧値のまま取り残されるとクロック比が `60/24=2.5`倍
（または `24/60=0.4`倍）になり、報告の「2〜3倍速」と符合する、という想定。

### 手順（静的読み込みのみ、E2E拡張は実施せず——理由は下記結論を参照）

1. **プロジェクト作成後にfpsを変更するUIそのものを探索**した。
   - `src/store/useStore.ts`には`projectSettings`を書き換えるアクションは
     `initializeProject`（新規プロジェクト作成、1回だけ呼ばれる）と
     `loadProject`（プロジェクトファイルを開く）の2つしか存在しない。
     `setProjectSettings`や`updateProjectSettings`のような「開いているプロジェクトの
     fpsだけを変える」アクションは**リポジトリ全体に存在しない**
     （`grep -rn "setProjectSettings\|updateProjectSettings" src`は0件）。
   - fpsを選択できるUIは`src/components/ProjectSetup.tsx:100-108`の
     新規プロジェクト作成ダイアログの`<select>`（24/30/60fpsの3択、既定60）
     のみで、これは`initializeProject`を1回呼ぶだけの「プロジェクト作成前」画面。
     作成後の設定パネル・メニュー・コマンドパレット
     （`src/commands/registerAppCommands.ts`）・agentProject経路
     （`src/agentProject/agentProject.ts:541`は生成時に`fps: spec.project.fps`を
     渡すのみで、これも「作成」であって「変更」ではない）のいずれにも、
     既存プロジェクトのfpsを書き換える操作は存在しない。
   - つまり**「60fpsで作って後からUIで24に変更する」という追記3の想定操作自体が
     現行コードベースには実装されていない**。この時点でH6が指す「fps設定変更の
     伝播バグ」という現象クラスは、UI経由では原理的に発生し得ない。
2. 念のため、より現実的な代替経路（アプリを再起動せず**別のプロジェクトファイルを
   開き直す**＝`loadProject`で新しいfpsに切り替わるケース）についても、
   ネイティブクロックとスナップショット双方が新fpsに追従するかを確認した:
   - ネイティブ再生clockのfps payload: `Viewport.tsx:1717-1794`の
     `startScenePlayback`呼び出しeffectは依存配列に`projectSettings.fps`を
     含む（`:1790`）。`loadProject`で`projectSettings`が入れ替われば
     このeffectは再実行され、`fps: projectSettings.fps`（`:1753`）は
     常に最新値を送る。
   - シーンスナップショット側: `controller.replaceScene`を呼ぶeffect
     （`Viewport.tsx:1648-1675`）も依存配列に`projectSettings.fps`を含む
     （`:1673`）。呼び出し先`replaceScene`
     （`src/utils/editableRustScenePreviewController.ts:37`）にメモ化や
     差分スキップは無く、呼ばれるたびに`buildRustSceneSnapshot`系の関数へ
     現在の`projectSettings`をそのまま渡して毎回フル再構築する。
   - `source_rate`自体も`rustSceneSnapshot.ts:1352`
     `source_rate: fpsToFrameRate(projectFps)`で、スナップショット構築の
     たびに`projectFps`（呼び出し引数）から都度導出——**フレーム単位で
     取り込み時に固定して後で使い回すキャッシュは存在しない**
     （`source_frame`計算も`sourceFrameForObject(object, time, projectSettings.fps)`
     `:274`で、常に現在の`time`（秒）と現在の`fps`から都度算出。
     オブジェクト側に「インポート時にフレーム換算して保存」というフィールドは
     見当たらなかった）。
   - よって`loadProject`経由のfps切替でも、ネイティブclock側・スナップショット側
     の両方が同一effectサイクルで同じ新しい`projectSettings.fps`を参照するため、
     系統的に片方だけ古い値が残る経路は見当たらない。

### 結論

**H6（fps設定変更時の伝播バグ）はREJECTED。** 棄却の根拠は2段階:

1. （一次的・決定的）そもそも**「既存プロジェクトのfpsをUIから変更する」機能が
   このコードベースに実装されていない**。fpsは`ProjectSetup.tsx`の新規作成
   ダイアログでのみ選択され、以後は不変。したがってタスクが想定した
   「ユーザーが60fpsで作って後から24に変更した」という操作自体が起こり得ず、
   このタスクで検証対象とすべき"伝播バグ"は存在しない。
2. （二次的・念のため）唯一fpsが変わり得る`loadProject`（別プロジェクトを開く）
   経路についても、ネイティブclockのfps payloadとスナップショットの
   `source_rate`/`source_frame`は共に`projectSettings.fps`から**都度**
   再導出される設計で、どちらかだけが古い値を保持し続けるキャッシュや
   メモ化は見当たらなかった。E2Eでの実測（フェーズ2）は、再現不能な
   前提（存在しないUI操作）を対象にしても意味がないため**実施しなかった**。

先行の追記1〜3（fps不一致説、H3、H4のいずれもREJECTED）と合わせ、
「fps」を切り口にした一連の仮説はすべて棄却済みとなった。ユーザー報告の
真因は依然未確定。次に疑うべきは、`.mov`固有の何か（HEVCデコード特性、
CFR/VFRタイムスタンプの扱い、あるいは今回のファイルパス
`/Volumes/Datadrive/...`が外部ドライブであることに起因するI/O遅延と
それに対するcatch-up/skipロジックの相互作用）など、fps数値そのものとは
別の軸である可能性が高い。

### 次の一手 / 未検証事項

1. **ユーザーへの追加ヒアリングが必須**: 「fpsを変更した」という報告の
   具体的操作手順を再確認する（現行UIにその機能がない以上、実際に行った
   操作は別のもの——例えば単に新規プロジェクトをfps24で作成しただけ、
   といった誤解や、別バージョン/別ブランチのUIを見ている可能性がある）。
2. `追記1`の「独立音声クリップ＋動画同時再生時の0.2s/0.05sスナップ発火」、
   `追記2/3`の「`native-render-frame`経路を発火させる条件の特定」、
   「音声側`HTMLVideoElement.currentTime`の直接実測（DOM非アタッチ問題の
   解消）」は、fps系仮説がすべて棄却された今、優先度を上げて着手すべき
   残タスクとして持ち越す。
3. 外部ドライブ（`/Volumes/Datadrive/`）上の大容量ファイル特有のI/O遅延・
   キャッシュミス頻度が、既存のcatch-up/frame-skipロジック
   （`native-overlay/src/lib.rs`のnon-sequential request_frame経路、
   `video-playback-probe-results.md`のH1関連）と組み合わさって体感速度の
   ズレを生んでいないか、ローカルSSD上のコピーとの比較実験で切り分ける。

## 追記4: メカニズム確定（プローブ実測により CONFIRMED）

上記フェーズまでの「fps系仮説はすべてREJECTED」判定は覆らないが、真因は
やはり fps 数値そのものに起因していた。ただし「fps変更の伝播バグ」では
なく、**project fps が material（素材動画）fps を上回るケースで
`NativeOverlayResidentVideoDecoder::request_frame`（`native-overlay/src/lib.rs`）
が逐次要求のたびに無条件で最低1フレームを decode してしまう」という
別のメカニズムだった。

`[vspeed2-probe]` eprintln 計測による実測値:

- 60fpsプロジェクト・30fps素材: `rate=60/1` で `target_seconds=36.6s` の
  要求に対し `served pts_seconds=72.2s` を返しており、正確に **2.0倍**
  （= `projectFps / materialFps` = 60/30）のズレ。target は 1/60s ずつしか
  進まないのに、素材側は `next_frame()` 呼び出し1回ごとに 1/30s 進んで
  しまうため。
- 24fpsプロジェクトでは **1.0倍**（ズレなし）だった。24fpsのtargetステップ幅
  （1/24s ≈ 41.7ms）が30fps素材のフレーム長（1/30s ≈ 33.3ms）より大きく、
  逐次要求のたびに旧実装の `reached_target` 判定がたまたま満たされていた
  ため、症状が顕在化しなかった。

音声は `HTMLVideoElement` から独立に再生されるため本バグの影響を受けず、
映像のみが早送りされることでA/Vズレとして観測されていた。

これまでのE2Eベースの検証がこのメカニズムを見逃していたのは、いずれも
**再生ズレの有無を体感時間や録画のフレーム目視で判定しており、
「decoderに実際に要求したtarget_seconds」と「decoderが実際に返した
served pts」を突き合わせて計測していなかった**ため。この2値の差分こそが
決定的な証拠であり、今回はじめてプローブでその数値を直接記録したことで
メカニズムを確定できた。

修正内容・判定関数のテストは `progress/video-frame-reuse-fix.md` を参照。
