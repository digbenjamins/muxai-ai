import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const EMBEDDED_URL = "postgresql://muxai:muxai@localhost:5433/muxai";

// If DATABASE_URL is not set or explicitly set to "embedded", use embedded postgres
export function isEmbedded(): boolean {
  const url = process.env.DATABASE_URL;
  return !url || url === "embedded" || url === EMBEDDED_URL;
}

export async function startDatabase(): Promise<void> {
  if (!isEmbedded()) {
    console.log("[db] Using external PostgreSQL:", process.env.DATABASE_URL?.replace(/:\/\/.*@/, "://<credentials>@"));
    // muxAI is self-hosted — the user owns this DB and the schema is internal
    // to muxAI. Push schema on startup so new models appear without manual steps.
    pushSchema();
    return;
  }

  console.log("[db] Starting embedded PostgreSQL...");

  // Set the DATABASE_URL so Prisma picks it up
  process.env.DATABASE_URL = EMBEDDED_URL;

  const { default: EmbeddedPostgres } = await import("embedded-postgres");

  const db = new EmbeddedPostgres({
    databaseDir: path.join(process.cwd(), ".muxai-db"),
    user: "muxai",
    password: "muxai",
    port: 5433,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });

  try {
    await db.initialise();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already exist")) {
      // Data dir exists from a previous run — skip init, just start
    } else {
      throw new Error(
        `[db] Failed to initialise embedded PostgreSQL: ${msg}\n` +
        `     If you changed the encoding, delete the data directory and restart:\n` +
        `     rm -rf apps/api/.muxai-db`
      );
    }
  }
  await db.start();

  // Create the database if it doesn't exist yet
  try {
    await db.createDatabase("muxai");
  } catch {
    // Already exists — fine
  }

  console.log("[db] Embedded PostgreSQL running on port 5433");

  // Push schema
  pushSchema();
}

// Walk up from __dirname until we find a directory containing prisma/schema.prisma.
// In dev (tsx) __dirname is apps/api/src/services → ../../ works.
// In prod (compiled) __dirname is apps/api/dist/services → ../../ lands in dist/
// which has no prisma folder, so the previous resolver silently failed.
function findApiRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`[db] Could not locate prisma/schema.prisma starting from ${__dirname}`);
}

export function pushSchema(): void {
  console.log("[db] Pushing Prisma schema...");
  let apiRoot: string;
  try {
    apiRoot = findApiRoot();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return;
  }
  try {
    execSync("npx prisma db push", {
      cwd: apiRoot,
      stdio: "inherit",
      env: { ...process.env },
    });
    console.log("[db] Schema push complete");
  } catch (err) {
    // Log loudly — silent failures here mean tables for new models won't exist.
    console.error("[db] Schema push failed:", err instanceof Error ? err.message : err);
  }
}
