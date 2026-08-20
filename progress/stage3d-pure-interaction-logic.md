# M2b: 3DステージのTS純粋インタラクションロジック（Three.js置き換え下準備）

## 決定

`three-js-to-oxidise-engine.md` のM2「orbitカメラ+translateギズモ+レイキャストを自前実装」の工数を、
レンダラー実装より先に切り出し、`src/utils/stage3d/` 配下へレンダラー非依存な純粋関数として実装した。
`ThreeStageViewport.tsx`（three.js版）は今回一切変更せず、新規ファイル追加のみで完結させている。
配線（イベント→この純粋ロジック→oxidise-engine呼び出し）は次マイルストーンで行う。

## 移植元と対応関係

- `src/utils/stage3d/vec3.ts`: 各モジュール共通の最小限ベクトル演算（three.js Vector3非依存）。既存
  `src/utils/stage3dMath.ts`（`billboardYawRadians`）とは役割を分離し、こちらは低レベルの算術専用。
- `src/utils/stage3d/orbitCamera.ts`: `ThreeStageViewport.tsx` の `OrbitControls` 設定
  （`target`, `enableDamping=true`, `dampingFactor=0.08`, `start`/`end` イベント相当）を、
  球面座標 `{target, radius, theta, phi}` の状態機械として再実装。`rotate`/`pan`/`zoom` が入力、
  `update(dtMs)` が減衰の時間経過適用、`getEyeLook()` がレンダラーの `setCamera` 相当への出力。
- `src/utils/stage3d/cameraRay.ts`: `screenPointToRay` はスクリーン座標→ワールドレイの変換。
  `ThreeStageViewport.tsx` 自体はRaycaster生成をthree.js側に任せていたため直接の移植元コードはないが、
  `THREE.PerspectiveCamera`（fov=45, near=0.1, far=500）が前提とする射影幾何を踏襲した。
- `src/utils/stage3d/hitTest.ts`: `hitVolumeDepth` は `ThreeStageViewport.tsx` の同名関数
  （`Math.max(0.05, Math.min(0.35, Math.min(planeW, planeH) * 0.08))`）をそのまま移植（コード内コメントで引用）。
  `hitTestBillboards` は `THREE.BoxGeometry(planeW, planeH, depth)` を hit ボリュームとする
  Raycaster ピッキングを、レイ×指向ボックス（OBB）の自前判定に置き換えたもの。
- `src/utils/stage3d/translateGizmo.ts`: `TransformControls`（`setMode('translate')`, `setSpace('world')`,
  `objectChange` イベント）の purely-functional な再実装。`begin`/`drag`/`end` の3段階APIで、
  X/Y/Z軸ドラッグとXZ平面ドラッグの2種類の拘束をサポートする。

## 意図的な簡略化（配線時に要注意）

- **translateGizmoの拘束種類**: TransformControlsはXY/YZ平面やスクリーン空間ドラッグ等も持つが、
  3Dステージのビルボード配置用途（PSDワールド配置）では地面に対する平行移動が主目的のため、
  X/Y/Z軸 + XZ平面のみに限定した。回転・スケールモードは対象外（元実装も translate 固定）。
- **ズームに減衰なし**: `orbitCamera.zoom()` はOrbitControls同様、距離をmin/maxへ即座にクランプする
  実装とし、rotate/panのようなvelocity積み立て式のダンピングは持たせていない
  （three.js側もズームのダンピングは補助的で、本質的な操作感への影響は小さいと判断）。
- **damping計算はdt正規化した指数減衰**: three.jsのOrbitControlsは固定フレームレート前提の
  `theta += delta * dampingFactor; delta *= (1-dampingFactor)` を毎フレーム呼ぶ設計だが、
  ここでは `update(dtMs)` に実経過時間を渡す前提で `remainingFactor = (1-dampingFactor)^(dt/16.6667ms)`
  という時間比例の指数減衰にした。フレームレート非依存で単調収束（オーバーシュートなし）になる。
- **hitTestのdegenerateケース**: レイと軸/平面がほぼ平行な場合、`translateGizmo.ts` は
  移動量ゼロ（掴んだ点のまま）にクランプする。three.js側は内部で無限大やNaNを許容する場面もあるが、
  ここでは配線側の安全のため明示的にフォールバックさせている。
- **カメラの`up`ベクトルは常に(0,1,0)固定**: `orbitCamera`/`cameraRay`ともにロール（Z軸まわり回転）は
  扱わない。3Dステージのユースケース上ロールは発生しないため、元実装の挙動と一致する。

## テスト

`npx vitest run src/utils/stage3d` で34テスト（6ファイル）green。既存の244ファイル/1770テストへの
影響なし（`npm test` で確認済み）。three.js（`three`パッケージ）へのimportは `src/utils/stage3d/` 配下に
一切存在しない（コメント内の言及のみ）。
