import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Applies the schema over Neon's serverless driver (HTTPS/WebSocket, 443),
// so it works where the native Postgres port (5432) is blocked. Idempotent:
// it skips if the schema is already present.
neonConfig.webSocketConstructor = ws;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  const ddlPath = fileURLToPath(new URL("../prisma/migrations/0_init/migration.sql", import.meta.url));
  const ddl = readFileSync(ddlPath, "utf8");

  const pool = new Pool({ connectionString });
  try {
    const { rows } = await pool.query(
      "select exists (select 1 from information_schema.tables where table_schema='public' and table_name='User') as present"
    );
    if (rows[0].present) {
      console.log("Schema already applied — skipping.");
      return;
    }
    await pool.query(ddl);
    console.log("Schema applied to Neon over HTTPS.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
