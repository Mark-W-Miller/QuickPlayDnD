# How to run

Local setup is static — no bundler or dev server is required — but you do need to serve the files so the browser can fetch modules and the `data/` assets.

## Prereqs
- Node.js 18+ (only needed if you want to regenerate map assets).
- npm (for optional `canvas` dependency).

## Run the web app
1) From the repo root, start any static server (pick one):
   - `python3 -m http.server 8000`
   - `npx http-server .`
2) Open `http://localhost:8000` in your browser.
3) The script tree loads from `data/scripts/index.json`; use the checkboxes to pick scripts, then click `Run Selected` or `Run Editor Script` in the **Scripts** window. The **Test Dirs** toggle reveals entries marked `testOnly`.

## Regenerate the default map PNGs (optional)
1) Install the canvas dependency: `npm install`.
2) Run `node tools/generate-maps.js`.
3) Outputs land in `images/` (see `README.md` for details on the generated files).
