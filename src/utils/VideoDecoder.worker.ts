import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import * as MP4Box from 'mp4box';

const ctx: Worker = self as any;

// 状態管理
let ffmpeg: FFmpeg | null = null;
let decoder: VideoDecoder | null = null;
let mp4boxfile: MP4Box.MP4File | null = null;
let videoTrack: MP4Box.MP4MediaTrack | null = null;

// データ
let rawFileBlob: Blob | null = null;
let cleanMp4Buffer: ArrayBuffer | null = null;
let samples: any[] = [];

// 再生制御
const MAX_QUEUE_SIZE = 20;
let isFilling = false;
let isSeeking = false;
let nextDecodeIndex = 0;

// モード
let usePreload = false;
let allFrames: VideoFrame[] = []; 

function log(msg: string, level: 'info' | 'warn' | 'error' = 'info') {
    ctx.postMessage({ type: 'log', message: `[Worker] ${msg}`, level });
}

ctx.onmessage = async (e) => {
    const { type, payload } = e.data;
    switch (type) {
        case 'initialize': await initialize(payload.src); break;
        case 'seek': await performSeek(payload.time); break;
        case 'request_fill': triggerFill(); break;
        case 'dispose': dispose(); break;
    }
};

// --- FFmpegによる「動画浄化 & H.264化」 ---
async function cleanVideoWithFFmpeg(blob: Blob): Promise<ArrayBuffer> {
    if (!ffmpeg) {
        ffmpeg = new FFmpeg();
        // 進捗ログが見たい場合はコメントアウトを外す
        // ffmpeg.on('log', ({ message }) => log(`FFmpeg: ${message}`, 'info'));
        // ffmpeg.on('progress', ({ progress }) => log(`FFmpeg Progress: ${(progress * 100).toFixed(1)}%`, 'info'));
        await ffmpeg.load();
    }

    const inputName = 'input_video';
    const outputName = 'output.mp4';

    await ffmpeg.writeFile(inputName, await fetchFile(blob));

    log('FFmpeg: Starting Transcode to H.264 (Universal Compatibility)...', 'info');
    
    // HEVCなどは再生できない環境が多いため、安全確実な H.264 (libx264) に変換する。
    // -preset ultrafast: 処理速度最優先
    // -crf 23: 画質とサイズのバランス維持
    // -an: 音声削除
    await ffmpeg.exec([
        '-i', inputName,
        '-c:v', 'libx264',      // 強制的にH.264へ変換
        '-preset', 'ultrafast', // 爆速設定
        '-crf', '23',           // 標準画質
        '-an',                  // 音声なし
        '-movflags', 'faststart',
        '-y',
        outputName
    ]);

    const data = await ffmpeg.readFile(outputName);
    
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    log(`FFmpeg: Transcode complete. Size: ${(data as Uint8Array).byteLength} bytes`, 'info');
    return (data as Uint8Array).buffer;
}

async function initialize(src: string) {
    log(`Initializing: ${src}`, 'info');
    dispose();

    try {
        const blob = await loadBlob(src);
        log(`Original file loaded. Size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`, 'info');

        // FFmpegでH.264 MP4に変換
        cleanMp4Buffer = await cleanVideoWithFFmpeg(blob);
        
        mp4boxfile = MP4Box.createFile();
        mp4boxfile.onError = (e) => log(`MP4Box Error: ${e}`, 'error');
        
        mp4boxfile.onReady = (info) => {
            videoTrack = info.videoTracks[0];
            if (videoTrack) {
                log(`Track found: ${videoTrack.codec}, samples: ${videoTrack.nb_samples}`, 'info');
                configureDecoder();
                mp4boxfile!.setExtractionOptions(videoTrack.id, null, { nbSamples: 100000 });
                mp4boxfile!.start();
            } else {
                log('No video track found after FFmpeg.', 'error');
            }
        };

        mp4boxfile.onSamples = (id, user, fetchedSamples) => {
            if (fetchedSamples.length > 0) {
                samples = fetchedSamples;
                log(`Samples parsed: ${samples.length}`, 'info');
                
                ctx.postMessage({ type: 'ready', mode: usePreload ? 'preload' : 'ondemand' });
                
                if (usePreload) triggerPreload();
                else triggerFill();
            }
        };

        // 変換済みデータ(H.264)を一括投入
        // @ts-ignore
        cleanMp4Buffer.fileStart = 0;
        mp4boxfile.appendBuffer(cleanMp4Buffer);
        mp4boxfile.flush();

        // サイズ判定 (H.264変換後のサイズで判定)
        // 50MB以下なら全展開
        if (cleanMp4Buffer.byteLength < 50 * 1024 * 1024) {
            usePreload = true;
            log('Mode: Preload (Full Memory)', 'info');
        } else {
            usePreload = false;
            log('Mode: On-Demand (Stream)', 'info');
        }

    } catch (e: any) {
        log(`Init Failed: ${e.message}`, 'error');
        console.error(e);
    }
}

