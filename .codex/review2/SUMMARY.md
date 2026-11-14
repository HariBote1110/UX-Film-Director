# UX-Film-Director 全域マルチモデル監査（第2回）サマリ

実施: 2026-11-15 02:54–06:50 JST（Logfare リミット緩和窓 08:27 まで）
対象: feat/preview-export-compare HEAD (9b1f9a44) の worktree で読み取り専用監査。コード変更なし。
方式: 当初 OpenCode のエージェント実行を試みたが、プロバイダ混雑（503 / rate_limit 971 / Bad Gateway）で全レーンが途中死したため、Logfare API への単発リクエスト（1ファイル相当の抜粋＋観点指定）に切替えて実施した。

## 成果（findings 候補・未検証）

検証はメイン側の担当。本リストは候補の提示まで。

| レーン | 担当 | 対象 | 件数 | 内訳 |
|---|---|---|---|---|
| lane-j1.md | GLM 5.3（敵対的） | historySlice.ts + invertCommand.ts（undo/redo 適用経路） | 12 | 高2・中6・低4 |
| lane-f1.md | DeepSeek V4.1 Flash 1017 | TimelineItem.tsx ドラッグ処理 | 10 | 高3・中4・低3 |
| lane-f2.md | DeepSeek V4.1 Flash 1017 | useSceneInteraction.ts | 10 | 高2・中7・低2※ |
| lane-g1.md | DeepSeek V4.1 Flash 1017 | audioMixdown.ts（書き出し音声） | 6 | 高1・中3・低2 |
| lane-h1.md | DeepSeek V4.1 Flash 1017 | stage3d/cameraRay.ts | 6 | 高2・中4・低0 |
| 合計 | | | **44** | |

※ lane-f2 は深刻度表記の延べ数と項目数が一致しないため項目数ベース。
※ 抜粋ベースの単発監査のため、抜粋の圧縮に起因する偽候補を含み得る（例: lane-f1 の「absDeltaY 未定義」は実ファイルでは単体分岐側に宣言があり、抜粋で落ちた行が原因の可能性が高い）。検証時に最初に落とす候補として扱うこと。

## 未完（プロバイダ混雑で生成できず）

- lane-j2（GLM、updateObject 記録・合体・バッチ・カメラ履歴の敵対レビュー）: 4回試行し timeout / 503 / 429×2 で全滅。GLM 5.3 は窓を通じて最も詰まった。
- lane-k（Kimi、レガシー⇔filters 同期の追跡）: 初回は単発チャットでツール使用を幻覚し実質空応答、再試行2回は 429。
- PropertyPanel / Viewport 等の大型コンポーネント走査: OpenCode 実行が 503 で死亡した後は単発方式の対象外とした（ファイルが大きすぎ抜粋の情報損失が大きい）。
- lane-j.md は OpenCode 版 GLM の調査進捗メモ（所見なし、読了範囲の記録のみ）。

## プロバイダ状況の記録

- 02:56–03:37: OpenCode 2並行で sqlite lock / 503 / rate_limit 971 / Bad Gateway が連続。
- その後も 429/503 が断続。成功は単発・小プロンプト・数分の間隔を空けた場合に限られた。同時刻帯に他バッチ（サンプル工場・別ベンチ175件）が同一アカウント枠を消費していたことが主因とみられる。
