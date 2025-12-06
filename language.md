# Tactical Battle Board Language

Plain text commands, one per line. Lines starting with `#` are comments. QuickPlay scripts use the `.qp` extension (e.g., `razorback-pass/map-razorback-pass.qp`), and when referenced inside MAP you can use the relative path (no full URL required).

## Commands
- `MAP background=<url> grid=<square|hex> size=<px> board=<cols>x<rows>` — set the background image and grid in one line. Example: `MAP background=images/wight-battle.png grid=hex size=64 board=20x38`.
- `SPRITE DEF <CODE> name="Name" url="https://..." size=<n> tint=#RRGGBB category=<PC|NPC|Monster|Object> speed=<ft>` — define or update a sprite type; `speed` defaults to 12 if omitted.
- `PLACE <CODE> @ A1,B2,...` — place sprite instances of the given code at coordinates. Instances auto-name `<CODE>-N`.
- `CREATE template=<TemplateId[,SvgTemplateId]> id=<TokenId> initials=<XX> name=<Label> faction=<pc|ally|npc|enemy|team> bg=#RRGGBB fg=#RRGGBB speed=<ft> type=<structure|creature|object> size=<cells> level=<n> hp=<n> total=<n> info="<free text>" @ A1,B2,...` — spawn tokens from templates (first template id drives the 3D model; optional second drives the SVG cap). `id` expands per placement; `initials` defaults to the first letters of the id; `name` renders on the token’s side band; `faction` (aliases: side/team) tints the cylinder green for pc/ally, red for npc/enemy; `bg`/`fg` override template colors; `speed` sets move speed (defaults to 12); `type` is a free-form category (e.g., `structure`); `size` is the footprint width on the smallest dimension in cells. If `info` is omitted, but `level`/`hp`/`total` are provided, the band shows e.g. `Lvl 5 HP 12/18`. Tokens start at full HP (current = total).
- `MOVE <tokenId> TO C3` — animate the first token whose id starts with `tokenId` toward the destination using its speed.
- `STATE id=<tokenId> remainingHP=<n>` — update a token’s current HP (for mid-battle adjustments).
- `INITIATIVE <n> <id1,id2,...>` or `INITIATIVE id=<n> order=id1,id2` — assign an initiative number to listed tokens (shown in the tokens window).
- `ATTACK <attackerId> -> <targetId> TYPE physical|magic [SPEED <n>] [DUR <ms>]` — play a transient effect from attacker to target.
- `EFFECT <magic|physical> AT A1 [SPEED <n>] [DUR <ms>]` — spawn a transient ground effect at a coordinate.
- `REMOVE <tokenId>` — remove the first token whose id starts with `tokenId`.
- `REMOVE HEIGHTMAP` — clear all height values and flatten the terrain.
- `HEIGHT_RANDOM max=<n>` — generate a procedural heightmap with values in the range roughly [-n, n] (default n=2).
- `ROADS <A0,B1,...>` — reserved/output for map authoring; currently ignored by the engine (no effect on heights or tokens).
- `CLEAR TOKENS` — remove all tokens.
- `CLEAR ALL` — clear map, sprites, and tokens.
- `RESET` — clear everything (map, sprites, tokens, backgrounds).
- `HEIGHT_START ... HEIGHT_END` — block format for heights. Put one comma-separated row of numbers per line between `HEIGHT_START` and `HEIGHT_END`. Example:
  ```
  HEIGHT_START
  0,0,0,0
  0,1,1,0
  0,2,3,0
  0,0,0,0
  END_HEIGHT
  ```

## Coordinates
`<ColumnLetter><RowNumber>` (A1, H7). Columns A-Z, rows start at 1.

## Making a terrain PNG that fits the grid/hex exactly
Use these rules when generating a map image so the texture, grid, and scripts align perfectly.

- Pick your board dimensions first: `BOARD <cols>x<rows>` and a grid size: `GRID square SIZE <px>` or `GRID hex SIZE <px>`. That `<px>` is the cell edge-to-edge size (`s`).
- For square grids, render the PNG at `width = cols * s` and `height = rows * s`.
- For hex grids (pointy-top, odd-row offset):
  - Let `s = grid size in px` (the same number you put in the `GRID hex SIZE` command).
  - Set the PNG width to `sqrt(3) * (cols + 0.5) * s`.
  - Set the PNG height to `(1.5 * rows + 0.5) * s` (because vertical spacing is 0.75 * hex height).
- Place any artwork centered in those extents. If you draw grid lines onto the texture, match the same math: each hex center is at:
  - `x = hexW * (col + 0.5 * (row mod 2)) + hexW/2`, where `hexW = sqrt(3) * s`
  - `y = row * (1.5 * s) + s` (hex height is `2*s`)
- Keep some alpha around the edges if you want soft borders, but do not change the stated pixel dimensions.
- Save as PNG (no compression artifacts); include a simple north arrow if you like, but avoid extra padding.

### Matching map script to the PNG
```
# Square example (20x12, 56px cells) => PNG 1120 x 672
BACKGROUND images/my-square.png
GRID square SIZE 56
BOARD 20x12

# Hex example (16x12, 56px cells)
# PNG width  = sqrt(3)*(16+0.5)*56 ≈ 1602 px
# PNG height = (1.5*12+0.5)*56    ≈ 1022 px
BACKGROUND images/my-hex.png
GRID hex SIZE 56
BOARD 16x12
```

## Token Templates (in /scripts via picker)
- `token-small` — small token (1 square), blue accent.
- `token-medium` — medium token (1 square), orange accent.
- `token-large` — large token (2x2 squares), green accent.

## Examples
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

# Movement (animated at per-token speed)
MOVE VC TO D6
MOVE DR TO I8

# Attacks and effects
ATTACK VC -> DR TYPE physical SPEED 18 DUR 800
EFFECT magic AT H7 DUR 1200
```

## 3D Model Catalog (in `data/models`)
- `Castle.glb`
- `Cleric.glb`
- `Cleric_Staff.glb`
- `Monk.glb`
- `Ranger.glb`
- `Ranger_Arrow.glb`
- `Ranger_Bow.glb`
- `Rogue.glb`
- `Rogue_Dagger.glb`
- `Warrior.glb`
- `Warrior_Sword.glb`
- `WizardX.glb`
- `Wizard_Staff.glb`
