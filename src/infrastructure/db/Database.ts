import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Database {
  private static instance: DatabaseSync | null = null;

  public static getInstance(dbPath?: string): DatabaseSync {
    if (this.instance) {
      return this.instance;
    }

    // Resolve path for database
    // Default to an in-memory database for testing/SLA, or local file if specified
    const targetPath = dbPath ?? process.env.DB_PATH ?? ":memory:";
    
    try {
      const db = new DatabaseSync(targetPath);
      
      // Optimize SQLite settings for <50ms SLAs
      db.exec("PRAGMA journal_mode = WAL;");
      db.exec("PRAGMA synchronous = NORMAL;");
      db.exec("PRAGMA temp_store = MEMORY;");
      db.exec("PRAGMA foreign_keys = ON;");

      // Load and execute schema.sql
      const schemaPath = path.resolve(__dirname, "../../../schema.sql");
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, "utf-8");
        db.exec(schemaSql);
      } else {
        console.warn(`[DATABASE WARNING] schema.sql not found at ${schemaPath}. Using existing table definitions.`);
      }

      this.instance = db;
      return db;
    } catch (error) {
      console.error("[DATABASE FATAL] Failed to initialize SQLite database:", error);
      throw error;
    }
  }

  /**
   * Reset instance (mainly for unit tests isolation).
   */
  public static reset(): void {
    if (this.instance) {
      this.instance = null;
    }
  }
}
