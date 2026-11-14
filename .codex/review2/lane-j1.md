以下、攻撃的レビュー結果。`invertCommand.ts` は行番号なしで提示されたため、行は `historySlice.ts` を主とし、invert 側は case 名で特定する。

---

### J1-1. `restoreLayerTracks` の invert が恒等写像 → レイヤートラック操作の undo が「やり直し」になる

- ファイル:行: `invertCommand.ts` case `'restoreLayerTracks': return { ...command }` / `historySlice.ts:96`
- 再現手順:
  1. レイヤートラックを swap / insert / delete する。履歴には元コマンド（`previousLayers` / `previousObjects` を保持）が積まれる。
  2. undo すると `invertCommand` が `restoreLayerTracks { layers: previousLayers, objects: previousObjects }` を生成し、apply される。ここまでは正しい。
  3. しかしこの時点で `futureCommands` には **undo に使った invert 済みコマンドではなく、元コマンド** が入る（`historySlice.ts:104`、`futureCommands: [command, ...]`）。redo は元コマンドをそのまま再 apply するので redo は成立する。
  4. 問題は **swap/insert/delete を経由せず、直接 `restoreLayerTracks` が履歴に積まれた場合**（将来の呼び出し側追加、または batch 内に含まれた場合）。その undo は `{ ...command }` を再 apply するだけ、つまり「復元先へもう一度復元」となり、**undo が順方向操作の再実行になる**。`previousLayers` を保持していないため、復元前の状態はどこにも残っておらず復旧不能。
  5. さらに batch 経由: `batch` の invert は各要素を再帰 invert するため、batch 内の `restoreLayerTracks` は反転されずに残り、batch undo の一部が順方向に実行される。
- 深刻度: 高（現行の呼び出し経路では swap/insert/delete の invert 先としてのみ生成されるなら顕在化しないが、型レベルで「invert できないコマンドが invert 可能として扱われる」設計欠陥。Rust 側 `invert` が同仕様なら両側で壊れる）

### J1-2. undo 冒頭の filter param flush が、対象コマンドをすり替え得る／flush 自身が履歴を積むと pending ガードと競合

- ファイル:行: `historySlice.ts:84-93`
- 再現手順:
  1. フィルタパラメータ編集セッションが未 flush の状態で undo キーを押す。
  2. `isCommandHistoryPending = true` を立てた後、`flushObjectFilterParamEdits()` を await する。この flush は内部でコマンドを確定させる処理であり、**履歴 push を伴う可能性がある**（セッション確定は通常コマンド化される）。
  3. flush 完了後に `get()` で読み直した `pastCommands` の末尾は、ユーザーが undo したいコマンドではなく **flush が積んだコマンド** になっている可能性がある。その場合 undo は「直前のフィルタ編集」を取り消し、ユーザーの意図したコマンドはその下に残る。
  4. 逆に flush が非同期に bridge を叩く実装だと、`isCommandHistoryPending` は undo 側だけのフラグで flush 側の apply と **bridge 上で直列化されない**。2つの `applyCommand` が並行し、後着の結果で store が上書きされる（J1-3 と複合）。
- 根拠: 88 行で state を読み直しているのは flush の変更を取り込むためだが、末尾コマンドの同一性チェック（flush 前後で末尾が同じか）は存在しない。
- 深刻度: 高

### J1-3. undo 中の通常編集を止める仕組みが無く、楽観コマンドと組み合わさって状態が巻き戻る

- ファイル:行: `historySlice.ts:93-105`、`buildActiveSceneData` 全体
- 再現手順:
  1. undo を実行し、`bridge.applyCommand` の応答待ち（数十〜数百 ms）になる。
  2. その間にユーザーがオブジェクトをドラッグ等で編集する。TS 側の objects は即時更新される（`isCommandHistoryPending` は undo/redo の再入しか防がない）。
  3. undo の応答が返ると `applySceneResult(response.result.scene)` で **objects / layers / camera / duration が丸ごと置き換わる**。応答の scene は手順1時点のスナップショットから計算されているため、手順2の編集は跡形もなく消える。
  4. さらに手順2の編集が履歴 push を伴っていた場合、そのコマンドは `pastCommands` に残るが、対応するオブジェクト状態は巻き戻っている。後日そのコマンドを undo すると、存在しない前提状態に対する invert が apply され、楽観コマンド（previous 不一致を検証しない）ゆえに **誤った値がそのまま書き戻される**。
