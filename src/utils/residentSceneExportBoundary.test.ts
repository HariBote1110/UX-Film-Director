import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const residentExportSource = () => read('./residentSceneExportFrameSource.ts');
const encodeControlSource = () => read('./rustBackendVideoEncodeControl.ts');
const encodeBridgeSource = () => read('../../electron/rustVideoEncodeBackendBridge.ts');
const backendDispatchSource = () => read('../../rust-backend/src/rpc_dispatch.rs');

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
});
