# 立ち絵コーパス34本によるメタデータパリティ・スケーリング検証

## 目的 / 仮説

`rust-backend/src/psd_fast.rs::parse_psd_meta_only`（真のメタデータ専用パース、
`e2e-path-b-metadata-only.md` で導入）は葵ちゃん.psd 1本（8bit・171ノード）でのみ
ag-psd と比較検証済みだった。本番昇格前の残チェックリストは以下4点：

1. 16bit深度の扱い
2. ラジオグループ（レイヤー名 `*` プレフィックス）・強制表示（`!` プレフィックス）の
   初期可視性パリティ
3. レイヤー名エンコーディングのエッジケース（日本語名、Shift-JIS vs Unicode名レコード）
4. より大きい・多様なファイルでのスケーリング

仮説：
- H1: `parse_psd_meta_only` はコーパス全体で ag-psd とノード木（id・名前・座標・
  可視性・親子構造・並び順）が完全一致する。
- H2: メタデータのみパースはファイルサイズが数百倍になってもms一桁以内に収まり、
  線形または劣線形にスケールする。
- H3: 16bit深度PSDがコーパスに含まれていれば、それらでもパリティが成立する
  （含まれていなければ本項目は未検証のまま残る）。

## 環境

- ホスト: macOS (Apple M4), Darwin 25.5.0, arm64
- Node.js: v26.0.0
- ag-psd: 29.0.0（リポジトリルート `node_modules/ag-psd`）
- Rust: rustc 1.93.0（`vm_tuning_research/tools/psd-native-bench`、`--release`、
  `opt-level=3, lto=fat, codegen-units=1, panic=abort`）
- 比較対象コミット: `rust-backend/src/psd_fast.rs` @
  `3a892c860788f9341a8fb932e49c29dd95527f87`（`parse_psd_meta_only` 導入コミット）
- コーパス: `/Users/yuki/doc/anybox/` 配下、ユーザー提供の実立ち絵PSD。
  `find /Users/yuki/doc/anybox -iname '*.psd' -not -path '*/zip/*'` で列挙。
  `zip/` ディレクトリ配下の1本（`Yukigasa_Aoi_ver1.1.psd` の重複コピー）は指示通り除外。
  → **実測33本**（依頼文中の「34本」は zip/ 内の重複コピーも数えた場合の数と推定。
  展開済みかつ非zipの実ファイルは33本で全数）。

### コーパス概要

- サイズ分布: 2.5MB 〜 224.6MB（合計約1.59GB）、中央値付近は10〜40MB帯に集中、
  100MB超が6本
- ノード数分布: 68〜1386ノード（葵ちゃん.psd の171を挟んで広く分布、最大は
  雪傘式 Yukigasa_Akane_ver1.1.psd の1386ノード）
- 深度: 全33本が **8bit**（後述、16bitは0本）
- 由来: 「琴葉茜」「琴葉葵」（VOICEROID）の立ち絵素材を、複数の絵師・スタイル
  （hibino式、kino式、あるか式、おみなえし式、かれい式、こーすけさんたまりあ式、
  たそかれ式、むにさが式、ユメのオワリ式、夏樹テルー式、でぃーえる式、雪傘式）
  から集めたもの — 命名規則・レイヤー構造（グループ深さ、ラジオグループの
  使用有無、日本語レイヤー名の書式）が絵師ごとに異なり、パーサ網羅性の
  検証コーパスとして多様性がある。

## 手順

1. コーパス列挙: `vm_tuning_research/tools/corpus-file-list.txt`
   （`find /Users/yuki/doc/anybox -iname '*.psd' -not -path '*/zip/*' | sort`）
2. ag-psd側ダンプ: `vm_tuning_research/tools/dump-psd-tree.mjs <psd>`
   - `readPsd(buffer, { skipLayerImageData: true, skipCompositeImageData: true,
     skipThumbnail: true })`（ピクセルデータを一切デコードしない、ag-psdの
     メタデータ専用オプション）
   - 1回ウォームアップ（破棄）→ 1回計測、JSON木を出力
     `{file, depth, width, height, nodeCount, parseMs, nodes:[{path, name,
     isGroup, top, left, width, height, visible}]}`
   - ノード順序は pre-order（グループ→子、`psdAgPsdWorker.ts` のUI walkと同じ）
3. Rust側ダンプ: `vm_tuning_research/tools/psd-native-bench/src/psd_fast.rs` を
   現行 `rust-backend/src/psd_fast.rs`（commit `3a892c86`）から更新（コミット
   ハッシュはファイル冒頭コメントに記録）。`uxfd-golden-harness` に依存する
   合成関連関数（`composite_visible_psd_layers*` 等）は本ベンチマークで未使用
   のため引き続き除去。既存の並列デコード計測モード
   （`parse_psd_fast_instrumented`／`PhaseTimings`、experiment 2用の研究コード）
   はベースを差し替えた上で再移植し、`serial`/`pool0`/`<N>`/`*-visible` は
   従来通り動作を維持。
   - 新規追加: `psd-native-bench dump-meta <path>` — `parse_psd_meta_only` を
     1回実行し、ag-psd側と同じ形のJSON木を1行で標準出力に印字（`main.rs`
     `run_dump_meta`）
