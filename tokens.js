// Token template definitions and helpers
export const tokenTemplates = {
  "scout-small": {
    id: "scout-small",
    name: "Scout (Small)",
    baseSize: 1,
    colorTint: "#3b82f6",
    bg: "#0b1220",
    fg: "#3b82f6",
    template: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="56" fill="$BG" stroke="$FG" stroke-width="8"/>
      <circle cx="60" cy="60" r="40" fill="#152540" stroke="$FG" stroke-width="6"/>
      <path d="M60 30 L78 60 L60 90 L42 60 Z" fill="$FG" opacity="0.9"/>
      <circle cx="60" cy="60" r="6" fill="$BG"/>
      <text x="60" y="62" text-anchor="middle" font-size="32" font-family="monospace" font-weight="bold" fill="$FG">$INIT</text>
    </svg>`
  },
  "warrior-medium": {
    id: "warrior-medium",
    name: "Warrior (Medium)",
    baseSize: 1,
    colorTint: "#f97316",
    bg: "#0b1220",
    fg: "#f97316",
    template: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="56" fill="$BG" stroke="$FG" stroke-width="8"/>
      <circle cx="60" cy="60" r="42" fill="#28160d" stroke="$FG" stroke-width="5"/>
      <path d="M60 24 L84 48 L72 48 L72 88 L48 88 L48 48 L36 48 Z" fill="$FG" opacity="0.9"/>
      <circle cx="60" cy="48" r="6" fill="$BG"/>
      <text x="60" y="70" text-anchor="middle" font-size="30" font-family="monospace" font-weight="bold" fill="$BG">$INIT</text>
    </svg>`
  },
  "guardian-large": {
    id: "guardian-large",
    name: "Guardian (Large)",
    baseSize: 2,
    colorTint: "#22c55e",
    bg: "#0b1220",
    fg: "#22c55e",
    template: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="74" fill="$BG" stroke="$FG" stroke-width="10"/>
      <circle cx="80" cy="80" r="60" fill="#0f1f16" stroke="$FG" stroke-width="6"/>
      <rect x="54" y="40" width="52" height="80" rx="14" fill="$FG" opacity="0.9"/>
      <rect x="72" y="54" width="16" height="52" fill="$BG"/>
      <circle cx="80" cy="60" r="8" fill="$BG"/>
      <text x="80" y="88" text-anchor="middle" font-size="34" font-family="monospace" font-weight="bold" fill="$BG">$INIT</text>
    </svg>`
  }
};

export const buildTemplateSvg = (templateId, { bg, fg, initials }) => {
  const tpl = tokenTemplates[templateId];
  if (!tpl || !tpl.template) return null;
  const svg = tpl.template
    .replace(/\$BG/g, bg || tpl.bg || "#0b1220")
    .replace(/\$FG/g, fg || tpl.fg || "#ffffff")
    .replace(/\$INIT/g, (initials || "??").slice(0, 3));
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
