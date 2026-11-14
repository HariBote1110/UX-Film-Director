前提: `normalize` は零ベクトルに対して NaN を返す実装として指摘します。

- タイトル: `eye` と `look` が一致すると NaN が伝播する  
  ファイル: `src/utils/stage3d/cameraRay.ts:9`  
  根拠: `sub(look, eye)` が零ベクトルになり、`normalize` が NaN を返す前提では `forward` が NaN。以降の `cross` / `normalize` も NaN になり、`right.x === 0` などの零判定は NaN に対して false のため救済されない。`screenPointToRay` は NaN の `direction` を返し、`worldToScreen` も `camZ` が NaN のため後段のガードを通過して NaN を返し得る。  
  深刻度: 高

- タイトル: forward と worldUp が平行な場合の零ベクトル判定が normalize 後で無効  
  ファイル: `src/utils/stage3d/cameraRay.ts:10-11`  
  根拠: `cross(forward, worldUp)` が零ベクトルのとき、`normalize` が NaN を返す前提では `right` が NaN になり、`right.x === 0 && right.y === 0 && right.z === 0` は成立しない。真上/真下を見る縮退ケースでフォールバックに入らず、`up` も NaN になる。  
  深刻度: 高

- タイトル: 平行時のフォールバックが常に X 軸で、forward が X 軸に平行だと再縮退する  
  ファイル: `src/utils/stage3d/cameraRay.ts:13`  
  根拠: `right = { x: 1, y: 0, z: 0 }` は、`forward` が X 軸と平行な場合（例: `up = (1,0,0)`、`look - eye = (1,0,0)`）に `right` と `forward` が平行になる。次の `cross(right, forward)` が零ベクトルとなり、`normalize` で `up` が NaN になる。デフォルト `up = (0,1,0)` では救われるが、任意 `up` を許す API としては不十分。  
  深刻度: 中

- タイトル: canvas の 0 寸法ガードが不完全かつ `screenPointToRay` / `worldToScreen` で非対称  
  ファイル: `src/utils/stage3d/cameraRay.ts:23-27, 41-46`  
  根拠: `aspect = canvas.width / canvas.height` を 0 チェック前に計算している。`height = 0` で `aspect` が Infinity、`width = height = 0` で NaN になり得る。`screenPointToRay` は `ndcX` / `ndcY` だけをガードし、`tanHalfFovX` や `direction` に伝播する。`worldToScreen` は canvas 寸法のガードが一切なく、`width = 0` などで `0 * Infinity` により NaN になり得る。  
  深刻度: 中

- タイトル: fov の極端値・不正値で tan が 0/巨大/負になり得る  
  ファイル: `src/utils/stage3d/cameraRay.ts:26-27, 42-45`  
  根拠: `fovYDeg = 0` では `tanHalfFovY = 0` となり、`worldToScreen` の `camY / camZ / tanHalfFovY` などで 0 除算になる。`fovYDeg = 180` では `tan(π/2)` が巨大値、180 超や負では符号反転や非直感的な投影になる。有効範囲 `(0, 180)` の検証がない。  
  深刻度: 中

- タイトル: `worldToScreen` の `camZ` ガードが NaN を弾かない  
  ファイル: `src/utils/stage3d/cameraRay.ts:38`  
  根拠: `camZ <= 1e-6` は `camZ` が NaN のとき false になるため、縮退で NaN が入ると `null` ではなく NaN の `ScreenPoint` を返す。`!(camZ > 1e-6)` や `Number.isFinite(camZ)` の併用が必要。  
  深刻度: 中

往復誤差・符号・軸の取り違えについては、通常入力範囲では `screenPointToRay` と `worldToScreen` の変換式は整合しており、所見なし。
