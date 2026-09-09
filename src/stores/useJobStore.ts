import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// Types from our database schema (simplified for UI)
interface Job {
  id: string;
  name: string;
  sourceUrl?: string;
  sourcePath?: string;
  status:
    | 'PENDING'
    | 'RUNNING_PHASE1'
    | 'PHASE1_DONE'
    | 'RUNNING_PHASE2'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'REJECTED_AD';
  progress: number; // 0-100
  clipsCount: number;
  duration?: number;
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
  errorMessage?: string;
}

interface Clip {
  id: string;
  jobId: string;
  startTime: number;
  endTime: number;
  duration: number;
  viralScore?: number;
  confidence?: string;
  exportPath?: string;
  thumbnailPath?: string;
  isExported: boolean;
  createdAt: string;
}

interface JobLog {
  id: string;
  jobId: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'STAGE' | 'DEBUG';
  message: string;
  stage?: string;
  metadata?: any;
}

interface JobStore {
  // State
  jobs: Job[];
  selectedJobId: string | null;
  serverJobCounts: Record<string, number> | null; // per-status counts from server (accurate regardless of loaded-job window)
  clips: Record<string, Clip[]>; // jobId -> clips[]
  logs: Record<string, JobLog[]>; // jobId -> logs[]
  lastUpdated: string;
  isLoading: boolean;
  error: string | null;

