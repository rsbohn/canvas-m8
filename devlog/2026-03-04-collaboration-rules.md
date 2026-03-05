# 2026-03-04 Collaboration Rules

## Summary
Today we added realtime WebSocket sync, snapshot restore support (API + CLI), and a snapshot picker UI for restoring boards. We also kept the polling fallback and extended collaboration rules to reflect live updates.

## Key Changes
- **Client + Server**
  - Split server/client TS configs; server serves built client.
  - Added polling + “Reload board” button to fetch remote changes without refresh.
  - Fixed refresh wipe by skipping the first onChange after hydration.
  - Normalized appState so `collaborators` is a `Map` (prevents white screen crash).
  - Server saves are now **atomic** (`board.json.tmp` → rename).
  - WebSocket sync on `/sync` broadcasts board updates in realtime.
  - Snapshot picker UI can refresh and restore snapshots from the status bar.

- **API**
  - `GET /api/health`
  - `GET /api/board` / `PUT /api/board`
  - `GET /api/board/history`
  - `GET /api/board/snapshots?limit=20`
  - `POST /api/board/restore`
  - `DELETE /api/board/snapshots`
  - `POST /api/board/notes` (drop text note)
  - `POST /api/board/summary` (summary note)

- **Snapshots**
  - Periodic board snapshots persisted in `data/snapshots/`.
  - CLI can list, restore, and wipe snapshots.
  - UI picker supports restore + refresh.

- **CLI**
  - Added `m8` CLI with commands:
    - `m8 note "text"`
    - `m8 summary`
    - `m8 snapshots`
    - `m8 restore <snapshot>`
    - `m8 wipe-snapshots --yes`

## Collaboration Rules (Current)
1. **Single source of truth** is `/api/board`.
2. **Clients get WS updates** via `/sync` with polling fallback every ~3s.
3. **Server changes** (CLI/AI/restore) broadcast to WS clients and show up via polling/reload.
4. **Avoid overwrite on load**: first client onChange after hydration is ignored.
5. **Persist safely** with atomic writes and periodic snapshots.

## Diagram Notes
We added a diagram showing multiple users and the AI agent all reading/writing the shared board API:
- User A/B → Server/API → Board JSON → AI Agent
- AI Agent → Board JSON

## Next Steps
- Add snapshot retention policy + pruning controls.
- Add a richer UI snapshot browser (timestamps + preview).
- Consider conflict handling rules for simultaneous WS edits.
