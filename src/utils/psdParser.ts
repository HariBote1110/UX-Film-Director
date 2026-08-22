import { PsdLayerNode, PsdLayerStruct, PsdObject, TimelineObject } from '../types';
import { psdLayerTextureUrl } from './psdTextureUrl';

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
