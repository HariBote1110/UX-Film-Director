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
