# Windows native overlay geometry 追従・DPI（Windows Port W6）

## Decision

- 親ウィンドウ（Electron の owner HWND）の move/resize/最小化/復元/DPI 変更に
  overlay を追従させる機構として、`SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE,
  WINEVENT_OUTOFCONTEXT)` を採用した（`native-overlay/src/win32_overlay.rs`
  の `register_geometry_resync_hook` / `geometry_resync_win_event_proc`）。
  owner HWND は Electron/Chromium が所有しており、`SetWindowLongPtr
  (GWLP_WNDPROC, ...)` による素朴なサブクラス化は Chromium 自身の実装と
  競合しうるため避けた。システム全体のアクセシビリティイベントを購読する
  この方式なら owner を一切操作せずに済む。macOS 側の `macos_overlay.rs`
  `GEOMETRY_RESYNC_OBSERVERS`（`NSWindowDidMoveNotification` 等の購読）と
  同じ「対象を直接操作せず通知を受けて手動で resync する」設計を踏襲した
  構造的対応物になっている。
- `WINEVENT_OUTOFCONTEXT` はフックを登録したスレッドのメッセージキュー経由
  で非同期配送されるため、そのスレッドがメッセージポンプを回している必要が
  ある。`attach_overlay_window`（＝ napi 経由の `attachNativeOverlay` 呼び
  出し）は Electron のメインプロセス（Chromium の UI スレッド、常時メッセージ
  ループを回す）から呼ばれるため、本番ではこの前提は自動的に満たされる。
  素の Win32 テストバイナリにはメッセージループが無いため、スモークテスト
  側で明示的にポンプを回す必要があった（下記「実測」参照）。
- geometry 解決の純粋関数 `resolve_overlay_screen_rect`（W5 で導入済み）に
  `dpi_scale_factor: f64` 引数を追加した。attach 時の初期配置
  （`attach_overlay_window`）と resync（新設 `resync_overlay_geometry`）が
  必ず同じ関数を通ることで、「片方だけ別の式で計算してウィンドウ移動時にだけ
  ずれる」というリグレッション（macOS 側のコメントが警告している失敗モード）
  を Win32 側でも構造的に防いだ。
- **per-monitor DPI awareness**: `dpi_scale_factor_from_dpi(dpi: u32) -> f64`
  （`dpi / 96.0`、`dpi == 0` は 1.0 にフォールバック）を新設し、attach/resync
  いずれも `GetDpiForWindow(owner)` の戻り値をこの関数へ通してから
  `resolve_overlay_screen_rect` に渡す。`contract.view_*`（TS 側が計算する
  CSS px、`OverlayLayerContract::contents_scale` と同じ位置づけ）は Win32
  の物理ピクセル座標系へ渡す前にこの倍率で変換する必要があるため、この点は
  W5 時点（`dpi_scale_factor` を掛けずに素通ししていた）からの是正でもある。
  この変換ロジック自体はプラットフォーム非依存でユニットテスト済みだが、
  **実機での高DPI検証は未実施**（mainpc は 100% スケール機のため。下記参照）。
- Bug E 相当（overlay に隠れる HTML UI の z-order 制御）は
  `set_overlay_window_obstructed(overlay_hwnd, obstructed)`
  （`SetWindowPos` の `hWndInsertAfter` に `HWND_TOP`/`HWND_BOTTOM`）として
  実装し、`lib.rs::set_native_overlay_obstructed` の Windows 分岐へ配線した。
  `WS_POPUP` は `CreateWindowExW` の `hWndParent` に owner を渡した時点で
  owner の子孫として扱われるため、macOS 版のように対象ウィンドウの
  `windowNumber` を明示的に `relativeTo:` へ渡す必要が無く、より単純になる。
- `OverlayLayerContract` に `Clone` を追加した（resync hook のレジストリに
  attach 時点の contract のスナップショットを保持するため）。

## Constraints / Gotchas

- `SetWinEventHook` のコールバックはグローバル関数ポインタでしか登録できず
  クロージャでキャプチャできない。owner HWND → resync 状態（overlay HWND・
  contract のスナップショット）の静的レジストリを持ち、コールバック内で
  イベントの `hwnd` をキーに引く設計にした（macOS の `GEOMETRY_RESYNC_OBSERVERS`
  と同型）。
- `cargo test` は既定でテスト関数を並行実行する。Phase 6 の実機スモークテスト
  （`tests/win32_overlay_smoke.rs`）を最初に書いたとき、複数テストが同時に
  overlay window（class 名は全テスト共通の `UXFDNativeOverlayWindow`）を
  作るため、`FindWindowExW` を class 名だけで引くと他テストの overlay を
  誤って掴んだ（実機で `followed overlay rect = (0, 0, 0, 0)` として顕在化
  ——別テストが detach してウィンドウを破棄した後の値だったと考えられる）。
  `EnumWindows` + `GetWindow(GW_OWNER)` で自分の `owner` HWND と一致する
  ものだけへ絞り込むよう修正した。
