# native overlay hole-punch方式への移行

## Decision

preview は Electron 親 window より前面の child NSWindow として描画されており、preview 矩形内にある
HTML 駆動 UI（preview-mode トグル「自動スケール/ドットバイドット/2D/3D ステージ」、timeline の
context menu、export-progress modal、tooltip 等）が動画の下に隠れて見えなくなっていた（Bug E）。
最初に「obstructed」トグル（メニュー/モーダルが開いている間だけ overlay を背面へ下げる）を実際に
機能させたが（commit 6124d396, 0b15cb42）、これは不透明な親 window の背後へ overlay を下げると
動画自体が見えなくなるため却下し、また preview-mode トグルのような常時表示の UI はそもそもこの
方式では解決できない。

hole-punch 方式を採用する：overlay の child NSWindow は常に `addChildWindow:ordered:NSWindowBelow`
で親の背後に固定する（commit a428414a）。Electron BrowserWindow は `transparent: true` /
`backgroundColor: '#00000000'` にし（`electron/mainWindowOptions.ts`, commit e9ef6812）、
preview 要素の祖先チェーン（`body` / `.workspace-main` / `.viewport-container` /
`.preview-canvas-container`）をすべて透過にする（commit 230cb7f7, c0a66988）。内側の preview
コンテナ背景は `nativeOverlayLifecycleState === 'overlay'` のときだけ `transparent`、それ以外は
`var(--bg-app)`（`src/utils/previewPaneBackground.ts`）。

この方式では祖先チェーン全体の透過により大きなウィンドウ（最大化時）でデスクトップが複数の隙間
（window edges、timeline 行の下など）から透けてしまう問題が発生した。

**修正：Full-viewport opaque backdrop 方式（commit 812fb1df〜88069296）**

`src/components/PreviewHoleBackdrop.tsx` に position:fixed の背景を追加し、`#root { isolation:isolate }` で
stack context を限定する。backdrop は `inset:0` + `z-index:-1` + `background:var(--bg-app)` で全視点を不透明に塗り、
`clip-path: polygon(evenodd)` で preview 矩形だけ穴を開ける。穴のパス座標は `src/utils/previewHoleClipPath.ts` で生成し、
store の `previewHoleRect` (Viewport.attach() 時に発行・attach-key dedupe 前に publish、lifecycle state が `'overlay'` でない時と
unmount 時に消去) から読む。この方式により祖先チェーン全体の透過が不要になり、panel ごとの background 規則を持たずに
全ての隙間をふさぐことができた。

子 NSWindow 自体は `setOpaque: NO` + `clearColor` に変更し、black fill は layer-backed container contentView
（`wantsLayer`、black `backgroundColor`）で行うようにした（commit 52939809, db0a5804）。以前の `setOpaque: YES` + `blackColor`
方式は child window を不透明黒で塗っており（commit 138a443b）、overlay が re-attach される際（例：NSOpenPanel が閉じた後）に
アプリが deactivate する問題が発生していた。Stage Manager 環境下では app が side strip へ押しやられる副作用もあったため、
layer-backed container 方式に改訂した。

この変更に伴い obstructed トグル機構一式（store state、IPC `ui:preview-obstruction-changed`、napi `setNativeOverlayObstructed`、
Rust側トグル）を削除した（commit 1a5ea251, a428414a）。

実 Electron macOS（2026-08-24）で動画クリップを用いて検証：トグル・context menu・export modal・
tooltip はいずれも動画の上に表示され、動画自体も表示され続けることを確認した。

## Alternatives considered

- obstructed 順序トグル（メニュー/モーダルが開いている間だけ NSWindowBelow へ切替）：
  overlay を背面へ下げると動画が消える。対象 UI ごとの個別配線が必要で、preview-mode トグルの
  ような常時表示 UI をそもそもカバーできない。
- `orderOut:` で overlay を一時的に隠す：動画自体を消してしまう点は obstructed トグルと同じ問題。
- native `Menu.popup` + modal 用の別 BrowserWindow：toolbar/tooltip のような常時表示 UI をカバー
  できない。
- 共有 renderer のクリアカラーを黒に変更：export 経路が透過クリアに依存しているため不可。

## Constraints / Gotchas

- preview 要素の祖先に新しく追加される要素は必ず透過にすること。過去に `.preview-canvas-container`
  が `background:#000` を持ってしまい hole-punch が無音で壊れたことがある。
- transparent な BrowserWindow では `.glass` / `backdrop-filter` が hole punch の孔越しに
  コンポジタの背後内容をぼかす（目視確認では実用上問題なし）。
- pixel-perfect（ドットバイドット）モードのレターボックス余白は、CSS ではなく overlay の
  黒い child window 側で塗られるようになった。
- Windows（`win32_overlay.rs`, `WS_EX_NOREDIRECTIONBITMAP`）は z-order の扱いが異なり、
  hole-punch は未検証。別途対応が必要。
- `SceneSelectionDecorationLayer`（HTML）が動画より前面に描画されるようになったため、native
  side の selection decoration は冗長になっており削除候補。
- Re-attach（ウィンドウリサイズなど）後、overlay が黒いままで次フレーム呈示（シーク/再生）を待つまで
  表示が戻らない現象を観測。修正未実施、既存の問題の可能性も含め原因は未特定。
- NSOpenPanel を使った import 後の app deactivation シナリオは、container view 方式での修正後に再検証できなかった。
  変更内容（動画表示OK・app 活性状態維持）の部分検証は済み（CDP 駆動 file input 経由）だが、全体シナリオは継続監視対象。
- Computer-use hit-test ツールが transparent 子 window 上のクリックを正しく判定できないため、
  検証手段が CDP（`UXFD_REMOTE_DEBUG_PORT`）に限定される。

## Verified

- 最大化ウィンドウで隙間の透けなし（2026-08-24）
