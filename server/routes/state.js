import { Router } from "express";
import { promises as fs } from "fs";
import { resolve } from "path";
import { nanoid } from "nanoid";
import { fileURLToPath } from "url";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const statesDir = resolve(__dirname, "../data/states");

router.post("/save", async (req, res) => {
  const id = nanoid(10);
  const filePath = resolve(statesDir, `${id}.json`);
  try {
    await fs.mkdir(statesDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(req.body, null, 2), "utf-8");
    return res.status(201).json({ id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  const filePath = resolve(statesDir, `${req.params.id}.json`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return res.json(JSON.parse(content));
  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(404).json({ error: "State not found" });
    }
    return res.status(500).json({ error: err.message });
  }
});

export default router;
