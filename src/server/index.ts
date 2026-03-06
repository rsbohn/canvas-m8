import { createServer, IncomingMessage, ServerResponse } from "http";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import { WebSocket, WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 6809);
const DATA_DIR = path.join(process.cwd(), "data");
const SNAPSHOT_DIR = path.join(DATA_DIR, "snapshots");
const BOARD_FILE = path.join(DATA_DIR, "board.json");
const CLIENT_DIR = path.join(process.cwd(), "dist", "client");
const INDEX_FILE = path.join(CLIENT_DIR, "index.html");
const SAVE_INTERVAL_MS = 3000;
const SNAPSHOT_INTERVAL_MS = 60000;

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

type Board = Record<string, unknown>;

type WsMessage = {
  type: "board";
  payload: Board;
};

let board: Board = {};
let isSaving = false;
let lastSnapshotAt = 0;
let wsServer: WebSocketServer | null = null;

async function ensureDirectories() {
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
}

async function loadBoard() {
  try {
    const data = await fs.readFile(BOARD_FILE, "utf-8");
    board = JSON.parse(data) as Board;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Failed to load board.json", error);
    }
    board = {};
  }
}

function getTimestamp() {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function saveSnapshotIfNeeded() {
  const now = Date.now();
  if (now - lastSnapshotAt < SNAPSHOT_INTERVAL_MS) {
    return;
  }

  lastSnapshotAt = now;
  const snapshotPath = path.join(SNAPSHOT_DIR, `board-${getTimestamp()}.json`);
  await fs.writeFile(snapshotPath, JSON.stringify(board, null, 2), "utf-8");
}

async function saveBoardToDisk() {
  if (isSaving) {
    return;
  }

  isSaving = true;
  try {
    const tmpFile = `${BOARD_FILE}.tmp`;
    await fs.writeFile(tmpFile, JSON.stringify(board, null, 2), "utf-8");
    await fs.rename(tmpFile, BOARD_FILE);
    await saveSnapshotIfNeeded();
  } catch (error) {
    console.error("Failed to save board.json", error);
  } finally {
    isSaving = false;
  }
}

function broadcastBoard() {
  if (!wsServer) {
    return;
  }
  const message: WsMessage = { type: "board", payload: board };
  const serialized = JSON.stringify(message);
  for (const client of wsServer.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function sendText(res: ServerResponse, status: number, payload: string) {
  res.writeHead(status, { "Content-Type": "text/plain" });
  res.end(payload);
}

async function readRequestBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", (error) => reject(error));
  });
}

type BoardState = {
  elements?: Record<string, unknown>[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

type NotePayload = {
  text: string;
  x?: number;
  y?: number;
};

type RestorePayload = {
  snapshot: string;
};

function getBoardState() {
  return board as BoardState;
}

function getBoardElements() {
  const boardState = getBoardState();
  if (!Array.isArray(boardState.elements)) {
    boardState.elements = [];
  }
  return boardState.elements;
}

function randomInt() {
  return Math.floor(Math.random() * 2 ** 31);
}

function createTextElement(text: string, x: number, y: number) {
  const fontSize = 20;
  const lineHeight = 1.25;
  const lines = text.split("\n");
  const charWidth = fontSize * 0.6;
  const width = Math.max(160, ...lines.map((line) => Math.max(1, line.length) * charWidth));
  const height = Math.max(fontSize * lineHeight, lines.length * fontSize * lineHeight);
  const baseline = height - (fontSize * lineHeight - fontSize * 0.9);  // Calculate baseline for text rendering
  return {
    id: randomUUID(),
    type: "text",
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: `a${Date.now().toString(36)}`,
    roundness: null,
    seed: randomInt(),
    version: 1,
    versionNonce: randomInt(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    text,
    fontSize,
    fontFamily: 1,  // 1=Virgil (default), 2=Helvetica, 3=Cascadia
    textAlign: "left",
    verticalAlign: "top",
    baseline,
    containerId: null,
    originalText: text,
    lineHeight
  };
}

async function readSnapshotFiles(limit = 20) {
  const entries = await fs.readdir(SNAPSHOT_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith("board-") && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .slice(0, limit);
}

function isValidSnapshotName(name: string) {
  return name.startsWith("board-") && name.endsWith(".json") && !name.includes("/") && !name.includes("\\");
}

async function handleGetBoardHistory(res: ServerResponse) {
  try {
    const files = await readSnapshotFiles();

    const history = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(SNAPSHOT_DIR, file);
        const data = await fs.readFile(filePath, "utf-8");
        return { file, board: JSON.parse(data) as Board };
      })
    );

    sendJson(res, 200, history);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      sendJson(res, 200, []);
      return;
    }
    console.error("Failed to read board history", error);
    sendJson(res, 500, { error: "Failed to read board history" });
  }
}

