export const coordToIndex = (coord) => {
  const match = /^([A-Z])(\d+)$/i.exec(coord.trim());
  if (!match) return null;
  const [, colChar, rowStr] = match;
  return { col: colChar.toUpperCase().charCodeAt(0) - 65, row: Number(rowStr) - 1 };
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

  const flushHeight = () => {
    if (!pendingHeight.trim()) return;
    instructions.push({ type: "height-raw", raw: pendingHeight });
    pendingHeight = "";
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    logClass?.("PARSE", `Line: "${raw}"`);

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
    if ((match = /^CREATE\s+(\w[\w-]+)\s+(.+?)\s+@\s+([A-Z0-9,\s]+)$/i.exec(line))) {
      const templateId = match[1];
      const kv = parseKeyValues(match[2]);
      logClass?.("PARSE", `Create ${templateId}: ${JSON.stringify(kv)}`);
      const coords = match[3]
        .split(",")
        .map((c) => coordToIndex(c))
        .filter(Boolean);
      if (coords.length) {
        instructions.push({
          type: "create",
          templateId,
          kv,
          coords
        });
      }
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
    if ((match = /^MOVE\s+(\w+)\s+TO\s+([A-Z]\d+)$/i.exec(line))) {
      const coord = coordToIndex(match[2]);
      if (coord) instructions.push({ type: "move", tokenId: match[1], coord });
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
  return instructions;
};
