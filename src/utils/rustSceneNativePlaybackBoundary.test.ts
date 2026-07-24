import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (filePath: string) => fs.readFileSync(path.join(root, filePath), 'utf8');

describe('Rust scene native playback境界', () => {
  it('Electron main内でscene.evaluateからnative overlay presentまで完結する', () => {
    const main = read('electron/main.ts');
    const preload = read('electron/preload.ts');

    expect(main).toContain('createRustScenePlaybackController');
    expect(main).toContain("'rust-backend-scene-playback-start'");
    expect(main).toContain("callRustBackend('scene.evaluate'");
    expect(main).toContain('nativeOverlayBridge.presentScene');
    expect(main).toContain("'rust-backend-scene-playback-ui-state'");
    expect(preload).toContain('startScenePlayback');
    expect(preload).toContain('pauseScenePlayback');
  });

  it('native playback中はReact rAFとViewportのframe要求を止め、UI時刻だけ低頻度同期する', () => {
    const appLogic = read('src/hooks/useAppLogic.ts');
    const viewport = read('src/components/Viewport.tsx');

    expect(appLogic).toContain('shouldRunRendererPlaybackClock');
    expect(appLogic).toContain('nativePlaybackActive');
    expect(viewport).toContain('startScenePlayback');
    expect(viewport).toContain('rust-backend-scene-playback-ui-state');
    expect(viewport).toContain('nativePlaybackActive && isPlaying');
    expect(viewport).toContain('setNativePlaybackActive');
  });
});
