'use client';

import React, { useEffect } from 'react';
import useJobStore from '@/stores/useJobStore';
import { useToastStore } from '@/stores/useToastStore';

interface JobDetailProps {
  jobId: string;
  onClose?: () => void;
}

const STAGES = [
  'DISCOVER',
  'AD_FILTER',
  'TRANSCRIBE',
  'ANALYZE',
  'CUT',
  'EDIT',
  'SUBTITLE',
  'EXPORT',
  'COMPRESS',
] as const;

type Stage = (typeof STAGES)[number];

const STAGE_ORDER: Record<Stage, number> = {
  DISCOVER: 1,
  AD_FILTER: 2,
  TRANSCRIBE: 3,
  ANALYZE: 4,
  CUT: 5,
  EDIT: 6,
  SUBTITLE: 7,
  EXPORT: 8,
  COMPRESS: 9,
};

const JobDetail: React.FC<JobDetailProps> = ({ jobId, onClose }) => {
  const jobs = useJobStore((s) => s.jobs);
  const clips = useJobStore((s) => s.clips);
  const [phase2ConfigId, setPhase2ConfigId] = React.useState<string>('');
  const [p2Configs, setP2Configs] = React.useState<
    Array<{ id: string; name: string; isDefault: boolean }>
  >([]);
  const updateJob = useJobStore((s) => s.updateJob);
  const removeJob = useJobStore((s) => s.removeJob);
  const job = jobs.find((j) => j.id === jobId);
  const jobClips = clips[jobId] || [];
  const addToast = useToastStore((s) => s.addToast);

  // Self-heal SSE: JobList owns the reconnect loop, but it unmounts while the
  // detail view is open. After a page reload with this job selected (or after
  // any missed reconnect), nothing would poll it — status/progress would stay
  // frozen forever. Connect whenever the watched job is mid-run; connectSSE is
  // idempotent, and the stream's terminal/status event disconnects itself.
  const running = job?.status === 'RUNNING_PHASE1' || job?.status === 'RUNNING_PHASE2';
  useEffect(() => {
    if (running) useJobStore.getState().connectSSE(jobId);
  }, [jobId, running]);

  // Reconcile once at mount: the persisted store can hold a stale RUNNING_*
  // status while the server row already moved on (job finished or paused
  // while the browser was closed). The SSE stream opens with its cursor at
  // the CURRENT server state, so no 'status' event fires for the drift —
  // only this fetch corrects the frozen UI.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/jobs/${jobId}`)
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled || !payload.success) return;
        const j = payload.data as any;
        useJobStore.getState().updateJob(jobId, {
          status: j.status,
          progress: typeof j.progress === 'number' ? Math.round(j.progress * 100) : 0,
          clipsCount: j.exportedClipsCount ?? 0,
          duration: j.sourceDuration ?? undefined,
          errorCode: j.errorCode ?? undefined,
          errorMessage: j.errorMessage ?? undefined,
        });
        // Server no longer mid-run: close the stream we may have opened based
        // on the stale persisted status (a PHASE1_DONE/terminal SSE never ends
        // on its own and would idle-poll forever).
        const serverRunning = j.status === 'RUNNING_PHASE1' || j.status === 'RUNNING_PHASE2';
        if (!serverRunning) {
          useJobStore.getState().disconnectSSE(jobId);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  // Reset P2 config selection when the watched job changes. JobDetail is
  // reused across job switches (same component type in page.tsx), so the
  // local select state would otherwise leak from job A onto job B — silently
  // applying job A's chosen config to job B's phase 2.
  const isPhase1Done = job?.status === 'PHASE1_DONE';
  useEffect(() => {
    setPhase2ConfigId('');
    if (!isPhase1Done) {
      setP2Configs([]);
      return;
    }
    let cancelled = false;
    fetch('/api/config')
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled || !payload.success) return;
        const list = (payload.data || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          isDefault: !!c.isDefault,
        }));
        setP2Configs(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [jobId, isPhase1Done]);

  if (!job) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <p className="text-gray-500">
          Job not found — it may have been deleted or is not loaded yet.
        </p>
        {onClose && (
          <button onClick={onClose} className="mt-4 text-sm text-blue-600 hover:text-blue-800">
            ← Back to list
          </button>
        )}
      </div>
    );
  }

  // Map a 0..100 progress value onto the stage that owns it (progress here
  // is the normalized store value, not the raw Prisma 0..1 one). Phase 1
  // occupies 0..60 across 5 stages, Phase 2 occupies 60..100 across 4.
  // Stage boundaries follow the orchestrator's equal-span split, NOT equal
  // thirds: each of the 5 P1 stages gets 0.12 of global (0..0.6), each of
  // the 4 P2 stages gets 0.1 (0.6..1.0).
  const stageAtProgress = (progress: number): Stage => {
    if (progress >= 100) return 'COMPRESS';
    const P1: Stage[] = ['DISCOVER', 'AD_FILTER', 'TRANSCRIBE', 'ANALYZE', 'CUT'];
    const P2: Stage[] = ['EDIT', 'SUBTITLE', 'EXPORT', 'COMPRESS'];
    if (progress < 60) {
      const idx = Math.min(P1.length - 1, Math.floor((progress / 60) * P1.length));
      return P1[idx];
    }
    const idx = Math.min(P2.length - 1, Math.floor(((progress - 60) / 40) * P2.length));
    return P2[idx];
  };

  const isRunning = job.status === 'RUNNING_PHASE1' || job.status === 'RUNNING_PHASE2';
  const currentStage = isRunning ? stageAtProgress(job.progress) : null;

  const formatDate = (str: string) =>
    new Date(str).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  // Terminal / paused states: phase history stays visible so operators can
  // tell how far a job got. Phase 1 caps at CUT, Phase 2 at COMPRESS.
  const PHASE1_END: Stage = 'CUT';
  const PHASE2_END: Stage = 'COMPRESS';

  const getStageStatus = (stage: Stage) => {
    if (!currentStage) {
      if (job.status === 'COMPLETED') {
        return STAGE_ORDER[stage] <= STAGE_ORDER[PHASE2_END] ? 'completed' : 'pending';
      }
      if (job.status === 'PHASE1_DONE') {
        return STAGE_ORDER[stage] <= STAGE_ORDER[PHASE1_END] ? 'completed' : 'pending';
      }
      if (job.status === 'FAILED' || job.status === 'CANCELLED' || job.status === 'REJECTED_AD') {
        // Show how far the job got using its recorded progress.
        // errorCode gates only FAILED; CANCELLED and REJECTED_AD always have
        // a recorded progress even without an error code.
        const failedAt = stageAtProgress(job.progress);
        return STAGE_ORDER[stage] <= STAGE_ORDER[failedAt] ? 'completed' : 'pending';
      }
      return 'pending';
    }
    const currentNum = STAGE_ORDER[currentStage];
    const stageNum = STAGE_ORDER[stage];
    if (stageNum < currentNum) return 'completed';
    if (stageNum === currentNum) return 'running';
    return 'pending';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'RUNNING_PHASE1':
      case 'RUNNING_PHASE2':
        return 'bg-blue-100 text-blue-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'PHASE1_DONE':
        return 'bg-indigo-100 text-indigo-800';
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-800';
      case 'REJECTED_AD':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleCancel = async () => {
    try {
      const res = await fetch(`/api/jobs/${job.id}?action=cancel`, { method: 'POST' });
      if (res.ok) {
        useJobStore.getState().disconnectSSE(job.id);
        updateJob(job.id, { status: 'CANCELLED' });
        onClose?.();
      } else {
        const errPayload = await res.json().catch(() => ({}));
        const msg = errPayload.error?.message || 'Failed to cancel';
        addToast(`Cancel failed: ${msg}`, 'error');
      }
    } catch {
      addToast('Cancel failed: network error', 'error');
    }
  };

  const handleStart = async () => {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        const msg = errPayload.error?.message || `HTTP ${res.status}`;
        if (errPayload.error?.code === 'JOB_ALREADY_RUNNING') {
          addToast('Another job is running — this job stays queued (PENDING).', 'warning');
        } else {
          addToast(`Start failed: ${msg}`, 'error');
          console.error('Start failed', msg);
        }
      } else {
        updateJob(job.id, { status: 'RUNNING_PHASE1' });
        useJobStore.getState().connectSSE(job.id);
      }
    } catch {
      // poll reconciles
    }
  };

  const handleRunPhase2 = async () => {
    try {
      // Optional config swap: when a specific config is selected, startPhase2
      // persists the new configId on the job row; the phase-2 runner re-fetches
      // the row (with fresh config) before each stage. Empty string = keep the
      // config phase 1 used (no swap).
      const res = await fetch(`/api/jobs/${job.id}/phase2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(phase2ConfigId ? { configId: phase2ConfigId } : {}),
      });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        const msg = errPayload.error?.message || `HTTP ${res.status}`;
        if (errPayload.error?.code === 'JOB_ALREADY_RUNNING') {
          addToast('Another job is running — this job stays queued (PHASE 1 DONE).', 'warning');
        } else {
          addToast(`Phase 2 start failed: ${msg}`, 'error');
          console.error('Phase 2 start failed', msg);
        }
      } else {
        updateJob(job.id, { status: 'RUNNING_PHASE2' });
        useJobStore.getState().connectSSE(job.id);
      }
    } catch {
      // poll reconciles
    }
  };

  const handleDelete = async () => {
    // Destructive, irreversible: confirm with the operator before any fetch.
    const confirmed = window.confirm(
      `Delete job ${job.name || job.id}? This removes its history, logs, and clip records from the dashboard. Media files already on disk are left in place.`,
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        const msg = errPayload.error?.message || `HTTP ${res.status}`;
        addToast(`Delete failed: ${msg}`, 'error');
        return;
      }
      useJobStore.getState().disconnectSSE(job.id);
      removeJob(job.id);
      addToast(`Job deleted`, 'success');
      onClose?.();
    } catch {
      addToast('Delete failed: network error', 'error');
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

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{job.name || 'Unnamed Job'}</h2>
            <p className="text-sm text-blue-100 mt-1 font-mono">{job.id}</p>
          </div>
          <div className="text-right">
            <span
              className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                job.status,
              )}`}
            >
              {formatStatus(job.status)}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-sm text-blue-100 mb-1">
            <span>Progress</span>
            <span>{job.progress}%</span>
          </div>
          <div className="h-2 bg-blue-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stage pipeline */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Pipeline Stages</h3>
        <div className="flex items-center gap-1 overflow-x-auto py-1">
          {STAGES.map((stage, idx) => {
            const status = getStageStatus(stage);
            return (
              <React.Fragment key={stage}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      status === 'completed'
                        ? 'bg-green-500 text-white'
                        : status === 'running'
                          ? 'bg-blue-500 text-white animate-pulse'
                          : 'bg-gray-200 text-gray-500'
                    }`}
                    title={stage}
                  >
                    {status === 'completed' ? '✓' : status === 'running' ? '●' : idx + 1}
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 hidden sm:block">
                    {stage.replace('_', '\n')}
                  </span>
                </div>
                {idx < STAGES.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 ${
                      getStageStatus(STAGES[idx + 1]) !== 'pending' ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                    style={{ minWidth: '8px' }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Details grid */}
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-gray-500">Source</div>
          <div className="text-sm font-medium text-gray-900 truncate">
            {job.sourceUrl || job.sourcePath || '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Clips Generated</div>
          <div className="text-sm font-bold text-gray-900">{job.clipsCount || jobClips.length}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Duration</div>
          <div className="text-sm text-gray-900">
            {job.duration ? `${job.duration.toFixed(0)}s` : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Created</div>
          <div className="text-sm text-gray-900">{formatDate(job.createdAt)}</div>
        </div>
      </div>

      {/* Error message */}
      {job.errorMessage && (
        <div className="px-6 py-3 bg-red-50 border-t border-red-200">
          <div className="text-xs text-red-700 font-medium">Error</div>
          <div className="text-sm text-red-800">{job.errorMessage}</div>
          {job.errorCode && <div className="text-xs text-red-600 mt-1">Code: {job.errorCode}</div>}
        </div>
      )}

      {/* Footer actions */}
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center flex-wrap gap-2">
        <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-900">
          ← Back to list
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {!isRunning && (
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
              title="Remove job from dashboard (media files on disk are kept)"
            >
              🗑 Delete job
            </button>
          )}
          {['RUNNING_PHASE1', 'RUNNING_PHASE2'].includes(job.status) && (
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
            >
              Cancel Job
            </button>
          )}
          {job.status === 'PENDING' && (
            <button
              onClick={handleStart}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              ▶ Start Job
            </button>
          )}
          {job.status === 'PHASE1_DONE' && (
            <div className="flex items-center gap-2">
              {p2Configs.length > 1 ? (
                <select
                  value={phase2ConfigId}
                  onChange={(e) => setPhase2ConfigId(e.target.value)}
                  className="text-sm border border-gray-200 rounded px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Same as Phase 1</option>
                  {p2Configs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                onClick={handleRunPhase2}
                className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                Run Phase 2 →
              </button>
            </div>
          )}
          {job.status === 'COMPLETED' && job.clipsCount > 0 && (
            <a
              href={`/clips?job=${encodeURIComponent(job.id)}`}
              className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            >
              View Clips →
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default JobDetail;