function configureDecoder() {
    if (!videoTrack || !mp4boxfile) return;
    if (decoder && decoder.state !== 'closed') decoder.close();

    const description = getDescription(videoTrack);

    decoder = new VideoDecoder({
        output: (frame) => {
            if (usePreload) {
                allFrames.push(frame);
            } else {
                if (isSeeking) {
                    frame.close();
                    return;
                }
                ctx.postMessage({ type: 'frame', frame }, [frame]);
                triggerFill(); 
            }
        },
        error: (e) => {
            log(`Decoder Error: ${e.message}`, 'error');
            if (!usePreload) forceReset();
        }
    });

    decoder.configure({
        codec: videoTrack.codec,
        codedWidth: videoTrack.track_width,
        codedHeight: videoTrack.track_height,
        description: description
    });
}

function forceReset() {
    isSeeking = true;
    isFilling = false;
    configureDecoder();
    isSeeking = false;
    triggerFill();
}

async function performSeek(time: number) {
    if (!videoTrack || !decoder) return;
    
    if (usePreload) {
        sendCachedFrame(time);
        return;
    }

    isSeeking = true;
    isFilling = false;

    try {
        decoder.reset();
        configureDecoder();
        
        const timescale = videoTrack.timescale;
        const targetCts = time * timescale;
        
        let keyFrameIndex = 0;
        for (let i = 0; i < samples.length; i++) {
            if (samples[i].cts > targetCts) break;
            if (samples[i].is_sync) keyFrameIndex = i;
        }
        
        nextDecodeIndex = keyFrameIndex;
        
    } catch (e) {
        forceReset();
    } finally {
        isSeeking = false;
        triggerFill();
    }
}

function sendCachedFrame(time: number) {
    if (allFrames.length === 0) return;
    const targetUs = time * 1_000_000;
    
    let bestFrame: VideoFrame | null = null;
    let minDiff = Infinity;

    for (const frame of allFrames) {
        const duration = frame.duration || 33333;
        if (frame.timestamp <= targetUs && targetUs < frame.timestamp + duration) {
            bestFrame = frame;
            break;
        }
        const diff = targetUs - frame.timestamp;
        if (diff >= 0 && diff < minDiff) {
            minDiff = diff;
            bestFrame = frame;
        }
    }

    if (bestFrame) {
        const clone = bestFrame.clone();
        ctx.postMessage({ type: 'frame', frame: clone }, [clone]);
    }
}

function triggerFill() {
    if (usePreload) {
        if (nextDecodeIndex < samples.length) queueMicrotask(runPreloadLoop);
        return;
    }
    queueMicrotask(fillBuffer);
}

async function runPreloadLoop() {
    if (!decoder || !videoTrack) return;
    const timescale = videoTrack.timescale;
    const BATCH = 10;
    let processed = 0;

    try {
        while (nextDecodeIndex < samples.length && processed < BATCH) {
            if (decoder.decodeQueueSize >= 32) {
                setTimeout(runPreloadLoop, 10);
                return;
            }
            await decodeSample(nextDecodeIndex, timescale);
            nextDecodeIndex++;
            processed++;
        }
        if (nextDecodeIndex < samples.length) queueMicrotask(runPreloadLoop);
    } catch(e) {}
}

async function fillBuffer() {
    if (isFilling || isSeeking || !decoder || !videoTrack) return;
    isFilling = true;
    const timescale = videoTrack.timescale;

    try {
        while (!isSeeking && decoder.decodeQueueSize < 5 && nextDecodeIndex < samples.length) {
            await decodeSample(nextDecodeIndex, timescale);
            nextDecodeIndex++;
        }
    } catch(e) {
    } finally {
        isFilling = false;
        if (!isSeeking && nextDecodeIndex < samples.length && decoder.decodeQueueSize < 5) {
             setTimeout(triggerFill, 10);
        }
    }
}

async function decodeSample(index: number, timescale: number) {
    const sample = samples[index];
    if (!cleanMp4Buffer) return;

    const chunkData = cleanMp4Buffer.slice(sample.offset, sample.offset + sample.size);

    const timestampUs = (sample.cts * 1_000_000) / timescale;
    const durationUs = (sample.duration * 1_000_000) / timescale;

    const chunk = new EncodedVideoChunk({
        type: sample.is_sync ? 'key' : 'delta',
        timestamp: timestampUs,
        duration: durationUs,
        data: chunkData
    });

    decoder!.decode(chunk);
}

function loadBlob(url: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.responseType = 'blob';
        xhr.onload = () => {
            if (xhr.status >= 200 || xhr.status === 0) resolve(xhr.response);
            else reject(new Error(`XHR failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('XHR Error'));
        xhr.send();
    });
}

function getDescription(track: any) {
    if (!mp4boxfile) return undefined;
    const trak = mp4boxfile.getTrackById(track.id);
    if (!trak) return undefined;
    // @ts-ignore
    const entries = trak.mdia?.minf?.stbl?.stsd?.entries;
    if (!entries) return undefined;
    for (const entry of entries) {
        const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
        if (box) {
            const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
            box.write(stream);
            return new Uint8Array(stream.buffer, 8);
        }
    }
    return undefined;
}

function dispose() {
    isSeeking = true;
    isFilling = false;
    if (decoder && decoder.state !== 'closed') decoder.close();
    decoder = null;
    allFrames.forEach(f => f.close());
    allFrames = [];
    samples = [];
    cleanMp4Buffer = null; 
    rawFileBlob = null;
    if (mp4boxfile) { mp4boxfile.stop(); mp4boxfile = null; }
}