import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { shallow } from 'zustand/shallow';
import { useMediaOptimization } from './useMediaOptimization';

export const useAppLogic = () => {
  // 書き出し高速化用の中間ファイルを編集中にバックグラウンド生成する。
  useMediaOptimization();

  const { 
    isPlaying, 
    togglePlay, 
    advanceTime, 
    selectedIds,
    deleteSelectedObjects,
    clearSelection,
    copySelectedObjects,
    cutSelectedObjects,
    pasteClipboardObjects,
    duplicateSelectedObjects,
    groupSelectedObjects,
    ungroupSelectedObjects,
    undo,
    redo
  } = useStore((state) => ({
    isPlaying: state.isPlaying,
    togglePlay: state.togglePlay,
    advanceTime: state.advanceTime,
    selectedIds: state.selectedIds,
    deleteSelectedObjects: state.deleteSelectedObjects,
    clearSelection: state.clearSelection,
    copySelectedObjects: state.copySelectedObjects,
    cutSelectedObjects: state.cutSelectedObjects,
    pasteClipboardObjects: state.pasteClipboardObjects,
    duplicateSelectedObjects: state.duplicateSelectedObjects,
    groupSelectedObjects: state.groupSelectedObjects,
    ungroupSelectedObjects: state.ungroupSelectedObjects,
    undo: state.undo,
    redo: state.redo,
  }), shallow);

  // --- 1. Animation Loop (Playback Engine) ---
  const lastTimeRef = useRef<number>(0);
  const requestRef = useRef<number>();

  const animate = (time: number) => {
    if (lastTimeRef.current !== 0) {
      const deltaTime = (time - lastTimeRef.current) / 1000; // ms to seconds
      advanceTime(deltaTime);
    }
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = 0; // Reset last time to avoid huge jump
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      lastTimeRef.current = 0;
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying]); // Re-run when play state changes

  // --- 2. Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
          e.preventDefault();
          if (e.shiftKey) {
              redo();
          } else {
              undo();
          }
          return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyY') {
          e.preventDefault();
          redo();
          return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyC') {
          e.preventDefault();
          copySelectedObjects();
          return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyX') {
          e.preventDefault();
          cutSelectedObjects();
          return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyV') {
          e.preventDefault();
          pasteClipboardObjects();
          return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyD') {
          e.preventDefault();
          duplicateSelectedObjects();
          return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyG') {
          e.preventDefault();
          if (e.shiftKey) {
            ungroupSelectedObjects();
          } else {
            groupSelectedObjects();
          }
          return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault(); // Prevent scrolling
          togglePlay();
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedIds.length > 0) {
            deleteSelectedObjects();
          }
          break;
        case 'Escape':
          clearSelection();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedIds,
    togglePlay,
    deleteSelectedObjects,
    clearSelection,
    copySelectedObjects,
    cutSelectedObjects,
    pasteClipboardObjects,
    duplicateSelectedObjects,
    groupSelectedObjects,
    ungroupSelectedObjects,
    undo,
    redo
  ]);
};
