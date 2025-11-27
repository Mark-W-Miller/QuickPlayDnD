import { resolve } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");

dotenv.config();

const ROOT = resolve(__dirname, "..");
const MEDIA_ROOT = resolve(ROOT, "media");

export const config = {
  port: process.env.PORT || 4000,
  media: {
    root: MEDIA_ROOT,
    mapsDir: resolve(MEDIA_ROOT, "maps"),
    tokensDir: resolve(MEDIA_ROOT, "tokens"),
    maxFileSizeMb: Number(process.env.MAX_UPLOAD_MB || 25)
  }
};
