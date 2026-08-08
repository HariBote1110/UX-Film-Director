# PSD合成（composite）のrow-band並列化

## 目的 / 仮説

`display-path-phase-split.md`で、active-only + N=8デコードを適用すると
compositeがdecodeを上回る新たな支配区間になることが判明した
（琴葉茜ver0.7の8-active: decode 192ms vs composite 364ms、compositeがtotalの65%）。
現行のcomposite（`composite_visible_psd_layers_with_filter` /
`composite_layer_source_over` / `source_over_pixel`、
`vm_tuning_research/tools/psd-native-bench/src/psd_fast.rs`に本ノート用に
vendor済み）はレイヤーごとにキャンバスへsource-over合成するflatな1パス実装で、
既存の`parse_psd_fast_instrumented`のレイヤー並列デコードと異なり並列化されて
いない。本ノートはcomposite自体の並列化を検証する。

source-overはピクセル単位で独立だが、同一ピクセルに対して複数レイヤーは
**順序どおり**適用しなければならない。したがって安全な並列化軸は
「キャンバス領域（水平方向のrow band）」であり、「レイヤーをまたいだ並列化」
ではない——各bandが選択済みレイヤー全部をその行範囲内で順序どおり合成する。

### H-1: row-band並列合成（N=8、既存のrayonプールパターンを再利用）は
バイト完全一致のままdecodeと同様にスケールする（帯域幅律速、約2倍）。
すなわち茜ver0.7のcomposite ~360ms → ≤180ms。
**棄却条件**: いずれかのファイルでserial→N=8の高速化率が1.5倍未満。

### H-2: バウンズ最適化について
事前調査（下記「現状のループ構造の記録」）で確定: `composite_layer_source_over`は
「自レイヤーの矩形とcanvasの交差でクリップ」を**キャンバス全体に対しては**
していない（レイヤー自身の`0..width`/`0..height`を毎ピクセルcanvas境界チェック
しながら舐めるだけで、事前に交差範囲を計算していない）。row-band分割を実装する
場合、この「各bandが全レイヤーの全行を舐めて境界チェックで捨てる」を素朴に
やると各bandが毎回レイヤー全体を舐め直すことになり非効率——そのため**row-band
実装そのものの一部として「layerの絶対行範囲とbandの絶対行範囲の交差を事前計算
し、交差する行だけを訪問する」を最初から組み込む**（水平方向のクリップは
従来どおり毎ピクセル境界チェックのまま、layerがcanvas左右端をはみ出すケースが
あるため）。よってH-2は独立した追加最適化ではなく、H-1のrow-band実装に
最初から内包される前提とし、単独の測定ステップとしては行わない
（「行範囲の事前交差計算」は最適化ではなく正しいband実装の必須要件のため）。

## 現状のループ構造の記録（測定前に確定）

`composite_visible_psd_layers_with_filter`（1384行目付近）:
- キャンバスサイズの`Vec<u8>`を1枚確保（ゼロ初期化）。
- `psd.layers`を**順に**走査（1回のシーケンシャルループ、並列化なし）。
  グループはスキップ。各leafについて「自身のvisibleビット＋祖先グループの
  visibleビット全部」（`active_layer_ids`未指定時）でフィルタし、含まれる
  layerだけ`composite_layer_source_over`を呼ぶ。
- レイヤーの適用順序＝`psd.layers`の格納順（pre-order flatten、
  `build_layer_tree`のコメントによればPSDファイル順はbottom-to-top）。

`composite_layer_source_over`（1466行目付近）:
- `for y in 0..layer.height { for x in 0..layer.width { ... } }`という
  **レイヤー自身の矩形全体**を舐めるループ。
- `canvas_y`/`canvas_x`を計算し、`< 0`または`>= canvas_width/height`なら
  `continue`——**毎ピクセル**の境界チェックであり、事前にレイヤー矩形と
  キャンバスの交差範囲を計算してループ範囲を絞る、ということはしていない。
- 全ピクセルが範囲内の場合は無駄がないが、レイヤーがキャンバス端をはみ出す
  ケースでは無駄な反復が生じる（ただし本コーパスは「ほぼフルキャンバスの
  レイヤー」が支配的なため、この無駄自体は小さいと推測——未検証）。
- 各ピクセルで`source_over_pixel`を呼び、alphaが0以下なら即return（早期終了は
  ピクセル単位のみ、行・レイヤー単位のスキップは無い）。

`source_over_pixel`（1503行目付近）:
- 標準的なstraight-alpha source-over。RGB各chを`f32`で正規化して計算し、
  結果を`round().clamp(0.0,255.0) as u8`で書き戻す。副作用なしの純粋関数。

**結論（実装前に確定した事実）**: 現状は「レイヤー順の逐次ループ×レイヤー矩形の
全ピクセル舐め＋毎ピクセル境界チェック」であり、row/bandに沿った事前クリップも
並列化も一切ない。row-band実装では「layer行範囲とband行範囲の事前交差」を
組み込むことで、素朴な移植より無駄な反復を削減する。

## 環境

- ホスト: 開発機（macOS、Apple Silicon、`vm_tuning_research/notes/macos-calibration.md`
  と同一機）
