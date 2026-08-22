import { readPsd, Layer } from 'ag-psd';
import { PsdLayerNode, PsdLayerStruct, PsdObject, TimelineObject } from '../types';
import { parsePsdWithWasm, type ParsedWasmPsd, type WasmLayerMeta } from './psdWasm';
import { psdLayerTextureUrl } from './psdTextureUrl';

type LayerWithBounds = Layer & {
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  imageData?: unknown;
};

type LayerImageDataNormalised = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

const LAYER_NAME_DECODE_ENCODINGS = ['utf-8', 'shift_jis', 'euc-jp'] as const;

/** Avoids per-code-point \p{Script=} regex in hot paths (layer names). */
const isJapaneseScriptCodePoint = (code: number): boolean => {
  return (
    (code >= 0x3040 && code <= 0x309f) ||
    (code >= 0x30a0 && code <= 0x30ff) ||
    (code >= 0x31f0 && code <= 0x31ff) ||
    (code >= 0xff65 && code <= 0xff9f) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
};

const getLayerWidth = (layer: LayerWithBounds) => {
  if (typeof layer.width === 'number') return layer.width;
  if (typeof layer.left === 'number' && typeof layer.right === 'number') {
    return Math.max(0, layer.right - layer.left);
  }
  return 0;
};

const getLayerHeight = (layer: LayerWithBounds) => {
  if (typeof layer.height === 'number') return layer.height;
  if (typeof layer.top === 'number' && typeof layer.bottom === 'number') {
    return Math.max(0, layer.bottom - layer.top);
  }
  return 0;
};

// キャンバス -> BlobURL（createImageBitmap 非対応時のフォールバック）
const canvasToUrl = (canvas: HTMLCanvasElement): Promise<string> => {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : '');
    }, 'image/png');
  });
};

const rasterCanvasToLayerSource = async (
  canvas: HTMLCanvasElement
): Promise<{ src: string; textureSource?: ImageBitmap }> => {
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(canvas);
      return { src: '', textureSource: bitmap };
    }
  } catch {
    // fall through to PNG blob
  }
  return { src: await canvasToUrl(canvas), textureSource: undefined };
};

const toClampedCopy = (source: Uint8Array | Uint8ClampedArray): Uint8ClampedArray => {
  if (source instanceof Uint8ClampedArray) {
    return new Uint8ClampedArray(source);
  }

  const sliced = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  return new Uint8ClampedArray(sliced);
};

const toClampedFromNumericView = (
  source: Uint16Array | Float32Array | Int16Array | Int32Array | Uint32Array
): Uint8ClampedArray => {
  const result = new Uint8ClampedArray(source.length);

  if (source instanceof Uint16Array) {
    // Bitwise unsigned right-shift by 8 maps [0, 65535] → [0, 255] without
    // floating-point division or Math.round call overhead.
    for (let i = 0; i < source.length; i++) {
      result[i] = source[i] >>> 8;
    }
    return result;
  }

  if (source instanceof Float32Array) {
    for (let i = 0; i < source.length; i++) {
      const value = source[i];
      const scaled = value >= 0 && value <= 1 ? value * 255 : value;
      result[i] = Math.max(0, Math.min(255, Math.round(scaled)));
    }
    return result;
  }

  for (let i = 0; i < source.length; i++) {
    result[i] = Math.max(0, Math.min(255, Math.round(source[i])));
  }
  return result;
};

const normalisePixelArray = (rawData: unknown): Uint8ClampedArray | null => {
  if (rawData instanceof Uint8ClampedArray || rawData instanceof Uint8Array) {
    return toClampedCopy(rawData);
  }

  if (
    rawData instanceof Uint16Array ||
    rawData instanceof Float32Array ||
    rawData instanceof Int16Array ||
    rawData instanceof Int32Array ||
    rawData instanceof Uint32Array
  ) {
    return toClampedFromNumericView(rawData);
  }

  return null;
};

