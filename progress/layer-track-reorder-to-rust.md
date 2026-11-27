# レイヤー／トラック並べ替え往路の rust-core 移管

## Decision

- `SwapLayerTracks`、`InsertLayerTrack`、`DeleteLayerTrack` を `rust-core::Command` に追加し、レイヤー補完、object の `layer`、PSD `lipSync.targetLayer`、audio visualization `targetLayer` の再マップを Rust の `apply_command` だけで計算する。
- 各 forward command は変更前の `layers` と `objects` を undo payload として持つ。`invert()` は `RestoreLayerTracks` を返し、挿入 overflow で失われた object、削除時に無効化された lipSync、元の短い layer 配列を含めて厳密に復元する。
- Zustand は command と、全 `layers`／全 `objects` を含む SceneData を bridge へ送る。応答時には request 時点と現在の両集合が一致する場合だけ Rust 結果を反映し、成功かつ反映済みの場合だけ履歴へ積む。往復中は `isCommandHistoryPending` により layer 操作と undo/redo を止める。
- `Command::ReorderLayers` は削除した。呼び出し元、rust-backend RPC、agent project API、保存形式に利用箇所は無く、保存されない command history の旧メモリ値を互換対象にする必要もないためである。

## Alternatives considered

- TS が次の layers/objects を計算して `ReorderLayers` で置換する方式は、往路の正本が TS に残るため採用しない。
- 逆操作を swap／insert／delete の再計算だけで表す方式は、削除 object とリセット前 lipSync を復元できないため採用しない。
- filter command と同様に対象 object だけを送る縮約は、全 object の layer と cross-object targetLayer を更新する操作には成立しないため採用しない。

## Constraints / Gotchas

- layer index は既存 UI と同じ 0..99 clamp、足りない layers は `Layer N` で補完する。insert は最下段を落とし、overflow object を削除する。delete は対象 row の object を削除し、参照先が削除 row の lipSync を `enabled: false, targetLayer: 0`、audio visualization を `targetLayer: 0` にする。
- 応答待ちの間に layers または objects が編集された場合、全体結果をマージするとその編集を消すため応答を破棄する。この場合も現在 state を保持し、history は追加しない。camera、selection 以外の無関係 state は置換しない。
- TypeScript の `invertCommand` は Rust の逆コマンド形を mirror する必要がある。新しい command variant を増やす際は `codegen:types`、TS inverse、Rust apply/invert、round-trip test を同時に更新する。
- `RestoreLayerTracks` の `invert()`（Rust／TS `invertCommand` とも）は自分自身を返し、数学的な逆操作ではない。変更後の状態を保持していないためで、`RestoreLayerTracks` は undo 時に `invert()` の結果として一時的に適用されるだけで履歴（past/future）には積まれない、という前提に依存している。`RestoreLayerTracks` を履歴へ直接積む経路を追加する場合は、変更後の layers/objects も payload に持たせる必要がある。
