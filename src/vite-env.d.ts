/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PERF_AUTORUN?: string;
  readonly VITE_PERF_AGENT_MODE?: string;
  readonly VITE_UXFD_SHARED_RENDERER_EXPORT?: string;
  readonly VITE_UXFD_RUST_EXPORT_ONLY?: string;
  readonly VITE_UXFD_RUST_VIDEO_ONLY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  ipcRenderer: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
    off: (channel: string, listener: (...args: any[]) => void) => void;
    send: (channel: string, ...args: any[]) => void;
    invoke: (channel: string, ...args: any[]) => Promise<any>;
  };
  rustBackend: {
    health: () => Promise<{ success: boolean; result?: unknown; error?: string }>;
    echo: (payload: unknown) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    startVideoDecode: (payload: {
      jobId: string;
      source: string;
      slotCount: number;
      width: number;
      height: number;
      sourceRate: {
        numerator: number;
        denominator: number;
      };
      format: 'rgba8Srgb';
      colour: {
        primaries: 'bt709';
        transfer: 'srgb';
        matrix: 'rgb';
        range: 'full';
      };
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    requestVideoDecodeFrame: (payload: {
      jobId: string;
      requestId: number;
      frameIndex: number;
      mode: 'latestWins';
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    stopVideoDecode: (payload: {
      jobId: string;
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    releaseVideoDecodeFrame: (payload: {
      jobId: string;
      slotIndex: number;
      generation: number;
      copyOutState: 'gpuUploadFenceSignalled' | 'rendererUploadAborted';
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
  };
  rustVideoEncoder: {
    startVideoEncode: (payload: {
      sessionId: string;
      filePath: string;
      width: number;
      height: number;
      fps: number;
      pixelFormat: 'rgba8Srgb';
      colour: {
        primaries: 'bt709';
        transfer: 'srgb';
        matrix: 'rgb';
        range: 'full';
      };
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    writeVideoEncodeFrame: (payload: {
      sessionId: string;
      frameIndex: number;
      timestampUs: number;
      slotCount: number;
      frame: {
        descriptor: {
          memoryId: string;
          slotIndex: number;
          generation: number;
          byteOffset: number;
          byteLen: number;
          width: number;
          height: number;
          strideBytes: number;
          format: 'rgba8Srgb';
          colour: {
            primaries: 'bt709';
            transfer: 'srgb';
            matrix: 'rgb';
            range: 'full';
          };
        };
        ptsFrame: number;
      };
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    finishVideoEncode: (payload: {
      sessionId: string;
    }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
  };
  sharedVideoFrame: {
    copyIntoUploadBuffer: (
      payload: {
        memoryId: string;
        slotCount: number;
        slotByteLen: number;
        ptsFrame: number;
      },
      target: Uint8Array
    ) => Promise<{
      success: boolean;
      result?: {
        sequence: number;
        byteLen: number;
        expectedChecksum: number;
        actualChecksum: number;
        rgbaBytes?: Uint8Array | ArrayBuffer | number[];
      };
      error?: string;
    }>;
  };
}

// Webview Tag Definition
declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      src?: string;
      autosize?: string;
      nodeintegration?: string;
      plugins?: string;
      preload?: string;
      httpreferrer?: string;
      useragent?: string;
      disablewebsecurity?: string;
      partition?: string;
      allowpopups?: string;
      webpreferences?: string;
      enableblinkfeatures?: string;
      disableblinkfeatures?: string;
    }, HTMLElement>;
  }
}
