# 再生中のレンダラー毎フレーム再レンダリング

## 決定

描画をRust/GPUへ移管した後もレンダラーメインスレッドのbusy率が42%あった。
Chromium描画APIの監査では2Dプレビューの本番描画経路は既にnative側へ分離済み
だったため、残っているのは**描画ではなくReactの再レンダリング**だと判断し、
高頻度更新される `currentTime`（`src/store/slices/playbackSlice.ts`）の
購読範囲を縮小する方針を採った。

既存の `src/components/TimelineCurrentTimeIndicator.tsx` が「毎フレーム購読者
だけを小コンポーネントへ切り出し、親を巻き込まない」パターンとして機能して
いたため、これを踏襲した。

- `TimelineControlBar`: `shallow` セレクタの比較対象に `currentTime` を含めて
  いたため毎フレーム等価判定に失敗し、再生ボタン群ごと再レンダーされていた。
  時刻表示を `TimelineCurrentTimeDisplay` へ切り出し、セレクタから除いた。
- `PropertyPanel`: `currentTime` をトップレベルで購読していたが、**JSX描画には
  一切使われておらず**、`mediaTimeForSelectedVideo` がイベントハンドラから
  呼ばれるときに読むだけだった。購読を削除し `useStore.getState().currentTime`
  の読み捨てへ変更した（`src/components/Timeline.tsx:468` と同じ流儀）。

## 実測（1台・開発ビルド。修正後は3回測定）

重量E2Eの再生3.6秒区間のChromiumレンダラートレース。修正後は同一に近い構成で
3回測っている（①は選択デコレーション実験前、A/Bは実験時の選択あり／クリア）。

| 指標 | 修正前(1回) | 修正後① | 修正後A | 修正後B |
|---|---|---|---|---|
| busyMs | 1516.5 | 1363.2 | **970.3** | 1519.7 |
| scriptingMs | 448.2 | 263.7 | 295.8 | 363.2 |
| scriptMs | 406.0 | 222.9 | 247.6 | 308.9 |
| React再レンダー関数 | 305.8 ms / 212回 | 120.4 / 212 | 170.9 / 210 | 195.3 / 210 |
| `Receive mojo reply` | 508 / 311 | 602 / 395 | **108 / 67** | 465 / 249 |
| layoutCount | 213 | 213 | 211 | 211 |

E2Eはいずれも総合PASS、`settled: true`、runtimeErrors / MissingSource / WGPUエラーは
すべて0件。

### 信頼できる結論

- **scripting の削減は実在する**。修正後3サンプルの `scriptMs` は 223 / 248 / 309 で、
  いずれも修正前の 406 を下回る。React再レンダー関数の時間も 120 / 171 / 195 で
  修正前 306 を一貫して下回る。削減幅は **-40〜45%** 程度と見るのが妥当。
  `PropertyPanel` と `TimelineControlBar` を毎フレーム経路から外した構造的変更なので、
  測定以前に効果が説明できる。

### 信頼できない指標（重要）

- **`busyMs` / `busyRatio` は単発比較に使えない**。修正後だけで 970〜1520 と
  1.6倍ばらつく。当初「busyMs -10%」と記録したが、これは誤差の範囲だった。
- **`Receive mojo reply` は原因帰属に使えない**。同一に近い構成で 67回〜395回と
  6倍ばらつく。一時「単一項目で最大のコスト」と判断したが、それは1サンプルに
  基づく誤りだった。
- **`exportRun.durationMs` もばらつく**（42.6 / 60.3 / 67.7 秒）。

### 安定している指標

`callCount`（212 / 212 / 210 / 210）と `layoutCount`（213 / 213 / 211 / 211）は
ほぼ完全に安定している。**今後の性能検証はミリ秒ではなく、これらの回数系指標を
一次根拠にする。** 回数が減れば構造が変わった証拠になり、ミリ秒は補助的に見る。

## 再生ヘッドのref+transform化（結果: 回数系指標は変わらなかった）

Beta-481aで `TimelineCurrentTimeIndicator` を、`useStore` の購読による再レンダーから
`useStore.subscribe` + `ref` による `transform: translate3d()` の直接更新へ変更した
（storeは `subscribeWithSelector` を使っていないため素の `subscribe` で差分判定）。
`left` の更新をやめたのはレイアウトを避けるためである。

**しかし計測では `callCount` 211、`layoutCount` 213 でいずれも変化しなかった。**
狙った「毎フレームのReactコミット1回を取り除く」効果は出ていない。

理由は下記のとおり、毎フレームのコミットが `TimelineCurrentTimeIndicator` ではなく
`Viewport` 由来だったためである。Reactは1フレームに複数コンポーネントが再レンダー
されても1コミットにまとめるので、`Viewport` が毎フレーム再レンダーする限り
コミット回数は減らない。

