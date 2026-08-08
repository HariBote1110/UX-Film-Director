# VM チューニング研究ノート索引

借用 VM（i5-13400F / GPU 無し）上で、自前実装の重い経路（PSD 解析・映像まわり）を
チューニングする研究。新しいものを上に置く。1行1ノート。

- [agpsd-baseline.md](agpsd-baseline.md) — ag-psd 29.1.0 の VM 上ベースライン（readPsd median ≈ 405〜460ms、自前実装が超えるべき壁）（2026-08-08）
- [environment.md](environment.md) — 検証環境の固定記録（VM スペック・接続方法）（2026-08-08）
