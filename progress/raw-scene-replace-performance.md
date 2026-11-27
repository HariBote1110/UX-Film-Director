# Raw graph置換の初期性能測定

測定日: 2026-10-18

## 測定と判断

- graph全量は編集時の`scene.replace`だけで送り、再生frameごとには送らない方針を維持する。
- 検証済みrelease backendへ標準入出力でgraph-only RPCを送り、送信開始からJSON応答受信までを測定した。起動後、件数ごとに2回のウォームアップと10回の計測を行った。
- 入力は`all-object-types.json`のgraph設定とshapeを複製したもの。各object idは一意、revisionは毎回増加させた。全応答で成功を確認した。

| shape数 | RPC payload（byte） | 中央値（ms） | 最大（ms） |
| --- | ---: | ---: | ---: |
| 1 | 3,447 | 0.048 | 0.153 |
| 100 | 34,231 | 0.956 | 2.912 |
| 1,000 | 315,033 | 8.719 | 12.579 |

## 測定の限界

- 使用binaryは`.codex/bin/uxfd-rust-backend-verified-20261016`。測定時の作業線は`feature-proxy` / `dd86b995`で、当該binaryはgraph-only置換と任意秒位置queryに対応する。
- ElectronのcontextBridge・structured clone・renderer側graph準備・描画完了待ちは含まない。UIの応答時間や許容上限としてこの値を使わない。
- 単純shapeのみであり、PSD・text・動画・複数group・多数keyframeの負荷を代表しない。実編集シーンのElectron往復時間とスクラブ遅延を測るまで、性能上限は未決のままとする。
- この初期値だけを根拠に差分更新プロトコルやキャッシュを増設しない。
