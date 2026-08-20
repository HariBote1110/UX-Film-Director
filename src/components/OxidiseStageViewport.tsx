import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { PsdWorldPlacement, StageCamera3D } from '../types';
import { billboardYawRadians } from '../utils/stage3dMath';
import {
  computeBillboardSyncPlan,
  nextBillboardSourceKeys,
  type BillboardSyncEntry,
} from '../utils/stage3d/billboardSyncPlan';
import { screenPointToRay, worldToScreen, type CanvasSize } from '../utils/stage3d/cameraRay';
import { hitTestBillboards, hitVolumeDepth, type OrientedBoxBillboard } from '../utils/stage3d/hitTest';
import {
  createOrbitCamera,
  getEyeLook,
  isOrbitCameraSettled,
  pan,
  rotate,
  setState as setOrbitCameraState,
  sphericalFromEyeTarget,
  update as updateOrbitCamera,
  zoom,
  type OrbitCameraModel,
} from '../utils/stage3d/orbitCamera';
import {
  buildGridFloorMesh,
  buildTranslateGizmoMesh,
  translateGeometry,
} from '../utils/stage3d/stageMeshes';
import { shouldApplyIncomingStageCamera } from '../utils/stage3d/stageCameraSyncPolicy';
import {
  begin as beginGizmoDrag,
  drag as dragGizmo,
  end as endGizmoDrag,
  type GizmoConstraint,
  type GizmoDragSession,
} from '../utils/stage3d/translateGizmo';
import { useStore } from '../store/useStore';

export type BillboardTextureEntry = {
  id: string;
  sourceKey: string;
  rgba: Uint8Array;
  placement: PsdWorldPlacement;
  /** 合成画像のピクセル寸法（アスペクト比の算出用） */
  widthPx: number;
  heightPx: number;
};

export interface OxidiseStageSnapshot {
  data: Uint8Array;
  width: number;
  height: number;
}

export type OxidiseStageViewportHandle = {
  getCanvas: () => HTMLCanvasElement | null;
  /** PSDレイヤーの合成結果が更新された後に呼び出す */
  syncBillboards: (entries: BillboardTextureEntry[], stageCamera: StageCamera3D) => void;
  /** readbackRgba経由でのエクスポート/スナップショット取得(呼び出し時点のシーンを描画してから読み戻す) */
  getSnapshotRgba: () => Promise<OxidiseStageSnapshot | null>;
};

type OxidiseStageViewportProps = {
  width: number;
  height: number;
  /** Preview CSS scale (project pixels to panel), same as Pixi canvas */
  displayScale: number;
  stageCamera3D: StageCamera3D;
  setStageCamera3D: (patch: {
    position?: Partial<StageCamera3D['position']>;
    target?: Partial<StageCamera3D['target']>;
  }) => void;
  isExporting: boolean;
  /** 3D ワールド配置 PSD のうち、移動ギズモを付けるオブジェクト ID */
  selectedBillboardId: string | null;
  onBillboardWorldPositionChange: (id: string, position: { x: number; y: number; z: number }) => void;
};

const STAGE_BACKGROUND = { r: 0x1e / 255, g: 0x1e / 255, b: 0x1e / 255 };
const FOV_Y_DEG = 45;
const FOV_Y_RAD = (FOV_Y_DEG * Math.PI) / 180;
const NEAR = 0.1;
const FAR = 500;
const GRID_MESH_ID = 'stage-grid-floor';
const GIZMO_MESH_ID = 'stage-translate-gizmo';
const GIZMO_AXIS_HIT_PX = 14;
const GIZMO_PLANE_HIT_PX = 10;
const GIZMO_ARM_LENGTH = 1.0;

const ORBIT_CONFIG = {
  enableDamping: true,
  dampingFactor: 0.08,
  minDistance: 0.05,
  maxDistance: 5000,
  minPolarAngle: 0.001,
  maxPolarAngle: Math.PI - 0.001,
};

interface BillboardPlacementState {
  position: { x: number; y: number; z: number };
  width: number;
  height: number;
  depth: number;
  yawRadians: number;
}

