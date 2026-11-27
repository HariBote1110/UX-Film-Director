# Windows native overlayの「えげつないはみ出し」バグ根本原因

## 状況
mainpc（Windows実機、RDP経由で目視）でW7ベンチ中に観測された不具合。
native overlayの描画内容がcanvas/viewport領域を大きく超えて表示される。
オンデバイス再現手順・実機修正確認は24hベンチ終了後に別途行う（本ファイルは
コード解析＋純関数テストのみで確定した根本原因と修正）。

## 根本原因
`src/utils/nativeOverlayViewportGeometry.ts` の `buildNativeOverlayAttachRect` は、
`contract.view_y` を常に **bottom-left origin** で計算している。

```
y: contentHeight - viewportRect.top - viewportOffsetTop - height
```

これは macOS AppKit の `NSView.isFlipped` 前提を打ち消すための式で、
`native-overlay/src/macos_overlay.rs` 側は
`resolve_view_local_rect_for_parent_bounds`（`parent_view_bounds_height -
contract_view_y - contract_view_height`）で `isFlipped` 判定つきに top-left へ
戻している。しかし `buildNativeOverlayAttachRect` 自体はプラットフォーム分岐を
一切持たず、Windows/macOS問わず同じ bottom-left origin の `view_y` を送る。

`native-overlay/src/win32_overlay.rs` の `resolve_overlay_screen_rect` は
「Win32はscreen座標がtop-left origin一本なのでmacOSのisFlipped分岐は不要」という
コメントのまま `contract.view_y` を無条件に owner クライアント原点へ加算していた
（bottom-left → top-left への変換が欠落）。結果、overlay windowの縦位置が
実際のcanvas位置と無関係にずれ、canvas領域を大きくはみ出して描画される。

ずれ量は `owner_client_height - 2 * viewportRect.top` に相当し、canvasが
ウィンドウ上端から離れるほど（ツールバー等の高さ分）ずれが大きくなる —
これは実機で観測された「えげつない」はみ出し量とも整合する。

## 修正（native-overlay/src/win32_overlay.rs のみ）
- `owner_client_height`（`GetClientRect`）を新設し、attach/resync 両方の
  呼び出し元で取得。
- `resolve_overlay_screen_rect` に `owner_client_height_px` 引数を追加し、
  macOSと同じ `owner_client_height_px - scaled_view_y - height` の式で
  bottom-left → top-left 変換してから screen 座標へ加算するよう変更。
- 純関数のためTDDで確認可能。`geometry_tests` に回帰テスト
  （`resolve_overlay_screen_rect_flips_bottom_left_contract_y_to_top_left_screen_y`
  ほか）を追加済み。`cargo check --target x86_64-pc-windows-msvc --tests` で
  クリーンビルド確認済み（Windows実機での `cargo test` 実行は未実施 —
  x86_64-pc-windows-msvc targetでのクロスコンパイルチェックのみ）。
- 併せて `native-wgpu-renderer/src/lib.rs` の surface configure
  （`from_surface`）を確認し、surfaceは常に `contract.drawable_width/height`
  そのままで configure されており、window rect とは独立してスケール／
  クリッピングのバグは無いことを確認した（内容の引き伸ばしは今回のはみ出し
  の原因ではない）。

## 副次的に確認したがWindowsのみでは修正しなかった点
`buildNativeOverlayAttachRect` 自体（TS/`src/utils/nativeOverlayViewportGeometry.ts`）
は「bottom-left origin前提」のコメントすら無く、macOS専用の変換であることが
関数シグネチャからは読み取れない。将来的な保守性のため、以下のいずれかを
TS側オーナー（現在W7配線は未マージブランチ
`worktree-agent-a62035de6517d4398`側が担当）に申し送る:

1. `buildNativeOverlayAttachRect` にコメントを追記し「bottom-left origin
   はmacOS専用の変換である」ことを明示する（挙動は変えず、Rust側で常に
   打ち消す前提を文書化するだけ）。
2. あるいはTS側でプラットフォーム分岐し、Windowsではtop-left origin
   （`y: viewportRect.top + viewportOffsetTop`）をそのまま送り、
   win32_overlay.rs 側の変換を削除する設計に寄せる。

今回は「another agentがsrc/を所有中」という制約のもと、Rust側
（`win32_overlay.rs`）だけで吸収する設計（案1寄り、実装は変換を追加する形）
を選択した。TS側のコメント追記（案1）は未実施 — 別タスクとして
`src/utils/nativeOverlayViewportGeometry.ts` のオーナーに申し送る。

## オンデバイス検証（未実施・24hベンチ終了後）
- mainpc実機で本修正後のビルドをRDP経由で目視確認し、canvas境界内に
  overlay描画が収まることを確認する。
- 併せて `dpi_scale_factor_from_dpi` のRDP仮想ディスプレイでのスケール値
  （100%機のため高DPI経路は未実機検証）も余裕があれば確認する。
