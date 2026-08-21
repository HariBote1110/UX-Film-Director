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
