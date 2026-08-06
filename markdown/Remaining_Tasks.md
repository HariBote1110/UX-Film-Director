# 残タスク一覧（2026-08-07 時点）

`feature-proxy` ブランチの作業ツリーがクリーンな状態で、ドキュメントとコミット履歴から
洗い出した未着手タスクをまとめる。着手時はこのファイルの該当項目へ進捗を追記する。

---

## 1. 未修正バグ

### 1-1. 外部ビデオ経路のシーク後の色崩れ（優先度: 高）

- 出典: [Bug_ExternalVideoPausedFrameZero.md](./Bug_ExternalVideoPausedFrameZero.md) §5
- 症状: シーク後、外部ビデオ経路（`importExternalTexture` + `externalVideoFrameShaderCode`）の
  出力色が Rust デコード RGBA 経路と食い違う。
- 想定原因: `importExternalTexture` が video のネイティブ色空間（bt709 等）を内部変換するため、
  シェーダ側の前提（sRGB / linear、premultiplied alpha）とズレる。
- 完了条件: `markdown/architecture/03-colour-pipeline.md` の規約に沿って両経路の色を一致させ、
  画素比較テストで固定する。
- 備考: プレビューと export の色が食い違う状態は他の見た目の判断すべてを狂わせるため、
  UI 整理や機能追加より優先する価値がある。

### 1-2. テキストの縁取り・影がプレーン境界でクリップされる（優先度: 中〜高）

- 出典: [text-stroke-shadow-clipping.md](../progress/text-stroke-shadow-clipping.md)
- 症状: `textStroke.width` / `textShadow.offset` / `textShadow.blur` で本体グリフより外側へ
  広がる装飾が、テキストプレーンの境界で切り落とされる。
- 想定原因: プレーン寸法が本体グリフのメトリクスだけで決まり、装飾のはみ出し分が加算されていない。
- 難所: プレーンを広げるだけだと回転軸が動くため、TS 側の寸法・位置と Rust 側の描画原点を
  協調して変更する必要がある。
- 備考: `textShadow.blur` 実装（Beta-483a）以降、影がさらに外側へ広がるため以前より目立つ。

---

## 2. エージェントレシピの詰め

出典: [ai-agent-editing.md](../progress/ai-agent-editing.md)

### 2-1. テキストの実測幅が不明で `align` が活きない

- 現状: `text` の実測幅はビルド時点で不明なため、厳密な中央寄せをしたいテキストは
  `width` / `height` に想定サイズを明示する必要がある（自動計測はしない）。
- 課題: 座標の手計算を減らすために `align` / `relativeTo` を入れたのに、テキストだけ
  手動指定が残るので効果が半減している。
- 方向性: フォントメトリクス計測の導線を用意し、レシピ展開時に実測幅を解決する。

### 2-2. `blur` のフォールバック経路が極端に遅い

- 現状: GPU 非対応のフォールバックレンダリング環境では、`strength` / 対象サイズを大きくするほど
  書き出しが極端に遅くなり、`agent:video` がタイムアウトする（400 秒でも完走しないケースを確認）。
- 現在の回避策: 運用で `strength: 20〜30` 程度・対象を画面の一部にとどめる、という約束のみ。
- 方向性: フォールバック経路のぼかし実装を分離可能フィルタ等で計算量を落とすか、
  上限を実装側で強制してタイムアウトを構造的に防ぐ。

---

## 3. Task.md 2026-06-23 方針の未消化分

出典: [Task.md](./Task.md) 「追加タスク（2026-06-23）」

AviUtlPackV4 の広範囲な新規移植を止め、既に入れた `GetColor` / `hksy` / `93` 系の詰めへ移る、
という方針が立っているが、以下がまだ手付かずである。

- 代表シーンを固定し、GetColor / hksy / 93 が混在した状態で、保存 / 読込、Rust scene snapshot、
  native media support、preview / export 品質確認を継続できるテスト基盤を整える。
- 以後の優先順位（機能数追加より上位に置くと宣言した軸）:
  UI 整理、パラメータ理解性、即時プレビュー、export との差分低減、画素検査、操作性改善。

---

## 4. パフォーマンス（→ `perf_research/` へ移管）

現状で困ってはいないが余力を詰める探索として、独立した研究ディレクトリで進める。
実測・仮説・棄却記録は [perf_research/notes/INDEX.md](../perf_research/notes/INDEX.md) を正とする。

未解決の主要な問いは次の 2 つ（出典: [renderer-per-frame-rerender.md](../progress/renderer-per-frame-rerender.md)）。

- `Viewport` の `commitCount` が 377 → 191 に半減した後も、再生区間 178 フレームに対して
  約 1 回 / フレームのコミットが残っている。発生源が未特定。
- `layoutCount` 213 の主体が「React のコミット」から「rAF 内の命令的 DOM 更新」へ移った。
  最有力候補は `TimelineCurrentTimeDisplay` の `textContent` 更新だが未確定。
  また、選択ありシナリオでの選択枠 SVG パッチの layout 影響は未測定。

---

## 5. ブランチ運用

- `main` と `feature-proxy` の差が 2906 コミットある。`feature-proxy` が事実上の開発線に
  なっているため、統合方針を決めるかブランチ運用を整理するかの判断がどこかで要る。
