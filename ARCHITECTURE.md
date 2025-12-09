# QuickPlayDnD Architecture (current)

## Runtime shape
- Frontend (browser, `index.html` / `app/`):
  - Loads the QP UI and 3D view (Three.js).
  - Script entry + tree, tokens window, params, selection, battle language, DM controls.
  - `app/app.js` wires UI, view params, camera, sync, rendering.
  - `app/language/parser.js` parses QP text into instruction objects.
  - `app/language/scriptRunner.js` applies instructions to state (map, tokens, moves, effects, view-params, camera, selection) and renders (`setBackground`, `updateBoardScene`, `render`).
  - Role-aware views (honor-system): `?role=dm` or `/dm` shows all controls; `?role=player` or `/cl=Name` is view-only (no script/battle-language/params/DB/selection/DM controls).
  - Windows use `app/ui/windowFrame.js` for drag/resize/open + per-role persisted state.
  - DM Control window can roll initiative for all tokens; Tokens window sorts by initiative.
  - Tokens support single selection; highlights sync between list and 3D, with hover tooltip.

- Node server (`server/index.mjs`):
  - Serves static files from repo root (HTML/JS/CSS/data/assets).
  - `/api/run-script`: POST QP text, parses via shared parser, returns `{ version, instructions }`.
  - `/api/state`: POST instructions to append to versioned history; GET (optionally `?since=<version>`) streams deltas so players stay in sync.
  - Logging via COMMS (sanitized payloads: heights/roads elided, coords condensed); static request logging can be batched/suppressed. Terminal clears on start.

## Data flow
- Script execution (DM):
  1) Run Script/Run Selected posts `{ script }` to `/api/run-script`.
  2) Server parses to `instructions`, returns them with a version; DM applies locally and pushes to history (skips double-push when server already supplied them).
  3) Players poll `/api/state?since=<version>` (~250ms) and apply new instructions.
- State sync (player):
  - Applies instructions for map/tokens/camera/selection/view-params/etc. Only new versions are processed.
- View parameters:
  - Sliders/toggles (height scale, token size, arena grid, texture, height mesh, overlay grid/labels, models) broadcast from DM as `view-params`; players apply and persist. Texture loader now respects DM intent (players don’t auto-enable texture).
- Selection:
  - Single-select only (map clicks or token list). Selection broadcasts from DM to players.
- Camera:
  - Camera changes (controls/presets/slots) broadcast from DM via `camera-state`; players transition to that view.

## Logs and controls
- COMMS logging: request/response summaries with sanitization (height data removed, roads refs omitted, coords condensed).
- Static logging: batched; toggle with `LOG_STATIC`. Script body logging gated by `LOG_SCRIPT_LINES`.
- Terminal clears on server start for clean output.

## File map (key pieces)
- `index.html` — main entry, UI scaffolding, includes all windows.
- `app/app.js` — bootstraps UI, camera, sync, view params, and rendering.
- `app/language/parser.js` — QP parser.
- `app/language/scriptRunner.js` — applies instructions and triggers rendering.
- `app/graphics/*` — scene build, heightmap, overlays, tokens.
- `app/ui/*` — windows (scripts, lang, params, tokens, selection, logger, DM controls) using `windowFrame`.
- `app/state.js` — shared state.
- `server/index.mjs` — static server + `/api/run-script` + `/api/state` history.
- `data/` — scripts, assets, metadata.
- `HowToRun.md` — quick start.

## QP Language specification

