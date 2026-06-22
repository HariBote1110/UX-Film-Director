import type { StoreApi } from 'zustand';
import type { AppState } from '../storeTypes';

type SelectionSlice = Pick<
  AppState,
  | 'selectedId'
  | 'selectedIds'
  | 'selectObject'
  | 'toggleObjectSelection'
  | 'selectObjects'
  | 'clearSelection'
>;

type SetState = StoreApi<AppState>['setState'];

export const createSelectionSlice = (set: SetState): SelectionSlice => ({
  selectedId: null,
  selectedIds: [],

  selectObject: (id) => set((state) => {
    if (id === null) {
      if (state.selectedId === null && state.selectedIds.length === 0) return {};
      return { selectedId: null, selectedIds: [] };
    }

    if (state.selectedId === id && state.selectedIds.length === 1 && state.selectedIds[0] === id) {
      return {};
    }

    return { selectedId: id, selectedIds: [id] };
  }),

  toggleObjectSelection: (id) => set((state) => {
    const exists = state.selectedIds.includes(id);
    if (exists) {
      const nextSelectedIds = state.selectedIds.filter((selectedId) => selectedId !== id);
      const lastSelectedId = nextSelectedIds.length > 0 ? nextSelectedIds[nextSelectedIds.length - 1] : null;
      return {
        selectedIds: nextSelectedIds,
        selectedId: state.selectedId === id ? lastSelectedId : state.selectedId
      };
    }

    return {
      selectedIds: [...state.selectedIds, id],
      selectedId: id
    };
  }),

  selectObjects: (ids, primaryId = null) => set((state) => {
    const uniqueIds = ids.filter((id, index, array) => array.indexOf(id) === index);
    const existingIdSet = new Set(state.objects.map((obj) => obj.id));
    const nextSelectedIds = uniqueIds.filter((id) => existingIdSet.has(id));

    if (nextSelectedIds.length === 0) {
      return { selectedId: null, selectedIds: [] };
    }

    const fallbackSelectedId = nextSelectedIds[nextSelectedIds.length - 1];
    const nextSelectedId = primaryId && nextSelectedIds.includes(primaryId)
      ? primaryId
      : fallbackSelectedId;

    return {
      selectedId: nextSelectedId,
      selectedIds: nextSelectedIds
    };
  }),

  clearSelection: () => set((state) => {
    if (state.selectedId === null && state.selectedIds.length === 0) return {};
    return { selectedId: null, selectedIds: [] };
  }),
});
