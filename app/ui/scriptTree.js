export function createScriptTreeManager({
  scriptTreeEl,
  showTestToggle,
  inputEl,
  log,
  logClass,
  safeJsonParse,
  safeStorageGet,
  safeStorageSet
}) {
  const SELECTED_ROW_KEY = "script-tree-selected-row";
  const scriptManifest = new Map();
  let selectedLeaf = null;
  let isBuildingTree = false;
  let treeAutoRunDone = false;

  const loadScriptIntoEditor = async (file) => {
    if (!file) return;
    try {
      const res = await fetch(`scripts/${file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (inputEl) inputEl.value = text.trim();
      logClass?.("INFO", `Loaded script ${file} into editor`);
    } catch (err) {
      log(`Failed to load script ${file}: ${err.message}`);
    }
  };

  const persistTreeState = () => {
    if (!scriptTreeEl) return;
    const open = Array.from(scriptTreeEl.querySelectorAll("details[data-path]"))
      .filter((d) => d.open)
      .map((d) => d.dataset.path);
    const checked = Array.from(scriptTreeEl.querySelectorAll(".script-check"))
      .filter((c) => c.checked)
      .map((c) => c.closest(".script-leaf")?.dataset?.file || c.dataset.file || "")
      .filter(Boolean);
    const payload = { open, checked };
    safeStorageSet("script-tree-state", JSON.stringify(payload));
  };

  const getCheckedScripts = () => {
    const nodes = scriptTreeEl ? Array.from(scriptTreeEl.querySelectorAll(".script-check:checked")) : [];
    return nodes
      .map((cb) => {
        const leaf = cb.closest(".script-leaf");
        if (!leaf) return null;
        return {
          file: leaf.dataset.file,
          type: leaf.dataset.type || scriptManifest.get(leaf.dataset.file) || "script"
        };
      })
      .filter((v) => v && v.file);
  };

  const buildScriptTree = async (entries, autoRunFn) => {
    if (!scriptTreeEl) return;
    isBuildingTree = true;
    scriptTreeEl.innerHTML = "";
    const savedTreeState = safeJsonParse(localStorage.getItem("script-tree-state") || "{}", {});
    const openSet = new Set(savedTreeState.open || []);
    const checkedSet = new Set(savedTreeState.checked || []);
    scriptManifest.clear();
    const includeTests = showTestToggle ? showTestToggle.checked : false;
    const dirMeta = new Map();
    entries.forEach((entry) => {
      if (entry?.dir) {
        dirMeta.set(entry.dir.split("/")[0], { testOnly: !!entry.testOnly });
      }
    });
    const root = {};
    entries.forEach((entry) => {
      if (!entry?.file) return;
      const topDir = entry.file.split("/")[0];
      const topDirMeta = dirMeta.get(topDir);
      if ((entry.testOnly || topDirMeta?.testOnly) && !includeTests) return;
      scriptManifest.set(entry.file, entry.type || "script");
      const parts = entry.file.split("/");
      let node = root;
      parts.forEach((part, idx) => {
        if (!node[part]) node[part] = { children: {}, entries: [] };
        if (idx === parts.length - 1) node[part].entries.push(entry);
        node = node[part].children;
      });
    });

    const renderNode = (name, nodeObj, path) => {
      const details = document.createElement("details");
      details.open = openSet.has(path) || openSet.size === 0;
      details.dataset.path = path;
      const summary = document.createElement("summary");
      summary.textContent = name;
      summary.addEventListener("click", async () => {
        if (details.open) return;
        const first = nodeObj.entries?.[0];
        if (!first) return;
        try {
          const res = await fetch(`scripts/${first.file}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          if (inputEl) inputEl.value = text.trim();
          logClass?.("INFO", `Loaded script ${first.file} into editor`);
        } catch (err) {
          log(`Failed to load script ${first.file}: ${err.message}`);
        }
      });
      details.appendChild(summary);
      details.addEventListener("toggle", () => {
        persistTreeState();
      });

      nodeObj.entries.forEach((entry) => {
        const leaf = document.createElement("div");
        leaf.className = "script-leaf";
        leaf.dataset.file = entry.file;
        leaf.dataset.type = entry.type || "script";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "script-check";
        checkbox.checked = checkedSet.has(entry.file);
        checkbox.addEventListener("click", (e) => {
          e.stopPropagation();
          persistTreeState();
        });
        const info = document.createElement("span");
        info.className = "info";
        info.textContent = `${entry.name || entry.file} (${(entry.type || "script").toUpperCase()})`;
        leaf.appendChild(checkbox);
        leaf.appendChild(info);
        leaf.addEventListener("click", async () => {
          if (selectedLeaf) selectedLeaf.classList.remove("selected");
          selectedLeaf = leaf;
          leaf.classList.add("selected");
          safeStorageSet(SELECTED_ROW_KEY, entry.file);
          await loadScriptIntoEditor(entry.file);
        });
        details.appendChild(leaf);
      });

      Object.keys(nodeObj.children)
        .sort()
        .forEach((childName) => {
          const childPath = `${path}/${childName}`;
          details.appendChild(renderNode(childName, nodeObj.children[childName], childPath));
        });
      return details;
    };

    Object.keys(root)
      .sort()
      .forEach((key) => {
        scriptTreeEl.appendChild(renderNode(key, root[key], key));
      });
    isBuildingTree = false;
    if (!treeAutoRunDone && typeof autoRunFn === "function") {
      treeAutoRunDone = true;
      autoRunFn();
    }

    const lastSelected = safeStorageGet(SELECTED_ROW_KEY, null);
    if (lastSelected) {
      const targetLeaf = scriptTreeEl.querySelector(`.script-leaf[data-file="${lastSelected}"]`);
      if (targetLeaf) {
        if (selectedLeaf) selectedLeaf.classList.remove("selected");
        selectedLeaf = targetLeaf;
        selectedLeaf.classList.add("selected");
        await loadScriptIntoEditor(lastSelected);
      }
    }
  };

  const loadScriptManifest = async (autoRunFn) => {
    try {
      const res = await fetch("scripts/index.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) await buildScriptTree(data, autoRunFn);
    } catch (err) {
      console.warn("Failed to load scripts/index.json", err);
    }
  };

  return {
    buildScriptTree,
    loadScriptManifest,
    getCheckedScripts,
    loadScriptIntoEditor
  };
}
