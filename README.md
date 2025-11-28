# Tactical Battle Board (No Backend)

A single-page, in-memory battle map you drive entirely with a text command language. No build step, no backend—just open `index.html`.

## Files
- `index.html` — markup + script loader
- `app.js` — battle language parser, state, rendering
- `styles.css` — minimal styling
- `language.md` — the language spec you can feed to ChatGPT to generate commands

## Usage
1. Open `index.html` in a browser (or serve the folder with any static server).
2. Paste commands into the text area and click **Run Script**.
3. To set a background: either paste a URL/relative path (e.g., `images/wight-battle.png`) in the background field and click **Set Background**, or use the upload picker to load a local image as a data URL.
4. Switch between 2D/3D with the radio buttons. In 3D, use drag to orbit (shift+drag to pan) and mouse wheel to zoom. Heights from the `HEIGHT` command raise/lower tiles.
5. Repeat with new commands as your adventure progresses.

State lives in memory; nothing is uploaded or persisted beyond the page refresh (aside from optional localStorage notes you may add later).
