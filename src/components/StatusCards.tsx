import React from 'react';
import useJobStore from '@/stores/useJobStore';
import { Clock, RefreshCw, Sparkles, CheckCircle2, XCircle } from 'lucide-react';

interface JobCounts {
  pending: number;
  running: number;
  phase1Done: number;
  completed: number;
  failed: number;
  cancelled: number;
  rejectedAd: number;
}

interface StatusCardsProps {
  counts?: Partial<JobCounts>;
  loading?: boolean;
}

const EMPTY_COUNTS: JobCounts = {
  pending: 0,
  running: 0,
  phase1Done: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  rejectedAd: 0,
};

const StatusCards: React.FC<StatusCardsProps> = ({ counts: countsProp, loading = false }) => {
  const serverCounts = useJobStore((state) => state.serverJobCounts);
  const jobs = useJobStore((state) => state.jobs);

  const isRunning = (s: string) => s === 'RUNNING_PHASE1' || s === 'RUNNING_PHASE2';

  const derived: JobCounts =
    jobs.length > 0
      ? {
          pending: jobs.filter((j) => j.status === 'PENDING').length,
          running: jobs.filter((j) => isRunning(j.status)).length,
          phase1Done: jobs.filter((j) => j.status === 'PHASE1_DONE').length,
          completed: jobs.filter((j) => j.status === 'COMPLETED').length,
          failed: jobs.filter((j) => j.status === 'FAILED').length,
          cancelled: jobs.filter((j) => j.status === 'CANCELLED').length,
          rejectedAd: jobs.filter((j) => j.status === 'REJECTED_AD').length,
        }
      : EMPTY_COUNTS;

  const server: JobCounts = {
    ...EMPTY_COUNTS,
    pending: (serverCounts && (serverCounts['PENDING'] ?? 0)) || 0,
    running:
      (serverCounts &&
        (serverCounts['RUNNING_PHASE1'] ?? 0) + (serverCounts['RUNNING_PHASE2'] ?? 0)) ||
      0,
    phase1Done: (serverCounts && (serverCounts['PHASE1_DONE'] ?? 0)) || 0,
    completed: (serverCounts && (serverCounts['COMPLETED'] ?? 0)) || 0,
    failed: (serverCounts && (serverCounts['FAILED'] ?? 0)) || 0,
    cancelled: (serverCounts && (serverCounts['CANCELLED'] ?? 0)) || 0,
    rejectedAd: (serverCounts && (serverCounts['REJECTED_AD'] ?? 0)) || 0,
  };
  const base = serverCounts ? server : derived;
  const counts = { ...EMPTY_COUNTS, ...base, ...countsProp };

  const cards = [
    {
      status: 'pending' as const,
      title: 'Menunggu',
      count: counts.pending || 0,
      badgeColor: 'text-amber-400 border-amber-800/50 bg-amber-950/30',
      icon: Clock,
      description: 'Antrean job',
    },
    {
      status: 'running' as const,
      title: 'Diproses',
      count: counts.running || 0,
      badgeColor: 'text-sky-400 border-sky-800/50 bg-sky-950/30',
      icon: RefreshCw,
      description: 'Sedang berjalan',
      isSpinning: (counts.running || 0) > 0,
    },
    {
      status: 'phase1Done' as const,
      title: 'Phase 1',
      count: counts.phase1Done || 0,
      badgeColor: 'text-indigo-400 border-indigo-800/50 bg-indigo-950/30',
      icon: Sparkles,
      description: 'Siap Phase 2',
    },
    {
      status: 'completed' as const,
      title: 'Selesai',
      count: counts.completed || 0,
      badgeColor: 'text-emerald-400 border-emerald-800/50 bg-emerald-950/30',
      icon: CheckCircle2,
      description: 'Klip terekspor',
    },
    {
      status: 'failed' as const,
      title: 'Gagal',
      count: counts.failed || 0,
      badgeColor: 'text-rose-400 border-rose-800/50 bg-rose-950/30',
      icon: XCircle,
      description: 'Perlu dicek',
    },
  ];

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="h-5 w-32 bg-zinc-800 rounded mb-4 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-zinc-800/60 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
          Ringkasan Status
        </h3>
        <span className="text-xs text-zinc-400">
          Total: {Object.values(counts).reduce((a, b) => a + b, 0)} job
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.status}
              className={`p-3 rounded-lg border transition-all ${card.badgeColor} ${
                card.status === 'failed' ? 'col-span-2 sm:col-span-1' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-1.5">
                <span className="text-xs font-medium text-zinc-300">{card.title}</span>
                <Icon className={`w-4 h-4 shrink-0 ${card.isSpinning ? 'animate-spin' : ''}`} />
              </div>
              <div className="mt-1.5 text-xl font-bold text-zinc-100">{card.count}</div>
              <div className="text-[11px] text-zinc-400 mt-0.5 truncate">{card.description}</div>
            </div>
          );
        })}
      </div>

      {((counts.cancelled ?? 0) > 0 || (counts.rejectedAd ?? 0) > 0) && (
        <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center gap-3 text-xs text-zinc-400">
          {(counts.cancelled ?? 0) > 0 && <span>{counts.cancelled} dibatalkan</span>}
          {(counts.rejectedAd ?? 0) > 0 && <span>{counts.rejectedAd} ditolak iklan</span>}
        </div>
      )}
    </div>
  );
};

export default StatusCards;
