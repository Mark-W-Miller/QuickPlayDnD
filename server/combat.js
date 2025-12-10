// Lightweight combat/turn scaffolding with a basic suggestion engine.

const combatState = {
  tokens: [], // { id, name, faction, hp, hpMax, position, speed, conditions: [], attacks: [] }
  round: 1,
  initiativeOrder: [], // array of token ids
  activeIndex: 0
};

const setInitiativeOrder = (order = []) => {
  combatState.initiativeOrder = Array.isArray(order) ? order.slice() : [];
  combatState.activeIndex = 0;
  if (combatState.round < 1) combatState.round = 1;
};

const setTokens = (tokens = []) => {
  combatState.tokens = Array.isArray(tokens) ? tokens.map((t) => ({ ...t })) : [];
};

const getActiveTokenId = () => {
  if (!combatState.initiativeOrder.length) return null;
  const idx = Math.max(0, Math.min(combatState.initiativeOrder.length - 1, combatState.activeIndex));
  return combatState.initiativeOrder[idx] || null;
};

const advanceTurn = () => {
  if (!combatState.initiativeOrder.length) return null;
  combatState.activeIndex += 1;
  if (combatState.activeIndex >= combatState.initiativeOrder.length) {
    combatState.activeIndex = 0;
    combatState.round += 1;
  }
  return getActiveTokenId();
};

const coordToIndex = (ref = "") => {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref.trim());
  if (!m) return null;
  const letters = m[1].toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
  col -= 1;
  const row = Number(m[2]);
  return { col, row };
};

const refFromCoord = ({ col, row }) => indexToRef(col, row);

const distCells = (a, b) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
};

const parseAttacks = (raw) => {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, mode, toHit, damage, reachRange, tags] = part.split("|").map((p) => p?.trim() || "");
      return { name, mode, toHit, damage, reachRange, tags };
    });
};

const ensureTokenAttacks = (token) => {
  if (Array.isArray(token.attacks)) return token.attacks;
  if (typeof token.attacks === "string") {
    token.attacks = parseAttacks(token.attacks);
    return token.attacks;
  }
  token.attacks = [];
  return token.attacks;
};

const pickBestAttack = (token, target) => {
  const attacks = ensureTokenAttacks(token);
  if (!attacks.length) return null;
  const aPos = coordToIndex(token.position || "");
  const tPos = coordToIndex(target?.position || "");
  const distance = distCells(aPos, tPos);
  // Prefer melee if adjacent (<=1), else ranged.
  const melee = attacks.find((a) => (a.mode || "").toLowerCase().includes("melee"));
  const ranged = attacks.find((a) => (a.mode || "").toLowerCase().includes("ranged"));
  if (distance <= 1 && melee) return melee;
  return ranged || melee || attacks[0];
};

const getSuggestions = () => {
  const activeId = getActiveTokenId();
  const active = combatState.tokens.find((t) => t.id === activeId);
  const faction = (active?.faction || "").toLowerCase();
  const enemies = combatState.tokens.filter((t) => {
    const f = (t.faction || "").toLowerCase();
    if (!faction) return false;
    if (["pc", "ally"].includes(faction)) return f === "enemy" || f === "npc" || f === "hostile";
    if (faction === "enemy" || faction === "npc" || faction === "hostile") return f === "pc" || f === "ally";
    return f && f !== faction;
  });
  const aPos = coordToIndex(active?.position || "");
  const closest = enemies
    .map((t) => ({ t, d: distCells(aPos, coordToIndex(t.position || "")) }))
    .sort((a, b) => a.d - b.d)[0]?.t;
  const sug = [];
  const attacks = ensureTokenAttacks(active || {});
  const attacksSummary = attacks.map((a) => a.name || a.mode || a.damage).filter(Boolean).join("; ");
  const infoText = active?.info || "";
  const detailText = active
    ? `HP ${active.hp ?? "?"}/${active.hpMax ?? "?"} | ${active.position || "--"} | ${active.faction || ""}${
        attacksSummary ? ` | Attacks: ${attacksSummary}` : ""
      }`
    : "";
  if (closest && active) {
    const atk = pickBestAttack(active, closest);
    if (atk) {
      sug.push({
        id: `attack-${closest.id}`,
        label: `Attack ${closest.name || closest.id} (${atk.name || atk.mode || "attack"})`,
        intent: { kind: "attack", attackerId: active.id, targetId: closest.id, mode: atk.mode, attack: atk }
      });
    }
    sug.push({
      id: `move-${closest.id}`,
      label: `Move toward ${closest.name || closest.id}`,
      intent: { kind: "moveToward", tokenId: active.id, targetId: closest.id }
    });
  }
  sug.push({ id: "defend", label: "Defend / Dodge", intent: { kind: "defend", tokenId: active?.id } });
  sug.push({ id: "end", label: "End turn", intent: { kind: "endTurn" } });

  return {
    round: combatState.round,
    activeToken: active?.id || null,
    activeName: active?.name || active?.id || null,
    activeInfo: infoText,
    activeDetails: detailText,
    suggestions: sug
  };
};

