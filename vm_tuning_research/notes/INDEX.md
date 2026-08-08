# VM チューニング研究ノート索引

借用 VM（i5-13400F / GPU 無し）上で、自前実装の重い経路（PSD 解析・映像まわり）を
チューニングする研究。新しいものを上に置く。1行1ノート。

- [pixel-handoff-inventory.md](pixel-handoff-inventory.md) — 現行3経路の搬送コスト棚卸し。ag-psd Worker経路は搬送は薄くデコードが支配、Electron Rustフォールバックはフルコピー5回+ディスク往復2回で反面教師、native overlayのin-processパターンが目標形。end-to-end実験の計測点を設計（2026-08-08）
- [native-psd-fast-single-thread.md](native-psd-fast-single-thread.md) — psd_fast.rs をネイティブ単一スレッドでビルドして計測。median ≈ 220ms で ag-psd (b) 405ms の壁を約46%短縮して突破（仮説採用、WASM実行オーバーヘッドが主因説を支持）（2026-08-08）
- [practical-victory-criteria.md](practical-victory-criteria.md) — 合格ラインを「実用面でag-psdを超える」に設定。体感インポート時間・メインスレッド阻害・メモリピーク・スケーラビリティ・段階的表示の5指標（2026-08-08）
- [agpsd-baseline.md](agpsd-baseline.md) — ag-psd 29.1.0 の VM 上ベースライン（readPsd median ≈ 405〜460ms、自前実装が超えるべき壁）（2026-08-08）
- [environment.md](environment.md) — 検証環境の固定記録（VM スペック・接続方法）（2026-08-08）