この変更自体は `left` → `transform` の分だけ合成側に有利で、再生ヘッドをReactの
毎フレーム経路から外してもあるため残置する。ただし**現時点で測定可能な効果は無い**。
`Viewport` の再レンダーを止めたあとに初めて効果が現れる位置づけである。

## 残っている問題（→ Beta-482aで解決。後述「解決」節を参照）

- **再レンダー回数は210〜212回のまま**、つまり依然として毎フレーム1回Reactが走る。
  これまでに減ったのは1回あたりの仕事量だけである。

  原因は特定済みで、**`Viewport` のJSX自体が `currentTime` に依存している**こと。
  選択枠オーバーレイの位置計算がレンダー中に行われている
  （`src/components/Viewport.tsx:2456, 2478, 2491-2524`：`evaluateObjectPositionAtTime`、
  `getGroupTransforms`、`getVibrationOffset` を `currentTime` 付きで呼び、子へ
  `time={currentTime}` を渡している）。したがって effect を切り出すだけでは足りず、
  **この `currentTime` 依存のJSXサブツリー（選択枠オーバーレイ）を独立コンポーネントへ
  抽出する**必要がある。

  ただし選択枠は `progress/five-bugs-structural-redesign.md` と
  `progress/selection-decoration-phase2-visibility-and-codelivery.md` にある通り、
  ズレ・幽霊表示のバグを繰り返してきた領域である。抽出は相応のリスクを伴うため、
  単独のタスクとして時間を取り、選択枠の既存契約テストを厚くしてから着手するべき。
- **layoutCount 213 も不変**。再生ヘッドを `transform` 化しても変わらなかったため、
  毎フレームのレイアウトは再生ヘッド由来ではない。残る候補は
  `TimelineCurrentTimeDisplay` の時刻テキスト更新と、`Viewport` の再レンダーに伴う
  DOM更新。`Viewport` を止めるまで切り分けられない。
## 選択デコレーションのIPC切り分け実験（結果: 仮説は否定された）

`Receive mojo reply` の発生源として、`src/components/Viewport.tsx:954-1019` の
選択デコレーション送信effectを疑った。依存配列に `currentTime` を含むため再生中は
毎フレーム再実行され、`nativeOverlayBodyCoDeliveryEligible` が
`VITE_UXFD_RUST_VIDEO_ONLY === '1'` 前提でこのE2Eでは常にfalseになるため、
`shouldSendStandaloneDecoration` が無条件にtrueを返す状態だった。

そこで `UXFD_REALISTIC_HEAVY_EDIT_CLEAR_SELECTION_BEFORE_PLAYBACK=1` を追加し、
再生計測区間の直前に選択をクリアして比較した（プロダクションコードは変更していない）。

- A（選択あり）: `Receive mojo reply` 108ms / **67回**
- B（選択クリア）: `Receive mojo reply` 465ms / **249回**

選択をクリアした方が**多い**という逆の結果になった。よって選択デコレーション送信は
`Receive mojo reply` の主因ではない。この指標自体が run-to-run で6倍ばらつくため、
単発測定での原因帰属は不可能である。

トレース側の制約も判明した。Electronはrenderer↔main間の全チャネルを単一の
`electron.mojom.ElectronApiIPC` に集約するため（368件すべてが同一 `ipc_hash`）、
**トレースからチャネル別の内訳は特定できない**。IPC発生源を特定したい場合は、
main process側でチャネル別カウンタを取るなど別の計測手段が必要。

## 制約・注意点

- 上記の数値は1台のMac・開発ビルド・各1回の測定であり、性能回帰の閾値には
  使えない。特に `Receive mojo reply` の増加を回帰と断定するには反復測定が要る。
- `markdown/Performance_Concerns.md` に `Timeline` / `Viewport` / `PropertyPanel`
  の毎フレーム再レンダー問題が「推測ベースの既知の懸念（優先度：高）」として
  記載されていた。今回のトレースはそれを実測で裏付けたものであり、
  今後は推測ではなくトレース値を根拠に優先順位を決められる。
- 重量E2Eを二重に走らせるとElectron同士が競合してタイムアウトする。計測は
  必ず単独で実行すること。

## 部分解決（Beta-482a）: currentTime hook購読の全廃

> 節タイトルは当初「callCount 211 → 5 で解決」としていたが、その指標が
> lane別の一部しか見ていない誤りだったため改題した。実際に達成したのは
> **Timelineの毎フレームコミット除去とViewportのコミット半減**であり、
> Viewportの毎フレームコミット自体は残っている（後述の訂正節）。

### 設計

「毎フレーム購読者だけを小コンポーネントへ切り出す」方針をさらに進め、
**`currentTime` をhook購読するコンポーネントをゼロにした**（例外は後述の
VisionDetectionOverlayLayerのみ）。時間追従はすべて素の `useStore.subscribe` +
手動diff + DOM直接更新（`TimelineCurrentTimeIndicator` の流儀）で行う。

