import express from "express";
import cors from "cors";
import morgan from "morgan";
import { promises as fs } from "fs";
import { resolve } from "path";
import mediaRoutes from "./routes/media.js";
import stateRoutes from "./routes/state.js";
import { config } from "./config/config.js";

const app = express();

async function ensureMediaDirs() {
  await fs.mkdir(config.media.mapsDir, { recursive: true });
  await fs.mkdir(config.media.tokensDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.use("/media/maps", express.static(config.media.mapsDir));
app.use("/media/tokens", express.static(config.media.tokensDir));

app.use("/api/media", mediaRoutes);
app.use("/api/state", stateRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

const start = async () => {
  try {
    await ensureMediaDirs();
    app.listen(config.port, () => {
      console.log(`Tactical Battle Board API running on http://localhost:${config.port}`);
    });
  } catch (err) {
    console.error("Failed to start server", err);
    process.exit(1);
  }
};

start();
