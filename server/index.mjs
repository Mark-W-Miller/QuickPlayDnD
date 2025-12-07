import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseScript } from "../app/language/parser.js";

// Toggle logging classes by editing this set. COMMS logs request/response payloads.
const ENABLED_LOG_CLASSES = new Set(["COMMS"]);
// Optionally suppress script body logging to cut noise.
const LOG_SCRIPT_LINES = false;
const SCRIPT_PREVIEW_LINES = 3;
const LOG_STATIC = false;

const indexToCoord = (col, row) => `${col},${row} '${String.fromCharCode(65 + col)}${row}'`;

const summarizeScript = (text = "") => {
  const lines = text.split(/\r?\n/);
  const preview = lines
    .map((l) => l.trim())
    .filter((l) => l.length)
    .slice(0, SCRIPT_PREVIEW_LINES)
    .map((l) => (l.length > 120 ? `${l.slice(0, 117)}...` : l));
  return { lines: lines.length, preview };
};

const sanitizeForLog = (value) => {
  if (value && typeof value === "object") {
    // Collapse coordinate objects to a short string.
    if (!Array.isArray(value) && "col" in value && "row" in value) {
      const c = Number(value.col);
      const r = Number(value.row);
      if (Number.isFinite(c) && Number.isFinite(r)) {
        return indexToCoord(c, r);
      }
    }
    if (Array.isArray(value)) {
      return value.map((v) => sanitizeForLog(v));
    }
    const copy = {};
    const type = value.type || value.Type || value.TYPE;
    for (const [k, v] of Object.entries(value)) {
      const lower = k.toLowerCase();
      if (lower.includes("height")) {
        copy[k] = "<data-removed>";
        continue;
      }
      if (type === "height-rows" && lower === "rows") {
        copy[k] = "<rows-omitted>";
        continue;
      }
      if (type === "roads" && lower === "refs" && Array.isArray(v)) {
        copy[k] = "<refs-omitted>";
        continue;
      }
      copy[k] = sanitizeForLog(v);
    }
    return copy;
  }
  return value;
};

const prettyJson = (obj) => JSON.stringify(sanitizeForLog(obj), null, 2);

const logClass = (cls, message, obj) => {
  if (!ENABLED_LOG_CLASSES.has(cls)) return;
  const suffix = obj === undefined ? "" : `\n${prettyJson(obj)}`;
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
    let logBody = raw;

    if (contentType.includes("application/json")) {
      try {
        const payload = JSON.parse(raw || "{}");
        scriptText = payload.script || payload.data || "";
        logBody = LOG_SCRIPT_LINES ? { ...payload, scriptLines: (payload.script || "").split(/\r?\n/) } : undefined;
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
    } else {
      scriptText = raw || "";
      logBody = LOG_SCRIPT_LINES ? { textLines: (raw || "").split(/\r?\n/) } : undefined;
    }

    const logPayload = {
      method: req.method,
      path: "/api/run-script",
      bodyBytes: Buffer.byteLength(raw || "", "utf8"),
      script: summarizeScript(scriptText)
    };
    if (LOG_SCRIPT_LINES && logBody !== undefined) logPayload.body = logBody;
    logClass("COMMS", "Received /api/run-script", logPayload);

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
  const pathName = url.pathname;
  const isRoleAlias =
    pathName === "/dm" || pathName === "/player" || /^\/cl/i.test(pathName);
  let requestedPath = pathName === "/" || isRoleAlias ? "/index.html" : pathName;
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
      if (LOG_STATIC) logClass("COMMS", "Static not found", { path: requestedPath });
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    } else {
      console.error("Static serve error:", err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  }
};

let staticLogBuffer = [];
let staticLogTimer = null;
const flushStaticLog = () => {
  if (!staticLogBuffer.length) return;
  if (staticLogTimer) {
    clearTimeout(staticLogTimer);
    staticLogTimer = null;
  }
  if (LOG_STATIC) {
    const files = Array.from(new Set(staticLogBuffer));
    logClass("COMMS", "Served static batch", { files });
  }
  staticLogBuffer = [];
};
const enqueueStaticLog = (path) => {
  staticLogBuffer.push(path);
  if (staticLogTimer) return;
  staticLogTimer = setTimeout(() => {
    flushStaticLog();
  }, 200);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/run-script") {
    flushStaticLog();
    await handleRunScript(req, res);
    return;
  }
  await serveStatic(req, res, url);
  enqueueStaticLog(url.pathname);
});

server.listen(defaultPort, () => {
  // Clear terminal for a cleaner log view on each start.
  if (process.stdout.isTTY) process.stdout.write("\x1Bc");
  console.log(`QuickPlayDnD server running at http://localhost:${defaultPort}`);
  console.log(`Serving static files from ${rootDir}`);
});
