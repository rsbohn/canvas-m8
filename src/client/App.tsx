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

const API_URL = "/api/board";
const SAVE_DEBOUNCE_MS = 1000;
const POLL_INTERVAL_MS = 3000;

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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>("");
  const readyToSave = useRef(false);
  const awaitingHydration = useRef(false);
  const hasPendingSave = useRef(false);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  const applyRemoteBoard = useCallback(
    async (force: boolean) => {
      try {
        const response = await fetch(API_URL);
        if (!response.ok) {
          throw new Error(`Failed to load board: ${response.status}`);
        }
        const data = (await response.json()) as BoardPayload;
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
    []
  );

  useEffect(() => {
    void applyRemoteBoard(true);
  }, [applyRemoteBoard]);

  useEffect(() => {
    const interval = setInterval(() => {
      void applyRemoteBoard(false);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [applyRemoteBoard]);

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

  return (
    <div className="app-shell">
      <div className="status-bar">
        <span>{status}</span>
        <button className="reload-button" type="button" onClick={handleReload}>
          Reload board
        </button>
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
