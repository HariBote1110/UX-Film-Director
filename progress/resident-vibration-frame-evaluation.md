# Resident Vibrationのフレーム評価契約

日付: 2026-10-16

## 採用した契約

- enabledなVibration filterはresident Project内のtransport用`Effect::Vibration { strength, speed }`として順序を保って保持する。編集graphの外部schemaには新しいオブジェクトfieldを追加しない。
- 振動をclip開始時の固定translationへ焼き込まない。Rust `evaluate_frame`が`frame_index / fps`の絶対scene秒を使い、各enabled vibrationの順序indexに`index * 1.618`を加えた位相で毎frame計算する。0強度filterもTS directと同じくindexを消費し、速度0・負の強度も既存式のまま扱う。
- 複数段は`getVibrationOffset`と同じ式を加算する。純計算を`rust-core/src/vibration.rs::evaluate_vibration_offset`へまとめ、位置query側でも再利用できる公開関数とする。
- group controlを合成した後、Wipeのeffect indexを確定した後、Textの装飾plane原点補正を適用する前に振動translationを加算する。振動effectは評価済みsnapshotから除去し、未評価のeffectがnative WGPU/backend IPC/reference rendererへ届いた場合は明示的にエラーとする。
- 既存のTS direct snapshotは実時間の`getVibrationOffset`を参照経路として維持する。旧legacy `BaseObject.vibration`もresident builderでenabled-filter相当へ変換する。

## 回帰検証

- `vibration-resident.json`で9時点（clip開始前・開始境界・終了境界・group切替前中後など）を比較し、従来447 frameを含むTS/Rust評価parity 456 frameを固定する。
- fixtureは複数段、disabled、0強度、0速度、負強度、ColorCorrection、Blur、Wipe、Text stroke/shadow、回転/scaleを含み、Wipe `effect_index`がVibrationのtransportを数えないことを確認する。
- 純計算helperの順序/絶対秒/phase/0強度テスト、resident builderのeffect保持テスト、rendererの未評価effect拒否テストを追加した。
- 実行結果: codegen drift check成功、Vibration focused Vitest 30/30、rust-core全suite成功（位置query 4件・builder parity 9件・TS/Rust evaluation parityを含む）。

## 残る境界

- P4の未量子化位置queryがVibrationをどの時刻で含めるかは、位置queryの契約として別途統合する。公開helperはその計算共有を可能にするが、評価済みframe transportをqueryへ暗黙適用しない。
- Resident Vibrationはプロジェクト内の評価transportであり、評価前Projectを直接rendererへ渡す呼出側は拒否される。通常の`evaluate_frame`経路を経由する必要がある。
