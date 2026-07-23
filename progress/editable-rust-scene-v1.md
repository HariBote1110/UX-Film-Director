# 編集可能RustシーンV1

## 決定

- 編集操作中にRustへ渡すProjectの最小変換器は、`shape`、`image`、`video`、`psd`、`text`だけを対象にする。
- trackとclipの順序は既存snapshotと同じく、layer昇順、同一layerではobjects配列への挿入順とする。
- mediaのserializer、fpsの有理数化、frame換算、colour pipelineはsnapshot実装を公開入口経由で再利用する。編集Projectとframe snapshotのmedia表現を別々に保守しないためである。
- position keyframeはclip開始からのframe offsetへ変換する。明示keyframeが2件未満なら、既存の`enableAnimation`の開始・終了位置を互換keyframeとして出力する。

## 検討した代替案

- Chromium側で各時刻の評価済みsnapshotを送り続ける方式は、編集可能なtimeline状態をRustに移管できないため採用しない。
- filter、グループ、mask、逆再生、subject cropを暫定的に無視する方式は、見た目が壊れた編集を成功として扱ってしまうため採用しない。V1では明示的に拒否する。

## 制約

- V1はViewport/RPCへ接続しない。変換結果の境界契約を固定してからscene.replaceへ接続する。
- 非表示layerのobjectはProjectに含めない。timeline上の時間帯可視性はProject全体を送る編集変換では判定しない。
- すべての有効filterは次段階まで未対応であり、1件でもあるobjectは変換を拒否する。
