// Token template definitions and helpers
export const tokenTemplates = {
  "token-small": {
    id: "token-small",
    name: "Basic (Small)",
    baseSize: 1,
    colorTint: "#3b82f6",
    bg: "#0b1220",
    fg: "#3b82f6",
    template: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="52" fill="$BG" stroke="$FG" stroke-width="8"/>
      <rect x="10" y="50" width="100" height="28" rx="6" fill="rgba(0,0,0,0.55)" />
      <text x="60" y="70" text-anchor="middle" font-size="34" font-family="monospace" font-weight="bold" fill="#ffffff" stroke="#000000" stroke-width="2" paint-order="stroke">$INIT</text>
    </svg>`
  },
  "token-medium": {
    id: "token-medium",
    name: "Basic (Medium)",
    baseSize: 1,
    colorTint: "#f97316",
    bg: "#0b1220",
    fg: "#f97316",
    template: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="52" fill="$BG" stroke="$FG" stroke-width="8"/>
      <rect x="10" y="50" width="100" height="28" rx="6" fill="rgba(0,0,0,0.55)" />
      <text x="60" y="70" text-anchor="middle" font-size="34" font-family="monospace" font-weight="bold" fill="#ffffff" stroke="#000000" stroke-width="2" paint-order="stroke">$INIT</text>
    </svg>`
  },
  "token-large": {
    id: "token-large",
    name: "Basic (Large)",
    baseSize: 2,
    colorTint: "#22c55e",
    bg: "#0b1220",
    fg: "#22c55e",
    template: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="70" fill="$BG" stroke="$FG" stroke-width="10"/>
      <rect x="18" y="68" width="124" height="32" rx="8" fill="rgba(0,0,0,0.55)" />
      <text x="80" y="96" text-anchor="middle" font-size="40" font-family="monospace" font-weight="bold" fill="#ffffff" stroke="#000000" stroke-width="3" paint-order="stroke">$INIT</text>
    </svg>`
  }
};

export const buildTemplateSvg = (templateId, { bg, fg, initials }) => {
  const tpl = tokenTemplates[templateId];
  if (!tpl || !tpl.template) return null;
  const svg = tpl.template
    .replace(/\$BG/g, bg || tpl.bg || "#0b1220")
    .replace(/\$FG/g, fg || tpl.fg || "#ffffff")
    .replace(/\$INIT/g, (initials || "??").slice(0, 6));
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// Ensure a template definition exists in working tokenDefs; add if missing.
export const ensureTemplateDef = (working, templateId, addDefFn) => {
  const tpl = tokenTemplates[templateId];
  if (!tpl) return null;
  const existing = working.tokenDefs.find((d) => d.code === tpl.id);
  if (existing) return existing;
  const def = {
    id: tpl.id,
    code: tpl.id.toUpperCase(),
    name: tpl.name,
    category: "Object",
    svgUrl: buildTemplateSvg(templateId, { initials: tpl.name?.slice(0, 2) || "??" }),
    baseSize: tpl.baseSize,
    colorTint: tpl.colorTint
  };
  addDefFn(def);
  return def;
};
