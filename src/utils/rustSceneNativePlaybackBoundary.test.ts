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
    // native再生中はscene再評価のframe要求を止めるガード。以前はrequestTime
    // effect内のインライン条件だったが、shouldRequestRustTimelineSceneEvaluationForTick
    // へ抽出済み（currentTime tickからも低頻度effectからも共有する契約）。
    expect(viewport).toContain('input.nativePlaybackActive && input.isPlaying');
    expect(viewport).toContain('setNativePlaybackActive');
  });

  it('scene変換がblockedの間はcurrentTime tickで診断をpendingへ戻さない', () => {
    // ViewportはcurrentTimeをhook購読しない（毎フレーム再レンダーを避けるため）。
    // currentTime tickごとの再要求は onCurrentTimeTickRef が担うので、
    // このガード契約（revisionが揃うまで再要求しない）はtick経路側で固定する。
    const viewport = read('src/components/Viewport.tsx');
    const tickStart = viewport.indexOf('onCurrentTimeTickRef.current = (time: number) => {');
    const tickEnd = viewport.indexOf('\n  };', tickStart);
    const tickBody = viewport.slice(tickStart, tickEnd);

    expect(tickBody).toContain('shouldRequestRustTimelineSceneEvaluationForTick');
    expect(tickBody).toContain('rustTimelineSceneRevisionAvailable: rustTimelineSceneRevision !== null');
  });

  it('書き出し中のpreview評価を止め、終了時に現在frameを再要求する', () => {
    // currentTime tickによる再要求は onCurrentTimeTickRef が担うため、export中の
    // 停止・終了時の再要求という低頻度契機はrequestTime effect側に残る
    // （currentTimeはdepsから外れuseStore.getState()経由で読むようになった）。
    const viewport = read('src/components/Viewport.tsx');
    const requestEffectEnd = viewport.indexOf(
      'controller.requestTime(useStore.getState().currentTime, projectSettings.fps);',
    );
    const requestEffectStart = viewport.lastIndexOf('useEffect(() => {', requestEffectEnd);
    const requestEffectClosure = viewport.indexOf(']);', requestEffectEnd);
    const requestEffect = viewport.slice(requestEffectStart, requestEffectClosure);

    // (i) ゲート入力にisExporting（書き出し中は再要求しない）が引き続き含まれる。
    expect(requestEffect).toContain('isExporting,');
    // (ii) 書き出し終了・video frame ready復帰の低頻度契機は引き続きdepsに残る
    // （currentTimeが外れ、isExportingがdeps配列の先頭になった）。
    expect(requestEffect).toMatch(/\}, \[\s*isExporting,\s*isPlaying,/);
    expect(requestEffect).toContain('sharedRendererExternalVideoFrameReadyTick,');
  });

  it('native再生開始は楽観的revisionではなくRust側が確定させた常駐revisionを待つ', () => {
    // 計測（diag-debug-1）: replaceScene()はRPC完了前にローカルrevisionを返し、
    // それをそのままstartScenePlaybackへ渡すとscene.evaluateがrevision不一致で
    // 失敗する（"requested revision does not match resident revision"）。
    // リトライも無いため、この1回の失敗でnative再生クロックへの以後の遷移が
    // 事実上失われる。schedulerのonRemoteReadyが「replaceが実際に反映され、かつ
    // supersededでない」revisionだけを通知するので、native再生開始effectは
    // そのrustTimelineSceneResidentRevisionをgate/引数に使う契約とする。
    const viewport = read('src/components/Viewport.tsx');
    const marker = 'const startGeneration = rustNativePlaybackStartGenerationRef.current + 1;';
    const markerIndex = viewport.indexOf(marker);
    expect(markerIndex).toBeGreaterThan(-1);
    const effectStart = viewport.lastIndexOf('useEffect(() => {', markerIndex);
    const effectEnd = viewport.indexOf('\n  }, [', markerIndex);
    const effectEndClose = viewport.indexOf(']);', effectEnd);
    const effectBody = viewport.slice(effectStart, effectEndClose);

    // gate: 常駐revisionが確定するまでnative再生開始を試みない。
    expect(effectBody).toContain('rustTimelineSceneResidentRevision === null');
    // startScenePlaybackへ渡すrevisionも常駐revisionを使う（楽観値を使わない）。
    expect(effectBody).toContain('revision: rustTimelineSceneResidentRevision,');
    // deps配列にも常駐revisionを含め、確定次第effectが再実行される
    // （＝取りこぼしの自動リトライになる）。
    expect(effectBody).toContain('rustTimelineSceneResidentRevision,');
  });
});