- CPU: Apple M4（physicalcpu = logicalcpu = 10、`sysctl -n hw.physicalcpu hw.logicalcpu`）
- RAM: 32 GiB
- OS: macOS 26.5.2 (Build 25F84)
- rustc: 1.93.0 (254b59607 2026-01-19)、cargo: 1.93.0
- Cargo.toml: `vm_tuning_research/tools/psd-native-bench/Cargo.toml`
  （opt-level=3, lto=fat, codegen-units=1, panic=abort、無改造）
- 対象ファイル（読み取り専用コーパス）:
  - `葵ちゃん.psd`（リポジトリ直下、29.7MB、2700×3700、171L）
  - `/Users/yuki/doc/anybox/琴葉茜立ち絵ver0.7.psd`（48.4MB、5047×7000、57リーフ
    ほぼフルキャンバス）
  - `/Users/yuki/doc/anybox/或窓式琴葉茜立ち絵素材(細).psd`（154.5MB、2970×4520、922L）

## 手順

1. `composite_visible_psd_layers_row_bands`（新規、row-band並列合成）と
   `composite-bench`実行モードを`vm_tuning_research/tools/psd-native-bench/`に追加。
   `threads=None`は単一band（canvas全体）をプール無しで合成、`threads=Some(n)`は
   canvasをn個のrow bandに分割しrayonプール（nスレッド）で並列合成。
   デコードはタイミングループの**外**で1回のみ実行し、ループ内はcomposite呼び出し
   のみを計測。ループ開始前に元の`composite_visible_psd_layers`（vendor済み、
   無改造）を1回実行してチェックサムを基準値として保持し、row-band版との
   バイト完全一致（parity）を検証する。
   ```
   cd vm_tuning_research/tools/psd-native-bench
   cargo build --release
   ./target/release/psd-native-bench composite-bench "<path>" 10 serial
   ./target/release/psd-native-bench composite-bench "<path>" 10 2
   ./target/release/psd-native-bench composite-bench "<path>" 10 4
   ./target/release/psd-native-bench composite-bench "<path>" 10 8
   ```
   各構成10回実行・先頭2回warm-up破棄（n=8有効サンプル）。
2. 3ファイル × 4構成（serial/2/4/8）で実行し、median/min/max/stddevと
   reference（元のserial実装）とのチェックサムparityを記録。

## 結果

3ファイル×4構成（serial/2/4/8）= 12構成すべてで、元の`composite_visible_psd_layers`
（無改造）とのチェックサム・width・height完全一致（`parity vs reference: MATCH`）を確認。

### composite時間（ms、median/min/max/stddev、n=8、先頭2回warm-up破棄）

`composite-bench <path> 10 <threads|serial>`

**葵ちゃん.psd（2700×3700, 171L）**

| 構成 | median | min | max | stddev | 対serial高速化率 |
|---|---:|---:|---:|---:|---:|
| serial | 116.441 | 103.250 | 132.335 | 9.151 | 1.00倍 |
| N=2 | 78.014 | 48.904 | 224.940 | 52.512 | 1.49倍 |
| N=4 | 45.011 | 39.436 | 67.528 | 8.409 | 2.59倍 |
| N=8 | 18.706 | 16.752 | 24.224 | 2.258 | **6.23倍** |

（N=2はiter9に224.940msの外れ値があり стddevが大きい——バックグラウンド負荷らしき
一過性のノイズ。medianは外れ値に頑健なので判定はmedianベースで行う。）

**琴葉茜立ち絵ver0.7.psd（5047×7000, 57リーフほぼフルキャンバス）**

| 構成 | median | min | max | stddev | 対serial高速化率 |
|---|---:|---:|---:|---:|---:|
| serial | 373.685 | 361.289 | 429.117 | 20.393 | 1.00倍 |
| N=2 | 257.193 | 230.282 | 359.783 | 38.984 | 1.45倍 |
| N=4 | 138.718 | 134.310 | 151.234 | 5.396 | 2.69倍 |
| N=8 | 91.547 | 86.886 | 95.527 | 3.308 | **4.08倍** |

**或窓式琴葉茜立ち絵素材(細).psd（2970×4520, 922L）**

| 構成 | median | min | max | stddev | 対serial高速化率 |
|---|---:|---:|---:|---:|---:|
| serial | 39.860 | 38.734 | 43.316 | 1.639 | 1.00倍 |
| N=2 | 24.049 | 23.418 | 26.702 | 0.983 | 1.66倍 |
| N=4 | 19.445 | 18.942 | 21.895 | 0.878 | 2.05倍 |
| N=8 | 14.520 | 12.432 | 18.431 | 1.648 | **2.75倍** |

## 結論

**H-1（row-band並列合成はバイト完全一致のままスケールする）: 採用**。
3ファイルすべてでN=8の対serial高速化率が棄却条件の閾値1.5倍を大幅に上回った
（葵ちゃん6.23倍・茜ver0.7 4.08倍・或窓式2.75倍）。仮説文中の「約2倍」という
点予測は葵ちゃん・茜ver0.7では上振れ（帯域幅律速の単純な2倍モデルより実際は
speedupが大きい）、或窓式ではほぼ的中（2.75倍）——だが棄却条件はあくまで
「1.5倍未満なら棄却」であり、3ファイルとも明確にクリアしたため仮説は採用で
確定する。