- `windows` crate 0.58 の `Win32_UI_WindowsAndMessaging` フィーチャに
  `OBJID_WINDOW`/`CHILDID_SELF` の定数が見当たらなかったため、Win32 SDK の
  値（どちらも `0`）をこのモジュール内で直接定義した。

## 実測

| 項目 | 結果 |
|---|---|
| macOS `cargo test`（native-overlay） | 99 / 0 / 0（Phase 5 から不変。win32_overlay.rs の新規ユニットテストは `#[cfg(target_os = "windows")]` のため macOS ではコンパイル対象外） |
| macOS `cargo test`（native-wgpu-renderer） | 全 pass（不変） |
| `cargo check --target x86_64-pc-windows-msvc --tests`（native-overlay・native-wgpu-renderer） | 0 errors |
| mainpc 実機 `cargo test --release --lib`（native-overlay） | 88 passed / 2 failed。失敗 2 件は `progress/windows-w5-native-overlay.md` に記録済みの既存 Windows 固有バグ（本 Phase と無関係、既に別タスク切り出し済み）で新規リグレッションなし |
| mainpc 実機スモークテスト（`tests/win32_overlay_smoke.rs`、2 本） | **`ok. 2 passed; 0 failed`（`--test-threads=1`、`finished in 186.34s`）** |

新設した `native_overlay_follows_owner_window_move_via_geometry_resync_hook`
は、owner を `SetWindowPos` で `(+300, +150)` 動かした後、overlay の
`GetWindowRect` が同じ量だけ追従することを確認する（メッセージポンプは
テスト内で明示的に回した。上記「Constraints」参照）。実測ログ:

```
[w6-geometry-follow] initial overlay rect = (18, 51, 338, 291)
[w6-geometry-follow] followed overlay rect = (318, 201, 638, 441)
```

差分は x: +300, y: +150 で期待どおり一致した。
**owner window の実際の move に overlay が追従することを実機で確認した。**

## 未検証のまま残るもの

1. **per-monitor 高DPI 環境での実機検証**: `dpi_scale_factor_from_dpi`/
   `resolve_overlay_screen_rect` のユニットテストは通っているが、mainpc は
   100% スケール機のため「実際に 150%/200% 環境で overlay がずれないか」は
   未検証。加えて、Electron のプロセスマニフェストが PerMonitorV2 DPI
   awareness を宣言しているかどうかも本 Phase では確認していない
   （`electron-builder` の manifest 設定は W1 のスコープに近く、本 Phase では
   `native-overlay` 側の座標変換ロジックのみを対象にした）。
2. **Bug E（z-order 切替）の実 Electron 上での見た目確認**: `SetWindowPos`
   呼び出し自体はコンパイル・配線済みだが、実際に HTML UI を overlay の
   手前に出す/戻すという見た目の効果は実 Electron アプリでの目視確認をして
   いない（`macos_overlay_obstructed_toggle_uses_order_below_not_order_out`
   のような「呼び出しの形」をソース文字列で確認するテストも Windows 側には
   未整備）。
3. **devtools 開閉時の挙動**: `WM_WINDOWPOSCHANGED` 相当のイベントとして
   `EVENT_OBJECT_LOCATIONCHANGE` が devtools のドッキング/アンドッキングでも
   発火するかは実 Electron アプリでの確認をしていない（owner のクライアント
   矩形がリサイズされるはずなので理論上は同じ経路で拾えるはずだが未検証）。
4. **初回 attach のパイプライン生成コストによる UI スレッドブロック**:
   `#[napi(js_name = "attachNativeOverlay")]` が `async` 指定の無い同期関数
   であることを確認した。napi はこれを呼び出し元（Electron メインプロセスの
   JS スレッド＝ Chromium UI スレッド）上で同期実行するため、初回 attach の
   パイプライン生成コスト（DXC 導入後で数十秒、Fxc フォールバック時は
   最大 10 分超）は**そのまま UI スレッドをブロックする**。W5 の申し送り
   どおり、この修正（非同期化・別スレッドへの退避・事前ウォームアップ等）
   は本 Phase のスコープ外（「trivially safe でない限り fix しない」の指示
   どおり）。W7 以降の検討課題として残す。

## Phase 7 への申し送り

- 上記「未検証のまま残るもの」1〜4 はいずれも Phase 7（段階導入と既定切替）
  より前に、少なくとも 1 台の高DPI機・実 Electron アプリでの目視確認を挟む
  ことが望ましい。
- UI スレッドブロック（上記4）は、24 時間ベンチや既定 ON 切替の判断材料として
  重要度が高い。初回 attach 時にモーダルなフリーズが体感されるレベルか、
  ユーザー影響の実測が必要。
