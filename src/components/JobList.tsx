'use client';

import React, { useEffect, useState } from 'react';
import useJobStore from '@/stores/useJobStore';
import { useToastStore } from '@/stores/useToastStore';
import { Play, X, Film, Sparkles, RefreshCw } from 'lucide-react';

interface JobListProps {
  onJobSelect?: (jobId: string) => void;
  limit?: number;
}

const JobList: React.FC<JobListProps> = ({ onJobSelect, limit = 50 }) => {
  const jobs = useJobStore((state) => state.jobs);
  const isLoading = useJobStore((state) => state.isLoading);
  const error = useJobStore((state) => state.error);
  const updateJob = useJobStore((state) => state.updateJob);
  const setLoading = useJobStore((state) => state.setLoading);
  const addToast = useToastStore((state) => state.addToast);
  const setSelectedJob = useJobStore((state) => state.setSelectedJob);

  const [filteredJobs, setFilteredJobs] = useState<typeof jobs>([]);

  // Simulated polling - in real app would fetch from /api/jobs
  useEffect(() => {
    // Sort by createdAt descending (newest first)
    const sorted = [...jobs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    setFilteredJobs(limit ? sorted.slice(0, limit) : sorted);
  }, [jobs, limit]);

  // Real-time polling & data fetching
  useEffect(() => {
    const abortRef = { current: null as AbortController | null };
    let firstFetch = true;

    // Initial fetch
    const fetchJobs = async () => {
      if (firstFetch) setLoading(true);
      try {
        const res = await fetch(`/api/jobs?limit=${limit}`);
        const data = await res.json();
        if (data.success) {
          // Map Prisma DTO -> store Job shape (field names differ).
          const mapped = (data.data.jobs as any[]).map((j) => ({
            id: j.id,
            name: j.sourceFilename || j.sourceUrl || j.id,
            sourceUrl: j.sourceUrl ?? undefined,
            sourcePath: j.sourcePath ?? undefined,
            status: j.status,
            // progress is 0..1 in Prisma, store Job expects 0..100.
            progress: typeof j.progress === 'number' ? Math.round(j.progress * 100) : 0,
            clipsCount: j.exportedClipsCount ?? 0,
            duration: j.sourceDuration ?? undefined,
            errorCode: j.errorCode ?? undefined,
            errorMessage: j.errorMessage ?? undefined,
            createdAt: j.createdAt,
            updatedAt: j.updatedAt,
          }));
          useJobStore.getState().setJobs(mapped);
          if (data.data.counts) {
            useJobStore.getState().setServerJobCounts(data.data.counts);
          }
        }
      } catch (e) {
        console.error('Failed to fetch jobs', e);
      } finally {
        if (firstFetch) {
          firstFetch = false;
          setLoading(false);
        }
      }
    };

    fetchJobs();

    // Check for running jobs and connect SSE
    const checkSSE = () => {
      const state = useJobStore.getState();
      state.jobs.forEach((job) => {
        if (['RUNNING_PHASE1', 'RUNNING_PHASE2'].includes(job.status)) {
          state.connectSSE(job.id);
        }
      });
    };

    checkSSE();

    const interval = setInterval(() => {
      fetchJobs();
      checkSSE();
    }, 5000);

    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
      if (firstFetch) setLoading(false);
    };
  }, [limit, setLoading]);

  const isRunning = (s: string) => s === 'RUNNING_PHASE1' || s === 'RUNNING_PHASE2';
  const isCancellable = (s: string) => isRunning(s);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-amber-950/40 text-amber-300 border-amber-800/60';
      case 'RUNNING_PHASE1':
      case 'RUNNING_PHASE2':
        return 'bg-sky-950/40 text-sky-300 border-sky-800/60';
      case 'PHASE1_DONE':
        return 'bg-indigo-950/40 text-indigo-300 border-indigo-800/60';
      case 'COMPLETED':
        return 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60';
      case 'FAILED':
        return 'bg-rose-950/40 text-rose-300 border-rose-800/60';
      case 'CANCELLED':
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
      case 'REJECTED_AD':
        return 'bg-orange-950/40 text-orange-300 border-orange-800/60';
      default:
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  const formatStatus = (status: string) => {
    switch (status) {
      case 'RUNNING_PHASE1':
        return 'RUNNING P1';
      case 'RUNNING_PHASE2':
        return 'RUNNING P2';
      case 'PHASE1_DONE':
        return 'PHASE 1 DONE';
      case 'REJECTED_AD':
        return 'REJECTED (AD)';
      default:
        return status;
    }
  };

  const getProgressColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-500';
      case 'FAILED':
      case 'CANCELLED':
      case 'REJECTED_AD':
        return 'bg-rose-500';
      case 'RUNNING_PHASE1':
      case 'RUNNING_PHASE2':
        return 'bg-sky-500';
      case 'PHASE1_DONE':
        return 'bg-indigo-500';
      default:
        return 'bg-amber-500';
    }
  };

  const handleRunPhase2 = async (job: (typeof jobs)[number]) => {
    try {
      const res = await fetch(`/api/jobs/${job.id}/phase2`, { method: 'POST' });
      if (res.ok) {
        updateJob(job.id, { status: 'RUNNING_PHASE2' });
        useJobStore.getState().connectSSE(job.id);
      } else {
        const errPayload = await res.json().catch(() => ({}));
        const msg = errPayload.error?.message || `HTTP ${res.status}`;
        if (errPayload.error?.code === 'JOB_ALREADY_RUNNING') {
          addToast(
            'Job lain sedang berjalan - job ini tetap di antrean (PHASE 1 DONE).',
            'warning',
          );
        } else {
          addToast(`Gagal memulai Phase 2: ${msg}`, 'error');
          console.error('Phase 2 start failed', msg);
        }
      }
    } catch {
      // poll reconciles
    }
  };

  const handleStart = async (job: (typeof jobs)[number]) => {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      if (res.ok) {
        updateJob(job.id, { status: 'RUNNING_PHASE1' });
        useJobStore.getState().connectSSE(job.id);
      } else {
        const errPayload = await res.json().catch(() => ({}));
        const msg = errPayload.error?.message || `HTTP ${res.status}`;
        if (errPayload.error?.code === 'JOB_ALREADY_RUNNING') {
          addToast('Job lain sedang berjalan - job ini tetap di antrean (PENDING).', 'warning');
        } else {
          addToast(`Gagal memulai job: ${msg}`, 'error');
          console.error('Start failed', msg);
        }
      }
    } catch {
      // poll reconciles
    }
  };

  // "One active job" guard: only allow starting while nothing else runs.
  const hasActiveJob = jobs.some(
    (j) => j.status === 'RUNNING_PHASE1' || j.status === 'RUNNING_PHASE2',
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Baru saja';
    if (diffMins < 60) return `${diffMins}m lalu`;
    if (diffHours < 24) return `${diffHours}j lalu`;
    return `${diffDays}h lalu`;
  };

  const handleJobClick = (job: (typeof jobs)[number]) => {
    setSelectedJob(job.id);
    onJobSelect?.(job.id);
  };

  const handleCancel = async (job: (typeof jobs)[number]) => {
    try {
      const res = await fetch(`/api/jobs/${job.id}?action=cancel`, { method: 'POST' });
      if (res.ok) {
        updateJob(job.id, { status: 'CANCELLED' });
        useJobStore.getState().disconnectSSE(job.id);
      } else {
        const errPayload = await res.json().catch(() => ({}));
        const msg = errPayload.error?.message || 'Gagal membatalkan job';
        addToast(`Gagal membatalkan: ${msg}`, 'error');
      }
    } catch {
      addToast('Gagal membatalkan: kesalahan jaringan', 'error');
    }
  };

  if (isLoading && jobs.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
          Daftar Job Video
        </h2>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-zinc-800/60 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
          Daftar Job Video
        </h2>
        <div className="p-4 bg-rose-950/30 border border-rose-800/50 rounded-lg">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      </div>
    );
  }

  if (filteredJobs.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-4">
          Daftar Job Video
        </h2>
        <div className="py-12 flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-400 mb-4 shadow-inner">
            <Film className="w-7 h-7" />
          </div>
          <p className="text-zinc-200 font-semibold text-base mb-1">Belum ada job video</p>
          <p className="text-zinc-400 text-xs max-w-sm mx-auto">
            No jobs yet &bull; Create your first job to get started
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm text-zinc-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
          Daftar Job Video ({filteredJobs.length})
        </h2>
        <span className="text-xs text-zinc-400">Klik baris untuk membuka detail</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-[116px]" /> {/* Status */}
            <col /> {/* Source */}
            <col className="w-[130px]" /> {/* Progress */}
            <col className="w-[60px]" /> {/* Clips */}
            <col className="w-[90px]" /> {/* Created */}
            <col className="w-[100px]" /> {/* Actions */}
          </colgroup>
          <thead>
            <tr className="text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
              <th className="pb-2.5">Status</th>
              <th className="pb-2.5">Sumber Video</th>
              <th className="pb-2.5">Progres</th>
              <th className="pb-2.5">Klip</th>
              <th className="pb-2.5">Waktu</th>
              <th className="pb-2.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {filteredJobs.map((job) => (
              <tr
                key={job.id}
                className="hover:bg-zinc-800/50 cursor-pointer transition-colors"
                onClick={() => handleJobClick(job)}
              >
                <td className="py-3 pr-3 align-top">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getStatusColor(job.status)}`}
                  >
                    {formatStatus(job.status)}
                  </span>
                </td>
                <td className="py-3 pr-3 align-top">
                  <div
                    className="text-sm font-medium text-zinc-200 truncate"
                    title={job.sourceUrl || job.name}
                  >
                    {job.sourceUrl || job.name || '-'}
                  </div>
                  <div
                    className="font-mono text-[10px] text-zinc-500 truncate mt-0.5"
                    title={job.id}
                  >
                    {job.id}
                  </div>
                </td>
                <td className="py-3 pr-3 align-top">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${getProgressColor(job.status)}`}
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400 w-7 text-right">
                      {job.progress}%
                    </span>
                  </div>
                </td>
                <td className="py-3 pr-3 align-top text-sm font-semibold text-zinc-200">
                  {job.clipsCount || 0}
                </td>
                <td className="py-3 pr-3 align-top text-xs text-zinc-400">
                  {formatDate(job.createdAt)}
                </td>
                <td className="py-3 pl-2 align-top text-right">
                  {isCancellable(job.status) ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancel(job);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-400 border border-rose-800/60 bg-rose-950/30 rounded hover:bg-rose-900/40 hover:text-rose-300 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      <span>Batal</span>
                    </button>
                  ) : job.status === 'PHASE1_DONE' ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRunPhase2(job);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-300 border border-indigo-800/60 bg-indigo-950/40 rounded hover:bg-indigo-900/40 hover:text-indigo-200 transition-colors cursor-pointer shadow-sm"
                      title="Phase 1 selesai. Jalankan Phase 2 untuk edit, subtitle, ekspor dan kompresi."
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Run P2</span>
                    </button>
                  ) : job.status === 'PENDING' ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStart(job);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-300 border border-sky-800/60 bg-sky-950/40 rounded hover:bg-sky-900/40 hover:text-sky-200 transition-colors cursor-pointer shadow-sm"
                      title={
                        hasActiveJob
                          ? 'Job lain sedang berjalan (hanya satu job aktif dalam satu waktu)'
                          : 'Mulai Phase 1 untuk job ini'
                      }
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Mulai</span>
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-600">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-amber-950/30 border border-amber-800/50 rounded-lg">
          <p className="text-xs text-amber-300">{error}</p>
        </div>
      )}
    </div>
  );
};

export default JobList;
