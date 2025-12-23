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
    
    // --- 変更点: キャッシュサイズを増加 ---
    private readonly MAX_QUEUE_SIZE = 30; // 約0.5秒分(60fps)保持
    
    private ready = false;
    private mode = 'initializing';
    
    private seekDebounceTimer: any = null;
    private isDestroyed = false;
    private lastRequestTime = -1;

    constructor(public src: string) {
        this.worker = new VideoDecoderWorker();
        this.initialize();
    }

    private async initialize() {
        this.worker.onmessage = (e) => {
            const { type, frame, info, message, level } = e.data;

            if (type === 'frame') {
                this.handleIncomingFrame(frame);
            } else if (type === 'ready') {
                this.ready = true;
                this.mode = 'ready';
                console.log(`%c[VideoProvider] Ready. Info:`, 'color: #0f0', info);
            } else if (type === 'log') {
               const style = level === 'error' ? 'color:red' : 'color:cyan';
               console.log(`%c${message}`, style);
            }
        };

        try {
            if ((window as any).electron) {
                const proxyPath = await (window as any).electron.convertVideo(this.src);
                const normalizedPath = proxyPath.replace(/\\/g, '/');
                const proxyUrl = `file://${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`;

                this.worker.postMessage({
                    type: 'initialize',
                    payload: { src: proxyUrl } 
                });
            } else {
                console.warn('Electron API not found. Using raw file.');
                this.worker.postMessage({
                    type: 'initialize',
                    payload: { src: this.src }
                });
            }
        } catch (e) {
            console.error('Initialization failed:', e);
        }
    }

    private handleIncomingFrame(frame: VideoFrame) {
        if (this.outputQueue.length >= this.MAX_QUEUE_SIZE) {
            const dropped = this.outputQueue.shift();
            dropped?.close();
        }
        this.outputQueue.push(frame);
    }

    public getDebugState(): VideoProviderDebugState {
        return {
            ready: this.ready,
            queueSize: this.outputQueue.length,
            mode: this.mode
        };
    }
    
    public downloadLog() {}

    async getFrame(time: number): Promise<VideoFrame | null> {
        if (!this.ready || this.isDestroyed) return null;

        const isSequential = time >= this.lastRequestTime && time < this.lastRequestTime + 1.0;
        this.lastRequestTime = time;

        const targetUs = time * 1_000_000;
        const tolerance = 100_000; 

        // 1. キューから探す
        const cachedIndex = this.outputQueue.findIndex(f => 
            Math.abs(f.timestamp - targetUs) < tolerance
        );

        if (cachedIndex !== -1) {
            for (let i = 0; i < cachedIndex; i++) {
                this.outputQueue.shift()?.close();
            }
            const frame = this.outputQueue[0];
            
            if (this.currentFrame) this.currentFrame.close();
            this.currentFrame = frame.clone();
            
            // --- 変更点: 早めに補充リクエスト ---
            // キューが20枚を切ったら補充する (MAX_QUEUE_SIZEの2/3程度)
            if (this.outputQueue.length < 20) {
                this.worker.postMessage({ type: 'preload_next' });
            }
            
            return frame.clone();
        }

        // 2. キューにない場合 (シーク)
        if (!isSequential || this.outputQueue.length === 0) {
            if (this.seekDebounceTimer) clearTimeout(this.seekDebounceTimer);
            
            this.seekDebounceTimer = setTimeout(() => {
                this.outputQueue.forEach(f => f.close());
                this.outputQueue = [];
                
                this.worker.postMessage({
                    type: 'seek',
                    payload: { time }
                });
            }, 50);
        }

        return this.currentFrame ? this.currentFrame.clone() : null;
    }

    dispose() {
        this.isDestroyed = true;
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