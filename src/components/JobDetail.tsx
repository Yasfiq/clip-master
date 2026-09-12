import React, { useEffect } from 'react';
import useJobStore from '@/stores/useJobStore';
import { useToastStore } from '@/stores/useToastStore';
import { Check, RefreshCw, Play, Sparkles, Film, Trash2, X, ArrowLeft } from 'lucide-react';

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

  // Self-heal SSE
  const running = job?.status === 'RUNNING_PHASE1' || job?.status === 'RUNNING_PHASE2';
  useEffect(() => {
    if (running) useJobStore.getState().connectSSE(jobId);
  }, [jobId, running]);

  // Reconcile once at mount
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
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-zinc-100">
        <p className="text-zinc-400 text-sm">
          Job tidak ditemukan - mungkin sudah dihapus atau belum dimuat.
        </p>
        {onClose && (
          <button
            onClick={onClose}
            className="mt-4 text-xs text-zinc-300 hover:text-zinc-100 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali ke daftar
          </button>
        )}
      </div>
    );
  }

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
    new Date(str).toLocaleString('id-ID', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

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
        return 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60';
      case 'RUNNING_PHASE1':
      case 'RUNNING_PHASE2':
        return 'bg-sky-950/60 text-sky-300 border border-sky-800/60';
      case 'FAILED':
        return 'bg-rose-950/60 text-rose-300 border border-rose-800/60';
      case 'PENDING':
        return 'bg-amber-950/60 text-amber-300 border border-amber-800/60';
      case 'PHASE1_DONE':
        return 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/60';
      case 'CANCELLED':
        return 'bg-zinc-800 text-zinc-400 border border-zinc-700';
      case 'REJECTED_AD':
        return 'bg-orange-950/60 text-orange-300 border border-orange-800/60';
      default:
        return 'bg-zinc-800 text-zinc-400 border border-zinc-700';
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
        const msg = errPayload.error?.message || 'Gagal membatalkan';
        addToast(`Gagal membatalkan: ${msg}`, 'error');
      }
    } catch {
      addToast('Gagal membatalkan: kesalahan jaringan', 'error');
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
          addToast('Job lain sedang berjalan - job ini tetap di antrean (PENDING).', 'warning');
        } else {
          addToast(`Gagal memulai: ${msg}`, 'error');
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
      const res = await fetch(`/api/jobs/${job.id}/phase2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(phase2ConfigId ? { configId: phase2ConfigId } : {}),
      });
      if (!res.ok) {
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
      } else {
        updateJob(job.id, { status: 'RUNNING_PHASE2' });
        useJobStore.getState().connectSSE(job.id);
      }
    } catch {
      // poll reconciles
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Hapus job ${job.name || job.id}? Ini akan menghapus riwayat, log, dan data klip dari dasbor. File media di disk tetap tersimpan.`,
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        const msg = errPayload.error?.message || `HTTP ${res.status}`;
        addToast(`Gagal menghapus: ${msg}`, 'error');
        return;
      }
      useJobStore.getState().disconnectSSE(job.id);
      removeJob(job.id);
      addToast('Job berhasil dihapus', 'success');
      onClose?.();
    } catch {
      addToast('Gagal menghapus: kesalahan jaringan', 'error');
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg overflow-hidden text-zinc-100">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-zinc-100 tracking-tight">
              {job.name || 'Job Tanpa Judul'}
            </h2>
            <p className="text-xs text-zinc-400 mt-1 font-mono">{job.id}</p>
          </div>
          <div className="text-right">
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                job.status,
              )}`}
            >
              {formatStatus(job.status)}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-zinc-400 mb-1.5 font-medium">
            <span>Progres Keseluruhan</span>
            <span className="font-mono text-zinc-200">{job.progress}%</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-100 rounded-full transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stage pipeline */}
      <div className="px-6 py-4 border-b border-zinc-800">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Tahapan Pipeline (Pipeline Stages)
        </h3>
        <div className="flex items-center gap-1 overflow-x-auto py-1">
          {STAGES.map((stage, idx) => {
            const status = getStageStatus(stage);
            return (
              <React.Fragment key={stage}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      status === 'completed'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-700/60'
                        : status === 'running'
                          ? 'bg-sky-950 text-sky-300 border border-sky-600 animate-pulse'
                          : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                    }`}
                    title={stage}
                  >
                    {status === 'completed' ? (
                      <Check className="w-4 h-4" />
                    ) : status === 'running' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-400 mt-1 hidden sm:block">
                    {stage.replace('_', '\n')}
                  </span>
                </div>
                {idx < STAGES.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 ${
                      getStageStatus(STAGES[idx + 1]) !== 'pending'
                        ? 'bg-emerald-500/70'
                        : 'bg-zinc-800'
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
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 bg-zinc-900/50 border-b border-zinc-800">
        <div>
          <div className="text-xs text-zinc-400">Sumber Video</div>
          <div
            className="text-sm font-medium text-zinc-200 truncate mt-0.5"
            title={job.sourceUrl || job.sourcePath}
          >
            {job.sourceUrl || job.sourcePath || '-'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-400">Klip Dihasilkan</div>
          <div className="text-sm font-bold text-zinc-100 mt-0.5">
            {job.clipsCount || jobClips.length}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-400">Durasi Video</div>
          <div className="text-sm font-medium text-zinc-200 mt-0.5">
            {job.duration ? `${job.duration.toFixed(0)} dtk` : '-'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-400">Waktu Dibuat</div>
          <div className="text-sm text-zinc-300 mt-0.5">{formatDate(job.createdAt)}</div>
        </div>
      </div>

      {/* Error message */}
      {job.errorMessage && (
        <div className="px-6 py-3.5 bg-rose-950/40 border-b border-rose-900/60">
          <div className="text-xs text-rose-400 font-semibold uppercase tracking-wider">
            Kesalahan
          </div>
          <div className="text-sm text-rose-200 mt-0.5">{job.errorMessage}</div>
          {job.errorCode && (
            <div className="text-xs text-rose-400 font-mono mt-1">Kode: {job.errorCode}</div>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-800 flex justify-between items-center flex-wrap gap-3">
        <button
          onClick={onClose}
          className="inline-flex items-center text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Kembali ke Daftar
        </button>
        <div className="flex items-center gap-2.5 flex-wrap">
          {!isRunning && (
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-950/30 hover:bg-rose-900/40 border border-rose-900/50 rounded-lg transition-colors"
              title="Hapus job dari dasbor (file media pada disk tetap tersimpan)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Job</span>
            </button>
          )}
          {['RUNNING_PHASE1', 'RUNNING_PHASE2'].includes(job.status) && (
            <button
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-300 bg-rose-950/60 border border-rose-800/80 hover:bg-rose-900/60 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Batalkan Job</span>
            </button>
          )}
          {job.status === 'PENDING' && (
            <button
              onClick={handleStart}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 bg-zinc-100 hover:bg-white rounded-lg transition-colors shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current text-zinc-950" />
              <span>Mulai Job</span>
            </button>
          )}
          {job.status === 'PHASE1_DONE' && (
            <div className="flex items-center gap-2">
              {p2Configs.length > 1 ? (
                <select
                  value={phase2ConfigId}
                  onChange={(e) => setPhase2ConfigId(e.target.value)}
                  className="text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                >
                  <option value="">Sama dengan Phase 1</option>
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
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-indigo-200 bg-indigo-950/60 border border-indigo-700/80 hover:bg-indigo-900/60 rounded-lg transition-colors shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
                <span>Jalankan Phase 2</span>
              </button>
            </div>
          )}
          {job.status === 'COMPLETED' && job.clipsCount > 0 && (
            <a
              href={`/clips?job=${encodeURIComponent(job.id)}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-emerald-200 bg-emerald-950/60 border border-emerald-700/80 hover:bg-emerald-900/60 rounded-lg transition-colors shadow-sm"
            >
              <Film className="w-3.5 h-3.5 text-emerald-300" />
              <span>Lihat Klip Video</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default JobDetail;
