import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createResidentSceneExportFrameSource } from './residentSceneExportFrameSource';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const residentExportSource = () => read('./residentSceneExportFrameSource.ts');
const encodeControlSource = () => read('./rustBackendVideoEncodeControl.ts');
const encodeBridgeSource = () => read('../../electron/rustVideoEncodeBackendBridge.ts');
const backendDispatchSource = () => read('../../rust-backend/src/rpc_dispatch.rs');
const viewportSource = () => read('../components/Viewport.tsx');
const exportFrameSource = () => read('./sharedRendererExportFrameSource.ts');
const previewBridgeSource = () => read('./sharedRendererPreviewBridge.ts');
const mainSource = () => read('../main.tsx');

describe('常駐 Rust scene export 境界', () => {
  it('production evaluation bridgeからTS snapshot serializerをimportしない', () => {
    const exportSource = exportFrameSource();
    const bridgeSource = previewBridgeSource();

    expect(exportSource).toContain("from './sharedRendererEvaluatedExportSession'");
    expect(exportSource).not.toMatch(/import\s*\{\s*buildSharedRendererExportSession\s*,/);
    expect(bridgeSource).not.toContain("from './rustSceneSnapshot'");
  });

  it('serializer referenceへ到達するE2E entryをdevelopment限定にする', () => {
    const main = mainSource();

    expect(main).toMatch(/import\.meta\.env\.DEV\s*&&\s*urlSearchParams\.has\('realisticHeavyEditE2e'\)/);
    expect(main).toMatch(/import\.meta\.env\.DEV\s*&&\s*urlSearchParams\.has\('rustTimelineGeneratedE2e'\)/);
    expect(main).toMatch(/import\.meta\.env\.DEV\s*&&\s*urlSearchParams\.has\('psdImportParityE2e'\)/);
  });

  it('各frameでChromiumのsnapshotを再構築せず、常駐scene識別子をnative encoderへ渡す', () => {
    const source = residentExportSource();

    expect(source).toContain('createResidentSceneExportFrameSource');
    expect(source).toContain('writeResidentSceneEncodeFrame');
    expect(source).toContain('sceneId');
    expect(source).toContain('revision');
    expect(source).toContain('frameIndex');
    expect(source).not.toContain('buildRustSceneSnapshotForTimeline');
    expect(source).not.toContain('buildSharedRendererExportSession');
  });

  it('sceneId/revision/frameIndexを持つ専用native encode payloadをrendererからRust RPCまで維持する', () => {
    const control = encodeControlSource();
    const bridge = encodeBridgeSource();
    const dispatch = backendDispatchSource();

    expect(control).toContain('writeResidentSceneEncodeFrame');
    expect(control).toContain('sceneId: string');
    expect(control).toContain('revision: number');
    expect(control).toContain('frameIndex: number');
    expect(bridge).toContain("callRustVideoEncodeRpc('encode.writeResidentSceneFrame'");
    expect(dispatch).toContain('"encode.writeResidentSceneFrame"');
  });

  it('Viewportの2D native encodeはexport専用sceneの確認済みrevisionを再利用する', () => {
    const viewport = viewportSource();

    expect(viewport).toContain('createResidentSceneExportFrameSource');
    expect(viewport).toContain('confirmSceneForExport');
    expect(viewport).toContain('confirmedScene,');
    expect(viewport).toContain('viewport-rust-timeline-export-');
    expect(viewport).toContain("'residentSceneConfirming'");
    expect(viewport).toContain("'residentSceneConfirmationFailed'");
    expect(viewport).not.toContain('&& !context.hasVideoObjects');
  });

  it('scene-builder cut-overでもresident scene経路を維持し、未確認時だけ既存fallbackへ区別して落とす', () => {
    const viewport = viewportSource();

    expect(viewport).not.toContain('residentSceneDisabledUnderSceneBuilderCutover');
    expect(viewport).toContain("'residentSceneUnacknowledged'");
    expect(viewport).not.toContain('rustTimelineSceneExportRevision === null');
  });

  it('frame要求をsnapshotなしのresident scene encode payloadへ変換する', async () => {
    const source = createResidentSceneExportFrameSource({
      sceneId: 'export-scene',
      revision: 12,
    });
    expect(source.encodeTarget).toBe('iosurfaceVideoToolbox');

    await expect(source.renderEncodeFrame?.({
      encodeSessionId: 'encode-1',
      frameIndex: 42,
      timestampUs: 700_000,
      time: 0.7,
      width: 1920,
      height: 1080,
      objects: [],
    })).resolves.toMatchObject({
      timestamp: 700_000,
      residentSceneEncodeFramePayload: {
        sessionId: 'encode-1',
        sceneId: 'export-scene',
        revision: 12,
        frameIndex: 42,
      },
    });
  });

  it('export開始時のscene.replace確認結果を最初のresident frameへ使う', async () => {
    let confirm!: (value: { sceneId: string; revision: number }) => void;
    const confirmedScene = new Promise<{ sceneId: string; revision: number }>((resolve) => {
      confirm = resolve;
    });
    const source = createResidentSceneExportFrameSource({
      sceneId: 'export-scene',
      revision: 0,
      confirmedScene,
    });
    const frame = source.renderEncodeFrame?.({
      encodeSessionId: 'encode-1', frameIndex: 42, timestampUs: 700_000, time: 0.7,
      width: 1920, height: 1080, objects: [],
    });
    confirm({ sceneId: 'export-scene', revision: 12 });

    await expect(frame).resolves.toMatchObject({
      residentSceneEncodeFramePayload: { sceneId: 'export-scene', revision: 12 },
    });
  });
});
