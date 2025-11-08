const Database = require("better-sqlite3");
const path = require("path");
const DB_PATH =
    process.env.DB_PATH || path.resolve(process.cwd(), "queuectl.db");

export const db = new Database(DB_PATH);

export function migrate() {
    db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      state TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      locked_by TEXT,
      run_after INTEGER,
      run_at INTEGER,
      timeout_sec INTEGER,
      priority INTEGER DEFAULT 5,
      queue TEXT DEFAULT 'default',
      last_error TEXT,
      output TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS job_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT,
      timestamp TEXT,
      stdout TEXT,
      stderr TEXT
    );

    CREATE TABLE IF NOT EXISTS metrics (
      key TEXT PRIMARY KEY,
      value REAL
    );
  `);

    const insert = db.prepare(
        "INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)"
    );
    insert.run("backoff_base", "2");
    insert.run("max_retries", "3");
    insert.run("poll_interval_ms", "1000");

    const insertMetric = db.prepare(
        "INSERT OR IGNORE INTO metrics (key, value) VALUES (?, ?)"
    );
    insertMetric.run("avg_runtime_ms", 0);
}
