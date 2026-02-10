import { PsdLayerStruct } from '../types';

/**
 * PSDTool (webview) との連携を行うブリッジ
 */
export class PsdToolBridge {
  private webview: any;
  private checkInterval: number | null = null;
  private lastDataUrl: string = '';
  private hasSyncedTree: boolean = false;
  private onImageUpdate: ((dataUrl: string) => void) | null = null;
  private onTreeUpdate: ((tree: PsdLayerStruct[]) => void) | null = null;
  private syncRunning: boolean = false;
  private queuedTreeSync: boolean = false;

  constructor(webview: any) {
    this.webview = webview;
  }

  public async loadFile(file: File): Promise<void> {
    if (!this.webview) return;
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = async () => {
        const base64 = reader.result as string;
        const fileName = JSON.stringify(file.name);
        const fileType = JSON.stringify(file.type);
        const encodedFile = JSON.stringify(base64);
        const code = `
            (async () => {
                try {
                    const res = await fetch(${encodedFile});
                    const blob = await res.blob();
                    const file = new File([blob], ${fileName}, { type: ${fileType} });
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    const dropEvent = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
                    const dropzone = document.getElementById('dropzone');
                    if (dropzone) dropzone.dispatchEvent(dropEvent);
                } catch(e) { console.error(e); }
            })();
        `;
        try {
          await this.webview.executeJavaScript(code);
          this.scheduleWarmupSync();
        } catch (e) {}
    };
  }

  private scheduleWarmupSync() {
    window.setTimeout(() => {
      void this.requestImmediateSync(true);
    }, 150);
    window.setTimeout(() => {
      void this.requestImmediateSync(true);
    }, 800);
  }

  private async getPreviewDataUrl(): Promise<string | null> {
    if (!this.webview) return null;
    try {
      return await this.webview.executeJavaScript(`
        (() => {
            const canvas = document.getElementById('preview');
            if (!canvas || canvas.width === 0) return null;
            return canvas.toDataURL('image/png');
        })()
      `);
    } catch (e) {
      return null;
    }
  }

  private async runSync(forceTree: boolean) {
    const dataUrl = await this.getPreviewDataUrl();
    let shouldSyncTree = forceTree || !this.hasSyncedTree;

    if (dataUrl && dataUrl !== this.lastDataUrl) {
      this.lastDataUrl = dataUrl;
      this.onImageUpdate?.(dataUrl);
      shouldSyncTree = true;
    }

    if (shouldSyncTree && this.onTreeUpdate) {
      const tree = await this.getLayerTree();
      this.onTreeUpdate(tree);
      this.hasSyncedTree = true;
    }
  }

  public async requestImmediateSync(forceTree: boolean = false): Promise<void> {
    if (!this.webview) return;
    if (forceTree) {
      this.queuedTreeSync = true;
    }
    if (this.syncRunning) return;

    this.syncRunning = true;
    try {
      do {
        const shouldSyncTree = this.queuedTreeSync;
        this.queuedTreeSync = false;
        await this.runSync(shouldSyncTree);
      } while (this.queuedTreeSync);
    } finally {
      this.syncRunning = false;
    }
  }

  public async getLayerTree(): Promise<PsdLayerStruct[]> {
    if (!this.webview) return [];

    const code = `
      (() => {
        const root = document.getElementById('layer-tree');
        if (!root) return [];

        function parseNode(li) {
          // 子要素コンテナ(ul)を取得
          const childrenUl = li.querySelector('ul');

          // 直下のinputを探す (ulの中身を除外する)
          let input = null;
          const allInputs = li.querySelectorAll('input.psdtool-layer-visible');
          for (let i = 0; i < allInputs.length; i++) {
             if (childrenUl && childrenUl.contains(allInputs[i])) continue;
             input = allInputs[i];
             break;
          }

          // 直下のlabelを探す
          let name = 'Unknown';
          const allLabels = li.querySelectorAll('label');
          for (let i = 0; i < allLabels.length; i++) {
             if (childrenUl && childrenUl.contains(allLabels[i])) continue;
             name = allLabels[i].textContent.trim();
             break;
          }
          
          const children = childrenUl ? Array.from(childrenUl.children).map(parseNode) : [];

          // inputが見つからない場合はスキップすべきだが、構造維持のためnull seqで返す
          return {
            seq: input ? input.getAttribute('data-seq') : null,
            name: name,
            checked: input ? input.checked : false,
            isRadio: name.startsWith('*'),
            children: children
          };
        }

        return Array.from(root.children).map(parseNode);
      })();
    `;

    try {
      return await this.webview.executeJavaScript(code);
    } catch (e) {
      return [];
    }
  }

  public async toggleNode(seq: string): Promise<void> {
    if (!this.webview) return;

    // クリックとChangeイベント両方を試みる（React/jQuery対策）
    const code = `
      (() => {
        const input = document.querySelector('input.psdtool-layer-visible[data-seq="${seq}"]');
        if (input) {
          input.click();
          // 念のためchangeイベントも発火
          const event = new Event('change', { bubbles: true });
          input.dispatchEvent(event);
        }
      })();
    `;
    await this.webview.executeJavaScript(code);
    window.setTimeout(() => {
      void this.requestImmediateSync(true);
    }, 60);
    window.setTimeout(() => {
      void this.requestImmediateSync(true);
    }, 260);
  }

  public startSync(
    onImageUpdate: (dataUrl: string) => void,
    onTreeUpdate: (tree: PsdLayerStruct[]) => void
  ) {
    this.stopSync();
    if (!this.webview) return;
    this.onImageUpdate = onImageUpdate;
    this.onTreeUpdate = onTreeUpdate;
    this.lastDataUrl = '';
    this.hasSyncedTree = false;
    this.queuedTreeSync = true;
    this.syncRunning = false;

    void this.requestImmediateSync(true);
    this.checkInterval = window.setInterval(() => {
      void this.requestImmediateSync(false);
    }, 800);
  }

  public stopSync() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.onImageUpdate = null;
    this.onTreeUpdate = null;
    this.queuedTreeSync = false;
    this.syncRunning = false;
  }
}
