# Native Overlay Bug E 実装計画：HTML 上 UI が overlay に隠れる問題の根本対策

最終更新: 2026-06-30

## 位置づけ

本計画は `markdown/Native_Overlay_Plan.md`（Option A 本計画）の派生で、Bug E **「preview pane の上に HTML で開く UI（context menu / popover / tooltip / modal / dropdown）が CAMetalLayer overlay に隠れて見切れる」** を根本対策として解消する計画である。

本計画は Bug A〜D（content 砂嵐 / 1/4 サイズ / 再生されない / clip 削除後も残る）の修正完了後に着手する。Bug A〜D は別 task で進行中。

Single Source of Truth: 本ファイル。設計判断は確定し次第 `architecture/01-decision-record.md` へ ADR として転記する。

## 0. ゴールと非ゴール

### ゴール

- preview pane に重なる **すべての HTML 駆動 UI** が overlay より上に表示される（context menu, application menu の HTML 版, tooltip, popover, modal, dropdown, autocomplete, color picker などすべて）
- modal が開いている間は overlay 動画再生が継続できる（modal 開閉で video が止まらない、または止まり時間を 1 frame 未満にする）
- 既存の input event hit-through を維持する（overlay を貫通して下層 WebView に届く）
- Bug A〜D の修正と直交（merge conflict にならない設計）

### 非ゴール

- すべての UI を native NSMenu / NSWindow に置換するリライト（NSMenu はピンポイント救済としては有効だが、本計画ではすべての HTML UI を対象にした z-order 正規化を選ぶ）
- Windows 対応（別フェーズ）
- shared-renderer / WGSL / decode 経路の変更
- Bug A〜D に該当する live surface 描画の修正（本計画範囲外）

## 1. 採用案と却下案

### 採用案: child NSWindow 化

overlay の CAMetalLayer を、main `BrowserWindow` の **contentView の subview** ではなく、別 NSWindow（child window）に載せる。child window は main の NSWindow に `addChildWindow:ordered:NSWindowAbove` で attach し、preview pane の DOM 矩形に合わせて位置と sub-pixel size を追従させる。

HTML modal-open イベントを renderer 側で統一補足し、IPC で main に通知 → child window の order を `NSWindowBelow` に下げる（または `orderOut:`）。modal-close で再び `NSWindowAbove` に戻す。

#### なぜ child NSWindow か

- macOS の z-order は同一 NSWindow 内の view 階層と、複数 NSWindow 間の window order が**独立した2軸**になっており、subview として overlay を置くと WebView 内の HTML をすべて上に重ねることが構造的に不可能。
- 別 NSWindow にすれば z-order を OS 任せで切り替えられ、modal の種類（context menu / tooltip / popover / modal / dropdown）に依存しない**一律の解決**になる。
- Premiere / FCP / Resolve も同種の構造（preview を別 layer-backed window として持つ）と推定される。

#### 既存実装との差分

現状: `BrowserWindow.contentView` の subview として `UXFDNativeOverlayPassthroughView` を addSubview し、CAMetalLayer を子 layer として attach。

変更後: 専用の `NSWindow`（`styleMask=NSWindowStyleMaskBorderless`, `level=NSNormalWindowLevel`, `backgroundColor=clearColor`, `opaque=NO`）を作り、その contentView に既存の passthrough view を載せる。main NSWindow に `addChildWindow:ordered:NSWindowAbove` で attach する。

### 却下案A: HTML modal の open を統一補足して overlay を `setHidden:YES`

軽量だが「動画再生中に modal を開くと preview が一瞬黒くなる」体感が出る。編集ソフトの要となる場所で許容しがたい。

### 却下案B: NSMenu / NSPanel への部分置換

右クリックメニューと application menu だけは NSMenu で救えるが、tooltip / popover / Inspector の color picker / 書き出し設定 modal / select 風ドロップダウン / autocomplete suggestion などには適用できない。React と native の二重実装になり長期メンテが増える。

### 却下案C: HTML すべて廃止してネイティブ UI に置換

`Native_Overlay_Plan.md` 冒頭で既に却下済み（ADR-002 維持）。

## 2. アーキテクチャ概要

```text
[macOS NSApplication]
  main NSWindow（Electron BrowserWindow）
    contentView
      WKWebView
        React UI
          context menu / modal / tooltip / popover / dropdown 等  ←★HTML 駆動
          preview 領域: 透明 div として hit-through 位置を提供

  child NSWindow（新規）
    parent = main NSWindow
    addChildWindow:ordered:NSWindowAbove で attach
    contentView
      UXFDNativeOverlayPassthroughView（既存）
        CAMetalLayer（既存）
          wgpu surface で動画 / 画像を render
```

state machine:

