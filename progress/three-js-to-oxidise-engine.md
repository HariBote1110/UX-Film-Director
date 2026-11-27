# Three.js置き換え: oxidise-engine採用

## 決定

3Dステージ(ThreeStageViewport)のThree.js (WebGL)を、CubicTransimのrenderer_wgpuから汎用部分を抽出した独立リポジトリ「oxidise-engine」(~/GitHub/oxidise-engine, wgpu 24.0.5, wasm32+native両ターゲット)へ置き換える。2026-08-21決定。

根拠1: 事前調査で、UX FDのThree.js守備範囲は「3Dステージモード限定のPSDワールド配置ビルボード表示 + PerspectiveCamera + OrbitControls/TransformControls」だけと判明。8種のシーンオブジェクト・2D合成・動画exportはnative overlay / WebGPU presenter側で完結。カスタムシェーダー・ポストプロセス・レンダーターゲットは不使用。

根拠2: wgpu24_nv12_researchのスパイクで、wgpu 24.0.5でもNV12 IOSurfaceインポート経路が動作することを確認済み。native-wgpu-rendererの将来のwgpu統一を阻む要因なし。

根拠3: CubicTransim側のrenderer_wgpuは外部時間駆動(内部クロックなし、render()は現在のバッファ状態を描くだけ)で、タイムラインスクラブ・書き出しと相性が良い。

マイルストーン計画:
- M0: エンジンrepo立ち上げ(汎用部分抽出+render-to-texture/readbackを一級API化)
- M1: テクスチャドビルボード材質(RGBA8, sRGB, straight alpha, DataTexture相当の意味論)
- M2: UX FD統合(syncBillboardsの命令的API境界は維持、orbitカメラ+translateギズモ+レイキャスト自前実装、export/スナップショットをreadback経由に変更)
- M3: CubicTransim側の載せ替え

## 検討した代替案

Three.js継続: 依存は残るが動作実績あり。WGSL資産と二重管理が続くため棄却。

汎用3Dエンジンの新規開発: 過剰。UX FDのシーンkindは有限列挙でエフェクト単位のnative-wgpu-renderer拡張が基本路線のため棄却。

エンジンをUX FD内にコピー / CubicTransimへのpath依存: 2repo間の実装分岐リスク・他マシンでのビルド壊れリスクで棄却。独立リポジトリ+git依存を採用。

## 制約・注意点

現状の3Dステージexportはcanvas.toDataURL / legacy canvas capture依存(Viewport.tsxのgetExportCanvasがeditorMode==='3d_stage'時にThreeのcanvasを返す)。WebGPU canvasでは同じ手が使えない可能性が高く、M2でエンジン側readback APIに置き換える。

Rust側exportパイプライン(residentSceneExportFrameSource等)は3Dステージを認識しておらず、3DステージモードでPSDビルボード用途に限定。置き換えでこの制約は変えない。

CubicTransimにはテクスチャ/マテリアルシステムが存在しない(頂点色のみ)ため、ビルボード材質はM1で新規実装。

TransformControls/OrbitControls相当(減衰付きカメラ、ギズモ、レイキャスト)はThree.js examplesが肩代わりしていた分の自前実装が必要で、M2の主工数。

threeStageViewportPsdDataTextureBoundary.test.ts / psdBillboardDataTexture.test.tsが現行境界(CanvasTexture不使用、fetchPsdCompositeRgba直接経路)を固定しており、M2ではこれらを新エンジン境界の等価テストに置き換える。

## M2c: UX Film Director統合（実装済み、2026-08-21）

### 実装内容

- `npm run wasm:build:oxidise`(package.json)を追加。`../oxidise-engine`
  (0.1.0-Alpha-3b、sibling checkout前提)の`crates/oxidise-wasm`を
  `wasm-pack build --target web`し、`rust-core-wasm`と同じ規約で
  `src/wasm/oxidise/`(oxidise_wasm.js/.wasm/.d.ts、コミット対象)へ出力する。
  `wasm-pack`の`--out-dir`はクレートディレクトリ基準の相対パスとして解決される
  (CWD基準ではない)点に注意——`../../../UX-Film-Director/src/wasm/oxidise`
  という3階層上げの指定になっているのはそのため。
