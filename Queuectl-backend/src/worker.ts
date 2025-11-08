const { db } = require("./db");
const { runCommandShell } = require("./executor");
const { getConfig } = require("./config");
const { v4: uuidv4 } = require("uuid");

let shuttingDown = false;

export async function startWorkers(
    count = 1,
    queue = "default",
    concurrency = 1
) {
    const workers = [];
    for (let i = 0; i < count; i++) {
        for (let j = 0; j < concurrency; j++) {
            workers.push(loopWorker(uuidv4(), queue));
        }
    }
    return Promise.all(workers);
}

export function stopAll() {
    shuttingDown = true;
}

async function loopWorker(workerId: string, queue: string) {
    const pollInterval = parseInt(getConfig("poll_interval_ms") || "1000", 10);
    while (!shuttingDown) {
        const job = claimJob(workerId, queue);
        if (!job) {
            await new Promise((r) => setTimeout(r, pollInterval));
            continue;
        }

        console.log(
            `\n[${queue}] Worker ${workerId} started job ${job.id} (priority: ${job.priority})`
        );
        await processJob(job, queue);
    }
}

function claimJob(workerId: string, queue: string) {
    const now = Math.floor(Date.now() / 1000);
    const select = db.prepare(`
    SELECT id FROM jobs
    WHERE state='pending'
      AND queue = ?
      AND (run_after IS NULL OR run_after <= ?)
      AND (run_at IS NULL OR run_at <= ?)
    ORDER BY priority ASC, created_at ASC
    LIMIT 1
  `);
    const row = select.get(queue, now, now);
    if (!row) return null;
    console.log(`Checking jobs at ${now} (epoch) for queue ${queue}`);

    db.prepare(
        `UPDATE jobs SET state='processing', locked_by=?, updated_at=datetime('now') WHERE id=?`
    ).run(workerId, row.id);

    const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(row.id);
    console.log(`\nWorker ${workerId} claimed job ${job.id}`);
    return job;
}

async function processJob(job: any, queue: string) {
    const startTime = Date.now();
    try {
        const timeoutMs = job.timeout_sec ? job.timeout_sec * 1000 : undefined;
        const res = await runCommandShell(job.command, timeoutMs);
        const now = new Date().toISOString();

        db.prepare(
            `
      INSERT INTO job_logs (job_id, timestamp, stdout, stderr)
      VALUES (?, ?, ?, ?)
    `
        ).run(job.id, now, res.stdout, res.stderr);

        if (res.exitCode === 0) {
            db.prepare(
                `UPDATE jobs SET state='completed', output=?, updated_at=?, locked_by=NULL WHERE id=?`
            ).run(res.stdout, now, job.id);

            console.log(`[${queue}] Job ${job.id} completed successfully.`);
            updateMetrics("completed_jobs", startTime);
        } else {
            console.log(
                `[${queue}] Job ${job.id} failed (exit code ${res.exitCode}).`
            );
            handleFailure(
                job,
                res.stderr || res.stdout || `exit code ${res.exitCode}`,
                queue
            );
        }
    } catch (err) {
        console.log(
            `[${queue}] Job ${job.id} encountered an error: ${String(err)}`
        );
        handleFailure(job, String(err), queue);
    }
}

function handleFailure(job: any, lastError: string, queue: string) {
    const cfgBase = parseInt(getConfig("backoff_base") || "2", 10);
    const nowSec = Math.floor(Date.now() / 1000);
    const attempts = job.attempts + 1;

    if (attempts > job.max_retries) {
        db.prepare(
            `UPDATE jobs SET state='dead', attempts=?, last_error=?, updated_at=?, locked_by=NULL WHERE id=?`
        ).run(attempts, lastError, new Date().toISOString(), job.id);

        console.log(
            `[${queue}] Job ${job.id} moved to Dead Letter Queue after ${job.max_retries} retries.`
        );
    } else {
        const delay = Math.pow(cfgBase, attempts);
        const runAfter = nowSec + delay;
        db.prepare(
            `UPDATE jobs SET attempts=?, last_error=?, run_after=?, state='pending', updated_at=?, locked_by=NULL WHERE id=?`
        ).run(attempts, lastError, runAfter, new Date().toISOString(), job.id);

        console.log(
            `[${queue}] Job ${job.id} will retry in ${delay}s (attempt ${attempts}/${job.max_retries}).`
        );
    }
}

function updateMetrics(type: string, startTime: number) {
    const duration = Date.now() - startTime;

    if (type === "completed_jobs") {
        const prevAvg =
            db
                .prepare("SELECT value FROM metrics WHERE key='avg_runtime_ms'")
                .get()?.value || 0;
        const prevCount =
            db
                .prepare("SELECT value FROM metrics WHERE key='completed_jobs'")
                .get()?.value || 0;
        const newAvg = (prevAvg * prevCount + duration) / (prevCount + 1);
        db.prepare("UPDATE metrics SET value=? WHERE key='avg_runtime_ms'").run(
            newAvg
        );
    }
    db.prepare("UPDATE metrics SET value = value + 1 where key=?").run(type);
}
