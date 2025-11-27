const canvas = document.getElementById("map-canvas");
const ctx = canvas.getContext("2d");
const logEl = document.getElementById("log");
const inputEl = document.getElementById("script-input");

const starterScript = `# Example script
BACKGROUND https://images.unsplash.com/photo-1501785888041-af3ef285b470
GRID square SIZE 48
BOARD 20x12

SPRITE DEF VC name="Vin Chi" url="https://upload.wikimedia.org/wikipedia/commons/3/3f/Chess_qdt45.svg" size=1 tint=#8b5cf6
SPRITE DEF DR name="Drake" url="https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_qlt45.svg" size=2 tint=#ef4444

PLACE VC @ B4
PLACE DR @ H7
`;

document.getElementById("starter").textContent = starterScript;
inputEl.value = starterScript;

const state = {
  map: {
    id: "default",
    name: "Default",
    gridSizePx: 48,
    gridType: "square",
    cols: 20,
    rows: 12,
    backgroundUrl: ""
  },
  tokenDefs: [],
  tokens: []
};

const log = (msg) => {
  const div = document.createElement("div");
  div.className = "log-entry";
  div.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
  logEl.prepend(div);
  while (logEl.children.length > 50) logEl.removeChild(logEl.lastChild);
};

const coordToIndex = (coord) => {
  const match = /^([A-Z])(\d+)$/i.exec(coord.trim());
  if (!match) return null;
  const [, colChar, rowStr] = match;
  return { col: colChar.toUpperCase().charCodeAt(0) - 65, row: Number(rowStr) - 1 };
};

