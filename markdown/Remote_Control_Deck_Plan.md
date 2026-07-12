# Remote Control Deck 計画（スマホ版 Stream Deck / DaVinci コントローラー風）

## 目的

DaVinci Resolve の Speed Editor / Micro Panel のような物理コントローラー体験を、
Android / iPhone のブラウザから利用できる「Stream Deck 式リモートデッキ」として提供する。
専用アプリは作らず、**Electron メイン内に立てたローカル Web サーバへスマホのブラウザでアクセスする PWA 方式**を採用する。

## 方式の選定理由

| 案 | 判断 |
|---|---|
| ネイティブアプリ（Android/iOS） | ストア審査・二重実装・配布コストが高い → 却下 |
| 既製 Stream Deck アプリ + MIDI/OSC | プロトコル制約が強く、ジョグ・状態フィードバックの自由度が低い → 却下 |
| **LAN 内 Web サーバ + PWA（採用）** | 実装が本体と同一スタック（TypeScript/React）、QR コードで即接続、双方向 WebSocket でジョグと状態同期が可能 |

## アーキテクチャ

```
[スマホブラウザ PWA]
   │  WebSocket (JSON コマンド / 状態イベント)
   ▼
[Electron main: RemoteDeckServer (http + ws, LAN bind, token 認証)]
   │  IPC (remote-deck:command / remote-deck:state)
   ▼
[Renderer: CommandBus] ──▶ Zustand store の各 action（togglePlay, undo, redo, seek, …）
```

キーストロークをエミュレートするのではなく、**コマンド ID を直接ストアの action にマップする**。
既存のキーボードショートカット（`src/hooks/useAppLogic.ts`）も同じ CommandBus を経由するようリファクタし、入力経路を一本化する。

## フェーズ計画（各フェーズとも TDD: Red → Green → Refactor）

### Phase 1 — CommandBus（レンダラー内の土台）
- `src/commands/commandBus.ts`：`commandId → handler` のレジストリ。`execute(id, payload?)`。
- 初期コマンド：`playback.toggle` / `playback.seekRelative(frames)` / `edit.undo` / `edit.redo` / `edit.delete` / `selection.escape`。
- `useAppLogic.ts` のキーハンドラを CommandBus 呼び出しに置き換え（挙動不変をテストで担保）。

### Phase 2 — RemoteDeckServer（Electron main）
- `electron/remoteDeckServer.ts`：`http` で静的配信 + `ws` で双方向通信。LAN の全インターフェースに bind、ポートは自動採番。
- 認証：起動時に生成するワンタイムトークン。URL クエリに埋め込み、**アプリ内に QR コードで表示**（`qrcode` パッケージ）。トークン不一致は即切断。
- メッセージ形式：`{ type: 'command', id, payload }` / `{ type: 'state', ... }`。スキーマは `shared/remoteDeckProtocol.ts` に定義し main / renderer / モバイル UI で共用。
- main → renderer は既存 IPC パターン（`nativeOverlayIpc.ts` 等）に倣う。

### Phase 3 — モバイルデッキ UI（PWA）
- `remote-deck-ui/` に Vite サブアプリとして構築、ビルド成果物を RemoteDeckServer が配信。
- レイアウト：JSON 定義のボタングリッド（4×3 目安）。再生/停止・Undo/Redo・削除・イン/アウト・カット等。
- 触覚フィードバック（`navigator.vibrate`、iOS では無視される点は許容）とラベル/アイコン表示。
- PWA manifest でホーム画面追加・全画面表示に対応。

### Phase 4 — ジョグ / シャトル
- 画面下半分に円形ジョグホイール（タッチ角度 → 相対フレーム数）。DaVinci Search Dial 相当。
- 送信は `requestAnimationFrame` 相当で間引き（30〜60Hz 上限）、累積フレーム数を 1 メッセージにまとめる。
- シャトルモード（保持角度 → 再生速度）とジョグモード（回転量 → フレームステップ）の切替。

### Phase 5 — 状態フィードバック（双方向化）
- renderer → main → スマホへ再生状態・タイムコード・選択有無を push。
- ボタンのアクティブ表示（再生中は Play ボタンが点灯等）、タイムコード表示。
- 変更のあったフィールドだけ送る差分方式でトラフィックを抑える。

### Phase 6 — 仕上げ
- 接続管理 UI（アプリ側：接続中デバイス一覧・切断・トークン再生成）。
- ボタンレイアウトのカスタマイズ（JSON 編集 → 将来的に GUI）。
- `User_Guide.md` に接続手順を追記。

## 技術選定

- **WebSocket ライブラリ**：`ws`（main プロセス側、デファクト・依存最小）。
- **QR コード**：`qrcode`（renderer で DataURL 生成）。
- **モバイル UI**：本体と同じ React + Vite。ストアは持たず、プロトコル定義のみ共有。
- mDNS/Bonjour による自動発見は初期スコープ外（QR で十分、依存が重い）。

## セキュリティ / 制約

- LAN 内のみ・トークン必須・平文 ws（LAN 前提、TLS 自己署名はスマホ側の警告 UX が悪いため見送り）。
- iOS Safari は `navigator.vibrate` 非対応 → 視覚フィードバックで代替。
- スリープ抑止は Screen Wake Lock API（HTTPS 必須のため効かない場合はユーザーに画面設定を案内）。

## リスクと対応

- **ジョグの遅延**：WS はローカル LAN で数 ms。間引きと相対値累積で体感遅延を抑える。実測は Phase 4 で e2e 計測。
- **ファイアウォール**：macOS の受信許可ダイアログが出る旨を User_Guide に明記。
- **既存ショートカットの回帰**：Phase 1 で CommandBus 化する際、既存キー操作のテストを先に書いて挙動固定。
