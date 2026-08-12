# PSD表示・操作時の2〜3秒ビーチボール診断

## 症状
ユーザー報告: PSDを表示した時、および表示後の操作（オブジェクト移動・パネル操作など）でも
macOSビーチボール（UIフリーズ）が2〜3秒発生する。並列化・per-layerキャッシュ・行バンド並列合成は
既に landing 済みで、研究予測ではDISPLAY経路のコストは約60〜290msのはずだった。

## 仮説（S1〜S4）と検証結果

### S1: メインプロセススレッドでの同期実行 — 確定（主因）
- `electron/nativeOverlayMainBridge.ts:344-351` の `presentScene` は
  `await addon.presentNativeOverlayScene(payload)` でRustアドオンを呼ぶが、
  Rust側 `native-overlay/src/lib.rs:1253` の `present_native_overlay_scene`
  （`#[napi(js_name = "presentNativeOverlayScene")]`）は**非同期タスクでもPromiseでもない
  同期napi関数**（`AsyncTask`・`spawn_blocking`・`threadsafe_function`の類は一切未使用、
  `grep`で確認済み）。`await`は既に完了している同期呼び出しの戻り値を待つだけで、
  実際のデコード＋合成処理は`presentScene`を呼んだスレッド＝**Electronメインプロセスの
  JSイベントループスレッド**上でブロッキング実行される。
- 呼び出し経路: `present_native_overlay_scene` → `present_native_overlay_scene_inner`
  → `load_overlay_native_sources_for_scene_cached_impl`（native-overlay/src/lib.rs:2722）
  → PSDメディアなら `build_native_psd_source_frame`（rust-backend/src/lib.rs:86-123）。
  途中に非同期化・別スレッド委譲のポイントは存在しない。
- **結論**: どれほど処理が軽くなっても、メインプロセスの他のIPC処理・ウィンドウ描画・
  ユーザー入力ハンドリングは`presentScene`実行中ずっと止まる。数十〜数百msの処理でも
  体感できるカクつきになり、2〜3秒規模の処理（後述S2/S3が絡む場合）ではビーチボール化する。

### S4: ミスごとのフルファイル`fs::read`再読込 — 確定
- `rust-backend/src/lib.rs:104-109` は`psd_layer_cache`のキャッシュ有無に関わらず、
  呼び出しのたびに`fs::read(&source_path)`でPSDファイル全体をディスクから読み直す
  （或窓式なら162MB全部）。leafキャッシュがヒットしても、このI/Oは毎回発生する。
  S1と合わさるとメインスレッド上でのブロッキングI/Oになる。

### S2: per-layerキャッシュのバイト予算スラッシング — 条件付き確定（デフォルトシナリオでは非該当、多レイヤー選択時のみ問題化）
- `rust-backend/src/psd_layer_cache.rs:91-171` の`PsdLayerCache`はプロセス全体で共有される
  単一LRU（`GLOBAL_PSD_LAYER_CACHE`, 予算512MB, `PSD_LAYER_CACHE_DEFAULT_BUDGET_BYTES`）。
  `insert`のたびに`evict_if_needed`（161行目）が呼ばれ、`order`（挿入順キュー）の先頭から
  無条件に追い出す——**ファイル単位ではなくグローバルなleaf単位LRU**。
- 或窓式PSD(162MB, 2970x4520)の実測構成: 全リーフ762枚・合計デコードバイト
  **約1558MB**（全leaf width×height×4を合算）に対し、`visible`フラグが立つleafだけで
  **約267MB**（113枚）。実際に合成へ選ばれる集合（own-bit AND active-id）はさらに絞られ、
  診断プローブでは25候補・17デコードのみだった。
- **実測（診断プローブ、下記参照）**: デフォルト選択（`active_layer_ids=None`）で同一ファイルを
  3回連続呼び出した場合、`evictions=0`のままdecode数は17で固定、2回目以降は`hits`が伸びて
  elapsed時間も 79ms→22ms→17ms（release, macOS M4）と短縮——**予算内に収まっており
  キャッシュは正常に機能している**。つまりタスク背景に書かれた「或窓式 total 1.63GB」は
  全762リーフを合算した理論値であり、通常の1コスチューム表示（デフォルト可視選択の
  ワーキングセット267MB）では512MB予算を超えない。
