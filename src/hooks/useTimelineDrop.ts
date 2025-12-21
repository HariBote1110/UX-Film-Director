import React from 'react';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import { parseLabFile } from '../utils/labParser';
import { HEADER_WIDTH, RULER_HEIGHT, ROW_HEIGHT, MAX_LAYERS, PX_PER_SEC } from '../components/timelineConstants';

export const useTimelineDrop = (timelineRef: React.RefObject<HTMLDivElement>) => {
  const { isExporting, addObject } = useStore();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (isExporting) return;

    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const scrollLeft = timelineRef.current.scrollLeft;
    const scrollTop = timelineRef.current.scrollTop;

    if (e.clientX - rect.left < HEADER_WIDTH || e.clientY - rect.top < RULER_HEIGHT) return;

    const relX = e.clientX - rect.left + scrollLeft;
    const relY = e.clientY - rect.top + scrollTop;

    const dropTime = Math.max(0, (relX - HEADER_WIDTH) / PX_PER_SEC);
    const dropLayer = Math.floor((relY - RULER_HEIGHT) / ROW_HEIGHT);

    if (dropLayer < 0 || dropLayer >= MAX_LAYERS) return;

    const files = Array.from(e.dataTransfer.files);
    
    // Labファイルを事前に収集
    const labFiles = new Map<string, File>();
    files.forEach(f => {
        if (f.name.toLowerCase().endsWith('.lab')) {
            const baseName = f.name.substring(0, f.name.lastIndexOf('.'));
            labFiles.set(baseName, f);
        }
    });

    for (const file of files) {
        const url = URL.createObjectURL(file);
        const lowerName = file.name.toLowerCase();
        const baseName = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;

        if (lowerName.endsWith('.psd')) {
            const newPsd: TimelineObject = {
                id: crypto.randomUUID(), type: 'psd', name: file.name, layer: dropLayer, startTime: dropTime, duration: 10,
                x: 960, y: 540, width: 500, height: 500, scale: 1.0, 
                enableAnimation: false, endX: 960, endY: 540, easing: 'linear', offset: 0,
                rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
                file: file, src: '', layerTree: []
            };
            addObject(newPsd);
        } else if (file.type.startsWith('image/')) {
            const img = new Image();
            img.src = url;
            img.onload = () => {
                const newImage: TimelineObject = {
                    id: crypto.randomUUID(), type: 'image', name: file.name, layer: dropLayer, startTime: dropTime, duration: 5,
                    x: 640 - (img.width / 2), y: 360 - (img.height / 2), width: img.width, height: img.height, src: url,
                    enableAnimation: false, endX: 640 - (img.width / 2), endY: 360 - (img.height / 2), easing: 'linear', offset: 0,
                    rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
                };
                addObject(newImage);
            };
        } else if (file.type.startsWith('video/')) {
            const video = document.createElement('video');
            video.src = url;
            video.onloadedmetadata = () => {
                const newVideo: TimelineObject = {
                    id: crypto.randomUUID(), type: 'video', name: file.name, layer: dropLayer, startTime: dropTime, duration: video.duration || 10,
                    x: 640 - (video.videoWidth / 2), y: 360 - (video.videoHeight / 2), width: video.videoWidth, height: video.videoHeight, src: url,
                    volume: 1.0, muted: false,
                    enableAnimation: false, endX: 640 - (video.videoWidth / 2), endY: 360 - (video.videoHeight / 2), easing: 'linear', offset: 0,
                    rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
                };
                addObject(newVideo);
            };
        } else if (file.type.startsWith('audio/') || lowerName.endsWith('.wav')) {
            const audio = document.createElement('audio');
            audio.src = url;
            
            let labData = undefined;
            if (labFiles.has(baseName)) {
                try {
                    labData = await parseLabFile(labFiles.get(baseName)!);
                    console.log(`Loaded lab data for ${file.name}: ${labData.length} phonemes`);
                } catch (e) {
                    console.error("Failed to parse lab file", e);
                }
            }

            audio.onloadedmetadata = () => {
                 const newAudio: TimelineObject = {
                    id: crypto.randomUUID(), type: 'audio', name: file.name, layer: dropLayer, startTime: dropTime, duration: audio.duration || 10,
                    src: url, volume: 1.0, muted: false,
                    x: 0, y: 0, enableAnimation: false, endX: 0, endY: 0, easing: 'linear', offset: 0,
                    rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
                    labData: labData
                };
                addObject(newAudio);
            };
        }
    }
  };

  return { handleDragOver, handleDrop };
};