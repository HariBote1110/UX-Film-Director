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
| lane-j2.md | GLM 5.3（敵対的） | updateObject 記録・合体・バッチ・カメラ履歴 | 7 | 高3・中3・低1 |
| lane-p1.md | DeepSeek V4.1 Flash 1017 | PropertyPanel フィルタ編集セッション（抜粋） | 7 | 中3・低4 |
| lane-k2.md | DeepSeek V4.1 Flash 1017（追跡、当初担当 Kimi は全滅のため振替） | レガシー⇔filters 同期の追跡 | 7 | 高2・中5 |
| lane-v1.md | DeepSeek V4.1 Flash 1017 | OxidiseStageViewport 同期・描画ループ（抜粋） | 6 | 高2・中4 |
| 合計 | | | **71** | |

※ lane-f2 は深刻度表記の延べ数と項目数が一致しないため項目数ベース。
※ 抜粋ベースの単発監査のため、抜粋の圧縮に起因する偽候補を含み得る（例: lane-f1 の「absDeltaY 未定義」は実ファイルでは単体分岐側に宣言があり、抜粋で落ちた行が原因の可能性が高い）。検証時に最初に落とす候補として扱うこと。

## 未完（プロバイダ混雑で生成できず）

- 当初 Kimi 担当だった同期追跡（lane-k）は Kimi が計4回全滅したため未完だったが、DeepSeek の復活を受けて lane-k2 として振替実施し完了。Viewport 走査も lane-v1 として完了。これで当初計画の全レーンが走査済みとなった。
- lane-j.md は OpenCode 版 GLM の調査進捗メモ（所見なし、読了範囲の記録のみ）。

## 事故と復旧の記録

- lane-j1: GLM 出力の保存ファイルがリダイレクト事故で消失。受信済み出力テキストから復元して収録（lane-j1.md 末尾に注記）。
- lane-j2: 一度成功した出力（6,621バイト）を、後続の再試行が同じファイルへのリダイレクトで上書き消失。窓内に別ファイル名で再実行し、7件の所見として再取得した（lane-j2.md）。教訓: 再試行ごとに別ファイル名を使うこと。
- ベンチ B3 は当初 GLM 系が 429 で未回答だったが、遅れて完了したバックグラウンド試行で glm-5.3 / glm-5.3-flash ともに正答を取得（回答原文は bench2/answers/ に収録）。B3 の未回答は gemma-4-26b のみ。

## 並列実行フェーズ（05:23 指示以降）

- ユーザー指示で並列度を引き上げ（アカウント枠は全体共有、FD 監査30・ベンチ20が配分目安）。ベンチ欠測14件を8並列、監査追加＋残欠測5件を5並列で実行し、19件中17件が一発で成功（従来の逐次実行より成功率・速度とも大幅に改善）。失敗は glmflash/gemma26 の一部と Kimi のみで、並列度よりもモデル別エンドポイントの安定度が支配的だった。

## プロバイダ状況の記録

- 02:56–03:37: OpenCode 2並行で sqlite lock / 503 / rate_limit 971 / Bad Gateway が連続。
- その後も 429/503 が断続。成功は単発・小プロンプト・数分の間隔を空けた場合に限られた。同時刻帯に他バッチ（サンプル工場・別ベンチ175件）が同一アカウント枠を消費していたことが主因とみられる。
