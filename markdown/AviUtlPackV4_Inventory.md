# AviUtlPackV4 棚卸しと標準搭載方針

## 前提
- 参照元は `/Users/yuki/Library/Mobile Documents/com~apple~CloudDocs/AviUtlPackV4`。
- 2026-06-21時点で、主要な拡張子数は `.anm` 137、`.obj` 61、`.tra` 12、`.cam` 6、`.scn` 2、`.lua` 15、`.stg` 18。
- 第三者スクリプト本体はコピーせず、UX FDネイティブの互換再実装として標準搭載する。

## 主要ディレクトリ
- `script/YMM4`: 登場退場、ランダム、反復、YMM4イージング。
- `script/てぃむ`: 輝度ワイプ、縁取りT、色収差、モーションパス、各種演出効果。
- `script/93`: Audio waveform R、DelayMove、GetColor、Displacement、SpotLightなど。
- `script/その他`: 扇クリッピングR、PixelSorterなど。
- `script/パーティクル`: 標準particle系。
- `Plugins/x264guiEx_stg`: 高画質、高速、YouTube、Twitterなどの出力プリセット。

## 標準搭載優先候補
| 優先 | 候補 | UX FD実装先 | 理由 |
| :--- | :--- | :--- | :--- |
| P0 | AviUtl/YMM4系イージング | native motion preset | 立ち絵、字幕、図形の動きで最も使う |
| P0 | 登場退場 | native motion preset | ボイロ動画の基本操作へ直結 |
| P0 | ランダム/反復 | native motion preset | ゆらし、点滅、ループ移動を少ないUIで作れる |
| P1 | 輝度ワイプ | Rust/WebGPU effect | 既存ワイプの自然な拡張 |
| P1 | 縁取りT | Rust/WebGPU effect | 字幕・立ち絵・画像の視認性向上 |
| P1 | 色収差 | Rust/WebGPU effect | 軽量なGPU効果として演出価値が高い |
| P1 | 扇クリッピングR | Rust/WebGPU effect | 場面転換と表情切替へ使いやすい |
| P1 | Audio waveform R | native generated object | 音声中心動画に向く |
| P2 | 標準パーティクル | native generated object | GPU instancing設計後に効く |
| P2 | オーラ放出 | native generated object | 立ち絵の強調や演出背景に使いやすい |
| P2 | 泡 | native generated object | 水中・回想・柔らかい背景演出に使いやすい |
| P2 | 集中線T | native generated object | 注目・ツッコミ・強調の演出に使いやすい |
| P2 | インクTM | native generated object | 黒い飛沫や汚し表現として使いやすい |
| P2 | バーコードT | native generated object | 暗号化風UI、警告表示、データ演出に使いやすい |
| P2 | パズルピース | native generated object | 分割・組み合わせ・ゲーム風演出に使いやすい |
| P2 | 色相環 | native generated object | 色選びや解説演出に使いやすい |
| P2 | ひょうたんTM | native generated object | くびれ付きシルエットや反復装飾に使いやすい |
| P2 | 歯車 | native generated object | 機械風UIや回転演出の素材として使いやすい |
| P2 | カスタムトラックバー | native generated object | 動画内UIやパラメータ可視化に使いやすい |
| P2 | パイシートグラフ | native generated object | 割合表示や解説UIに使いやすい |
| P2 | 簡易ヒストグラム | native generated object | 色・明度の分布を解説UIとして見せやすい |
| P2 | 日の出 | native generated object | 背景や強調演出に使いやすい |
| P2 | 円矢印 | native generated object | 注釈・循環・誘導表示に使いやすい |
| P2 | 三角括弧 | native generated object | 注釈対象を挟む強調表示に使いやすい |
| P2 | タータンチェック | native generated object | 解説画面や背景素材に使いやすい |
| P2 | 千鳥格子 | native generated object | 解説画面や背景素材に使いやすい |
| P2 | 矢がすり | native generated object | 和柄背景や解説画面の装飾に使いやすい |
| P2 | 紙飛行機 | native generated object | 注釈や移動演出のモチーフとして使いやすい |
| P2 | 麻の葉模様 | native generated object | 和柄背景や装飾枠に使いやすい |
| P2 | 集中線plus | native generated object | ツッコミや注目演出に使いやすい |
| P2 | モーションパス / ベジェ軌道T | native motion preset | 既存キーフレームに接続し、弧やS字移動を少ない操作で作れる |
| P2 | 風揺れT | native motion preset | 立ち絵や字幕に軽い揺れを付ける定番演出 |
| P3 | Luaスクリプト互換 | script runtime later | 安全性、性能、ライセンス確認が大きい |

## 実装メモ
- `src/utils/aviutlPackFeatureCatalog.ts` を機械可読なカタログとして追加した。
- このカタログはUI表示、Rust scene effect境界、実装優先順位の共通参照点にする。
- Pack内のファイル名は参照情報として保持するが、スクリプト本文は取り込まない。
