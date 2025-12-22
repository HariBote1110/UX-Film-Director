import VideoDecoderWorker from './VideoDecoder.worker?worker';

export interface VideoProviderDebugState {
    ready: boolean;
    queueSize: number;
    mode: string;
}

export class VideoFrameProvider {
    private worker: Worker;
    private currentFrame: VideoFrame | null = null;
    
    private outputQueue: VideoFrame[] = [];
    private readonly MAX_QUEUE_SIZE = 10;
    
    private ready = false;
    private mode = 'initializing';
    
    private lastRequestTime = -1;
    private seekDebounceTimer: any = null;

    constructor(public src: string) {
        this.worker = new VideoDecoderWorker();
        this.initialize();
    }

    private initialize() {
        this.worker.onmessage = (e) => {
            const { type, frame, mode, message, level } = e.data;

            if (type === 'frame') {
                this.handleIncomingFrame(frame);
            } else if (type === 'ready') {
                this.ready = true;
                this.mode = mode;
                console.log(`%c[VideoProvider] Ready. Mode: ${mode}`, 'color: #0f0; font-weight: bold;');
            } else if (type === 'log') {
                // Workerからのログをコンソールに出力
                if (level === 'error') console.error(message);
                else if (level === 'warn') console.warn(message);
                else console.log(message);
            }
        };

        this.worker.postMessage({
            type: 'initialize',
            payload: { src: this.src }
        });
    }

    private handleIncomingFrame(frame: VideoFrame) {
        this.outputQueue.push(frame);
        if (this.outputQueue.length > this.MAX_QUEUE_SIZE) {
            const dropped = this.outputQueue.shift();
            dropped?.close();
        }
    }

    public getDebugState(): VideoProviderDebugState {
        return {
            ready: this.ready,
            queueSize: this.outputQueue.length,
            mode: this.mode
        };
    }

    public downloadLog() {
        console.log("Check developer console for logs.");
    }

    async getFrame(time: number): Promise<VideoFrame | null> {
        if (!this.ready) return null;

        const isSequential = this.lastRequestTime >= 0 && 
                             time >= this.lastRequestTime && 
                             time < this.lastRequestTime + 0.5;
        this.lastRequestTime = time;

        if (!isSequential) {
            this.outputQueue.forEach(f => f.close());
            this.outputQueue = [];

            if (this.seekDebounceTimer) clearTimeout(this.seekDebounceTimer);
            this.seekDebounceTimer = setTimeout(() => {
                this.worker.postMessage({
                    type: 'seek',
                    payload: { time }
                });
            }, 50);

            return this.currentFrame ? this.currentFrame.clone() : null;
        }

        const targetUs = time * 1_000_000;

        if (this.outputQueue.length < 5) {
             if (this.mode === 'preload') {
                 this.worker.postMessage({ type: 'seek', payload: { time } });
             } else {
                 this.worker.postMessage({ type: 'request_fill' });
             }
        }

        while (this.outputQueue.length > 0) {
            const frame = this.outputQueue[0];
            const frameDurationUs = frame.duration || 33333;
            const frameEndUs = frame.timestamp + frameDurationUs;

            if (frameEndUs < targetUs - 100000) {
                const dropped = this.outputQueue.shift();
                dropped?.close();
                continue;
            }

            if (frame.timestamp > targetUs + 50000) {
                return this.currentFrame ? this.currentFrame.clone() : null;
            }

            const matchedFrame = this.outputQueue.shift()!;
            if (this.currentFrame) this.currentFrame.close();
            this.currentFrame = matchedFrame.clone();
            return matchedFrame;
        }

        return this.currentFrame ? this.currentFrame.clone() : null;
    }

    dispose() {
        this.worker.postMessage({ type: 'dispose' });
        this.worker.terminate();
        if (this.currentFrame) {
            this.currentFrame.close();
            this.currentFrame = null;
        }
        this.outputQueue.forEach(f => f.close());
        this.outputQueue = [];
    }
}