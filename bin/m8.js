#!/usr/bin/env node

const DEFAULT_URL = process.env.M8_URL || "http://localhost:6809";

function printUsage() {
  console.log(`m8 <command> [options]

Commands:
  note <text>           Add a note to the board
  summary               Add a summary note to the board
  snapshots             Add a snapshots note to the board
  restore <snapshot>    Restore a snapshot to the board
  wipe-snapshots        Delete all snapshot files (requires --yes)

Options:
  --x <number>          X position for note/summary/snapshots
  --y <number>          Y position for note/summary/snapshots
  --limit <number>      Snapshot list limit (default 20)
  --url <string>        Base URL (default ${DEFAULT_URL})
  --yes                 Confirm destructive actions
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {};
  const rest = [];

  while (args.length) {
    const arg = args.shift();
    if (arg === "--x" || arg === "--y" || arg === "--limit" || arg === "--url") {
      const value = args.shift();
      options[arg.slice(2)] = value;
      continue;
    }
    if (arg === "--yes") {
      options.yes = true;
      continue;
    }
    rest.push(arg);
  }

  return { options, rest };
}

async function request(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Request failed ${response.status}: ${message}`);
  }
  return response.json();
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    return;
  }

  const command = argv[0];
  const { options, rest } = parseArgs(argv.slice(1));
  const baseUrl = options.url || DEFAULT_URL;
  const x = options.x !== undefined ? Number(options.x) : undefined;
  const y = options.y !== undefined ? Number(options.y) : undefined;

  if (command === "note") {
    const text = rest.join(" ").trim();
    if (!text) {
      throw new Error("note requires text");
    }
    const payload = { text, ...(Number.isFinite(x) ? { x } : {}), ...(Number.isFinite(y) ? { y } : {}) };
    const result = await request(`${baseUrl}/api/board/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log(`Added note ${result.element?.id ?? ""}`.trim());
    return;
  }

  if (command === "summary") {
    const payload = { ...(Number.isFinite(x) ? { x } : {}), ...(Number.isFinite(y) ? { y } : {}) };
    const result = await request(`${baseUrl}/api/board/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log(`Added summary note ${result.element?.id ?? ""}`.trim());
    return;
  }

  if (command === "snapshots") {
    const limit = options.limit ? Number(options.limit) : 20;
    const list = await request(`${baseUrl}/api/board/snapshots?limit=${Number.isFinite(limit) ? limit : 20}`);
    const snapshots = Array.isArray(list.snapshots) ? list.snapshots : [];
    const text = ["Snapshots:", ...snapshots.map((file) => `- ${file}`)].join("\n");
    const payload = { text, ...(Number.isFinite(x) ? { x } : {}), ...(Number.isFinite(y) ? { y } : {}) };
    const result = await request(`${baseUrl}/api/board/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log(`Added snapshots note ${result.element?.id ?? ""}`.trim());
    return;
  }

  if (command === "restore") {
    const snapshot = rest.join(" ").trim();
    if (!snapshot) {
      throw new Error("restore requires snapshot filename");
    }
    await request(`${baseUrl}/api/board/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot })
    });
    console.log(`Restored snapshot ${snapshot}`);
    return;
  }

  if (command === "wipe-snapshots") {
    if (!options.yes) {
      throw new Error("wipe-snapshots requires --yes");
    }
    const result = await request(`${baseUrl}/api/board/snapshots`, {
      method: "DELETE"
    });
    console.log(`Deleted ${result.deleted ?? 0} snapshot(s)`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  printUsage();
  process.exit(1);
});
