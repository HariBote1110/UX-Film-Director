import { readPsd, Layer } from 'ag-psd';
import { TimelineObject } from '../types';

export interface PsdImportResult {
  objects: TimelineObject[];
  width: number;
  height: number;
}

const canvasToUrl = (canvas: HTMLCanvasElement): Promise<string> => {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(URL.createObjectURL(blob));
      } else {
        resolve('');
      }
    }, 'image/png');
  });
};

export const parsePsd = async (file: File, startTime: number): Promise<PsdImportResult> => {
  const arrayBuffer = await file.arrayBuffer();
  
  const psd = readPsd(arrayBuffer, {
    skipLayerImageData: false,
    useImageData: true,
  });

  console.log("PSD Loaded Info:", psd);

  const importedObjects: TimelineObject[] = [];
  const flattenLayers: { layer: Layer; left: number; top: number }[] = [];

  const traverse = (children: Layer[] | undefined, offsetX: number, offsetY: number) => {
    if (!children) return;
    
    for (let i = children.length - 1; i >= 0; i--) {
      const layer = children[i];
      
      if (layer.children) {
        traverse(layer.children, offsetX + (layer.left || 0), offsetY + (layer.top || 0));
        continue;
      }

      // --- 修正箇所: 非表示レイヤーも読み込むように変更 ---
      // if (layer.hidden) {
      //   console.log(`Skipping hidden layer: ${layer.name}`);
      //   continue;
      // }

      if (!layer.canvas && !layer.imageData) {
        console.log(`Skipping empty layer: ${layer.name}`);
        continue;
      }

      flattenLayers.push({
        layer,
        left: offsetX + (layer.left || 0),
        top: offsetY + (layer.top || 0)
      });
    }
  };

  if (psd.children && psd.children.length > 0) {
    traverse(psd.children, 0, 0);
  } else if (psd.imageData) {
    flattenLayers.push({
        layer: psd as unknown as Layer,
        left: 0,
        top: 0
    });
  }

  console.log(`Found ${flattenLayers.length} valid layers to import (Hidden layers included)`);

  for (let i = 0; i < flattenLayers.length; i++) {
    const { layer, left, top } = flattenLayers[i];
    let src = '';

    try {
        if (layer.canvas) {
          src = await canvasToUrl(layer.canvas as HTMLCanvasElement);
        } else if (layer.imageData) {
            const width = layer.width || 0;
            const height = layer.height || 0;
            
            if (width > 0 && height > 0) {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const imageData = new ImageData(layer.imageData, width, height);
                    ctx.putImageData(imageData, 0, 0);
                    src = await canvasToUrl(canvas);
                }
            }
        }
    } catch (e) {
        console.error(`Failed to convert layer ${layer.name} to image`, e);
    }

    if (src) {
      const newObj: TimelineObject = {
        id: crypto.randomUUID(),
        type: 'image',
        name: layer.name || `Layer ${i}`,
        layer: i,
        startTime: startTime,
        duration: 5,
        x: left,
        y: top,
        width: layer.width || 0,
        height: layer.height || 0,
        src: src,
        enableAnimation: false,
        endX: left,
        endY: top,
        easing: 'linear',
        offset: 0
      };
      importedObjects.push(newObj);
    }
  }

  return {
    objects: importedObjects,
    width: psd.width,
    height: psd.height
  };
};