const normaliseLayerImageData = (
  imageDataLike: unknown,
  fallbackWidth: number,
  fallbackHeight: number
): LayerImageDataNormalised | null => {
  if (!imageDataLike) return null;

  let data: Uint8ClampedArray | null = null;
  let width = fallbackWidth;
  let height = fallbackHeight;

  if (typeof ImageData !== 'undefined' && imageDataLike instanceof ImageData) {
    width = imageDataLike.width > 0 ? imageDataLike.width : fallbackWidth;
    height = imageDataLike.height > 0 ? imageDataLike.height : fallbackHeight;

    const expectedLength = width * height * 4;
    if (
      Number.isFinite(expectedLength) &&
      expectedLength > 0 &&
      imageDataLike.data.length >= expectedLength
    ) {
      // Reuse the existing Uint8ClampedArray directly — avoids a full pixel-buffer copy.
      data =
        imageDataLike.data.length === expectedLength
          ? imageDataLike.data
          : imageDataLike.data.slice(0, expectedLength);
    } else {
      return null;
    }
  } else if (
    imageDataLike instanceof Uint8Array ||
    imageDataLike instanceof Uint8ClampedArray ||
    imageDataLike instanceof Uint16Array ||
    imageDataLike instanceof Float32Array ||
    imageDataLike instanceof Int16Array ||
    imageDataLike instanceof Int32Array ||
    imageDataLike instanceof Uint32Array
  ) {
    data = normalisePixelArray(imageDataLike);
  } else if (typeof imageDataLike === 'object' && imageDataLike !== null && 'data' in imageDataLike) {
    const maybeData = (imageDataLike as { data?: unknown }).data;
    const normalisedPixelArray = normalisePixelArray(maybeData);
    if (normalisedPixelArray) {
      data = normalisedPixelArray;
      const maybeWidth = (imageDataLike as { width?: unknown }).width;
      const maybeHeight = (imageDataLike as { height?: unknown }).height;
      width = typeof maybeWidth === 'number' && maybeWidth > 0 ? maybeWidth : fallbackWidth;
      height = typeof maybeHeight === 'number' && maybeHeight > 0 ? maybeHeight : fallbackHeight;
    }
  }

  if (!data || width <= 0 || height <= 0) {
    return null;
  }

  const expectedLength = width * height * 4;
  if (!Number.isFinite(expectedLength) || expectedLength <= 0 || data.length < expectedLength) {
    return null;
  }

  if (data.length > expectedLength) {
    data = data.slice(0, expectedLength);
  }

  return { data, width, height };
};

const toSingleByteNameBytes = (value: string): Uint8Array | null => {
  const bytes = new Uint8Array(value.length);

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 0xff) return null;
    bytes[i] = code;
  }

  return bytes;
};

const scoreLayerName = (value: string): number => {
  let score = 0;

  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;

    if (char === '\uFFFD') {
      score -= 8;
      continue;
    }

    if ((code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) {
      score -= 6;
      continue;
    }

    if (isJapaneseScriptCodePoint(code)) {
      score += 5;
      continue;
    }

    if (code >= 0x20 && code <= 0x7e) {
      score += 2;
      continue;
    }

    score += 1;
  }

  return score;
};

const hasSuspiciousNameBytes = (value: string): boolean => {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (char === '\uFFFD') return true;
    if ((code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
};

const containsJapanese = (value: string): boolean => {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const low = value.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        const cp = (code - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
        if (isJapaneseScriptCodePoint(cp)) return true;
        i++;
        continue;
      }
    }
    if (isJapaneseScriptCodePoint(code)) return true;
  }
  return false;
};

const restoreLayerNameEncoding = (name: string): string => {
  const bytes = toSingleByteNameBytes(name);
  if (!bytes || bytes.length === 0) return name;
  if (!hasSuspiciousNameBytes(name)) return name;

  let bestName = name;
  let bestScore = scoreLayerName(name);

  for (const encoding of LAYER_NAME_DECODE_ENCODINGS) {
    try {
      const decoded = new TextDecoder(encoding, { fatal: false }).decode(bytes).replace(/\u0000+$/u, '');
      if (decoded.length === 0) continue;

      const decodedScore = scoreLayerName(decoded);
      if (decodedScore > bestScore + 2 && containsJapanese(decoded)) {
        bestName = decoded;
        bestScore = decodedScore;
      }
    } catch {
      // 一部環境での未対応エンコードは無視する。
    }
  }

  return bestName;
};

// PSD読み込み結果
export interface PsdParseResult {
  psdObject: PsdObject;
}

const findNodePath = (node: PsdLayerNode, targetId: string, path: PsdLayerNode[] = []): PsdLayerNode[] | null => {
  const nextPath = [...path, node];
  if (node.id === targetId) return nextPath;

  for (const child of node.children) {
    const found = findNodePath(child, targetId, nextPath);
    if (found) return found;
  }

  return null;
};


