import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { PsdWorldPlacement, StageCamera3D } from '../types';
import { billboardYawRadians } from '../utils/stage3dMath';
import { useStore } from '../store/useStore';

export type BillboardTextureEntry = {
  id: string;
  canvas: HTMLCanvasElement;
  placement: PsdWorldPlacement;
  /** Pixel size of canvas (for aspect ratio) */
  widthPx: number;
  heightPx: number;
};

export type ThreeStageViewportHandle = {
  getCanvas: () => HTMLCanvasElement | null;
  /** Call after Pixi has rasterised PSD layers */
  syncBillboards: (entries: BillboardTextureEntry[], stageCamera: StageCamera3D) => void;
};

type ThreeStageViewportProps = {
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

const STAGE_BACKGROUND = 0x1e1e1e;

const BILLBOARD_MESH_PREFIX = 'psd-billboard-';

export const ThreeStageViewport = forwardRef<ThreeStageViewportHandle, ThreeStageViewportProps>(
  function ThreeStageViewport(
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
    const mountRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const transformControlsRef = useRef<TransformControls | null>(null);
    const meshMapRef = useRef<Map<string, THREE.Mesh>>(new Map());
    const textureMapRef = useRef<Map<string, THREE.CanvasTexture>>(new Map());
    const rafRef = useRef<number>(0);
    const userAdjustingRef = useRef(false);
    const displayScaleRef = useRef(displayScale);
    displayScaleRef.current = displayScale;
    const selectedBillboardIdRef = useRef<string | null>(null);
    selectedBillboardIdRef.current = selectedBillboardId;
    const onBillboardWorldPositionChangeRef = useRef(onBillboardWorldPositionChange);
    onBillboardWorldPositionChangeRef.current = onBillboardWorldPositionChange;
    const isExportingRef = useRef(isExporting);
    isExportingRef.current = isExporting;

    useImperativeHandle(ref, () => ({
      getCanvas: () => rendererRef.current?.domElement ?? null,
      syncBillboards: (entries, stageCamera) => {
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!scene || !camera) return;

        camera.position.set(
          stageCamera.position.x,
          stageCamera.position.y,
          stageCamera.position.z
        );
        if (controlsRef.current) {
          controlsRef.current.target.set(
            stageCamera.target.x,
            stageCamera.target.y,
            stageCamera.target.z
          );
          controlsRef.current.update();
        } else {
          camera.lookAt(
            stageCamera.target.x,
            stageCamera.target.y,
            stageCamera.target.z
          );
        }

        const activeIds = new Set(entries.map((e) => e.id));

        meshMapRef.current.forEach((mesh, id) => {
          if (!activeIds.has(id)) {
            scene.remove(mesh);
            const mat = mesh.material as THREE.MeshBasicMaterial;
            mat.map?.dispose();
            mat.dispose();
            mesh.geometry.dispose();
            meshMapRef.current.delete(id);
            textureMapRef.current.delete(id);
          }
        });

        for (const entry of entries) {
          let mesh = meshMapRef.current.get(entry.id);
          let tex = textureMapRef.current.get(entry.id);

          if (!tex) {
            tex = new THREE.CanvasTexture(entry.canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.needsUpdate = true;
            textureMapRef.current.set(entry.id, tex);
          } else {
            tex.image = entry.canvas;
            tex.needsUpdate = true;
          }

          const aspect =
            entry.heightPx > 0 ? entry.widthPx / entry.heightPx : 1;
          const planeH = Math.max(0.01, entry.placement.scale * 2);
          const planeW = planeH * aspect;

          if (!mesh) {
            const geom = new THREE.PlaneGeometry(planeW, planeH);
            const mat = new THREE.MeshBasicMaterial({
              map: tex,
              transparent: true,
              side: THREE.DoubleSide,
              depthWrite: true
            });
            mesh = new THREE.Mesh(geom, mat);
            mesh.name = `${BILLBOARD_MESH_PREFIX}${entry.id}`;
            scene.add(mesh);
            meshMapRef.current.set(entry.id, mesh);
          } else {
            const geom = mesh.geometry as THREE.PlaneGeometry;
            if (Math.abs(geom.parameters.width - planeW) > 0.001 || Math.abs(geom.parameters.height - planeH) > 0.001) {
              geom.dispose();
              mesh.geometry = new THREE.PlaneGeometry(planeW, planeH);
            }
            const mat = mesh.material as THREE.MeshBasicMaterial;
            mat.map = tex;
            mat.needsUpdate = true;
          }

          mesh.position.set(
            entry.placement.position.x,
            entry.placement.position.y,
            entry.placement.position.z
          );

          if (entry.placement.billboard) {
            const yaw = billboardYawRadians(
              camera.position.x,
              camera.position.z,
              entry.placement.position.x,
              entry.placement.position.z,
              entry.placement.rotationYDeg
            );
            mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
          } else {
            mesh.rotation.set(0, (entry.placement.rotationYDeg * Math.PI) / 180, 0);
          }
        }

        const tc = transformControlsRef.current;
        if (tc) {
          if (isExportingRef.current) {
            tc.detach();
            tc.enabled = false;
          } else {
            tc.enabled = true;
            const sel = selectedBillboardIdRef.current;
            if (sel && meshMapRef.current.has(sel)) {
              const mesh = meshMapRef.current.get(sel)!;
              if (tc.object !== mesh) {
                tc.attach(mesh);
              }
            } else {
              tc.detach();
            }
          }
        }
      }
    }));

    useEffect(() => {
      const mount = mountRef.current;
      if (!mount || width <= 0 || height <= 0) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(STAGE_BACKGROUND);

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);
      camera.position.set(
        stageCamera3D.position.x,
        stageCamera3D.position.y,
        stageCamera3D.position.z
      );

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height, false);
      const scale = displayScaleRef.current;
      renderer.domElement.style.width = `${width * scale}px`;
      renderer.domElement.style.height = `${height * scale}px`;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      mount.appendChild(renderer.domElement);

      const amb = new THREE.AmbientLight(0xffffff, 0.55);
      scene.add(amb);
      const dir = new THREE.DirectionalLight(0xffffff, 0.85);
      dir.position.set(4, 10, 6);
      scene.add(dir);

      const grid = new THREE.GridHelper(40, 40, 0x444444, 0x333333);
      scene.add(grid);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(
        stageCamera3D.target.x,
        stageCamera3D.target.y,
        stageCamera3D.target.z
      );
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.addEventListener('start', () => {
        userAdjustingRef.current = true;
      });
      controls.addEventListener('end', () => {
        userAdjustingRef.current = false;
        setStageCamera3D({
          position: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z
          },
          target: {
            x: controls.target.x,
            y: controls.target.y,
            z: controls.target.z
          }
        });
      });

      const transformControls = new TransformControls(camera, renderer.domElement);
      transformControls.setMode('translate');
      transformControls.setSpace('world');
      transformControls.setSize(1.15);
      transformControls.enabled = true;
      transformControlsRef.current = transformControls;
      scene.add(transformControls.getHelper());

      transformControls.addEventListener('mouseDown', () => {
        useStore.getState().pushHistory();
        controls.enabled = false;
      });
      transformControls.addEventListener('mouseUp', () => {
        controls.enabled = true;
      });
      transformControls.addEventListener('objectChange', () => {
        const mesh = transformControls.object as THREE.Mesh | null;
        if (!mesh?.name.startsWith(BILLBOARD_MESH_PREFIX)) return;
        const id = mesh.name.slice(BILLBOARD_MESH_PREFIX.length);
        const pos = mesh.position;
        onBillboardWorldPositionChangeRef.current?.(id, { x: pos.x, y: pos.y, z: pos.z });
      });

      sceneRef.current = scene;
      cameraRef.current = camera;
      rendererRef.current = renderer;
      controlsRef.current = controls;

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        if (!cameraRef.current || !rendererRef.current || !sceneRef.current) return;
        controlsRef.current?.update();
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      };
      tick();

      return () => {
        cancelAnimationFrame(rafRef.current);
        const tcCleanup = transformControlsRef.current;
        if (tcCleanup) {
          scene.remove(tcCleanup.getHelper());
          tcCleanup.dispose();
        }
        transformControlsRef.current = null;
        controls.dispose();
        meshMapRef.current.forEach((mesh) => {
          scene.remove(mesh);
          const mat = mesh.material as THREE.MeshBasicMaterial;
          mat.map?.dispose();
          mat.dispose();
          mesh.geometry.dispose();
        });
        meshMapRef.current.clear();
        textureMapRef.current.forEach((t) => t.dispose());
        textureMapRef.current.clear();
        renderer.dispose();
        if (renderer.domElement.parentElement === mount) {
          mount.removeChild(renderer.domElement);
        }
        sceneRef.current = null;
        cameraRef.current = null;
        rendererRef.current = null;
        controlsRef.current = null;
      };
    }, []);

    useEffect(() => {
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      if (!renderer || !camera || width <= 0 || height <= 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = `${width * displayScale}px`;
      renderer.domElement.style.height = `${height * displayScale}px`;
    }, [width, height, displayScale]);

    useEffect(() => {
      if (controlsRef.current) {
        controlsRef.current.enabled = !isExporting;
      }
      if (transformControlsRef.current) {
        transformControlsRef.current.enabled = !isExporting;
        if (isExporting) {
          transformControlsRef.current.detach();
        }
      }
    }, [isExporting]);

    useEffect(() => {
      if (userAdjustingRef.current || isExporting) return;
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      camera.position.set(
        stageCamera3D.position.x,
        stageCamera3D.position.y,
        stageCamera3D.position.z
      );
      controls.target.set(
        stageCamera3D.target.x,
        stageCamera3D.target.y,
        stageCamera3D.target.z
      );
      controls.update();
    }, [stageCamera3D, isExporting]);

    return (
      <div
        ref={mountRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'absolute',
          inset: 0,
          zIndex: 5
        }}
      />
    );
  }
);
