import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) throw new Error("DATABASE_URL is required.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sql = await readFile(resolve(root, "schema.sql"), "utf8");
const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  await pool.query(sql);
  process.stdout.write("Database schema is current.\n");
} finally {
  await pool.end();
}
