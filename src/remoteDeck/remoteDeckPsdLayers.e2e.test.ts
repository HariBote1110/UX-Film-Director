/**
 * Remote deck PSD layer operation E2E (実 PSD 全数検証).
 *
 * 葵ちゃん.psd のレイヤー構造を `psd.parseMeta` の RPC 応答形式（`RustPsdMetaNode[]`）
 * に変換したフィクスチャを `parsePsdMetaFromPath` の注入 `bridge` 経由で流し込み、
 * import フロー本番と同じツリー構築コード（`parsePsdMetaViaRust` /
 * `buildNodeFromRustMeta`、`src/utils/psdParser.ts`）を通す。そのうえで
 * リモートデッキと同じ経路（CommandBus → property.set → useStore）で
 * デッキに表示される全操作可能ノードを1つずつタップ相当実行し、
 * store の activeLayerIds が期待どおり変化することを全数検証する。
 * 「スマホに表示されるのに操作できないレイヤー」を機械的に検出するのが目的。
 *
 * R5-4 リワーク: ag-psd 経由の `parsePsdArrayBufferAsObject`（削除済み）で
 * 実 PSD バイト列を解析していた旧版から、meta-only 経路へ移行した。
 * フィクスチャは R5-3 で作った ag-psd 由来パリティベースライン
 * （`rust-backend/tests/fixtures/psd-parity/aoi-chan-agpsd-baseline.json`）を
 * 再利用する。このフィクスチャの `ownGroupId`/`parentGroupId`/`order` は
 * Rust 側 `handle_psd_parse_meta`（`rust-backend/src/media.rs`）が実際に
 * 組み立てる `psdId`（グループは own_group_id、リーフはフラット配列の
 * グローバル添字）/`parentPsdId`（parent_group_id）と同じ名前空間なので、
 * 素直に対応させられる（`docs/progress/rust-source-of-truth-r5-psd-unification.md`
 * の R5-3 節参照）。実バイト列のデコードやピクセル読み込みはもう関わらない
 * （meta-only 経路はそもそも textureSource を持たない）ため、旧版にあった
 * ag-psd 用 Node canvas/DOM モックは不要になった。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useStore } from '../store/useStore';
import { createCommandBus } from '../commands/commandBus';
import { registerAppCommands } from '../commands/registerAppCommands';
import { parsePsdMetaFromPath, type PsdMetaRpcBridge } from '../utils/psdParser';
import {
  deriveRemoteDeckContext,
  type RemoteDeckPsdLayerNode,
} from './remoteDeckSelectionContext';
import type { PsdLayerNode, PsdObject } from '../types';

const BASELINE_PATH = join(
  process.cwd(),
  'rust-backend/tests/fixtures/psd-parity/aoi-chan-agpsd-baseline.json',
);

type BaselineNode = {
  name: string;
  top: number;
  left: number;
  width: number;
  height: number;
  visible: boolean;
  isGroup: boolean;
  ownGroupId: number | null;
  parentGroupId: number | null;
  order: number;
};

type Baseline = {
  docWidth: number;
  docHeight: number;
  nodeCount: number;
  nodes: BaselineNode[];
};

/**
 * ag-psd パリティベースライン（`ownGroupId`/`parentGroupId`/`order`、
 * sibling-relative）を `psd.parseMeta` RPC が実際に返す `RustPsdMetaNode[]`
 * 形式（`psdId`/`parentPsdId`、リーフの `psdId` はフラット配列の
 * グローバル添字）に変換する。`rust-backend/src/media.rs` の
 * `handle_psd_parse_meta` と同じ採番規則: グループの `psdId` は
 * `ownGroupId`、リーフの `psdId` はフラット配列内での位置（`order` ではなく
 * 全体通し番号）。`order` フィールドは兄弟内の相対順として素通しする
 * （`parsePsdMetaViaRust` は親ごとにこの値でソートするだけなので、
 * ベースラインの sibling-relative な値のままで正しい）。
 */
const toRustPsdMetaNodes = (nodes: BaselineNode[]) =>
  nodes.map((node, index) => ({
    psdId: node.isGroup ? (node.ownGroupId ?? index) : index,
    parentPsdId: node.parentGroupId,
    isGroup: node.isGroup,
    name: node.name,
    width: node.width,
    height: node.height,
    top: node.top,
    left: node.left,
    defaultVisible: node.visible,
    order: node.order,
  }));

const flattenDeckNodes = (
  nodes: RemoteDeckPsdLayerNode[],
): RemoteDeckPsdLayerNode[] =>
  nodes.flatMap((node) => [node, ...flattenDeckNodes(node.children)]);

describe('remote deck PSD layer operations (葵ちゃん.psd, psd.parseMeta path)', () => {
  let psdObject: PsdObject;

  const baseline: Baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));

  const fixtureBridge: PsdMetaRpcBridge = {
    invoke: async () => ({
      success: true,
      width: baseline.docWidth,
      height: baseline.docHeight,
      nodes: toRustPsdMetaNodes(baseline.nodes),
    }),
  };

  const seedPsdObject = async () => {
    const result = await parsePsdMetaFromPath(
      '/fixtures/葵ちゃん.psd',
      '葵ちゃん.psd',
      0,
      1280,
      720,
      fixtureBridge,
    );
    psdObject = result.psdObject;
  };

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

  it('shows every store-side layer node on the deck tree', async () => {
    await seedPsdObject();
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

  it('every tappable deck node responds to property.set psdLayer as per PSDTool semantics', async () => {
    await seedPsdObject();
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

  it('switches hair styles by selecting a radio GROUP without wiping its interior', async () => {
    await seedPsdObject();
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

  it('radio leaves under a plain group are mutually exclusive (arm variants)', async () => {
    await seedPsdObject();
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

  it('exposes radio sibling sets as enum properties (arm / hair switching)', async () => {
    await seedPsdObject();
    seedStore();
    const context = deriveRemoteDeckContext(useStore.getState());
    const enums = context.properties.filter((p) => p.kind === 'enum');
    const armEnum = enums.find((p) => p.kind === 'enum' && p.options.some((o) => o.label.includes('袖')));
    expect(armEnum).toBeDefined();
    const hairEnum = enums.find((p) => p.kind === 'enum' && p.options.some((o) => o.label.includes('髪 ロング')));
    expect(hairEnum).toBeDefined();
  });

  it('deck tree visibility mirrors store activeLayerIds after a toggle round-trip', async () => {
    await seedPsdObject();
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
