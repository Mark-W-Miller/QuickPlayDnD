# Tactical Battle Board Language

Plain text commands, one per line. Lines starting with `#` are comments.

## Commands
- `BACKGROUND <url>` — set a background image for the board. Accepts absolute URLs or local paths such as `images/wight-battle.png` placed beside `index.html`.
- `GRID square SIZE <px>` or `GRID hex SIZE <px>` — set grid type and cell size in pixels.
- `BOARD <cols>x<rows>` — set board dimensions.
- `SPRITE DEF <CODE> name="Name" url="https://..." size=<n> tint=#RRGGBB category=<PC|NPC|Monster|Object> speed=<ft>` — define or update a sprite type; `speed` defaults to 12 if omitted.
- `PLACE <CODE> @ A1,B2,...` — place sprite instances of the given code at coordinates. Instances auto-name `<CODE>-N`.
- `CREATE template=<TemplateId[,SvgTemplateId]> id=<TokenId> initials=<XX> bg=#RRGGBB fg=#RRGGBB speed=<ft> type=<structure|creature|object> size=<cells> @ A1,B2,...` — spawn tokens from templates (first template id drives the 3D model; optional second drives the SVG cap). `id` expands per placement; `initials` defaults to the first letters of the id; `bg`/`fg` override template colors; `speed` sets move speed (defaults to 12); `type` is a free-form category (e.g., `structure`); `size` is the footprint width on the smallest dimension in cells.
- `MOVE <tokenId> TO C3` — animate the first token whose id starts with `tokenId` toward the destination using its speed.
- `ATTACK <attackerId> -> <targetId> TYPE physical|magic [SPEED <n>] [DUR <ms>]` — play a transient effect from attacker to target.
- `EFFECT <magic|physical> AT A1 [SPEED <n>] [DUR <ms>]` — spawn a transient ground effect at a coordinate.
- `REMOVE <tokenId>` — remove the first token whose id starts with `tokenId`.
- `REMOVE HEIGHTMAP` — clear all height values and flatten the terrain.
- `CLEAR TOKENS` — remove all tokens.
- `CLEAR ALL` — clear map, sprites, and tokens.
- `RESET` — clear everything (map, sprites, tokens, backgrounds).
- `HEIGHT A1=2,B3=0,...` — set height values (numbers) per grid cell; used in 3D mode to raise/lower tiles. Multiple `HEIGHT` lines are merged.

## Coordinates
`<ColumnLetter><RowNumber>` (A1, H7). Columns A-Z, rows start at 1.

## Token Templates (in /scripts via picker)
- `scout-small` — small token (1 square), blue scout marker.
- `warrior-medium` — medium token (1 square), orange warrior marker.
- `guardian-large` — large token (2x2 squares), green guardian marker.

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
