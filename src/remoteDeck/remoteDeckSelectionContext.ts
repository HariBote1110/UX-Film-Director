import type { PsdLayerNode, TimelineObject } from '../types';

/**
 * Context-sensitive property surface (Remote_Control_Deck_Plan.md Phase 4).
 * Derives, from the store's selection state, the set of properties the
 * mobile deck can edit for the currently selected object — analogous to how
 * the MacBook Pro TouchBar swaps its controls per context.
 */

export interface RemoteDeckNumberProperty {
  key: string;
  label: string;
  kind: 'number';
  value: number;
  min: number;
  max: number;
  step: number;
}

export interface RemoteDeckEnumProperty {
  key: string;
  label: string;
  kind: 'enum';
  value: string | null;
  options: Array<{ value: string; label: string }>;
}

export type RemoteDeckProperty = RemoteDeckNumberProperty | RemoteDeckEnumProperty;

/** Serialisable PSD layer tree node for the deck UI (no GPU fields). */
export interface RemoteDeckPsdLayerNode {
  id: string;
  label: string;
  isGroup: boolean;
  isRadio: boolean;
  visible: boolean;
  children: RemoteDeckPsdLayerNode[];
}

export interface RemoteDeckSelectionContext {
  objectId: string | null;
  objectType: string | null;
  properties: RemoteDeckProperty[];
  /** Present only for PSD objects with layer data. */
  psdLayerTree?: RemoteDeckPsdLayerNode[];
}

export const EMPTY_REMOTE_DECK_CONTEXT: RemoteDeckSelectionContext = {
  objectId: null,
  objectType: null,
  properties: [],
};

/** Hard cap on serialised PSD layer tree nodes (huge PSDs stay compact). */
export const PSD_LAYER_TREE_NODE_LIMIT = 200;

interface SelectionStateLike {
  selectedId: string | null;
  objects: TimelineObject[];
}

/** PSD layer group names may carry a leading '*' marker (PSDTool convention). */
const stripNameMarker = (name: string): string => (name.startsWith('*') ? name.slice(1) : name);

/**
 * Collects one enum property per radio group in the PSD layer tree
 * (expression / 差分 switching). Options are the group's non-group children;
 * the current value is the first active option.
 */
const collectPsdRadioProperties = (
  node: PsdLayerNode,
  activeLayerIds: Record<string, boolean>,
  out: RemoteDeckEnumProperty[],
): void => {
  if (node.isGroup && node.isRadio) {
    const options = node.children
      .filter((child) => !child.isGroup)
      .map((child) => ({ value: child.id, label: stripNameMarker(child.name) }));
    if (options.length > 0) {
      const active = options.find((option) => activeLayerIds[option.value] === true);
      out.push({
        key: `psdRadio:${node.id}`,
        label: stripNameMarker(node.name),
        kind: 'enum',
        value: active?.value ?? null,
        options,
      });
    }
  }
  node.children.forEach((child) => collectPsdRadioProperties(child, activeLayerIds, out));
};

const buildPsdTreeNodes = (
  nodes: PsdLayerNode[],
  activeLayerIds: Record<string, boolean>,
  maxDepth: number,
  depth = 0,
): RemoteDeckPsdLayerNode[] =>
  nodes.map((node) => ({
    id: node.id,
    label: stripNameMarker(node.name),
    isGroup: node.isGroup,
    isRadio: node.isRadio,
    visible: activeLayerIds[node.id] === true,
    children:
      depth + 1 < maxDepth
        ? buildPsdTreeNodes(node.children, activeLayerIds, maxDepth, depth + 1)
        : [],
  }));

const countTreeNodes = (nodes: RemoteDeckPsdLayerNode[]): number =>
  nodes.reduce((sum, node) => sum + 1 + countTreeNodes(node.children), 0);

/**
 * Serialises the PSD layer tree, reducing depth until the node count fits
 * under PSD_LAYER_TREE_NODE_LIMIT (top-level entries always survive).
 */
