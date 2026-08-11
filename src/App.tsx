import React, { useState, useEffect, useRef } from "react";
import { PlatelyLogo } from "./components/PlatelyLogo";
import { saveFileToLocal, getFileFromLocal, deleteFileFromLocal } from "./lib/db";
import { MindARViewer } from "./components/MindARViewer";
import { ThreeCanvasPreview } from "./components/ThreeCanvasPreview";
import { 
  QrCode, 
  Upload, 
  RotateCcw, 
  RotateCw,
  Smartphone, 
  Check, 
  AlertCircle, 
  Download, 
  UtensilsCrossed, 
  Layers, 
  Info,
  Sparkles,
  RefreshCw,
  Globe,
  Settings,
  ArrowLeft,
  Scale,
  Maximize2,
  X
} from "lucide-react";

// TypeScript typings for Google <model-viewer>
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': any;
    }
  }
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'model-viewer': any;
      }
    }
  }
}

interface DishConfig {
  name: string;
  description: string;
  price: string;
  glbPath: string;
  usdzPath: string;
  isCustom: boolean;
  scale?: string;
}

// Global CDN fallback dictionary for hosted static servers (e.g. InfinityFree / custom domain)
const MODEL_FALLBACK_CDNS: Record<string, string> = {
  "/models/Avocado.glb": "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb",
  "models/Avocado.glb": "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb",
  "/models/BarramundiFish.glb": "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BarramundiFish/glTF-Binary/BarramundiFish.glb",
  "models/BarramundiFish.glb": "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BarramundiFish/glTF-Binary/BarramundiFish.glb",
  "/models/IridescentDishWithOlives.glb": "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/IridescentDishWithOlives/glTF-Binary/IridescentDishWithOlives.glb",
  "models/IridescentDishWithOlives.glb": "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/IridescentDishWithOlives/glTF-Binary/IridescentDishWithOlives.glb",
};

