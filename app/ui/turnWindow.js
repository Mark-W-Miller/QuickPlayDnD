import { createWindowFrame } from "./windowFrame.js";

export function initTurnWindow({
  openBtn,
  closeBtn,
  windowEl,
  isDM,
  rollInitiative,
  logClass,
  scriptRunner,
  state
}) {
  if (!openBtn || !windowEl) return null;
  const header = windowEl.querySelector(".turn-window-header");
  const resizeHandle = windowEl.querySelector(".turn-window-resize");
  const roundEl = windowEl.querySelector(".turn-round");
  const activeEl = windowEl.querySelector(".turn-active");
  const infoEl = windowEl.querySelector(".turn-info");
  const listEl = windowEl.querySelector(".turn-suggestions");
  const detailsEl = windowEl.querySelector(".turn-details");
  const rollBtn = windowEl.querySelector("#turn-roll-init");
  const executeBtn = windowEl.querySelector("#turn-execute");
  const refreshPlayersBtn = document.getElementById("refresh-players-top");
  const endTurnBtn = windowEl.querySelector("#turn-end");

  createWindowFrame({
    rootEl: windowEl,
    openBtn,
    closeBtn,
    resizeHandle,
    header,
    storageKey: "turn-window-state",
    minWidth: 260,
    minHeight: 200,
    defaultLeft: Math.max(20, window.innerWidth - 360),
    defaultTop: 160,
    roleAware: true
  });

  const render = (data) => {
    const activeLabel = data?.activeName || data?.activeToken || "--";
    if (roundEl) roundEl.textContent = data?.round ? `Round ${data.round}` : "";
    if (activeEl) activeEl.textContent = activeLabel;
    if (infoEl) infoEl.textContent = data?.activeInfo || "";
    if (detailsEl) detailsEl.textContent = data?.activeDetails || "";
    if (!listEl) return;
    listEl.innerHTML = "";
    const suggs = data?.suggestions || [];
    suggs.forEach((sug, idx) => {
      const kind = (sug?.intent?.kind || "").toLowerCase();
      if (kind === "endturn") return; // dedicated End Turn button exists; avoid duplicates
      const btn = document.createElement("button");
      btn.textContent = sug.label || `Option ${idx + 1}`;
      btn.addEventListener("click", () => chooseIntent(sug));
      listEl.appendChild(btn);
    });
    // Populate textarea with a single suggestion: prefer attack, else move.
    if (infoEl) {
      const attackSug = suggs.find((s) => (s?.intent?.kind || "").toLowerCase() === "attack");
      const moveSug = suggs.find((s) => {
        const k = (s?.intent?.kind || "").toLowerCase();
        return k === "move" || k === "movetoward" || k === "movetocell";
      });
      const picked = attackSug || moveSug || null;
      infoEl.value = picked ? buildScriptPreview(picked) : "";
    }
    // Auto focus camera on the active token for DM.
    if (isDM && data?.activeToken) {
      window.dispatchEvent(new CustomEvent("focus-token", { detail: { id: data.activeToken } }));
    }
  };

  const fetchSuggestions = async () => {
    if (!isDM) return;
    try {
      const res = await fetch("/api/turn-suggestions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      render(data);
      // Highlight the active token in the 3D view (single-select via selection pipeline) with a stronger halo.
      window.dispatchEvent(
        new CustomEvent("dm-set-selection", {
          detail: { ids: data?.activeToken ? [data.activeToken] : [], highlight: "active-turn" }
        })
      );
    } catch (err) {
      logClass?.("WARN", `Turn suggestions failed: ${err.message}`);
    }
  };

  if (rollBtn) {
    if (typeof rollInitiative === "function") {
      rollBtn.addEventListener("click", () => rollInitiative());
    } else {
      rollBtn.style.display = "none";
    }
  }

  const refFromColRow = (c, r) => {
    if (!Number.isFinite(c) || !Number.isFinite(r)) return "";
    let col = c + 1;
    let letters = "";
    while (col > 0) {
      const rem = (col - 1) % 26;
      letters = String.fromCharCode(65 + rem) + letters;
      col = Math.floor((col - 1) / 26);
    }
    return `${letters}${r}`;
  };

  const parseRef = (ref = "") => {
    const m = /^([A-Z]+)(\d+)$/.exec(ref.trim());
    if (!m) return null;
    const letters = m[1].toUpperCase();
    let col = 0;
    for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
    col -= 1;
    const row = Number(m[2]);
    if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
    return { col, row };
  };

  const getTokenPos = (id) => {
    const tok = (state?.tokens || []).find((t) => t.id === id || t.id?.startsWith?.(`${id}-`));
    if (!tok) return null;
    if (Number.isFinite(tok.col) && Number.isFinite(tok.row)) return { col: tok.col, row: tok.row };
    const parsed = parseRef(tok.position || "");
    if (parsed) return parsed;
    return null;
  };

  const chooseIntent = async (sug) => {
    if (!isDM) return;
    logClass?.("INFO", `Prepared action: ${sug?.label || "(unnamed)"}`);
    if (!infoEl) return;
    const intent = sug?.intent || {};
    const kind = (intent.kind || "").toLowerCase();
    const lines = [];
    if (kind === "move" || kind === "movetocell") {
      if (intent.tokenId && intent.to) {
        const ref = parseRef(intent.to);
        if (ref) lines.push(`MOVE ${intent.tokenId} TO ${intent.to}`);
        else lines.push(`MOVE ${intent.tokenId} TO ${intent.to}`);
      }
    } else if (kind === "movetoward") {
      if (intent.tokenId && intent.targetId) {
        const a = getTokenPos(intent.tokenId);
        const t = getTokenPos(intent.targetId);
        if (a && t) {
          const step = {
            col: a.col + Math.sign(t.col - a.col),
            row: a.row + Math.sign(t.row - a.row)
          };
          lines.push(`MOVE ${intent.tokenId} TO ${refFromColRow(step.col, step.row)}`);
        } else {
          lines.push(`# Move toward ${intent.targetId}\nMOVE ${intent.tokenId} TO ???`);
        }
      }
    } else if (kind === "attack") {
      if (intent.attackerId && intent.targetId) {
        const atkType = intent.mode && intent.mode.toLowerCase().includes("magic") ? "magic" : "physical";
        lines.push(`ATTACK ${intent.attackerId} -> ${intent.targetId} TYPE ${atkType}`);
      }
    } else if (kind === "defend") {
      lines.push(`# Defend/Dodge for ${intent.tokenId || intent.id || "actor"}`);
    } else if (kind === "endturn") {
      lines.push(`# End turn`);
    }
    infoEl.value = lines.join("\n");
    // Draw preview arrow for DM only.
    const activeId = Array.from(state.activeTurnIds || [])[0] || null;
    const fromId = intent.attackerId || intent.tokenId || activeId;
    const fromPos = fromId ? getTokenPos(fromId) : null;
    let toPos = null;
    let color = null;
    if (kind === "move" || kind === "movetocell") {
      if (intent.to) {
        const parsed = parseRef(intent.to);
        if (parsed) toPos = parsed;
      }
    } else if (kind === "movetoward") {
      if (intent.targetId) {
        const targetPos = getTokenPos(intent.targetId);
        if (targetPos && fromPos) {
          toPos = {
            col: fromPos.col + Math.sign(targetPos.col - fromPos.col),
            row: fromPos.row + Math.sign(targetPos.row - fromPos.row)
          };
        }
      }
    } else if (kind === "attack") {
      if (intent.targetId) {
        toPos = getTokenPos(intent.targetId);
      }
    } else {
      // non-positional: clear
      state.activeArrow = null;
      state.renderActionArrow?.();
      return;
    }
    if (fromPos && toPos) {
      const normalizedKind =
        kind === "movetoward" || kind === "movetocell" ? "move" : kind;
      state.activeArrow = { from: fromPos, to: toPos, color, kind: normalizedKind };
      state.renderActionArrow?.();
    } else {
      state.activeArrow = null;
      state.renderActionArrow?.();
    }
  };

  const buildScriptPreview = (sug) => {
    const intent = sug?.intent || {};
    const kind = (intent.kind || "").toLowerCase();
    const lines = [];
    if (kind === "move" || kind === "movetocell") {
      if (intent.tokenId && intent.to) {
        lines.push(`# ${sug.label || "Move"}`);
        lines.push(`MOVE ${intent.tokenId} TO ${intent.to}`);
      }
    } else if (kind === "movetoward") {
      if (intent.tokenId && intent.targetId) {
        const a = getTokenPos(intent.tokenId);
        const t = getTokenPos(intent.targetId);
        const step = a && t
          ? {
              col: a.col + Math.sign(t.col - a.col),
              row: a.row + Math.sign(t.row - a.row)
            }
          : null;
        lines.push(`# ${sug.label || "Move toward"}`);
        lines.push(`MOVE ${intent.tokenId} TO ${step ? refFromColRow(step.col, step.row) : "???"}`);
      }
    } else if (kind === "attack") {
      if (intent.attackerId && intent.targetId) {
        const atkType = intent.mode && intent.mode.toLowerCase().includes("magic") ? "magic" : "physical";
        lines.push(`# ${sug.label || "Attack"}`);
        lines.push(`ATTACK ${intent.attackerId} -> ${intent.targetId} TYPE ${atkType}`);
      }
    } else if (kind === "defend") {
      lines.push(`# ${sug.label || "Defend"}`);
      lines.push(`# Defend/Dodge`);
    } else if (kind === "endturn") {
      lines.push(`# ${sug.label || "End turn"}`);
      lines.push(`# End turn`);
    }
    return lines.join("\n");
  };

  const retargetMove = (ref) => {
    if (!infoEl || !ref) return;
    const lines = (infoEl.value || "").split(/\r?\n/);
    const next = lines.map((ln) => {
      const m = /^MOVE\s+(\S+)\s+TO\s+(.+)$/i.exec(ln.trim());
      if (m) return `MOVE ${m[1]} TO ${ref}`;
      return ln;
    });
    infoEl.value = next.join("\n");
    const activeId = Array.from(state.activeTurnIds || [])[0] || null;
    const fromPos = activeId ? getTokenPos(activeId) : null;
    const toPos = parseRef(ref);
    if (fromPos && toPos) {
      state.activeArrow = { from: fromPos, to: toPos, kind: "move" };
      state.renderActionArrow?.();
    }
  };

  window.addEventListener("dm-move-target", (e) => {
    if (!isDM) return;
    const ref = e.detail?.ref;
    if (ref) retargetMove(ref);
  });

  window.addEventListener("dm-move-path", (e) => {
    if (!isDM) return;
    const path = e.detail?.path;
    if (!Array.isArray(path) || !path.length) return;
    const targetRef = path[path.length - 1];
    const lines = (infoEl?.value || "").split(/\r?\n/);
    const next = lines.map((ln) => {
      const m = /^MOVE\s+(\S+)\s+TO\s+(.+)$/i.exec(ln.trim());
      if (m) return `MOVE ${m[1]} TO ${path.join(",")}`;
      return ln;
    });
    if (infoEl) infoEl.value = next.join("\n");
    // Update preview arrow to last point.
    const activeId = Array.from(state.activeTurnIds || [])[0] || null;
    const fromPos = activeId ? getTokenPos(activeId) : null;
    const toPos = parseRef(targetRef);
    if (fromPos && toPos) {
      state.activeArrow = { from: fromPos, to: toPos, kind: "move" };
      state.renderActionArrow?.();
    }
  });

  // Fetch once on init for DM; subsequent refreshes happen after a choice is posted.
  if (isDM) fetchSuggestions();

  // Auto-roll initiative on page refresh/load for DM.
  if (isDM && typeof rollInitiative === "function") {
    let rolled = false;
    const tryRoll = () => {
      if (rolled) return;
      if ((state?.tokens?.length || 0) > 0) {
        rolled = true;
        rollInitiative();
        logClass?.("INFO", "Auto-rolled initiative after refresh");
      } else {
        setTimeout(tryRoll, 200);
      }
    };
    setTimeout(tryRoll, 300);
  }

  if (executeBtn) {
    executeBtn.addEventListener("click", () => {
      if (!isDM || !scriptRunner || !infoEl) return;
      const scriptText = infoEl.value || "";
      if (!scriptText.trim()) return;
      state.activeArrow = null;
      state.renderActionArrow?.();
      scriptRunner
        .runScriptText(scriptText)
        .catch((err) => logClass?.("WARN", `Execute failed: ${err.message}`));
    });
  }

  if (refreshPlayersBtn) {
    refreshPlayersBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/refresh-players", { method: "POST" });
        logClass?.("INFO", "Requested player refresh");
      } catch (err) {
        logClass?.("WARN", `Refresh players failed: ${err.message}`);
      }
    });
  }

  if (endTurnBtn) {
    endTurnBtn.addEventListener("click", () => {
      if (!isDM) return;
      logClass?.("INFO", "Ending turn");
      fetch("/api/choose-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: { kind: "endTurn" }, label: "End turn" })
      }).catch(() => {});
      if (infoEl) infoEl.value = "";
      state.activeArrow = null;
      state.renderActionArrow?.();
      fetchSuggestions();
    });
  }

  return { fetchSuggestions };
}
