import * as MP4Box from 'mp4box';

const ctx: Worker = self as any;

// 状態管理
let decoder: VideoDecoder | null = null;
let mp4boxfile: MP4Box.MP4File | null = null;
let videoTrack: any = null;
let samples: any[] = [];
let fileBuffer: ArrayBuffer | null = null;

// デコード制御
let nextSampleIndex = 0;
let pendingSeekTime: number | null = null;
let isDecoding = false;
let decodeErrorCount = 0;

ctx.onmessage = async (e) => {
    const { type, payload } = e.data;
    try {
        switch (type) {
            case 'initialize': await initialize(payload.src); break;
            case 'seek': await seek(payload.time); break;
            case 'preload_next': 
                if (!isDecoding) triggerDecodeLoop(); 
                break;
            case 'dispose': dispose(); break;
        }
    } catch (err: any) {
        log(`Error: ${err.message}`, 'error');
    }
};

function log(msg: string, level: 'info' | 'warn' | 'error' = 'info') {
    ctx.postMessage({ type: 'log', message: `[Worker] ${msg}`, level });
}

async function initialize(url: string) {
    dispose();
    log(`Loading proxy video: ${url}`);

    try {
        const res = await fetch(url);
        fileBuffer = await res.arrayBuffer();

        mp4boxfile = MP4Box.createFile();
        mp4boxfile.onError = (e) => log(`MP4Box Error: ${e}`, 'error');
        
        mp4boxfile.onReady = (info) => {
            videoTrack = info.videoTracks[0];
            if (videoTrack) {
                log(`Track loaded. Codec: ${videoTrack.codec}, Samples: ${videoTrack.nb_samples}`);
                configureDecoder();
                mp4boxfile!.setExtractionOptions(videoTrack.id, null, { nbSamples: 100000 });
                mp4boxfile!.start();
            } else {
                log('No video track found.', 'error');
            }
        };

        mp4boxfile.onSamples = (id, user, fetchedSamples) => {
            samples = fetchedSamples;
            ctx.postMessage({ type: 'ready', info: { samples: samples.length } });
            seek(0);
        };

        // @ts-ignore
        fileBuffer.fileStart = 0;
        mp4boxfile.appendBuffer(fileBuffer);
        mp4boxfile.flush();

    } catch (e: any) {
        log(`Init Failed: ${e.message}`, 'error');
    }
}

function configureDecoder() {
    if (decoder) return;

    decoder = new VideoDecoder({
        output: (frame) => {
            if (pendingSeekTime !== null) {
                const frameTime = frame.timestamp / 1_000_000;
                if (frameTime < pendingSeekTime - 0.1) { // 許容誤差を少し広げる
                    frame.close();
                    if (decoder && decoder.decodeQueueSize < 30) triggerDecodeLoop();
                    return;
                }
                pendingSeekTime = null;
            }

            ctx.postMessage({ type: 'frame', frame }, [frame]);
            // 成功したらエラーカウントリセット
            decodeErrorCount = 0;
        },
        error: (e) => {
            log(`Decoder Error: ${e.message}`, 'error');
            decodeErrorCount++;
            // エラーが続いてもリトライを試みる
            if (decodeErrorCount < 5) {
                setTimeout(triggerDecodeLoop, 100);
            }
        }
    });

    decoder.configure({
        codec: videoTrack.codec,
        codedWidth: videoTrack.track_width,
        codedHeight: videoTrack.track_height,
        description: getDescription(videoTrack)
    });
}

async function seek(time: number) {
    if (!videoTrack || !decoder || samples.length === 0) return;
    
    pendingSeekTime = time;
    const timescale = videoTrack.timescale;
    const targetCts = time * timescale;

    let keyFrameIndex = 0;
    for (let i = 0; i < samples.length; i++) {
        if (samples[i].cts > targetCts) break;
        if (samples[i].is_sync) keyFrameIndex = i;
    }

    if (decoder.state === 'closed') configureDecoder();
    await decoder.flush();
    
    nextSampleIndex = keyFrameIndex;
    triggerDecodeLoop();
}

function triggerDecodeLoop() {
    if (isDecoding) return;
    isDecoding = true;
    queueMicrotask(decodeLoopStep);
}

function decodeLoopStep() {
    if (!decoder || decoder.state === 'closed' || !fileBuffer || nextSampleIndex >= samples.length) {
        isDecoding = false;
        return;
    }

    // シーク中は多めに、通常時は適度に
    const maxQueue = pendingSeekTime !== null ? 40 : 20;

    if (decoder.decodeQueueSize >= maxQueue) {
        isDecoding = false;
        return; 
    }

    const sample = samples[nextSampleIndex];
    const chunkData = fileBuffer.slice(sample.offset, sample.offset + sample.size);

    const chunk = new EncodedVideoChunk({
        type: sample.is_sync ? 'key' : 'delta',
        timestamp: (sample.cts * 1_000_000) / videoTrack.timescale,
        duration: (sample.duration * 1_000_000) / videoTrack.timescale,
        data: chunkData
    });

    try {
        decoder.decode(chunk);
        nextSampleIndex++;
        queueMicrotask(decodeLoopStep);
    } catch (e) {
        log(`Decode error at index ${nextSampleIndex}: ${e}`, 'error');
        // エラーでも止まらず次へ
        nextSampleIndex++;
        queueMicrotask(decodeLoopStep);
    }
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
    if (decoder) { decoder.close(); decoder = null; }
    if (mp4boxfile) { mp4boxfile = null; }
    samples = [];
    fileBuffer = null;
    isDecoding = false;
    pendingSeekTime = null;
}