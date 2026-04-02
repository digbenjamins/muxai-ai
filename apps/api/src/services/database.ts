import { execSync } from "child_process";
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

export function pushSchema(): void {
  console.log("[db] Pushing Prisma schema...");
  const apiRoot = path.resolve(__dirname, "../../");
  try {
    execSync("npx prisma db push", {
      cwd: apiRoot,
      stdio: "inherit",
      env: { ...process.env },
    });
  } catch {
    // db:push may already be up to date — not fatal
  }
}
