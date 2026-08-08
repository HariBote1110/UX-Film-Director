import React from 'react';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import { parseLabFile } from '../utils/labParser';
import { HEADER_WIDTH, RULER_HEIGHT, ROW_HEIGHT, MAX_LAYERS, PX_PER_SEC } from '../components/timelineConstants';
import { shallow } from 'zustand/shallow';
import {
  getElectronFilePath,
  resolveAudioMetadata,
  resolveVideoImportSource,
  resolveVideoMetadataForFilePath,
} from '../utils/mediaMetadata';
import { parsePsdAsObject } from '../utils/psdParser';
import { psdImportTraceCollector } from '../perf/psdImportTrace';

const VIDEO_FILE_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv'];

export const isTimelineDropVideoFile = (file: File): boolean => {
  if (file.type.startsWith('video/')) return true;
  const lowerName = file.name.toLowerCase();
  return VIDEO_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
};

export const useTimelineDrop = (timelineRef: React.RefObject<HTMLDivElement>) => {
  const { isExporting, addObject, projectSettings, layers, beginProxyGeneration, endProxyGeneration } = useStore((state) => ({
    isExporting: state.isExporting,
    addObject: state.addObject,
    projectSettings: state.projectSettings,
    layers: state.layers,
    beginProxyGeneration: state.beginProxyGeneration,
    endProxyGeneration: state.endProxyGeneration,
  }), shallow);

  const getCentredPosition = (width: number, height: number) => ({
    x: Math.round((projectSettings.width - width) / 2),
    y: Math.round((projectSettings.height - height) / 2)
  });

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
    if (layers[dropLayer]?.locked) return;

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
                psdImportTraceCollector.mark('input');
                const filePath = getElectronFilePath(file);
                const { psdObject } = await parsePsdAsObject(
                    file,
                    dropTime,
                    projectSettings.width,
                    projectSettings.height
                );
                psdImportTraceCollector.mark('parsed');

                const newPsd: TimelineObject = {
                    ...psdObject,
                    filePath: filePath ?? undefined,
                    layer: dropLayer,
                    startTime: dropTime,
                };
                addObject(newPsd);
                psdImportTraceCollector.mark('objectAdded');
            } catch (error) {
                console.error('Failed to parse dropped PSD file', error);
            }
        } else if (file.type.startsWith('image/')) {
            const filePath = getElectronFilePath(file);
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.src = url;
            img.onload = () => {
                const centred = getCentredPosition(img.width, img.height);
                const newImage: TimelineObject = {
                    id: crypto.randomUUID(), type: 'image', name: file.name, layer: dropLayer, startTime: dropTime, duration: 5,
                    x: centred.x, y: centred.y, width: img.width, height: img.height, src: url, filePath: filePath ?? undefined,
                    enableAnimation: false, endX: centred.x, endY: centred.y, easing: 'linear', offset: 0,
                    rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
                };
                addObject(newImage);
            };
        } else if (isTimelineDropVideoFile(file)) {
            const filePath = getElectronFilePath(file);
            const url = URL.createObjectURL(file);
            try {
                const { resolveOrGeneratePreviewProxy } = await import('../utils/proxyUtils');
                const sourceImport = await resolveVideoImportSource(file, url);
                const sourceMetadata = sourceImport.metadata;
                // 強制プロキシ生成は廃止: 4K 等の高解像度素材も VideoToolbox
                // ハードウェアデコードで直接プレビュー再生できるため、ここでは
                // 既存の .proxy.mp4 を検出できた場合のみ利用し、autoGenerate は
                // 渡さない（新規生成しない）。
                const proxyFilePath = await resolveOrGeneratePreviewProxy(
                    filePath ?? undefined,
                    undefined,
                    { width: sourceMetadata.width, height: sourceMetadata.height },
                    { onGenerateStart: beginProxyGeneration, onGenerateEnd: endProxyGeneration },
                );
                const metadata = proxyFilePath
                    ? await resolveVideoMetadataForFilePath(proxyFilePath) ?? sourceMetadata
                    : sourceMetadata;
                const centred = getCentredPosition(metadata.width, metadata.height);
                const newVideo: TimelineObject = {
                    id: crypto.randomUUID(), type: 'video', name: file.name, layer: dropLayer, startTime: dropTime, duration: metadata.duration,
                    x: centred.x, y: centred.y, width: metadata.width, height: metadata.height, src: url,
                    filePath: sourceImport.filePath ?? filePath ?? undefined,
                    proxyFilePath: proxyFilePath,
                    sourceWidth: sourceMetadata.width,
                    sourceHeight: sourceMetadata.height,
                    volume: 1.0, muted: false,
                    enableAnimation: false, endX: centred.x, endY: centred.y, easing: 'linear', offset: 0,
                    rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
                };
                addObject(newVideo);
            } catch (error) {
                console.error('Failed to load dropped video metadata', error);
                URL.revokeObjectURL(url);
            }
        } else if (file.type.startsWith('audio/') || lowerName.endsWith('.wav')) {
            const filePath = getElectronFilePath(file);
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
                    src: url, filePath: filePath ?? undefined, volume: 1.0, muted: false,
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
