import { state } from "../state.js";
import { coordToIndex } from "./parser.js";
import { tokenTemplates, buildTemplateSvg, ensureTemplateDef } from "../tokens.js";

const SCRIPTS_BASE = "data/scripts";

export const createScriptRunner = ({
  parseScript,
  setBackground,
  updateBoardScene,
  render,
  clearGroup,
  log,
  logClass,
  scriptTreeManager
}) => {
  const applyInstructions = (instructions) => {
    let working = JSON.parse(JSON.stringify(state));
    let mapChanged = false;

    const ensureMap = () => {
      if (working.map) return working.map;
      working.map = {
        id: "default-map",
        name: "Default Map",
        gridSizePx: 48,
        gridType: "square",
        cols: 20,
        rows: 12,
        backgroundUrl: "",
        heights: {}
      };
      return working.map;
    };

    const addDef = (def) => {
      const idx = working.tokenDefs.findIndex((d) => d.code === def.code);
      if (idx >= 0) working.tokenDefs[idx] = def;
      else working.tokenDefs.push(def);
    };

    const setHeight = (col, row, h) => {
      if (!working.map) working.map = ensureMap();
      if (!working.map.heights) working.map.heights = {};
      working.map.heights[`${col},${row}`] = h;
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
        case "height-raw": {
          const raw = instr.raw || "";
          const pairs = raw
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean);
          const entries = [];
          pairs.forEach((pair) => {
            const kvMatch = /^([A-Z]\d+)=(\-?\d+(?:\.\d+)?)$/i.exec(pair);
            if (kvMatch) {
              const coord = coordToIndex(kvMatch[1]);
              if (coord) entries.push({ ...coord, h: Number(kvMatch[2]) });
            }
          });
          entries.forEach(({ col, row, h }) => setHeight(col, row, h));
          const keys = Object.keys(working.map.heights || {});
          const preview = keys.slice(0, 5).map((k) => `${k}:${working.map.heights[k]}`);
          logClass?.(
            "BUILD",
            `app.js:182 Height map parsed: ${keys.length} entries. Sample: ${preview.join(", ")}`
          );
          break;
        }
        case "background": {
          const map = ensureMap();
          working.map = { ...map, backgroundUrl: instr.url };
          mapChanged = true;
          break;
        }
        case "map": {
          const map = ensureMap();
          const kv = instr.kv || {};
          if (kv.background || kv.bg) map.backgroundUrl = kv.background || kv.bg;
          if (kv.grid) map.gridType = kv.grid.toLowerCase();
          if (kv.size) map.gridSizePx = Number(kv.size);
          if (kv.board) {
            const boardMatch = /^(\d+)[xX](\d+)$/.exec(kv.board);
            if (boardMatch) {
              map.cols = Number(boardMatch[1]);
              map.rows = Number(boardMatch[2]);
            }
          }
          mapChanged = true;
          break;
        }
        case "grid": {
          const map = ensureMap();
          working.map = { ...map, gridType: instr.grid, gridSizePx: instr.size };
          mapChanged = true;
          break;
        }
        case "board": {
          const map = ensureMap();
          working.map = { ...map, cols: instr.cols, rows: instr.rows };
          mapChanged = true;
          break;
        }
        case "sprite-def": {
          addDef({ ...instr.def, speed: Number(instr.def.speed) || 12 });
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
              row: coord.row,
              speed: def.speed || 12
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
  state.activeMoves = state.activeMoves.filter((m) => !m.tokenId.startsWith(instr.tokenId));
  state.activeMoves.push({
    tokenId: token.id,
    from: { col: token.col, row: token.row },
    to: { col: instr.coord.col, row: instr.coord.row },
    speed: token.speed || 12,
    progress: 0
  });
  logClass?.(
    "MOVE",
    `Queued move ${token.id} from (${token.col},${token.row}) to (${instr.coord.col},${instr.coord.row}) speed=${
      token.speed || 12
    }`
  );
  if (typeof state.renderTokensWindow === "function") {
    state.renderTokensWindow();
  }
  break;
}
        case "attack": {
          const attacker = working.tokens.find((t) => t.id.startsWith(instr.attackerId));
          const target = working.tokens.find((t) => t.id.startsWith(instr.targetId));
          if (!attacker || !target) {
            log(`Attack failed: missing ${!attacker ? instr.attackerId : instr.targetId}`);
            return;
          }
          state.activeEffects.push({
            id: `fx-${Date.now()}-${Math.random()}`,
            type: instr.attackType || "physical",
            fromTokenId: attacker.id,
            toTokenId: target.id,
            speed: instr.speed || 12,
            duration: instr.duration || 600,
            age: 0
          });
          break;
        }
        case "effect": {
          state.activeEffects.push({
            id: `fx-${Date.now()}-${Math.random()}`,
            type: instr.effectType || "magic",
            fromCoord: instr.at,
            toCoord: instr.at,
            speed: instr.speed || 12,
            duration: instr.duration || 600,
            age: 0
          });
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
            working = { map: null, tokenDefs: [], tokens: [], viewMode: "3d" };
            mapChanged = true;
          }
          break;
        }
        case "reset": {
          working = { map: null, tokenDefs: [], tokens: [], viewMode: "3d" };
          mapChanged = true;
          break;
        }
        case "height": {
          instr.entries.forEach(({ col, row, h }) => setHeight(col, row, h));
          mapChanged = true;
          break;
        }
        case "height-rows": {
          const map = ensureMap();
          const rows = instr.rows || [];
          let maxCols = map.cols || 0;
          rows.forEach((rowStr, rowIdx) => {
            const vals = rowStr.split(",").map((v) => Number(v.trim()));
            vals.forEach((h, colIdx) => {
              if (Number.isFinite(h)) setHeight(colIdx, rowIdx, h);
            });
            if (vals.length > maxCols) maxCols = vals.length;
          });
          if (rows.length > (map.rows || 0)) map.rows = rows.length;
          if (maxCols > (map.cols || 0)) map.cols = maxCols;
          mapChanged = true;
          break;
        }
        case "remove-heightmap": {
          const map = ensureMap();
          map.heights = {};
          map.disableRandomHeights = true;
          state.heightMap.grid = [];
          mapChanged = true;
          break;
        }
        case "create": {
          const templateKey = instr.templateId;
          const templateKeyLower = templateKey?.toLowerCase();
          const templateKeyUpper = templateKey?.toUpperCase();
          const svgTemplate = instr.svgTemplateId || instr.templateId;
          let def = working.tokenDefs.find(
            (d) =>
              d.id?.toLowerCase?.() === templateKeyLower ||
              d.code === templateKeyUpper ||
              d.id === templateKey ||
              d.code?.toLowerCase?.() === templateKeyLower
          );
          if (!def) {
            def = ensureTemplateDef(working, templateKeyLower || templateKey, addDef);
          }
          if (!def) {
            log(`Unknown template ${templateKey}`);
            return;
          }
          const map = ensureMap();
          const baseId = instr.kv.id || def.code;
          const initials = (instr.kv.initials || baseId.slice(0, 2)).toUpperCase().slice(0, 3);
          const svgKey = svgTemplate?.toLowerCase();
          const tplKey = templateKeyLower;
          const bg = instr.kv.bg || tokenTemplates[svgKey]?.bg || tokenTemplates[tplKey]?.bg;
          const fg = instr.kv.fg || tokenTemplates[svgKey]?.fg || tokenTemplates[tplKey]?.fg;
          const svgSource = tokenTemplates[svgKey] ? svgKey : tplKey || templateKey;
          const svgUrl = buildTemplateSvg(svgSource, { bg, fg, initials });
          const type = instr.kv.type || def.category || "Object";
          const faction = (instr.kv.faction || instr.kv.side || instr.kv.team || def.faction || "").toLowerCase();
          const size = Number(instr.kv.size) || def.baseSize || 1;
          const coords =
            instr.allCoords && map
              ? Array.from({ length: map.rows }, (_, r) =>
                  Array.from({ length: map.cols }, (_, c) => ({ col: c, row: r }))
                ).flat()
              : instr.coords;
          const existingCount = working.tokens.filter((t) => t.id.startsWith(baseId)).length;
          coords.forEach((coord, idx) => {
            upsertToken({
              id: `${baseId}-${existingCount + idx + 1}`,
              defId: def.id,
              mapId: map.id,
              col: coord.col,
              row: coord.row,
              name: instr.kv.name || def.name || baseId,
              initials,
              svgUrl,
              speed: Number(instr.kv.speed) || def.speed || 12,
              type,
              faction,
              size
            });
          });
          break;
        }
        default:
        case "height-rando": {
          const map = ensureMap();
          const amp = Number(instr.kv.max || instr.kv.amp || instr.kv.scale || 2);
          let seed = Number(instr.kv.seed) || Date.now();
          const rnd = () => {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return seed / 4294967296;
          };
          map.heights = {};
          for (let r = 0; r < map.rows; r++) {
            for (let c = 0; c < map.cols; c++) {
              map.heights[`${c},${r}`] = rnd() * amp; // [0, max)
            }
          }
          logClass?.("BUILD", `HEIGHT_RANDOM seed=${seed} max=${amp}`);
          mapChanged = true;
          break;
        }
          break;
      }
    });

  if (!working.map.heights || !Object.keys(working.map.heights).length) {
    working.map.heights = {};
    for (let r = 0; r < working.map.rows; r++) {
      for (let c = 0; c < working.map.cols; c++) {
        working.map.heights[`${c},${r}`] = 0;
        }
      }
    }
  state.map = working.map;
  state.tokenDefs = working.tokenDefs;
  state.tokens = working.tokens;
  if (mapChanged) {
    state.heightMap.grid = [];
    state.cameraResetPending = true;
  }
  // Refresh tokens window if available.
  if (typeof state.renderTokensWindow === "function") {
    state.renderTokensWindow();
  }
  if (mapChanged) logClass?.("INFO", "Map updated");
  if (state.map?.backgroundUrl) {
    setBackground(state.map.backgroundUrl);
    log(`Applied ${instructions.length} instruction(s)`);
    return;
    }
    if (!state.map) {
      log(`Applied ${instructions.length} instruction(s)`);
      return;
    }
    updateBoardScene();
    render();
    log(`Applied ${instructions.length} instruction(s)`);
  };

  const runScriptText = (text) => {
    const instructions = parseScript(text, { logClass });
    if (!instructions.length) {
      log("No instructions parsed");
      return;
    }
    applyInstructions(instructions);
  };

  const runSelectedScripts = async ({ runIfNoneFallback = true } = {}) => {
    if (!scriptTreeManager) {
      if (runIfNoneFallback) runScriptText("");
      return;
    }
    const checked = scriptTreeManager.getCheckedScripts();
    if (!checked.length) {
      if (runIfNoneFallback) runScriptText("");
      return;
    }
    const priority = { map: 0, pop: 1, move: 2, script: 3 };
    const ordered = [...checked].sort((a, b) => (priority[a.type] ?? 3) - (priority[b.type] ?? 3));
    for (const item of ordered) {
      try {
        const res = await fetch(`${SCRIPTS_BASE}/${item.file}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const instructions = parseScript(text, { logClass });
        if (!instructions.length) {
          log(`No instructions in ${item.file}`);
          continue;
        }
        applyInstructions(instructions);
        logClass?.("INFO", `Ran ${item.type} script ${item.file}`);
      } catch (err) {
        log(`Failed to run ${item.file}: ${err.message}`);
      }
    }
  };

  return {
    runScriptText,
    applyInstructions,
    runSelectedScripts
  };
};
