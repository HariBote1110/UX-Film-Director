# PixiJS 排除計画（Pixi Removal Plan）

作成日: 2026-07-03
状態: **計画（未着手）**
背景: 「Rust オーバーレイと Pixi が混在した preview 構造がスパゲッティ化している」というユーザー判断により、PixiJS（`pixi.js ^8.1.0`）を段階的に排除し、preview 描画を Rust（native overlay + wgpu）へ一本化する。

## 1. 現状の依存マップ（2026-07-03 調査）

### 直接 import は4ファイルのみ（テスト除く）

| ファイル | 規模 | 役割 |
|---|---|---|
| `src/utils/pixiRenderHelper.ts` | 986行 | シーン→Pixi 描画変換（`updatePixiContent`）、エフェクト適用、リップシンク、振動、グループグラデーション |
| `src/components/Viewport.tsx` | 2211行（PIXI参照28箇所） | `PIXI.Application` 生成・破棄、preview 2D キャンバス |
| `src/hooks/usePixiInteraction.ts` | 262行 | キャンバス上の選択・ドラッグ等ポインタ操作 |
| `src/utils/pixiUtils.ts` | 229行 | 補助ユーティリティ |

### すでに Pixi から独立しているもの

- **エクスポート経路**: `useProjectExportBoundary.test.ts` が「export コードに PIXI import・`pixiAppRef` を含まない」ことを契約テストで強制済み。
- **動画の decode / present**: rust-backend（ffmpeg + VideoToolbox）→ POSIX shm ring → native overlay（wgpu）で完結。
- **シーンモデル**: rust-core `schema.rs` の `MediaKind` / `ClipKind` が Video / Image / SolidColour / Psd / Generated 系35種を網羅。
- **幾何・デコード要求**: presenter 診断上 `rust-wasm` がソース。

### 移行機構（cutover）はすでに敷設済み

`pixiRenderHelper` は描画時に `shouldSkipPixi{SolidColour,Image,Psd,GeneratedEffect}ForSharedRenderer` を判定し、オブジェクト ID が shared renderer 側の所有集合に入っていれば Pixi 描画をスキップする設計になっている（`sharedRenderer*Ownership.ts` / `pixiVideoCutoverStack.ts` ほか）。つまり**メディア種別ごとの段階的所有権移転のレールは既にある**。

### Pixi にしか無いもの（= 移行の本体）

1. **テキスト描画**: rust-core schema に Text 系の Kind が存在せず、native-wgpu-renderer にグリフ描画機構が無い。最大のギャップ。
2. **インタラクション**: `usePixiInteraction` のヒットテスト・ドラッグは Pixi のシーングラフに依存。
3. **一部エフェクトのランタイム適用**: `applyObjectEffects` / `getLipSyncViseme` / `getVibrationOffset` / `applyGroupGradientEffect` は Pixi コンテナ前提（幾何計算部分は純粋関数として分離可能。`visionTrackingKeyframes.ts` が `getGroupTransforms` を既に純関数として利用中）。
4. **fallback presenter**: 動画アップロード不能時等の `pixi-passthrough` 経路と、`parallelCompare`（Pixi/Rust 並行比較）計画モード。

## 2. フェーズ計画

### Phase 0 — 所有権の実態監査（小、半日）
- parallelCompare / 診断 DOM を使い、実運用で「どの種別が実際に Rust 所有へ cutover しているか」を計測する。
- 種別ごとの parity 差分（描画結果の一致度）を readback 比較で棚卸しし、Phase 1 の対象順を決める。
- 成果物: 種別×所有状態×parity の一覧表（本ファイルに追記）。

### Phase 1 — 非テキスト静的コンテンツの完全 cutover（中）
- SolidColour / Image / Psd / Generated 系35種の所有権を常時 Rust 側に倒し、`shouldSkipPixi*` が全 ID で真になる状態にする。
- parity が不足する Generated 種別は native-wgpu-renderer 側を修正（Red: readback parity テスト → Green）。
- 完了条件: 動画なし・テキストなしのシーンで Pixi キャンバスが完全に空。

### Phase 2 — テキストの Rust 描画（大、最難関）
- 選択肢:
  - **(a) glyphon / cosmic-text を native-wgpu-renderer に統合**（本命。字詰め・折返し・絵文字は cosmic-text が担う）
  - (b) 暫定: HTML Canvas でラスタライズ→Image ソースとして shm 経由アップロード（品質は出るが編集中の再ラスタライズ負荷と2系統残留が難点。恒久解にしない）
- schema へ `Text` Kind（フォント・サイズ・字間・縁取り・影）を追加し、rustSceneSnapshot に serialise を実装。
- 完了条件: テキストオブジェクトの preview / export の描画が一致し、Pixi の `PIXI.Text` 経路が不要になる。

### Phase 3 — インタラクションの脱 Pixi（中）
- ヒットテスト: rust-wasm の幾何（既にシーン変形を持つ）へ「座標→オブジェクト ID」問合せを追加し、`usePixiInteraction` を DOM イベント + wasm ヒットテストへ置換。
- 選択ハンドル・バウンディングボックスは HTML/SVG オーバーレイで描画（Pixi 不要、Bug E の child NSWindow 化とも整合：UI は常に HTML 層）。

### Phase 4 — presenter 一本化と PIXI.Application 撤去（中）
- `pixi-passthrough` fallback と `parallelCompare` を撤去し、native overlay を唯一の presenter にする。
- `Viewport.tsx` から `PIXI.Application` / キャンバス生成を削除。`pixiRenderHelper.ts` の純粋関数（`getGroupTransforms` 等）は `sceneTransforms.ts` 等へ移設。
- 注意: overlay が唯一のレンダラになるため、**Bug E（overlay が HTML UI より上）の解決（child NSWindow 化）が実質的な前提条件**になる。Phase 4 着手前に Bug E 計画（`Native_Overlay_Bug_E_Plan.md`）の実施判断が必要。

### Phase 5 — 依存削除と再侵入防止（小）
- `package.json` から `pixi.js` を削除、`pixiUtils.ts` / `usePixiInteraction.ts` / `pixiRenderHelper.ts` / `pixi*Cutover.ts` を削除。
- `useProjectExportBoundary.test.ts` と同型の boundary テストを**アプリ全体**に拡大（「src 配下に `from 'pixi.js'` が存在しない」）して再導入を恒久的に防ぐ。

## 3. リスクと判断メモ

- **テキストが最大の壁**: Generated 35種は既にレールがあるが、テキストはスキーマから無い。Phase 2 の工数が全体を支配する。
- **順序の根拠**: fallback（Phase 4）を最後にするのは、移行中の描画不具合時に Pixi へ即時退避できる安全網を保つため。
- **Bug E との連動**: Phase 4 で Pixi を消すと「HTML UI の下に描く汎用キャンバス」が無くなるため、overlay の z-order 問題は放置できなくなる。Bug E の child NSWindow 化と Phase 4 は同一マイルストーンとして扱うのが安全。
- 各 Phase は従来どおり TDD（Red→Green→docs）＋ Sonnet サブエージェント委譲＋親セッション実機検証の運用で進める。