4. 比較ドライバ: `vm_tuning_research/tools/compare-psd-parity.mjs <file-list>`
   - 33本それぞれについて上記2コマンドを起動し、`nodeCount`・寸法・
     ノードごとの name/isGroup/top/left/width/height/visible を突き合わせ
   - 片側がクラッシュ/エラーでもハーネスは継続し、当該ファイルは
     「エラー記録」として結果に残す（`ok:false` + `error` メッセージ）
   - 生の結果: `vm_tuning_research/notes/tachie-corpus-parity-results.json`
     （ファイルごとの全フィールドと `mismatches` 配列）

## 結果

### パリティ

- **33/33ファイルで完全一致**（ノード数・寸法・全ノードのフィールドが
  1件残らず一致）。ミスマッチ0件、クラッシュ0件（ag-psd側・Rust側とも）。
- 深度: 33本すべて `depth: 8`（`ag-psd` の `bitsPerChannel` 実測値）。
  **16bit PSDはコーパス中に0本** — H3は「検証不能」（棄却でも採用でもない）。
  このチェックリスト項目は依然未検証のまま残る。
  - 追加の発見: そもそも `parse_psd_meta_only` の戻り値 `PsdFastResult` には
    深度フィールドが存在しない（`_depth` として読み捨てている、
    `rust-backend/src/psd_fast.rs:925`）。今回のダンプ比較は深度を
    比較対象に含められておらず、たとえ16bit PSDが手元にあっても
    現状のAPIでは「メタデータとして深度を運んでいるか」自体を検証できない。
    16bit検証を再開する際は、まず `PsdFastResult` に `depth` フィールドを
    追加する必要がある。
- ラジオグループ（`*` プレフィックス）・強制表示（`!` プレフィックス）:
  レイヤー名文字列そのものの完全一致で間接的に検証済み。両マーカーとも
  `src/remoteDeck/remoteDeckSelectionContext.ts` の `stripNameMarker`
  （`/^[*!]+/`）が示す通り「名前文字列のプレフィックス」という設計であり、
  Rust側・ag-psd側専用の特別処理は存在しない（`psd_fast.rs` に `radio`/`'*'`
  等のハンドリングはgrepでもヒットせず）。したがって名前の完全一致が
  そのままラジオグループ・強制表示の初期状態パリティを保証する。
  具体例（`たそかれ式/葵ちゃん.psd`）:
  - `"!髪"` （強制表示グループ、`visible: true`）— 両パーサ一致
  - `"*髪 ショート"` （ラジオ項目、`visible: false` = 非選択状態）— 両パーサ一致
  - `"!髪　色"` （リーフ、全角スペース込みで一致）— 両パーサ一致
- レイヤー名エンコーディング: 33本全ファイル・全ノードで日本語名
  （ひらがな・カタカナ・漢字・全角スペース・記号）が完全一致。`luni`
  （Unicode名）ブロックを優先し、無ければ生のPascal文字列をバイト単位で
  `char` 化する実装（`psd_fast.rs:281` `unicode_name.unwrap_or(raw_name)`）と、
  ag-psd の `luni` ハンドラ上書きロジックが、実運用コーパスの範囲では
  完全に一致する結果になった。Shift-JISのみでUnicode名レコードを欠く
  ファイルは今回のコーパスには見つからなかった（全ファイルで文字化けの
  形跡なし＝実質全ファイルに `luni` ブロックがある、または生バイトが
  ASCII互換範囲に収まっている）。
- 欠落/余剰ノード（アジャストメントレイヤー・マスク・テキストレイヤー等）:
  0件。両パーサとも「グループ／セクション区切り以外は全部リーフとして
  1ノード」という同一の分類基準のため、レイヤー種別に関わらず木構造は
  一致した。

### タイミング / スケール

全33本で計測（ag-psd: warmup1回+計測1回、rust: 単発実行）。ファイルサイズ降順、
代表数本+分布要約：

