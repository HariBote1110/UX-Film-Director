# 音声・映像の同期ズレ仮説（fps不一致説の検討と代替仮説）

## 目的 / 仮説

ユーザー報告:「おそらくfpsの不一致によって音と映像がズレる」。

### fps不一致説（コードリーディングでは支持されず — 実測未実施）

- frameIndex→デコードフレームの変換は `native-overlay/src/lib.rs:668-769` で
  `source_rate`（有理数、プロジェクトfps）から `target_seconds` を毎回再導出する
  時刻/PTSベース。`fps=` リサンプルフィルタ（`lib.rs:1056/1060`）で素材を
  プロジェクトfpsのケイデンスに変換しており、素材の 29.97/23.976 等の分数レートが
  この計算に入る余地がない。フレーム単位の誤差蓄積経路は見つからなかった。
- そもそも素材fpsはスキーマに存在しない（`rust-core/src/schema.rs:376-397` の Clip /
  MediaReference にfpsフィールドなし。`src/utils/mediaMetadata.ts` は
  avg_frame_rate を解析していない）。

### 代替仮説 H3: 独立自走クロック間の無補正ドリフト／エンゲージ時のエポックずれ

- 音声は `HTMLAudioElement`（`src/components/Viewport.tsx:2184-2214`）で、
  アプリの `currentTime` 状態に対して閾値スナップ（再生中 0.2s、停止中 0.05s）。
- 映像はネイティブクロック（`electron/rustScenePlaybackController.ts:263-323`）が
  自前の `setTimeout` ＋壁時計で自走。renderer への時刻反映は UI state IPC
  （200ms スロットル）経由のみ。
- 両クロックを相互補正する仕組みは存在しない。特に native の start() には
  約370msのエンゲージ遅延（コード内コメント）があり、音声再生開始との間に
  **最大 ~0.2s（スナップ閾値未満）の恒常オフセット**が残り得る。
- 0.2s 閾値超過時は audio.currentTime を強制スナップ → 断続的な「音の飛び」として
  知覚される可能性。

## 検証手段（未実施）

再生中に3クロックの差分を定期ログ:
1. native `currentTimeSeconds`（UI state IPC の値）
2. renderer `currentTime`（store）
3. 各 `audio.currentTime` − audioLocalTime
エンゲージ前後・負荷有無でオフセットの発生と推移を観測する。

## 結論

fps不一致説はコード構造上は支持されない（実測での最終確定は未了）。
H3（独立クロック＋エンゲージエポックずれ）が有力。未検証。

## 次の一手

上記3クロック差分プローブを video-load E2E に載せて実測。
