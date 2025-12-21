import { useEffect } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';

const { ipcRenderer } = window;

export const useProjectExport = (
  pixiAppRef: React.MutableRefObject<PIXI.Application | null>,
  videoElementsRef: React.MutableRefObject<Map<string, HTMLVideoElement>>,
  renderScene: (time: number, objects: TimelineObject[]) => void
) => {
  const { isExporting, setExporting, objects, setTime } = useStore();

  useEffect(() => {
    if (!isExporting) return;

    const runExport = async () => {
        const app = pixiAppRef.current;
        if (!app) return;

        const { projectSettings } = useStore.getState();
        const fps = projectSettings.fps;
        const dt = 1 / fps;
        
        // Calculate total duration
        const lastObjectEndTime = Math.max(...objects.map(o => o.startTime + o.duration), 0);
        const exportDuration = Math.max(lastObjectEndTime, 1);
        const totalFrames = Math.ceil(exportDuration * fps);

        // Pause all videos initially
        const videos = Array.from(videoElementsRef.current.values());
        videos.forEach(v => v.pause());

        // Start export process via Electron
        const result = await ipcRenderer.invoke('start-export', { 
            width: projectSettings.width, 
            height: projectSettings.height, 
            fps: fps 
        });

        if (!result.success) {
            alert("Export failed: " + result.error);
            setExporting(false);
            return;
        }

        // Frame Rendering Loop
        for (let i = 0; i < totalFrames; i++) {
            const t = i * dt;
            setTime(t);

            // Handle Video Seeking
            const activeVideos = objects.filter(obj => obj.type === 'video' && t >= obj.startTime && t < obj.startTime + obj.duration);
            if (activeVideos.length > 0) {
                const seekPromises = activeVideos.map(obj => {
                    const video = videoElementsRef.current.get(obj.id);
                    if (video && video.readyState >= 1) {
                        const offset = obj.offset || 0;
                        const targetTime = (t - obj.startTime) + offset;
                        
                        if (Math.abs(video.currentTime - targetTime) < 0.001) return Promise.resolve();

                        return new Promise<void>((resolve) => {
                            const onSeeked = () => {
                                video.removeEventListener('seeked', onSeeked);
                                resolve();
                            };
                            // Timeout fallback
                            setTimeout(() => {
                                video.removeEventListener('seeked', onSeeked);
                                resolve();
                            }, 1000);
                            video.addEventListener('seeked', onSeeked);
                            video.currentTime = targetTime;
                        });
                    }
                    return Promise.resolve();
                });
                await Promise.all(seekPromises);
            }

            // Render Frame
            renderScene(t, objects);
            
            // Wait for GPU/DOM update
            await new Promise(r => setTimeout(r, 10));
            
            // Capture and write frame
            const base64 = app.canvas.toDataURL('image/jpeg', 0.90);
            await ipcRenderer.invoke('write-frame', base64);
        }

        await ipcRenderer.invoke('end-export');
        alert("Export Finished!");
        setExporting(false);
    };

    runExport();
  }, [isExporting, objects, renderScene, setExporting, setTime, pixiAppRef, videoElementsRef]);
};