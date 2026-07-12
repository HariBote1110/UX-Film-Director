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

export interface RemoteDeckSelectionContext {
  objectId: string | null;
  objectType: string | null;
  properties: RemoteDeckProperty[];
}

export const EMPTY_REMOTE_DECK_CONTEXT: RemoteDeckSelectionContext = {
  objectId: null,
  objectType: null,
  properties: [],
};

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

export const deriveRemoteDeckContext = (
  state: SelectionStateLike,
): RemoteDeckSelectionContext => {
  if (state.selectedId === null) return EMPTY_REMOTE_DECK_CONTEXT;
  const selected = state.objects.find((object) => object.id === state.selectedId);
  if (!selected) return EMPTY_REMOTE_DECK_CONTEXT;

  const properties: RemoteDeckProperty[] = [];

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
    if (selected.rootLayer && selected.activeLayerIds) {
      const radios: RemoteDeckEnumProperty[] = [];
      collectPsdRadioProperties(selected.rootLayer, selected.activeLayerIds, radios);
      properties.push(...radios);
    }
  } else if (selected.type === 'audio' || selected.type === 'video') {
    properties.push({
      key: 'volume',
      label: '音量',
      kind: 'number',
      value: typeof selected.volume === 'number' ? selected.volume : 1,
      min: 0,
      max: 1,
      step: 0.01,
    });
  }

  return { objectId: selected.id, objectType: selected.type, properties };
};
