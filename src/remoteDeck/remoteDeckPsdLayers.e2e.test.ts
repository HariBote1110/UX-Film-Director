/**
 * Remote deck PSD layer operation E2E (実 PSD 全数検証).
 *
 * 実ファイル 葵ちゃん.psd を parsePsdArrayBufferAsObject で読み込み、
 * リモートデッキと同じ経路（CommandBus → property.set → useStore）で
 * デッキに表示される全操作可能ノードを1つずつタップ相当実行し、
 * store の activeLayerIds が期待どおり変化することを全数検証する。
 * 「スマホに表示されるのに操作できないレイヤー」を機械的に検出するのが目的。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { initializeCanvas } from 'ag-psd';
import { useStore } from '../store/useStore';
import { createCommandBus } from '../commands/commandBus';
import { registerAppCommands } from '../commands/registerAppCommands';
import {
  deriveRemoteDeckContext,
  type RemoteDeckPsdLayerNode,
} from './remoteDeckSelectionContext';
import type { PsdLayerNode, PsdObject } from '../types';

const PSD_PATH = join(process.cwd(), '葵ちゃん.psd');

/** ag-psd を Node 環境で動かすための最小 DOM/Canvas モック（psdParser.perf.test.ts と同型）。 */
const installNodePsdMocks = (): void => {
  initializeCanvas(
    (w, h) =>
      ({
        width: w,
        height: h,
        getContext: () => ({
          createImageData: (w2: number, h2: number) => ({
            data: new Uint8ClampedArray(w2 * h2 * 4),
            width: w2,
            height: h2,
          }),
          putImageData: () => {},
        }),
      }) as unknown as HTMLCanvasElement,
    (w, h) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
      colorSpace: 'srgb' as PredefinedColorSpace,
    }),
  );
  let blobCounter = 0;
  (globalThis as unknown as { URL: unknown }).URL = {
    createObjectURL: () => `blob:mock-${blobCounter++}`,
  };
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ putImageData: () => {} }),
      toBlob: (cb: (blob: Blob | null) => void) => {
        queueMicrotask(() => cb(new Blob([new Uint8Array([1])])));
      },
    }),
  };
  (globalThis as unknown as { ImageData: unknown }).ImageData = class {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(a: Uint8ClampedArray | number, b: number, c?: number) {
      if (typeof a === 'number') {
        this.width = a;
        this.height = b;
        this.data = new Uint8ClampedArray(a * b * 4);
      } else {
        this.data = a;
        this.width = b;
        this.height = c ?? 0;
      }
    }
  };
  globalThis.createImageBitmap = (async (image: ImageBitmapSource) =>
    image) as typeof createImageBitmap;
};

const flattenDeckNodes = (
  nodes: RemoteDeckPsdLayerNode[],
): RemoteDeckPsdLayerNode[] =>
  nodes.flatMap((node) => [node, ...flattenDeckNodes(node.children)]);

const findPath = (
  node: PsdLayerNode,
  targetId: string,
  path: PsdLayerNode[] = [],
): PsdLayerNode[] | null => {
  const next = [...path, node];
  if (node.id === targetId) return next;
  for (const child of node.children) {
    const found = findPath(child, targetId, next);
    if (found) return found;
  }
  return null;
};

