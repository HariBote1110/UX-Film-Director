# `presentScene` の200〜350msは初回再生1回だけのコールドコスト

## 目的 / 仮説

[engage-delay-breakdown.md](engage-delay-breakdown.md) で、native playback clock の engage 遅延の
実体が `presentScene`（native overlay の addon 呼び出し）216〜348ms だと判明した。
ただし従来の E2E は再生を1回しか行わないため `isFirstStartSinceLaunch` が常に true で、
次の2つを区別できなかった。

- **H8**: 起動後1回だけ payしているコールドコスト（サーフェス生成・パイプライン構築・
  最初の drawable 取得など）。
- **H9**: 再生開始のたびに payしているコスト。**この場合、ユーザーは再生ボタンを押すたびに
  200ms超のレンダラークロック区間を踏む**ことになり、深刻度が大きく変わる。

## 環境

- ホスト: Apple M4 / macOS 26.5.2、ブランチ `feature-proxy`、版 `0.1.1-Beta-488a`
- backend: **release** ビルド（`UXFD_RUST_BACKEND_BIN` で明示）
- 重量編集E2E。1回目の計測窓（3秒）の**後に**、300ms 待って1秒の2回目再生を追加
  （1回目の窓と rAF サンプリングには手を入れていない）

## 手順

```bash
UXFD_RUST_BACKEND_BIN=$PWD/rust-backend/target/release/uxfd-rust-backend \
UXFD_REALISTIC_HEAVY_EDIT_TIMEOUT_MS=540000 \
npm run test:realistic-heavy-edit:e2e
# exercise.secondPlaybackStart と sceneRpcTrace.samples の startPlayback 2件を読む
```

## 結果

| run | 1回目 `presentSceneMs` | **2回目 `presentSceneMs`** | 1回目 total | 2回目 total |
|---|---|---|---|---|
| second-1 | 347.7 | **35.3** | 448.6 | 36.1 |
| second-2 | 217.9 | **33.2** | — | — |
| second-3 | 241.4 | **4.6** | — | — |

`isFirstStartSinceLaunch` は1回目 true / 2回目 false と正しく切り替わっている。
3 run とも総合 PASS、書き出しも成功。

## 結論

**H8 採択、H9 棄却。** `presentScene` の 218〜348ms は**起動後の初回再生1回だけ**の
コールドコストであり、2回目以降は **4.6〜35.3ms**（約1/10〜1/50）で済む。

### 最適化方針への影響（重要）

**addon 内部を速くする必要は無い。** 定常状態は既に十分速い。
残っている価値は「初回のコストをユーザーの再生操作より前に払っておく」ことにある。
プロジェクト読み込み時などに **pre-warm** すれば、初回再生の遅延は体感から消える。
addon の内部最適化より遥かに安全かつ安価な打ち手である。

### 弱いハード（M1 / A18 Pro）への含意

初回コストは 1回限りなので、**遅い機械でも「再生のたびに遅い」形にはならない**。
ただし初回コストの絶対値が遅い機械でどれだけ膨らむかは未計測であり、
pre-warm の価値はむしろ遅い機械で高くなる可能性が高い。

## 次の一手 / 未検証事項

- **pre-warm の実装と効果測定。** どの時点で warm すべきか（プロジェクト読み込み完了時 /
  最初の scene resident 確定時）と、warm 自体が他の初期化と競合しないかは未検討。
- 初回コストの中身（サーフェス生成 / パイプライン構築 / 最初の drawable 待ち）の
  分解は未実施。pre-warm で隠せるなら分解する必要は無いかもしれない。
- CPU スロットリング下・遅い機械での初回コストの絶対値は未計測。

## 併せて確認した: 終了時 SEGV の修正

`resync_child_window_geometry` の dangling pointer 参照による終了時クラッシュ
（`progress/native-overlay-quit-segv-fix.md`）の修正後、**3 run 連続で新しい
`Electron-*.ips` が生成されなかった**（最新のレポートは修正前の 11:02 のまま）。

**ただしこれは確証ではない。** 修正前の発生率は本日12 run 以上で5件、約4割である。
3 run 連続クリーンが偶然起きる確率は約0.2であり、無視できるほど小さくない。
確信を持つにはより多くの run が要る。
