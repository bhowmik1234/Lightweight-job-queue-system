const { db } = require("./db");
const { v4 } = require("uuid");

export type JobState =
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "dead";

export interface Job {
    id: string;
    command: string;
    state: JobState;
    attempts: number;
    max_retries: number;
    run_after?: number | null;
    last_error?: string | null;
    output?: string | null;
    created_at: string;
    updated_at: string;
}

export function enqueue(
    command: string,
    maxRetries = 3,
    id?: string,
    priority = 5,
    timeoutSec?: number,
    runAt?: number,
    queue = "default"
) {
    const jobId = id || v4();
    const nowSec = Math.floor(Date.now() / 1000);
    const runAtSec = runAt ? parseInt(String(runAt), 10) : nowSec;
    const stmt = db.prepare(`
    INSERT INTO jobs (id, command, state, attempts, max_retries, priority, timeout_sec, run_at, queue, created_at, updated_at)
    VALUES (?, ?, 'pending', 0, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
    stmt.run(
        jobId,
        command,
        maxRetries,
        priority,
        timeoutSec || null,
        runAtSec || null,
        queue
    );
    console.log(
        `Run At: ${runAtSec} (${new Date(runAtSec * 1000).toISOString()})`
    );
    return jobId;
}

export function listByState(state: string) {
    return db
        .prepare(`SELECT * FROM jobs WHERE state = ? ORDER BY created_at DESC`)
        .all(state);
}
