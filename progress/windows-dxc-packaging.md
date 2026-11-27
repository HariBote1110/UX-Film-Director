# DXCのWindows x64パッケージ同梱

## 決定

- Windows/DX12の描画パイプラインはDXCを必要とする。Fxcへのruntime fallbackは非常に長い初回コンパイルを製品で起こしうるため、Windows package前にDXC資産の欠落を検出してbuildを失敗させる。
- DirectXShaderCompiler公式の固定release v1.9.2607からx64の`dxcompiler.dll`と`dxil.dll`を取得する。GitHub Release APIが示すasset `dxc_2026_07_29.zip`のSHA-256は`a1dfb116ba3eeae6a1582291b53a8e7bf65ad760676bd3194685c8f7367cd241`。取得後にこのhashを検証し、zipからx64 DLLと3件の配布元ライセンス文書だけを`windows/dxc/x64/`へ配置する。DLLは大きいためGit管理しない。
- `electron-builder`の`win.extraFiles`でDLLとライセンスをWindowsのアプリcontent root、すなわちElectron exe横へ配置する。`native-wgpu-renderer`は`current_exe()`の親を探索するため、`resources/`配下は誤った配置になる。`beforePack`はWindows x64以外を拒否し、必要DLL・ライセンス全件の存在を確認する。macOS/Linuxではhookは何も要求しない。
- `npm run dxc:prepare`が取得・検証・配置を行い、`npm run build:win`が準備後に既存buildを`--win --x64`付きで実行する。pack前hookもあるため、別経路のWindows buildでも準備忘れを検出する。
- DXC公式READMEはUniversity of Illinois Open Source Licenseでの配布を明記し、LICENSE.TXTはソフトウェアと同梱文書の制限なしの利用・複製・変更・配布を許可している。バイナリ再配布条件には著作権表示・条件・免責文の保持が含まれるため、release zip内の`LICENSE-LLVM.txt`、`LICENSE-MS.txt`、`LICENCE-MIT.txt`をまとめてアプリrootへ含める。

## 代替案

- DLLを`extraResources`へ入れる案は、exeと同じ階層を参照する`current_exe()`探索と合わないため採用しない。
- DLLをリポジトリに追加する案は、約30MBのビルド生成物をGit履歴に持ち込むため採用しない。固定URLとchecksumから再取得する。
- DLL不在を許可してFxcへfallbackさせる案は、配布物が起動後に数十分級のshader compileへ入ることを隠すため採用しない。Windows packageのみfail-fastさせる。
- arm64向けDXCはzipに含まれるが、アプリのWindows build targetはx64のみである。今回の範囲ではx64以外を拒否し、別architectureのDLL取り違えを防ぐ。

## 制約・注意点

- 公式release: [DirectXShaderCompiler v1.9.2607](https://github.com/microsoft/DirectXShaderCompiler/releases/tag/v1.9.2607)。配布元の説明: [DirectXShaderCompiler README](https://github.com/microsoft/DirectXShaderCompiler)。ライセンス本文: [LICENSE.TXT](https://github.com/microsoft/DirectXShaderCompiler/blob/main/LICENSE.TXT)。
- この環境で公式zipを実取得してSHA-256一致、x64 DLLサイズ（28,079,968 bytes / 3,831,600 bytes）、ライセンス3件を確認した。`npm run dxc:prepare`も完走した。
- macOS上で`npm run build -- --dir --win --x64`を実行し、electron-builder 24.13.3の`.mjs` `beforePack` hookがpack前に動くこと、`release/win-unpacked`内でDLLとライセンスが`UX Film Director.exe`横に配置され、`resources/`には入らないことを確認した。electron-builderは既存設定の`rust-backend/target/release`と`macos-coreml-tracker/.build/release`不在を警告したが、これは本DXC資産とは別の既存build prerequisiteである。
- 旧`mainpc`は撤去済みで、現在`rpsh` endpointも接続拒否のため、Windows実機build・インストーラ実行・高DPI動作は未確認。macOS上のWindowsターゲットpack出力はファイルlayoutのみの確認で、Windows runtimeやWindows用native addonの実機成功とは扱わない。
