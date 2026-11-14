## 結論

- レガシー→filters は **upsert + マージ**。削除・全置換ではない。`null`/未設定は no-op なので、既存 filter は消えず、後段 `materialiseSyncedObject` でレガシー値が復活し得る。
- 既存 `params` はマージされ、**レガシー側にないキーは残る**。逆に同名キーはレガシー値で上書きされる。`params` にレガシーオブジェクト全体を渡すため、`enabled` や内部キーも混入し得る。
- filters→レガシーは filters が正。複数同 type や余分な `params` は、単一のレガシーフィールドへ潰れる/戻る。**双方向は非対称**。
- 往復ドリフトの主因は、①`null` 削除が filter に反映されない、②複数同 type の最後のみ更新、③`params` の残留マージ、④`normaliseFilter` による丸め・欠落・正規化失敗。
- `upsertLegacyFilter` は **最後尾の同 type 1つだけ**を更新する。複数同 type が共存すると、古いフィルタが残り、解決順や `resolveOrderedFilters`/`materialiseSyncedObject` の実装次第で実効値と編集値がずれる。

## 対応表（レガシーフィールド → filter type）

| レガシーフィールド | filter type | 条件 | 根拠行 | 備考 |
|---|---|---|---|---|
| `colorCorrection` | `color_correction` | truthy のときだけ upsert | `src/utils/filterStack.ts:933` | `params: object.colorCorrection` 全体を渡す |
| `customClipping` | `clipping` | truthy のときだけ upsert | `src/utils/filterStack.ts:936` | 同様にレガシーオブジェクト全体を params に渡すと推定 |
| `vibration` | `vibration` | truthy のときだけ upsert | `src/utils/filterStack.ts:939` | 同上 |
| `shadow` | `shadow` | truthy のときだけ upsert | `src/utils/filterStack.ts:942` | 同上 |
| `gradient` | `gradient` | `object.type === 'shape'` かつ truthy のときだけ upsert | `src/utils/filterStack.ts:945-948` | shape 以外ではレガシー→filters 同期しない |

## 所見

### 1. 未設定・null のレガシー値は filters から削除されず、materialise で復活し得る
- ファイル:行: `src/utils/filterStack.ts:895, 933-948, 951`
- 根拠: `upsertLegacyFilter` は `if (!payload) return filters;` で no-op。`syncFiltersFromLegacyValues` は `object.colorCorrection ? ... : null` のように falsy を null にして渡す。その後 `materialiseSyncedObject({ ...object, filters: nextFilters }, nextFilters)` が filters を正にレガシーを再構成する。したがって `colorCorrection = null` にしても既存 `color_correction` filter が残っていれば、レガシー値が復活する。
- 深刻度: 高

### 2. params にレガシーオブジェクト全体を渡すため enabled/内部キーが混入する
- ファイル:行: `src/utils/filterStack.ts:896-901, 933-946`
- 根拠: `params = isRecord(payload.params) ? payload.params : {}` とし、`{ ...nextFilters[i].params, ...params }` でマージしている。呼び出し側は `params: object.colorCorrection` のようにレガシーオブジェクト全体を渡すため、`enabled` や内部用フィールドも `filter.params` に入り得る。`normaliseFilter` が whitelist で落とすなら緩和されるが、落とさない場合は `materialiseSyncedObject` で再びレガシーへ戻る。
- 深刻度: 中（`normaliseFilter` が未知キーを落とす実装なら低）

### 3. 既存 filter params がマージで残留する
- ファイル:行: `src/utils/filterStack.ts:901, 918, 926`
- 根拠: 既存更新時は `{ ...nextFilters[i].params, ...params }`、新規追加時も `{ ...appended.params, ...params }`。レガシー側に存在しない `params` キーは削除されない。古い filter 値が残り、materialise によってレガシーへ戻る。
- 深刻度: 中

### 4. 複数同 type のうち最後の1つだけ更新する
- ファイル:行: `src/utils/filterStack.ts:899-914`
- 根拠: `for (let i = nextFilters.length - 1; i >= 0; i -= 1)` で末尾から探し、最初に見つけた同 type を更新して即 return する。先頭・中間の同 type フィルタは更新されず残る。`resolveOrderedFilters` が先頭優先・合成・最後優先のどれでも、編集対象と実効値が一致しないケースがある。
- 深刻度: 高

### 5. normaliseFilter 失敗・丸め・クランプで値が欠落/ドリフトする
- ファイル:行: `src/utils/filterStack.ts:909-913, 926-927, 886, 951`
- 根拠: upsert は `normaliseFilter(nextCandidate)` を通す。戻り値が null の場合、既存フィルタは置換されず、新規フィルタも追加されない。また `normaliseFilter`/`materialiseSyncedObject` が丸め・クランプを行う場合、レガシー→filters→レガシーで値が変わる。詳細未提示のため、どのフィールドが丸められるかは実装依存。
- 深刻度: 中

### 6. gradient の shape 条件がレガシー→filters の片方向にしかない
- ファイル:行: `src/utils/filterStack.ts:945-948, 886`
- 根拠: `syncFiltersFromLegacyValues` は `object.type === 'shape'` のときだけ gradient を upsert する。一方 `syncLegacyEffectsWithFilters` は type チェックなしで filters を解決して materialise する。非 shape で gradient filter が存在する場合、filters 正で `object.gradient` が再構成され得るが、レガシー gradient からは同期されない。
- 深刻度: 中

### 7. enabled の二重管理と優先順位不明
- ファイル:行: `src/utils/filterStack.ts:901, 933, 886`
- 根拠: filter の `enabled` は `payload.enabled` に設定されるが、`params` にもレガシー側の `enabled` が入る。materialise が `filter.enabled` を使うか、`params.enabled` を spread して上書きするかで結果が変わる。filters 側で `enabled` を編集した場合、古い `params.enabled` と競合し得る。
- 深刻度: 中

## 往復ドリフトの具体例

1. **null 削除が効かない**  
   初期: `colorCorrection = { enabled: true, brightness: 1.2 }`、`filters` に `color_correction` が存在。  
   `colorCorrection = null` に編集 → `upsertLegacyFilter` は no-op（`:895`）→ `materialiseSyncedObject` が filters 正で `colorCorrection` を再生成（`:951`）。結果、`null` が `{ enabled: true, brightness: 1.2 }` に戻る。

2. **複数同 type の最後のみ更新**  
   `filters = [cc(brightness:1.0), cc(brightness:2.0)]`、legacy は `brightness:1.5`。  
   `upsertLegacyFilter` は末尾の `cc` だけを `brightness:1.5` に更新（`:899-914`）。先頭の `brightness:1.0` は残る。解決ロジックが先頭優先/合成なら legacy と実効値がずれる。

3. **余分/古い params の残留**  
   `filters` の `color_correction.params = { contrast:1.1, brightness:1.0 }`、legacy は `{ enabled:true, brightness:1.2 }`。  
   upsert で `contrast:1.1` は残り、`brightness` だけ 1.2 に上書き（`:901`）。materialise で legacy に `contrast:1.1` が戻る。

4. **丸めによるドリフト（推定）**  
   legacy `brightness:1.2345` → `normaliseFilter` が小数2桁丸めを行う場合、filter は `1.23` → materialise で legacy も `1.23`。`1.2345 → 1.23` のドリフト。`normaliseFilter` の詳細未提示のため推定。
