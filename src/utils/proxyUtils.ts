/**
 * プロキシファイルのユーティリティ
 *
 * - インポート時: .proxy.mp4 が隣に存在すれば自動検出
 * - 生成: generate-proxy IPC 経由で FFmpeg libx264 にダウンスケール
 */

const DEFAULT_PREVIEW_PROXY_WIDTH = 640;

/**
 * プロキシ生成の要否を分ける解像度しきい値（FHD）。
 * これ以下の素材はプレビュー再生負荷が軽いためプロキシ不要、
 * これを超える素材（4K, QHD 等）はプロキシを生成する。
 */
export const PROXY_FHD_THRESHOLD_WIDTH = 1920;
export const PROXY_FHD_THRESHOLD_HEIGHT = 1080;

/**
 * 与えられた解像度がプロキシ生成対象かどうかを返す。
 * 向き（縦横）に依存しないよう長辺・短辺で判定し、FHD を超える素材
 * （4K, QHD 等）のみ対象とする。縦長 FHD（1080×1920）は対象外。
 */
export const shouldGenerateProxyForResolution = (width: number, height: number): boolean => {
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  return longEdge > PROXY_FHD_THRESHOLD_WIDTH || shortEdge > PROXY_FHD_THRESHOLD_HEIGHT;
};

const getIpcRenderer = () =>
  typeof window !== 'undefined'
    ? (window as unknown as { ipcRenderer?: { invoke: (channel: string, payload: unknown) => Promise<unknown> } }).ipcRenderer
    : undefined;

/** filePath に対応するプロキシが既に存在するか確認し、存在すればパスを返す */
export const detectExistingProxy = async (filePath: string | undefined): Promise<string | undefined> => {
  const ipcRenderer = getIpcRenderer();
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
  const ipcRenderer = getIpcRenderer();
  if (!ipcRenderer) return { success: false, error: 'ipcRenderer 未利用環境' };
  opts.onProgress?.('プロキシ生成中...');
  try {
    const result = await ipcRenderer.invoke('generate-proxy', {
      filePath: opts.filePath,
      width: opts.width ?? DEFAULT_PREVIEW_PROXY_WIDTH,
    }) as { success: boolean; proxyPath?: string; error?: string };

    if (!result.success) return { success: false, error: result.error };
    return { success: true, proxyFilePath: result.proxyPath };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
};

export interface ResolveOrGeneratePreviewProxyOptions {
  /**
   * true の場合のみ、FHD を超える素材に対して自動でプロキシを生成する。
   * デフォルトは false（強制プロキシ生成は廃止）: macOS の VideoToolbox
   * ハードウェアデコードにより 4K 素材もプロキシなしで直接プレビュー
   * 再生できるため、ドロップ/インポート時に自動生成する必要がなくなった。
   * プロキシ生成機能自体は明示的な経路（PropertyPanel の手動生成ボタン
   * や autoGenerate: true を渡す呼び出し）向けに残す。
   */
  autoGenerate?: boolean;
}

export const resolveOrGeneratePreviewProxy = async (
  filePath: string | undefined,
  width: number = DEFAULT_PREVIEW_PROXY_WIDTH,
  /**
   * 元素材の解像度。指定された場合、FHD 以下の素材はプロキシを生成しない。
   * 未指定（従来呼び出し）の場合は解像度ゲートを適用せず常に生成する
   * （ただし autoGenerate が false の間は、いずれにせよ生成しない）。
   */
  source?: { width: number; height: number },
  /**
   * 実際に生成（ffmpeg 実行）する場合のみ前後で呼ばれるフック。
   * 既存プロキシの再利用や FHD スキップ・自動生成オフでは呼ばれない。
   * 進捗表示の制御に使う。
   */
  hooks?: { onGenerateStart?: () => void; onGenerateEnd?: () => void },
  options?: ResolveOrGeneratePreviewProxyOptions,
): Promise<string | undefined> => {
  if (!filePath) return undefined;

  // 既存のプロキシは解像度に関わらず再利用する。
  const existingProxy = await detectExistingProxy(filePath);
  if (existingProxy) return existingProxy;

  // 強制プロキシ生成は廃止済み: 明示的に autoGenerate: true が指定された
  // ときのみ自動生成する。それ以外（ドロップ/インポート時の既定挙動）は
  // 4K 等の高解像度でもプロキシを生成せず、ハードウェアデコードで直接
  // 再生する。
  if (!options?.autoGenerate) {
    return undefined;
  }

  // 解像度が判明していて FHD 以下なら生成しない（リソース浪費を防ぐ）。
  if (source && !shouldGenerateProxyForResolution(source.width, source.height)) {
    return undefined;
  }

  hooks?.onGenerateStart?.();
  try {
    const generated = await generateProxy({ filePath, width });
    return generated.success ? generated.proxyFilePath : undefined;
  } finally {
    hooks?.onGenerateEnd?.();
  }
};
