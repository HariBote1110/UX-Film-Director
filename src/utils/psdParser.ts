import { readPsd, Layer } from 'ag-psd';
import { PsdLayerNode, PsdObject, TimelineObject } from '../types';

// キャンバス -> BlobURL
const canvasToUrl = (canvas: HTMLCanvasElement): Promise<string> => {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : '');
    }, 'image/png');
  });
};

// PSD読み込み結果
export interface PsdParseResult {
  psdObject: PsdObject;
}

export const parsePsdAsObject = async (file: File, startTime: number): Promise<PsdParseResult> => {
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
    const currentNode: PsdLayerNode = {
      id: generateId(),
      name: layer.name || 'Layer',
      isGroup: !!layer.children,
      isRadio: (layer.name || '').startsWith('*'), // PSDTool仕様: *はラジオグループ
      children: [],
      width: layer.width || 0,
      height: layer.height || 0,
      left: layer.left || 0, // 絶対座標をそのまま使用
      top: layer.top || 0,   // 絶対座標をそのまま使用
      defaultVisible: !layer.hidden,
      src: undefined
    };

    // 画像データの変換
    if (!currentNode.isGroup) {
      try {
        if (layer.canvas) {
          currentNode.src = await canvasToUrl(layer.canvas as HTMLCanvasElement);
        } else if (layer.imageData && layer.width && layer.height) {
          const cvs = document.createElement('canvas');
          cvs.width = layer.width;
          cvs.height = layer.height;
          const ctx = cvs.getContext('2d');
          if (ctx) {
            const imgData = new ImageData(layer.imageData, layer.width, layer.height);
            ctx.putImageData(imgData, 0, 0);
            currentNode.src = await canvasToUrl(cvs);
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
        const activeChild = node.children.find(child => activeLayerIds[child.id]);

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
    x: 640 - (psd.width / 2),
    y: 360 - (psd.height / 2),
    width: psd.width,
    height: psd.height,
    scale: 1.0,
    enableAnimation: false,
    endX: 640 - (psd.width / 2),
    endY: 360 - (psd.height / 2),
    easing: 'linear',
    offset: 0,
    rootLayer: rootNode,
    activeLayerIds: activeLayerIds
  };

  return { psdObject: psdObject as PsdObject };
};