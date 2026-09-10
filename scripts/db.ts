/**
 * Manage the embedded PostgreSQL cluster used for local development.
 *
 *   tsx scripts/db.ts start    # initdb (first run) + pg_ctl start + ensure database
 *   tsx scripts/db.ts stop     # pg_ctl stop (data is kept)
 *   tsx scripts/db.ts status   # report whether the cluster is running
 *
 * The cluster is started via pg_ctl, so the postgres process is independent
 * of this script: `npm run db:start` exits and the server keeps running.
 *
 * Configuration via environment (defaults match .env):
 *   PG_PORT (5433), PG_USER (postgres), PG_PASSWORD (postgres),
 *   PG_DATABASE (school_timetable), PG_DATA_DIR (.postgres-data)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import "dotenv/config";

const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, process.env.PG_DATA_DIR ?? ".pgdata");
const PORT = Number(process.env.PG_PORT ?? 5434);
const USER = process.env.PG_USER ?? "postgres";
const PASSWORD = process.env.PG_PASSWORD ?? "postgres";
const DATABASE = process.env.PG_DATABASE ?? "school_timetable";

// Platform binary package of embedded-postgres.
const PLATFORM_DIRS: Record<string, string> = {
  win32: "@embedded-postgres/windows-x64",
  darwin: process.arch === "arm64" ? "@embedded-postgres/darwin-arm64" : "@embedded-postgres/darwin-x64",
  linux: process.arch === "arm64" ? "@embedded-postgres/linux-arm64" : "@embedded-postgres/linux-x64",
};
const BIN = path.join(
  ROOT,
  "node_modules",
  PLATFORM_DIRS[process.platform] ?? "",
  "native",
  "bin",
);

function ctl(args: string[]): number {
  const result = spawnSync(path.join(BIN, "pg_ctl"), args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

function isInitialised(): boolean {
  return existsSync(path.join(DATA_DIR, "PG_VERSION"));
}

function initdb(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const pwFile = path.join(DATA_DIR, "..", ".pg_pwfile");
  writeFileSync(pwFile, PASSWORD + "\n");
  try {
    const result = spawnSync(
      path.join(BIN, "initdb"),
      [
        `--pgdata=${DATA_DIR}`,
        "--auth=scram-sha-256",
        `--username=${USER}`,
        `--pwfile=${pwFile}`,
        "--encoding=UTF8",
        "--locale=C",
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      throw new Error(`initdb failed with status ${result.status}`);
    }
  } finally {
    rmSync(pwFile, { force: true });
  }
}

async function ensureDatabase(): Promise<void> {
  const client = new Client({
    host: "localhost",
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: "postgres",
  });
  await client.connect();
  try {
    const exists = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [DATABASE],
    );
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(DATABASE)}`);
      console.log(`created database ${DATABASE}`);
    }
  } finally {
    await client.end();
  }
}

function start(): void {
  if (!existsSync(BIN)) {
    throw new Error(
      `PostgreSQL binaries not found at ${BIN}. Run npm install first.`,
    );
  }
  if (!isInitialised()) {
    console.log(`initialising cluster in ${DATA_DIR} (UTF8, locale C)`);
    initdb();
  }
  const status = ctl([
    "-D",
    DATA_DIR,
    "status",
  ]);
  if (status === 0) {
    console.log("PostgreSQL is already running");
    return;
  }
  // Machine quirk: postgres.exe must run with an attached console — when
  // spawned detached (pg_ctl / DETACHED_PROCESS / CREATE_NO_WINDOW), backend
  // children die at spawn (0xC0000142, then shared-memory error 487 on every
  // connection). `cmd start` gives the server its own minimized console,
  // which also keeps it running after this script exits.
  const exe = path.join(BIN, "postgres.exe");
  const cmdline = `/c start "PostgreSQL (embedded dev)" /min "${exe}" -D "${DATA_DIR}" -p ${PORT}`;
  const child = spawn(
    process.env.ComSpec ?? "cmd.exe",
    [cmdline],
    {
      windowsVerbatimArguments: true,
      stdio: "ignore",
      detached: true,
    },
  );
  child.unref();
}

async function waitForReadiness(): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const client = new Client({
      host: "localhost",
      port: PORT,
      user: USER,
      password: PASSWORD,
      database: "postgres",
      connectionTimeoutMillis: 1000,
    });
    try {
      await client.connect();
      await client.end();
      return;
    } catch {
      try { await client.end(); } catch {}
      if (Date.now() > deadline) {
        throw new Error(`PostgreSQL did not become ready within 30s on port ${PORT}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "start";
  switch (command) {
    case "start":
      start();
      await waitForReadiness();
      await ensureDatabase();
      console.log(`PostgreSQL ready: localhost:${PORT}/${DATABASE}`);
      break;
    case "stop":
      ctl(["-D", DATA_DIR, "stop", "-m", "fast"]);
      console.log(`PostgreSQL stopped (data kept in ${DATA_DIR})`);
      break;
    case "status":
      process.exit(ctl(["-D", DATA_DIR, "status"]));
      break;
    default:
      console.error("usage: tsx scripts/db.ts start|stop|status");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
