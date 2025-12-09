import { createWindowFrame } from "./windowFrame.js";

export function initTurnWindow({ openBtn, closeBtn, windowEl, isDM, rollInitiative, logClass }) {
  if (!openBtn || !windowEl) return null;
  const header = windowEl.querySelector(".turn-window-header");
  const resizeHandle = windowEl.querySelector(".turn-window-resize");
  const roundEl = windowEl.querySelector(".turn-round");
  const activeEl = windowEl.querySelector(".turn-active");
  const infoEl = windowEl.querySelector(".turn-info");
  const listEl = windowEl.querySelector(".turn-suggestions");
  const detailsEl = windowEl.querySelector(".turn-details");
  const rollBtn = windowEl.querySelector("#turn-roll-init");

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
    (data?.suggestions || []).forEach((sug, idx) => {
      const btn = document.createElement("button");
      btn.textContent = sug.label || `Option ${idx + 1}`;
      btn.addEventListener("click", () => chooseIntent(sug));
      listEl.appendChild(btn);
    });
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

  const chooseIntent = async (sug) => {
    if (!isDM) return;
    try {
      logClass?.("INFO", `Chose action: ${sug?.label || "(unnamed)"}`);
      await fetch("/api/choose-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: sug?.intent || null, label: sug?.label })
      });
      fetchSuggestions();
    } catch (err) {
      logClass?.("WARN", `Choose intent failed: ${err.message}`);
    }
  };

  // Fetch once on init for DM; subsequent refreshes happen after a choice is posted.
  if (isDM) fetchSuggestions();

  return { fetchSuggestions };
}