async function serveStatic(pathname: string, res: ServerResponse) {
  const candidatePath = pathname === "/" ? INDEX_FILE : path.join(CLIENT_DIR, pathname);

  try {
    const stat = await fs.stat(candidatePath);
    const filePath = stat.isDirectory() ? path.join(candidatePath, "index.html") : candidatePath;
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch (error) {
    if (pathname !== "/") {
      try {
        const data = await fs.readFile(INDEX_FILE);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data);
        return;
      } catch (indexError) {
        console.error("Failed to serve client", indexError);
      }
    }

    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Failed to serve static file", error);
    }
    sendText(res, 404, "Not Found");
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (method === "GET" && url.pathname === "/api/board") {
    sendJson(res, 200, board);
    return;
  }

  if (method === "PUT" && url.pathname === "/api/board") {
    try {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body) as Board;
      board = parsed;
      await saveBoardToDisk();
      broadcastBoard();
      sendJson(res, 200, board);
    } catch (error) {
      console.error("Failed to parse board payload", error);
      sendJson(res, 400, { error: "Invalid board payload" });
    }
    return;
  }

  if (method === "POST" && url.pathname === "/api/board/notes") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body) as NotePayload;
      if (!payload.text || typeof payload.text !== "string") {
        sendJson(res, 400, { error: "Missing note text" });
        return;
      }
      const x = typeof payload.x === "number" ? payload.x : 100;
      const y = typeof payload.y === "number" ? payload.y : 100;
      const element = createTextElement(payload.text, x, y);
      getBoardElements().push(element);
      await saveBoardToDisk();
      broadcastBoard();
      sendJson(res, 201, { element });
    } catch (error) {
      console.error("Failed to add note", error);
      sendJson(res, 400, { error: "Invalid note payload" });
    }
    return;
  }

  if (method === "POST" && url.pathname === "/api/board/summary") {
    try {
      const body = await readRequestBody(req);
      const payload = body ? (JSON.parse(body) as Omit<NotePayload, "text">) : {};
      const elements = getBoardElements();
      const counts = elements.reduce<Record<string, number>>((acc, element) => {
        const typeValue = (element as { type?: unknown }).type;
        const type = typeof typeValue === "string" ? typeValue : "unknown";
        acc[type] = (acc[type] ?? 0) + 1;
        return acc;
      }, {});
      const summaryLines = [
        `Summary: ${elements.length} element(s)`,
        `By type: ${Object.entries(counts)
          .map(([type, count]) => `${type}=${count}`)
          .join(", ") || "none"}`
      ];
      const x = typeof payload.x === "number" ? payload.x : 140;
      const y = typeof payload.y === "number" ? payload.y : 140;
      const element = createTextElement(summaryLines.join("\n"), x, y);
      getBoardElements().push(element);
      await saveBoardToDisk();
      broadcastBoard();
      sendJson(res, 201, { element, summary: { total: elements.length, counts } });
    } catch (error) {
      console.error("Failed to create summary", error);
      sendJson(res, 400, { error: "Invalid summary payload" });
    }
    return;
  }

  if (method === "POST" && url.pathname === "/api/board/restore") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body) as RestorePayload;
      if (!payload?.snapshot || typeof payload.snapshot !== "string") {
        sendJson(res, 400, { error: "Missing snapshot name" });
        return;
      }
      if (!isValidSnapshotName(payload.snapshot)) {
        sendJson(res, 400, { error: "Invalid snapshot name" });
        return;
      }
      const snapshotPath = path.join(SNAPSHOT_DIR, payload.snapshot);
      const data = await fs.readFile(snapshotPath, "utf-8");
      board = JSON.parse(data) as Board;
      await saveBoardToDisk();
      broadcastBoard();
      sendJson(res, 200, { board });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        sendJson(res, 404, { error: "Snapshot not found" });
        return;
      }
      console.error("Failed to restore snapshot", error);
      sendJson(res, 500, { error: "Failed to restore snapshot" });
    }
    return;
  }

  if (method === "GET" && url.pathname === "/api/board/history") {
    await handleGetBoardHistory(res);
    return;
  }

  if (method === "GET" && url.pathname === "/api/board/snapshots") {
    try {
      const limit = Number(url.searchParams.get("limit") ?? "20");
      const files = await readSnapshotFiles(Number.isFinite(limit) ? Math.max(1, limit) : 20);
      sendJson(res, 200, { snapshots: files });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        sendJson(res, 200, { snapshots: [] });
        return;
      }
      console.error("Failed to list snapshots", error);
      sendJson(res, 500, { error: "Failed to list snapshots" });
    }
    return;
  }

  if (method === "DELETE" && url.pathname === "/api/board/snapshots") {
    try {
      const files = await readSnapshotFiles(Number.MAX_SAFE_INTEGER);
      await Promise.all(files.map((file) => fs.unlink(path.join(SNAPSHOT_DIR, file))));
      sendJson(res, 200, { deleted: files.length });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        sendJson(res, 200, { deleted: 0 });
        return;
      }
      console.error("Failed to delete snapshots", error);
      sendJson(res, 500, { error: "Failed to delete snapshots" });
    }
    return;
  }

  if (method === "GET") {
    await serveStatic(url.pathname, res);
    return;
  }

  sendText(res, 404, "Not Found");
}

async function start() {
  await ensureDirectories();
  await loadBoard();

  const server = createServer((req, res) => {
    void handleRequest(req, res);
  });

  wsServer = new WebSocketServer({ server, path: "/sync" });
  wsServer.on("connection", (socket) => {
    const message: WsMessage = { type: "board", payload: board };
    socket.send(JSON.stringify(message));
    socket.on("message", async (data) => {
      try {
        const text = data.toString();
        const parsed = JSON.parse(text) as WsMessage;
        if (parsed?.type === "board" && parsed.payload && typeof parsed.payload === "object") {
          board = parsed.payload;
          await saveBoardToDisk();
          broadcastBoard();
        }
      } catch (error) {
        console.error("Failed to process websocket message", error);
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`Canvas M8 server listening on http://localhost:${PORT}`);
  });

  setInterval(() => {
    void saveBoardToDisk();
  }, SAVE_INTERVAL_MS);

  const shutdown = async () => {
    await saveBoardToDisk();
    wsServer?.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void start();