```text
[steady]                : child window order = above, hidden = NO
[modal-open notified]   : child window orderOut: または order = below
[modal-close notified]  : child window order = above 復帰
[preview pane geometry] : child window setFrame:display:animate:NO
```

## 3. modal-open 検知の統一 API

renderer 側で「preview に重なる可能性のある UI が開いた」を**一箇所で**検知する。各 UI 実装に検知ロジックを散らさない。

### 候補

| 仕組み | 補足対象 | 採否 |
|---|---|---|
| `MutationObserver` で `[data-state="open"]` 等を全 DOM 監視 | Radix UI、Headless UI、shadcn/ui 等の data-state 系 | 採用候補 |
| HTML `<dialog>` `open` 属性 | 標準 dialog 要素 | 採用候補 |
| renderer の zustand store に `previewObstructingUiOpen` フラグを置く | 任意の UI が `open` / `close` を呼ぶ | 採用候補（明示的） |
| CSS `:has(:popover-open)` / `popover` API | ブラウザ標準 popover | 将来候補 |

### 推奨

明示的な store フラグを正本にし、補足漏れ対策として MutationObserver + `<dialog>` 監視を補助として並走させる。MutationObserver は overlay-overlap 領域に限定（preview pane の `getBoundingClientRect` と DOM 要素の rect 交差を判定）し、無関係な UI 操作で overlay が無駄に下がらないようにする。

### IPC contract

- `ui:preview-obstruction-changed` channel
- payload: `{ obstructed: boolean, reason: string, rect?: { x, y, w, h } }`
- main は debounce（連続 open/close）と「overlay overlap」の最終判定（preview pane との交差）を行ってから child window order を変更する

## 4. フェーズ計画（すべて TDD）

各 Phase 完了時に `progress.md` 先頭へ追記し、`package.json` の版を規約通り更新する。

### Phase E0: 既存 subview 構造を child NSWindow に置換（推定 2-3日）

**目的**: 機能不変のまま、overlay の host を contentView subview から child NSWindow に切り替える。Bug E の解決はまだ含めない（modal-open 検知は次フェーズ）。

- Red test (Rust): `attach_overlay_view` が new で `NSWindow`（borderless / transparent / child relationship）を作り、main NSWindow から取得した parent window へ `addChildWindow:ordered:NSWindowAbove` を呼ぶ contract
- Red test (TS): `nativeOverlay.attach` 後に main プロセスが child NSWindow を保持していること、`detach` で `removeChildWindow:` が呼ばれることを bridge test で固定
- 実装:
  - `native-overlay/src/macos_overlay.rs` の `attach_overlay_view_to_parent` を二段化: parent NSWindow 取得 → child NSWindow 作成 → contentView に既存 `UXFDNativeOverlayPassthroughView` を load → addChildWindow
  - child NSWindow の geometry は既存の `OverlayLayerContract` の view rect から計算
  - parent window の移動・リサイズに child window が追従するかを実機で確認（`addChildWindow` は基本追従するが、`NSWindowDidResizeNotification` 経由の手動同期も実装しておく）
- 目視ゲート: A〜D 修正後の表示が child NSWindow 化後も同じ pixel 結果を返す
- 回帰確認: `npm run test:native-overlay-parity`、`npm run test:native-overlay-node`、TS gate 5本

### Phase E1: modal-open 検知の renderer 側統一 API（推定 1-2日）

**目的**: 「preview に重なる UI が開いた / 閉じた」を1チャネルで通知する仕組みを作る。

- Red test (TS): zustand store に `setPreviewObstructed(reason, rect | null)` action があり、これを呼ぶと IPC `ui:preview-obstruction-changed` が `{ obstructed, reason, rect }` で発火する pure unit test
- Red test (TS): MutationObserver helper が、preview pane の rect と交差する `[data-state="open"]` / `<dialog open>` を検出して `setPreviewObstructed` を呼ぶ
- 実装:
  - `src/utils/previewObstructionDetector.ts` を新設
  - 既存 modal 実装（Radix UI / 自作 popover / context menu）から zustand action を明示的に呼ぶ
  - MutationObserver で補助的に補足、検出ロジックは「preview pane rect と交差する DOM 要素のみ」に限定
- 計測ゲート: 既存の編集操作（context menu open / Inspector の color picker open / 書き出し設定 modal open / select ドロップダウン）すべてで `obstructed=true` が renderer → main へ届くことを vitest で確認

### Phase E2: child NSWindow の z-order toggle（推定 1日）

**目的**: `ui:preview-obstruction-changed` を main で受けて child NSWindow の order を切り替える。