- 深刻度: 中（実害は「編集中に undo する」という操作タイミング依存だが、置き換え範囲がシーン全体で大きい）

### J1-4. `buildActiveSceneData` の objects が浅いコピーで、bridge へ参照を渡している

- ファイル:行: `historySlice.ts:45`（`objects: state.objects` をキャストしてそのまま格納。layers と camera は `{ ... }` でコピーしているのと非対称）
- 根拠: objects 配列および各要素オブジェクトが store の実体と同一参照のまま bridge に渡る。bridge 側（wasm / IPC シリアライズ前の JS 処理）が引数を破壊的に扱う、あるいは非同期処理中に呼び出し側が同じオブジェクトを変更すると、送出内容と store が互相に影響する。少なくとも layers/camera とコピー方針が揃っておらず、将来 bridge 側に前処理が入った瞬間に壊れる。
- 深刻度: 中

### J1-5. undo/redo のたびに選択が消え、duration が grow 側にしか戻らない非対称

- ファイル:行: `historySlice.ts:68-70`
- 根拠:
  1. `applySceneResult` は `selectedId: null, selectedIds: []` を常時返す。undo で「オブジェクト追加」を取り消すのは妥当でも、**プロパティ変更の undo でも選択が全解除**される。選択中オブジェクトへの連続操作（編集→undo→再編集）の UX が壊れる。
  2. `duration: growDurationToFit(scene.duration, objects)` は、Rust 側が返した duration を「オブジェクト末尾に合わせて伸ばす」ことはあっても、undo でオブジェクトが短くなった場合に **scene.duration 側の値までしか縮まない**。Rust 側 duration が編集前の大きな値を保持していると、undo しても duration が戻らない（grow-only の非対称）。
- 深刻度: 中

### J1-6. `addObject` の invert が `object.id` の存在を型で保証していない

- ファイル:行: `invertCommand.ts` case `'addObject'`: `objectId: (command.object as { id: string }).id`
- 再現手順: 生成型の不整合や将来のオブジェクト表現変更で `command.object` に `id` が無い／別名の場合、`objectId: undefined` の `removeObject` が生成され、bridge 側で「対象なし」として success を返すと、**undo が成功扱いで履歴だけ前進し、オブジェクトは残り続ける**。TS 側の実行時検証は無い。
- 深刻度: 中

### J1-7. `moveFilter` の invert は index の swap のみで、同一視性が崩れた後の redo が暴走する

- ファイル:行: `invertCommand.ts` case `'moveFilter'`
- 根拠: invert は `fromIndex`/`toIndex` を入れ替えるだけ。undo 適用時点でフィルタ列が楽観的に変わっている（J1-3 の編集挿入や `removeFilter` の undo 不整合）と、index が指す先が別のフィルタになり、**無関係なフィルタを移動させる**。filterId を保持しているのに apply 側が index 優先なら検証が効かない（TS 側からは apply の検証有無が不明なため、楽観前提では無防備）。
- 深刻度: 低

### J1-8. redo は「現在のシーンが undo 直後の状態であること」を一切検証しない

- ファイル:行: `historySlice.ts:111-124`（提示範囲では対称構造）
- 再現手順:
  1. コマンド A を undo し、`futureCommands = [A]` を得る。
  2. **履歴を経由しない編集**（`pushHistoryCommand` を通らない set 系。例: シーン読込、外部同期、ドラッグ中の中間状態確定など）が objects を変える。`futureCommands` はクリアされない。
  3. redo すると A が現在の状態へそのまま apply される。A の `next` が絶対値（setObjectField 等）ならまだしも、`addObject`（index 指定）や `restoreLayerTracks` 系だと、**現在の状態と無関係な挿入・復元が実行される**。
