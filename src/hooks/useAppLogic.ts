import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { shallow } from 'zustand/shallow';
import { commandBus } from '../commands/commandBus';
import { registerAppCommands } from '../commands/registerAppCommands';
import { resolveKeyCommand } from './keyCommandResolver';

export const useAppLogic = () => {
  const {
    isPlaying,
    advanceTime,
    selectedIds,
    copySelectedObjects,
    cutSelectedObjects,
    pasteClipboardObjects,
    duplicateSelectedObjects,
    groupSelectedObjects,
    ungroupSelectedObjects,
  } = useStore((state) => ({
    isPlaying: state.isPlaying,
    advanceTime: state.advanceTime,
    selectedIds: state.selectedIds,
    copySelectedObjects: state.copySelectedObjects,
    cutSelectedObjects: state.cutSelectedObjects,
    pasteClipboardObjects: state.pasteClipboardObjects,
    duplicateSelectedObjects: state.duplicateSelectedObjects,
    groupSelectedObjects: state.groupSelectedObjects,
    ungroupSelectedObjects: state.ungroupSelectedObjects,
  }), shallow);

  // --- 0. CommandBus wiring (registered once; handlers read live store state) ---
  useEffect(() => {
    registerAppCommands(commandBus, useStore);
  }, []);

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

      // Commands routed through the CommandBus (Remote_Control_Deck_Plan.md Phase 1)
      const resolution = resolveKeyCommand(e, { hasSelection: selectedIds.length > 0 });
      if (resolution) {
        if (resolution.preventDefault) {
          e.preventDefault();
        }
        commandBus.execute(resolution.id, resolution.payload);
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

    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedIds,
    copySelectedObjects,
    cutSelectedObjects,
    pasteClipboardObjects,
    duplicateSelectedObjects,
    groupSelectedObjects,
    ungroupSelectedObjects,
  ]);
};
