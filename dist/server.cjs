var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_multer = __toESM(require("multer"), 1);
var import_vite = require("vite");
var import_qrcode = __toESM(require("qrcode"), 1);
var app = (0, import_express.default)();
var PORT = 3e3;
var UPLOADS_DIR = import_path.default.join(process.cwd(), "uploads");
var DATA_DIR = import_path.default.join(process.cwd(), "data");
if (!import_fs.default.existsSync(UPLOADS_DIR)) {
  import_fs.default.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!import_fs.default.existsSync(DATA_DIR)) {
  import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
}
var DISH_CONFIG_PATH = import_path.default.join(DATA_DIR, "dish.json");
var DEFAULT_DISH = {
  name: "Plately Avocado Salad",
  description: "A perfectly ripe Hass avocado, sliced and served fresh with organic sea salt, lemon zest, and extra virgin olive oil. A masterclass in simplicity and natural flavor.",
  price: "350",
  glbPath: "/models/Avocado.glb",
  usdzPath: "/models/Avocado.usdz",
  isCustom: false,
  scale: "1.0"
};
function getDishConfig() {
  try {
    if (import_fs.default.existsSync(DISH_CONFIG_PATH)) {
      const data = import_fs.default.readFileSync(DISH_CONFIG_PATH, "utf-8");
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
function saveDishConfig(config) {
  try {
    import_fs.default.writeFileSync(DISH_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing dish configuration:", error);
  }
}
var storage = import_multer.default.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = import_path.default.extname(file.originalname).toLowerCase();
    const prefix = file.fieldname === "glb" ? "dish_model" : "dish_model_ios";
    cb(null, `${prefix}_${Date.now()}${ext}`);
  }
});
var upload = (0, import_multer.default)({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = import_path.default.extname(file.originalname).toLowerCase();
    if (ext === ".glb" || ext === ".usdz") {
      cb(null, true);
    } else {
      cb(new Error("Only .glb and .usdz files are allowed"));
    }
  }
});
app.use(import_express.default.json());
app.use(import_express.default.urlencoded({ extended: true }));
app.use("/uploads", import_express.default.static(UPLOADS_DIR));
app.get("/api/dish", (req, res) => {
  res.json(getDishConfig());
});
app.post("/api/dish/reset", (req, res) => {
  saveDishConfig(DEFAULT_DISH);
  res.json({ success: true, config: DEFAULT_DISH });
});
app.post("/api/dish", upload.fields([{ name: "glb", maxCount: 1 }, { name: "usdz", maxCount: 1 }]), (req, res) => {
  try {
    const current = getDishConfig();
    const body = req.body;
    const files = req.files;
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
    const updatedConfig = {
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
  } catch (error) {
    res.status(500).json({ error: error.message || "An error occurred while saving the dish" });
  }
});
app.get("/api/qr", async (req, res) => {
  try {
    const urlToEncode = req.query.url || "";
    if (!urlToEncode) {
      return res.status(400).json({ error: "URL query parameter is required" });
    }
    const qrImageBase64 = await import_qrcode.default.toDataURL(urlToEncode, {
      margin: 1,
      width: 400,
      color: {
        dark: "#0F172A",
        // Slate-900
        light: "#FFFFFF"
      }
    });
    res.json({ qr: qrImageBase64 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
