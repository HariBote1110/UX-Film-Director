# Phase 3b: present 経路の統一（presenter reuse 全セッション化 + native-render-only の overlay 同時配信）

## Step 0 — 現状トレース（着手前の調査結果）

`rustVideoOnlyEnabled`（`VITE_UXFD_RUST_VIDEO_ONLY=1`）下で、セッション形状ごとに
本体フレームがどう合成・present されるかを Viewport.tsx / 各 util を実地に追って
固定した（着手前の状態）。

### セッション形状の分類

`Viewport.tsx` に既存の2判定（いずれも `session.surfaceGate.ok && clips.length>0` 前提）:

- `isSharedRendererExternalVideoOnlySession` — 全 clip の media kind が `Video`。
- `isSharedRendererNativeRenderOnlySession` — 全 clip の media kind が `Video` 以外
  （図形・画像・PSD・テキスト・生成コンテンツ）。
- 混在（video + 非video 同居）はどちらにも該当しない残余集合。

### reuse 可否（`canReuseNativeRenderPresenter`、publish 側 / restart effect 側で重複定義）

着手前:
```
rustVideoOnlyEnabled && !isExporting
  && (isSharedRendererExternalVideoOnlySession(session) || isSharedRendererNativeRenderOnlySession(session))
```
→ 混在セッションは reuse 対象外。`nextPresenterKey` に transform 等が含まれる
フル再起動キーとなり、`objects`/`currentTime` が変わるたび
（ドラッグ中は毎 pointermove）に `setSharedRendererPreviewSession` → presenter
のフル破棄・再構築（実測約28ms/回）が発生していた。

### 本体 present の実経路（reuse tick、`canReuseNativeRenderPresenter` 成立時）

1. **video-only** かつ `nativeOverlayPreviewEnabled`:
   `prepareSharedRendererViewportNativeOverlayPresent`
   （`sharedRendererViewportVideoUpload.ts`）→ rust-backend の
   **動画デコード RPC**（`decode.rs`、`requestRustBackendVideoDecodeFrame`）で
   先頭の video clip 1本を1枚デコード → `presentNativeOverlayRustDecodedVideoFrame`
   （`sharedRendererRustVideoUploadPipeline.ts`）が `window.nativeOverlay.presentSharedFrame`
   （napi: `presentNativeOverlaySharedFrame`）へ `{mediaId, frame, snapshot, media,
   selectionDecoration}` を渡す。Rust 側 `upload_frame_to_scene_sources` が
   デコード済み video フレームを1ソースとして注入しつつ `snapshot`/`media` から
   **他の非video ソースも `load_overlay_image_sources_for_scene` で自前ロードして
   フルシーン合成**する（`render_native_wgpu_frame`、rust-backend と同じ
   `uxfd_native_wgpu_renderer` crate）。→ native overlay（child NSWindow、
   CAMetalLayer）に present。選択デコレーションは同一 present に同梱
   （Phase 2 で確立済み、co-delivery）。
   - **制約**: `buildSharedRendererVideoFrameDecodeRequests` は video decode
     request が0件だと `noVideoDecodeRequest` で失敗する。図形のみセッションは
     video clip が無いためこの経路を通れない（＝図形のみ reuse が overlay に
     乗れなかった根本理由。Rust 側の「フルシーン合成」自体は video 抜きでも
     原理上可能だが、JS 側の呼び出し契機が video decode request に紐付いていた）。
2. **native-render-only（図形のみ）**、または overlay 無効時:
   `prepareSharedRendererViewportNativeRenderUpload`
   （`sharedRendererViewportNativeRenderUpload.ts`）→ rust-backend RPC
   `render.nativeSharedFrame`（**Phase 3a の per-clip GPU テクスチャキャッシュ**
   を持つ `NativeWgpuRenderer` 経由。POSIX shared memory ring に合成結果を書く）
   → `prepareSharedRendererDecodedVideoFrameUpload` で **DOM 上の WebGPU
   `<canvas>`**（`sharedRendererSurfaceCanvas`）へ GPU テクスチャとして
   `presentPreparedNativeRenderFrame` が upload・present。
   - **判明した事実**: `render.nativeSharedFrame` は media kind を問わず
     任意の mix（video 含む）を合成できる汎用 RPC で、出力
     `RustBackendNativeRenderSharedFrameResult.frame` は video decode の
     `RustBackendSharedVideoFrame` と**全く同じ型**（POSIX shm 記述子）。
     つまりこの経路は本来 mixed セッションも扱える（実際、reuse に乗らない
     混在セッションはこの同じ RPC を使うフル restart 経路
     （`sharedRendererViewportPresenterOrchestration.ts`）で今も正しく描けている）。
