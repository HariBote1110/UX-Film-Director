# テキストの縁取り・影がプレーン境界でクリップされる（未修正）

## 症状

`textStroke.width` や `textShadow.offset/blur` で本体グリフより外側へ広がる装飾が、
テキストプレーンの境界で切り落とされる。`textShadow.blur` を実装した Beta-483a 以降は
影がさらに外側へ広がるため、**この既存バグが以前より目立つ**。

## 原因

テキストプレーンの寸法が本体グリフのメトリクスだけから決まっており、装飾のはみ出し分が
加算されていない。

- `src/utils/textBoxMeasurement.ts` の `measureTextBoxSize` — `measureText` の幅と
  `fontSize * LINE_HEIGHT_RATIO * 行数` の高さのみ。`textStroke` / `textShadow` を見ていない。
- `src/utils/rustSceneSnapshot.ts` の `textMediaBox` — 上で求めた
  `measuredWidth` / `measuredHeight` をそのままプレーン寸法にする。
- `rust-backend/src/generated/text.rs` の描画はプレーン外のピクセルを捨てる
  （`paint_buffer` / `paint_shadow` の境界チェック）。

## なぜ「寸法を広げるだけ」では済まないか（着手前に必ず読むこと）

単純にプレーンを広げると**テキストの表示位置と回転の軸が動く**。

`src/utils/sceneHitTest.ts` の `getObjectWorldCorners` が示すとおり、オブジェクトの
ローカル矩形は常に左上原点 `(0,0)-(width,height)` で、**回転・スケールはこの左上を軸に
適用される**（`toWorld` は `container + rotate(local * scale, rotationRad)`）。

したがってプレーンを左・上方向へ `pad` だけ広げると:

1. グリフをプレーン内で `+pad` ずらさないと、装飾用に確保した余白の外へ本体が出てしまう
2. さらにプレーン原点（オブジェクトの x/y）を `-pad` 動かさないと、本体グリフの
   見た目の位置が `+pad` ずれる
3. **回転・スケールがある場合、2 の補正は `rotate(-pad * scale, rotationRad)` でなければ
   ならない**。素朴に `x -= pad; y -= pad` とすると、回転したテキストが回転量に応じて
   ずれる

つまり TS 側（寸法・位置）と Rust 側（描画原点）の協調変更が要る。既存プロジェクトの
テキスト位置を変えないことが最優先の制約であり、**回転・スケール付きテキストの
契約テストを先に用意してから着手すべき**。

## 検討した案

- **プレーンを広げず、Rust 側だけで装飾を内側へ寄せる**（縁取りを内描画にする等）— 却下。
  見た目が変わるうえ、影のオフセットは原理的に外へ出るので解決にならない。
- **常に固定量のパディングを足す**（例: fontSize の 50%）— 却下。無駄なプレーンが増え、
  かつ大きな blur では足りない。装飾量から必要分を計算すべき。
- **装飾のはみ出し量を計算してプレーンを広げ、位置を補正する**（本命）— 上記の
  回転・スケール補正が必須。

## 必要なはみ出し量（参考）

- 縁取り: `textStroke.width` を全方向
- 影: `offsetX/offsetY` の符号方向へ `|offset|`、加えて全方向へブラーの広がり
  （`text.rs` の `box_blur_radius_for` が返す半径のおよそ3倍。3パス直列で広がるため）

## 関連

- `progress/text-shadow-blur.md` — ぼかし実装。この制約をコード内コメントにも残している
- `markdown/Chromium_Limitation_Handoff.md` の P2 節 — 未修正バグとして記載
