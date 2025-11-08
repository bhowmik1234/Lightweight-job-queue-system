import { useEffect, useState } from 'react';

const API_BASE = 'http://localhost:4000';

export default function QueuectlDashboard() {
  const [metrics, setMetrics] = useState<any>(null);
  const [queues, setQueues] = useState<string[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [queueFilter, setQueueFilter] = useState<string>('');
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [pollMs, setPollMs] = useState(3000);
  const [updatingMetrics, setUpdatingMetrics] = useState(false);
  const [updatingJobs, setUpdatingJobs] = useState(false);

  async function api(path: string, opts: RequestInit = {}) {
    const res = await fetch(`${API_BASE}${path}`, opts);
    if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
    return res.json();
  }

  async function loadMetrics() {
    try {
      setUpdatingMetrics(true);
      const data = await api('/api/metrics');
      setMetrics(data);
    } catch (err) {
      console.error('Failed to load metrics:', err);
    } finally {
      setUpdatingMetrics(false);
    }
  }

  async function loadQueues() {
    try {
      const data = await api('/api/queues');
      setQueues(data);
      if (!queueFilter && data.length) setQueueFilter(data[0]);
    } catch (err) {
      console.error('Failed to load queues:', err);
    }
  }

  async function loadJobs() {
    try {
      setUpdatingJobs(true);
      const q = new URLSearchParams();
      if (stateFilter && stateFilter !== 'all') q.set('state', stateFilter);
      if (queueFilter) q.set('queue', queueFilter);
      q.set('limit', '100');
      const data = await api('/api/jobs?' + q.toString());
      setJobs(data);
    } catch (err) {
      console.error('Failed to load jobs:', err);
      setJobs([]);
    } finally {
      setUpdatingJobs(false);
    }
  }

  async function loadLogs(jobId: string) {
    try {
      const data = await api(`/api/jobs/${jobId}/logs`);
      setLogs(data);
    } catch {
      setLogs([]);
    }
  }

  async function handleRetry(jobId: string) {
    if (!confirm('Retry job ' + jobId + '?')) return;
    await api(`/api/jobs/${jobId}/retry`, { method: 'POST' });
    await loadJobs();
  }

  async function handleDelete(jobId: string) {
    if (!confirm('Delete job ' + jobId + '?')) return;
    await api(`/api/jobs/${jobId}`, { method: 'DELETE' });
    await loadJobs();
  }

  async function handlePurge(queueName: string) {
    if (!confirm('Purge queue ' + queueName + '?')) return;
    await api(`/api/queues/${queueName}/purge`, { method: 'POST' });
    await loadJobs();
    await loadMetrics();
  }

  useEffect(() => {
    loadMetrics();
    loadQueues();
    loadJobs();
    const t = setInterval(() => {
      loadMetrics();
      loadJobs();
    }, pollMs);
    return () => clearInterval(t);
  }, [stateFilter, queueFilter, pollMs]);

  useEffect(() => {
    if (selectedJob) loadLogs(selectedJob.id);
  }, [selectedJob]);

  const metricsList = [
    { label: 'Total Jobs', key: 'total_jobs', color: 'text-green-600' },
    { label: 'Completed', key: 'completed_jobs', color: 'text-green-600' },
    { label: 'Dead / Failed', key: 'dead_jobs', color: 'text-red-600' },
    { label: 'Avg Runtime (ms)', key: 'avg_runtime_ms', color: 'text-indigo-600' },
  ];

  return (
    <div className="min-h-screen bg-gray-100 text-slate-900 transition-all">
      <div className="max-w-7xl mx-auto p-3">

        {/* Header */}
        <header className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-slate-800">QueueCTL Dashboard</h1>
          <div className="flex items-center gap-3">
            <div className="text-sm flex items-center gap-1">
              Refresh Interval:
              <input
                type="number"
                value={pollMs}
                onChange={(e) => setPollMs(Number(e.target.value) || 1000)}
                className="ml-1 w-20 px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
            <button
              onClick={() => {
                loadJobs();
                loadMetrics();
              }}
              className="px-3 py-1.5 bg-slate-700 text-white rounded hover:bg-slate-800 transition"
            >
              Refresh
            </button>
          </div>
        </header>


        {/* Metrics */}
        <section className="grid grid-cols-4 gap-3 mb-5">
          {metricsList.map((m) => {
            const value = metrics?.[m.key] ?? '--';
            return (
              <div
                key={m.label}
                className="bg-white rounded-lg shadow p-3 relative overflow-hidden"
              >
                {updatingMetrics && <div className="absolute inset-0 bg-white/60 animate-pulse" />}
                <div className="text-xs text-slate-500">{m.label}</div>
                <div className={`text-xl font-bold ${m.color} transition-all duration-500`}>
                  {typeof value === 'number' ? Math.round(value) : value}
                </div>
              </div>
            );
          })}
        </section>



        {/* Filters */}
        <section className="flex flex-wrap gap-3 items-center mb-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">State</label>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            >
              {['all', 'pending', 'processing', 'completed', 'failed', 'dead'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Queue</label>
            <select
              value={queueFilter}
              onChange={(e) => setQueueFilter(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="">all</option>
              {queues.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => handlePurge(queueFilter || 'default')}
            className="ml-auto px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition text-sm"
          >
            Purge Queue
          </button>
        </section>



        {/* Jobs Table */}
        <div className="bg-white rounded-lg shadow overflow-auto relative">
          {updatingJobs && (
            <div className="absolute inset-0 bg-white/40 flex items-center justify-center text-slate-500 text-sm">
              Updating...
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                {['ID', 'Queue', 'State', 'Priority', 'Command', 'RunAfter', 'Attempts', 'CreatedAt', 'Actions'].map((h) => (
                  <th key={h} className="p-2 text-left font-medium border-b">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-500">No jobs found</td>
                </tr>
              ) : (
                jobs.map((j) => (
                  <tr
                    key={j.id}
                    className="border-b hover:bg-slate-50 transition"
                    onClick={() => setSelectedJob(j)}
                  >
                    <td className="p-2">{j.id}</td>
                    <td className="p-2">{j.queue}</td>
                    <td className="p-2">{j.state}</td>
                    <td className="p-2">{j.priority}</td>
                    <td className="p-2 max-w-sm truncate">{j.command}</td>
                    <td className="p-2">{j.run_at}</td>
                    <td className="p-2">{j.attempts}</td>
                    <td className="p-2">{new Date(j.created_at).toLocaleString()}</td>
                    <td className="p-2 space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedJob(j);
                          loadLogs(j.id);
                        }}
                        className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                      >
                        Logs
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetry(j.id);
                        }}
                        className="px-2 py-1 bg-yellow-400 rounded hover:bg-yellow-500"
                      >
                        Retry
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(j.id);
                        }}
                        className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>



        {/* Logs */}
        {selectedJob && (
          <aside className="mt-5 bg-white rounded-lg shadow p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-slate-800">
                Logs — <span className="text-slate-500">{selectedJob.id}</span>
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => { setSelectedJob(null); setLogs([]); }}
                  className="px-3 py-1 border rounded text-sm hover:bg-slate-100"
                >
                  Close
                </button>
                <button
                  onClick={() => loadLogs(selectedJob.id)}
                  className="px-3 py-1 bg-slate-700 text-white rounded hover:bg-slate-800 text-sm"
                >
                  Refresh Logs
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-500 mb-2">
              Command: <code className="text-slate-700">{selectedJob.command}</code>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 border rounded max-h-52 overflow-auto">
                <h4 className="font-semibold text-slate-700 mb-1">Stdout</h4>
                <pre className="whitespace-pre-wrap text-xs text-slate-600">
                  {logs.map((l) => l.stdout).join('\n')}
                </pre>
              </div>
              <div className="p-2 border rounded max-h-52 overflow-auto">
                <h4 className="font-semibold text-slate-700 mb-1">Stderr</h4>
                <pre className="whitespace-pre-wrap text-xs text-red-600">
                  {logs.map((l) => l.stderr).join('\n')}
                </pre>
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-400">Fetched {logs.length} log entries</div>
          </aside>
        )}
      </div>
    </div>
  );
}
