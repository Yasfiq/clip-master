import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// Types from our database schema (simplified for UI)
interface Job {
  id: string;
  name: string;
  sourceUrl?: string;
  sourcePath?: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REJECTED_AD';
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
  setClips: (jobId: string, clips: Clip[]) => void;
  addLog: (jobId: string, log: JobLog) => void;
  setLogs: (jobId: string, logs: JobLog[]) => void;
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
          set((state) => ({
            jobs: state.jobs.map((job) => (job.id === id ? { ...job, ...updates } : job)),
            lastUpdated: new Date().toISOString(),
          })),

        removeJob: (id) =>
          set((state) => ({
            jobs: state.jobs.filter((job) => job.id !== id),
            lastUpdated: new Date().toISOString(),
          })),

        setSelectedJob: (id) =>
          set(() => ({
            selectedJobId: id,
            lastUpdated: new Date().toISOString(),
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
            logs: { ...state.logs, [jobId]: logs },
            lastUpdated: new Date().toISOString(),
          })),

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

          eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);

              if (data.type === 'status') {
                get().updateJob(jobId, {
                  status: data.status,
                  progress: data.progress,
                  clipsCount: data.clipsCount,
                  errorCode: data.errorCode,
                });
              } else if (data.type === 'logs') {
                // Bulk add logs
                const currentLogs = get().logs[jobId] || [];
                get().setLogs(jobId, [...currentLogs, ...data.logs]);
              } else if (data.type === 'complete' || data.type === 'error') {
                get().disconnectSSE(jobId);
              }
            } catch (e) {
              console.error('Failed to parse SSE message:', e);
            }
          };

          eventSource.onerror = () => {
            get().disconnectSSE(jobId);
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
          return {
            pending: state.jobs.filter((j) => j.status === 'PENDING').length,
            running: state.jobs.filter((j) => j.status === 'RUNNING').length,
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
          // Only persist job metadata, not logs/clips (can be large)
          jobs: state.jobs.map(({ clipsCount, duration, ...keep }) => keep),
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