  // Actions
  setJobs: (jobs: Job[]) => void;
  addJob: (job: Job) => void;
  updateJob: (id: string, updates: Partial<Job>) => void;
  removeJob: (id: string) => void;
  setSelectedJob: (id: string | null) => void;
  setServerJobCounts: (counts: Record<string, number> | null) => void;
  setClips: (jobId: string, clips: Clip[]) => void;
  addLog: (jobId: string, log: JobLog) => void;
  setLogs: (jobId: string, logs: JobLog[]) => void;
  mergeLogs: (jobId: string, logs: JobLog[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  refresh: () => void;
  clearError: () => void;

  // SSE Connection
  activeEventSources: Record<string, EventSource>;
  connectSSE: (jobId: string) => void;
  disconnectSSE: (jobId: string) => void;

  // Computed values
  getJobCounts: () => {
    pending: number;
    running: number;
    phase1Done: number;
    completed: number;
    failed: number;
    cancelled: number;
    rejectedAd: number;
    total: number;
  };
  getSelectedJob: () => Job | null;
  getSelectedClips: () => Clip[];
  getSelectedLogs: () => JobLog[];
}

const useJobStore = create<JobStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        jobs: [],
        selectedJobId: null,
        serverJobCounts: null,
        clips: {},
        logs: {},
        activeEventSources: {},
        lastUpdated: new Date().toISOString(),
        isLoading: false,
        error: null,

        // Actions
        setJobs: (jobs) =>
          set((state) => ({
            jobs,
            lastUpdated: new Date().toISOString(),
            error: null,
          })),

        addJob: (job) =>
          set((state) => ({
            jobs: [job, ...state.jobs],
            lastUpdated: new Date().toISOString(),
          })),

        updateJob: (id, updates) =>
          set((state) => {
            const current = state.jobs.find((j) => j.id === id);
            if (current) {
              const changed = Object.entries(updates).some(([k, v]) => (current as any)[k] !== v);
              if (!changed) return state;
            }
            const countsStale = 'status' in updates && current?.status !== updates.status;
            return {
              jobs: state.jobs.map((job) => (job.id === id ? { ...job, ...updates } : job)),
              serverJobCounts: countsStale ? null : state.serverJobCounts,
              lastUpdated: new Date().toISOString(),
            };
          }),

        removeJob: (id) =>
          set((state) => ({
            jobs: state.jobs.filter((job) => job.id !== id),
            serverJobCounts: null, // cached counts include the deleted row
            lastUpdated: new Date().toISOString(),
          })),

        setSelectedJob: (id) =>
          set(() => ({
            selectedJobId: id,
            lastUpdated: new Date().toISOString(),
          })),

        setServerJobCounts: (counts) =>
          set(() => ({
            serverJobCounts: counts,
          })),

        setClips: (jobId, clips) =>
          set((state) => ({
            clips: { ...state.clips, [jobId]: clips },
            lastUpdated: new Date().toISOString(),
          })),

        addLog: (jobId, log) =>
          set((state) => ({
            logs: {
              ...state.logs,
              [jobId]: [...(state.logs[jobId] || []), log],
            },
            lastUpdated: new Date().toISOString(),
          })),

        setLogs: (jobId, logs) =>
          set((state) => ({
            logs: {
              ...state.logs,
              // Cap the in-memory buffer (SSE + REST both land here). Log
              // scrollback re-fetches by seq/timestamp from the API instead.
              [jobId]: logs.slice(-500),
            },
            lastUpdated: new Date().toISOString(),
          })),

        // Append rows deduped by id, capped at 500. Used by the SSE stream
        // handler and by the auto-refresh poll (since-cursor) so neither ever
        // replaces the whole buffer — replacing it would silently drop older
        // rows the operator may be reading.
        mergeLogs: (jobId, logs) =>
          set((state) => {
            const currentLogs = state.logs[jobId] || [];
            const known = new Set(currentLogs.map((l) => l.id));
            const fresh = (logs || []).filter((l) => l && !known.has(l.id));
            if (fresh.length === 0) return state;
            return {
              logs: {
                ...state.logs,
                [jobId]: [...currentLogs, ...fresh].slice(-500),
              },
              lastUpdated: new Date().toISOString(),
            };
          }),

        setLoading: (loading) =>
          set(() => ({
            isLoading: loading,
          })),

        setError: (error) =>
          set(() => ({
            error,
            lastUpdated: new Date().toISOString(),
          })),

        refresh: () =>
          set(() => ({
            lastUpdated: new Date().toISOString(),
          })),

        clearError: () =>
          set(() => ({
            error: null,
          })),

        connectSSE: (jobId) => {
          const state = get();
          if (state.activeEventSources[jobId]) return; // Already connected

          const eventSource = new EventSource(`/api/jobs/${jobId}/logs/stream`);
          set((s) => ({
            activeEventSources: { ...s.activeEventSources, [jobId]: eventSource },
          }));

          eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);

              if (data.type === 'status') {
                // stageProgress is 0..1 in Prisma; UI displays 0..100.
                const pct =
                  typeof data.progress === 'number' ? Math.round(data.progress * 100) : undefined;
                get().updateJob(jobId, {
                  status: data.status,
                  progress: pct,
                  clipsCount: data.clipsCount,
                  errorCode: data.errorCode ?? undefined,
                  errorMessage: data.errorMessage ?? undefined,
                });
                // A phase pause or terminal state ends the active run — close
                // the stream. The next start reconnects via checkSSE.
                const done =
                  !data.status || !['RUNNING_PHASE1', 'RUNNING_PHASE2'].includes(data.status);
                if (done) {
                  get().disconnectSSE(jobId);
                }
              } else if (data.type === 'logs') {
                // Bulk add logs; dedupe by id so a reconnecting stream that
                // replays historical rows does not duplicate entries.
                get().mergeLogs(jobId, data.logs || []);
              } else if (data.type === 'complete' || data.type === 'error') {
                // Terminal signal received — fetch the latest state from the
                // server and reconcile the store.  This is necessary when the
                // browser reconnected to a job that had already finished while
                // it was offline: the SSE stream opens but the DB status does
                // not differ from the cursor value, so no 'status' event fires
                // and the UI would stay frozen at the last persisted (stale)
                // status.
                get().disconnectSSE(jobId);
                fetch(`/api/jobs/${jobId}`)
                  .then((r) => r.json())
                  .then((payload) => {
                    if (payload.success) {
                      const j = payload.data as any;
                      get().updateJob(jobId, {
                        status: j.status,
                        progress: typeof j.progress === 'number' ? Math.round(j.progress * 100) : 0,
                        clipsCount: j.exportedClipsCount ?? 0,
                        duration: j.sourceDuration ?? undefined,
                        errorCode: j.errorCode ?? undefined,
                        errorMessage: j.errorMessage ?? undefined,
                      });
                    }
                  })
                  .catch(() => {});
              }
            } catch (e) {
              console.error('Failed to parse SSE message:', e);
            }
          };

          // Do NOT call disconnectSSE on onerror — EventSource implements
          // automatic exponential-backoff retry.  Forcing a close here would
          // prevent reconnection after a transient network blip, leaving the UI
          // stuck on a RUNNING job with no SSE and no polling (detail view has
          // no polling).  Let the browser handle retries; the 'complete' event
          // will clean up when the job finishes.
          eventSource.onerror = () => {
            // The browser will automatically attempt to reconnect.
          };

          set((state) => ({
            activeEventSources: { ...state.activeEventSources, [jobId]: eventSource },
          }));
        },

        disconnectSSE: (jobId) => {
          const state = get();
          const es = state.activeEventSources[jobId];
          if (es) {
            es.close();
            const { [jobId]: _, ...rest } = state.activeEventSources;
            set(() => ({ activeEventSources: rest }));
          }
        },

        // Computed getters
        getJobCounts: () => {
          const state = get();
          const isRunning = (s: string) => s === 'RUNNING_PHASE1' || s === 'RUNNING_PHASE2';
          return {
            pending: state.jobs.filter((j) => j.status === 'PENDING').length,
            running: state.jobs.filter((j) => isRunning(j.status)).length,
            phase1Done: state.jobs.filter((j) => j.status === 'PHASE1_DONE').length,
            completed: state.jobs.filter((j) => j.status === 'COMPLETED').length,
            failed: state.jobs.filter((j) => j.status === 'FAILED').length,
            cancelled: state.jobs.filter((j) => j.status === 'CANCELLED').length,
            rejectedAd: state.jobs.filter((j) => j.status === 'REJECTED_AD').length,
            total: state.jobs.length,
          };
        },

        getSelectedJob: () => {
          const state = get();
          if (!state.selectedJobId) return null;
          return state.jobs.find((job) => job.id === state.selectedJobId) || null;
        },

        getSelectedClips: () => {
          const state = get();
          if (!state.selectedJobId) return [];
          return state.clips[state.selectedJobId] || [];
        },

        getSelectedLogs: () => {
          const state = get();
          if (!state.selectedJobId) return [];
          return state.logs[state.selectedJobId] || [];
        },
      }),
      {
        name: 'clip-master-jobs',
        partialize: (state) => ({
          // Persist job list rows (fields stay as-is so reload shows real
          // counts/durations instead of flashing 0 until the first poll).
          jobs: state.jobs,
          selectedJobId: state.selectedJobId,
        }),
      },
    ),
    {
      name: 'JobStore',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);

export default useJobStore;
export type { Job, Clip, JobLog };