| ファイル | サイズ | ノード数 | ag-psd (ms) | rust meta-only (ms) | 倍率 |
|---|---:|---:|---:|---:|---:|
| 琴葉茜立ち絵v01.09.psd | 224.6 MB | 1092 | 9.29 | 0.487 | 19.1× |
| 琴葉葵立ち絵v01.09.psd | 223.0 MB | 1117 | 12.35 | 0.573 | 21.6× |
| Yukigasa_Aoi_ver1.1.psd | 138.2 MB | 1377 | 4.27 | 0.550 | 7.8× |
| Yukigasa_Akane_ver1.1.psd | 135.3 MB | 1386 | 4.34 | 0.741 | 5.9× |
| 琴葉姉妹立ち絵ver2.6　茜さん.psd | 123.6 MB | 980 | 5.83 | 0.428 | 13.6× |
| 琴葉姉妹立ち絵ver2.6　葵さん.psd | 123.1 MB | 982 | 6.80 | 0.446 | 15.2× |
| 葵ちゃん.psd（従来の単発検証対象） | 29.7 MB | 171 | 1.24 | 0.087 | 14.3× |
| ことのは(たち).psd | 6.4 MB | 81 | 2.17 | 0.052 | 41.8× |
| ことのはあおい(すわ).psd（最小） | 2.5 MB | 101 | 0.39 | 0.071 | 5.5× |

- 中央値（33本）: ag-psd **1.507 ms**、rust meta-only **0.163 ms**
- 最大値（33本）: ag-psd **12.346 ms**（琴葉葵立ち絵v01.09.psd, 223MB）、
  rust meta-only **0.741 ms**（Yukigasa_Akane_ver1.1.psd, 135MB）
- **50ms超過ファイルは0件**（rust meta-onlyの最大値0.741msは閾値の1/67）
- 非線形スケーリングの兆候なし: ファイルサイズが約90倍（2.5MB→224.6MB）
  になってもrust meta-onlyは約7倍（0.071ms→0.487ms、最大値ベースでも
  0.052ms→0.741msで約14倍）にしか増えておらず、むしろサイズよりノード数
  との相関が強い（チャンネルデータ長は読み捨てるがそのバイト数分だけ
  カーソルを進める＝O(層のバイト長合計)のはずだが、実測ではその項が
  数百MB規模でも支配的にならないほど軽い）。ag-psd側も同様に、サイズでなく
  概ねノード数と相関しており（1092ノード9.29ms・1386ノード4.34ms、1117ノード
  12.35ms・981ノード平均6ms前後）、こちらは1ノードあたりのオブジェクト
  生成コストが支配的とみられる。

## 結論

昇格チェックリスト4項目のうち：

- **確定（採用）**: レイヤー名エンコーディング（日本語・Unicode/`luni`優先ロジック）、
  ラジオグループ`*`・強制表示`!`の初期可視性（名前文字列パリティに帰着）、
  木構造（グループ/リーフ分類・親子・並び順・座標・可視性）— 33本・
  全ノードで完全一致、ミスマッチ0件。H1採用。
- **確定（採用）**: スケーリング — 2.5MB〜224.6MB・68〜1386ノードの範囲で
  50ms閾値を大幅に下回り（最大0.741ms）、非線形悪化の兆候なし。H2採用。
- **未確定のまま残存**: 16bit深度 — コーパス中に16bit PSDが1本も存在せず
  検証不能。加えて `parse_psd_meta_only` のAPI自体が深度を出力に含めて
  おらず（`_depth` を読み捨てるだけ）、16bit検証を行うには先に
  `PsdFastResult` へ `depth` フィールドを足す実装変更が要る。H3は
  「未検証」のまま（棄却でも採用でもない）。

総括: **4項目中3項目（名前エンコーディング・ラジオ/強制表示可視性・
スケーリング）は本番昇格の妨げにならないことが実コーパスで確認できた。
残る16bit深度は依然オープンで、次の一手が必要。**

## 次の一手 / 未検証事項

1. 16bit PSDの入手・作成 — 手元コーパスに実例が無いため、次のいずれかが必要:
   - 8bit立ち絵を16bitへコンバートしたテスト用ファイルを作る
     （実運用データではなくなる点に注意）
   - 16bitで書き出された実PSDを別途探す
2. `PsdFastResult` に `depth`（`bitsPerChannel` 相当）フィールドを追加する
   実装変更（`/development` スキルでTDD、`parse_psd_fast`/`parse_psd_meta_only`
   両方に影響する可能性があるため影響範囲の洗い出しが先）
3. 16bitチャンネルデータのバイトレイアウト（2byte/pixel、エンディアン）が
   `parse_layer_record`／チャンネル長スキップのロジックに影響しないか
   （メタデータ専用パスは実際のピクセルバイトを読まないので理論上は
   影響しないはずだが、ChannelInfo.data_len の解釈が深度に依存しないか
   要確認）
4. PSB（バージョン2、大容量ドキュメント）は本コーパスに0本
   （ヘッダの `version` フィールドを全33本について実測し確認済み: 全て
   `version=1`＝通常PSD。最大235MBクラスも含め全ファイルがPSB化されて
   いない）。`parse_psd_meta_only`/`parse_psd_fast` はPSB分岐（8byteレングス
   読み取り）を実装済みだが、実データでは今回未検証のまま — 将来PSB実ファイル
   が手に入った場合の検証対象として残しておく。