1. **選択枠オーバーレイの抽出**（`SceneSelectionDecorationLayer.tsx`）
   - ジオメトリ計算を純関数 `computeSceneSelectionOverlayGeometry`
     （`sceneSelectionOverlayGeometry.ts`）へ切り出し、React描画と命令的パッチ
     （`sceneSelectionOverlayPatch.ts` の `applySceneSelectionOverlayGeometry`）が
     **同じ純関数を共有**することで両経路のズレを構造的に防ぐ。契約は手計算
     リテラルの単体テストで固定（幽霊枠バグ・症状A/Bの保護を含む）。
   - `SceneSelectionOverlay` は選択オブジェクトの `<g>` を**常時マウントし
     `display:none` で隠す**契約へ変更（時間帯の出入りを命令的にトグルするため）。
     パッチ対象要素は `<g>` のcallback refのみで収集する（Reactのrefは子→親の
     順で呼ばれるため、親のref時点で子要素を `querySelector` できる。polygon/rect
     個別のrefだと初回マウントで登録漏れする）。
   - 選択デコレーションのstandalone送信・`nativeSelectionDecorationActive` も
     同層へ移設。送信応答の適用は「cleanupでcancel」から「send idのlatest-wins」
     へ置き換え（意味論は最新送信の応答のみ適用で同等。旧実装は再生中ほぼ常に
     cancelされる偶発挙動だった）。setStateには同値ガードを入れ、毎フレームの
     応答でReact workを発生させない。
2. **Viewport本体の購読除去** — セレクタから `currentTime` を外し、
   requestTime → publish → renderScene のtick処理を `onCurrentTimeTickRef`
   （最新closureのref差し替え + mount時一度だけのsubscribe）へ一元化。既存
   effectはexport終了・revision出現・objects変化等の低頻度契機のみ担当し、
   時刻は `useStore.getState()` で都度読む。
3. **時刻表示** `TimelineCurrentTimeDisplay` — subscribe + `textContent` 直接更新へ。
4. **`useVisionRealtimeDetection`** — 停止中スクラブのデバウンスをsubscribe +
   armクロージャへ（このhookの購読は呼び出し元Viewportを毎フレーム再レンダー
   させていた）。
5. **例外**: `VisionDetectionOverlayLayer`（vision検出枠）はopt-inプレビュー
   有効時のみマウントされる小さな層で、マウント中のみhook購読を許容する
   （重量E2Eでは非マウント）。

### 実測（重量E2E、同一機・開発ビルド。修正後は2回）

| 指標 | 修正前(481a) | 修正後run1 | 修正後run2 |
|---|---|---|---|
| React sync work関数 callCount（旧「React再レンダー関数」） | **211** / 160.1ms | **5** / 45.7ms | **5** / 44.7ms |
| `performWorkUntilDeadline` | 364 | 195 | 180 |
| `animate`（rAF） | 178 | 179 | 178 |
| layoutCount | 213 | 213 | 212 |
| recalcStyleCount | 220 | 217 | 215 |
| busyMs（参考。run-to-runで大きくばらつく） | 1473.7 | 1437.2 | 1306.2 |

両runとも総合PASS・`settled: true`・runtimeErrors / MissingSource /
nativeRenderエラー 0件。

> **【重要な訂正】この表の1行目を「再生中のReact再レンダーが消滅した」と
> 読んではいけない。** 当初そう解釈して記録したが誤りだった。詳細は直後の
> 「訂正: callCountはlane別で、Viewportは今も毎フレームコミットしている」節。

### 訂正: callCountはlane別で、Viewportは今も毎フレームコミットしている

上表の「React sync work関数 callCount」は `chunk-6W5FFVKH.js:18625` 由来で、
これはReactの **sync lane**（`scheduleMicrotask` 経路）だけを数えている。
Viewportのコミットは **concurrent lane**（`performWorkUntilDeadline` 経由）へ
移っただけで、消えてはいなかった。

`result.json` の `exercise.reactProfile.components[].commitCount` が
コンポーネント別の直接値を持っており、こちらが正しい像である:

| コンポーネント | 修正前(481a) | run1 | run2 | run3(tickガード後) |
|---|---|---|---|---|
| `Viewport` | 377 | 198 | 184 | **191** |
| `Timeline` | 211 | 5 | 5 | **5** |
| `PropertyPanel` | 7 | 7 | 7 | 7 |

再生区間は約178フレーム（`animate` の callCount）なので:

- **`Timeline` は毎フレーム→ほぼゼロ（211→5）。ここは狙いどおり達成した。**
- **`Viewport` は毎フレーム約2回→約1回（377→191）に半減しただけで、
  依然として毎フレームコミットしている。** `performWorkUntilDeadline` が
  180〜195残っているのはこれが理由であり、「Schedulerのidle loop」ではない。

