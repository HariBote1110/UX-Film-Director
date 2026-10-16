# テキストの縁取り・影がプレーン境界でクリップされる

## Decision

- テキストmedia寸法は本体グリフの領域に必要な装飾余白だけを加える。縁取りは全方向へ幅分、影は三段box blurの各段で広がる半径と符号付きoffsetから左右上下を別々に算出する。
- 計測済みの本体幅・高さは従来値を保持し、`textMediaGeometry.ts` が装飾込みのmedia寸法とローカルInsetsを提供する。ヒットテストと選択枠も同じ外枠を使う。
- 拡張プレーンのローカル原点移動に伴うtranslation補正は `-R(rotation) * scale * (left, top)`。Rustのstatic transformとposition keyframe、TS snapshotの評価translationに適用し、本体のワールド位置を保つ。
- Rustへ渡すText sourceには装飾がある場合だけ `__renderOffsetX/Y` と本体レイアウト寸法を内部メタデータとして含める。公開 `TextObjectFields`/schemaは変えない。native rendererは本体寸法で文字揃え・レイアウトし、各描画passをoffsetして拡張planeへ描く。
- resident Rust builderではobject開始時に有効なgroup_controlのscale/rotationを含めて補正を作り、テキストの位置keyframeにも同じ差分を加える。group_controlのtranslationは評価時に加算されるので、文字本体の座標契約は保たれる。

## 原因

`measureTextBoxSize` と `textMediaBox` はグリフの幅・行高だけでplaneを決めていた。一方、native rendererはplane外のピクセルを捨てるため、strokeとshadowが境界で切れていた。単に寸法を増やすと、左上原点を軸にした回転・scaleの見た目位置と中央/右揃えのレイアウトが変わるため、plane寸法、source内描画offset、translation補正を一つの契約として扱う必要がある。

## Alternatives considered

- テキスト本体をずらさずplaneだけ拡張する案 — 左上/上端に余白がなく、装飾のクリップが残る。
- 固定量のpaddingを付ける案 — 装飾量に応じないため過剰または不足する。
- 左上座標からpaddingを単純に減算する案 — 回転・負scaleで移動方向が誤る。
- TextObjectFieldsに描画メタデータを公開フィールドとして加える案 — 編集モデル・型・schemaの変更が不要なため内部source metadataを使う。

## Constraints / Gotchas

- 三段box blurの広がりは現在の `text.rs` にある `box_blur_radius_for` と同じ丸め順で算出する。描画実装を変える場合は `textDecorationBounds.ts` とRust builder側の計算も揃える。
- 中央/右揃えを維持するには、native `layout_text_buffer` に拡張media寸法ではなく元の本体寸法を渡す。offsetは本体、stroke、影の各描画passすべてに加える。
- TSの選択枠とヒットテストは本体のtransform原点から `(-left,-top)` へ広がるローカル矩形で評価する。`textMediaBox` は寸法、`textMediaInsets` は原点を含む境界計算に使う。
- legacy direct呼び出しも同じText source serializer/native rendererを通すこと。別source parserを導入するときは `__renderOffset*` と `__content*` を引き継ぐ。
- text sourceの測定幅はUIのCanvas実測値のためRustはそのまま読めない。Rust builderの未計測fallbackとTS `textMediaContentBox` のheuristicは既存のまま維持する。
- resident builderはClip内に固定translation補正を格納するため、clip開始後に別group_controlが新たに有効/無効になるような構成では補正の再計算が必要になる。通常の、clip開始時点から有効なgroup_controlと位置アニメーションは評価テストで確認している。
