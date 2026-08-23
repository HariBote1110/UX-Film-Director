# Native Overlay Z-Order Obstruction Fix

## Decision

Native overlay（macOS NSWindow child、`addChildWindow:ordered:NSWindowAbove` で登録）がcontextメニューと export-progress modalを覆っていた不具合を修正。**根本原因は2つのレイヤーでの状態管理の亜脱落**：

1. **AppKit の再順序化の自動化**：`set_overlay_view_obstructed` は `orderWindow:NSWindowBelow relativeTo:parent` で overlay を一時的に背後に下げていたが、右クリック操作そのものが親 window を `orderFront:` するため AppKit が `addChildWindow:ordered:NSWindowAbove` で指定した元の順序を自動的に再適用していた。**修正：`removeChildWindow:` してから `addChildWindow:ordered:NSWindowBelow/Above` で永続的に変更**（commit 6124d396）。

2. **ライブサーフェス欠落時のフラグ喪失**：`set_native_overlay_obstructed` がライブサーフェスが接続されていないと `Err` を返し、obstructed フラグが記録されず、W7 の demand-driven staged attach で後から Above で再 attach しても古い状態のままだった。**修正：per-window_id の `NATIVE_OVERLAY_OBSTRUCTED_FLAGS` レジストリを `native-overlay/src/lib.rs` に新設し、フラグを常に記録（attach 有無に関わらず Ok 返却）、正常な attach 直後に再度適用、detach で削除しない**（commit 0b15cb42）。

## Alternatives considered

1. **`orderOut:` による完全隠蔽**：却下。overlay が見えなくなり preview playback が停止する。バグE計画§5 設計判断3「overlay は常に描画中」に違反。

2. **グローバル `orderWindow:relativeTo:0`**：却下。Stage Manager が app 全体を背後に配置する可能性があり、UI reliability が低下。per-window 処理は困難（Cocoa API 範囲外）。

3. **Electron main 側で状態管理**：却下。Rust が`attach_native_overlay`/`set_native_overlay_obstructed`の全パス（開発中の繰り返し attach 含む）をカバーする必要があり、主プロセスへの依存は複雑性と同期遅延を招く。macOS-specific なレジストリは native module 側が正本。

## Constraints / Gotchas

1. **AppKit 順序再適用の予測不能性**：親 window が orderFront/makeKey される度に child の順序が復元される。single orderWindow call では不十分；removeChildWindow + addChildWindow の原子性は AppKit が保証するが、その間に第三者のorderFront が挟まる競合ケースは未検証。

2. **ライブサーフェス attach の非同期性**：W7 staged attach は essential（solid composite）と deferred（nv12 compile）に分割されており、essential attach 直後に obstructed フラグを適用しても、その直後に user が context menu を開くと（nv12 が未完成）即座に obstructed 状態に切り替わる。遅延はミリ秒単位で無視できるが、競合ケースは理論上存在。

3. **覆う範囲の限定的カバレッジ**：現在のパス（`renderer:setPreviewObstructed` IPC）は Timeline context menu/layer-track menu/ExportProgressModal のみが呼ぶ。`src/utils/previewObstructionDetector.ts` の `createPreviewObstructionMutationObserver` fallback（DOM 変化を監視してフラグ自動適用）は実装されているが、App.tsx で**ワイヤリングされていない**ため、他の popovers/tooltips/dropdowns（SettingsPanel/PropertyPanel/LayerPropertyDropdown など）は preview 上に出現する可能性がある。フォールバック有効化は後続タスク（M3 への apply 待ち）。

4. **Rust-only flag registry の正当性**：flag 値自体は IPC 経由で Electron からのみ設定され、main process 側に UI state (visibility/obstruction) を記録する構造ではない。Rust registry は「最後に known obstructed state」を持つ唯一の正本だが、main process から強制的に state を変更する手段がないため、main side のバグで flag が乖離した場合の修復は manual detach/attach に頼る。
