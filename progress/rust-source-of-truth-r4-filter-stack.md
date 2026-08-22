# R4-9: `filterStack.ts` 5編集操作とRust側フィルタCommandの忠実性ギャップ解消

## 事象・調査結果

R4-8で「filter系Command（`AddFilter`/`RemoveFilter`/`ToggleFilterEnabled`/
`MoveFilter`/`UpdateFilterParams`）へのIPC配線」は完了したが、`filters`配列を
更新するだけで legacy ミラーフィールド（`colorCorrection`/`customClipping`/
`vibration`/`shadow`、shapeのみ`gradient`）を一切更新しない既知の限界が
残っていた（`progress/rust-source-of-truth-r4-8-command-ipc.md`「undo-fidelity
アプローチ」節）。forward経路（UIクリック）は`src/utils/filterStack.ts`の
5編集操作（末尾で必ず`materialiseSyncedObject`を呼ぶ）が両方を同期するが、
undo/redo経路は`command.apply` IPC → `apply_command`（Rust）が`filters`配列
のみを書き換えるため、undo/redo後は legacy フィールドが古いままになりうる
という非対称があった。

## 決定: legacy ミラー同期はRust側`apply_command`が持つ（オプション a を採用）

- `rust-core/src/schema.rs`の`BaseObject.color_correction`/`custom_clipping`/
  `vibration`/`shadow`、`ShapeObjectFields.gradient`はいずれも現役のフィールド
  であり、非推奨・削除予定であることを示す記述はコード・progress/markdown文書
  のどこにも見当たらなかった（`grep -rn "legacy" progress/*.md markdown/*.md`
  で該当ヒットはR4-8/本ファイルの記述のみ、フィールド自体の削除計画は無し）。
  したがって「(b) legacy フィールドは廃止予定なのでTS側post-apply再同期で
  済ませる」を選ぶ根拠がなく、tarスコープ指示どおり **(a) Rust側
  `apply_command`にミラーリングを実装** を採用した。
- `rust-core/src/command.rs`に`sync_legacy_effects_with_filters(&mut
  TimelineObject)`を新設。`src/utils/filterStack.ts`の
  `materialiseSyncedObject`と同じ意味論（各 legacy 種別ごとに「配列後方から
  見て最初に見つかった filter」を採用、`gradient`はshape kindのみ）を
  Rustへ移植した。`AddFilter`/`RemoveFilter`/`ToggleFilterEnabled`/
  `MoveFilter`/`UpdateFilterParams`の5コマンドすべての適用末尾でこの関数を
  呼ぶ（`Command::Batch`はこれらを内包する形で`apply_command`を再帰呼出し
  するため自動的にカバーされる）。
- 型のTS側再生成（`npm run codegen:types`）は差分ゼロ（新規追加した公開型は
  無く、内部関数のみの変更のため）。

## テスト

`rust-core/tests/command_undo.rs`に3件追加（フィクスチャ
`realistic-heavy-edit-v2.uxfd.json`の`realistic-main-video-a`オブジェクトが
`filters[0]`と`colorCorrection`をすでに一致させて持っている前提を利用）:

- `update_filter_params_resyncs_legacy_color_correction_mirror`:
  `UpdateFilterParams`適用後に`colorCorrection.brightness`が新しい値へ
  追従し、undoで元の値へ戻ることを確認。
- `remove_filter_clears_legacy_mirror_when_last_matching_filter_removed`:
  対応するfilterを`RemoveFilter`で消すと`colorCorrection`キー自体が
  消える（`Option::None`→シリアライズ時省略）ことを確認。
- `add_filter_populates_legacy_mirror_for_new_filter_type`:
  それまで存在しなかった`clipping`種別を`AddFilter`で追加すると
  `customClipping`が新規に生成されることを確認。

いずれも`apply(invert(apply(scene, cmd))) == scene`のround-trip一致まで
確認済み（既存のproptest群と同じ不変条件）。

## `filterStack.ts`側の判断: 5編集操作は現状維持（意図的に「縮小しない」）

