# How to run

Local setup now runs through a minimal Node server (serves static assets + `/api/run-script`).

## Prereqs
- Node.js 18+.
- npm (for optional `canvas` dependency and running the server script).

## Run the web app
1) From the repo root run: `npm start` (or `node server/index.mjs`).
2) Open `http://localhost:3000` in your browser (or `PORT=<n> npm start` to change the port).
3) Scripts now POST to `/api/run-script`; the server returns parsed instructions which the frontend applies. The script tree still loads from `data/scripts/index.json`; use the checkboxes to pick scripts, then click `Run Selected` or `Run Editor Script` in the **Scripts** window. The **Test Dirs** toggle reveals entries marked `testOnly`.

## Regenerate the default map PNGs (optional)
1) Install the canvas dependency: `npm install`.
2) Run `node tools/generate-maps.js`.
3) Outputs land in `images/` (see `README.md` for details on the generated files).