**測定規約への反映（重要）**: 今後Reactの再レンダー削減を判定するときは
`chromiumRendererTrace.topFunctions[].callCount` ではなく
**`exercise.reactProfile.components[].commitCount` を一次根拠にする。**
前者はlaneを混同し、実際には減っていないものを減ったと誤読させる。

### layoutの帰属（トレース実測で判明）

`layoutCount` 213は修正前後で不変だが、**原因の主体は入れ替わっている**。
`InvalidateLayout`（214件）の直近祖先イベントを親子関係復元で集計すると:

- 修正前: 211/214（99%）が `chunk-6W5FFVKH.js:18625`（Reactのコミット経路）
- 修正後: 208/214（97%）が rAF コールバック
  （`animate` 178件 + `FireAnimationFrame` 30件。`src/hooks/useAppLogic.ts:51`）

つまりlayoutを起こす主体は「Reactのコミット」から「rAF内の命令的DOM更新」へ
完全に移った。`animate` の呼び出し回数（178〜179）とほぼ1:1なので、
1フレームにつき実質1回のlayout無効化が起きている。

**候補の切り分け（一部は確定）**:
- `TimelineCurrentTimeDisplay` の `textContent` 更新 — 最有力。頻度が1:1で一致。
- `TimelineCurrentTimeIndicator` の `transform` — **除外**。compositing完結の
  意図的最適化であり、layout要因ではない。
- 選択枠SVG属性パッチ（`sceneSelectionOverlayPatch.ts`）— **このE2Eでは無関係**。
  `exercise.before/after.selectedObjectCount` が両方0で、`geometryPatchTargetsRef`
  のMapが空のためループ自体が回っていない。ただし「選択ありの実運用では無罪」
  とは言えない。選択ありシナリオでの別トレースが必要。
- `Viewport` の `document.documentElement.dataset.*` 毎フレーム書き込み —
  `src/index.css` に `data-uxfd*` を参照するセレクタが皆無（grep実測0件）のため
  可能性は低いと推測。ただし切り分けは未達。

**制約**: 生トレースに `disabled-by-default-devtools.timeline.stack` が
有効化されておらず、`Layout` / `InvalidateLayout` にJSスタックが記録されていない
（実測で0件）。そのため関数レベルの完全な帰属はできず、上記は
イベントの時間包含関係からの推定である。

### その他

- busyMs は参考値。1306〜1474はばらつき幅（過去実測970〜1520）の内側であり、
  単発比較で改善と断定しない（測定規約どおり）。

### 制約・注意（今後の触り方）

- `SceneSelectionDecorationLayer` は「Reactレンダー時も命令的パッチ時も
  ジオメトリは純関数から取る」ことが不変条件。SVGの形を変えるときは
  `sceneSelectionOverlayGeometry.ts` を変更し、契約テストを先に更新すること。
- `isSharedRendererNativeRenderOnlySession` は境界テストと循環import回避のため
  Viewport.tsxから**意図的に複製**した（同層ファイル冒頭のコメント参照）。
  述語を変更する際は両方を揃えること。
- リサイズハンドル押下（onHandlePointerDown）のワールド変換prepは同層へ
  verbatim移設したが、重量E2Eはリサイズ操作を演習しないため実機での
  ドラッグ・リサイズ確認が未実施。実機確認時の観点として残す。

### 追補（Beta-482b）: 敵対的レビューで確定した回帰と修正

抽出後のdiffに対する多視点レビュー（4観点の発見→指摘ごとに2名の反証検証）で、
**混在set()時のstale closure発火**が確定した: zustandのsetStateはリスナーを
set()内で同期実行するため、`switchScene` 等がobjects/layers/isPlaying/currentTime
を単一set()で変えると、tickがReactコミット前に1レンダー分古いclosureで発火する
（旧effect実装は必ずコミット後発火だったため起きなかった回帰）。

修正: `shouldDeferCurrentTimeTick`（純関数）で「storeがコミット済みレンダーより
先行している」tickを検出して保留し、毎コミット後のcatch-up effectが新鮮な
closureで実行する（`viewportTickConsistency.test.ts` が契約を固定。複製述語
`isSharedRendererNativeRenderOnlySession` の同期テストも同ファイル）。
選択デコレーション層にも同型ガード（こちらは既存のコミット後effect群が
catch-upを兼ねる）。修正後の重量E2E（run3）でもcallCount 5 / layoutCount 213 /
PASS / settled / エラー0を維持。

反証で棄却した指摘: 「unmount後の応答がsetActiveを呼ぶ」（React 18では
unmount後のsetStateは無害なno-opで実害なし）。
