/**
 * プロキシファイルのユーティリティ
 *
 * - インポート時: .proxy.mp4 が隣に存在すれば自動検出
 * - 生成: generate-proxy IPC 経由で FFmpeg libx264 にダウンスケール
 */

const { ipcRenderer } = window;

/** filePath に対応するプロキシが既に存在するか確認し、存在すればパスを返す */
export const detectExistingProxy = async (filePath: string | undefined): Promise<string | undefined> => {
  if (!filePath || !ipcRenderer) return undefined;
  try {
    const result = await ipcRenderer.invoke('check-proxy', { filePath }) as { exists: boolean; proxyPath: string };
    return result.exists ? result.proxyPath : undefined;
  } catch {
    return undefined;
  }
};

export interface GenerateProxyOptions {
  filePath: string;
  /** ダウンスケール後の幅（デフォルト 1280px）。高さはアスペクト比を維持 */
  width?: number;
  onProgress?: (message: string) => void;
}

export interface GenerateProxyResult {
  success: boolean;
  proxyFilePath?: string;
  error?: string;
}

/** プロキシを生成する。完了まで数十秒かかる可能性がある */
export const generateProxy = async (opts: GenerateProxyOptions): Promise<GenerateProxyResult> => {
  if (!ipcRenderer) return { success: false, error: 'ipcRenderer 未利用環境' };
  opts.onProgress?.('プロキシ生成中...');
  try {
    const result = await ipcRenderer.invoke('generate-proxy', {
      filePath: opts.filePath,
      width: opts.width ?? 1280,
    }) as { success: boolean; proxyPath?: string; error?: string };

    if (!result.success) return { success: false, error: result.error };
    return { success: true, proxyFilePath: result.proxyPath };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
};
