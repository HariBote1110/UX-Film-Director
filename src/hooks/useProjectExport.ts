import { useEffect } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import { shallow } from 'zustand/shallow';

const { ipcRenderer } = window;

export const useProjectExport = (
  pixiAppRef: React.MutableRefObject<PIXI.Application | null>,
  videoElementsRef: React.MutableRefObject<Map<string, HTMLVideoElement>>,
  renderScene: (time: number, objects: TimelineObject[]) => void
) => {
  const { isExporting, setExporting, setTime } = useStore((state) => ({
    isExporting: state.isExporting,
    setExporting: state.setExporting,
    setTime: state.setTime,
  }), shallow);

  useEffect(() => {
    if (!isExporting) return;

    let cancelled = false;

    const runExport = async () => {
        const app = pixiAppRef.current;
        if (!app) return;

        let exportSessionOpened = false;

        try {
            const { projectSettings, objects } = useStore.getState();
            const fps = projectSettings.fps;
            const dt = 1 / fps;
            const videoObjects = objects.filter((obj): obj is Extract<TimelineObject, { type: 'video' }> => obj.type === 'video');
            
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
                throw new Error(result.error || 'Failed to start export');
            }
            exportSessionOpened = true;

            // Frame Rendering Loop
            for (let i = 0; i < totalFrames; i++) {
                if (cancelled) break;

                const t = i * dt;
                if (i % Math.max(1, Math.floor(fps / 2)) === 0) {
                    setTime(t);
                }

                // Handle Video Seeking
                const activeVideos = videoObjects.filter(obj => t >= obj.startTime && t < obj.startTime + obj.duration);
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
                
                // Capture and write frame
                const blob = await new Promise<Blob | null>((resolve) => {
                  app.canvas.toBlob(resolve, 'image/jpeg', 0.90);
                });
                if (!blob) continue;

                const frameBuffer = await blob.arrayBuffer();
                const wrote = await ipcRenderer.invoke('write-frame', frameBuffer);
                if (!wrote) {
                    throw new Error(`Failed to write frame ${i + 1}/${totalFrames}`);
                }
            }

            const ended = await ipcRenderer.invoke('end-export');
            exportSessionOpened = false;
            if (!ended) {
                throw new Error('Failed to finalise export');
            }

            if (!cancelled) {
                alert("Export Finished!");
            }
        } catch (error) {
            if (!cancelled) {
                alert(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        } finally {
            if (exportSessionOpened) {
                await ipcRenderer.invoke('end-export');
            }
            setExporting(false);
        }
    };

    runExport();
    return () => {
      cancelled = true;
    };
  }, [isExporting, renderScene, setExporting, setTime, pixiAppRef, videoElementsRef]);
};
