import React, { useEffect, useRef } from 'react';
import { PsdObject } from '../types';
import { PsdToolBridge } from '../utils/psdToolBridge';
import { useStore } from '../store/useStore';

interface PsdRendererProps {
  object: PsdObject;
  onBridgeReady: (id: string, bridge: PsdToolBridge) => void;
  onBridgeDestroy: (id: string) => void;
}

export const PsdRenderer: React.FC<PsdRendererProps> = ({ object, onBridgeReady, onBridgeDestroy }) => {
  const webviewRef = useRef<any>(null);
  const bridgeRef = useRef<PsdToolBridge | null>(null);
  const loadedFileRef = useRef<File | null>(null);
  const { updateObject } = useStore();

  useEffect(() => {
    const webview = webviewRef.current;
    if (webview && !bridgeRef.current) {
      // Create a bridge for this specific PSD object
      const bridge = new PsdToolBridge(webview);
      bridgeRef.current = bridge;
      
      // Notify parent that the bridge is ready
      onBridgeReady(object.id, bridge);

      // Webview event: dom-ready
      // Ensure the script is executed after the page is loaded
      const onDomReady = () => {
        // Load the file if it hasn't been loaded yet
        if (object.file && object.file !== loadedFileRef.current) {
           bridge.loadFile(object.file);
           loadedFileRef.current = object.file;
        }

        // Start synchronising image and tree data
        bridge.startSync(
            (dataUrl) => {
                // Update the store with the new image
                // Note: This might trigger re-renders, but since we use key={id} in App.tsx,
                // this component instance should remain stable.
                updateObject(object.id, { src: dataUrl });
            },
            (tree) => {
                // Update the layer tree structure
                updateObject(object.id, { layerTree: tree });
            }
        );
      };

      webview.addEventListener('dom-ready', onDomReady);

      // Cleanup function
      return () => {
        webview.removeEventListener('dom-ready', onDomReady);
        if (bridgeRef.current) {
            bridgeRef.current.stopSync();
            onBridgeDestroy(object.id);
            bridgeRef.current = null;
        }
      };
    }
  }, []); // Run once on mount. The 'object' prop updates won't re-trigger this effect due to the empty dependency array, which is intended for the init logic.

  return (
    <div style={{ position: 'absolute', width: 0, height: 0, visibility: 'hidden' }}>
        {/* Each PSD object gets its own isolated webview session */}
        <webview 
            ref={webviewRef}
            src="https://oov.github.io/psdtool/"
            style={{ width: '1280px', height: '720px' }}
            webpreferences="contextIsolation=no" 
            partition={`persist:psd-${object.id}`} // Use unique partition to ensure isolation
        />
    </div>
  );
};