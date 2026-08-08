# VM チューニング研究ノート索引

借用 VM（i5-13400F / GPU 無し）上で、自前実装の重い経路（PSD 解析・映像まわり）を
チューニングする研究。新しいものを上に置く。1行1ノート。

- [psd-challenge-scoreboard.md](psd-challenge-scoreboard.md) — VMフェーズ総括。可視限定N=8で対ag-psd 5.9倍速・RSS-52%、メタデータ0.07ms。確定した本実装仕様と棄却記録、残る実験3（end-to-end）の設計（2026-08-08）
- [lazy-visible-only-decode.md](lazy-visible-only-decode.md) — デフォルト可視のリーフレイヤー（27/143、可視バイト比率46.88%）だけをデコードする遅延デコードを計測。ピークRSSは予測どおり比例して下がりN=8でag-psd比-51.7%（criterion3の劣勢を解消）、一方デコード時間の削減率は予測の半分程度（非可視レイヤーが平均的に小さくレイヤーあたり固定コストが支配）——線形バイト比例モデルは時間について棄却、RSSについては採用（2026-08-08）
- [memory-peak-comparison.md](memory-peak-comparison.md) — ag-psd vs native psd_fast のピークRSS比較（`/usr/bin/time -v`）。native serialは ag-psd比-21.18%で仮説採用、だが最速のnative N=8は-3.22%で棄却——並列デコードが速度とメモリピークのトレードオフを生み、criterion3とcriterion4は現行設計で同時最良化できない（2026-08-08）
- [pixel-handoff-inventory.md](pixel-handoff-inventory.md) — 現行3経路の搬送コスト棚卸し。ag-psd Worker経路は搬送は薄くデコードが支配、Electron Rustフォールバックはフルコピー5回+ディスク往復2回で反面教師、native overlayのin-processパターンが目標形。end-to-end実験の計測点を設計（2026-08-08）
- [parallel-layer-decode-scaling.md](parallel-layer-decode-scaling.md) — psd_fast.rs のレイヤー並列デコードをrayonスレッドプールでスケーリング計測。N=8で頭打ち（対serial約2.05倍、median≈104〜109ms、対ag-psd約3.8〜3.9倍速）、期待していた「8〜12スレッドでmedian≦60ms」には届かず仮説は棄却（メモリ帯域幅律速の状況証拠）（2026-08-08）
- [native-psd-fast-single-thread.md](native-psd-fast-single-thread.md) — psd_fast.rs をネイティブ単一スレッドでビルドして計測。median ≈ 220ms で ag-psd (b) 405ms の壁を約46%短縮して突破（仮説採用、WASM実行オーバーヘッドが主因説を支持）（2026-08-08）
- [practical-victory-criteria.md](practical-victory-criteria.md) — 合格ラインを「実用面でag-psdを超える」に設定。体感インポート時間・メインスレッド阻害・メモリピーク・スケーラビリティ・段階的表示の5指標（2026-08-08）
- [agpsd-baseline.md](agpsd-baseline.md) — ag-psd 29.1.0 の VM 上ベースライン（readPsd median ≈ 405〜460ms、自前実装が超えるべき壁）（2026-08-08）
- [environment.md](environment.md) — 検証環境の固定記録（VM スペック・接続方法）（2026-08-08）
