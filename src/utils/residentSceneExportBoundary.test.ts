import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createResidentSceneExportFrameSource } from './residentSceneExportFrameSource';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const residentExportSource = () => read('./residentSceneExportFrameSource.ts');
const encodeControlSource = () => read('./rustBackendVideoEncodeControl.ts');
const encodeBridgeSource = () => read('../../electron/rustVideoEncodeBackendBridge.ts');
const backendDispatchSource = () => read('../../rust-backend/src/rpc_dispatch.rs');
const viewportSource = () => read('../components/Viewport.tsx');

describe('常駐 Rust scene export 境界', () => {
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

  it('Viewportの2D native encodeはresident scene revisionを再利用する', () => {
    const viewport = viewportSource();

    expect(viewport).toContain('createResidentSceneExportFrameSource');
    expect(viewport).toContain("sceneId: 'viewport-rust-timeline'");
    expect(viewport).toContain('revision: rustTimelineSceneRevision');
    expect(viewport).not.toContain('&& !context.hasVideoObjects');
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
});