3. **混在（video + 非video）**: reuse 対象外のため常にフル restart。
   restart 後の `startSharedRendererViewportPresenter`
   （`sharedRendererViewportPresenterOrchestration.ts`）は
   `presentNativeOverlayDecodedFrame`（= 上記1と同じ動画デコード注入経路）を
   まず試み、video clip があれば成功する（混在でも動画1本なら実は overlay
   経路で合成できていた）。無ければ（＝図形のみで overlay 無効時など）
   `fallbackNativeRenderUploadResult` で上記2の DOM canvas 経路にフォールバック。
   → 混在セッションの「本体」は実は restart のたびに overlay 経由で正しく
   描けているが、**reuse に乗らないため every pointermove がフル restart**
   になっていた、というのが本フェーズで解消すべき実体。

### 選択デコレーション co-delivery 対象（Phase 2 実装時点）

`nativeOverlayBodyCoDeliveryEligible = rustVideoOnlyEnabled &&
isSharedRendererExternalVideoOnlySession(session)` のみ。native-render-only
（図形のみ）reuse は DOM canvas 経由のため co-delivery 対象外で、standalone
チャネル（`setSelectionDecoration`）が常に唯一の配信経路だった。

## Step 1 — presenter reuse の全セッション化

### 決定

`isSharedRendererMixedNativeRenderSession(session)`（video-only でも
native-render-only でもない残余、`surfaceGate.ok && clips.length>0` 前提）を
新設し、`canReuseNativeRenderPresenter`（publish 側 `publishSharedRendererPreviewSession`
と restart effect 側 `canReuseCurrentNativeRenderPresenter` の両方、既存の重複
定義パターンを踏襲）を3述語の OR に拡張した:

```
rustVideoOnlyEnabled && !isExporting
  && (isSharedRendererExternalVideoOnlySession(session)
      || isSharedRendererNativeRenderOnlySession(session)
      || isSharedRendererMixedNativeRenderSession(session))
```

実質的には `rustVideoOnlyEnabled && !isExporting && surfaceGate.ok &&
clips.length>0` と同値だが、既存2述語をそのまま残して3述語目を足す形にした
（理由は下記「検討して却下した代替案」）。これにより混在セッションも
`nextPresenterKey` が transform を含まない reuse キーで安定し、presenter の
フル破棄・再構築（約28ms/回）がドラッグ中に発生しなくなる。restart は
純粋な出力先変化（canvas mount/unmount・media set が別セッション種別を要求
する等）のときだけに限定される。

reuse tick 内の present 実体は、混在セッションについては引き続き
`prepareSharedRendererViewportNativeRenderUpload` →
`presentPreparedNativeRenderFrame`（DOM canvas 経路）を使う（Step 2/3 参照、
overlay 経路への統合は video-only と native-render-only のみが対象）。

828555b2 の「presenter 起動中は publish を pending へ退避する」挙動
（`shouldDeferSharedRendererPreviewSessionPublish`）は本 Step では変更していない
（reuse 判定を変えても、reuse 自体が成立しない起動直後の1回だけが従来どおり
この経路を通る）。

### 検討して却下した代替案

- **`isSharedRendererExternalVideoOnlySession`/`isSharedRendererNativeRenderOnlySession`
  を撤去し `surfaceGate.ok && clips.length>0` 単独の新述語1本に統合する** —
  ロジックとしては等価だが、`viewportRustVideoOnlyBoundary.test.ts` など既存の
  source-introspection テストが `canReuseNativeRenderPresenter` の式に旧2述語の
  呼び出しが含まれることを直接固定しており、これらのテストの意図（video-only
  述語・native-render-only 述語それぞれの単体契約）は Phase 3b でも変わらず
  有効なため、撤去は無関係な回帰リスクを持ち込むだけと判断し見送った。3述語
  OR のまま残す方が差分も小さい。

## Step 2 — native-render-only セッションの overlay 同時配信

### 決定

