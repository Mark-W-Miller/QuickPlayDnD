import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseScript } from "../app/language/parser.js";

// Toggle logging classes by editing this set. COMMS logs request/response payloads.
const ENABLED_LOG_CLASSES = new Set(["COMMS"]);

const logClass = (cls, message, obj) => {
  if (!ENABLED_LOG_CLASSES.has(cls)) return;
  const suffix = obj === undefined ? "" : `\n${JSON.stringify(obj, null, 2)}`;
  console.log(`[${cls}] ${message}${suffix}`);
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const defaultPort = Number(process.env.PORT) || 3000;

const MIME_MAP = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary",
  ".bin": "application/octet-stream",
  ".wasm": "application/wasm",
  ".txt": "text/plain"
};

const mimeFor = (filePath) => MIME_MAP[path.extname(filePath).toLowerCase()] || "application/octet-stream";

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1e6) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

const handleRunScript = async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }

  try {
    const raw = await readBody(req);
    const contentType = req.headers["content-type"] || "";
    let scriptText = "";

    logClass("COMMS", "Received /api/run-script", {
      method: req.method,
      headers: req.headers,
      body: raw
    });

    if (contentType.includes("application/json")) {
      try {
        const payload = JSON.parse(raw || "{}");
        scriptText = payload.script || payload.data || "";
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
    } else {
      scriptText = raw || "";
    }

    const instructions = parseScript(String(scriptText), {});
    const payload = { instructions };
    logClass("COMMS", "Responding /api/run-script", payload);
    sendJson(res, 200, payload);
  } catch (err) {
    console.error("Failed to run script:", err);
    sendJson(res, 500, { error: "Failed to process script" });
  }
};

const safeResolve = (requestedPath) => {
  const normalized = path.normalize(decodeURIComponent(requestedPath));
  const resolved = path.resolve(rootDir, `.${normalized}`);
  if (!resolved.startsWith(rootDir)) return null;
  return resolved;
};

const serveStatic = async (req, res, url) => {
  let requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  let filePath = safeResolve(requestedPath);

  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  try {
    let stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      stats = await fs.stat(filePath);
    }

    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeFor(filePath),
      "Content-Length": data.length
    });
    res.end(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    } else {
      console.error("Static serve error:", err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  logClass("COMMS", "Incoming request", {
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    headers: req.headers
  });
  if (url.pathname === "/api/run-script") {
    await handleRunScript(req, res);
    return;
  }
  await serveStatic(req, res, url);
  logClass("COMMS", "Served static", { path: url.pathname, method: req.method });
});

server.listen(defaultPort, () => {
  console.log(`QuickPlayDnD server running at http://localhost:${defaultPort}`);
  console.log(`Serving static files from ${rootDir}`);
});
