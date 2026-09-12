# フィルタスタック往路の rust-core 移管

## Decision

- `AddFilter` / `RemoveFilter` / `ToggleFilterEnabled` / `MoveFilter` /
  `UpdateFilterParams` の stack 配列変更と、legacy の
  `colorCorrection`・`customClipping`・`vibration`・`shadow`・shape の
  `gradient` へのミラー同期を `rust-core::apply_command` の責務にする。
- `filters` が未設定のオブジェクトは、Rust が TS の
  `buildFiltersFromLegacyEffects` と同じ順序で stack 化してからコマンドを
  適用する。未設定 legacy filter の ID は、対象コマンドが持つ
  `${type}-...` の ID を該当 type に限って引き継ぎ、既存 UI の read helper
  が生成した ID と一致させる。
- `UpdateFilterParams` は部分マージ後に Rust で filter type ごとの正規化を
  行う。これにより、例えば fade の opacity は `0..1` に収まり、gradient の
  colours/stops も既存の TS 規則に従う。
- Zustand の5アクションは command を構築して既存の `command.apply` bridge
  へ送り、成功レスポンスの対象オブジェクトだけを現在の state へマージする。
  Rust の応答に含まれる filter と legacy ミラー以外のフィールドは現在値を
  保持するため、IPC 往復中の別プロパティ編集も失わない。
  add/toggle/move/remove は従来どおり command history に積み、パラメータ更新は
  スライダー入力を履歴へ大量に積まない従来の扱いを維持する。
- filter command はオブジェクト単位の直列キューで適用する。同一 filter の
  `UpdateFilterParams` は queue 先頭で最新リクエストのトークンを確認し、未開始の
  古いリクエストを送らずに捨てる（開始済みの応答は到着順に反映する）。
  応答時に対象の削除・レイヤーロック・対象 filter の別変更も確認し、その場合は
  応答を state や history へ適用しない。別オブジェクトや対象の別プロパティの
  変更は保持したまま、filter 関連フィールドだけをマージする。
- 既存の `SceneData` IPC envelope は変更せず、filter command の往路だけは対象
  object 1件、空の layers、現在のカメラを持つ最小 SceneData を送る。Rust の
  filter apply 分岐は object とその filters 以外を参照しないため、この縮約で
  意味論は変わらず、slider tick ごとの全シーン直列化を避けられる。
- `filterStack.ts` には UI が利用する read-only helper と、legacy 値を扱う
  既存の同期・移行処理を残し、5つの forward mutation 関数とその専用テストを
  削除した。filter の default payload、移動元 index、undo 用の removed / 前値の
  収集は command payload の組み立てに必要なため TS に残るが、stack の結果は
  算出しない。

## Alternatives considered

- TS の mutation 関数を残したまま、undo/redo だけ Rust で同期する案は、往路と
  復路で正本が分かれるため却下した。
- TS が計算した `nextFilters` を `SetObjectField` で丸ごと送る案は、Rust が
  filter 操作の意味論を持たず、legacy 同期の二重実装を温存するため採用しなかった。
- `AddFilter` を filter type だけ受け取る新しい wire command に変更する案は、
  既存の command schema と undo payload を不要に変更するため採用しなかった。
  既存の `ObjectFilter` payload をそのまま command に載せ、Rust は挿入・同期を
  担当する。
- filter parameter 更新を履歴へ積む案は、PropertyPanel のスライダー各入力が
  個別 undo step となり、既存の履歴サイズと操作感を変えるため採用しなかった。
- 全シーンを毎回送る案は、既存 IPC の型を変えずに対象だけの SceneData を渡せる
  ため採用しなかった。filter の apply は layers/camera/他 object に依存しない
  ことを Rust の実装とテストで確認した。

## Constraints / Gotchas

- `filters` 未設定時の TS read helper は毎回ランダム ID を作る。Rust が固定 ID
  だけを割り当てると toggle/remove/move/update の command と不一致になるため、
  対象 command の ID を legacy 移行へ渡す必要がある。
- forward apply は IPC の非同期処理になった。bridge が無いテスト環境では
  state を変更せず、bridge の成功レスポンスだけを state の正本として扱う。
- slider の連続入力では、同一オブジェクトの queue に未開始で溜まった
  `UpdateFilterParams` を開始時の request token で coalesce し、最後の値だけを
  Rust へ送る。一方、既に IPC を開始した request の応答は token が古くても
  到着順に反映するため、ドラッグ中の preview が停止しない。
- `PropertyPanel.tsx` の add/toggle/move/remove/parameter handler は戻り値を
  待たないが、呼び出し直後に store の filter 値を同期的に読む処理は存在しない。
  表示は Zustand の応答後の再レンダーを使い、remove 時の active filter ID の
  ローカル解除だけは UI 選択状態として同期的に行うため、変更していない。
- `UpdateFilterParams` の patch で `null` は「元々存在しなかった key を削除する」
  undo 用の印として Rust が扱う。gradient の任意 `scope` で、inverse 後に
  `scope: null` ではなく key 自体が無いことをテストしている。
- 削除した TS mutation の add/toggle/remove/move/境界 no-op/正規化ケースと、
  64 filter の反復 stress は `rust-core/tests/filter_stack_forward.rs` に移した。
  `heavyEffectsStress.test.ts` の filter 部分には、この移管と TS read-only helper
  の検証範囲をコメントで明記している。
- TypeScript / Rust の型定義は変更していないため、codegen の生成物と
  `schema/rust-core` は更新対象にならない。
- `cargo fmt` は rust-core 全体を整形し得るため、今回の確認では変更対象の
  `command.rs` と新規テストだけに限定して実行する。
