import { Router } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { extname } from "path";
import { promises as fs } from "fs";
import { config } from "../config/config.js";

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "map") {
      cb(null, config.media.mapsDir);
    } else if (file.fieldname === "token") {
      cb(null, config.media.tokensDir);
    } else {
      cb(new Error("Unknown upload field"), "");
    }
  },
  filename: (req, file, cb) => {
    const ext = extname(file.originalname);
    cb(null, `${Date.now()}-${nanoid(6)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: config.media.maxFileSizeMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "map") {
      return cb(null, /^image\/(png|jpe?g)$/i.test(file.mimetype));
    }
    if (file.fieldname === "token") {
      return cb(null, file.mimetype === "image/svg+xml");
    }
    return cb(null, false);
  }
});

router.post("/map", upload.single("map"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Map upload failed or invalid file type" });
  }
  return res.status(201).json({
    filename: req.file.filename,
    url: `/media/maps/${req.file.filename}`
  });
});

router.get("/maps", async (req, res) => {
  try {
    const files = await fs.readdir(config.media.mapsDir);
    const payload = files.map((name) => ({
      filename: name,
      url: `/media/maps/${name}`
    }));
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/token", upload.single("token"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Token upload failed or invalid file type" });
  }
  return res.status(201).json({
    filename: req.file.filename,
    url: `/media/tokens/${req.file.filename}`
  });
});

router.get("/tokens", async (req, res) => {
  try {
    const files = await fs.readdir(config.media.tokensDir);
    const payload = files.map((name) => ({
      filename: name,
      url: `/media/tokens/${name}`
    }));
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