スケーリングの傾向はファイル依存で、葵ちゃん・茜ver0.7（レイヤー数が少なく
"ほぼフルキャンバス"のレイヤーが支配的）はN=8まで素直に伸び続けるのに対し、
或窓式（922レイヤー、うち多くは小さい/部分的なレイヤーと推測）はN=4→N=8での
伸びが鈍る（19.445ms→14.520ms、1.34倍止まり）。これは`composite_band`が
band内でも**全選択レイヤーを毎回走査**（行範囲の交差判定だけして早期continue）
する構造のため、レイヤー数が多いファイルほど「交差判定だけの空振り」の
オーバーヘッド比率が上がる、という現状の実装から素直に説明できる——或窓式の
composite自体の絶対時間が小さい（serial 39.86ms）ことも、固定コスト
（rayon ThreadPoolBuilderの毎回構築など）の相対的な重さを増やしている一因と
みられる（未検証、下記「次の一手」）。

H-2は上記のとおり、独立した最適化ステップとしては実施しなかった（row-band
実装に必須の前提として最初から組み込み済み）。

**H-2は棄却も採用もされず、実装当初からrow-band方式に内包**——測定前の記録どおり、
`composite_layer_source_over`は元々レイヤー矩形全体を毎ピクセル境界チェックで
クリップする方式で、per-layer/per-canvasの事前矩形交差は無かった。row-band版
`composite_band`では「layerの絶対行範囲とbandの絶対行範囲の交差」を事前計算する
ことで、band分割そのものを正しく・効率よく成立させている（水平方向は従来どおり
毎ピクセル境界チェックのまま）。

**正しさの検証**: 3ファイル×4構成＝12通りすべてで、元の`composite_visible_psd_layers`
（無改造）が返すチェックサム・width・heightと完全一致（`parity vs reference: MATCH`）。
row-band並列化はレイヤーの適用順序を各ピクセルについて変えていないことを実測で
確認した。

**本実装昇格の推奨構成**: `composite_visible_psd_layers_row_bands`相当の
row-band分割をrayon N=8スレッドプールで適用する構成を推奨する。3ファイルすべてで
N=8が最速であり（N=4を下回ったケースはゼロ）、`parallel-layer-decode-scaling.md` /
`display-path-phase-split.md`で確立済みのデコード側N=8既定と揃えられる
（デコード用プールとcomposite用プールを同じNで運用でき、運用がシンプルになる）。
或窓式のようにレイヤー数が多く絶対時間が小さいファイルでは伸びが鈍るが、
N=8がN=4を下回ることはなく「常にN=8が損はしない」という単純な既定として妥当。

## 次の一手 / 未検証事項

- **或窓式のスケーリング鈍化の原因切り分け**: 「レイヤー数が多いこと」と
  「composite絶対時間が小さくrayon ThreadPoolBuilder構築コストの相対比率が
  上がること」のどちらが主因か未分離。プール構築を`composite-bench`の外
  （複数回呼び出しの外）に出して使い回す変種を測れば切り分けられる
  （本ノートでは既存デコードベンチと同じ「毎回プール構築」を踏襲したため
  未実施）。
- **本実装（`rust-backend/src/psd_fast.rs` / `build_native_psd_source_frame`）への
  昇格**: 本ノートはvendorされた研究コピー上のみでの検証。昇格時は
  `parse_psd_fast_active_chain`のNスレッドプールと`composite_visible_psd_layers_row_bands`
  相当のNスレッドプールを同じNで運用する設計が候補（decode用プールとcomposite用
  プールを1つに統合できるかは要検討——現状は呼び出しごとに別々のプールを構築して
  いるため、統合すればプール構築コストを1回に減らせる可能性がある）。
- **macOS実機とVMの composite serial 時間の非対称な乖離**: `macos-calibration.md`は
  decode系のみを較正しており、composite側はカバーしていなかった。本ノートの
  macOS serial中央値と`display-path-phase-split.md`のVM serial-full composite値を
  参考比較すると、葵ちゃんはMacの方が遅く（116.4ms vs 69.68ms、+67%）、
  茜ver0.7はほぼ同水準（373.7ms vs 353.4ms、+5.8%）、或窓式はMacの方が速い
  （39.86ms vs 47.89ms、-16.8%）——decode系で見られた「Macが一貫して同等以上に
  速い」という傾向とは異なり、ファイル依存で方向がばらつく。ただしVM側は別実行・
  別ビルドでの計測であり本ノートの環境規約（VMとの横比較はしない）の対象外の
  参考値に過ぎない。原因は未調査（本ノートの主目的であるH-1/H-2の判定は同一
  macOS環境内の相対比較のみに依拠しているため、この非対称性はH-1の採否に
  影響しない）。
- N=16など論理コア数（10）を超える構成は測っていない（物理コア数を超える
  過剰分割の効果測定は優先度低）。