describe('remote deck PSD layer operations (葵ちゃん.psd)', () => {
  let psdObject: PsdObject;

  beforeAll(async () => {
    installNodePsdMocks();
    const { parsePsdArrayBufferAsObject } = await import('../utils/psdParser');
    const buf = readFileSync(PSD_PATH);
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const result = await parsePsdArrayBufferAsObject(arrayBuffer, '葵ちゃん.psd', 0, 1280, 720);
    psdObject = result.psdObject;
  }, 120_000);

  const seedStore = () => {
    useStore.getState().initializeProject({
      width: 1920,
      height: 1080,
      fps: 60,
      sampleRate: 48_000,
    });
    useStore.setState({
      objects: [psdObject as never],
      selectedId: psdObject.id,
      selectedIds: [psdObject.id],
    });
    const bus = createCommandBus();
    registerAppCommands(bus, useStore);
    return bus;
  };

  it('shows every store-side layer node on the deck tree', () => {
    seedStore();
    const context = deriveRemoteDeckContext(useStore.getState());
    expect(context.psdLayerTree).toBeDefined();
    const deckIds = new Set(flattenDeckNodes(context.psdLayerTree!).map((node) => node.id));

    const missing: string[] = [];
    const walk = (node: PsdLayerNode) => {
      if (!deckIds.has(node.id)) missing.push(`${node.id}:${node.name}`);
      node.children.forEach(walk);
    };
    psdObject.rootLayer!.children.forEach(walk);
    expect(missing).toEqual([]);
  });

  it('every tappable deck node responds to property.set psdLayer as per PSDTool semantics', () => {
    const bus = seedStore();
    const failures: string[] = [];

    const context = deriveRemoteDeckContext(useStore.getState());
    // タップ可能 = 非グループ（通常/ラジオのレイヤー）+ ラジオ項目グループ
    const tappable = flattenDeckNodes(context.psdLayerTree!).filter(
      (node) => !node.isGroup || node.isRadio,
    );
    expect(tappable.length).toBeGreaterThan(100);

    for (const node of tappable) {
      const current = useStore.getState().objects[0] as PsdObject;
      const before = current.activeLayerIds![node.id] === true;

      bus.execute('property.set', {
        objectId: psdObject.id,
        propertyKey: 'psdLayer',
        value: node.id,
      });

      const after =
        (useStore.getState().objects[0] as PsdObject).activeLayerIds![node.id] === true;

      if (node.isRadio) {
        // ラジオ項目は選択専用: タップで必ず ON（ON のままも正）
        if (!after) failures.push(`radio-not-activated ${node.id}:${node.label}`);
      } else if (after === before) {
        // 通常レイヤーは必ず反転する
        failures.push(`toggle-noop ${node.id}:${node.label} (before=${before})`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('switches hair styles by selecting a radio GROUP without wiping its interior', () => {
    const bus = seedStore();
    const root = psdObject.rootLayer!;
    const findByName = (node: PsdLayerNode, pattern: string): PsdLayerNode | null => {
      if (node.name.includes(pattern)) return node;
      for (const child of node.children) {
        const found = findByName(child, pattern);
        if (found) return found;
      }
      return null;
    };
    const short = findByName(root, '髪 ショート')!;
    const long = findByName(root, '髪 ロング')!;
    expect(short.isGroup && short.isRadio).toBe(true);
    expect(long.isGroup && long.isRadio).toBe(true);

    bus.execute('property.set', { objectId: psdObject.id, propertyKey: 'psdLayer', value: long.id });
    let active = (useStore.getState().objects[0] as PsdObject).activeLayerIds!;
    expect(active[long.id]).toBe(true);
    expect(active[short.id]).toBe(false);
    // 非選択側の内部状態（色/線画）は保持され、再選択で復元される
    for (const child of short.children) {
      expect(active[child.id]).toBe(true);
    }

    bus.execute('property.set', { objectId: psdObject.id, propertyKey: 'psdLayer', value: short.id });
    active = (useStore.getState().objects[0] as PsdObject).activeLayerIds!;
    expect(active[short.id]).toBe(true);
    expect(active[long.id]).toBe(false);
  });

  it('radio leaves under a plain group are mutually exclusive (arm variants)', () => {
    const bus = seedStore();
    const root = psdObject.rootLayer!;
    const arm = ((): PsdLayerNode => {
      const walk = (node: PsdLayerNode): PsdLayerNode | null => {
        if (node.isGroup && node.name === '左腕') return node;
        for (const child of node.children) {
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      return walk(root)!;
    })();
    const radioLeaves = arm.children.filter((child) => !child.isGroup && child.isRadio);
    expect(radioLeaves.length).toBeGreaterThanOrEqual(2);
    const [first, second] = radioLeaves;

    bus.execute('property.set', { objectId: psdObject.id, propertyKey: 'psdLayer', value: first.id });
    bus.execute('property.set', { objectId: psdObject.id, propertyKey: 'psdLayer', value: second.id });

    const active = (useStore.getState().objects[0] as PsdObject).activeLayerIds!;
    expect(active[second.id]).toBe(true);
    expect(active[first.id]).toBe(false);
  });

  it('exposes radio sibling sets as enum properties (arm / hair switching)', () => {
    seedStore();
    const context = deriveRemoteDeckContext(useStore.getState());
    const enums = context.properties.filter((p) => p.kind === 'enum');
    const armEnum = enums.find((p) => p.kind === 'enum' && p.options.some((o) => o.label.includes('袖')));
    expect(armEnum).toBeDefined();
    const hairEnum = enums.find((p) => p.kind === 'enum' && p.options.some((o) => o.label.includes('髪 ロング')));
    expect(hairEnum).toBeDefined();
  });

  it('deck tree visibility mirrors store activeLayerIds after a toggle round-trip', () => {
    const bus = seedStore();
    const context = deriveRemoteDeckContext(useStore.getState());
    const target = flattenDeckNodes(context.psdLayerTree!).find(
      (node) => !node.isGroup && node.visible,
    )!;

    bus.execute('property.set', {
      objectId: psdObject.id,
      propertyKey: 'psdLayer',
      value: target.id,
    });

    const nextContext = deriveRemoteDeckContext(useStore.getState());
    const nextNode = flattenDeckNodes(nextContext.psdLayerTree!).find(
      (node) => node.id === target.id,
    )!;
    const active =
      (useStore.getState().objects[0] as PsdObject).activeLayerIds![target.id] === true;
    expect(nextNode.visible).toBe(active);
  });
});