const toLayerStruct = (node: PsdLayerNode, activeLayerIds: Record<string, boolean>): PsdLayerStruct => {
  return {
    seq: node.isGroup ? null : node.id,
    name: node.name,
    checked: node.isGroup ? true : Boolean(activeLayerIds[node.id]),
    isRadio: node.isRadio,
    children: node.children.map((child) => toLayerStruct(child, activeLayerIds)),
  };
};

export const buildPsdLayerTree = (rootNode: PsdLayerNode, activeLayerIds: Record<string, boolean>): PsdLayerStruct[] => {
  return rootNode.children.map((child) => toLayerStruct(child, activeLayerIds));
};

export const buildStablePsdLayerNodeId = ({
  layerIndex,
  isGroup,
  ownGroupId,
}: {
  layerIndex: number;
  isGroup: boolean;
  ownGroupId: number | null;
}): string => {
  if (isGroup) {
    return `psd-group-${ownGroupId ?? layerIndex}`;
  }
  return `psd-layer-${layerIndex}`;
};

/** Remove GPU-only fields before JSON serialisation (project save). */
export const stripPsdLayerNodeForPersistence = (node: PsdLayerNode): PsdLayerNode => ({
  id: node.id,
  name: node.name,
  isGroup: node.isGroup,
  isRadio: node.isRadio,
  children: node.children.map(stripPsdLayerNodeForPersistence),
  width: node.width,
  height: node.height,
  left: node.left,
  top: node.top,
  defaultVisible: node.defaultVisible,
  src: node.src,
});

/**
 * PSDTool 互換のレイヤートグル。
 *
 * PSDTool の '*' 接頭辞は「そのノード自身がラジオ項目」であることを意味し、
 * 同じ親を持つ '*' 兄弟（レイヤー/フォルダ）同士で排他になる。かつての
 * 「isRadio なグループの子ども同士が排他」という解釈は誤りで、実 PSD
 * （**髪ショート 配下の !髪色/!髪線画 など）で必要なレイヤーが消えたり、
 * 髪型（'*' フォルダ同士）の切替が一切できない原因になっていた。
 *
 * 排他時は兄弟ノード自身のみ OFF にし、サブツリーは掃かない。描画側
 * （rust-backend psd_fast の合成）は祖先グループの可視性を尊重するため
 * フォルダ OFF で配下は隠れ、再選択時に内部状態が復元される。
 */
export const togglePsdLayer = (
  rootNode: PsdLayerNode,
  currentActiveLayerIds: Record<string, boolean>,
  targetLayerId: string
): Record<string, boolean> => {
  const path = findNodePath(rootNode, targetLayerId);
  if (!path) return currentActiveLayerIds;

  const targetNode = path[path.length - 1];
  // 通常フォルダは PropertyPanel 同様トグル対象外（ラジオ項目フォルダは選択可）
  if (targetNode.isGroup && !targetNode.isRadio) return currentActiveLayerIds;

  const nextActiveLayerIds = { ...currentActiveLayerIds };

  // ターゲットに到達する経路上のグループは常に表示する。
  path.forEach((node) => {
    if (node.isGroup) {
      nextActiveLayerIds[node.id] = true;
    }
  });

  // 経路上のラジオ項目（ターゲット含む）ごとに '*' 兄弟排他を適用する。
  for (let index = 1; index < path.length; index += 1) {
    const node = path[index];
    if (!node.isRadio) continue;
    const parent = path[index - 1];
    parent.children.forEach((sibling) => {
      if (sibling.id === node.id) return;
      if (sibling.isRadio) {
        nextActiveLayerIds[sibling.id] = false;
      }
    });
    nextActiveLayerIds[node.id] = true;
  }

  if (targetNode.isRadio) {
    // ラジオ項目は選択専用（タップで OFF にはならない = PSDTool 仕様）
    nextActiveLayerIds[targetLayerId] = true;
  } else {
    nextActiveLayerIds[targetLayerId] = !Boolean(currentActiveLayerIds[targetLayerId]);
  }

  nextActiveLayerIds[rootNode.id] = true;
  return nextActiveLayerIds;
};

const isImageBitmapValue = (value: ImageBitmap | Uint8Array): value is ImageBitmap =>
  typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap;