`addFilterToObject`/`toggleFilterEnabledInObject`/`removeFilterFromObject`/
`moveFilterInObject`/`updateFilterParamsInObject`の呼び出し元を
`src/store/useStore.ts`で確認したところ、いずれも**forward経路（UIから
直接呼ばれる同期的な state 更新）でのみ使われている**
（`addObjectFilter`/`toggleObjectFilter`/`moveObjectFilter`/
`removeObjectFilter`/`updateObjectFilterParams`アクション）。R4-8の設計
どおり、forward経路は引き続きTS側で同期的に`set()`し、`pushHistoryCommand`
で対応する`Command`を別途スタックへ積む方式（undo/redo時のみRust
`command.apply` IPCを経由する）を採用しているため、この5関数はforward
経路の唯一の実装として**現時点でも必要最小限**であり、これ以上の削減余地
はない（Rust側へforward経路自体を移送する変更は本タスクのスコープ外——
IPC往復のたびに毎キー入力/クリックで同期待ちが発生し、UIのレスポンス
特性を変えてしまうため、別バッチとして再検討すべき変更）。よって
`filterStack.ts`の行数・実装は本バッチで変更していない
（`git diff --stat src/utils/filterStack.ts` はゼロ）。

## 副次的に判明した既知のギャップ（本バッチでは対応せず記録のみ）

`src/store/useStore.ts`の`updateObjectFilterParams`アクションは、他の4つの
フィルタ系アクション（`addObjectFilter`/`toggleObjectFilter`/
`moveObjectFilter`/`removeObjectFilter`）と異なり、**`pushHistoryCommand`を
一切呼んでいない**（`buildUpdateFilterParamsCommand`という命名の
ヘルパーもcommandBuilders.tsに存在しない）。R4-8の各groupの変換テーブル
を確認したところ、`updateObjectFilterParams`はどのgroupの対象リストにも
含まれておらず、フィルタパラメータのスライダー操作（`PropertyPanel.tsx`の
`handleFilterParamChange`）は現状**undo/redoの対象外**になっている
可能性が高い。他のドラッグ系サイト（`TimelineItem.tsx`/
`useSceneInteraction.ts`のリサイズ等）は「開始時捕捉→終了時diff」で
per-frame emitter化を回避する設計になっているが、フィルタパラメータの
UIには同等の「編集セッション開始/終了」の区切りが実装されておらず、
安全な変換方法（毎キー入力でCommandを積むと履歴が肥大化する一方、
diffベースにするには入力開始/終了イベントの新設が要る）の検討が
本バッチの残り予算では完了できないと判断し、対応を見送った。
`src/store/useStore.ts`の`updateObjectFilterParams`（597行目付近）を
参照。次バッチでの対応候補として記録する。

## 検証済み（フルゲート）

- `npx tsc --noEmit` クリーン。
- `cargo test --manifest-path rust-core/Cargo.toml` フル実行、全green
  （`command_undo.rs`が33件→36件、新規3件含め全て green）。
- `cargo test --manifest-path rust-backend/Cargo.toml` フル実行、全green
  （変更なし、リグレッションなし）。
- `npm run codegen:types:check` 差分ゼロ。
- `npm run fixture:evaluation-parity`（447フレーム比較、除外0）+
  `cargo test --test ts_evaluation_parity` green、
  `KNOWN_DIFFERENCES.json`は`[]`のまま。
- `npx vitest run` フル実行、**257ファイル/1854テスト、全green**
  （R4-8 group f時点と同数 — `filterStack.ts`/TS側は無改修のため
  テスト数の増減なし）。

## R4完了判定

`markdown/Rust_Source_Of_Truth_Plan.md`のR4合格条件は3つ:
1. `load → save → load` round-trip identity — R4-3（stream-1A）で完了済み。
2. 既存`.uxfd`ファイルの読込互換 — 同上、`project_file_round_trip.rs`等で
   継続的に検証。
3. `undo(do(state)) == state` — `rust-core/tests/command_undo.rs`の
   proptest群（`undo_of_do_restores_scene_for_any_real_numeric_field`等）
   で検証済み。本バッチでフィルタ系Commandのlegacyミラー同期ギャップも
   解消したため、undo/redoの忠実性は`filters`配列だけでなく実際に
   TS側forward経路が書き込む全フィールドまで一致するようになった。

3ストリーム（stream-1A: 保存形式/R4-3、stream-1B: historySlice command化
/R4-8、stream-1C: agentProjectレシピ解析/R4-4・R4-5）はいずれも完了済みで、
R4-8が唯一残していた「filter系Commandのlegacyフィールド非同期」も本バッチ
（R4-9）で解消した。**R4は全ての合格条件を満たしたと判定し、
`markdown/Rust_Source_Of_Truth_Plan.md`のR4見出しに ★完了 2026-08-22 を
記録した。**