- Red test (Rust): `set_overlay_obstructed(obstructed: bool)` が呼ばれると child window が `orderOut:` または `orderWindow:NSWindowBelow relativeTo:0` する contract
- Red test (TS): main の IPC handler が renderer からの `obstructed=true` で `set_overlay_obstructed(true)`、`false` で `set_overlay_obstructed(false)` を呼ぶ
- 実装:
  - `electron/nativeOverlayMainBridge.ts` に `setObstructed(payload)` を追加
  - `native-overlay/src/macos_overlay.rs` に `set_overlay_obstructed` を追加
  - 検証: modal open 中も動画 frame の present は継続する（child window は下に隠れるだけで GPU 描画は止めない）
- 目視ゲート: 右クリックメニュー / Inspector / 書き出し設定 modal / tooltip すべてで overlay に隠れず正しく表示されたスクショを保存

### Phase E3: regression と修了（推定 1日）

- 既存の D&D / スクラブ / ショートカット / コンテキストメニューの vitest を再走、Green を確認
- preview 領域での mouse event hit-through が child window 化後も動作することを実機で確認（NSView の `hitTest:` nil 返しは引き続き有効、加えて child NSWindow の `setIgnoresMouseEvents:YES` の必要性を実機で判定）
- HiDPI 切替・Mission Control・フルスクリーン・devtools 開閉 で child window が破綻しないことを目視確認、スクショ保存
- 60分 bench を再実行し、obstructed/unobstructed の切替が steady-state perf を悪化させないことを確認

## 5. 既存設計との整合

| 既存原則 | 本計画との整合 |
|---|---|
| ADR-002 Electron を UI shell として残す | 維持（HTML UI 側は変更しない） |
| ADR-003 preview / export の合成を分けない | 維持 |
| ADR-004 sidecar で危険処理を隔離 | 維持 |
| Native Overlay Plan §3 Phase 4 ウィンドウ位置同期 | 拡張: child NSWindow の geometry 同期に置換 |
| Native Overlay Plan §3 Phase 5 入力ヒットスルー | 維持: `hitTest:` nil 返し + child window の event ignore を組み合わせ |

### 提案 ADR

- **ADR-013（提案）**: Native Overlay は main BrowserWindow の subview ではなく child NSWindow として実装する。理由: macOS の z-order は同一 NSWindow 内の view 階層と複数 NSWindow 間の window order が独立軸であり、subview のままでは HTML 駆動 UI を一律 overlay より上に置けない。child window 化で OS 任せの z-order 切替が可能になり、modal 種類に依存しない解決になる。

## 6. リスクと退避

| リスク | 影響 | 退避 |
|---|---|---|
| child window が parent の移動・最小化・フルスクリーンに追従しない場面がある | 中 | `NSWindowDidMove` / `NSWindowDidResize` / `NSWindowDidEnterFullScreen` / `NSWindowDidExitFullScreen` notification を捕捉し手動 reposition |
| Mission Control や Spaces 跨ぎで child window が外れる | 中 | `NSWindowCollectionBehavior` を `parent` に合わせる、必要なら `setLevel:` で追随 |
| modal-open 検知漏れで overlay が UI に隠れる | 中 | MutationObserver の保険、検知漏れは bug として個別 fix |
| modal-open のたびに `orderOut:` すると動画再生に gap | 中 | child window は隠すだけで GPU present は継続。最初は order 切替で実装、`orderOut:` は最終手段 |
| Phase E0 移行で Bug A〜D の修正と conflict | 高 | Bug A〜D を先に完了してから着手（本計画の順序ルール） |
| Phase E2 の z-order 切替が child window 内 CAMetalLayer の現フレームを破壊 | 中 | order 切替は表示位置の変更だけで GPU 描画 state は維持されるはずだが、実機で確認 |

## 7. 期待効果

- HTML 駆動の **すべての** preview-overlapping UI が overlay より上に表示
- 既存 React / Radix UI / Headless UI 実装を捨てず、UI 一貫性を維持
- modal の種類が増えても zustand action / MutationObserver の補足対象を拡張するだけで対応可能
- 動画再生中の modal 開閉で preview が止まらない（order 切替方式の場合）

## 8. 工数感

- Phase E0: 約2-3日
- Phase E1: 約1-2日
- Phase E2: 約1日
- Phase E3: 約1日

**合計約5-7営業日**。Bug A〜D 完了後に着手。

## 9. 着手前に確定したい設計判断

1. **ADR-013（child NSWindow 化）を確定してよいか**
2. **modal-open 検知の正本を zustand store にしてよいか**（MutationObserver 単独運用ではなく明示的 action を主、Observer を補助）
3. **modal-open 時の child window 動作を `order下げ` にするか `orderOut`（完全隠し）にするか**（再生継続性を優先し前者を推奨）

## 10. 関連文書

- [Native_Overlay_Plan.md](./Native_Overlay_Plan.md): 本計画の親
- [architecture/01-decision-record.md](./architecture/01-decision-record.md): ADR-013 追記先
