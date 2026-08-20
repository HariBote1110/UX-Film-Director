/**
 * OxidiseStageViewport が StageRenderer#uploadMeshChunk へ渡す、グリッド床面と
 * 移動ギズモ(軸矢印)のジオメトリを組み立てる純粋関数群。
 *
 * oxidise-wasm のメッシュチャンクは三角形リストのみ(GL_LINES 相当のプリミティブは
 * 露出していない)なので、旧 THREE.GridHelper の「線」は薄い直方体(quad)として、
 * TransformControls の軸矢印は「シャフト(細い直方体) + 矢じり(四角錐)」として
 * 三角形へ変換する。
 */

export interface MeshChunkGeometry {
  /** [x0,y0,z0, x1,y1,z1, ...] */
  vertices: Float32Array;
  /** 頂点ごとの RGBA8 ([r,g,b,a, r,g,b,a, ...]、vertices.length/3*4 要素) */
  colours: Uint8Array;
  indices: Uint32Array;
}

interface RgbaColour {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** vertices/colours/indices を複数ジオメトリぶん結合する(インデックスのオフセットを補正)。 */
const mergeGeometries = (parts: MeshChunkGeometry[]): MeshChunkGeometry => {
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    vertexCount += part.vertices.length / 3;
    indexCount += part.indices.length;
  }

  const vertices = new Float32Array(vertexCount * 3);
  const colours = new Uint8Array(vertexCount * 4);
  const indices = new Uint32Array(indexCount);

  let vertexOffset = 0;
  let indexOffset = 0;
  for (const part of parts) {
    vertices.set(part.vertices, vertexOffset * 3);
    colours.set(part.colours, vertexOffset * 4);
    for (let i = 0; i < part.indices.length; i++) {
      indices[indexOffset + i] = part.indices[i] + vertexOffset;
    }
    vertexOffset += part.vertices.length / 3;
    indexOffset += part.indices.length;
  }

  return { vertices, colours, indices };
};

/** XZ 平面上、原点中心・(sizeX × sizeZ)・厚み(高さ) thickness の薄い直方体(quad)を1本作る。 */
const thinQuadXZ = (
  centreX: number,
  centreZ: number,
  sizeX: number,
  sizeZ: number,
  thickness: number,
  colour: RgbaColour
): MeshChunkGeometry => {
  const hx = sizeX / 2;
  const hz = sizeZ / 2;
  const hy = thickness / 2;
  const vertices = new Float32Array([
    centreX - hx, -hy, centreZ - hz,
    centreX + hx, -hy, centreZ - hz,
    centreX + hx, -hy, centreZ + hz,
    centreX - hx, -hy, centreZ + hz,
    centreX - hx, hy, centreZ - hz,
    centreX + hx, hy, centreZ - hz,
    centreX + hx, hy, centreZ + hz,
    centreX - hx, hy, centreZ + hz,
  ]);
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3, // bottom
    4, 6, 5, 4, 7, 6, // top
    0, 4, 5, 0, 5, 1, // sides
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ]);
  const colours = new Uint8Array(8 * 4);
  for (let i = 0; i < 8; i++) {
    colours[i * 4] = colour.r;
    colours[i * 4 + 1] = colour.g;
    colours[i * 4 + 2] = colour.b;
    colours[i * 4 + 3] = colour.a;
  }
  return { vertices, colours, indices };
};

export interface GridFloorOptions {
  /** グリッド全体の一辺(ワールド単位)。既定 40(旧 THREE.GridHelper(40, 40) と同じ)。 */
  size?: number;
  /** 分割数。既定 40。 */
  divisions?: number;
  /** 線の太さ(ワールド単位)。 */
  lineWidth?: number;
  /** 端の線の色。既定 0x333333相当。 */
  colour?: RgbaColour;
  /** 中心線(X=0/Z=0)の色。既定 0x444444相当。 */
  centreColour?: RgbaColour;
}

/** THREE.GridHelper(size, divisions) 相当の床グリッドを、線1本=薄いquad三角形として組み立てる。 */
export const buildGridFloorMesh = (options: GridFloorOptions = {}): MeshChunkGeometry => {
  const size = options.size ?? 40;
  const divisions = options.divisions ?? 40;
  const lineWidth = options.lineWidth ?? 0.02;
  const colour = options.colour ?? { r: 0x33, g: 0x33, b: 0x33, a: 0xff };
  const centreColour = options.centreColour ?? { r: 0x44, g: 0x44, b: 0x44, a: 0xff };

  const half = size / 2;
  const step = size / divisions;
  const parts: MeshChunkGeometry[] = [];

  for (let i = 0; i <= divisions; i++) {
    const offset = -half + i * step;
    const isCentre = Math.abs(offset) < 1e-9;
    const lineColour = isCentre ? centreColour : colour;
    // 線: X 方向に伸びる線(Z = offset で固定)
    parts.push(thinQuadXZ(0, offset, size, lineWidth, lineWidth, lineColour));
    // 線: Z 方向に伸びる線(X = offset で固定)
    parts.push(thinQuadXZ(offset, 0, lineWidth, size, lineWidth, lineColour));
  }

  return mergeGeometries(parts);
};