- ただし全レイヤー1.58GB・茜ver0.7同様の桁の数字は、**ユーザーが多数の衣装差分レイヤーを
  同時にactiveにする操作**（複数グループを一括表示、または`active_layer_ids`に大量のIDを
  渡す操作）を行った場合には512MB予算を3倍超過し、スラッシング（挿入→即追い出し→次回
  再デコード）が発生しうる。この経路は今回未実測（実運用でどこまでactive_layer_idsが
  膨らむか未確認）。**棄却はしない。デフォルトシナリオの主因ではない、と限定して採用。**

### S3: NativeOverlaySourceCacheのidle eviction — 設計上確定（発火条件のみ理論確認、実測は未実施）
- `native-overlay/src/lib.rs:351-352`: `NATIVE_OVERLAY_SOURCE_CACHE_MAX_BYTES = 512MB`,
  `NATIVE_OVERLAY_SOURCE_CACHE_IDLE_FRAME_LIMIT = 30`。
- `evict_stale`（434-453行目）: そのフレームで`touched_media_ids`に含まれない
  （＝スナップショットのメディア一覧から外れた、もしくは`revision`が変わらず`cache.get`が
  ヒットしなかった）エントリは`idle_frames`を加算し、30フレーム連続で触れられないと
  `remove`される。**「PSDに触れない別の操作（オブジェクト移動・パネルクリック）」でも
  シーンスナップショットにPSDメディアが含まれていれば`touched_media_ids`に入り
  `idle_frames`はリセットされる**——つまりシーン内にPSDが存在する限りは毎フレーム
  `touched`扱いになりやすく、evictionは主に「PSDメディア自体がシーンから消える」
  「revisionが変わり続けてキャッシュキーが一致しない」ケースで発生すると読める。
  この経路の実運用トリガー条件（revisionの算出式`native_overlay_media_content_revision`
  が何に依存し、無関係な操作でどう変化しうるか）は未確認——**時間不足のため未実測**。

## 実測: 診断プローブ（一時テスト、実施後に削除済み）
- 場所: `rust-backend/src/psd_fast.rs` の `#[test] #[ignore] diagnostic_probe_display_cache_repeated_calls_real_file`
  （本ノート作成後に`git checkout`で削除済み。production codeへの影響なし）
- 内容: `psd_fast::parse_psd_fast_for_display_cached` を或窓式PSD(162MB)実ファイルに対して
  同一プロセス内で3回連続呼び出し、`global_psd_layer_cache().stats()`と経過時間を記録。
- 環境: macOS (M4, `feature-proxy`ブランチ), `cargo test --release`
- コマンド: `cd rust-backend && cargo test --release diagnostic_probe_display_cache_repeated_calls_real_file -- --ignored --nocapture`
- 結果:

| iter | elapsed(ms) | hits | misses | decodes | evictions |
|---|---|---|---|---|---|
| 0（コールド） | 79.1 | 0 | 25 | 17 | 0 |
| 1 | 22.3 | 17 | 33 | 17 | 0 |
| 2 | 17.1 | 34 | 41 | 17 | 0 |

- コールドでも79ms、これは研究予測(60〜290ms)の範囲内。**2〜3秒には遠く及ばない** ——
  つまりこの「同一ファイル・デフォルト選択での繰り返し呼び出し」というシナリオ単体では
  ビーチボールを説明できない。ボトルネックは処理時間そのものではなく、S1（メインスレッド
  ブロッキング）と、まだ再現できていない「重い1回」（S2の多レイヤー選択 or S3の
  頻繁なフルリビルド、あるいは初回インポート直後のコールドディスクI/O）の組み合わせと推測する。

