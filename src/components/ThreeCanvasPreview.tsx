import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface ThreeCanvasPreviewProps {
  glbPath: string;
  rotationAngle?: number;
  scale?: string;
  alt?: string;
}

const MODEL_FALLBACK_CDNS: Record<string, string> = {
  "/models/Avocado.glb": "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb",
  "models/Avocado.glb": "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb",
  "/models/BarramundiFish.glb": "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BarramundiFish/glTF-Binary/BarramundiFish.glb",
  "models/BarramundiFish.glb": "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BarramundiFish/glTF-Binary/BarramundiFish.glb",
  "/models/IridescentDishWithOlives.glb": "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/IridescentDishWithOlives/glTF-Binary/IridescentDishWithOlives.glb",
  "models/IridescentDishWithOlives.glb": "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/IridescentDishWithOlives/glTF-Binary/IridescentDishWithOlives.glb",
};

// Shared across every instance of this component so switching between
// dishes you've already viewed (or nudging the scale slider, which used
// to force a full reload) never re-fetches the same GLB over the network.
const gltfSceneCache = new Map<string, THREE.Object3D>();
const inFlightLoads = new Map<string, Promise<THREE.Object3D>>();

function loadModel(loader: GLTFLoader, url: string): Promise<THREE.Object3D> {
  if (gltfSceneCache.has(url)) {
    return Promise.resolve(gltfSceneCache.get(url)!);
  }
  if (inFlightLoads.has(url)) {
    return inFlightLoads.get(url)!;
  }

  const promise = new Promise<THREE.Object3D>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        gltfSceneCache.set(url, gltf.scene);
        resolve(gltf.scene);
      },
      undefined,
      (err) => {
        const fallback = MODEL_FALLBACK_CDNS[url];
        if (fallback) {
          loader.load(
            fallback,
            (gltf) => {
              gltfSceneCache.set(url, gltf.scene);
              resolve(gltf.scene);
            },
            undefined,
            (fallbackErr) => reject(fallbackErr)
          );
        } else {
          reject(err);
        }
      }
    );
  }).finally(() => {
    inFlightLoads.delete(url);
  });

  inFlightLoads.set(url, promise);
  return promise;
}

export const ThreeCanvasPreview: React.FC<ThreeCanvasPreviewProps> = ({
  glbPath,
  rotationAngle = 0,
  scale = "1.0",
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const rotationGroupRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Center + un-scaled bounding size of whatever model is currently loaded,
  // captured once at load time so later scale-only changes can just do
  // simple math instead of re-measuring or reloading the model.
  const modelBaseRef = useRef<{ center: THREE.Vector3; maxDim: number } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const applyScale = (scaleFactor: string) => {
    const model = modelRef.current;
    const base = modelBaseRef.current;
    if (!model || !base) return;
    const fitScale = (0.2 / (base.maxDim || 1)) * (parseFloat(scaleFactor) || 1.0);
    model.position.set(0, 0, 0);
    model.scale.set(fitScale, fitScale, fitScale);
    model.position.sub(base.center.clone().multiplyScalar(fitScale));
  };

  // Set up the renderer/scene/camera/controls ONCE per glbPath — not on
  // every scale tweak, which used to tear the whole viewer down and
  // re-fetch the model from the network on every slider nudge.
  useEffect(() => {
    if (!mountRef.current) return;
    let disposed = false;

    const width = mountRef.current.clientWidth || 300;
    const height = mountRef.current.clientHeight || 250;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0.15, 0.4);
    // Without this, the camera keeps looking straight down its default -Z
    // axis instead of turning back toward the model, which pushes the
    // model almost entirely out of frame (just a sliver visible at the
    // bottom of the preview).
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);

    // Drag-to-rotate / pinch-or-scroll-to-zoom. This is the actual "move
    // the model" interaction — the RotateCcw/RotateCw buttons still work
    // separately, spinning the model itself rather than orbiting the camera.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 0.15;
    controls.maxDistance = 1.2;
    controls.update();
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight1.position.set(2, 4, 3);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight2.position.set(-2, -2, -2);
    scene.add(dirLight2);

    const rotationGroup = new THREE.Group();
    scene.add(rotationGroup);
    rotationGroupRef.current = rotationGroup;

    setIsLoading(true);
    setLoadError(false);

    const loader = new GLTFLoader();
    const targetUrl = glbPath || "/models/Avocado.glb";

    loadModel(loader, targetUrl)
      .then((cachedScene) => {
        if (disposed) return;
        // Clone so each preview instance gets its own transform/position
        // even though the underlying geometry/textures are shared from cache.
        const model = cachedScene.clone(true);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        modelBaseRef.current = { center, maxDim };

        rotationGroup.add(model);
        modelRef.current = model;
        applyScale(scale);
        setIsLoading(false);
      })
      .catch((err) => {
        console.warn("Failed to load model preview:", targetUrl, err);
        if (!disposed) {
          setIsLoading(false);
          setLoadError(true);
        }
      });

    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (rotationGroupRef.current) {
        rotationGroupRef.current.rotation.y = (rotationAngle * Math.PI) / 180;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
      controls.dispose();
      renderer.dispose();
      if (mountRef.current) {
        mountRef.current.innerHTML = "";
      }
      modelRef.current = null;
      modelBaseRef.current = null;
    };
    // Intentionally NOT depending on `scale` — see the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glbPath]);

  // Scale-only updates: just rescale/reposition the already-loaded model.
  // No renderer teardown, no re-fetch — this is what used to make every
  // slider nudge feel like a full reload.
  useEffect(() => {
    applyScale(scale);
  }, [scale]);

  useEffect(() => {
    if (rotationGroupRef.current) {
      rotationGroupRef.current.rotation.y = (rotationAngle * Math.PI) / 180;
    }
  }, [rotationAngle]);

  return (
    <div className="w-full h-full relative">
      <div ref={mountRef} className="w-full h-full relative touch-none" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 border-2 border-[#F3921F] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {loadError && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-xs text-rose-400 font-semibold px-4 text-center">
            Couldn't load this 3D model.
          </p>
        </div>
      )}
    </div>
  );
};
