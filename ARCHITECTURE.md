# QuickPlayDnD Architecture (current)

## Runtime shape
- Frontend (browser, `index.html` / `app/`):
  - Loads the QP UI and 3D view (Three.js).
  - Provides script entry and script tree; runs scripts to mutate board state and tokens.
  - Uses `app/app.js` to wire UI events, loading scripts, and rendering.
  - Uses `app/language/parser.js` to turn QP text into instruction objects.
  - Uses `app/language/scriptRunner.js` to apply instructions to `state` (map, tokens, moves, effects) and trigger rendering (`setBackground`, `updateBoardScene`, `render`).
  - On “Run Script”, POSTs the script text to `/api/run-script`; if the server call fails, falls back to local parsing.
  - Fetches script files from `data/scripts/…` for the script tree; fetches assets (images/models) as static files.
  - Role-aware views (honor-system): `?role=dm` or `/dm` gives full controls; `?role=player` or `/cl=Name` hides script/battle-language/params/DB/selection controls and forces view-only mode (log still available).

- Node server (`server/index.mjs`):
  - Serves static files from the repo root (HTML, JS, CSS, data, images).
  - Exposes `/api/run-script`:
    - Accepts POST with script text (JSON `{ script }` or raw text).
    - Runs the shared parser (`app/language/parser.js`) to produce instructions.
    - Returns `{ instructions }`.
    - Logs via COMMS class with terse summaries (script preview, byte size; height/roads elided).
  - Static request logging is batched and can be suppressed (`LOG_STATIC`).
  - Script body logging is gated (`LOG_SCRIPT_LINES`); script preview is always shown.
  - Dev workflow: `npm run start` (manual restart) or `npm run dev` (nodemon auto-restart).

## Data flow when running a script
1) User clicks “Run Script” or “Run Selected” in the browser.
2) Frontend collects script text:
   - Directly from the textarea (Run Script).
   - Or fetched from `data/scripts/...` for selected entries (Run Selected).
3) Frontend posts `{ script }` to `/api/run-script`.
4) Server parses QP text into `instructions` with the shared parser and returns JSON.
   - If server call fails, frontend parses locally as a fallback.
5) Frontend `applyInstructions` mutates local `state` (map, tokens, moves, effects).
6) Rendering updates via `setBackground`/`updateBoardScene`/`render`, and UI panels refresh (tokens window, etc.).

## Logs and controls
- COMMS logging: request/response summaries, with sanitized payloads (height data elided, roads refs omitted, coords condensed).
- Static logging: batched; toggle with `LOG_STATIC`.
- Script logging: preview lines; full script lines gated by `LOG_SCRIPT_LINES`.
- Terminal clears on server start for a clean log view.

## File map (key pieces)
- `index.html` — main entry, imports `app/app.js`.
- `app/app.js` — bootstraps UI, wire-up for script execution, rendering loops.
- `app/language/parser.js` — parses QP text into instruction objects.
- `app/language/scriptRunner.js` — resolves instructions (server call + fallback), applies them to state, triggers rendering.
- `app/state.js` — shared frontend state (map, tokens, effects, UI hooks).
- `server/index.mjs` — static server + `/api/run-script`; logging controls.
- `data/` — scripts, assets, metadata consumed by the frontend.
- `HowToRun.md` — quick-start instructions.