### Commands
- `MAP background=<url> grid=<square|hex> size=<px> board=<cols>x<rows>` — set background/grid/board size.
- `SPRITE DEF <CODE> name="Name" url="https://..." size=<n> tint=#RRGGBB category=<PC|NPC|Monster|Object> speed=<ft>` — define/update a sprite type; speed defaults to 12.
- `PLACE <CODE> @ A1,B2,...` — place sprite instances of the given code; auto-ids `<CODE>-N`.
- `CREATE template=<TemplateId[,SvgTemplateId]> id=<TokenId> initials=<XX> name=<Label> faction=<pc|ally|npc|enemy|team> bg=#RRGGBB fg=#RRGGBB speed=<ft> type=<structure|creature|object> size=<cells> level=<n> hp=<current> hpMax=<max> info="<text>" @ A1,B2,...`
  - First template drives 3D; optional second drives SVG cap.
  - `id` expands per placement; initials default from id (PCs use first 6 letters of name; others from id).
  - `faction` tints the cylinder (pc/ally=green, enemy/npc=red, obj=blue).
  - `bg`/`fg` override template colors; `speed` defaults to 12; `size` is footprint width in cells.
  - If `info` omitted but level/hp/hpMax given, side band shows e.g. `Lvl 5 HP 12/18`.
  - Tokens start with `hp` (or `hpMax` if `hp` omitted); `hpMax` sets max HP.
- `MOVE <tokenId> TO C3` — animate first token matching id prefix.
- `STATE id=<tokenId> remainingHP=<n>` — update a token’s current HP.
- `INITIATIVE <n> <id1,id2,...>` or `INITIATIVE id=<n> order=id1,id2` — assign initiative.
- `ATTACK <attackerId> -> <targetId> TYPE physical|magic [SPEED <n>] [DUR <ms>]` — transient effect from attacker to target.
- `EFFECT <magic|physical> AT A1 [SPEED <n>] [DUR <ms>]` — transient ground effect.
- `REMOVE <tokenId>` — remove first token whose id starts with tokenId.
- `REMOVE HEIGHTMAP` — clear all height values and flatten terrain.
- `HEIGHT_RANDOM max=<n>` — procedural heightmap (range ~[-n, n], default 2).
- `ROADS <A0,B1,...>` — reserved/ignored by engine (authoring metadata).
- `CLEAR TOKENS` — remove all tokens.
- `CLEAR ALL` — clear map, sprites, and tokens.
- `RESET` — clear everything (map, sprites, tokens, backgrounds).
- `HEIGHT_START ... HEIGHT_END` — block format for heights; each line is a comma-separated row of numbers between the markers.

### Coordinates
`<ColumnLetter><RowNumber>` (A1, H7). Columns A-Z, rows start at 1.

### Making a terrain PNG that fits the grid/hex exactly
- Choose board and grid size first (`BOARD <cols>x<rows>`, `GRID square|hex SIZE <px>`).
- Square PNG: `width = cols * size`, `height = rows * size`.
- Hex (pointy-top, odd-row offset) PNG:
  - `width = sqrt(3) * (cols + 0.5) * size`
  - `height = (1.5 * rows + 0.5) * size`
- Grid ref formulas for hex centers:
  - `x = hexW * (col + 0.5 * (row mod 2)) + hexW/2`, `hexW = sqrt(3) * size`
  - `y = row * (1.5 * size) + size` (hex height = `2*size`)

### Token Templates (picker)
- `token-small` (1 cell, blue), `token-medium` (1 cell, orange), `token-large` (2x2, green).

### Example
```
# Scene setup
BACKGROUND https://images.unsplash.com/photo-1501785888041-af3ef285b470
GRID hex SIZE 56
BOARD 16x12

# Sprites
SPRITE DEF VC name="Vin Chi" url="https://upload.wikimedia.org/wikipedia/commons/3/3f/Chess_qdt45.svg" size=1 tint=#8b5cf6
SPRITE DEF DR name="Drake"   url="https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_qlt45.svg" size=2 tint=#ef4444

# Placement
PLACE VC @ B4,C4
PLACE DR @ H7

# Movement and effects
MOVE VC TO D6
MOVE DR TO I8
ATTACK VC -> DR TYPE physical SPEED 18 DUR 800
EFFECT magic AT H7 DUR 1200
```

### 3D Model Catalog (in `data/models`)
- `Castle.glb`, `Cleric.glb`, `Cleric_Staff.glb`, `Monk.glb`, `Ranger.glb`, `Ranger_Arrow.glb`, `Ranger_Bow.glb`, `Rogue.glb`, `Rogue_Dagger.glb`, `Warrior.glb`, `Warrior_Sword.glb`, `WizardX.glb`, `Wizard_Staff.glb`.
