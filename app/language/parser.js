export const coordToIndex = (coord) => {
  const match = /^([A-Z])(\d+)$/i.exec(coord.trim());
  if (!match) return null;
  const [, colChar, rowStr] = match;
  return { col: colChar.toUpperCase().charCodeAt(0) - 65, row: Number(rowStr) };
};

export const parseKeyValues = (input) => {
  const regex = /(\w+)=("[^"]*"|'[^']*'|[^\s]+)/g;
  const out = {};
  let m;
  while ((m = regex.exec(input)) !== null) {
    const [, key, rawVal] = m;
    out[key.toLowerCase()] = rawVal.replace(/^['"]|['"]$/g, "");
  }
  return out;
};

export const parseScript = (script, { logClass } = {}) => {
  const lines = script.split(/\r?\n/);
  const instructions = [];
  let pendingHeight = "";
  let inHeightBlock = false;
  let heightRows = [];
  let pendingLine = "";

  const flushHeight = () => {
    if (!pendingHeight.trim()) return;
    instructions.push({ type: "height-raw", raw: pendingHeight });
    pendingHeight = "";
  };

  for (const raw of lines) {
    let working = pendingLine + raw;
    // Handle line continuations with trailing backslash.
    if (/\\\s*$/.test(working)) {
      pendingLine = working.replace(/\\\s*$/, "");
      continue;
    }
    pendingLine = "";

    const line = working.trim();
    if (!line || line.startsWith("#")) continue;
    logClass?.("PARSE", `Line: "${raw}"`);

    let match;
    if (/^HEIGHT_START$/i.test(line)) {
      inHeightBlock = true;
      heightRows = [];
      continue;
    }
    if (inHeightBlock) {
      // Accept either HEIGHT_END or END_HEIGHT terminators.
      if (/^(HEIGHT_END|END_HEIGHT)\.?$/i.test(line)) {
        instructions.push({ type: "height-rows", rows: heightRows.slice() });
        inHeightBlock = false;
        heightRows = [];
      } else if (/^ROADS\\s+/i.test(line)) {
        // Ignore ROADS lines inside HEIGHT block so they don't corrupt height rows.
        continue;
      } else if (line) {
        heightRows.push(line);
      }
      continue;
    }
    if ((match = /^BACKGROUND\s+(.+)$/i.exec(line))) {
      instructions.push({ type: "background", url: match[1].trim() });
      continue;
    }
    if ((match = /^MAP\s+(.+)$/i.exec(line))) {
      const kv = parseKeyValues(match[1]);
      instructions.push({
        type: "map",
        kv
      });
      continue;
    }
    if ((match = /^INITIATIVE\s+(.+)$/i.exec(line))) {
      const body = match[1];
      const kv = parseKeyValues(body);
      const looksLikePairs = body.includes("=");
      if (looksLikePairs && !kv.id) {
        const pairs = body
          .split(",")
          .map((p) => p.trim())
          .map((p) => {
            const m = /^([^=]+)=(\d+)/.exec(p);
            if (!m) return null;
            return { id: m[1].trim(), value: Number(m[2]) };
          })
          .filter(Boolean);
        if (pairs.length) {
          instructions.push({ type: "initiative-set", pairs });
          continue;
        }
      }
      let value = null;
      let listPart = null;
      const parts = body.split(/\s+/);
      if (!kv.id && parts.length >= 2 && /^\d+$/.test(parts[0])) {
        value = Number(parts[0]);
        listPart = parts.slice(1).join(" ");
      } else {
        value = kv.id ? Number(kv.id) : null;
        listPart = kv.order || kv.list || body;
      }
      const ids = (listPart || "")
        .split(/[, ]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (value != null && ids.length) instructions.push({ type: "initiative", value, ids });
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
      logClass?.("PARSE", `Sprite DEF ${code}: ${JSON.stringify(kv)}`);
      instructions.push({
        type: "sprite-def",
        def: {
        id: code,
        code,
        name: kv.name || code,
        category: kv.category || "Object",
        svgUrl: kv.url || kv.svg || "",
        modelUrl: kv.model || kv.modelurl || "",
        baseSize: kv.size ? Number(kv.size) : 1,
        colorTint: kv.tint,
        faction: (kv.faction || kv.side || kv.team || "").toLowerCase()
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
    if ((match = /^CREATE\s+(.+?)\s+@\s+([A-Z0-9,\s]+)$/i.exec(line))) {
      const kv = parseKeyValues(match[1]);
      const templateField = kv.template || kv.tpl || kv.model || null;
      const templateParts = (templateField || "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const templateId = templateParts[0] || null;
      const svgTemplateId = kv.svg || templateParts[1] || templateId;
      if (!templateId) {
        logClass?.("PARSE", `Create missing template: ${line}`);
        continue;
      }
      logClass?.(
        "PARSE",
        `Create template=${templateId}${svgTemplateId ? ` svg=${svgTemplateId}` : ""}: ${JSON.stringify(kv)}`
      );
      const coordSpec = match[2].trim().toUpperCase();
      let coords = [];
      let allCoords = false;
      if (coordSpec === "ALL") {
        allCoords = true;
      } else {
        coords = coordSpec
          .split(",")
          .map((c) => coordToIndex(c))
          .filter(Boolean);
      }
      if (coords.length) {
        instructions.push({
          type: "create",
          templateId,
          svgTemplateId,
          kv,
          coords,
          allCoords
        });
      } else if (allCoords) {
        instructions.push({
          type: "create",
          templateId,
          svgTemplateId,
          kv,
          coords: [],
          allCoords: true
        });
      }
      continue;
    }
    if ((match = /^HEIGHT_RANDOM\s*(.*)$/i.exec(line))) {
      const kv = parseKeyValues(match[1]);
      instructions.push({ type: "height-rando", kv });
      continue;
    }
    if (line.toUpperCase().startsWith("ROADS ")) {
      // Roads are emitted for authoring; skip for now but keep parsed payload for future use.
      const refs = line
        .slice(6)
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      instructions.push({ type: "roads", refs });
      continue;
    }
    if ((match = /^HEIGHT\s*(.*)$/i.exec(line))) {
      // Finish any prior HEIGHT block before starting a new one.
      flushHeight();
      pendingHeight = match[1].trim();
      continue;
    }
    // Continuation lines for HEIGHT data (lines that look like coord=val pairs).
    if (/^[A-Z]\d+=/i.test(line) && pendingHeight !== "") {
      pendingHeight = `${pendingHeight},${line}`;
      continue;
    }
    // On any other instruction, flush accumulated HEIGHT data first.
    flushHeight();
    // Debug log for every instruction line we recognized so far.
    if ((match = /^STATE\s+(.+)$/i.exec(line))) {
      const kv = parseKeyValues(match[1]);
      const id = kv.id || kv.token || kv.name;
      if (id && kv.remaininghp !== undefined) {
        instructions.push({
          type: "state",
          id,
          remainingHp: Number(kv.remaininghp)
        });
      }
      continue;
    }
    if ((match = /^MOVE\s+([A-Z0-9_-]+)\s+TO\s+([A-Z0-9,\s]+)$/i.exec(line))) {
      const parts = match[2]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const coords = parts.map((p) => coordToIndex(p)).filter(Boolean);
      if (coords.length > 1) {
        instructions.push({ type: "move", tokenId: match[1], coordPath: coords });
      } else if (coords.length === 1) {
        instructions.push({ type: "move", tokenId: match[1], coord: coords[0] });
      }
      continue;
    }
    if ((match = /^ATTACK\s+(\w+)\s*->\s*(\w+)\s+TYPE\s+(physical|magic)(?:\s+SPEED\s+(\d+(?:\.\d+)?))?(?:\s+DUR\s+(\d+))?/i.exec(line))) {
      instructions.push({
        type: "attack",
        attackerId: match[1],
        targetId: match[2],
        attackType: match[3].toLowerCase(),
        speed: match[4] ? Number(match[4]) : 12,
        duration: match[5] ? Number(match[5]) : 600
      });
      continue;
    }
    if ((match = /^EFFECT\s+(\w+)\s+AT\s+([A-Z]\d+)(?:\s+DUR\s+(\d+))?(?:\s+SPEED\s+(\d+(?:\.\d+)?))?/i.exec(line))) {
      const at = coordToIndex(match[2]);
      if (at) {
        instructions.push({
          type: "effect",
          effectType: match[1].toLowerCase(),
          at,
          duration: match[3] ? Number(match[3]) : 600,
          speed: match[4] ? Number(match[4]) : 12
        });
      }
      continue;
    }
    if ((match = /^REMOVE\s+(\w+)$/i.exec(line))) {
      instructions.push({ type: "remove", tokenId: match[1] });
      continue;
    }
    if (/^REMOVE\s+HEIGHTMAP$/i.test(line)) {
      instructions.push({ type: "remove-heightmap" });
      continue;
    }
    if ((match = /^CLEAR\s+(TOKENS|ALL)$/i.exec(line))) {
      instructions.push({ type: "clear", scope: match[1].toLowerCase() });
      continue;
    }
    if (/^RESET$/i.test(line)) {
      instructions.push({ type: "reset" });
      continue;
    }
  }
  flushHeight();
  // If file ended while in HEIGHT_START block, flush what we have.
  if (inHeightBlock && heightRows.length) {
    instructions.push({ type: "height-rows", rows: heightRows.slice() });
  }
  return instructions;
};
