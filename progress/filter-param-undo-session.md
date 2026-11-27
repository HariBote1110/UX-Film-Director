# フィルタパラメータ編集のUndoセッション

## 決定

- フィルタパラメータの編集は開始時の値を保持し、連続する入力値を1つの`UpdateFilterParams` Commandにまとめる。開始はエディタ内のfocus/input/change/keyboard操作、終了はblur・pointerup・rangeのkeyup・Enter/Escapeで扱う。Enter/Escape自体の確定・取消動作は入力要素に委ね、Undo境界追加で値の意味を変えない。
- CommandはRust適用キューが終わった後、実際に適用された値を確認して履歴へ積む。UIの期待値と適用状態が一致しない場合、古い値を履歴化しない。短い連続操作はオブジェクト単位の既存キュー順に独立した境界として記録する。
- Undo/Redo開始時に未確定セッションをflushし、そのflush待ちも履歴pending lockの内側に置く。これによりフォーカス中のCtrl+Zと、flush中に続けて届くUndoが同じCommandを重複適用しない。
- セッションはscene IDを捕捉し、scene切替・読み込み時に破棄する。commit時にもscene ID、対象オブジェクト/フィルタの存在、ロック状態を確認する。削除済み・ロック済み・変更なしのセッションは履歴を作らない。
- アプリUndo/Redoショートカットは`data-filter-param-editor`内の入力だけで有効にする。通常のinput/textareaでは従来どおりブラウザのテキストUndoを維持する。

## 代替案

- 各slider tickを個別Commandにすると履歴が入力頻度に比例して増えるため採用しない。
- 編集開始時と終了時に大きなscene snapshotを保存する方式はCommand基盤の差分履歴とRust適用結果の整合性を損ねるため採用しない。
- blurだけを終了境界にすると、ポインタ操作やフォーカスを保ったキーボード操作、Undoボタン操作の順序に依存する。複数の入力境界を扱い、Undo/Redo側でも未確定編集をflushする。

## 制約・注意点

- `updateObjectFilterParams`を編集セッション外から直接呼ぶ場合、従来どおりこの呼び出し自体は履歴を追加しない。履歴のまとまりはPropertyPanelが開始/終了イベントを伝えることで決まる。
- filter applyは既存のオブジェクト単位キューとrequest tokenを再利用する。対象scene切替時の既存filter apply全般の競合挙動は今回の変更範囲外。
- 実UI検証はElectron/CDPでPropertyPanelのrange入力を操作し、フォーカスを維持したまま値変更、連続Arrowキー操作、Ctrl+Zが反映されることを確認した。ネイティブoverlayは無効化した状態で行った。
