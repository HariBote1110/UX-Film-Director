# Rust バックエンド導入手順 (第1段階)

## 目的
- Electron UI から切り離した Rust 別プロセスを起動し、IPC で `health` を確認する。

## 前提
- Rust ツールチェーン (`cargo`, `rustc`) が利用可能であること。
- プロジェクトルートは `/Users/yuki/GitHub/UX-Film-Director`。

## ビルド
1. デバッグビルド
```bash
npm run rust:build:debug
```

2. リリースビルド
```bash
npm run rust:build:release
```

## 実行確認
1. Electron アプリを起動する。
2. 開発者コンソールで以下を実行する。
```ts
await window.rustBackend.health()
```
3. `success: true` と `result.status: "ok"` が返れば疎通成功。

## バイナリ探索順
- Electron は以下の順序で Rust バイナリを探索する。
1. 環境変数 `UXFD_RUST_BACKEND_BIN`
2. 開発環境: `rust-backend/target/debug/uxfd-rust-backend`
3. 開発環境: `rust-backend/target/release/uxfd-rust-backend`
4. パッケージ環境: `resources/rust-backend/uxfd-rust-backend`
5. パッケージ環境: `resources/uxfd-rust-backend`

## 次段階
- 第2段階では、現状 Electron 側にある書き出しパイプラインを Rust 側へ順次移管する。