/** StageRenderer の型は wasm パッケージが動的に読み込まれるまで確定しないため any 経由で扱う。 */
type StageRendererInstance = {
  resize: (width: number, height: number) => void;
  setCamera: (
    eyeX: number, eyeY: number, eyeZ: number,
    lookX: number, lookY: number, lookZ: number,
    fovYRad: number, near: number, far: number
  ) => void;
  setClearColour: (r: number, g: number, b: number) => void;
  syncBillboard: (
    id: string, sourceKey: string, rgba: Uint8Array,
    widthPx: number, heightPx: number,
    worldX: number, worldY: number, worldZ: number,
    yawRad: number, worldWidth: number, worldHeight: number, opacity: number
  ) => void;
  removeBillboard: (id: string) => void;
  uploadMeshChunk: (
    id: string, vertices: Float32Array, colours: Uint8Array, indices: Uint32Array, layer: number
  ) => void;
  removeMeshChunk: (id: string) => void;
  render: () => void;
  readbackRgba: () => Promise<Uint8Array>;
};

let stageRendererModulePromise: Promise<{
  create: (canvas: HTMLCanvasElement, width: number, height: number) => Promise<StageRendererInstance>;
}> | null = null;

const loadStageRendererClass = (): Promise<{
  create: (canvas: HTMLCanvasElement, width: number, height: number) => Promise<StageRendererInstance>;
}> => {
  if (!stageRendererModulePromise) {
    stageRendererModulePromise = import('../wasm/oxidise/oxidise_wasm.js').then(async (mod) => {
      if (typeof mod.default === 'function') {
        await mod.default();
      }
      return mod.StageRenderer as unknown as {
        create: (canvas: HTMLCanvasElement, width: number, height: number) => Promise<StageRendererInstance>;
      };
    });
  }
  return stageRendererModulePromise;
};

type DragMode =
  | { kind: 'orbit-rotate' }
  | { kind: 'orbit-pan' }
  | { kind: 'gizmo'; session: GizmoDragSession; billboardId: string };

const clampPixelRatio = (): number => Math.min(window.devicePixelRatio || 1, 2);

