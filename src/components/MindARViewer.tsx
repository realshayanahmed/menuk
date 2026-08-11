import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ArrowLeft, Sparkles, AlertCircle, RefreshCw } from "lucide-react";

// Ensure THREE is globally available for MindAR before the module loads.
if (typeof window !== "undefined" && !(window as any).THREE) {
  (window as any).THREE = THREE;
}
if (typeof globalThis !== "undefined" && !(globalThis as any).THREE) {
  (globalThis as any).THREE = THREE;
}

interface DishConfig {
  name: string;
  price: string;
  glbPath: string;
  scale?: string;
}

interface MindARViewerProps {
  dish: DishConfig;
  onClose: () => void;
  targetSrc?: string;
}

// Memory cache to prevent re-downloading models
const gltfSceneCache = new Map<string, THREE.Object3D>();

// If your local path fails, this will load a standard Avocado to prove the AR is working
const FALLBACK_GLB_URL = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb";

export const MindARViewer: React.FC<MindARViewerProps> = ({
  dish,
  onClose,
  targetSrc = "/assets/targets/restaurant-logo.mind",
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mindarThreeRef = useRef<any>(null);
  const anchorGroupRef = useRef<THREE.Group | null>(null);
  const currentModelRef = useRef<THREE.Object3D | null>(null);
  
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("Point camera at the logo");
  const [isLoadingMindAR, setIsLoadingMindAR] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);

  // LOGIC: Center model, make it big, and rotate it to STAND UPRIGHT
  const applyModelToScene = (gltfScene: THREE.Object3D, scaleFactor?: string) => {
    if (!anchorGroupRef.current) return;
    
    const model = gltfScene.clone(true);
    const parsedScale = parseFloat(scaleFactor || "1.0") || 1.0;

    // Calculate dimensions
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    
    // SCALE FIX: targetWorldSize 1.2 makes it large relative to the logo
    const targetWorldSize = 1.2; 
    const finalScale = (parsedScale * targetWorldSize) / maxDim;
    model.scale.setScalar(finalScale);

    // ROTATION FIX: Rotate 90 degrees so it stands on the logo
    model.rotation.x = Math.PI / 2;

    // POSITION FIX: Center it and place bottom at the center of logo
    const centeredBox = new THREE.Box3().setFromObject(model);
    const center = centeredBox.getCenter(new THREE.Vector3());
    model.position.x = -center.x;
    model.position.y = -centeredBox.min.y; 
    model.position.z = 0;

    model.visible = false; 
    anchorGroupRef.current.add(model);
    currentModelRef.current = model;
  };

  const loadGLBModel = (glbUrl: string, scaleFactor?: string) => {
    if (!anchorGroupRef.current) return;
    if (currentModelRef.current) {
      anchorGroupRef.current.remove(currentModelRef.current);
      currentModelRef.current = null;
    }

    const rendererScene = gltfSceneCache.get(glbUrl);
    const addScene = (gltfScene: THREE.Object3D, scale = scaleFactor) => {
      gltfSceneCache.set(glbUrl, gltfScene);
      applyModelToScene(gltfScene, scale);
    };

    if (rendererScene) {
      addScene(rendererScene);
      return;
    }

    const loader = new GLTFLoader();

    loader.load(
      glbUrl,
      (gltf) => {
        addScene(gltf.scene, scaleFactor);
      },
      undefined,
      () => {
        console.warn(`Model failed at ${glbUrl}. Loading fallback...`);
        loader.load(
          FALLBACK_GLB_URL,
          (gltf) => {
            applyModelToScene(gltf.scene, "1.0");
          },
          undefined,
          () => {
            setErrorMessage(`Error: Could not find model at ${glbUrl}. Verify the file is in your public folder.`);
          }
        );
      }
    );
  };

  useEffect(() => {
    let isSubscribed = true;
    let handleResize: (() => void) | undefined;

    const startAR = async () => {
      try {
        if (!containerRef.current) return;

        setIsLoadingMindAR(true);
        setErrorMessage(null);
        setIsTracking(false);
        setStatusMessage("Point camera at the logo");

        const canUseCamera = async (): Promise<{ ok: true; message: string } | { ok: false; message: string }> => {
          if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            return { ok: false, message: "This browser does not expose the camera API." };
          }

          if (!window.isSecureContext && !["localhost", "127.0.0.1", "::1"].includes(location.hostname)) {
            return { ok: false, message: "Camera access requires a secure context. Open this site via HTTPS or localhost." };
          }

          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: "environment" },
              audio: false,
            });
            stream.getTracks().forEach((track) => track.stop());
            return { ok: true, message: "Camera available." };
          } catch (error: any) {
            const message = error?.name === "NotAllowedError"
              ? "Camera permission was denied. Allow camera access and try again."
              : error?.name === "NotReadableError"
                ? "The camera is already in use or could not be opened by this browser."
                : "The camera could not be started. Please use a supported device/browser.";
            return { ok: false, message };
          }
        };

        const cameraCheck = await canUseCamera();
        if (!cameraCheck.ok) {
          if (!isSubscribed) return;
          setErrorMessage(cameraCheck.message);
          setIsLoadingMindAR(false);
          return;
        }

        const { MindARThree: MindARThreeCtor } = (await import("mind-ar/dist/mindar-image-three.prod.js")) as {
          MindARThree: new (options: any) => any;
        };

        const mindarThree = new MindARThreeCtor({
          container: containerRef.current,
          imageTargetSrc: targetSrc,
          uiLoading: "no",
          uiScanning: "no",
          uiError: "no",
        });

        const { renderer, scene, camera } = mindarThree;
        mindarThreeRef.current = mindarThree;

        handleResize = () => {
          if (!renderer || !camera) return;
          renderer.setSize(window.innerWidth, window.innerHeight);
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();

          const video = containerRef.current?.querySelector("video");
          if (video) {
            video.style.width = "100vw";
            video.style.height = "100vh";
            video.style.objectFit = "cover";
            video.style.position = "absolute";
            video.style.top = "0";
            video.style.left = "0";
          }
        };

        window.addEventListener("resize", handleResize);

        scene.add(new THREE.AmbientLight(0xffffff, 1.5));
        const sun = new THREE.DirectionalLight(0xffffff, 1.0);
        sun.position.set(1, 2, 3);
        scene.add(sun);

        const anchor = mindarThree.addAnchor(0);
        anchorGroupRef.current = anchor.group;

        anchor.onTargetFound = () => {
          setIsTracking(true);
          setStatusMessage("Logo Detected!");
          if (currentModelRef.current) currentModelRef.current.visible = true;
        };

        anchor.onTargetLost = () => {
          setIsTracking(false);
          setStatusMessage("Searching for logo...");
          if (currentModelRef.current) currentModelRef.current.visible = false;
        };

        await mindarThree.start();
        handleResize();

        renderer.setAnimationLoop(() => {
          renderer.render(scene, camera);
        });

        if (isSubscribed) {
          setIsLoadingMindAR(false);
          loadGLBModel(dish.glbPath, dish.scale);
        }
      } catch (err: any) {
        if (!isSubscribed) return;
        setErrorMessage("Camera error: Ensure you have allowed camera permissions and that your browser can access the camera.");
        setIsLoadingMindAR(false);
      }
    };

    startAR();

    return () => {
      isSubscribed = false;
      if (handleResize) {
        window.removeEventListener("resize", handleResize);
      }

      const instance = mindarThreeRef.current;
      if (instance) {
        try {
          instance.stop?.();
        } catch (cleanupError) {
          console.warn("MindAR cleanup skipped:", cleanupError);
        }
        try {
          instance.renderer?.setAnimationLoop?.(null);
        } catch (cleanupError) {
          console.warn("MindAR renderer cleanup skipped:", cleanupError);
        }
      }
      mindarThreeRef.current = null;

      if (currentModelRef.current && anchorGroupRef.current) {
        anchorGroupRef.current.remove(currentModelRef.current);
        currentModelRef.current = null;
      }
    };
  }, [retryCount, dish.glbPath, targetSrc]);

  return (
    <div className="fixed inset-0 z-50 w-full h-full bg-black overflow-hidden font-sans">
      {/* Full screen AR container */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* Header UI */}
      <div className="absolute top-0 left-0 right-0 p-4 z-20 flex items-center justify-between pointer-events-none">
        <button
          onClick={onClose}
          className="pointer-events-auto bg-black/60 backdrop-blur-md text-white px-5 py-2.5 rounded-2xl text-xs font-bold border border-white/10 flex items-center gap-2 active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4 text-orange-400" /> EXIT AR
        </button>

        <div className="bg-black/60 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-white/10 text-white font-bold text-xs">
          {dish.name} <span className="text-orange-400 ml-2">Rs. {dish.price}</span>
        </div>
      </div>

      {/* Status Pill */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-max">
        <div className={`px-6 py-2.5 rounded-full backdrop-blur-md border shadow-2xl transition-all duration-500 ${
          isTracking ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" : "bg-black/40 border-white/10 text-white"
        }`}>
          <div className="flex items-center gap-2.5">
            {!isTracking && <Sparkles className="w-3.5 h-3.5 text-orange-400 animate-pulse" />}
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{statusMessage}</span>
          </div>
        </div>
      </div>

      {/* Loading Screen */}
      {isLoadingMindAR && (
        <div className="absolute inset-0 z-30 bg-black flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mb-6" />
          <h2 className="text-white font-bold tracking-[0.3em] text-xs">INITIALIZING CAMERA</h2>
        </div>
      )}

      {/* Error Screen */}
      {errorMessage && (
        <div className="absolute inset-0 z-40 bg-black/95 flex flex-col items-center justify-center p-10 text-center">
          <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-rose-500" />
          </div>
          <h3 className="text-white font-black text-lg mb-2 tracking-tight">AR ERROR</h3>
          <p className="text-slate-400 text-xs mb-8 leading-relaxed max-w-xs">{errorMessage}</p>
          <button
            onClick={() => setRetryCount(c => c + 1)}
            className="bg-orange-500 hover:bg-orange-600 text-white px-10 py-4 rounded-2xl text-xs font-black tracking-widest shadow-lg shadow-orange-500/20 flex items-center gap-3 transition-all"
          >
            <RefreshCw className="w-4 h-4" /> RETRY CAMERA
          </button>
        </div>
      )}
    </div>
  );
};