export default function App() {
  // Navigation / View modes
  const [isMobileView, setIsMobileView] = useState(false);
  const [isArActive, setIsArActive] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "presets">("dashboard");

  // Dish details
  const [dish, setDish] = useState<DishConfig>({
    name: "Loading dish...",
    description: "Loading...",
    price: "0.00",
    glbPath: "",
    usdzPath: "",
    isCustom: false,
    scale: "1.0",
  });

  // Custom Form fields
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formGlbUrl, setFormGlbUrl] = useState("");
  const [formUsdzUrl, setFormUsdzUrl] = useState("");
  const [formScale, setFormScale] = useState("1.0");
  const [glbFile, setGlbFile] = useState<File | null>(null);
  const [usdzFile, setUsdzFile] = useState<File | null>(null);

  // Rotation control states
  const [rotationAngle, setRotationAngle] = useState(0);

  // Percentage scaling calculation & handlers
  const parsedScale = parseFloat(formScale) || 1.0;
  // Handle wider range scale percentage beautifully
  const currentPercent = Math.min(100, Math.max(1, Math.round(parsedScale * 100)));

  const handlePercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const percentVal = parseInt(e.target.value) || 100;
    const ratioVal = (percentVal / 100).toFixed(4);
    setFormScale(ratioVal);
  };

  // Custom QR override (for custom hosting)
  const [qrHostnameOverride, setQrHostnameOverride] = useState("");
  const [showAdvanceQR, setShowAdvanceQR] = useState(false);

  // Statuses
  const [qrCodeBase64, setQrCodeBase64] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<{ type: "success" | "error" | "loading" | null, message: string }>({ type: null, message: "" });
  const [mobileLoading, setMobileLoading] = useState(false);
  const [modelLoadingError, setModelLoadingError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(true);
  const [showIosWarning, setShowIosWarning] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [activeGlbUrl, setActiveGlbUrl] = useState<string>("");
  const [usingFallbackUrl, setUsingFallbackUrl] = useState<boolean>(false);

  // Refs
  const modelViewerRef = useRef<any>(null);
  const desktopModelViewerRef = useRef<any>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);

  // Serverless fallback and dynamic Local blob references
  const [isServerless, setIsServerless] = useState(false);
  const [localGlbUrl, setLocalGlbUrl] = useState<string>("");
  const [localUsdzUrl, setLocalUsdzUrl] = useState<string>("");

  const DEFAULT_DISH: DishConfig = {
    name: "Plately Avocado Salad",
    description: "A perfectly ripe Hass avocado, sliced and served fresh with organic sea salt, lemon zest, and extra virgin olive oil. A masterclass in simplicity and natural flavor.",
    price: "350",
    glbPath: "/models/Avocado.glb",
    usdzPath: "/models/Avocado.usdz",
    isCustom: false,
    scale: "1.0",
  };

  // Manage Blob URL cleanup to avoid memory leaks
  useEffect(() => {
    return () => {
      if (localGlbUrl) URL.revokeObjectURL(localGlbUrl);
    };
  }, [localGlbUrl]);

  useEffect(() => {
    return () => {
      if (localUsdzUrl) URL.revokeObjectURL(localUsdzUrl);
    };
  }, [localUsdzUrl]);

  // 1. Detect if viewed from mobile device or via QR code param (?ar=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ar") === "1" || params.get("mobile") === "true") {
      setIsMobileView(true);
    } else {
      // Auto-detect mobile devices to switch to mobile-friendly viewer
      const ua = navigator.userAgent;
      if (/android|iphone|ipad|ipod/i.test(ua)) {
        setIsMobileView(true);
      }
    }
  }, []);

  // Helper to apply config and resolve local blob URLs if custom files exist in IndexedDB
  const applyDishConfigToState = async (config: DishConfig, useLocalStore = false) => {
    let finalConfig = config;
    const validPresetPaths = ["/models/Avocado.glb", "/models/IridescentDishWithOlives.glb", "/models/BarramundiFish.glb"];
    
    // Auto-heal: If user has an old preset or broken link, reset glbPath to fast local model
    if (!finalConfig.isCustom && !validPresetPaths.includes(finalConfig.glbPath)) {
      finalConfig = { ...DEFAULT_DISH, glbPath: "/models/Avocado.glb" };
      if (useLocalStore) {
        localStorage.setItem("plately_dish", JSON.stringify(finalConfig));
      }
    }

    setDish(finalConfig);
    setFormName(finalConfig.name);
    setFormDescription(finalConfig.description);
    setFormPrice(finalConfig.price);
    setFormScale(finalConfig.scale || "1.0");

    if (!finalConfig.isCustom) {
      setFormGlbUrl(finalConfig.glbPath);
      setFormUsdzUrl(finalConfig.usdzPath);
    } else {
      setFormGlbUrl(finalConfig.glbPath.startsWith("blob:") ? "" : finalConfig.glbPath);
      setFormUsdzUrl(finalConfig.usdzPath.startsWith("blob:") ? "" : finalConfig.usdzPath);
    }

    if (useLocalStore && config.isCustom) {
      // Load custom files from IndexedDB if they exist
      try {
        const glbBlob = await getFileFromLocal("custom_glb");
        if (glbBlob) {
          const url = URL.createObjectURL(glbBlob);
          setLocalGlbUrl(url);
          setDish(prev => ({ ...prev, glbPath: url }));
        }
        
        const usdzBlob = await getFileFromLocal("custom_usdz");
        if (usdzBlob) {
          const url = URL.createObjectURL(usdzBlob);
          setLocalUsdzUrl(url);
          setDish(prev => ({ ...prev, usdzPath: url }));
        }
      } catch (e) {
        console.error("Error fetching models from IndexedDB:", e);
      }
    }
  };

  // 2. Fetch Active Dish details from backend (with elegant static/serverless fallback)
  const fetchDish = async () => {
    // Check if viewed with URL query parameters (scanned from QR code) to immediately apply them
    const params = new URLSearchParams(window.location.search);
    const paramName = params.get("name");
    const paramGlb = params.get("glb");
    
    if (paramName && paramGlb) {
      const urlConfig: DishConfig = {
        name: paramName,
        description: params.get("desc") || "",
        price: params.get("price") || "0",
        glbPath: paramGlb,
        usdzPath: params.get("usdz") || "",
        isCustom: params.get("isCustom") === "true",
        scale: params.get("scale") || "1.0",
      };
      await applyDishConfigToState(urlConfig, false);
      return;
    }

    try {
      const res = await fetch("/api/dish");
      if (res.ok) {
        const data: DishConfig = await res.json();
        if (typeof data !== "object" || !data.name) {
          throw new Error("Invalid backend format - falling back to client-side storage.");
        }
        await applyDishConfigToState(data, false);
        setIsServerless(false);
      } else {
        throw new Error("Backend unreachable - falling back to client-side storage.");
      }
    } catch (err) {
      console.log("Using static / serverless mode. All customizations are persisted locally in this browser.");
      setIsServerless(true);
      
      // Load from localStorage
      const localDataStr = localStorage.getItem("plately_dish");
      let activeConfig = DEFAULT_DISH;
      if (localDataStr) {
        try {
          activeConfig = JSON.parse(localDataStr);
        } catch (e) {
          console.error("Error parsing local dish:", e);
        }
      }
      
      await applyDishConfigToState(activeConfig, true);
    }
  };

  useEffect(() => {
    fetchDish();
  }, []);

  // 3. Generate QR code pointing to real address or customized hosting domain (InfinityFree static friendly)
  useEffect(() => {
    const generateQR = async () => {
      try {
        const baseDomain = qrHostnameOverride.trim() || window.location.origin;
        
        // Encode all current active dish details in the QR URL search parameters
        const params = new URLSearchParams();
        params.set("ar", "1");
        if (dish) {
          params.set("name", dish.name);
          params.set("desc", dish.description);
          params.set("price", dish.price);
          params.set("glb", dish.glbPath);
          params.set("usdz", dish.usdzPath);
          params.set("scale", dish.scale || "1.0");
          if (dish.isCustom) {
            params.set("isCustom", "true");
          }
        }
        const mobileUrl = `${baseDomain}/?${params.toString()}`;
        
        if (isServerless) {
          // Completely bypass Node backend using a fast, free public QR API for InfinityFree
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&color=0f172a&data=${encodeURIComponent(mobileUrl)}`;
          setQrCodeBase64(qrUrl);
          return;
        }

        const res = await fetch(`/api/qr?url=${encodeURIComponent(mobileUrl)}`);
        if (res.ok) {
          const data = await res.json();
          setQrCodeBase64(data.qr);
        } else {
          throw new Error("Backend QR generation failed");
        }
      } catch (err) {
        // Fallback to client-side QR generation
        const baseDomain = qrHostnameOverride.trim() || window.location.origin;
        const params = new URLSearchParams();
        params.set("ar", "1");
        if (dish) {
          params.set("name", dish.name);
          params.set("desc", dish.description);
          params.set("price", dish.price);
          params.set("glb", dish.glbPath);
          params.set("usdz", dish.usdzPath);
          params.set("scale", dish.scale || "1.0");
          if (dish.isCustom) {
            params.set("isCustom", "true");
          }
        }
        const mobileUrl = `${baseDomain}/?${params.toString()}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&color=0f172a&data=${encodeURIComponent(mobileUrl)}`;
        setQrCodeBase64(qrUrl);
      }
    };
    generateQR();
  }, [dish, qrHostnameOverride, isServerless]);

  // 3.5 Auto-Scale loaded model to fit 7 inches (0.1778 meters) in width (Kebab and custom-model friendly!)
  const handleAutoScaleTo7Inches = () => {
    const viewer = desktopModelViewerRef.current || modelViewerRef.current;
    if (viewer) {
      try {
        const dimensions = viewer.getDimensions();
        // Width is calculated as the maximum horizontal dimension (X or Z)
        const width = dimensions ? Math.max(dimensions.x, dimensions.z) : 0;
        if (dimensions && width > 0) {
          const desiredWidth = 0.1778; // 7 inches in meters
          const calculatedScale = desiredWidth / width;
          
          setFormScale(calculatedScale.toFixed(5));
          setSaveStatus({
            type: "success",
            message: `Auto-scaled! Calibrated size to ${calculatedScale.toFixed(5)}x to make model exactly 7 inches in width.`
          });
          setTimeout(() => setSaveStatus({ type: null, message: "" }), 4000);
        } else {
          setSaveStatus({
            type: "error",
            message: "Dimensions not ready yet. Make sure the 3D model is fully loaded in the previewer."
          });
          setTimeout(() => setSaveStatus({ type: null, message: "" }), 4000);
        }
      } catch (err) {
        console.error("Error reading model dimensions:", err);
        setSaveStatus({
          type: "error",
          message: "Failed to read 3D model dimensions. Try again once loaded."
        });
        setTimeout(() => setSaveStatus({ type: null, message: "" }), 4000);
      }
    } else {
      setSaveStatus({
        type: "error",
        message: "No active 3D previewer detected on screen."
      });
      setTimeout(() => setSaveStatus({ type: null, message: "" }), 4000);
    }
  };

  // 4. Handle Preset Apply (InfinityFree & Serverless fallback compatible)
  const applyPreset = async (preset: { name: string, description: string, price: string, glb: string, usdz: string, scale?: string }) => {
    setSaveStatus({ type: "loading", message: "Applying selected food preset..." });
    
    const presetConfig: DishConfig = {
      name: preset.name,
      description: preset.description,
      price: preset.price,
      glbPath: preset.glb,
      usdzPath: preset.usdz,
      isCustom: false,
      scale: preset.scale || "1.0",
    };

    if (isServerless) {
      localStorage.setItem("plately_dish", JSON.stringify(presetConfig));
      await applyDishConfigToState(presetConfig, false);
      setSaveStatus({ type: "success", message: `Active dish switched to ${preset.name}!` });
      setGlbFile(null);
      setUsdzFile(null);
      setTimeout(() => setSaveStatus({ type: null, message: "" }), 3000);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("name", preset.name);
      formData.append("description", preset.description);
      formData.append("price", preset.price);
      formData.append("glbUrl", preset.glb);
      formData.append("usdzUrl", preset.usdz);
      formData.append("isCustom", "false");
      formData.append("scale", preset.scale || "1.0");

      const res = await fetch("/api/dish", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const result = await res.json();
        setDish(result.config);
        setFormScale(result.config.scale || "1.0");
        setSaveStatus({ type: "success", message: `Active dish switched to ${preset.name}!` });
        setGlbFile(null);
        setUsdzFile(null);
        setTimeout(() => setSaveStatus({ type: null, message: "" }), 3000);
      } else {
        throw new Error("Failed to switch preset");
      }
    } catch (err: any) {
      setSaveStatus({ type: "error", message: err.message || "Failed to switch preset" });
    }
  };

  // 5. Handle Custom Upload Submission (InfinityFree/Static compatible utilizing IndexedDB)
  const handleSaveCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus({ type: "loading", message: "Saving dish settings & compiling 3D models..." });

    if (isServerless) {
      try {
        let finalGlbUrl = formGlbUrl || dish.glbPath;
        let finalUsdzUrl = formUsdzUrl || dish.usdzPath;

        // If actual file uploads are given, write to local IndexedDB and generate clean object blob URLs
        if (glbFile) {
          await saveFileToLocal("custom_glb", glbFile);
          const newUrl = URL.createObjectURL(glbFile);
          setLocalGlbUrl(newUrl);
          finalGlbUrl = newUrl;
        }
        if (usdzFile) {
          await saveFileToLocal("custom_usdz", usdzFile);
          const newUrl = URL.createObjectURL(usdzFile);
          setLocalUsdzUrl(newUrl);
          finalUsdzUrl = newUrl;
        }

        const customConfig: DishConfig = {
          name: formName,
          description: formDescription,
          price: formPrice,
          glbPath: finalGlbUrl,
          usdzPath: finalUsdzUrl,
          isCustom: true,
          scale: formScale,
        };

        localStorage.setItem("plately_dish", JSON.stringify(customConfig));
        setDish(customConfig);
        setSaveStatus({ type: "success", message: "Dish updated successfully! Your customized settings are active on this device." });
        setGlbFile(null);
        setUsdzFile(null);
        setTimeout(() => setSaveStatus({ type: null, message: "" }), 4000);
      } catch (err: any) {
        setSaveStatus({ type: "error", message: err.message || "Failed to save locally" });
      }
      return;
    }

    try {
      const formData = new FormData();
      formData.append("name", formName);
      formData.append("description", formDescription);
      formData.append("price", formPrice);
      formData.append("isCustom", "true");
      formData.append("scale", formScale);

      if (glbFile) {
        formData.append("glb", glbFile);
      } else if (formGlbUrl) {
        formData.append("glbUrl", formGlbUrl);
      }

      if (usdzFile) {
        formData.append("usdz", usdzFile);
      } else if (formUsdzUrl) {
        formData.append("usdzUrl", formUsdzUrl);
      }

      const res = await fetch("/api/dish", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const result = await res.json();
        setDish(result.config);
        setSaveStatus({ type: "success", message: "Dish updated successfully! Scanning QR code will now render this new food item." });
        setGlbFile(null);
        setUsdzFile(null);
        setTimeout(() => setSaveStatus({ type: null, message: "" }), 4000);
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to save customized dish");
      }
    } catch (err: any) {
      setSaveStatus({ type: "error", message: err.message || "Error applying configurations" });
    }
  };

  // 6. Reset to default Kebab
  const handleResetToDefault = async () => {
    if (!window.confirm("Restore default Avocado model?")) return;
    setSaveStatus({ type: "loading", message: "Restoring default setup..." });

    if (isServerless) {
      try {
        localStorage.removeItem("plately_dish");
        await deleteFileFromLocal("custom_glb");
        await deleteFileFromLocal("custom_usdz");
        await applyDishConfigToState(DEFAULT_DISH, false);
        setSaveStatus({ type: "success", message: "Restored Plately Avocado Salad successfully!" });
        setFormName(DEFAULT_DISH.name);
        setFormDescription(DEFAULT_DISH.description);
        setFormPrice(DEFAULT_DISH.price);
        setGlbFile(null);
        setUsdzFile(null);
        setTimeout(() => setSaveStatus({ type: null, message: "" }), 3000);
      } catch (err) {
        setSaveStatus({ type: "error", message: "Failed to reset locally" });
      }
      return;
    }

    try {
      const res = await fetch("/api/dish/reset", { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setDish(result.config);
        setFormName(result.config.name);
        setFormDescription(result.config.description);
        setFormPrice(result.config.price);
        setGlbFile(null);
        setUsdzFile(null);
        setSaveStatus({ type: "success", message: "Restored Plately Avocado Salad successfully!" });
        setTimeout(() => setSaveStatus({ type: null, message: "" }), 3000);
      }
    } catch (err) {
      setSaveStatus({ type: "error", message: "Failed to reset to default" });
    }
  };

  // Fast pre-fetch preset 3D models into browser cache for instant loading
  useEffect(() => {
    const presetGlbs = [
      "/models/Avocado.glb",
      "/models/IridescentDishWithOlives.glb",
      "/models/BarramundiFish.glb"
    ];
    presetGlbs.forEach((url) => {
      fetch(url, { cache: "force-cache" }).catch(() => {});
    });
  }, []);

  // 7. Instant loading state clearance & GLB URL fallback handler
  useEffect(() => {
    setMobileLoading(false);
    setIsModelLoaded(true);
    setActiveGlbUrl(dish.glbPath);
    setUsingFallbackUrl(false);
  }, [dish.glbPath]);

  // Handle <model-viewer> error events (e.g. if hosting server blocks .glb or returns HTML)
  useEffect(() => {
    const handleModelError = (event: any) => {
      console.warn("Primary GLB model failed to render:", dish.glbPath, event);
      const fallbackUrl = MODEL_FALLBACK_CDNS[dish.glbPath];
      if (fallbackUrl && !usingFallbackUrl) {
        console.log("Automatically switching to cloud CDN model fallback:", fallbackUrl);
        setUsingFallbackUrl(true);
        setActiveGlbUrl(fallbackUrl);
      }
    };

    const mv1 = modelViewerRef.current;
    const mv2 = desktopModelViewerRef.current;
    if (mv1) mv1.addEventListener("error", handleModelError);
    if (mv2) mv2.addEventListener("error", handleModelError);

    return () => {
      if (mv1) mv1.removeEventListener("error", handleModelError);
      if (mv2) mv2.removeEventListener("error", handleModelError);
    };
  }, [dish.glbPath, usingFallbackUrl]);

  const [arNotice, setArNotice] = useState<string | null>(null);

  // Directly starts or stops the device camera video feed for AR overlay
  const startLiveCameraFeed = async () => {
    if (isCameraActive) {
      if (cameraVideoRef.current && cameraVideoRef.current.srcObject) {
        const stream = cameraVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
        cameraVideoRef.current.srcObject = null;
      }
      setIsCameraActive(false);
      setArNotice("Camera closed.");
      setTimeout(() => setArNotice(null), 2000);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      setIsCameraActive(true);
      setArNotice("Live AR Camera Active! View 3D food on table.");
      setTimeout(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          cameraVideoRef.current.play().catch(console.error);
        }
      }, 100);
    } catch (err) {
      console.warn("Camera fallback stream denied:", err);
      if (window.self !== window.top) {
        setArNotice("Opening camera in full browser window...");
        setTimeout(() => {
          window.open(window.location.href, "_blank");
          setArNotice(null);
        }, 1000);
      } else {
        setArNotice("Camera access blocked. Please enable camera permissions.");
        setTimeout(() => setArNotice(null), 4000);
      }
    }
  };

  // Trigger MindAR Image Tracking Camera Mode
  const handleScreenTapToAR = () => {
    setIsArActive(true);
  };

  // Preset models (Prices in Rupees)
  const presets = [
    {
      name: "Plately Avocado Salad",
      description: "A perfectly ripe Hass avocado, sliced and served fresh with organic sea salt, lemon zest, and extra virgin olive oil. A masterclass in simplicity and natural flavor.",
      price: "350",
      glb: "/models/Avocado.glb",
      usdz: "",
      scale: "1.0"
    },
    {
      name: "Mediterranean Seasoned Olive Dish",
      description: "A ceramic dish filled with glossy, herb-marinated green olives. A realistic 3D appetizer model.",
      price: "280",
      glb: "/models/IridescentDishWithOlives.glb",
      usdz: "",
      scale: "1.0"
    },
    {
      name: "Pan-Seared Barramundi Fish",
      description: "Fresh ocean Barramundi fillet pan-seared to golden perfection with crisp skin and microgreens.",
      price: "490",
      glb: "/models/BarramundiFish.glb",
      usdz: "",
      scale: "1.0"
    }
  ];

  // Download high-res QR for print
  const downloadQRCode = () => {
    if (!qrCodeBase64) return;
    const link = document.createElement("a");
    link.href = qrCodeBase64;
    link.download = `plately_qr_table_menu.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ================= RENDER MindAR IMAGE TRACKING =================
  if (isArActive) {
    return (
      <MindARViewer
        dish={dish}
        onClose={() => setIsArActive(false)}
        targetSrc="/assets/targets/restaurant-logo.mind"
      />
    );
  }

  // ================= RENDER MOBILE AR EXPERIENCE =================
  // ================= RENDER MOBILE AR EXPERIENCE =================
  if (isMobileView) {
    const isIOSDevice = typeof navigator !== 'undefined' && (
      /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
    // Put webxr first for Android to render in-browser without Google Play Store redirect
    const resolvedArModes = isIOSDevice 
      ? (dish.usdzPath ? "quick-look webxr" : "webxr scene-viewer") 
      : "webxr scene-viewer quick-look";

    return (
      <div 
        className="relative w-full h-screen bg-[#FAF8F5] text-[#111111] overflow-hidden font-sans animate-fade-in cursor-pointer"
        onClick={handleScreenTapToAR}
      >
        {/* Immersive Branding Loading Screen */}
        {mobileLoading && (
          <div className="absolute inset-0 z-50 bg-[#FAF8F5] flex flex-col items-center justify-between py-16 px-6 transition-all duration-700 ease-in-out">
            <div className="flex-1 flex flex-col items-center justify-center space-y-8 max-w-sm text-center">
              
              {/* Plately Logo - Premium Visual Design */}
              <div className="relative w-32 h-32 flex items-center justify-center bg-white border border-[#F3921F]/10 rounded-full shadow-xl">
                <div className="absolute inset-2 border border-[#F3921F]/10 rounded-full animate-pulse"></div>
                <div className="absolute inset-0 border-t-2 border-[#F3921F]/40 rounded-full animate-spin" style={{ animationDuration: '2.5s' }}></div>
                
                {/* Brand Logo Visual Icon */}
                <PlatelyLogo className="w-20 h-20 relative z-10" />
              </div>
              
              <div className="space-y-3">
                <h1 className="text-3xl font-display font-bold tracking-tight text-[#111111] leading-tight">
                  Plately <span className="text-[#F3921F]">AR</span> Menu
                </h1>
                <p className="text-sm font-sans text-slate-500 font-medium tracking-wide">
                  High-fidelity 3D Tabletop Dining Previews
                </p>
              </div>
              
              <div className="pt-2">
                <span className="text-xs uppercase tracking-widest text-[#F3921F] font-bold font-display bg-[#F3921F]/10 px-3 py-1 rounded-full border border-[#F3921F]/20">
                  AR MODE ENABLED
                </span>
              </div>
            </div>

            {/* Micro loading progress indicator */}
            <div className="flex flex-col items-center space-y-3">
              <span className="text-xs text-slate-400 tracking-wider font-mono">
                Calibrating 3D spatial anchors...
              </span>
              <div className="w-16 h-0.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="w-1/2 h-full bg-[#F3921F] rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>
        )}

        {/* 3D Three.js Viewport */}
        <div className="absolute inset-0 w-full h-full bg-[#FAF8F5] overflow-hidden flex flex-col justify-between">
          <div className="relative w-full h-full">
            {dish.glbPath ? (
              <ThreeCanvasPreview
                glbPath={activeGlbUrl || dish.glbPath}
                scale={dish.scale}
                rotationAngle={rotationAngle}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full space-y-4">
                <AlertCircle className="w-12 h-12 text-rose-500 animate-pulse" />
                <p className="text-slate-500 text-sm">No active dish configured.</p>
              </div>
            )}

            {/* Overlay UI Controls */}
            {!mobileLoading && (
              <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 pb-6">
                
                {/* Top Bar showing active dish details */}
                <div className="w-full flex flex-col space-y-2 pointer-events-auto">
                  <div className="w-full bg-white/95 backdrop-blur-md px-4 py-3 rounded-xl border border-slate-200/80 shadow-md flex items-center justify-between">
                    <div className="flex items-center space-x-2 truncate">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="font-display font-bold text-[#111111] text-xs tracking-wide truncate">
                        {dish.name}
                      </span>
                    </div>
                    <div className="bg-[#F3921F]/10 px-2 py-0.5 rounded text-[#F3921F] text-xs font-mono font-bold ml-2">
                      Rs. {dish.price}
                    </div>
                  </div>

                  {arNotice && (
                    <div className="bg-amber-500 text-white px-3 py-2 rounded-xl text-center text-xs font-bold shadow-lg animate-fade-in flex items-center justify-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-200 flex-shrink-0" />
                      <span>{arNotice}</span>
                    </div>
                  )}
                </div>

                {/* Centered Target Button */}
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 pointer-events-auto">
                  <div 
                    className="w-20 h-20 rounded-full bg-[#F3921F]/15 border-2 border-[#F3921F] flex items-center justify-center animate-bounce duration-1000 shadow-lg cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsArActive(true);
                    }}
                  >
                    <Smartphone className="w-9 h-9 text-[#F3921F] animate-pulse" />
                  </div>
                  
                  <button 
                    className="bg-[#F3921F] text-white border border-[#F3921F] backdrop-blur-md px-6 py-3 rounded-2xl shadow-xl font-display font-bold text-xs uppercase tracking-wider active:scale-95 transition"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsArActive(true);
                    }}
                  >
                    View in AR (MindAR Image Tracking)
                  </button>
                </div>

                {/* Bottom Panel containing Rotation Controls, AR triggers, and description */}
                <div className="space-y-3 pointer-events-auto">
                  
                  {/* Action Panel: Rotation and launch AR */}
                  <div className="flex items-center justify-between bg-white/95 backdrop-blur-md p-3 rounded-2xl border border-slate-200/80 shadow-lg">
                    {/* Left: Rotation control buttons */}
                    <div className="flex flex-col space-y-1">
                      <span className="text-[9px] text-slate-400 font-mono uppercase font-bold tracking-wider">Rotate Food</span>
                      <div className="flex space-x-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRotationAngle(prev => prev - 45);
                          }}
                          className="bg-slate-50 active:bg-slate-100 hover:bg-slate-100 p-2 rounded-xl border border-slate-200 shadow-sm active:scale-95 transition"
                          title="Rotate Left"
                        >
                          <RotateCcw className="w-4 h-4 text-slate-600" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRotationAngle(prev => prev + 45);
                          }}
                          className="bg-slate-50 active:bg-slate-100 hover:bg-slate-100 p-2 rounded-xl border border-slate-200 shadow-sm active:scale-95 transition"
                          title="Rotate Right"
                        >
                          <RotateCw className="w-4 h-4 text-slate-600" />
                        </button>
                      </div>
                    </div>

                    {/* Right: Immersive AR Launch button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsArActive(true);
                      }}
                      className="bg-[#F3921F] hover:bg-[#e28714] text-white px-4 py-2.5 rounded-xl font-bold text-xs tracking-wider uppercase transition shadow-md flex items-center space-x-2"
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>Launch AR Camera</span>
                    </button>
                  </div>

                  {/* Bottom Dish Description Card */}
                  <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 shadow-lg">
                    <p className="text-[11px] text-slate-500 leading-relaxed font-medium italic">
                      "{dish.description}"
                    </p>
                    
                    {/* Instruction Guidance */}
                    <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-600 font-sans flex flex-col space-y-1">
                      <div className="flex items-center space-x-1 font-bold text-amber-600">
                        <Check className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>MindAR Image Tracking Active:</span>
                      </div>
                      <p className="leading-relaxed pl-4 text-slate-500">
                        Point your camera at the restaurant logo to view 3D dishes directly over the target image.
                      </p>
                    </div>
                  </div>

                </div>

              </div>
            )}
          </div>
        </div>

        {/* iOS-specific USDZ Missing Warning Modal */}
        {showIosWarning && (
          <div 
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-5 cursor-default animate-fade-in"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="bg-white rounded-3xl border border-slate-100 max-w-sm w-full p-6 shadow-2xl flex flex-col space-y-4 text-center relative animate-scale-up">
              <div className="absolute top-4 right-4">
                <button 
                  onClick={() => setShowIosWarning(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-amber-500 animate-pulse" />
              </div>

              <div className="space-y-1.5">
                <h3 className="font-display font-bold text-slate-900 text-base">
                  Apple iOS AR Guidance
                </h3>
                <p className="text-[11px] text-slate-500 leading-normal">
                  iPhone & iPad devices require an Apple <span className="font-mono text-xs font-bold text-[#F3921F] bg-amber-500/5 px-1 rounded">.usdz</span> format model to activate the AR table camera.
                </p>
              </div>

              <div className="text-left bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
                <div className="flex items-start space-x-2">
                  <div className="w-5 h-5 rounded-full bg-[#F3921F]/10 text-[#F3921F] flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Experience on Android</h4>
                    <p className="text-[10px] text-slate-500 leading-normal mt-0.5">
                      This avocado dish is fully calibrated and launches instantly on any Android phone! Point your Android camera at the QR code.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-2">
                  <div className="w-5 h-5 rounded-full bg-[#F3921F]/10 text-[#F3921F] flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Custom Upload for iOS</h4>
                    <p className="text-[10px] text-slate-500 leading-normal mt-0.5">
                      You can convert any standard <span className="font-medium text-slate-700">.glb</span> file to Apple's <span className="font-medium text-slate-700">.usdz</span> using free online converters (like Vectary or Reality Converter), then upload both in the admin settings!
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIosWarning(false)}
                className="w-full bg-[#F3921F] active:bg-[#e28714] text-white py-3 rounded-2xl font-bold text-xs tracking-wider uppercase transition shadow-md font-sans"
              >
                Got it, Return to 3D View
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ================= RENDER DESKTOP MANAGEMENT VIEW =================
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#111111] flex flex-col font-sans selection:bg-[#F3921F] selection:text-white">
      
      {/* Desktop Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <PlatelyLogo className="w-12 h-12" />
            <div>
              <h1 className="text-2xl font-display font-bold tracking-tight text-[#111111] flex items-center">
                Plately <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F3921F]/10 text-[#F3921F] uppercase tracking-widest font-bold border border-[#F3921F]/20">Studio</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">Simple 1-Dish AR Restaurant Menu</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsMobileView(true)}
              className="flex items-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold transition shadow-sm active:scale-95"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#F3921F]" />
              <span>Launch Mobile AR Preview</span>
            </button>
          </div>
        </div>
      </header>

      {/* Header Banner */}
      <div className="bg-white border-b border-slate-200/60 py-6 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-display font-bold text-[#111111]">
              Plately <span className="text-[#F3921F]">Studio</span> Dashboard
            </h2>
            <p className="text-xs text-slate-500 font-medium font-sans">Manage your active restaurant dish, calibrate scaling factors, and retrieve live dining table QR codes.</p>
          </div>
          <div className="flex items-center space-x-2 text-xs font-mono text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Scale locked to table surface ({dish.scale || "1.0"}x scale)</span>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left column: QR Code and 3D WebGL preview */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          
          {/* Active Dish Model View */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 flex flex-col space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-mono text-slate-500 uppercase tracking-wider flex items-center font-bold">
                <Layers className="w-3.5 h-3.5 text-[#F3921F] mr-1.5" />
                Active Model Preview
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-bold border border-emerald-100">
                Active on Tables
              </span>
            </div>

            {/* 3D Web Viewer */}
            <div className="h-64 rounded-xl overflow-hidden bg-[#FAF8F5] relative border border-slate-100 group">
              {/* Camera feed overlay for desktop/iframe */}
              <video
                ref={cameraVideoRef}
                autoPlay
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                  isCameraActive ? "opacity-100 z-0" : "opacity-0 pointer-events-none"
                }`}
              />
              {dish.glbPath ? (
                <ThreeCanvasPreview
                  glbPath={activeGlbUrl || dish.glbPath}
                  scale={dish.scale}
                  rotationAngle={rotationAngle}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                  <UtensilsCrossed className="w-12 h-12 mb-2 animate-pulse text-[#F3921F]/40" />
                  <span className="text-xs font-mono">No 3D Model Configured</span>
                </div>
              )}
              
              {/* Rotation buttons overlay on desktop preview */}
              <div className="absolute top-3 right-3 flex space-x-1.5 z-10">
                <button
                  type="button"
                  onClick={() => setRotationAngle(prev => prev - 45)}
                  className="bg-white/95 hover:bg-white text-slate-700 p-2 rounded-xl border border-slate-200 shadow-sm active:scale-95 transition"
                  title="Rotate Left"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotationAngle(prev => prev + 45)}
                  className="bg-white/95 hover:bg-white text-slate-700 p-2 rounded-xl border border-slate-200 shadow-sm active:scale-95 transition"
                  title="Rotate Right"
                >
                  <RotateCw className="w-3.5 h-3.5 text-slate-600" />
                </button>
              </div>

              <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-mono text-slate-500 border border-slate-100 pointer-events-none shadow-sm">
                WebGL 3D Viewer
              </div>
            </div>

            {/* Active dish details */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-display font-bold text-[#111111] tracking-wide">
                  {dish.name}
                </h3>
                <span className="font-mono text-base font-bold text-[#F3921F]">
                  Rs. {dish.price}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed italic">
                "{dish.description}"
              </p>
            </div>
          </div>

          {/* Table QR Code Generator */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 flex flex-col items-center text-center space-y-4 shadow-sm">
            <div className="w-full text-left border-b border-slate-100 pb-3 flex items-center">
              <QrCode className="w-4 h-4 text-[#F3921F] mr-2" />
              <span className="text-xs font-mono text-slate-500 uppercase tracking-wider font-bold">
                Table QR Code Generator
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              When customers scan this code at their table, it opens the Plately browser viewer. Tap anywhere, scan the table surface, and the model instantly locks into 1:1 real-life size on their table!
            </p>

            {/* QR image */}
            <div className="p-4 bg-[#FAF8F5] border border-slate-100 rounded-2xl hover:scale-[1.01] transition-transform duration-300">
              {qrCodeBase64 ? (
                <img src={qrCodeBase64} alt="Plately QR Menu" className="w-44 h-44 block" />
              ) : (
                <div className="w-44 h-44 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 animate-pulse text-xs font-mono">
                  Compiling QR Code...
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="w-full space-y-3">
              <button
                onClick={downloadQRCode}
                disabled={!qrCodeBase64}
                className="w-full flex items-center justify-center space-x-2 bg-[#F3921F] hover:bg-[#e28714] text-white py-2.5 rounded-xl font-bold text-xs transition active:scale-[0.98] disabled:opacity-50 shadow-md shadow-[#F3921F]/10"
              >
                <Download className="w-4 h-4" />
                <span>Download Print-Ready QR Code</span>
              </button>

              {/* Dynamic Hostname Customizer to meet "when i will host this, i want my qr for the real address" */}
              <div className="border-t border-slate-100 pt-3 text-left">
                <button
                  type="button"
                  onClick={() => setShowAdvanceQR(!showAdvanceQR)}
                  className="text-[11px] text-[#F3921F] font-bold font-mono uppercase tracking-wider flex items-center hover:underline focus:outline-none"
                >
                  <Settings className="w-3 h-3 mr-1" />
                  {showAdvanceQR ? "Hide QR Hosting Settings" : "Configure Hosted Real Address"}
                </button>

                {showAdvanceQR && (
                  <div className="mt-2 space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <label className="text-[10px] text-slate-500 font-mono uppercase block font-bold">Custom Hostname (Optional)</label>
                    <div className="flex space-x-1">
                      <input
                        type="url"
                        value={qrHostnameOverride}
                        onChange={(e) => setQrHostnameOverride(e.target.value)}
                        placeholder="https://myrestaurant.com"
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F3921F]"
                      />
                      {qrHostnameOverride && (
                        <button
                          type="button"
                          onClick={() => setQrHostnameOverride("")}
                          className="text-[10px] text-rose-500 font-mono px-1 border border-rose-200 rounded hover:bg-rose-50"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-400 leading-normal">
                      By default, Plately uses the current address (<code className="text-[#F3921F]">{window.location.origin}</code>). If you move this app to a custom domain, type it here to generate the correct QR code!
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-2 text-left space-y-1">
                <span className="text-[10px] text-slate-400 font-mono uppercase font-bold block">Current AR Address:</span>
                <span className="text-xs text-slate-600 font-mono break-all inline-block bg-slate-50 py-1.5 px-2.5 rounded-lg border border-slate-100 w-full">
                  {qrHostnameOverride.trim() || window.location.origin}/?ar=1
                </span>
              </div>
            </div>
          </div>

          {/* Interactive AR Menu User Guide */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50/60 rounded-2xl border border-[#F3921F]/20 p-5 flex flex-col space-y-4 shadow-sm">
            <div className="flex items-center space-x-2 border-b border-[#F3921F]/15 pb-3">
              <Smartphone className="w-4 h-4 text-[#F3921F]" />
              <span className="text-xs font-mono text-slate-800 uppercase tracking-wider font-bold">
                How does the AR Menu work?
              </span>
            </div>
            
            <div className="space-y-3.5 text-xs text-slate-600 leading-relaxed">
              <p>
                Plately uses advanced <strong className="text-slate-800">WebXR (Web Extended Reality)</strong> to project hyper-realistic, 3D digital replicas of real dishes right onto physical dining tables in real scale!
              </p>
              
              <ol className="space-y-2.5 list-decimal list-inside font-medium text-slate-700">
                <li className="pl-1">
                  <strong className="text-[#F3921F] font-semibold">Scan the QR Code:</strong> Point any smartphone camera at the Table QR Code above. Tap the link to open the mobile menu.
                </li>
                <li className="pl-1">
                  <strong className="text-[#F3921F] font-semibold">Scan the Table Surface:</strong> Click <code className="bg-white/80 border px-1 rounded font-mono">Launch AR Camera</code>, scan your table by slowly moving your phone, and tap the table to lock the 3D food in place.
                </li>
                <li className="pl-1">
                  <strong className="text-[#F3921F] font-semibold">1:1 Real Scale:</strong> The dish anchors perfectly to the table in its actual physical size, allowing guests to walk around and see exactly what they are ordering!
                </li>
              </ol>
              
              <div className="bg-white/95 border border-amber-200/50 rounded-xl p-3 text-[11px] text-amber-800 flex items-start space-x-2">
                <Info className="w-4 h-4 text-[#F3921F] flex-shrink-0 mt-0.5" />
                <span>
                  No special apps required! It runs entirely inside standard mobile browsers (Chrome on Android, Safari on iOS).
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Right column: Form and configuration */}
        <div className="lg:col-span-7 flex flex-col space-y-6">
          
          {/* Navigation Tab Header */}
          <div className="flex space-x-1 p-1 bg-slate-100 rounded-xl border border-slate-200/60">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex-1 flex items-center justify-center py-2.5 rounded-lg text-xs font-bold transition ${
                activeTab === "dashboard"
                  ? "bg-white text-[#111111] shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-[#F3921F]" />
              Dish Customizer (Dish-Changing Friendly)
            </button>
            <button
              onClick={() => setActiveTab("presets")}
              className={`flex-1 flex items-center justify-center py-2.5 rounded-lg text-xs font-bold transition ${
                activeTab === "presets"
                  ? "bg-white text-[#111111] shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5 mr-1.5 text-[#F3921F]" />
              Sample Food Presets
            </button>
          </div>

          {/* Toast / Notification Feedbacks */}
          {saveStatus.type && (
            <div className={`p-4 rounded-xl flex items-center space-x-3 border ${
              saveStatus.type === "success" 
                ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                : saveStatus.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : "bg-amber-50 border-amber-200 text-[#F3921F]"
            }`}>
              {saveStatus.type === "success" && <Check className="w-5 h-5 flex-shrink-0 text-emerald-600" />}
              {saveStatus.type === "error" && <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />}
              {saveStatus.type === "loading" && (
                <div className="w-5 h-5 border-2 border-[#F3921F] border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
              )}
              <span className="text-xs font-bold leading-normal">{saveStatus.message}</span>
            </div>
          )}

          {/* Active Configuration Form */}
          {activeTab === "dashboard" && (
            <form onSubmit={handleSaveCustom} className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-6 shadow-sm">
              
              <div className="space-y-1 border-b border-slate-100 pb-4 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-display font-bold text-[#111111]">
                    Configure Active Menu Dish
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">Instantly change the food item shown to guests.</p>
                </div>
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  className="flex items-center space-x-1 bg-[#FAF8F5] text-slate-500 hover:text-slate-700 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-bold"
                >
                  <RotateCcw className="w-3 h-3 text-[#F3921F]" />
                  <span>Reset Default</span>
                </button>
              </div>

              {/* Form Input fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-500 uppercase tracking-wider block font-bold">Dish Name</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Avocado Salad, Chocolate Souffle..."
                    className="w-full bg-[#FAF8F5] border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F3921F] focus:ring-1 focus:ring-[#F3921F]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-500 uppercase tracking-wider block font-bold">Price (Rs.)</label>
                  <input
                    type="text"
                    required
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="e.g. 350"
                    className="w-full bg-[#FAF8F5] border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F3921F] focus:ring-1 focus:ring-[#F3921F] font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-500 uppercase tracking-wider block font-bold">Description</label>
                <textarea
                  required
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Describe the dish preparation, freshness, and delicious ingredients..."
                  className="w-full bg-[#FAF8F5] border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F3921F] focus:ring-1 focus:ring-[#F3921F] leading-relaxed"
                />
              </div>

              {/* Scale Control for Hotel Staff */}
              <div className="bg-[#FAF8F5] p-5 rounded-xl border border-slate-200/60 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center space-x-2">
                    <Scale className="w-4 h-4 text-[#F3921F]" />
                    <span className="text-xs font-mono text-slate-500 uppercase tracking-wider block font-bold">
                      AR Calibration Scale (Staff-Only Controls)
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F3921F]/10 text-[#F3921F] font-bold border border-[#F3921F]/20">
                      {formScale}x Size
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 font-bold border border-amber-500/20">
                      {currentPercent}%
                    </span>
                  </div>
                </div>
                
                <p className="text-[11px] text-slate-400 leading-normal">
                  Control the physical display size of the food in camera AR. Both sliders are fully synchronized and active; modifying either updates the other in real-time.
                </p>

                {/* Option A: Ratio Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wide">
                    <span>Option A: Ratio Slider (0.001x - 2.0x)</span>
                    <span className="text-[#F3921F]">Ratio Scale</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <input
                      type="range"
                      min="0.001"
                      max="2.0"
                      step="0.001"
                      value={formScale}
                      onChange={(e) => setFormScale(e.target.value)}
                      className="flex-1 accent-[#F3921F] h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="0.001"
                        max="2.0"
                        step="0.001"
                        value={formScale}
                        onChange={(e) => setFormScale(e.target.value)}
                        className="w-24 bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs text-slate-800 text-center font-mono focus:outline-none focus:border-[#F3921F]"
                      />
                      <span className="text-[10px] text-slate-400 font-medium w-8">ratio</span>
                    </div>
                  </div>
                </div>

                {/* Option B: Percentage Slider */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wide">
                    <span>Option B: Percent Slider (0.1% - 100% of 1:1 Size)</span>
                    <span className="text-amber-500">Percent Scale</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <input
                      type="range"
                      min="0.1"
                      max="100"
                      step="0.1"
                      value={currentPercent}
                      onChange={handlePercentChange}
                      className="flex-1 accent-[#F3921F] h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="0.1"
                        max="100"
                        step="0.1"
                        value={currentPercent}
                        onChange={(e) => {
                          const val = Math.min(100, Math.max(0.1, parseFloat(e.target.value) || 0.1));
                          setFormScale((val / 100).toFixed(4));
                        }}
                        className="w-24 bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs text-slate-800 text-center font-mono focus:outline-none focus:border-[#F3921F]"
                      />
                      <span className="text-[10px] text-slate-400 font-medium w-8">% size</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 justify-between items-center">
                  <div className="flex flex-wrap gap-1.5">
                    {["0.05", "0.08", "0.1", "0.5", "1.0"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFormScale(s)}
                        className={`text-[10px] font-mono px-2 py-1 rounded border transition ${
                          formScale === s
                            ? "bg-[#F3921F] text-white border-[#F3921F]"
                            : "bg-white hover:bg-slate-50 text-slate-500 border-slate-200"
                        }`}
                      >
                        {s === "1.0" ? "1.0 (100% Real Size)" : s === "0.08" ? "0.08 (~5 Inches)" : `${s}x (${Math.round(parseFloat(s) * 100)}%)`}
                      </button>
                    ))}
                  </div>

                  {/* High Quality Auto-Scale to 7 Inches (17.78cm) Action Button */}
                  <button
                    type="button"
                    onClick={handleAutoScaleTo7Inches}
                    className="flex items-center space-x-1.5 bg-[#F3921F] hover:bg-[#d87d15] text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm transition active:scale-95 animate-pulse"
                    title="Read 3D bounds and scale to exactly 7 inches in horizontal width"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>Auto-Scale (7 Inches Width)</span>
                  </button>
                </div>
              </div>

              {/* Upload 3D Models (Dish-Changing Friendly) */}
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest font-bold">
                    Upload Your Own 3D Dish Models (iOS & Android Compatible)
                  </h3>
                  <p className="text-[11px] text-slate-400 leading-normal mt-1">
                    To make your active menu dynamic and change the food items on the fly, upload both standard GLB and iOS USDZ files here.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* GLB File Upload */}
                  <div className="bg-[#FAF8F5] p-4 rounded-xl border border-slate-200/60 space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#111111] uppercase tracking-wider">Android Model</span>
                        <span className="text-[10px] font-mono bg-[#F3921F]/10 text-[#F3921F] px-1.5 py-0.5 rounded uppercase font-bold">.GLB</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Used for Android Google Chrome, general WebXR, and our live previewer on desktop.</p>
                    </div>

                    <div className="relative border-2 border-dashed border-slate-200 hover:border-[#F3921F]/50 rounded-xl p-4 text-center cursor-pointer transition">
                      <input
                        type="file"
                        accept=".glb"
                        onChange={(e) => setGlbFile(e.target.files?.[0] || null)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Upload className="w-5 h-5 mx-auto text-slate-400 mb-1.5" />
                      <span className="text-[11px] text-slate-600 block font-medium truncate">
                        {glbFile ? glbFile.name : "Select or drag .glb"}
                      </span>
                      {glbFile && <span className="text-[9px] text-emerald-600 mt-1 block font-bold">✓ Selected</span>}
                    </div>

                    {/* Show active file */}
                    {!glbFile && (
                      <div className="text-[10px] text-slate-400 bg-white p-2 rounded border border-slate-100 truncate font-mono">
                        Active: {dish.glbPath.startsWith("/uploads/") ? "Custom uploaded food" : "Standard Avocado GLB"}
                      </div>
                    )}
                  </div>

                  {/* USDZ File Upload */}
                  <div className="bg-[#FAF8F5] p-4 rounded-xl border border-slate-200/60 space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#111111] uppercase tracking-wider">iOS Model</span>
                        <span className="text-[10px] font-mono bg-[#F3921F]/10 text-[#F3921F] px-1.5 py-0.5 rounded uppercase font-bold">.USDZ</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Used for Apple Safari and iOS AR Quick Look compatibility on iPhones & iPads.</p>
                    </div>

                    <div className="relative border-2 border-dashed border-slate-200 hover:border-[#F3921F]/50 rounded-xl p-4 text-center cursor-pointer transition">
                      <input
                        type="file"
                        accept=".usdz"
                        onChange={(e) => setUsdzFile(e.target.files?.[0] || null)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Upload className="w-5 h-5 mx-auto text-slate-400 mb-1.5" />
                      <span className="text-[11px] text-slate-600 block font-medium truncate">
                        {usdzFile ? usdzFile.name : "Select or drag .usdz"}
                      </span>
                      {usdzFile && <span className="text-[9px] text-emerald-600 mt-1 block font-bold">✓ Selected</span>}
                    </div>

                    {/* Show active file */}
                    {!usdzFile && (
                      <div className="text-[10px] text-slate-400 bg-white p-2 rounded border border-slate-100 truncate font-mono">
                        Active: {dish.usdzPath.startsWith("/uploads/") ? "Custom uploaded food" : "Standard Avocado USDZ"}
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* Apply action button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saveStatus.type === "loading"}
                  className="w-full bg-[#F3921F] hover:bg-[#e28714] text-white py-3.5 rounded-xl font-bold text-xs tracking-wider uppercase transition active:scale-[0.99] disabled:opacity-50 shadow-md shadow-[#F3921F]/10"
                >
                  Save & Apply Active Dish
                </button>
              </div>

              {/* Informative advice */}
              <div className="p-3.5 bg-[#FAF8F5] rounded-xl border border-slate-200/60 flex space-x-2.5 items-start">
                <Info className="w-4.5 h-4.5 text-[#F3921F] flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                  <strong>3D Scan Tip:</strong> You can scan your restaurant’s real dishes directly on their custom plates using scanning tools like Polycam, Polycam Photogrammetry, or RealityScan, export both formats (<code className="text-[#F3921F]">.glb</code> & <code className="text-[#F3921F]">.usdz</code>), and upload them here to swap menu items instantly on tables!
                </p>
              </div>

            </form>
          )}

          {/* Sample Presets Tab */}
          {activeTab === "presets" && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-6 shadow-sm">
              <div>
                <h2 className="text-lg font-display font-bold text-[#111111]">
                  Sample Plately Food Presets
                </h2>
                <p className="text-xs text-slate-400 font-medium">Quickly swap the current dish configuration to test various high-fidelity food items.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {presets.map((p, idx) => (
                  <div 
                    key={idx} 
                    className="bg-[#FAF8F5] p-4 rounded-xl border border-slate-200/60 flex flex-col justify-between space-y-4 hover:border-[#F3921F]/30 transition group shadow-sm"
                  >
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-bold text-[#111111] group-hover:text-[#F3921F] transition">
                          {p.name}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-500">Rs. {p.price}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 italic leading-relaxed font-medium">"{p.description}"</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[9px] text-slate-400 font-mono uppercase font-bold">
                        <span>GLB Support: Yes</span>
                        <span>USDZ Support: Yes</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => applyPreset(p)}
                        className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold py-2 rounded-lg transition active:scale-[0.98] shadow-sm"
                      >
                        Apply Preset
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </main>

      {/* Desktop Footer */}
      <footer className="border-t border-slate-200/80 py-6 px-6 mt-12 bg-white shadow-inner">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-xs text-slate-400 space-y-3 md:space-y-0 font-medium">
          <div className="flex items-center space-x-2">
            <span>© 2026 Plately, Inc.</span>
            <span>•</span>
            <span className="text-[#F3921F] font-bold">Locked scale tabletop AR Engine</span>
          </div>
          <div className="flex space-x-6">
            <span>Chrome (Android) Optimized</span>
            <span>Safari (iOS) Optimized</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
