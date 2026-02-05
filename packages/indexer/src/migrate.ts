import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getPool } from "./db.js";
import { logger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function migrate(): Promise<void> {
  const schemaPath = join(__dirname, "..", "src", "schema.sql");
  let sql: string;
  try {
    sql = readFileSync(schemaPath, "utf-8");
  } catch {
    // When running from dist, schema.sql is next to the source
    const altPath = join(__dirname, "schema.sql");
    sql = readFileSync(altPath, "utf-8");
  }

  const pool = getPool();
  await pool.query(sql);
  logger.info("Database migration complete");
}

// Allow direct execution
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("migrate.ts") ||
    process.argv[1].endsWith("migrate.js"));
if (isMain) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, "Migration failed");
      process.exit(1);
    });
}