- `src/components/OxidiseStageViewport.tsx`を新設し、
  `ThreeStageViewport.tsx`と同一の命令的インターフェース
  (`getCanvas`/`syncBillboards`)に加え、export/snapshot用の非同期
  `getSnapshotRgba()`を追加した。three.js/OrbitControls/TransformControls
  への依存を持たず、`src/utils/stage3d/`配下の純粋関数群
  (`orbitCamera`/`cameraRay`/`hitTest`/`translateGizmo`/`stageMeshes`/
  `billboardSyncPlan`)とoxidise-wasmの`StageRenderer`のみで構成する。
- グリッド床面(旧`THREE.GridHelper(40,40)`相当)と移動ギズモの軸矢印は、
  `StageRenderer#uploadMeshChunk`が三角形リストしか受け付けない
  (GL_LINES相当のプリミティブが無い)ため、`stageMeshes.ts`で
  「薄いquad」「四角錐」の三角形へ変換して生成する
  (`buildGridFloorMesh`/`buildAxisArrowMesh`/`buildTranslateGizmoMesh`/
  `translateGeometry`)。
- ギズモ軸ピッキングは、`cameraRay.ts`に追加した`worldToScreen`
  (`screenPointToRay`の逆変換)でギズモ各軸の始点・終点をスクリーン座標へ
  射影し、クリック点とのスクリーン距離(px)で判定する簡易実装。
  three.jsの`TransformControls`のような実メッシュへのレイキャストではない。
- ビルボードのsource-key再利用判定(GPU再アップロード回避の意味論を
  呼び出し側から観測できるようにする分類)は`billboardSyncPlan.ts`の
  `computeBillboardSyncPlan`(純粋関数)に切り出した。ただし
  `StageRenderer#syncBillboard`は毎回rgbaを引数に取るAPIのため、
  呼び出し自体は`kind`に関わらず全エントリに対して毎フレーム行う
  (実際のテクスチャ再アップロード回避はStageRenderer内部の
  `TextureRegistry`のsource-key一致判定に一任している)。
- **新規挙動(旧ThreeStageViewportには無かったもの)**:
  キャンバス上でのビルボードクリック選択を追加した
  (`screenPointToRay`→`hitTestBillboards`→`useStore.getState().selectObject`)。
  旧実装は3Dキャンバス上でのクリック選択を持たず、選択はタイムライン/
  リストパネル側の`selectedIds`/`selectedId`のみから`selectedBillboardId`
  propへ渡っていた。hitTest.ts(`hitVolumeDepth`込み)が用意されていた
  意図を汲んでこの挙動を追加したが、意図的な仕様追加であり要件定義書には
  明記されていない点は申し送る。
- Viewport.tsxの3Dステージexport/snapshot経路を、
  `canvas.toDataURL()`直読みから`StageRenderer#readbackRgba()`→
  `ImageData`→2Dキャンバス(`stage3dSnapshotCanvasRef`)経由へ変更した
  (WebGPU canvasの`toDataURL`が空になりうる問題への対処)。

### 既知の制約・申し送り

- **ブラウザ実機での動作確認は一切していない**(oxidise-wasm側のM2aと同じ
  スコープ外事項)。`npm test`/`tsc --noEmit`/`npx vite build`が通ることのみ
  確認済み。カメラ操作(rotate/pan/zoom)・ギズモドラッグ・PSDビルボード表示・
  export/snapshotの実際の見た目は未検証。
