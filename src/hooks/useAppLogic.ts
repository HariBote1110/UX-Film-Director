import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

export const useAppLogic = () => {
  const { 
    isPlaying, 
    togglePlay, 
    advanceTime, 
    selectedId, 
    deleteObject, 
    selectObject 
  } = useStore();

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

      switch (e.code) {
        case 'Space':
          e.preventDefault(); // Prevent scrolling
          togglePlay();
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedId) {
            deleteObject(selectedId);
          }
          break;
        case 'Escape':
          selectObject(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, togglePlay, deleteObject, selectObject]);
};