Below is an updated README.md that incorporates:

✅ A Node.js backend
✅ Media storage for saving/retrieving uploaded maps & token SVGs
✅ API endpoints
✅ Frontend still SPA (React)
✅ Clean, production-ready structure

Copy/paste directly into your repo.

⸻

🗺️ Tactical Battle Board

A browser-based tactical map engine with Node-powered media storage.

The Tactical Battle Board is a web application that allows a DM to upload battle maps, tokens, and run tactical encounters using a grid/hex-based canvas and a text-based command console.
It is designed to integrate smoothly with ChatGPT/Codex for semi-automated encounter control.

This version includes:
	•	A Node.js backend for storing and retrieving media
	•	A React SPA frontend for map rendering and token control
	•	JSON-based board state stored in localStorage (and optionally synced to backend)

⸻

🚀 Features

🔹 Map Handling
	•	Upload and store battle maps on backend (/media/maps)
	•	Retrieve previously used maps
	•	Square or Hex grid overlays
	•	Adjustable grid size
	•	Pan + zoom
	•	Multiple map presets per campaign

🔹 Token System
	•	Upload SVG token icons to backend (/media/tokens)
	•	Define token metadata (name, code, category, size, tint)
	•	Place tokens via drag-and-drop or console commands
	•	Move, remove, rotate, and annotate tokens
	•	Persistent token library stored on backend

🔹 Command Console

A powerful text interface for fast tactical adjustments:

PLACE VC @ H7
MOVE DR E2N1
STATUS SR = bloodied
REMOVE H1
LABEL VC = "Vin Chi (Blessed)"

This system allows ChatGPT or the DM to send simple text commands to manipulate the board.

🔹 Storage & Persistence
	•	Board state stored in browser localStorage
	•	Media files stored on backend filesystem (or S3 later)
	•	Optional endpoints to save/load entire board states for replay or revision

⸻

🧱 System Architecture

/server
  /media
    /maps
    /tokens
  server.js (Express backend)
  routes.js
  config.js
/frontend
  /src
    components/
    hooks/
    models/
    utils/
    App.tsx
    index.tsx
  vite.config.js
README.md


⸻

🔥 Backend (Node.js + Express)

The backend serves media files and metadata.

📁 Folder Structure

server/
  media/maps/      (uploaded map images)
  media/tokens/    (uploaded SVG tokens)
  server.js        (main entry)
  routes/media.js  (upload + retrieval)
  routes/state.js  (optional: map state save/load)
  package.json

📌 API Endpoints

Upload a map
POST /api/media/map
	•	Accepts PNG/JPG
	•	Returns stored filename + URL

List all maps
GET /api/media/maps

Upload a token icon
POST /api/media/token
	•	Accepts SVG
	•	Returns stored filename + URL

List all tokens
GET /api/media/tokens

Optional: Save board state JSON
POST /api/state/save

Optional: Load board state JSON
GET /api/state/:id

⸻

🎨 Frontend (React + TypeScript + Vite)

Key Components
	•	MapCanvas – renders maps + grid + tokens
	•	CommandConsole – parses commands, updates board state
	•	TokenLibrary – lists all available token definitions
	•	SidebarLeft – map switching, uploads, commands
	•	SidebarRight – token inspector, options
	•	useBoardState – custom React hook
	•	parser.ts – command interpreter

Board Data Model (summary)

interface BattleMapConfig {
  id: string;
  name: string;
  imageUrl: string;       
  gridType: "square" | "hex";
  gridSizePx: number;
  originX: number;
  originY: number;
  cols: number;
  rows: number;
}

interface TokenDefinition {
  id: string;
  code: string;            
  name: string;            
  category: "PC" | "NPC" | "Monster" | "Object";
  svgUrl: string;           
  baseSize: number;         
  colorTint?: string;
}

interface TokenInstance {
  id: string;
  defId: string;
  mapId: string;
  col: number;
  row: number;
  facingDeg?: number;
  status?: string[];
  labelOverride?: string;
}

interface BoardState {
  map: BattleMapConfig;
  tokenDefs: TokenDefinition[];
  tokens: TokenInstance[];
}


⸻

🛠️ Installation & Setup

1. Clone the repo

git clone https://github.com/<user>/<repo>.git
cd <repo>


⸻

📦 Backend Setup

cd server
npm install
npm start

Your API will now run at:

http://localhost:4000


⸻

🎨 Frontend Setup

cd frontend
npm install
npm run dev

Runs at:

http://localhost:5173

Ensure the frontend is configured to point to:

VITE_API_URL=http://localhost:4000


⸻

🧪 Usage Workflow
	1.	Upload a map
→ Stored in /media/maps
→ Appears in frontend map selector
	2.	Upload token SVGs
→ Stored in /media/tokens
→ Select token definitions in UI
	3.	Place tokens via console:

PLACE VC @ H7
PLACE DR @ E10


	4.	Move during combat:

MOVE DR E2N1


	5.	Apply effects:

STATUS VC = blessed
LABEL SR = "Sarsu (prone)"



⸻

🔮 Future Enhancements
	•	Campaign save slots
	•	S3 media storage
	•	WebSocket real-time sync (co-op DMing)
	•	Fog of war
	•	Area-of-effect templates
	•	Combat tracker integration

⸻

✔️ Summary

This README defines a complete full-stack app:
	•	Node backend for media and state
	•	React frontend for tactical rendering
	•	Hex/square grids
	•	Token system
	•	Command console
	•	Local + server storage

Ready for Codex to scaffold everything.

⸻

If you want, I can now:

✅ Generate backend boilerplate (server.js, routes, file upload middleware)
✅ Generate the frontend Vite + React project structure
✅ Generate TypeScript models and parser code skeleton
✅ Add sample SVG tokens + test maps

Just tell me:
“Generate the backend skeleton”
or
“Initialize the React/Vite frontend”