const parseKeyValues = (input) => {
  const regex = /(\w+)=("[^"]*"|'[^']*'|[^\s]+)/g;
  const out = {};
  let m;
  while ((m = regex.exec(input)) !== null) {
    const [, key, rawVal] = m;
    out[key.toLowerCase()] = rawVal.replace(/^['"]|['"]$/g, "");
  }
  return out;
};

const parseScript = (script) => {
  const lines = script.split(/\r?\n/);
  const instructions = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    let match;
    if ((match = /^BACKGROUND\s+(.+)$/i.exec(line))) {
      instructions.push({ type: "background", url: match[1].trim() });
      continue;
    }
    if ((match = /^GRID\s+(square|hex)\s+SIZE\s+(\d+)$/i.exec(line))) {
      instructions.push({ type: "grid", grid: match[1].toLowerCase(), size: Number(match[2]) });
      continue;
    }
    if ((match = /^BOARD\s+(\d+)[xX](\d+)$/i.exec(line))) {
      instructions.push({ type: "board", cols: Number(match[1]), rows: Number(match[2]) });
      continue;
    }
    if ((match = /^SPRITE\s+DEF\s+(\w+)\s+(.+)$/i.exec(line))) {
      const code = match[1].toUpperCase();
      const kv = parseKeyValues(match[2]);
      instructions.push({
        type: "sprite-def",
        def: {
          id: code,
          code,
          name: kv.name || code,
          category: kv.category || "Object",
          svgUrl: kv.url || kv.svg || "",
          baseSize: kv.size ? Number(kv.size) : 1,
          colorTint: kv.tint
        }
      });
      continue;
    }
    if ((match = /^PLACE\s+(\w+)\s+@\s+([A-Z0-9,\s]+)$/i.exec(line))) {
      const code = match[1].toUpperCase();
      const coords = match[2]
        .split(",")
        .map((c) => coordToIndex(c))
        .filter(Boolean);
      if (coords.length) instructions.push({ type: "place", code, coords });
      continue;
    }
    if ((match = /^MOVE\s+(\w+)\s+TO\s+([A-Z]\d+)$/i.exec(line))) {
      const coord = coordToIndex(match[2]);
      if (coord) instructions.push({ type: "move", tokenId: match[1], coord });
      continue;
    }
    if ((match = /^REMOVE\s+(\w+)$/i.exec(line))) {
      instructions.push({ type: "remove", tokenId: match[1] });
      continue;
    }
    if ((match = /^CLEAR\s+(TOKENS|ALL)$/i.exec(line))) {
      instructions.push({ type: "clear", scope: match[1].toLowerCase() });
      continue;
    }
  }
  return instructions;
};

const applyInstructions = (instructions) => {
  let working = JSON.parse(JSON.stringify(state));

  const ensureMap = () => {
    if (working.map) return working.map;
    working.map = {
      id: "default-map",
      name: "Default Map",
      gridSizePx: 48,
      gridType: "square",
      cols: 20,
      rows: 12,
      backgroundUrl: ""
    };
    return working.map;
  };

  const addDef = (def) => {
    const idx = working.tokenDefs.findIndex((d) => d.code === def.code);
    if (idx >= 0) working.tokenDefs[idx] = def;
    else working.tokenDefs.push(def);
  };

  const upsertToken = (token) => {
    const idx = working.tokens.findIndex((t) => t.id === token.id);
    if (idx >= 0) working.tokens[idx] = token;
    else working.tokens.push(token);
  };

  const removeToken = (tokenId) => {
    const idx = working.tokens.findIndex((t) => t.id.startsWith(tokenId));
    if (idx >= 0) working.tokens.splice(idx, 1);
  };

  instructions.forEach((instr) => {
    switch (instr.type) {
      case "background": {
        const map = ensureMap();
        working.map = { ...map, backgroundUrl: instr.url };
        break;
      }
      case "grid": {
        const map = ensureMap();
        working.map = { ...map, gridType: instr.grid, gridSizePx: instr.size };
        break;
      }
      case "board": {
        const map = ensureMap();
        working.map = { ...map, cols: instr.cols, rows: instr.rows };
        break;
      }
      case "sprite-def": {
        addDef(instr.def);
        break;
      }
      case "place": {
        const def = working.tokenDefs.find((d) => d.code === instr.code);
        if (!def) {
          log(`Unknown sprite code ${instr.code}`);
          return;
        }
        const map = ensureMap();
        const existingCount = working.tokens.filter((t) => t.id.startsWith(def.code)).length;
        instr.coords.forEach((coord, idx) => {
          upsertToken({
            id: `${def.code}-${existingCount + idx + 1}`,
            defId: def.id,
            mapId: map.id,
            col: coord.col,
            row: coord.row
          });
        });
        break;
      }
      case "move": {
        const token = working.tokens.find((t) => t.id.startsWith(instr.tokenId));
        if (!token) {
          log(`Token ${instr.tokenId} not found`);
          return;
        }
        upsertToken({ ...token, col: instr.coord.col, row: instr.coord.row });
        break;
      }
      case "remove": {
        removeToken(instr.tokenId);
        break;
      }
      case "clear": {
        if (instr.scope === "tokens") {
          working.tokens = [];
        } else {
          working = { map: null, tokenDefs: [], tokens: [] };
        }
        break;
      }
      default:
        break;
    }
  });

  state.map = working.map;
  state.tokenDefs = working.tokenDefs;
  state.tokens = working.tokens;
  render();
  log(`Applied ${instructions.length} instruction(s)`);
};

const drawHex = (cx, cy, size, fill, stroke) => {
  const r = size / 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 3 * i + Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.fill();
  ctx.stroke();
};

const render = () => {
  const map = state.map;
  if (!map) return;
  const cell = map.gridSizePx;
  canvas.width = map.cols * cell + cell;
  canvas.height = map.rows * cell + cell;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (map.backgroundUrl) {
    const img = new Image();
    img.onload = () => {
      ctx.globalAlpha = 0.6;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    };
    img.src = map.backgroundUrl;
  }

  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const x = c * cell + cell / 2 + (map.gridType === "hex" && r % 2 ? cell / 2 : 0);
      const y = r * (map.gridType === "hex" ? cell * 0.75 : cell) + cell / 2;
      if (map.gridType === "hex") {
        drawHex(x, y, cell, "rgba(255,255,255,0.03)", "rgba(255,255,255,0.08)");
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.02)";
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x - cell / 2, y - cell / 2, cell, cell);
        ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell);
      }
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "10px monospace";
      ctx.fillText(String.fromCharCode(65 + c) + (r + 1), x - cell / 2 + 4, y - cell / 2 + 12);
    }
  }

  state.tokens.forEach((token) => {
    const def = state.tokenDefs.find((d) => d.id === token.defId);
    if (!def) return;
    const x = token.col * cell + cell / 2 + (map.gridType === "hex" && token.row % 2 ? cell / 2 : 0);
    const y = token.row * (map.gridType === "hex" ? cell * 0.75 : cell) + cell / 2;
    const sizePx = cell * def.baseSize;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, sizePx / 2, 0, Math.PI * 2);
    ctx.fillStyle = def.colorTint ? `${def.colorTint}55` : "#ffffff33";
    ctx.fill();
    ctx.strokeStyle = "#ffffffaa";
    ctx.stroke();
    ctx.clip();
    if (def.svgUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, -sizePx / 2, -sizePx / 2, sizePx, sizePx);
      };
      img.src = def.svgUrl;
    }
    ctx.restore();

    ctx.fillStyle = "#e9eef7";
    ctx.font = "12px monospace";
    ctx.fillText(token.id, x - sizePx / 2, y - sizePx / 2 - 4);
  });
};

document.getElementById("run-btn").addEventListener("click", () => {
  const instructions = parseScript(inputEl.value);
  if (!instructions.length) {
    log("No instructions parsed");
    return;
  }
  applyInstructions(instructions);
});

document.getElementById("clear-btn").addEventListener("click", () => {
  applyInstructions([{ type: "clear", scope: "tokens" }]);
});

render();
