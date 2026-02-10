import React from 'react';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import { parseLabFile } from '../utils/labParser';
import { HEADER_WIDTH, RULER_HEIGHT, ROW_HEIGHT, MAX_LAYERS, PX_PER_SEC } from '../components/timelineConstants';
import { shallow } from 'zustand/shallow';
import { resolveAudioMetadata, resolveVideoMetadata } from '../utils/mediaMetadata';
import { parsePsdAsObject } from '../utils/psdParser';

export const useTimelineDrop = (timelineRef: React.RefObject<HTMLDivElement>) => {
  const { isExporting, addObject, projectSettings } = useStore((state) => ({
    isExporting: state.isExporting,
    addObject: state.addObject,
    projectSettings: state.projectSettings,
  }), shallow);

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
        const lowerName = file.name.toLowerCase();
        const baseName = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;

        if (lowerName.endsWith('.psd')) {
            try {
                const { psdObject } = await parsePsdAsObject(
                    file,
                    dropTime,
                    projectSettings.width,
                    projectSettings.height
                );

                const newPsd: TimelineObject = {
                    ...psdObject,
                    layer: dropLayer,
                    startTime: dropTime,
                };
                addObject(newPsd);
            } catch (error) {
                console.error('Failed to parse dropped PSD file', error);
            }
        } else if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
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
            const url = URL.createObjectURL(file);
            try {
                const metadata = await resolveVideoMetadata(file, url);
                const newVideo: TimelineObject = {
                    id: crypto.randomUUID(), type: 'video', name: file.name, layer: dropLayer, startTime: dropTime, duration: metadata.duration,
                    x: 640 - (metadata.width / 2), y: 360 - (metadata.height / 2), width: metadata.width, height: metadata.height, src: url,
                    volume: 1.0, muted: false,
                    enableAnimation: false, endX: 640 - (metadata.width / 2), endY: 360 - (metadata.height / 2), easing: 'linear', offset: 0,
                    rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
                };
                addObject(newVideo);
            } catch (error) {
                console.error('Failed to load dropped video metadata', error);
                URL.revokeObjectURL(url);
            }
        } else if (file.type.startsWith('audio/') || lowerName.endsWith('.wav')) {
            const url = URL.createObjectURL(file);
            let labData = undefined;
            if (labFiles.has(baseName)) {
                try {
                    labData = await parseLabFile(labFiles.get(baseName)!);
                    console.log(`Loaded lab data for ${file.name}: ${labData.length} phonemes`);
                } catch (e) {
                    console.error("Failed to parse lab file", e);
                }
            }

            try {
                const metadata = await resolveAudioMetadata(file, url);
                 const newAudio: TimelineObject = {
                    id: crypto.randomUUID(), type: 'audio', name: file.name, layer: dropLayer, startTime: dropTime, duration: metadata.duration,
                    src: url, volume: 1.0, muted: false,
                    x: 0, y: 0, enableAnimation: false, endX: 0, endY: 0, easing: 'linear', offset: 0,
                    rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
                    labData: labData
                };
                addObject(newAudio);
            } catch (error) {
                console.error('Failed to load dropped audio metadata', error);
                URL.revokeObjectURL(url);
            }
        }
    }
  };

  return { handleDragOver, handleDrop };
};
