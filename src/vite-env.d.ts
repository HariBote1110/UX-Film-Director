/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PERF_AUTORUN?: string;
  readonly VITE_PERF_AGENT_MODE?: string;
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
    releaseVideoDecodeFrame: (payload: {
      jobId: string;
      slotIndex: number;
      generation: number;
      copyOutState: 'gpuUploadFenceSignalled';
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