export const buildRemoteDeckPsdLayerTree = (
  rootLayer: PsdLayerNode,
  activeLayerIds: Record<string, boolean>,
  nodeLimit = PSD_LAYER_TREE_NODE_LIMIT,
): RemoteDeckPsdLayerNode[] => {
  for (let maxDepth = 8; maxDepth >= 1; maxDepth -= 1) {
    const tree = buildPsdTreeNodes(rootLayer.children, activeLayerIds, maxDepth);
    if (countTreeNodes(tree) <= nodeLimit) return tree;
  }
  return buildPsdTreeNodes(rootLayer.children, activeLayerIds, 1).slice(0, nodeLimit);
};

const numberProperty = (
  key: string,
  label: string,
  value: unknown,
  min: number,
  max: number,
  step: number,
): RemoteDeckNumberProperty | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? { key, label, kind: 'number', value, min, max, step }
    : null;

/** Common transform surface shared by every visual object type. */
const collectTransformProperties = (object: TimelineObject): RemoteDeckNumberProperty[] => {
  const candidates = [
    numberProperty('x', 'X', object.x, -8000, 8000, 1),
    numberProperty('y', 'Y', object.y, -8000, 8000, 1),
    numberProperty('rotation', '回転', object.rotation, -180, 180, 1),
    numberProperty('opacity', '不透明度', object.opacity, 0, 1, 0.01),
  ];
  return candidates.filter((property): property is RemoteDeckNumberProperty => property !== null);
};

const volumeProperty = (value: unknown): RemoteDeckNumberProperty => ({
  key: 'volume',
  label: '音量',
  kind: 'number',
  value: typeof value === 'number' && Number.isFinite(value) ? value : 1,
  min: 0,
  max: 1,
  step: 0.01,
});

export const deriveRemoteDeckContext = (
  state: SelectionStateLike,
): RemoteDeckSelectionContext => {
  if (state.selectedId === null) return EMPTY_REMOTE_DECK_CONTEXT;
  const selected = state.objects.find((object) => object.id === state.selectedId);
  if (!selected) return EMPTY_REMOTE_DECK_CONTEXT;

  const properties: RemoteDeckProperty[] = [];
  let psdLayerTree: RemoteDeckPsdLayerNode[] | undefined;

  if (selected.type === 'psd') {
    properties.push({
      key: 'scale',
      label: 'スケール',
      kind: 'number',
      value: typeof selected.scale === 'number' ? selected.scale : 1,
      min: 0.1,
      max: 10,
      step: 0.01,
    });
    properties.push(...collectTransformProperties(selected));
    if (selected.rootLayer && selected.activeLayerIds) {
      const radios: RemoteDeckEnumProperty[] = [];
      collectPsdRadioProperties(selected.rootLayer, selected.activeLayerIds, radios);
      properties.push(...radios);
      psdLayerTree = buildRemoteDeckPsdLayerTree(selected.rootLayer, selected.activeLayerIds);
    }
  } else if (selected.type === 'audio') {
    // Audio has no meaningful visual transform: volume only.
    properties.push(volumeProperty(selected.volume));
  } else {
    if (selected.type === 'video') {
      properties.push(volumeProperty(selected.volume));
    }
    properties.push(...collectTransformProperties(selected));
    const scaleX = numberProperty('scaleX', 'スケールX', (selected as { scaleX?: unknown }).scaleX, 0.1, 10, 0.01);
    const scaleY = numberProperty('scaleY', 'スケールY', (selected as { scaleY?: unknown }).scaleY, 0.1, 10, 0.01);
    if (scaleX) properties.push(scaleX);
    if (scaleY) properties.push(scaleY);
  }

  return {
    objectId: selected.id,
    objectType: selected.type,
    properties,
    ...(psdLayerTree ? { psdLayerTree } : {}),
  };
};