const buildPsdObjectFromWasmParse = async (
  parsed: ParsedWasmPsd,
  fileName: string,
  startTime: number,
  projectWidth: number,
  projectHeight: number,
  originalFile?: File
): Promise<PsdParseResult> => {
  const { meta, pixels } = parsed;
  const pendingImageLoads: Array<{ node: PsdLayerNode; pixelData: ImageBitmap | Uint8Array }> = [];

  const buildNode = (idx: number): PsdLayerNode => {
    const layer = meta.layers[idx];
    const layerName = restoreLayerNameEncoding(layer.name || 'Layer');
    const node: PsdLayerNode = {
      id: buildStablePsdLayerNodeId({
        layerIndex: idx,
        isGroup: layer.isGroup,
        ownGroupId: layer.ownGroupId,
      }),
      name: layerName,
      isGroup: layer.isGroup,
      isRadio: layerName.startsWith('*'),
      children: [],
      width: layer.width,
      height: layer.height,
      left: layer.left,
      top: layer.top,
      defaultVisible: layer.visible,
      src: undefined,
    };

    const pixelData = pixels[idx];
    const hasPixels = isImageBitmapValue(pixelData) || (pixelData instanceof Uint8Array && pixelData.length > 0);
    if (!layer.isGroup && hasPixels && layer.width > 0 && layer.height > 0) {
      pendingImageLoads.push({ node, pixelData });
    }

    return node;
  };

  const groupChildren = new Map<number | null, number[]>();
  for (let i = 0; i < meta.layers.length; i++) {
    const layer = meta.layers[i];
    const key = layer.parentGroupId ?? null;
    let bucket = groupChildren.get(key);
    if (!bucket) {
      bucket = [];
      groupChildren.set(key, bucket);
    }
    bucket.push(i);
  }

  const buildGroupNode = (idx: number): PsdLayerNode => {
    const node = buildNode(idx);
    const layer = meta.layers[idx];
    if (layer.isGroup && layer.ownGroupId != null) {
      const childIndices = groupChildren.get(layer.ownGroupId) ?? [];
      node.children = childIndices.map(buildGroupNode);
    }
    return node;
  };

  const rootIndices = groupChildren.get(null) ?? [];
  const rootNode: PsdLayerNode = {
    id: 'root',
    name: 'Root',
    isGroup: true,
    isRadio: false,
    children: rootIndices.map(buildGroupNode),
    width: meta.width,
    height: meta.height,
    left: 0,
    top: 0,
    defaultVisible: true,
  };

  await Promise.all(
    pendingImageLoads.map(async ({ node, pixelData }) => {
      try {
        if (isImageBitmapValue(pixelData)) {
          node.textureSource = pixelData;
          node.src = psdLayerTextureUrl(node.id);
          return;
        }

        if (typeof ImageData !== 'undefined' && typeof createImageBitmap === 'function') {
          const data = new Uint8ClampedArray(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength);
          const imgData = new ImageData(
            data as unknown as ImageData['data'],
            node.width,
            node.height
          );
          node.textureSource = await createImageBitmap(imgData);
          node.src = psdLayerTextureUrl(node.id);
        }
      } catch (error) {
        console.warn('Failed to create ImageBitmap (WASM path):', node.name, error);
      }
    })
  );

  const activeLayerIds: Record<string, boolean> = {};

  const initVisibility = (node: PsdLayerNode) => {
    if (node.isGroup) {
      if (node.isRadio) {
        node.children.forEach(initVisibility);
        const activeChild = node.children.find((child) => activeLayerIds[child.id]);
        if (!activeChild && node.children.length > 0) {
          activeLayerIds[node.children[0].id] = true;
        }
        activeLayerIds[node.id] = true;
      } else {
        if (node.defaultVisible) activeLayerIds[node.id] = true;
        node.children.forEach(initVisibility);
      }
    } else if (node.defaultVisible) {
      activeLayerIds[node.id] = true;
    }
  };

  initVisibility(rootNode);
  activeLayerIds.root = true;

  const psdObject: TimelineObject = {
    id: crypto.randomUUID(),
    type: 'psd',
    name: fileName,
    layer: 0,
    startTime,
    duration: 5,
    x: (projectWidth / 2) - (meta.width / 2),
    y: (projectHeight / 2) - (meta.height / 2),
    width: meta.width,
    height: meta.height,
    scale: 1.0,
    enableAnimation: false,
    endX: (projectWidth / 2) - (meta.width / 2),
    endY: (projectHeight / 2) - (meta.height / 2),
    easing: 'linear',
    offset: 0,
    src: '',
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    file: originalFile,
    layerTree: buildPsdLayerTree(rootNode, activeLayerIds),
    rootLayer: rootNode,
    activeLayerIds,
  };

  return { psdObject: psdObject as PsdObject };
};

