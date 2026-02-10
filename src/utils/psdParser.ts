import { readPsd, Layer } from 'ag-psd';
import { PsdLayerNode, PsdLayerStruct, PsdObject, TimelineObject } from '../types';

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

// キャンバス -> BlobURL
const canvasToUrl = (canvas: HTMLCanvasElement): Promise<string> => {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : '');
    }, 'image/png');
  });
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
    for (let i = 0; i < source.length; i++) {
      result[i] = Math.max(0, Math.min(255, Math.round(source[i] / 257)));
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
    data = normalisePixelArray(imageDataLike.data);
    width = imageDataLike.width > 0 ? imageDataLike.width : fallbackWidth;
    height = imageDataLike.height > 0 ? imageDataLike.height : fallbackHeight;
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

export const togglePsdLayer = (
  rootNode: PsdLayerNode,
  currentActiveLayerIds: Record<string, boolean>,
  targetLayerId: string
): Record<string, boolean> => {
  const path = findNodePath(rootNode, targetLayerId);
  if (!path) return currentActiveLayerIds;

  const targetNode = path[path.length - 1];
  if (targetNode.isGroup) return currentActiveLayerIds;

  const parentNode = path.length >= 2 ? path[path.length - 2] : null;
  const nextActiveLayerIds = { ...currentActiveLayerIds };

  // ターゲットに到達する経路上のグループは常に表示する。
  path.forEach((node) => {
    if (node.isGroup) {
      nextActiveLayerIds[node.id] = true;
    }
  });

  if (parentNode?.isRadio) {
    parentNode.children
      .filter((child) => !child.isGroup)
      .forEach((child) => {
        nextActiveLayerIds[child.id] = false;
      });

    nextActiveLayerIds[targetLayerId] = true;
  } else {
    nextActiveLayerIds[targetLayerId] = !Boolean(nextActiveLayerIds[targetLayerId]);
  }

  nextActiveLayerIds[rootNode.id] = true;
  return nextActiveLayerIds;
};

export const parsePsdAsObject = async (
  file: File,
  startTime: number,
  projectWidth: number = 1280,
  projectHeight: number = 720
): Promise<PsdParseResult> => {
  const arrayBuffer = await file.arrayBuffer();
  
  // 読み込み
  const psd = readPsd(arrayBuffer, {
    skipLayerImageData: false,
    useImageData: true,
  });

  // レイヤーID生成用
  let idCounter = 0;
  const generateId = () => `psd-layer-${idCounter++}`;

  // 再帰的にノードを構築
  // 修正: offsetX, offsetY 引数を削除（ag-psdの座標は絶対座標のため）
  const buildNode = async (layer: Layer): Promise<PsdLayerNode> => {
    const layerWithBounds = layer as LayerWithBounds;
    const width = getLayerWidth(layerWithBounds);
    const height = getLayerHeight(layerWithBounds);

    const currentNode: PsdLayerNode = {
      id: generateId(),
      name: layer.name || 'Layer',
      isGroup: !!layer.children,
      isRadio: (layer.name || '').startsWith('*'), // PSDTool仕様: *はラジオグループ
      children: [],
      width,
      height,
      left: layerWithBounds.left || 0, // 絶対座標をそのまま使用
      top: layerWithBounds.top || 0,   // 絶対座標をそのまま使用
      defaultVisible: !layer.hidden,
      src: undefined
    };

    // 画像データの変換
    if (!currentNode.isGroup) {
      try {
        if (layer.canvas) {
          currentNode.src = await canvasToUrl(layer.canvas as HTMLCanvasElement);
        } else if (layerWithBounds.imageData) {
          const normalised = normaliseLayerImageData(layerWithBounds.imageData, width, height);
          if (normalised) {
            const cvs = document.createElement('canvas');
            cvs.width = normalised.width;
            cvs.height = normalised.height;
            const ctx = cvs.getContext('2d');
            if (ctx) {
              const pixelData = new Uint8ClampedArray(normalised.data.length);
              pixelData.set(normalised.data);
              const imgData = new ImageData(pixelData, normalised.width, normalised.height);
              ctx.putImageData(imgData, 0, 0);
              currentNode.src = await canvasToUrl(cvs);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to convert layer image', e);
      }
    }

    // 子要素の処理
    if (layer.children) {
      // 描画順序（奥→手前）にするため reverse()
      const children = [...layer.children].reverse();
      for (const child of children) {
        // 修正: 座標オフセットを渡さない
        const childNode = await buildNode(child);
        currentNode.children.push(childNode);
      }
    }

    return currentNode;
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
    const children = [...psd.children].reverse();
    for (const child of children) {
      // 修正: 座標オフセットを渡さない
      rootNode.children.push(await buildNode(child));
    }
  } else if (psd.imageData) {
    const layer = psd as unknown as Layer;
    // 修正: 座標オフセットを渡さない
    rootNode.children.push(await buildNode(layer));
  }

  // 初期表示状態の計算
  const activeLayerIds: Record<string, boolean> = {};
  
  // 再帰的に初期化
  // ラジオグループ内の初期選択ロジックを強化
  const initVisibility = (node: PsdLayerNode) => {
    // グループの場合、子要素をチェック
    if (node.isGroup) {
      // ラジオグループの場合の特別処理
      if (node.isRadio) {
        // まず子要素の初期化を呼び出す
        node.children.forEach(initVisibility);

        // このラジオグループの中で、現在アクティブになっている子を探す
        const activeChild = node.children.find((child) => activeLayerIds[child.id]);

        // もしアクティブな子が一つもなければ、強制的に「一番下（配列の先頭＝リストの一番上）」の子をアクティブにする
        // ※ node.children は reverse() 済みで [奥...手前] の順だが、
        //   UIのリスト上では逆順表示されることが多い。
        //   ここでは「リストの先頭にあるもの」をデフォルトにしたいので、末尾(length-1)を選ぶか、
        //   あるいは単純に「データ上の先頭」を選ぶか。
        //   通常、目パチなどは「開眼」がデフォルトで入っていることが多い。
        if (!activeChild && node.children.length > 0) {
           // データ構造上、奥にあるレイヤーから順に入っている。
           // UI的には手前のレイヤー（配列の末尾）をデフォルトにするのが自然な場合が多いが、
           // ここでは「一番奥（配列の先頭）」をデフォルトにしてみる
           // (PSDの作りによるが、とりあえずどれか一つを選択状態にする)
           const defaultChild = node.children[0];
           activeLayerIds[defaultChild.id] = true;
        }
        
        // ラジオグループ自体は常に表示扱いでOK（中身の可視性は子が制御）
        activeLayerIds[node.id] = true;

      } else {
        // 通常グループ
        // 自身の可視性を設定
        if (node.defaultVisible) {
          activeLayerIds[node.id] = true;
        }
        // 子要素へ
        node.children.forEach(initVisibility);
      }
    } else {
      // 葉ノード（レイヤー）
      if (node.defaultVisible) {
        activeLayerIds[node.id] = true;
      }
    }
  };
  
  initVisibility(rootNode);

  // ルートは常にアクティブ
  activeLayerIds['root'] = true;

  const psdObject: TimelineObject = {
    id: crypto.randomUUID(),
    type: 'psd',
    name: file.name,
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
    file: file,
    layerTree: buildPsdLayerTree(rootNode, activeLayerIds),
    rootLayer: rootNode,
    activeLayerIds: activeLayerIds
  };

  return { psdObject: psdObject as PsdObject };
};