export const OxidiseStageViewport = forwardRef<OxidiseStageViewportHandle, OxidiseStageViewportProps>(
  function OxidiseStageViewport(
    {
      width,
      height,
      displayScale,
      stageCamera3D,
      setStageCamera3D,
      isExporting,
      selectedBillboardId,
      onBillboardWorldPositionChange,
    },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rendererRef = useRef<StageRendererInstance | null>(null);
    const rafRef = useRef<number>(0);
    const lastFrameTimeRef = useRef<number | null>(null);

    const cameraModelRef = useRef<OrbitCameraModel>(
      createOrbitCamera(sphericalFromEyeTarget(stageCamera3D.position, stageCamera3D.target), ORBIT_CONFIG)
    );
    const userAdjustingRef = useRef(false);
    const dragModeRef = useRef<DragMode | null>(null);
    const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
    /** ドラッグ終了後、ダンピングの積み残しが収束(静止)し次第 store へ永続化する必要があるか。 */
    const settlePendingRef = useRef(false);
    /**
     * 直近にローカルの軌道モデルへ適用済み、または store へ永続化済みの stageCamera3D。
     * syncBillboards/props経由の再適用が必要かどうかの比較基準に使う
     * (shouldApplyIncomingStageCamera 参照)。
     */
    const lastKnownStageCameraRef = useRef<StageCamera3D>(stageCamera3D);
    const setStageCamera3DRef = useRef(setStageCamera3D);
    setStageCamera3DRef.current = setStageCamera3D;

    const billboardSourceKeysRef = useRef<Map<string, string>>(new Map());
    const billboardPlacementsRef = useRef<Map<string, BillboardPlacementState>>(new Map());

    const widthRef = useRef(width);
    widthRef.current = width;
    const heightRef = useRef(height);
    heightRef.current = height;
    const displayScaleRef = useRef(displayScale);
    displayScaleRef.current = displayScale;
    const selectedBillboardIdRef = useRef<string | null>(null);
    selectedBillboardIdRef.current = selectedBillboardId;
    const onBillboardWorldPositionChangeRef = useRef(onBillboardWorldPositionChange);
    onBillboardWorldPositionChangeRef.current = onBillboardWorldPositionChange;
    const isExportingRef = useRef(isExporting);
    isExportingRef.current = isExporting;

    const canvasSize = (): CanvasSize => ({
      width: canvasRef.current?.width ?? Math.max(1, widthRef.current),
      height: canvasRef.current?.height ?? Math.max(1, heightRef.current),
    });

    const currentEyeLook = () => getEyeLook(cameraModelRef.current);

    /** stageCamera3D 相当のカルテシアン position/target をモデルへ強制反映する(旧 syncBillboards と同じ挙動)。 */
    const applyCartesianCamera = (position: StageCamera3D['position'], target: StageCamera3D['target']) => {
      cameraModelRef.current = setOrbitCameraState(
        cameraModelRef.current,
        sphericalFromEyeTarget(position, target)
      );
      lastKnownStageCameraRef.current = { position: { ...position }, target: { ...target } };
    };

    /**
     * incoming(store 由来)の stageCamera3D を、必要なときだけモデルへ適用する。
     * ドラッグ中は無視し、直近に適用/永続化した値と実質同一なら no-op とすることで、
     * 無関係な再レンダーがローカルの最新カメラ状態を巻き戻すのを防ぐ。
     */
    const applyIncomingStageCameraIfNeeded = (incoming: StageCamera3D) => {
      if (
        !shouldApplyIncomingStageCamera(lastKnownStageCameraRef.current, incoming, userAdjustingRef.current)
      ) {
        return;
      }
      applyCartesianCamera(incoming.position, incoming.target);
    };

    const uploadGizmoForSelection = () => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const selectedId = selectedBillboardIdRef.current;
      const placement = selectedId ? billboardPlacementsRef.current.get(selectedId) : undefined;
      if (!selectedId || !placement || isExportingRef.current) {
        renderer.removeMeshChunk(GIZMO_MESH_ID);
        return;
      }
      const geometry = translateGeometry(
        buildTranslateGizmoMesh({ length: GIZMO_ARM_LENGTH }),
        placement.position
      );
      renderer.uploadMeshChunk(GIZMO_MESH_ID, geometry.vertices, geometry.colours, geometry.indices, 0);
    };

    useImperativeHandle(ref, () => ({
      getCanvas: () => canvasRef.current,
      syncBillboards: (entries, stageCamera) => {
        const renderer = rendererRef.current;
        if (!renderer) return;

        applyIncomingStageCameraIfNeeded(stageCamera);

        const syncEntries: BillboardSyncEntry[] = entries.map((entry) => {
          const aspect = entry.heightPx > 0 ? entry.widthPx / entry.heightPx : 1;
          const worldHeight = Math.max(0.01, entry.placement.scale * 2);
          const worldWidth = worldHeight * aspect;
          const yawRadians = entry.placement.billboard
            ? billboardYawRadians(
                stageCamera.position.x,
                stageCamera.position.z,
                entry.placement.position.x,
                entry.placement.position.z,
                entry.placement.rotationYDeg
              )
            : (entry.placement.rotationYDeg * Math.PI) / 180;
          return {
            id: entry.id,
            sourceKey: entry.sourceKey,
            rgba: entry.rgba,
            widthPx: entry.widthPx,
            heightPx: entry.heightPx,
            worldX: entry.placement.position.x,
            worldY: entry.placement.position.y,
            worldZ: entry.placement.position.z,
            yawRadians,
            worldWidth,
            worldHeight,
            opacity: 1,
          };
        });

        const plan = computeBillboardSyncPlan(billboardSourceKeysRef.current, syncEntries);
        for (const id of plan.removes) {
          renderer.removeBillboard(id);
          billboardPlacementsRef.current.delete(id);
        }
        for (const { entry } of plan.syncs) {
          renderer.syncBillboard(
            entry.id, entry.sourceKey, entry.rgba,
            entry.widthPx, entry.heightPx,
            entry.worldX, entry.worldY, entry.worldZ,
            entry.yawRadians, entry.worldWidth, entry.worldHeight, entry.opacity
          );
          billboardPlacementsRef.current.set(entry.id, {
            position: { x: entry.worldX, y: entry.worldY, z: entry.worldZ },
            width: entry.worldWidth,
            height: entry.worldHeight,
            depth: hitVolumeDepth(entry.worldWidth, entry.worldHeight),
            yawRadians: entry.yawRadians,
          });
        }
        billboardSourceKeysRef.current = nextBillboardSourceKeys(syncEntries);

        uploadGizmoForSelection();
      },
      getSnapshotRgba: async () => {
        const renderer = rendererRef.current;
        const canvas = canvasRef.current;
        if (!renderer || !canvas) return null;
        renderer.render();
        const data = await renderer.readbackRgba();
        return { data, width: canvas.width, height: canvas.height };
      },
    }));

    // --- 初期化・破棄 ---
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || width <= 0 || height <= 0) return;
      let disposed = false;

      const pixelRatio = clampPixelRatio();
      const physicalWidth = Math.max(1, Math.round(width * pixelRatio));
      const physicalHeight = Math.max(1, Math.round(height * pixelRatio));
      canvas.width = physicalWidth;
      canvas.height = physicalHeight;
      canvas.style.width = `${width * displayScaleRef.current}px`;
      canvas.style.height = `${height * displayScaleRef.current}px`;

      loadStageRendererClass()
        .then((StageRenderer) => StageRenderer.create(canvas, physicalWidth, physicalHeight))
        .then((renderer) => {
          if (disposed) return;
          rendererRef.current = renderer;
          renderer.setClearColour(STAGE_BACKGROUND.r, STAGE_BACKGROUND.g, STAGE_BACKGROUND.b);
          const grid = buildGridFloorMesh();
          renderer.uploadMeshChunk(GRID_MESH_ID, grid.vertices, grid.colours, grid.indices, 0);
          uploadGizmoForSelection();

          const tick = (now: number) => {
            rafRef.current = requestAnimationFrame(tick);
            const dt = lastFrameTimeRef.current === null ? 0 : now - lastFrameTimeRef.current;
            lastFrameTimeRef.current = now;
            cameraModelRef.current = updateOrbitCamera(cameraModelRef.current, dt);
            const { eye, look } = getEyeLook(cameraModelRef.current);
            renderer.setCamera(eye.x, eye.y, eye.z, look.x, look.y, look.z, FOV_Y_RAD, NEAR, FAR);
            renderer.render();

            // ドラッグ終了直後はダンピングの積み残しがまだ残っているため、その場で
            // setStageCamera3D しても「最終」姿勢にはならない。積み残しが収束(静止)
            // し切ってから、そのときの eye/target を確定値として store へ永続化する。
            if (!userAdjustingRef.current && settlePendingRef.current && isOrbitCameraSettled(cameraModelRef.current)) {
              settlePendingRef.current = false;
              const settled: StageCamera3D = {
                position: { x: eye.x, y: eye.y, z: eye.z },
                target: { x: look.x, y: look.y, z: look.z },
              };
              lastKnownStageCameraRef.current = settled;
              setStageCamera3DRef.current({ position: settled.position, target: settled.target });
            }
          };
          rafRef.current = requestAnimationFrame(tick);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[OxidiseStageViewport] StageRenderer initialisation failed', err);
        });

      return () => {
        disposed = true;
        cancelAnimationFrame(rafRef.current);
        lastFrameTimeRef.current = null;
        rendererRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- リサイズ ---
    useEffect(() => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (!canvas || width <= 0 || height <= 0) return;
      const pixelRatio = clampPixelRatio();
      const physicalWidth = Math.max(1, Math.round(width * pixelRatio));
      const physicalHeight = Math.max(1, Math.round(height * pixelRatio));
      canvas.width = physicalWidth;
      canvas.height = physicalHeight;
      canvas.style.width = `${width * displayScale}px`;
      canvas.style.height = `${height * displayScale}px`;
      renderer?.resize(physicalWidth, physicalHeight);
    }, [width, height, displayScale]);

    // --- 選択・書き出し状態が変わったらギズモを再構築 ---
    useEffect(() => {
      uploadGizmoForSelection();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedBillboardId, isExporting]);

    // --- stageCamera3D(React state)からの反映。ユーザーがドラッグ中/書き出し中は上書きしない ---
    useEffect(() => {
      if (isExporting) return;
      applyIncomingStageCameraIfNeeded(stageCamera3D);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stageCamera3D, isExporting]);

    // --- ポインタ操作: 軌道カメラ(rotate/pan/zoom) + 移動ギズモ + ビルボード選択 ---
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const beginCameraAdjust = () => {
        userAdjustingRef.current = true;
      };
      const endCameraAdjust = () => {
        userAdjustingRef.current = false;
        const { eye, look } = currentEyeLook();
        const current: StageCamera3D = {
          position: { x: eye.x, y: eye.y, z: eye.z },
          target: { x: look.x, y: look.y, z: look.z },
        };
        // ドラッグ終了直後の暫定値を即座に反映する(素早いフィードバック用)。
        // ダンピングの積み残しがまだ残っている場合、これは最終姿勢ではない可能性が
        // あるため、収束後に tick() 側で確定値を再度永続化する(settlePendingRef)。
        lastKnownStageCameraRef.current = current;
        setStageCamera3D({ position: current.position, target: current.target });
        settlePendingRef.current = true;
      };

      const pickGizmoConstraint = (point: { x: number; y: number }): GizmoConstraint | null => {
        const selectedId = selectedBillboardIdRef.current;
        if (!selectedId || isExportingRef.current) return null;
        const placement = billboardPlacementsRef.current.get(selectedId);
        if (!placement) return null;
        const { eye, look } = currentEyeLook();
        const size = canvasSize();
        const params = { eye, look, fovYDeg: FOV_Y_DEG };
        const origin = worldToScreen(placement.position, size, params);
        if (!origin) return null;

        const axisDirs: Array<{ axis: 'x' | 'y' | 'z'; dir: { x: number; y: number; z: number } }> = [
          { axis: 'x', dir: { x: 1, y: 0, z: 0 } },
          { axis: 'y', dir: { x: 0, y: 1, z: 0 } },
          { axis: 'z', dir: { x: 0, y: 0, z: 1 } },
        ];
        let best: { axis: 'x' | 'y' | 'z'; distance: number } | null = null;
        for (const { axis, dir } of axisDirs) {
          const tip = worldToScreen(
            {
              x: placement.position.x + dir.x * GIZMO_ARM_LENGTH,
              y: placement.position.y + dir.y * GIZMO_ARM_LENGTH,
              z: placement.position.z + dir.z * GIZMO_ARM_LENGTH,
            },
            size,
            params
          );
          if (!tip) continue;
          const distance = distanceToSegment(point, origin, tip);
          if (!best || distance < best.distance) best = { axis, distance };
        }
        if (best && best.distance <= GIZMO_AXIS_HIT_PX) {
          return { kind: 'axis', axis: best.axis };
        }
        const originDistance = Math.hypot(point.x - origin.x, point.y - origin.y);
        if (originDistance <= GIZMO_PLANE_HIT_PX) {
          return { kind: 'plane', plane: 'xz' };
        }
        return null;
      };

      const pickBillboard = (point: { x: number; y: number }): string | null => {
        const { eye, look } = currentEyeLook();
        const size = canvasSize();
        const ray = screenPointToRay(point, size, { eye, look, fovYDeg: FOV_Y_DEG });
        const boxes: OrientedBoxBillboard[] = Array.from(billboardPlacementsRef.current.entries()).map(
          ([id, placement]) => ({
            id,
            centre: placement.position,
            yawRadians: placement.yawRadians,
            width: placement.width,
            height: placement.height,
            depth: placement.depth,
          })
        );
        const hit = hitTestBillboards(ray, boxes);
        return hit?.id ?? null;
      };

      const pointFromEvent = (e: PointerEvent): { x: number; y: number } => {
        const rect = canvas.getBoundingClientRect();
        const size = canvasSize();
        return {
          x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * size.width,
          y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * size.height,
        };
      };

      const onPointerDown = (e: PointerEvent) => {
        if (isExportingRef.current) return;
        canvas.setPointerCapture(e.pointerId);
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        const point = pointFromEvent(e);

        if (e.button === 0) {
          const selectedId = selectedBillboardIdRef.current;
          const constraint = pickGizmoConstraint(point);
          if (selectedId && constraint) {
            const placement = billboardPlacementsRef.current.get(selectedId)!;
            const { eye, look } = currentEyeLook();
            const ray = screenPointToRay(point, canvasSize(), { eye, look, fovYDeg: FOV_Y_DEG });
            useStore.getState().pushHistory();
            dragModeRef.current = {
              kind: 'gizmo',
              billboardId: selectedId,
              session: beginGizmoDrag(constraint, ray, placement.position),
            };
            return;
          }
          const pickedId = pickBillboard(point);
          if (pickedId) {
            useStore.getState().selectObject(pickedId);
            return;
          }
          dragModeRef.current = { kind: 'orbit-rotate' };
          beginCameraAdjust();
          return;
        }
        // 右ボタン(または中ボタン): パン
        dragModeRef.current = { kind: 'orbit-pan' };
        beginCameraAdjust();
      };

      const onPointerMove = (e: PointerEvent) => {
        const mode = dragModeRef.current;
        if (!mode) return;
        const last = lastPointerRef.current;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };

        if (mode.kind === 'gizmo') {
          const point = pointFromEvent(e);
          const { eye, look } = currentEyeLook();
          const ray = screenPointToRay(point, canvasSize(), { eye, look, fovYDeg: FOV_Y_DEG });
          const nextPosition = dragGizmo(mode.session, ray);
          const placement = billboardPlacementsRef.current.get(mode.billboardId);
          if (placement) {
            billboardPlacementsRef.current.set(mode.billboardId, { ...placement, position: nextPosition });
          }
          onBillboardWorldPositionChangeRef.current?.(mode.billboardId, nextPosition);
          uploadGizmoForSelection();
          return;
        }

        if (!last) return;
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        const rotateSpeed = 0.005;
        const panSpeed = 0.0025 * Math.max(0.05, cameraModelRef.current.state.radius);
        if (mode.kind === 'orbit-rotate') {
          cameraModelRef.current = rotate(cameraModelRef.current, -dx * rotateSpeed, -dy * rotateSpeed);
        } else if (mode.kind === 'orbit-pan') {
          cameraModelRef.current = pan(cameraModelRef.current, -dx * panSpeed, dy * panSpeed);
        }
      };

      const onPointerUp = (e: PointerEvent) => {
        const mode = dragModeRef.current;
        if (!mode) return;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);

        if (mode.kind === 'gizmo') {
          const point = pointFromEvent(e);
          const { eye, look } = currentEyeLook();
          const ray = screenPointToRay(point, canvasSize(), { eye, look, fovYDeg: FOV_Y_DEG });
          const finalPosition = endGizmoDrag(mode.session, ray);
          onBillboardWorldPositionChangeRef.current?.(mode.billboardId, finalPosition);
        } else {
          endCameraAdjust();
        }
        dragModeRef.current = null;
        lastPointerRef.current = null;
      };

      const onWheel = (e: WheelEvent) => {
        if (isExportingRef.current) return;
        e.preventDefault();
        beginCameraAdjust();
        cameraModelRef.current = zoom(cameraModelRef.current, e.deltaY);
        endCameraAdjust();
      };

      const onContextMenu = (e: MouseEvent) => e.preventDefault();

      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerUp);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('contextmenu', onContextMenu);

      return () => {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('contextmenu', onContextMenu);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setStageCamera3D]);

    return (
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          position: 'absolute',
          inset: 0,
          margin: 'auto',
          zIndex: 5,
          touchAction: 'none',
        }}
      />
    );
  }
);

/** 点 p からスクリーン空間の線分 a-b までの距離(px)。 */
const distanceToSegment = (
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number => {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  const projX = a.x + abx * t;
  const projY = a.y + aby * t;
  return Math.hypot(p.x - projX, p.y - projY);
};
