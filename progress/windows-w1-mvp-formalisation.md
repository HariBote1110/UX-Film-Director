# Windows Port W1: 準対応MVPの正式化

## Decision
- `package.json` の `build` スクリプトが Windows の cmd で壊れる件（POSIX の
  `CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder` という env 代入は cmd に存在しない構文）は、
  `cross-env` を devDependency に追加して解決した。他に確立されたパターンがなかったため新規導入。
  mainpc 実機の cmd で「素の POSIX 代入は失敗する／`cross-env` 経由なら成功する」の両方を実測して確認済み。
- `electron-builder` の `build.win` ターゲットを追加した。`nsis` / `x64` を既定にした
  （配布形態として一般的な構成で、Phase 1 時点では特別な理由がない限りこれで十分と判断）。
  `nsis.oneClick: false` と `allowToChangeInstallationDirectory: true` を付け、
  インストール先を選べるようにした（既定のワンクリックインストーラは要件にないため）。
- ffmpeg 解決ロジックは **同梱しない**（親の判断を踏襲）。代わりに:
  1. ロジックを `electron/main.ts` から `src/utils/ffmpegResolve.ts` に切り出し、TDD 可能にした。
  2. Windows では winget のシムディレクトリ
     (`%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe` / `ffprobe.exe`) を追加で確認する。
     mainpc 実機で `winget install` 後の実際の設置先がこの通りであることを確認済み
     （`C:\Users\<user>\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe` がシンボリックリンクとして存在）。
  3. どこにも見つからず ffmpeg の起動自体が `ENOENT` で失敗した場合、
     `buildFfmpegNotFoundMessage()` で「winget でインストールし、新しいターミナルを開き直して
     PATH を確認する」という具体的な導線を持つエラーメッセージを生成し、そのまま UI に返す。
- remote-deck の WebSocket サーバ初回起動時のファイアウォール許可ダイアログは、
  コード変更ではなくドキュメント化のみで対応する（下記「remote-deck ファイアウォール」参照）。

## Alternatives considered
- ffmpeg をアプリに同梱する案 → 却下（親の判断）。配布サイズの増大と
  ライセンス同梱の手間に対して、Windows は「準対応」の位置づけなので見送った。
- `package.json` の `build` スクリプトをプラットフォーム分岐（`if/else` シェルスクリプト）で
  書く案 → 却下。`cross-env` の方が可読性が高く、Windows 固有のシェル分岐用スクリプトを
  追加で保守する必要がない。

## Constraints / Gotchas
- **winget が追加した PATH の変更は、既に開いているシェルセッション（SSH セッションを含む）には
  反映されない。** 新しいターミナル/PowerShell を開き直す必要がある。
  `resolveFfmpegPath` が winget のシムディレクトリを直接チェックしているのはこのため
  （PATH の反映を待たずに解決できる）。
- `electron-builder --win` を macOS 上で `--dir` モードで実行するとコード署名や
  インストーラ生成（nsis 本体の実行）をスキップしてパッケージングのみ検証できる。
  `nsis` インストーラそのものの生成には Wine 環境が必要で、今回は未検証（macOS ローカルでは
  `win-unpacked` / `win-arm64-unpacked` の生成と `.exe` エントリの存在まで確認した）。
- ffmpeg 解決ロジックは `src/utils/ffmpegResolve.ts` に切り出したことで vitest の対象になった
  （`electron/**` は `vite.config.ts` の `test.include` に含まれておらず、従来は
  `electron/main.ts` 内のロジックを直接テストできなかった）。

## remote-deck ファイアウォール（ドキュメントのみ・コード変更なし）
- `startRemoteDeckServer`（`electron/remoteDeckServer.ts`）が `ws` サーバを `0.0.0.0` で
  bind するため、Windows では初回起動時に「Windows セキュリティの重要な警告」ダイアログ
  （パブリック/プライベートネットワークでの通信を許可するか）が表示される。
  ユーザーがブロックを選ぶと、スマホ側（remote-deck）から到達できず QR 接続が失敗する。
- 対応方針: Phase 1 ではコードを変更しない。将来的な選択肢としては
  (a) `electron-builder` の Windows ビルドにファイアウォール規則を事前登録する
      NSIS カスタムスクリプトを足す、
  (b) 初回接続失敗時に UI 側で「Windows Defender ファイアウォールの許可が必要」という
      案内を出す、の 2 つがある。いずれも Phase 1 のスコープ外なので次フェーズ以降で検討する。