`sharedRendererViewportNativeRenderUpload.ts` に
`prepareSharedRendererViewportNativeRenderOverlayPresent` を新設した。
`render.nativeSharedFrame` RPC で合成した frame（Phase 3a のキャッシュ付き
per-clip レンダラを経由、`renderId`/`memoryId` は既存の `buildPreviewNativeRenderId`/
`buildPreviewNativeRenderMemoryId` を流用）を、**DOM canvas への GPU テクスチャ
コピーを経由せず**そのまま `window.nativeOverlay.presentSharedFrame` に
`{mediaId, frame, selectionDecoration}`（`snapshot`/`media` は省略）で渡す。
Rust 側 `upload_frame_to_scene_sources` は `scene`（snapshot）が無い呼び出しを
「アップロードされた1枚をそのまま drawable いっぱいの単一 quad として表示する」
モードとして扱う実装が既にあり（`native-overlay/src/lib.rs:1704-1734`）、これは
`render.nativeSharedFrame` の出力（＝キャンバス全体を合成済みの1枚）とまさに
合致する。**Rust 側の変更は不要**（napi 契約・addon 実装とも無変更）。

Viewport.tsx の reuse tick 分岐に
`else if (nativeOverlayPreviewEnabled && isSharedRendererNativeRenderOnlySession(session))`
を追加し、この新関数を呼ぶ。失敗時（overlay 未 attach 等）は既存の video-only
失敗時と同じ「self-healing via restart」パターン
（`sharedRendererPresenterSessionKeyRef.current = null;
setSharedRendererPreviewSession(session);`）を踏襲する。再起動後は
`sharedRendererViewportPresenterOrchestration.ts` の
`fallbackNativeRenderUploadResult` が自然に DOM canvas 経路へ落ちる（既存の
video-only 失敗時のフォールバック連鎖と同型）。

`shouldSendStandaloneDecoration` の入力 `nativeOverlayBodyCoDeliveryEligible`
（Viewport.tsx 側で算出）を
`rustVideoOnlyEnabled && (isSharedRendererExternalVideoOnlySession(session) ||
isSharedRendererNativeRenderOnlySession(session))` に拡張し、
native-render-only セッションの reuse tick でも standalone 送信をスキップして
2チャネル競合（症状B）を防ぐ。

### 検討して却下した代替案

- **`sharedRendererViewportPresenterOrchestration.ts`（フル restart 経路）にも
  同じ overlay-composite 分岐を追加する** — Step 1 により reuse が原則すべての
  セッション形状に拡がった結果、restart は「genuine な出力先変化」に限定される
  稀な事象になった。restart 直後の1フレームだけ DOM canvas 経路（フォール
  バック）を経由しても、次の reuse tick（同一 tick 内で publish が続けて
  呼ばれる通常のケースでは実質次フレーム）で overlay 経路に切り替わり視覚的な
  実害はほぼ無い。一方この分岐を restart 経路にも複製すると
  `startSharedRendererViewportPresenter` の入力・戻り値契約
  （`nativeRenderUploadResult` 等）を拡張する必要があり、対応する
  source-introspection テスト群への影響が Viewport.tsx 側の比ではなく広がる。
  スコープと工数のバランスを優先し、reuse tick 限定とした。将来 restart 頻度が
  問題になった場合の拡張候補として残す。

## Step 3 — 混在セッションの残課題

`render.nativeSharedFrame` は原理上どの media kind の組でも合成できるが、
Phase 3a のキャッシュ注記のとおり `Video`（通常動画パス）は revision を
算出せず常にミス扱い（毎フレーム再生成）のままで、かつ実際の video ピクセル
取得は JS 側が個別に用意した `sources`（rust-backend 側の video decode RPC
または HTMLVideoElement 経由）に依存する。混在セッションの「本体」を overlay
の同時配信（co-delivery）に完全統合するには、video デコードをフレームごとに
JS が仲介する現構造ではなく Rust が自前で保持・供給する構造
（five-bugs-structural-redesign.md の「4. デコーダ書き換え」、Phase 4）が
前提になる。本フェーズはそれを行わない。

Step 1 により混在セッションの reuse cadence は改善したが、本体 present は
引き続き DOM canvas 経路（`presentPreparedNativeRenderFrame`）を使うため、
選択枠と本体は依然として独立2チャネル present であり、原子性はない
（症状Bの完全解消は混在セッションには及ばない）。standalone デコレーション
送信（`shouldSendStandaloneDecoration`）は混在セッションでは
`nativeOverlayBodyCoDeliveryEligible: false` のまま据え置かれるため、
可視性ゲート・dedupe を含む既存の挙動（選択変更・時間変化のたびに送信、
値不変なら送信省略）がそのまま有効に働き続ける。回帰は無い。