export type GizmoAxis = 'x' | 'y' | 'z';

export interface AxisArrowOptions {
  length?: number;
  shaftRadius?: number;
  headLength?: number;
  headSize?: number;
}

const AXIS_COLOURS: Record<GizmoAxis, RgbaColour> = {
  x: { r: 0xe0, g: 0x33, b: 0x33, a: 0xff },
  y: { r: 0x33, g: 0xe0, b: 0x33, a: 0xff },
  z: { r: 0x33, g: 0x66, b: 0xe0, a: 0xff },
};

/** 原点から (length,0,0) に沿って、軸方向のシャフト(直方体) + 矢じり(四角錐)を作る(ローカル座標、X 軸基準)。 */
const buildArrowAlongX = (options: Required<AxisArrowOptions>, colour: RgbaColour): MeshChunkGeometry => {
  const { length, shaftRadius, headLength, headSize } = options;
  const shaftLength = length - headLength;

  // シャフト: 原点(0,0,0)から(shaftLength,0,0)へ伸びる細い直方体
  const shaft = thinQuadXZ(shaftLength / 2, 0, shaftLength, shaftRadius, shaftRadius, colour);
  // ↑ thinQuadXZ は Y が薄み方向・X/Z が面。ここでは X 軸方向の棒を作りたいので回転せず、
  //   幅=shaftLength(X方向)・厚み(Z)=shaftRadius・高さ(Y)=shaftRadius として流用する。
  const shaftVertices = shaft.vertices;
  // thinQuadXZ(centreX, centreZ, sizeX, sizeZ, thickness) => X方向sizeX, Z方向sizeZ, Y方向thickness
  // ここでは呼び出し引数を (centreX=shaftLength/2, centreZ=0, sizeX=shaftLength, sizeZ=shaftRadius, thickness=shaftRadius) としたので、
  // 生成された直方体はすでに X 軸方向に正しい向きになっている。

  // 矢じり: shaftLength から length までの四角錐(底面 headSize 四方、頂点は (length,0,0))
  const hs = headSize / 2;
  const baseX = shaftLength;
  const tipX = length;
  const headVertices = new Float32Array([
    baseX, -hs, -hs,
    baseX, -hs, hs,
    baseX, hs, hs,
    baseX, hs, -hs,
    tipX, 0, 0,
  ]);
  const headIndices = new Uint32Array([
    0, 1, 2, 0, 2, 3, // base
    0, 4, 1,
    1, 4, 2,
    2, 4, 3,
    3, 4, 0,
  ]);
  const headColours = new Uint8Array(5 * 4);
  for (let i = 0; i < 5; i++) {
    headColours[i * 4] = colour.r;
    headColours[i * 4 + 1] = colour.g;
    headColours[i * 4 + 2] = colour.b;
    headColours[i * 4 + 3] = colour.a;
  }
  const head: MeshChunkGeometry = { vertices: headVertices, colours: headColours, indices: headIndices };

  return mergeGeometries([{ ...shaft, vertices: shaftVertices }, head]);
};

const rotateXToY = (v: Float32Array): Float32Array => {
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i += 3) {
    // (x,y,z) -> (y,x,z) 相当の90度回転(X軸方向の矢印をY軸方向へ)
    out[i] = v[i + 1];
    out[i + 1] = v[i];
    out[i + 2] = v[i + 2];
  }
  return out;
};

const rotateXToZ = (v: Float32Array): Float32Array => {
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i += 3) {
    // (x,y,z) -> (z,y,x) 相当の90度回転(X軸方向の矢印をZ軸方向へ)
    out[i] = v[i + 2];
    out[i + 1] = v[i + 1];
    out[i + 2] = v[i];
  }
  return out;
};

/** 平行移動ギズモの1軸ぶんの矢印ジオメトリ(ワールド原点基準、+axis方向)。 */
export const buildAxisArrowMesh = (
  axis: GizmoAxis,
  options: AxisArrowOptions = {}
): MeshChunkGeometry => {
  const resolved: Required<AxisArrowOptions> = {
    length: options.length ?? 1.0,
    shaftRadius: options.shaftRadius ?? 0.03,
    headLength: options.headLength ?? 0.22,
    headSize: options.headSize ?? 0.09,
  };
  const geometry = buildArrowAlongX(resolved, AXIS_COLOURS[axis]);
  if (axis === 'x') return geometry;
  if (axis === 'y') return { ...geometry, vertices: rotateXToY(geometry.vertices) };
  return { ...geometry, vertices: rotateXToZ(geometry.vertices) };
};

/** 3軸ぶんの矢印を1つのメッシュチャンクへまとめる(uploadMeshChunk 1回分)。 */
export const buildTranslateGizmoMesh = (options: AxisArrowOptions = {}): MeshChunkGeometry =>
  mergeGeometries([
    buildAxisArrowMesh('x', options),
    buildAxisArrowMesh('y', options),
    buildAxisArrowMesh('z', options),
  ]);
