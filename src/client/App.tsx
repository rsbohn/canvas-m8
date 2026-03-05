import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawElement,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState
} from "@excalidraw/excalidraw";

type BoardPayload = {
  elements?: readonly ExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: BinaryFiles;
};

type WsMessage = {
  type: "board";
  payload: BoardPayload;
};

const API_URL = "/api/board";
const WS_PATH = "/sync";
const SAVE_DEBOUNCE_MS = 1000;
const POLL_INTERVAL_MS = 3000;
const SNAPSHOT_LIMIT = 20;

function normalizeAppState(appState?: Partial<AppState>) {
  const normalized: Partial<AppState> = { ...(appState ?? {}) };
  const collaborators = (appState as { collaborators?: unknown })?.collaborators;
  if (!(collaborators instanceof Map)) {
    normalized.collaborators = new Map();
  }
  if ((appState as { fileHandle?: unknown })?.fileHandle) {
    normalized.fileHandle = null;
  }
  return normalized;
}

function serializePayload(payload: BoardPayload) {
  return JSON.stringify({
    elements: payload.elements ?? [],
    appState: payload.appState ?? {},
    files: payload.files ?? {}
  });
}

export default function App() {
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [status, setStatus] = useState("Loading board...");
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>("");
  const readyToSave = useRef(false);
  const awaitingHydration = useRef(false);
  const hasPendingSave = useRef(false);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  const applyBoardPayload = useCallback(
    (data: BoardPayload, force: boolean) => {
      const prepared: ExcalidrawInitialDataState = {
        elements: data.elements ?? [],
        appState: normalizeAppState(data.appState),
        files: data.files ?? {}
      };
      const serialized = serializePayload(prepared);
      if (!force && hasPendingSave.current) {
        return;
      }
      if (!force && serialized === lastSaved.current) {
        return;
      }
      awaitingHydration.current = true;
      lastSaved.current = serialized;
      if (apiRef.current) {
        apiRef.current.updateScene({
          elements: prepared.elements ?? [],
          appState: normalizeAppState(prepared.appState),
          files: prepared.files ?? {}
        });
      } else {
        setInitialData(prepared);
      }
      readyToSave.current = true;
      setStatus("Ready");
    },
    []
  );

  const applyRemoteBoard = useCallback(
    async (force: boolean) => {
      try {
        const response = await fetch(API_URL);
        if (!response.ok) {
          throw new Error(`Failed to load board: ${response.status}`);
        }
        const data = (await response.json()) as BoardPayload;
        applyBoardPayload(data, force);
      } catch (error) {
        console.error(error);
        if (!readyToSave.current) {
          setInitialData({ elements: [] });
          lastSaved.current = serializePayload({ elements: [], appState: {}, files: {} });
          readyToSave.current = true;
          awaitingHydration.current = true;
        }
        setStatus("Failed to load board");
      }
    },
    [applyBoardPayload]
  );

  const fetchSnapshots = useCallback(async () => {
    try {
      const response = await fetch(`/api/board/snapshots?limit=${SNAPSHOT_LIMIT}`);
      if (!response.ok) {
        throw new Error(`Failed to load snapshots: ${response.status}`);
      }
      const data = (await response.json()) as { snapshots?: string[] };
      const list = Array.isArray(data.snapshots) ? data.snapshots : [];
      setSnapshots(list);
      setSelectedSnapshot((current) => (list.includes(current) ? current : list[0] ?? ""));
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    void applyRemoteBoard(true);
    void fetchSnapshots();
  }, [applyRemoteBoard, fetchSnapshots]);

  useEffect(() => {
    const interval = setInterval(() => {
      void applyRemoteBoard(false);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [applyRemoteBoard]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}${WS_PATH}`);

    const handleMessage = (event: MessageEvent) => {
      try {
        const raw = typeof event.data === "string" ? event.data : "";
        if (!raw) {
          return;
        }
        const parsed = JSON.parse(raw) as WsMessage;
        if (parsed?.type === "board") {
          const force = !readyToSave.current;
          applyBoardPayload(parsed.payload ?? {}, force);
        }
      } catch (error) {
        console.error("Failed to parse websocket message", error);
      }
    };

    socket.addEventListener("open", () => setStatus("Live"));
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("error", (error) => {
      console.error("WebSocket error", error);
    });

    return () => {
      socket.removeEventListener("message", handleMessage);
      socket.close();
    };
  }, [applyBoardPayload]);

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (!readyToSave.current) {
        return;
      }
      const payload: BoardPayload = { elements, appState: normalizeAppState(appState), files };
      const serialized = JSON.stringify(payload);
      if (awaitingHydration.current) {
        lastSaved.current = serialized;
        awaitingHydration.current = false;
        return;
      }
      if (serialized === lastSaved.current) {
        return;
      }

      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }

      hasPendingSave.current = true;
      saveTimer.current = setTimeout(async () => {
        try {
          const response = await fetch(API_URL, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: serialized
          });
          if (!response.ok) {
            throw new Error(`Failed to save board: ${response.status}`);
          }
          lastSaved.current = serialized;
          hasPendingSave.current = false;
          setStatus("Saved");
        } catch (error) {
          console.error(error);
          setStatus("Save failed");
        }
      }, SAVE_DEBOUNCE_MS);
    },
    []
  );

  const handleReload = useCallback(() => {
    void applyRemoteBoard(true);
  }, [applyRemoteBoard]);

  const handleSnapshotRefresh = useCallback(() => {
    void fetchSnapshots();
  }, [fetchSnapshots]);

  const handleSnapshotRestore = useCallback(async () => {
    if (!selectedSnapshot) {
      return;
    }
    try {
      setStatus("Restoring snapshot...");
      const response = await fetch("/api/board/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: selectedSnapshot })
      });
      if (!response.ok) {
        throw new Error(`Failed to restore snapshot: ${response.status}`);
      }
      await applyRemoteBoard(true);
      await fetchSnapshots();
      setStatus("Snapshot restored");
    } catch (error) {
      console.error(error);
      setStatus("Snapshot restore failed");
    }
  }, [applyRemoteBoard, fetchSnapshots, selectedSnapshot]);

  return (
    <div className="app-shell">
      <div className="status-bar">
        <div className="status-left">
          <span>{status}</span>
        </div>
        <div className="status-actions">
          <div className="snapshot-controls">
            <label className="snapshot-label" htmlFor="snapshot-select">
              Snapshot
            </label>
            <select
              id="snapshot-select"
              className="snapshot-select"
              value={selectedSnapshot}
              onChange={(event) => setSelectedSnapshot(event.target.value)}
            >
              {snapshots.length === 0 ? (
                <option value="">No snapshots</option>
              ) : (
                snapshots.map((snapshot) => (
                  <option key={snapshot} value={snapshot}>
                    {snapshot}
                  </option>
                ))
              )}
            </select>
            <button
              className="action-button"
              type="button"
              onClick={handleSnapshotRestore}
              disabled={!selectedSnapshot}
            >
              Restore
            </button>
            <button className="action-button" type="button" onClick={handleSnapshotRefresh}>
              Refresh
            </button>
          </div>
          <button className="action-button" type="button" onClick={handleReload}>
            Reload board
          </button>
        </div>
      </div>
      <div className="canvas-shell">
        <Excalidraw
          initialData={initialData ?? undefined}
          onChange={handleChange}
          excalidrawAPI={(api) => {
            apiRef.current = api;
          }}
        />
      </div>
    </div>
  );
}
