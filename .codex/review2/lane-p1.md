結論: 二重 begin/commit は ref ガードで概ね防止されている。自動選択 effect との直接競合も cleanup の実行順序により限定的。主なリスクは、① commit が begin 時の対象 ID を固定していない点、② cleanup effect が commit 関数の同一性に依存する点、③ 非同期 commit の Promise を捨てている点。

1. commit が begin 時の対象 ID を保持していない  
ファイル:行: PropertyPanel.tsx:474-484  
根拠: begin では `selectedObject.id` / `activeFilter.id` を渡すが、ref には `sessionId` のみ保存。commit では現在の `selectedObject.id` / `activeFilter.id` を読む。activeFilter/selectedObject が切り替わった直後、cleanup effect が走る前に commit イベントが発火すると、古い sessionId と新しい filter/object ID の組み合わせで `commitObjectFilterParamsEdit` が呼ばれ得る。begin 時の ID を sessionId と一緒に ref に保持すべき。  
深刻度: 中

2. cleanup effect が `commitObjectFilterParamsEdit` の同一性に依存  
ファイル:行: PropertyPanel.tsx:491-497  
根拠: 依存配列に `commitObjectFilterParamsEdit` が含まれる。この関数が再生成される実装だと、パラメータ変更などで再レンダーするたびに cleanup が走り、進行中セッションが即 commit される。1回のドラッグが複数履歴に分割される、または途中 commit 後の変更が未確定になる。ストアアクションが stable なら問題は小さい。  
深刻度: 中（関数同一性が不安定な場合）

3. commit の Promise を void で捨てている  
ファイル:行: PropertyPanel.tsx:483, 495  
根拠: `commitObjectFilterParamsEdit` は非同期 Promise。`void` で捨てているため reject 時のハンドリング・リトライがなく、unhandled rejection の可能性がある。また 482/494 行で先に ref を null にするため、失敗時はセッションを再試行できず、ストア側にセッションが残る可能性がある。  
深刻度: 中

4. 非同期 commit 中の begin を許容  
ファイル:行: PropertyPanel.tsx:482-483  
根拠: commit の解決前に `filterParamEditSessionId.current` を null にする。commit 完了前に新しい pointerdown/focus が来ると、新しい sessionId で begin できる。ストアが同一 object/filter のセッション直列化を前提とするなら、commit と begin の順序が競合し得る。  
深刻度: 低（ストア実装依存）

5. activeFilterId 自動選択 effect とセッションの競合  
ファイル:行: PropertyPanel.tsx:499-507  
根拠: activeFilterId が無効になった場合は、先に cleanup effect が旧 activeFilter の変更を検知して commit し、その後 auto-select effect が新しい filter を設定する。通常は競合しない。ただし `filters = selectedObject?.filters ?? []` で undefined 時に毎回新しい配列になると effect が毎レンダー走る。実害は小さい。  
深刻度: 低

6. cleanup のクロージャ値の時点  
ファイル:行: PropertyPanel.tsx:491-497  
根拠: cleanup は effect 作成時の `selectedObject` / `activeFilter` を捕捉する。deps に ID が入っており、ID が変われば cleanup が走る。commit は ID しか使わないため、オブジェクト参照が古くても実害は小さい。ただし commit 関数が ID 以外の状態に依存するなら別。  
深刻度: 低（問題なし寄り）

7. 二重 begin/commit  
ファイル:行: PropertyPanel.tsx:475, 481  
根拠: ref の null チェックにより、同一セッション中の begin/commit は原則無視される。所見4の非同期 commit 中を除けば二重実行は防げている。  
深刻度: 低（ほぼ問題なし）