/**
 * Load image data for a single leaf layer node and attach textureSource / src.
 *
 * Called in parallel for all sibling layers (Phase 2 of two-phase parsing).
 * Canvas creation is skipped when ag-psd already provides an ImageData object —
 * createImageBitmap accepts ImageData directly, saving one DOM element allocation
 * and one putImageData call per raster layer.
 */
const loadLayerImage = async (node: PsdLayerNode, layer: Layer): Promise<void> => {
  const layerWithBounds = layer as LayerWithBounds;
  try {
    if ((layer as unknown as { canvas?: HTMLCanvasElement }).canvas) {
      const canvas = (layer as unknown as { canvas: HTMLCanvasElement }).canvas;
      const { src, textureSource } = await rasterCanvasToLayerSource(canvas);
      if (textureSource) {
        node.textureSource = textureSource;
        node.src = psdLayerTextureUrl(node.id);
      } else {
        node.src = src;
      }
      return;
    }

    if (layerWithBounds.imageData) {
      // Fast path: ag-psd with useImageData:true gives a proper ImageData —
      // pass it straight to createImageBitmap without touching a canvas element.
      if (
        typeof ImageData !== 'undefined' &&
        layerWithBounds.imageData instanceof ImageData &&
        typeof createImageBitmap === 'function'
      ) {
        try {
          const bitmap = await createImageBitmap(layerWithBounds.imageData as unknown as ImageData);
          node.textureSource = bitmap;
          node.src = psdLayerTextureUrl(node.id);
          return;
        } catch {
          // fall through to normalised path
        }
      }

      // Normalised fallback path (exotic pixel formats or environments without createImageBitmap).
      const normalised = normaliseLayerImageData(layerWithBounds.imageData, node.width, node.height);
      if (normalised) {
        const imgData = new ImageData(normalised.data as unknown as ImageData['data'], normalised.width, normalised.height);
        if (typeof createImageBitmap === 'function') {
          try {
            const bitmap = await createImageBitmap(imgData);
            node.textureSource = bitmap;
            node.src = psdLayerTextureUrl(node.id);
            return;
          } catch {
            // fall through to canvas
          }
        }
        // Last resort: canvas + toBlob
        const cvs = document.createElement('canvas');
        cvs.width = normalised.width;
        cvs.height = normalised.height;
        const ctx = cvs.getContext('2d');
        if (ctx) {
          ctx.putImageData(imgData, 0, 0);
          const { src, textureSource } = await rasterCanvasToLayerSource(cvs);
          if (textureSource) {
            node.textureSource = textureSource;
            node.src = psdLayerTextureUrl(node.id);
          } else {
            node.src = src;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed to convert layer image', e);
  }
};

/**
 * 削除待ち（R5-4 でまとめて削除予定）: R5-5 で `projectFile.ts` の
 * `restorePsdObjectFromFile` を `parsePsdMetaFromPath` へ移行したことで、
 * プロダクションコードからの呼び出し元は 0 件になった（`rg` で確認済み）。
 * 残る呼び出しはテストのみ（`psdParserArrayBufferWasm.test.ts` /
 * `psdParser.perf.test.ts` / `src/remoteDeck/remoteDeckPsdLayers.e2e.test.ts`）。
 * 内部で `parsePsdWithWasm`（`psdWasm.ts`）を第一候補として呼ぶため、
 * R5-4 が `psdWasm.ts`/`psdAgPsdWorker.ts` を削除するのと同じバッチで
 * この関数と上記テストも合わせて削除する
 * （progress/rust-source-of-truth-r5-psd-unification.md 参照）。
 */
export const parsePsdArrayBufferAsObject = async (
  arrayBuffer: ArrayBuffer,
  fileName: string,
  startTime: number,
  projectWidth: number = 1280,
  projectHeight: number = 720,
  originalFile?: File
): Promise<PsdParseResult> => {
  try {
    const wasmParsed = await parsePsdWithWasm(arrayBuffer.slice(0));
    return await buildPsdObjectFromWasmParse(
      wasmParsed,
      fileName,
      startTime,
      projectWidth,
      projectHeight,
      originalFile
    );
  } catch (error) {
    console.warn('WASM PSD ArrayBuffer parse failed, falling back:', error);
  }

  // 読み込み
  const psd = readPsd(arrayBuffer, {
    skipLayerImageData: false,
    useImageData: true,
    skipThumbnail: true,
    skipCompositeImageData: true,
  });

  // レイヤーID生成用
  let idCounter = 0;
  const generateId = () => `psd-layer-${idCounter++}`;

  /**
   * Phase 1 — synchronous skeleton build.
   *
   * IDs are assigned via a deterministic DFS walk so the order is stable even
   * when image loading is later parallelised.  No async work happens here.
   */
  const buildSkeleton = (layer: Layer): PsdLayerNode => {
    const layerWithBounds = layer as LayerWithBounds;
    const width = getLayerWidth(layerWithBounds);
    const height = getLayerHeight(layerWithBounds);
    const layerName = restoreLayerNameEncoding(layer.name || 'Layer');

    const node: PsdLayerNode = {
      id: generateId(),
      name: layerName,
      isGroup: !!layer.children,
      isRadio: layerName.startsWith('*'),
      children: layer.children ? layer.children.map(buildSkeleton) : [],
      width,
      height,
      left: layerWithBounds.left || 0,
      top: layerWithBounds.top || 0,
      defaultVisible: !layer.hidden,
      src: undefined,
    };
    return node;
  };

  /**
   * Phase 2 — parallel image loading.
   *
   * Sibling layers within every group are processed concurrently via
   * Promise.all.  This overlaps GPU uploads (createImageBitmap) across layers,
   * which is the dominant cost after ag-psd decoding.
   */
  const loadImages = (node: PsdLayerNode, layer: Layer): Promise<void> => {
    const tasks: Promise<void>[] = [];

    if (!node.isGroup) {
      tasks.push(loadLayerImage(node, layer));
    }

    if (layer.children) {
      layer.children.forEach((child, i) => {
        tasks.push(loadImages(node.children[i], child));
      });
    }

    return Promise.all(tasks).then(() => undefined);
  };

  // ルートノード構築
  const rootNode: PsdLayerNode = {
    id: 'root',
    name: 'Root',
    isGroup: true,
    isRadio: false,
    children: [],
    width: psd.width,
    height: psd.height,
    left: 0,
    top: 0,
    defaultVisible: true
  };

  if (psd.children) {
    rootNode.children = psd.children.map(buildSkeleton);
    await Promise.all(psd.children.map((child, i) => loadImages(rootNode.children[i], child)));
  } else if (psd.imageData) {
    const layer = psd as unknown as Layer;
    const skeleton = buildSkeleton(layer);
    rootNode.children.push(skeleton);
    await loadImages(skeleton, layer);
  }

  // 初期表示状態の計算
  const activeLayerIds: Record<string, boolean> = {};

  const initVisibility = (node: PsdLayerNode) => {
    if (node.isGroup) {
      if (node.isRadio) {
        node.children.forEach(initVisibility);

        const activeChild = node.children.find((child) => activeLayerIds[child.id]);
        if (!activeChild && node.children.length > 0) {
          const defaultChild = node.children[0];
          activeLayerIds[defaultChild.id] = true;
        }
        activeLayerIds[node.id] = true;
      } else {
        if (node.defaultVisible) {
          activeLayerIds[node.id] = true;
        }
        node.children.forEach(initVisibility);
      }
    } else {
      if (node.defaultVisible) {
        activeLayerIds[node.id] = true;
      }
    }
  };

  initVisibility(rootNode);
  activeLayerIds['root'] = true;

  const psdObject: TimelineObject = {
    id: crypto.randomUUID(),
    type: 'psd',
    name: fileName,
    layer: 0,
    startTime: startTime,
    duration: 5,
    x: (projectWidth / 2) - (psd.width / 2),
    y: (projectHeight / 2) - (psd.height / 2),
    width: psd.width,
    height: psd.height,
    scale: 1.0,
    enableAnimation: false,
    endX: (projectWidth / 2) - (psd.width / 2),
    endY: (projectHeight / 2) - (psd.height / 2),
    easing: 'linear',
    offset: 0,
    src: '',
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    file: originalFile,
    layerTree: buildPsdLayerTree(rootNode, activeLayerIds),
    rootLayer: rootNode,
    activeLayerIds: activeLayerIds
  };

  return { psdObject: psdObject as PsdObject };
};

type RustPsdNode = {
  psdId: number;
  parentPsdId: number | null;
  isGroup: boolean;
  name: string;
  width: number;
  height: number;
  top: number;
  left: number;
  defaultVisible: boolean;
  order: number;
  pixelOffset: number | null;
  pixelByteLen: number;
  /** Attached by the Electron main process after reading the blob. */
  pixelData: ArrayBuffer | null;
};

// ── Rust metadata-only path (sole import path, R5-3) ──────────────────────────

type RustPsdMetaNode = Omit<RustPsdNode, 'pixelOffset' | 'pixelByteLen' | 'pixelData'>;

/**
 * Injectable RPC bridge for `psd.parseMeta` (IPC channel `'parse-psd-meta'`).
 * Mirrors the injection pattern used by `RustBackendProjectFileBridge` in
 * `projectFile.ts` — the default implementation calls `window.ipcRenderer`
 * directly (Electron renderer context assumed); tests substitute this.
 */
export interface PsdMetaRpcBridge {
  invoke: (channel: 'parse-psd-meta', payload: { filePath: string }) => Promise<unknown>;
}

const defaultPsdMetaRpcBridge = (): PsdMetaRpcBridge => ({
  invoke: (channel, payload) => window.ipcRenderer.invoke(channel, payload),
});

/**
 * Parse a PSD file using ONLY the Rust backend's layer-tree metadata —
 * no ag-psd, no pixel bytes crossing the IPC boundary. Display still works
 * because rust-backend's preview/native-overlay pipeline re-decodes the PSD
 * independently from its file path (see `double-decode-discovery.md`), so
 * `PsdLayerNode.textureSource` staying `undefined` here is expected; `src`
 * is still set via `psdLayerTextureUrl` so downstream consumers resolve the
 * same way as the pixel-carrying paths.
 *
 * Rust performs `fs::read` on `filePath` itself — callers never read the
 * file bytes on the TS side.
 *
 * Used both by the import flow (`parsePsdAsObject`, via `parsePsdViaRustMeta`)
 * and by the saved-project restore flow (`projectFile.ts`'s
 * `restorePsdObjectFromFile`, via the exported `parsePsdMetaFromPath`, R5-5).
 */
const parsePsdMetaViaRust = async (
  filePath: string,
  fileName: string,
  startTime: number,
  projectWidth: number,
  projectHeight: number,
  originalFile: File | undefined,
  bridge: PsdMetaRpcBridge
): Promise<PsdParseResult> => {
  const rustResult = await bridge.invoke('parse-psd-meta', { filePath }) as {
    success: boolean;
    error?: string;
    width: number;
    height: number;
    nodes: RustPsdMetaNode[];
  };

  if (!rustResult.success) {
    throw new Error(rustResult.error ?? 'psd.parseMeta failed in Rust backend');
  }

  // Build parent → [child, ...] map keyed by the parent's psdId
  // (parentPsdId is a GROUP id, null = top-level).
  const groupChildren = new Map<number | null, RustPsdMetaNode[]>();
  for (const node of rustResult.nodes) {
    const key = node.parentPsdId;
    let bucket = groupChildren.get(key);
    if (!bucket) {
      bucket = [];
      groupChildren.set(key, bucket);
    }
    bucket.push(node);
  }
  for (const bucket of groupChildren.values()) {
    bucket.sort((a, b) => a.order - b.order);
  }

  const buildNodeFromRustMeta = (rustNode: RustPsdMetaNode): PsdLayerNode => {
    const layerName = restoreLayerNameEncoding(rustNode.name || 'Layer');
    const node: PsdLayerNode = {
      id: buildStablePsdLayerNodeId({
        layerIndex: rustNode.psdId,
        isGroup: rustNode.isGroup,
        ownGroupId: rustNode.isGroup ? rustNode.psdId : null,
      }),
      name: layerName,
      isGroup: rustNode.isGroup,
      isRadio: layerName.startsWith('*'),
      children: [],
      width: rustNode.width,
      height: rustNode.height,
      left: rustNode.left,
      top: rustNode.top,
      defaultVisible: rustNode.defaultVisible,
      // No pixel data in path B: textureSource stays undefined, but src is
      // still populated so the existing native-overlay preview pipeline
      // resolves the layer the same way it does for the pixel-carrying paths.
      src: undefined,
    };

    if (!rustNode.isGroup && node.width > 0 && node.height > 0) {
      node.src = psdLayerTextureUrl(node.id);
    }

    if (rustNode.isGroup) {
      const children = groupChildren.get(rustNode.psdId) ?? [];
      node.children = children.map(buildNodeFromRustMeta);
    }

    return node;
  };

  const rootLevelNodes = groupChildren.get(null) ?? [];
  const rootNode: PsdLayerNode = {
    id: 'root',
    name: 'Root',
    isGroup: true,
    isRadio: false,
    children: rootLevelNodes.map(buildNodeFromRustMeta),
    width: rustResult.width,
    height: rustResult.height,
    left: 0,
    top: 0,
    defaultVisible: true,
  };

  const activeLayerIds: Record<string, boolean> = {};

  const initVisibility = (node: PsdLayerNode) => {
    if (node.isGroup) {
      if (node.isRadio) {
        node.children.forEach(initVisibility);
        const activeChild = node.children.find((c) => activeLayerIds[c.id]);
        if (!activeChild && node.children.length > 0) {
          activeLayerIds[node.children[0].id] = true;
        }
        activeLayerIds[node.id] = true;
      } else {
        if (node.defaultVisible) activeLayerIds[node.id] = true;
        node.children.forEach(initVisibility);
      }
    } else {
      if (node.defaultVisible) activeLayerIds[node.id] = true;
    }
  };

  initVisibility(rootNode);
  activeLayerIds['root'] = true;

  const psdObject: TimelineObject = {
    id: crypto.randomUUID(),
    type: 'psd',
    name: fileName,
    layer: 0,
    startTime,
    duration: 5,
    x: (projectWidth / 2) - (rustResult.width / 2),
    y: (projectHeight / 2) - (rustResult.height / 2),
    width: rustResult.width,
    height: rustResult.height,
    scale: 1.0,
    enableAnimation: false,
    endX: (projectWidth / 2) - (rustResult.width / 2),
    endY: (projectHeight / 2) - (rustResult.height / 2),
    easing: 'linear',
    offset: 0,
    src: '',
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    file: originalFile,
    layerTree: buildPsdLayerTree(rootNode, activeLayerIds),
    rootLayer: rootNode,
    activeLayerIds,
  };

  return { psdObject: psdObject as PsdObject };
};

/**
 * Parse a saved project's PSD reference (`PsdObject.filePath`) via the same
 * `psd.parseMeta` RPC used by the import flow — no ag-psd, no TS-side file
 * read (Rust does `fs::read` on `filePath` itself). Used by
 * `projectFile.ts`'s `restorePsdObjectFromFile` (R5-5); `bridge` is
 * injectable for tests, mirroring `RustBackendProjectFileBridge`.
 *
 * Throws on any failure (missing file, RPC error, non-Electron environment
 * via a rejecting `bridge.invoke`) — callers are responsible for catching
 * and falling back, same granularity as the previous ag-psd-based path.
 */
export const parsePsdMetaFromPath = (
  filePath: string,
  fileName: string,
  startTime: number,
  projectWidth: number,
  projectHeight: number,
  bridge: PsdMetaRpcBridge = defaultPsdMetaRpcBridge()
): Promise<PsdParseResult> =>
  parsePsdMetaViaRust(filePath, fileName, startTime, projectWidth, projectHeight, undefined, bridge);

// ── Public entry points ───────────────────────────────────────────────────────

/**
 * Sole PSD import path (R5-3): `psd.parseMeta` via the Rust backend RPC.
 * ag-psd (`parsePsdViaWasm`/`parsePsdViaRust`/the ag-psd main-thread path)
 * is no longer part of the import flow — see
 * `progress/rust-source-of-truth-r5-psd-unification.md`.
 *
 * Requires Electron (`file.path`) + `window.ipcRenderer`. Both the browser
 * (non-Electron) case and an RPC failure surface as a thrown Error with a
 * Japanese message; callers (`useTimelineDrop.ts`, `Timeline.tsx`) already
 * catch and report PSD import failures to the user, so no fallback is
 * attempted here — a silent partial import would be worse than a clear
 * failure.
 */
export const parsePsdAsObject = async (
  file: File,
  startTime: number,
  projectWidth: number = 1280,
  projectHeight: number = 720
): Promise<PsdParseResult> => {
  const filePath = (file as File & { path?: string }).path;

  if (
    !filePath
    || typeof window === 'undefined'
    || typeof window.ipcRenderer?.invoke !== 'function'
  ) {
    throw new Error(
      'PSDファイルの読み込みには Rust バックエンドへの接続が必要です（Electron 環境でのみ利用できます）。'
    );
  }

  try {
    return await parsePsdMetaViaRust(
      filePath,
      file.name,
      startTime,
      projectWidth,
      projectHeight,
      file,
      defaultPsdMetaRpcBridge()
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`PSDファイルの解析に失敗しました: ${detail}`);
  }
};
