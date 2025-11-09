<h1>Queuectl — CLI Job Queue System</h1>

A lightweight and easy-to-use job queue system built with TypeScript. It keeps all your jobs safe using SQLite, so even if your app crashes or restarts, nothing gets lost. It’s simple but reliable — you can set how many times a job should retry, run multiple workers at the same time, and handle failed jobs automatically.

There’s also a small web dashboard where you can see what’s going on in real-time — like how many jobs finished, failed, or how long they usually take. Plus, it comes with a clean CLI tool, so you can quickly add, run, or check jobs right from your terminal.

<hr>

### Features

✅ **Persistent Job Storage** — jobs are stored in SQLite and survive restarts<br>
✅ Multiple Worker Support — run multiple workers in parallel for higher throughput<br>
✅ Queue-based Job Management — jobs can be added and processed from specific queues (e.g., “emails”, “critical”)<br>
✅ Job Priority System — execute jobs based on priority (lower number = higher priority)<br>
✅ Retry Mechanism — failed jobs are automatically retried and set to pending<br>
✅ Exponential Backoff — retry delays increase exponentially: delay = base ^ attempts<br>
✅ Dead Letter Queue — jobs exceeding max retries are moved to a dead state for review<br>
✅ Job Scheduling (run-at) — schedule jobs to run at specific future timestamps<br>
✅ Job Timeout Handling — automatically fails jobs that exceed the given timeout duration<br>
✅ Job Inspection & Management — inspect, retry, delete, and purge jobs via CLI<br>
✅ Worker Concurrency Control — control how many jobs each worker can process simultaneously<br>
✅ Dynamic Queue Selection — start workers for specific queues with flexible concurrency<br>
✅ Graceful Shutdown — workers complete current jobs before stopping safely<br>
✅ Configuration Management — update runtime settings using config:set and config:get commands<br>

<hr>
<br>

### System Requirements

| Component  | Requirement                  |
| ---------- | ---------------------------- |
| Node.js    | v20.xx.x                     |
| NPM        | >= 9.x                       |
| SQLite     | Built-in (no setup required) |
| TypeScript | Used for development         |

<hr>
<br>

### Installation

#### 1. Clone this repository

```bash
git clone https://github.com/bhowmik1234/queuectl.git
```

#### 2. Install dependencies

```bash
cd Queuectl-backend 
npm install
cd Queuectl-frontend
npm install
```
### If got error; use nodejs 20
```bash
nvm install 20
nvm use 20
```

#### 3. Build the TypeScript project

```bash
cd Queuectl-backend
npm run build
```

#### 4. Link the CLI (optional)

```bash
npm link
```

#### Now you can run the command globally using:

```bash
queuectl
```

<hr>
<br>

### Environment Variables (.env)(backend)

```bash
DB_PATH=./queuectl.db  // Path to SQLite database filě
```

<br>

## Run Backend server

```bash
cd Queuectl-backend
npx ts-node src/server.ts
```

## Run Frontend server

```bash
cd Queuectl-frontend
npm run dev
```

##### Now run the queuectl worker:start and all other commands

<br>
<h2>CLI Commands</h2>

#### 1. Enqueue commands

```bash
queuectl enqueue <payload>
```

| Option                 | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `--id <id>`            | Custom job ID                                  |
| `--max-retries <n>`    | Max retry count (default: 3)                   |
| `--priority <n>`       | Priority (default: 5; lower = higher priority) |
| `--timeout <sec>`      | Timeout in seconds                             |
| `--run-at <timestamp>` | Schedule job for later (epoch seconds)         |

<hr>

#### 2. Start Workers

```bash
queuectl worker:start <options>
```

| Option              | Description                             |
| ------------------- | --------------------------------------- |
| `--count <n>`       | Number of worker processes (default: 1) |
| `--queue <queue>`   | Queue name (default: “default”)         |
| `--concurrency <n>` | Parallel jobs per worker (default: 1)   |

<hr>

#### 3. List Jobs

```bash
queuectl list
```

| Option            | Description                                                        |
| ----------------- | ------------------------------------------------------------------ |
| `--state <state>` | Filter by job state (pending, processing, failed, dead, completed) |

<hr>

#### 4. Retry failed job

```bash
queuectl job:retry <jobId>
```

<hr>

#### 5. Delete job

```bash
queuectl job:delete <jobId>
```

<hr>

#### 6. Delete all job with queue name

```bash
queuectl queue:purge <queueName>
```

<hr>

#### 7. Updates configuration values

```bash
queuectl config:set <key, value>
```

| Option (key, value)      | Description                      |
| ------------------------ | -------------------------------- |
| `backoff_base <int>`     | Retry backoff factor (default 2) |
| `max_retries <int>`      | Default retry limit              |
| `poll_interval_ms <int>` | Worker polling delay             |

<hr>

#### 8. Lists all “dead” jobs

```bash
queuectl dlq:list
```

<hr>

#### 9. Displays system metrics.

```bash
queuectl metrics
```

| key            | value |
| -------------- | ----- |
| completed_jobs | 12    |
| failed_jobs    | 3     |
| avg_runtime_ms | 480   |

<hr>

#### 10. Shows logs for a specific job.

```bash
queuectl logs <jobId>
```

<br>

## Examples

```bash
// enqueue
queuectl enqueue "echo 'Hello World'"
queuectl enqueue "ls -la" --queue emails --priority 2
queuectl enqueue "sleep 2 && echo Done" --queue critical --timeout 5
queuectl enqueue "echo low" --priority 5
queuectl enqueue "echo high" --priority 1
queuectl enqueue "sleep 10" --timeout 2
queuectl enqueue "echo future_job" --run-at $(($(date +%s)+<addTimeToRun>))  // addTimeToRun=10s, 20s, 300s, etc..




// start worker
queuectl worker:start
queuectl worker:start --concurrency 2
queuectl worker:start --queue "emails"
queuectl worker:start --queue "critical" --concurrency 3


// retry jobs
queuectl enqueue "exit 1" --max-retries 2
queuectl worker:start
queuectl job:retry <jobId>


// purge email
queuectl queue:purge emails


// delete job
queuectl job:delete <jobId>

// config values
queuectl config:set poll_interval_ms 2000
queuectl metrics


// check job status
queuectl list --state dead

// check dead jobs
queuectl dlq:list

// system metrics
queuectl metrics


// check job logs
queuectl log <jobId>

```
