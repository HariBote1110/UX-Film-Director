# 検証環境（借用 VM）

## 目的

GPU 無し・Linux の実機相当環境で、CPU-bound な自前実装（PSD 解析、映像まわりの
フォールバック経路等）のベースライン計測とチューニング検証を行う。
開発機（macOS / Apple Silicon）とは ISA もスケジューラも異なるため、
**数値の比較は必ずこの VM 内で完結させる**（macOS との横比較はしない）。

## 環境

- 接続: `ssh haribote@100.72.111.20`（鍵認証設定済み、BatchMode で疎通確認済み）
- ホスト名: `haribotextx`
- CPU: 13th Gen Intel Core i5-13400F（VM へは 12 vCPU 割当、Thread(s)/core=1）
- RAM: 15 GiB（計測開始時 available 14 GiB）
- GPU: 無し（F 型番 = iGPU 非搭載。フォールバックレンダリング検証に適する）
- OS: Ubuntu 26.04 LTS（kernel 7.0.0-29-generic）
- 全コア 100% 張り付きのベンチ実行は所有者了承済み（2026-08-08 ユーザー確認）

## 計測上の注意（仮説ではなく運用規約）

- VM のため他ゲスト/ホスト側の負荷でノイズが乗りうる。**warm-up を捨てて median と
  ばらつきを報告**する（perf_research/notes/measurement-protocol.md の規約に準拠）。
- P コア/E コア混在 CPU だが VM 割当のためピン留めは保証できない。run 間ばらつきが
  大きい場合は `taskset` 固定を試し、その効果自体を記録する。
- ツールチェーン（2026-08-08 確認、apt 系配布のシステムワイド導入）:
  - rustc / cargo 1.93.1
  - node v22.22.1 / npm あり
  - ffmpeg **無し**（映像系検証で必要になったら導入し、ここへ追記する）
- ディスク: `/` 32G 中 空き 9.5G。cargo target ディレクトリが肥大しやすいので
  クローンは shallow、ビルド対象クレートを絞る。

## 次の一手 / 未検証事項

- チューニング対象の棚卸し（PSD 解析の現行経路と過去の失敗記録の調査中）
- VM への toolchain 導入とリポジトリ同期方法の決定（git clone か rsync か）
- ベースライン計測スクリプトの設計