- 根拠: `pushHistoryCommand` だけが `futureCommands: []` を保証し、それ以外の状態変更経路が redo スタックを無効化する仕組みは提示範囲に無い。
- 深刻度: 中

### J1-9. `swapLayerTracks` 等の invert が `previousObjects` のスナップショット粒度に依存する

- ファイル:行: `invertCommand.ts` case `'swapLayerTracks' | 'insertLayerTrack' | 'deleteLayerTrack'`
- 根拠: invert 先は「レイヤーとオブジェクト全体の復元」。コマンド生成時に `previousObjects` へ **全オブジェクトの完全なスナップショット** を積んでいる前提だが、もし生成側が「影響レイヤーのオブジェクトだけ」を積んでいると、undo で他のレイヤーのオブジェクトが **スナップショット時点へ巻き戻る／消える**。TS 側 invert は内容を検証できないため、生成側の粒度ミスがそのままデータ消失になる。生成側コードが未提示のため断定はしないが、攻撃面として最大級。
- 深刻度: 中

### J1-10. `toggleFilterEnabled` の invert が自己反転である前提の崩壊ケース

- ファイル:行: `invertCommand.ts` case `'toggleFilterEnabled': return { ...command }`
- 根拠: トグルは2回適用で戻るため自己 invert は正しい。ただし undo 対象フィルタがその後 **削除→再追加（別 id で同種）** されていると、filterId 不一致で apply が失敗するか、id 再利用時に **別フィルタの enabled を反転** させる。失敗時は `historySlice.ts:97-99` で履歴が前進しないため安全側だが、id 再利用時は成功扱いで誤爆する。
- 深刻度: 低

### J1-11. invert の `default` が throw するが、呼び出し側は try 範囲内でも履歴不整合を残す

- ファイル:行: `invertCommand.ts` default 節 / `historySlice.ts:86-108`
- 再現手順: 生成型に新しい kind が追加され TS 側 invert の更新が漏れた状態で undo する。`invertCommand(command)` が throw し、`finally` で pending は解除されるが、例外は呼び出し側（キーボードハンドラ等）へ伝播する。履歴自体は無事だが、**そのコマンドが履歴末尾に居座り続け、以降の undo が全て同じ例外で詰まる**（回復手段は履歴クリアのみ）。早期に「invert 不能コマンド」を検出して履歴から隔離する経路が無い。
- 深刻度: 低

### J1-12. `pushHistoryCommand` に上限が無く、`restoreLayerTracks` 系の巨大スナップショットでメモリが単調増加

- ファイル:行: `historySlice.ts:78-81`
- 根拠: `pastCommands` は無制限に追加される。通常コマンドは軽いが、レイヤートラック操作は `previousLayers` + `previousObjects`（全オブジェクト複製）を持つため、1回あたりシーン全体サイズ。レイヤー操作を繰り返すだけで履歴メモリがシーンサイズ×回数で増え続ける。セッションが長い編集では現実的な枯渇要因。
- 深刻度: 低

---

## 総評

最も危険なのは **J1-1（invert が恒等な kind の存在）** と **J1-2/J1-3（非同期境界での末尾すり替えと状態巻き戻し）**。設計上の根本原因は2つ:

1. invert が「全 kind で真の逆元である」ことが型でもテストでも強制されていない（`restoreLayerTracks` と `toggleFilterEnabled` が同じ「そのまま返す」で、前者は誤り・後者は正しい、という判別がレビュー依存）。
2. undo/redo が「履歴末尾の同一性」と「apply 中の状態不変」を暗黙の前提にしているのに、その前提を守るロックも検証も無い（pending フラグは再入防止のみ）。

（注: 本ファイルは Logfare GLM 5.3 の単発リクエスト出力。元出力ファイルがリダイレクト事故で消失したため、受信した出力テキストから復元した。）
