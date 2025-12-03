const safeGet = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (key, val) => {
  try {
    localStorage.setItem(key, val);
  } catch {
    /* ignore */
  }
};

export const getSavedMapScript = () => safeGet("last-map-script");
export const getSavedPopScript = () => safeGet("last-pop-script");
export const getSavedScriptPath = () => safeGet("last-script-path");
export const getSavedInlineMap = () => safeGet("last-map-inline");

export const saveLastMapScript = (val) => {
  if (val) safeSet("last-map-script", val);
};
export const saveLastPopScript = (val) => {
  if (val) safeSet("last-pop-script", val);
};
export const saveLastScriptPath = (val) => {
  if (val) safeSet("last-script-path", val);
};
export const saveInlineMap = (text) => {
  if (typeof text === "string" && text.trim()) safeSet("last-map-inline", text);
};