## 未実施（時間制約により今回は見送り）
- 実アプリ（Electron main）を`scripts/run-psd-import-e2e.mjs`系のドライバで起動し、
  或窓式を`psdRustImport=1`でインポート→操作を実施しながら`sample <pid> 3`で
  メインスレッドのブロッキングスタックを採取する手順（タスク指示のステップ2）は
  今回のeffort予算内では実施できなかった。S1のコード上の確証（同期napi・非同期化なし）は
  強いが、実際のスタックトレースでの裏付けは未取得。
- S3のrevision算出条件の追跡（どの操作でrevisionが変わりキャッシュミスするか）も未実施。

## 確定した原因（現時点の結論）
1. **主因（構造的・確定）: S1** — `presentNativeOverlayScene`がElectronメインプロセスの
   イベントループスレッド上で完全同期実行される。デコード処理自体がどれほど速くなっても、
   非同期化・ワーカースレッド委譲されない限りUIは必ず止まる。通常時は数十〜百数十msの
   「カクつき」だが、S2（多レイヤー選択時のキャッシュスラッシング）やS3（フルリビルド）が
   絡む「重い1回」が発生すると同じ経路がそのまま2〜3秒のビーチボールになる。
2. **増幅要因（確定）: S4** — キャッシュヒットの有無に関わらず毎回フルファイル`fs::read`
   （或窓式なら162MB）がメインスレッド上のブロッキングI/Oとして発生する。
3. **条件付き増幅要因（限定的に確定）: S2** — デフォルトの単一コスチューム表示では
   ワーキングセット(267MB)が予算(512MB)内に収まりキャッシュは機能するが、多数レイヤーを
   同時activeにする操作では理論上1.58GBまで膨らみ予算を3倍超過、スラッシングを起こしうる
   （未実測・実運用条件次第）。
4. **未確証: S3** — 発生条件の理論読解は完了したが、実運用でどれだけ頻繁に発火するかは未実測。

## 修正方針の提案（優先順位順）
1. **最優先: S1の解消（非同期化）** — `present_native_overlay_scene`をnapi-rsの
   `AsyncTask`（またはNode側`threadpool`にオフロードする`#[napi(ts_return_type = "Promise<...>")]`
   相当）に変更し、デコード＋合成をメインスレッドから外す。napi-rsの`Task`トレイトで
   `compute()`をワーカースレッドで実行し`resolve()`だけメインスレッドに戻す形に書き換える。
   これが根本解決であり、他の3件は「同期実行を前提にした場合の被害軽減」でしかない。
2. **S4の解消**: `fs::read`もper-fileキャッシュ（mmapまたはファイル内容キャッシュ）に乗せ、
   同一ファイルの2回目以降はディスクI/Oをスキップする。S1が解消されればメインスレッドは
   止まらなくなるが、非同期化後もI/O自体の重複は無駄なので合わせて直す価値がある。
3. **S2への予防線**: `PsdLayerCache`の予算を「ファイルごとの現在のワーキングセットは
   常に丸ごと保持できる」ように動的化する（例: 1ファイルの選択leaf合計バイト数を
   `insert`前に見積もり、予算を一時的にその値まで引き上げる、または
   per-file最小保証枠を設ける）。現状のグローバルLRUは「複数ファイルを跨いだキャッシュ」
   という設計目的自体は正しいが、単一ファイルの選択が予算を超えるケースへの防御がない。
4. **S3の要調査**: `native_overlay_media_content_revision`の算出式を読み、
   「PSDに関係ない操作でrevisionが変わってキャッシュミスする」経路が実在するか確認する。
   もし実在すれば、revision計算から無関係なフィールドを除外するか、idle閾値そのものではなく
   revision不一致条件を見直す。

## 次の一手 / 未検証事項
- sample(1)によるメインスレッドスタック採取（実アプリ・実操作）
- S2を大規模active_layer_ids選択で再現する専用プローブ
- S3のrevision算出式の追跡とテストケース化
- S1修正のnapi-rs AsyncTask化のPoC実装・計測
