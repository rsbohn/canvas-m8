# 2026-03-04 Collaboration Rules

## Summary
Today we wired up a collaborative Excalidraw-backed canvas with a lightweight API, persistence, and a CLI. Along the way we fixed several sync and persistence issues, added snapshots, and documented how multi-user + AI collaboration is represented on the board.

## Key Changes
- **Client + Server**
  - Split server/client TS configs; server serves built client.
  - Added polling + “Reload board” button to fetch remote changes without refresh.
  - Fixed refresh wipe by skipping the first onChange after hydration.
  - Normalized appState so `collaborators` is a `Map` (prevents white screen crash).
  - Server saves are now **atomic** (`board.json.tmp` → rename).

- **API**
  - `GET /api/health`
  - `GET /api/board` / `PUT /api/board`
  - `GET /api/board/history`
  - `GET /api/board/snapshots?limit=20`
  - `DELETE /api/board/snapshots`
  - `POST /api/board/notes` (drop text note)
  - `POST /api/board/summary` (summary note)

- **Snapshots**
  - Periodic board snapshots persisted in `data/snapshots/`.
  - CLI can list and wipe snapshots.

- **CLI**
  - Added `m8` CLI with commands:
    - `m8 note "text"`
    - `m8 summary`
    - `m8 snapshots`
    - `m8 wipe-snapshots --yes`

## Collaboration Rules (Current)
1. **Single source of truth** is `/api/board`.
2. **Clients poll** every ~3s and can manually “Reload board.”
3. **Server changes** (CLI/AI) appear to clients via polling or reload.
4. **No live WS sync yet** — refresh/poll is required.
5. **Avoid overwrite on load**: first client onChange after hydration is ignored.
6. **Persist safely** with atomic writes and periodic snapshots.

## Diagram Notes
We added a diagram showing multiple users and the AI agent all reading/writing the shared board API:
- User A/B → Server/API → Board JSON → AI Agent
- AI Agent → Board JSON

## Next Steps
- Optional: WebSocket sync (`/sync`) for true realtime collaboration.
- Add CLI `m8 restore <snapshot>`.
- Add snapshot retention policy + UI snapshot picker.