const applyInstructions = (instructions = []) => {
  instructions.forEach((instr) => {
    switch ((instr.type || "").toLowerCase()) {
      case "create": {
        const baseId = instr.kv?.id || instr.templateId || instr.code || `T${combatState.tokens.length + 1}`;
        const name = instr.kv?.name || baseId;
        const faction = (instr.kv?.faction || instr.kv?.side || instr.kv?.team || "").toLowerCase();
        const hp = Number(instr.kv?.hp ?? instr.kv?.hitpoints);
        const hpMax = Number(instr.kv?.hpMax ?? instr.kv?.maxhp ?? hp);
        const coords = instr.coords || [];
        const attacks = instr.kv?.attacks;
        coords.forEach((coord, idx) => {
          const suffix = idx === 0 ? "" : `-${idx + 1}`;
          const id = `${baseId}${suffix}`;
          const pos = indexToRef(coord.col, coord.row);
          const existing = combatState.tokens.find((t) => t.id === id);
          const token = existing || {};
          Object.assign(token, {
            id,
            name,
            faction,
            hp: Number.isFinite(hp) ? hp : token.hp,
            hpMax: Number.isFinite(hpMax) ? hpMax : token.hpMax,
            position: pos || token.position,
            speed: Number(instr.kv?.speed) || token.speed || 12,
            conditions: token.conditions || [],
            attacks: attacks || token.attacks
          });
          if (!existing) combatState.tokens.push(token);
        });
        break;
      }
      case "move": {
        const id = instr.tokenId;
        const pos = indexToRef(instr.coord?.col, instr.coord?.row);
        if (!id || !pos) break;
        const t = combatState.tokens.find((x) => x.id === id || x.id.startsWith(`${id}-`));
        if (t) t.position = pos;
        break;
      }
      case "state": {
        const id = instr.id;
        const t = combatState.tokens.find((x) => x.id === id || x.id.startsWith(`${id}-`));
        if (t && Number.isFinite(instr.remainingHp)) t.hp = instr.remainingHp;
        if (t && Number.isFinite(instr.hp)) t.hp = instr.hp;
        break;
      }
      case "initiative": {
        const ids = instr.ids || [];
        const val = instr.value;
        if (Array.isArray(ids) && ids.length) {
          combatState.initiativeOrder = [...ids];
          combatState.activeIndex = 0;
          if (combatState.round < 1) combatState.round = 1;
        } else if (Number.isFinite(val)) {
          // If order not provided, sort by value desc across tokens with initiative field.
          combatState.initiativeOrder = [...combatState.tokens]
            .sort((a, b) => (b.initiative || 0) - (a.initiative || 0))
            .map((t) => t.id);
        }
        break;
      }
      case "initiative-set": {
        const pairs = instr.pairs || [];
        if (pairs.length) {
          combatState.initiativeOrder = pairs
            .slice()
            .sort((a, b) => (b.value || 0) - (a.value || 0))
            .map((p) => p.id);
          combatState.activeIndex = 0;
          if (combatState.round < 1) combatState.round = 1;
        }
        break;
      }
      default:
        break;
    }
  });
  if (!combatState.initiativeOrder.length && combatState.tokens.length) {
    combatState.initiativeOrder = combatState.tokens.map((t) => t.id);
    combatState.activeIndex = 0;
    if (combatState.round < 1) combatState.round = 1;
  }
};

export const combat = {
  state: combatState,
  setInitiativeOrder,
  setTokens,
  getActiveTokenId,
  advanceTurn,
  getSuggestions,
  applyInstructions
};

// Translate a chosen intent into QP instructions and update positions/HP in combat state.
export const translateIntentToInstructions = (intent) => {
  const instructions = [];
  if (!intent || typeof intent !== "object") return instructions;
  const kind = (intent.kind || "").toLowerCase();

  const tokenById = (id) => combatState.tokens.find((t) => t.id === id || t.id?.startsWith?.(`${id}-`));

  if (kind === "movetocell") {
    const tokenId = intent.tokenId || intent.id || intent.attackerId;
    const coord = coordToIndex(intent.to || intent.cell || intent.ref || "");
    if (tokenId && coord) {
      instructions.push({ type: "move", tokenId, coord });
      const t = tokenById(tokenId);
      if (t) t.position = refFromCoord(coord) || t.position;
    }
  }

  if (kind === "movetoward") {
    const tokenId = intent.tokenId || intent.id || intent.attackerId;
    const target = tokenById(intent.targetId);
    const actor = tokenById(tokenId);
    const aPos = coordToIndex(actor?.position || "");
    const tPos = coordToIndex(target?.position || "");
    if (tokenId && aPos && tPos) {
      const step = {
        col: aPos.col + Math.sign(tPos.col - aPos.col),
        row: aPos.row + Math.sign(tPos.row - aPos.row)
      };
      instructions.push({ type: "move", tokenId, coord: step });
      if (actor) actor.position = refFromCoord(step) || actor.position;
    }
  }

  if (kind === "attack") {
    const attackerId = intent.attackerId;
    const targetId = intent.targetId;
    const mode = (intent.mode || "").toLowerCase();
    const attackType = mode.includes("magic") || mode.includes("spell") ? "magic" : "physical";
    if (attackerId && targetId) {
      instructions.push({ type: "attack", attackerId, targetId, attackType });
    }
  }

  // defend/endTurn: no instructions needed.
  return instructions;
};
const indexToRef = (col, row) => {
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
  let c = col;
  let letters = "";
  c += 1;
  while (c > 0) {
    const rem = (c - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    c = Math.floor((c - 1) / 26);
  }
  return `${letters}${row}`;
};
