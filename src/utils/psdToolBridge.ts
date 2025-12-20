import { PsdLayerStruct } from '../types';

/**
 * PSDTool (webview) との連携を行うブリッジ
 */
export class PsdToolBridge {
  private webview: any;
  private checkInterval: number | null = null;
  private lastDataUrl: string = '';

  constructor(webview: any) {
    this.webview = webview;
  }

  public async loadFile(file: File): Promise<void> {
    if (!this.webview) return;
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = async () => {
        const base64 = reader.result as string;
        const code = `
            (async () => {
                try {
                    const res = await fetch("${base64}");
                    const blob = await res.blob();
                    const file = new File([blob], "${file.name}", { type: "${file.type}" });
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    const dropEvent = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
                    const dropzone = document.getElementById('dropzone');
                    if (dropzone) dropzone.dispatchEvent(dropEvent);
                } catch(e) { console.error(e); }
            })();
        `;
        try { await this.webview.executeJavaScript(code); } catch (e) {}
    };
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
  }

  public startSync(
    onImageUpdate: (dataUrl: string) => void,
    onTreeUpdate: (tree: PsdLayerStruct[]) => void
  ) {
    this.stopSync();
    if (!this.webview) return;

    this.checkInterval = window.setInterval(async () => {
        try {
            const dataUrl = await this.webview.executeJavaScript(`
                (() => {
                    const canvas = document.getElementById('preview');
                    if (!canvas || canvas.width === 0) return null;
                    return canvas.toDataURL('image/png');
                })()
            `);

            // 画像が変わっていなくても、前回取得失敗時などのためにツリーは定期チェックしても良いが
            // 負荷軽減のため画像変更時のみツリー更新を行う
            // ただし初回ロード直後などは画像が変わらなくてもツリーが欲しい場合があるため
            // 簡易的に毎回ツリーをとる手もあるが、ここでは画像変更トリガーとする
            if (dataUrl && dataUrl !== this.lastDataUrl) {
                this.lastDataUrl = dataUrl;
                onImageUpdate(dataUrl);
                const tree = await this.getLayerTree();
                onTreeUpdate(tree);
            } else if (!this.lastDataUrl && dataUrl) {
                // 初回検出
                this.lastDataUrl = dataUrl;
                onImageUpdate(dataUrl);
                const tree = await this.getLayerTree();
                onTreeUpdate(tree);
            }
        } catch (e) {}
    }, 200);
  }

  public stopSync() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}