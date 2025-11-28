# Tactical Battle Board Language

Plain text commands, one per line. Lines starting with `#` are comments.

## Commands
- `BACKGROUND <url>` — set a background image for the board. Accepts absolute URLs or local paths such as `images/wight-battle.png` placed beside `index.html`.
- `GRID square SIZE <px>` or `GRID hex SIZE <px>` — set grid type and cell size in pixels.
- `BOARD <cols>x<rows>` — set board dimensions.
- `SPRITE DEF <CODE> name="Name" url="https://..." size=<n> tint=#RRGGBB category=<PC|NPC|Monster|Object>` — define or update a sprite type.
- `PLACE <CODE> @ A1,B2,...` — place sprite instances of the given code at coordinates. Instances auto-name `<CODE>-N`.
- `MOVE <tokenId> TO C3` — move the first token whose id starts with `tokenId`.
- `REMOVE <tokenId>` — remove the first token whose id starts with `tokenId`.
- `CLEAR TOKENS` — remove all tokens.
- `CLEAR ALL` — clear map, sprites, and tokens.
- `HEIGHT A1=2,B3=0,...` — set height values (numbers) per grid cell; used in 3D mode to raise/lower tiles.

## Coordinates
`<ColumnLetter><RowNumber>` (A1, H7). Columns A-Z, rows start at 1.

## Example
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

# Movement
MOVE VC TO D6
MOVE DR TO I8
```
