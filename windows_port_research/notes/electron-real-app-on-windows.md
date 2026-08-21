# Electron 実物での検証（Windows 実機）

## 目的 / 仮説

[dcomp-crosswindow-and-hittest.md](dcomp-crosswindow-and-hittest.md) までで確かめたのは、
下のウィンドウが **GDI で描いた代役**の場合だった。実物の Chromium は自身も
DirectComposition を使うため、overlay を重ねたときに競合しうる。ここを実物で詰める。
あわせて「そもそもアプリが Windows で起動するのか」（準対応 MVP の基準）も確認する。

- H-1: `tsc` + `vite build` は Windows で通り、Electron が起動して UI が描画される。
- H-2: overlay は実物の Chromium ウィンドウの上でも per-pixel alpha で合成される。
- H-3: クリックは overlay を素通りして Chromium 側に届く。

## 環境

`ssh mainpc` / Windows 11 Pro 22631 / RTX 3070 Ti / Node v22.14.0 / Electron 30。
リポジトリは GitHub から `--depth 1 --branch feature-proxy` で clone（5f07855）。
RDP 接続済み（セッション 2 が Active）。計測日 2026-08-22。

Rust 側（rust-backend / native-overlay addon）は**一切ビルドしていない**。
`resolveNativeOverlayBridgeModulePath` は `.node` が無ければ null を返し、
rust-backend も見つからなければ起動を止めないため、JS/TS だけで起動できる。

## 手順

```bat
npm install                      :: 32秒、447パッケージ、エラーなし
npx tsc                          :: 出力なし（成功）
npx vite build                   :: dist/ + dist-electron/{main,preload}.js を生成
npx electron .                   :: schtasks /it 経由でセッション2に流し込む
```

overlay は `windows_port_research/tools/probe-electron`。
`FindWindowW("Chrome_WidgetWin_1", "UX Film Director")` で実物のウィンドウを掴み、
そのクライアント矩形にオーナー付き `WS_POPUP` の overlay を重ねる。

## 結果

### H-1: 採用（起動する）

`npm install` → `npx tsc` → `npx vite build` はいずれも Windows でエラーなく完走。
Electron が起動し、UI（「UX FILM DIRECTOR (DEV PROTOTYPE)」「新規プロジェクト作成」ダイアログ）が
正常に描画された: [images/electron-window.png](images/electron-window.png)

**準対応 MVP の「ビルドが通る」「起動する」は、Rust 側を一切触らずに満たせている。**

### H-2: 採用（実物の Chromium の上でも合成される）

Electron のクライアント座標 `y=200` の画素（画面キャプチャ）:

| 領域 | x | 実測 RGB | 解釈 |
|---|---|---|---|
| 不透明の緑 | 160 | (0, 255, 0) | overlay が完全に覆う |
| 50% 青 / 下は Chromium | 360 | (8, 8, 137) | `(0,0,127) + dst*0.5`。dst≈(16,16,20) の暗い UI と整合 |
| 完全透明 / 下は Chromium | 580 | (23, 23, 26) | Chromium の UI がそのまま |
| overlay 外 | 20 | (10, 10, 12) | Chromium の UI |

画像: [images/electron-overlay.png](images/electron-overlay.png)
——半透明バンド越しに「既存のプロジェクトを開く」ボタンが透けて見えており、
右1/3は overlay が存在しないかのようにアプリの UI がそのまま出ている。

**ちらつき・z-order 競合は観測されなかった**（1フレーム描画・静止状態での観察）。

### H-3: 採用（クリックは Chromium に届く）

`WindowFromPoint` は overlay 内外を問わず `0x200aee` を返した。
セッション 2 内で照会すると:

```
0x200aee : class=Chrome_RenderWidgetHostHWND pid=1848 (electron) rootOwner=0x1307d2
0x1307d2 : class=Chrome_WidgetWin_1          pid=1848 (electron)
```

overlay の HWND は一度も返らず、Chromium の描画ウィジェットに素通りしている。
`WM_NCHITTEST` → `HTTRANSPARENT` が実物相手でも効いている。

### 副産物: WebGPU は使える（DXC エラーは無害）

起動ログに毎回この行が出る:

```
Error: DXC create compiler failed with <Unknown HRESULT> (0x80004002)
    at CheckHRESULTImpl (..\..\third_party\dawn\src\dawn\native\d3d\D3DError.cpp:119)
```

これを見て「WebGPU が死んでいるのでは」と疑ったが、**実際には動く**。
`tools/webgpu-check` で確認:

```json
{ "hasNavigatorGpu": true, "adapter": true,
  "info": { "vendor": "nvidia", "architecture": "ampere" }, "device": true }
```

Dawn は DXC の生成に失敗しても FXC 経由にフォールバックしており、adapter も device も取れる。
**準対応 MVP のフォールバック経路（WebGPU presenter）は Windows で成立する。**

計測上の注意: `navigator.gpu` は **secure context でしか生えない**。最初 `data:text/html,...` を
`loadURL` して測ったため `hasNavigatorGpu: false` になり、危うく誤った結論を出しかけた。
実アプリと同じ `file://`（`loadFile`）で測ること。

## 見つかった実務上の問題

1. **`npm run build` が Windows で動かない。**
   `"build": "tsc && vite build && npm run remote-deck:build && CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder"`
   の POSIX 形式の env 代入を cmd が解釈できない。`cross-env` を入れるか、
   プラットフォーム分岐が要る。今回は各コマンドを個別に叩いて回避した。
2. **初回起動で Windows ファイアウォールの許可ダイアログが出る。**
   remote-deck の WebSocket サーバがポートを開くため。配布時の体験として要検討。
3. `electron-builder` の `build.win` ターゲットが `package.json` に無い（`mac` のみ）。

## 結論

Windows overlay は **macOS 版と同じ設計でそのまま写せる**ことが実物で確認できた。
[dcomp-crosswindow-and-hittest.md](dcomp-crosswindow-and-hittest.md) の対応表は
実物の Chromium 相手でも崩れなかった。

移植の第1段（shm の Windows 実装 + `cfg(unix)` 掛け漏れ）に着手する前提条件は揃っている。

## 未検証事項

- **連続描画時の挙動**（本プローブは1フレーム描いて止まる）。実際の preview は
  毎フレーム present するので、そこでの z-order 安定性・ちらつき・フレームレートは未測定。
- **geometry 追従**（親の移動・リサイズ・DPI 変更・devtools 開閉）。未着手。
- 実機は 100% スケールだったため DPI 非対応のままで座標が一致した。高DPI 環境は未検証。
- rust-backend / native-overlay addon を実際に載せた状態での挙動（第1段の完了後）。
- `in-process-gpu` / `disable-gpu-sandbox` といったスイッチが Windows で悪さをしないかは未精査。
