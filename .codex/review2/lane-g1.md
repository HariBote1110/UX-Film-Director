**タイトル: 候補抽出は src 必須だが、読み込みは filePath 優先で不整合**  
ファイル: `audioMixdown.ts:112-117, 28-45`  
根拠: `candidates` は `src` が非空文字列でないと除外する。一方 `readMediaBytes` は `filePath` があれば IPC 読込を優先し、失敗しても `src` にフォールバックしない。`filePath` のみのクリップが無音化し、`filePath` が無効で `src` が有効でも読めない。  
深刻度: 高

**タイトル: startTime が負の場合、offset 補正がなく再生位置がずれる**  
ファイル: `audioMixdown.ts:151, 163-175`  
根拠: `source.start(Math.max(0, media.startTime), offset, clipDuration)` は開始時刻だけ 0 に丸め、`startTime < 0` の分を `offset` に加算していない。本来スキップすべき先頭区間を再生し、クリップ末尾も余分に鳴る/ずれる。`totalDuration` / `clipDuration` も負の `startTime` をそのまま使う。  
深刻度: 中（負の `startTime` が入力され得る場合）

**タイトル: readMediaBytes が fetch/IPC の例外を捕捉しない**  
ファイル: `audioMixdown.ts:28-45`  
根拠: `response.ok` 以外は null にするが、`fetch` の reject や `ipcRenderer.invoke` の reject はそのまま伝播する。呼び出し側で個別 catch していない場合、1 件の読込失敗で書き出し全体が失敗する。  
深刻度: 中

**タイトル: buildExportAudioBuffer で配置末尾が 0 以下だと length 0/負になり得る**  
ファイル: `audioMixdown.ts:216`（および 160-161 相当）  
根拠: Buffer は `Math.min(exportDuration, Math.max(...配置末尾))`。全 decoded item が offset 超過や duration 0 で配置末尾 0 なら `totalDuration = 0`、負なら負。`Math.ceil(totalDuration * sampleRate)` を `createOfflineAudioContext` に渡すため、length 0/負で例外・書き出し失敗し得る。既知の非対称の影響。  
深刻度: 中

**タイトル: buildExportAudioBuffer の AudioContext 後始末が await なし・catch なし**  
ファイル: `audioMixdown.ts:211`  
根拠: MixWav は `await decodeContext.close()` を try/catch 付き finally で実行するが、Buffer は `decodeContext.close();` のみ。close 完了を待たず、失敗時は unhandled rejection になり得る。  
深刻度: 低

**タイトル: gain 設定が NaN を弾けない**  
ファイル: `audioMixdown.ts:115, 172`  
根拠: 候補抽出は `(volume ?? 1) <= 0` のみなので `volume = NaN` を通す。その後 `Math.min(4, NaN) → NaN` を `gain.value` に設定すると例外/不正値になり得る。上限 4 は仕様次第だが、複数トラック加算時はクリップしやすい。  
深刻度: 低

**その他**  
- `decodeAudioData(bytes.slice(0))` はコピーを渡しており、detach 対策として妥当。所見なし。  
- `encodeWavBuffer` は本体が抜粋外のため、16bit 変換・インターリーブの正確性は検証不能。