- `getExportCanvas()`は同期APIのままだが、`readbackRgba()`は非同期。
  fire-and-forgetで更新し続ける2Dキャンバス(`stage3dSnapshotCanvasRef`)の
  「直近の読み戻し結果」を返す設計にしたため、動画export時の連番フレーム
  キャプチャでは理論上1フレーム遅延しうる。手動スナップショット
  (`isSnapshotRequested`)経路は`await refreshStage3dSnapshotCanvas()`を
  挟んでいるため、その時点の最新フレームを取得できるはず(未検証)。
  正しい同期を取るには`renderProjectExportFrame`側のフレームループ自体を
  async-canvas対応へ拡張する必要があり、影響範囲が大きいため今回は
  見送った。
- ギズモ軸ピッキングはスクリーン距離ベースの簡易判定であり、
  three.jsの`TransformControls`が行う実メッシュへのレイキャストとは
  厳密には一致しない(視認上ほぼ同じ挙動になるはずだが未検証)。
- `wasm-pack`が生成する`.gitignore`(`*`)は`src/wasm/rust-core`と同様に
  削除してコミット対象にした。

### 追記: 3Dステージカメラのドラッグ結果が無関係な再レンダーで巻き戻るバグ(0.1.1-Beta-493b)

**症状**: `OxidiseStageViewport`でオービットドラッグ中はカメラが正しく動くが、
(a)ツールバー操作等の無関係な再レンダーでドラッグ前の角度に戻る、
(b) 2D↔3Dステージのモード切替(コンポーネントのアンマウント/再マウントを
伴う)でも直前の角度が失われ、旧`ThreeStageViewport`(store の
`stageCamera3D`が生存期間を通じて角度を保持していた)と挙動が異なる。

**根本原因は2つ複合していた**:
1. `syncBillboards`(`useImperativeHandle`経由でViewport.tsxから毎フレーム
   呼ばれる)が、`stageCamera3D`(React state/ドラッグガード付き)とは別経路で
   `applyCartesianCamera(stageCamera.position, stageCamera.target)`を
   **無条件に**呼んでいた。ドラッグ中かどうかのガード(`userAdjustingRef`)も、
   「既に適用/永続化済みの値と同じなら無視する」という等価判定も存在せず、
   store の`stageCamera3D`(＝Viewport.tsx側の`layers`/`isExporting`等の
   変化で発火するeffectがstoreから読む値)が読まれるたびにローカルの
   軌道モデルを強制的に上書きしていた。
2. 軌道カメラは`enableDamping: true`で実装されており(`orbitCamera.ts`)、
   `rotate()`/`pan()`はその場でstateへ反映されず`velocity`に積まれ、
   `update()`が複数フレームかけて指数減衰させながら反映する。ポインタ
   アップ時の`endCameraAdjust()`はその瞬間の`eye/target`を`setStageCamera3D`
   していたが、ダンピングの積み残しがまだ収束していなければそれは
   「最終」姿勢ではなく、後続の(1)の強制上書きと組み合わさることで
   見た目のジャンプ/巻き戻りとして観測された。

**採用した永続化ポリシー**:
- `src/utils/stage3d/stageCameraSyncPolicy.ts`に
  `shouldApplyIncomingStageCamera(lastApplied, incoming, isUserAdjusting, epsilon)`
  を純関数として切り出した。ドラッグ中は常に適用しない、`incoming`が
  直近の適用/永続化値と(epsilon以内で)実質同一ならno-op、それ以外
  (プロジェクトロード・シーン切替などの外部要因)は適用する、という
  3値の判定に単純化した。`syncBillboards`とstageCamera3D-driven effectの
  両方の呼び出し口をこの関数経由に統一した。
- `orbitCamera.ts`に`isOrbitCameraSettled(model, epsilon)`を追加し、
  ダンピングの`velocity`が実質ゼロに収束したかを判定できるようにした。
  ドラッグ終了(`pointerup`/`wheel`)時点でいったん暫定値を即時
  `setStageCamera3D`しつつ`settlePendingRef`を立て、以後のrAFループ
  (`tick()`)で収束を検知した時点の`eye/target`を「確定値」として
  改めて`setStageCamera3D`する2段階の書き込みにした。即時書き込みは
  体感の即応性のため、確定書き込みはダンピング減衰後の真の最終姿勢を
  storeへ確実に反映するための安全網である。
