// src/server.ts
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
import { db } from "./db";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// all jobs
app.get("/api/jobs", (req: any, res: any) => {
    try {
        const { state, queue, limit } = req.query;
        let sql = "SELECT * FROM jobs";
        const where = [];
        const params = [];

        if (state) {
            where.push("state = ?");
            params.push(state);
        }

        if (queue) {
            where.push("queue = ?");
            params.push(queue);
        }

        if (where.length) {
            sql += " WHERE " + where.join(" AND ");
        }

        sql += " ORDER BY priority ASC, created_at DESC";

        if (limit) {
            sql += " LIMIT " + parseInt(limit, 10);
        }

        const rows = db.prepare(sql).all(...params);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching jobs:", err);
        res.status(500).json({ error: "Failed to fetch jobs" });
    }
});

// all jobs with queue name
app.get("/api/queues", (req: any, res: any) => {
    try {
        const rows = db.prepare("SELECT DISTINCT queue FROM jobs").all();
        res.json(rows.map((r: any) => r.queue));
    } catch (err) {
        console.error("Error fetching queues:", err);
        res.status(500).json({ error: "Failed to fetch queues" });
    }
});

// return data metrics
app.get("/api/metrics", (req: any, res: any) => {
    try {
        const totalJobs = db
            .prepare("SELECT COUNT(*) AS count FROM jobs")
            .get().count;
        const completedJobs = db
            .prepare(
                "SELECT COUNT(*) AS count FROM jobs WHERE state = 'completed'"
            )
            .get().count;
        const failedJobs = db
            .prepare("SELECT COUNT(*) AS count FROM jobs WHERE state = 'dead'")
            .get().count;

        const avgRuntimeRow = db
            .prepare("SELECT value FROM metrics WHERE key = 'avg_runtime_ms'")
            .get();
        const avgRuntime = avgRuntimeRow
            ? Number(avgRuntimeRow.value).toFixed(2)
            : 0;

        res.json({
            total_jobs: totalJobs,
            completed_jobs: completedJobs,
            dead_jobs: failedJobs,
            avg_runtime_ms: avgRuntime,
        });
    } catch (err) {
        console.error("Error fetching metrics:", err);
        res.status(500).json({ error: "Failed to fetch metrics" });
    }
});

// reutrn log to specific id
app.get("/api/jobs/:id/logs", (req: any, res: any) => {
    try {
        const rows = db
            .prepare(
                "SELECT timestamp, stdout, stderr FROM job_logs WHERE job_id = ? ORDER BY id ASC"
            )
            .all(req.params.id);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching logs:", err);
        res.status(500).json({ error: "Failed to fetch job logs" });
    }
});

// retry failed job with id
app.post("/api/jobs/:id/retry", (req: any, res: any) => {
    try {
        const id = req.params.id;
        const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
        if (!job) return res.status(404).json({ error: "Job not found" });

        db.prepare(
            `UPDATE jobs 
       SET state = 'pending', attempts = 0, last_error = NULL, run_after = NULL, updated_at = datetime('now') 
       WHERE id = ?`
        ).run(id);

        res.json({ ok: true, message: `Job ${id} moved back to pending` });
    } catch (err) {
        console.error("Error retrying job:", err);
        res.status(500).json({ error: "Failed to retry job" });
    }
});

// delete a specific job
app.delete("/api/jobs/:id", (req: any, res: any) => {
    try {
        const id = req.params.id;
        db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
        res.json({ ok: true, message: `Job ${id} deleted` });
    } catch (err) {
        console.error("Error deleting job:", err);
        res.status(500).json({ error: "Failed to delete job" });
    }
});

// delete all jobs in queue
app.post("/api/queues/:name/purge", (req: any, res: any) => {
    try {
        const name = req.params.name;
        const info = db.prepare("DELETE FROM jobs WHERE queue = ?").run(name);
        res.json({
            deleted: info.changes,
            message: `Purged ${info.changes} jobs from ${name}`,
        });
    } catch (err) {
        console.error("Error purging queue:", err);
        res.status(500).json({ error: "Failed to purge queue" });
    }
});

// check status
app.get("/api/health", (_req: any, res: any) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const port = process.env.DASHBOARD_PORT || 4000;
app.listen(port, () =>
    console.log(`QueueCTL API server listening on port ${port}`)
);
