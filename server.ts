import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import qrcode from "qrcode";

const app = express();
const PORT = 3000;

// Ensure directories exist
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const DATA_DIR = path.join(process.cwd(), "data");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Config file path
const DISH_CONFIG_PATH = path.join(DATA_DIR, "dish.json");

interface DishConfig {
  name: string;
  description: string;
  price: string;
  glbPath: string;
  usdzPath: string;
  isCustom: boolean;
  scale: string;
}

// Default dish configurations
const DEFAULT_DISH: DishConfig = {
  name: "Plately Avocado Salad",
  description: "A perfectly ripe Hass avocado, sliced and served fresh with organic sea salt, lemon zest, and extra virgin olive oil. A masterclass in simplicity and natural flavor.",
  price: "350",
  glbPath: "/models/Avocado.glb",
  usdzPath: "/models/Avocado.usdz",
  isCustom: false,
  scale: "1.0",
};

// Read current dish config
function getDishConfig(): DishConfig {
  try {
    if (fs.existsSync(DISH_CONFIG_PATH)) {
      const data = fs.readFileSync(DISH_CONFIG_PATH, "utf-8");
      const config = JSON.parse(data);
      if (!config.scale) {
        config.scale = "1.0";
      }
      return config;
    }
  } catch (error) {
    console.error("Error reading dish configuration:", error);
  }
  return DEFAULT_DISH;
}

// Write dish config
function saveDishConfig(config: DishConfig) {
  try {
    fs.writeFileSync(DISH_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing dish configuration:", error);
  }
}

// Set up Multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = file.fieldname === "glb" ? "dish_model" : "dish_model_ios";
    cb(null, `${prefix}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".glb" || ext === ".usdz") {
      cb(null, true);
    } else {
      cb(new Error("Only .glb and .usdz files are allowed"));
    }
  }
});

// Parse requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use("/uploads", express.static(UPLOADS_DIR));

// API: Get active dish
app.get("/api/dish", (req, res) => {
  res.json(getDishConfig());
});

// API: Reset active dish to default
app.post("/api/dish/reset", (req, res) => {
  saveDishConfig(DEFAULT_DISH);
  res.json({ success: true, config: DEFAULT_DISH });
});

// API: Update dish
app.post("/api/dish", upload.fields([{ name: "glb", maxCount: 1 }, { name: "usdz", maxCount: 1 }]), (req, res) => {
  try {
    const current = getDishConfig();
    const body = req.body;
    
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    
    let glbPath = current.glbPath;
    let usdzPath = current.usdzPath;
    let isCustom = current.isCustom;

    if (files?.glb && files.glb.length > 0) {
      glbPath = `/uploads/${files.glb[0].filename}`;
      isCustom = true;
    } else if (body.glbUrl) {
      glbPath = body.glbUrl;
    }

    if (files?.usdz && files.usdz.length > 0) {
      usdzPath = `/uploads/${files.usdz[0].filename}`;
      isCustom = true;
    } else if (body.usdzUrl) {
      usdzPath = body.usdzUrl;
    }

    const updatedConfig: DishConfig = {
      name: body.name || current.name,
      description: body.description || current.description,
      price: body.price || current.price,
      glbPath,
      usdzPath,
      isCustom: body.isCustom === "true" || body.isCustom === true || isCustom,
      scale: body.scale || current.scale || "1.0"
    };

    saveDishConfig(updatedConfig);
    res.json({ success: true, config: updatedConfig });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "An error occurred while saving the dish" });
  }
});

// API: Generate QR Code base64 image
app.get("/api/qr", async (req, res) => {
  try {
    const urlToEncode = req.query.url as string || "";
    if (!urlToEncode) {
      return res.status(400).json({ error: "URL query parameter is required" });
    }
    const qrImageBase64 = await qrcode.toDataURL(urlToEncode, {
      margin: 1,
      width: 400,
      color: {
        dark: "#0F172A", // Slate-900
        light: "#FFFFFF"
      }
    });
    res.json({ qr: qrImageBase64 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Setup Vite development server or production static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
