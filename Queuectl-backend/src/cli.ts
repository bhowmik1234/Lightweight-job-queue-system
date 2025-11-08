#!/usr/bin/env node
const { Command } = require("commander");
const { migrate, db } = require("./db");
const { setConfig, getConfig } = require("./config");
const job = require("./job");
const worker = require("./worker");

migrate();

const program = new Command();

program.name("queuectl").description("CLI job queue system").version("1.0.0");

// enqueue commands
program
    .command("enqueue")
    .description("Add a new job to the queue")
    .argument("<payload>", "either JSON string or raw command")
    .option("--id <id>", "custom job ID")
    .option("--max-retries <n>", "max retries", "3")
    .option(
        "--priority <n>",
        "job priority (lower = higher priority)",
        "default = 5"
    )
    .option("--timeout <sec>", "job timeout in seconds")
    .option("--run-at <timestamp>", "schedule job for later run (in seconds)")
    .option("--queue <name>", "queue name to place job into", "default")
    .action(
        (
            payload: string,
            opts: {
                id?: string;
                maxRetries?: string;
                priority?: string;
                timeout?: string;
                runAt?: string;
                queue?: string;
            }
        ) => {
            try {
                let parsed: any;
                try {
                    parsed = JSON.parse(payload);
                } catch {
                    parsed = null;
                }

                const maxRetries = parseInt(opts.maxRetries || "3", 10);
                const priority = parseInt(opts.priority || "5", 10);
                const timeoutSec = opts.timeout
                    ? parseInt(opts.timeout, 10)
                    : undefined;
                const runAt = opts.runAt ? parseInt(opts.runAt, 10) : undefined;
                const queue = opts.queue || "default";

                let jobId: string;

                if (parsed && parsed.command) {
                    jobId = job.enqueue(
                        parsed.command,
                        parsed.max_retries || maxRetries,
                        parsed.id,
                        parsed.priority || priority,
                        parsed.timeout_sec || timeoutSec,
                        parsed.run_at || runAt,
                        parsed.queue || queue
                    );
                } else {
                    jobId = job.enqueue(
                        payload,
                        maxRetries,
                        opts.id,
                        priority,
                        timeoutSec,
                        runAt,
                        queue
                    );
                }

                console.log(`Enqueued job: ${jobId}`);
                console.log(`Priority: ${priority}`);
                console.log(`Queue: ${queue}`);
            } catch (e) {
                console.error("enqueue error:", e);
            }
        }
    );

// worker commands
program
    .command("worker:start")
    .description("Start worker(s) to process jobs")
    .option("--count <n>", "number of workers", "1")
    .option("--queue <queue>", "queue name to process", "default")
    .option("--concurrency <n>", "concurrent jobs per worker", "1")
    .action(
        async (opts: {
            count?: string;
            queue?: string;
            concurrency?: string;
        }) => {
            const count = parseInt(opts.count || "1", 10);
            const concurrency = parseInt(opts.concurrency || "1", 10);
            const queue = opts.queue || "default";
            console.log(
                `Starting ${count} worker(s) on queue "${queue}" with concurrency ${concurrency}... (Ctrl+C to stop)`
            );
            await worker.startWorkers(count, queue, concurrency);
        }
    );

// job retry command
program
    .command("job:retry")
    .description("Retry a failed or dead job")
    .argument("<jobId>", "Job ID to retry")
    .action((jobId: string) => {
        const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
        if (!job) return console.log("Job not found");
        db.prepare(
            `UPDATE jobs SET state='pending', attempts=0, last_error=NULL, run_after=NULL, updated_at=? WHERE id=?`
        ).run(new Date().toISOString(), jobId);
        console.log(`Job ${jobId} moved back to pending`);
    });

// job delete command
program
    .command("job:delete")
    .description("Delete a job permanently")
    .argument("<jobId>", "Job ID to delete")
    .action((jobId: string) => {
        db.prepare("DELETE FROM jobs WHERE id = ?").run(jobId);
        console.log(`Job ${jobId} deleted`);
    });

// job purge command
program
    .command("queue:purge")
    .description("Delete all jobs from a queue")
    .argument("<queueName>", "Name of the queue to purge")
    .action((queueName: string) => {
        const count = db
            .prepare("DELETE FROM jobs WHERE queue = ?")
            .run(queueName).changes;
        console.log(`Purged ${count} jobs from queue "${queueName}"`);
    });

// job list command
program
    .command("list")
    .description("List jobs by state, queue or all jobs")
    .option(
        "--state <state>",
        "filter jobs by state (pending|processing|failed|dead|completed)"
    )
    .option("--queue <name>", "filter by queue name")
    .action((opts: { state?: string; queue?: string }) => {
        let rows;
        if (opts.state && opts.queue) {
            rows = db
                .prepare(
                    "SELECT * FROM jobs WHERE state = ? AND queue = ? ORDER BY priority ASC, created_at DESC LIMIT 50"
                )
                .all(opts.state, opts.queue);
        } else if (opts.state) {
            rows = job.listByState(opts.state);
        } else if (opts.queue) {
            rows = db
                .prepare(
                    "SELECT * FROM jobs WHERE queue = ? ORDER BY priority ASC, created_at DESC LIMIT 50"
                )
                .all(opts.queue);
        } else {
            rows = db
                .prepare(
                    "SELECT * FROM jobs ORDER BY priority ASC, created_at DESC LIMIT 50"
                )
                .all();
        }

        if (!rows.length) {
            console.log("No jobs found.");
            return;
        }
        console.table(rows);
    });

// config command
program
    .command("config:set")
    .description("Update configuration value")
    .argument("<key>", "configuration key (e.g. max-retries)")
    .argument("<value>", "value to set")
    .action((key: string, value: string) => {
        try {
            setConfig(key, value);
            console.log(`Config updated: ${key} = ${value}`);
        } catch (err) {
            console.error("Failed to set config:", err);
        }
    });

// get config data
program
    .command("config:get")
    .description("Get a configuration value")
    .argument("<key>", "configuration key")
    .action((key: string) => {
        const value = getConfig(key);
        if (value !== undefined) {
            console.log(`${key} = ${value}`);
        } else {
            console.log(`No config found for key: ${key}`);
        }
    });

    
// dlq command
program
    .command("dlq:list")
    .description("List all jobs in the Dead Letter Queue")
    .action(() => {
        const rows = db
            .prepare(
                "SELECT * FROM jobs WHERE state = 'dead' ORDER BY updated_at DESC"
            )
            .all();
        if (!rows.length) {
            console.log("Dead Letter Queue is empty.");
            return;
        }
        console.table(rows);
    });

// metrics command
program
    .command("metrics")
    .description("Show system metrics")
    .action(() => {
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
        const avgRuntime = avgRuntimeRow ? avgRuntimeRow.value.toFixed(2) : 0;

        console.table([
            { key: "Total Jobs", value: totalJobs },
            { key: "Completed Jobs", value: completedJobs },
            { key: "Dead Jobs (Failed)", value: failedJobs },
            { key: "Average Runtime (ms)", value: avgRuntime },
        ]);
    });

// job logs command
program
    .command("logs")
    .description("Show logs for a specific job")
    .argument("<jobId>", "Job ID to show logs for")
    .action((jobId: string) => {
        const rows = db
            .prepare("SELECT * FROM job_logs WHERE job_id = ? ORDER BY id ASC")
            .all(jobId);
        if (!rows.length) return console.log("No logs found for job:", jobId);
        console.table(rows);
    });

// parse CLI args
program.parseAsync(process.argv);
