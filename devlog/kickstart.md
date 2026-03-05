A very minimal spec (what you can implement in a weekend)

Endpoints

GET / → canvas UI
WS /sync → realtime (Yjs or simple broadcast)
GET /api/board → current board JSON
PUT /api/board → replace board JSON
GET /api/board/history → last 20 versions (optional)

Persistence

write board.json on a timer (every 2–5 seconds) and on clean shutdown
keep board-YYYYMMDD-HHMMSS.json snapshots occasionally

“Programmable”

Codex can:

read board JSON
add a diagram section / sticky notes
re-layout items (optional)
produce a “summary note” shape


-- Excalidraw shared space

