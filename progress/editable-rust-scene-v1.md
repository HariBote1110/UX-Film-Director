# 編集可能RustシーンV1

## 決定

- 編集操作中にRustへ渡すProjectの変換器は、`shape`、`image`、`video`、
  `psd`、`text`、`getcolor_dot_field`、`hksy_checker_grid`、
  `simple_tube`を対象にする。
- trackとclipの順序は既存snapshotと同じく、layer昇順、同一layerではobjects配列への挿入順とする。
- mediaのserializer、fpsの有理数化、frame換算、colour pipelineはsnapshot実装を公開入口経由で再利用する。編集Projectとframe snapshotのmedia表現を別々に保守しないためである。
- position keyframeはclip開始からのframe offsetへ変換する。明示keyframeが2件未満なら、既存の`enableAnimation`の開始・終了位置を互換keyframeとして出力する。
- GetColorの画像サンプリングは、ローカルPNG/JPEG/PSDを参照する場合だけ
  受け入れる。参照不能なURLや未対応object参照は、壊れた見た目を出さず
  `unsupportedGetColorSampleSource`として拒否する。
- GetColorの`sampleSourceObjectId`/`sampleSourceLayer`は、Project全体の
  objectから表示開始時点で解決し、PSDの場合は有効layer IDも既存media
  serializerの出力どおりに引き継ぐ。生成エフェクト用に別serializerは作らない。

## 検討した代替案

- Chromium側で各時刻の評価済みsnapshotを送り続ける方式は、編集可能なtimeline状態をRustに移管できないため採用しない。
- filter、グループ、mask、逆再生、subject cropを暫定的に無視する方式は、見た目が壊れた編集を成功として扱ってしまうため採用しない。V1では明示的に拒否する。

## 制約

- `VITE_UXFD_RUST_TIMELINE_SCENE_RPC=1`のViewportでは、編集時に
  `scene.replace`、時刻更新時に`scene.evaluate`を使ってこのProjectを評価する。
- 非表示layerのobjectはProjectに含めない。timeline上の時間帯可視性はProject全体を送る編集変換では判定しない。
- すべての有効filterは次段階まで未対応であり、1件でもあるobjectは変換を拒否する。
