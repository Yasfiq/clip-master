'use client';

import useJobStore from '@/stores/useJobStore';

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
  // Prefer server-computed per-status counts (accurate even when loaded window
  // is narrower than the whole DB). Fall back to deriving from the in-memory
  // job list (e.g. while the first fetch is still pending or DB is empty).
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

  // serverJobCounts covers all statuses; use it whenever available.
  // Caller-supplied countsProp overrides always win.
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
      title: 'Pending',
      count: counts.pending || 0,
      color: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      icon: '⏳',
      description: 'Jobs waiting to start',
    },
    {
      status: 'running' as const,
      title: 'Running',
      count: counts.running || 0,
      color: 'bg-blue-50 border-blue-200 text-blue-800',
      icon: '🔄',
      description: 'Currently processing',
    },
    {
      status: 'phase1Done' as const,
      title: 'Phase 1 Done',
      count: counts.phase1Done || 0,
      color: 'bg-indigo-50 border-indigo-200 text-indigo-800',
      icon: '🟣',
      description: 'Awaiting phase 2',
    },
    {
      status: 'completed' as const,
      title: 'Completed',
      count: counts.completed || 0,
      color: 'bg-green-50 border-green-200 text-green-800',
      icon: '✅',
      description: 'Successfully finished',
    },
    {
      status: 'failed' as const,
      title: 'Failed',
      count: counts.failed || 0,
      color: 'bg-red-50 border-red-200 text-red-800',
      icon: '❌',
      description: 'Jobs with errors',
    },
  ];

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Job Status Summary</h3>
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Job Status Summary</h3>
      <div className="grid grid-cols-2 gap-4">
        {cards.slice(0, 4).map((card) => (
          <div
            key={card.status}
            className={`${card.color} border rounded-lg p-4 transition-all hover:scale-[1.02] hover:shadow-sm`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium">{card.title}</div>
                <div className="mt-1 text-2xl font-bold">{card.count}</div>
                <div className="text-xs opacity-80 mt-1">{card.description}</div>
              </div>
              <div className="text-2xl">{card.icon}</div>
            </div>
            {card.count > 0 && (
              <div className="mt-3">
                <div className="h-1 w-full bg-white rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      card.status === 'completed'
                        ? 'bg-green-600'
                        : card.status === 'running'
                          ? 'bg-blue-600'
                          : card.status === 'pending'
                            ? 'bg-yellow-600'
                            : card.status === 'phase1Done'
                              ? 'bg-indigo-600'
                              : 'bg-red-600'
                    }`}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Failed spans full width so the 2x2 stays balanced. */}
      {(() => {
        const failed = cards[4];
        return (
          <div className={`mt-4 ${failed.color} border rounded-lg p-4`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium">{failed.title}</div>
                <div className="mt-1 text-2xl font-bold">{failed.count}</div>
                <div className="text-xs opacity-80 mt-1">{failed.description}</div>
              </div>
              <div className="text-2xl">{failed.icon}</div>
            </div>
          </div>
        );
      })()}
      {(counts.cancelled ?? 0) > 0 || (counts.rejectedAd ?? 0) > 0 ? (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-500">
            Other:
            {(counts.cancelled ?? 0) > 0 && (
              <span className="inline-block ml-2">{counts.cancelled} cancelled</span>
            )}
            {(counts.rejectedAd ?? 0) > 0 && (
              <span className="inline-block ml-2">{counts.rejectedAd} rejected (ads)</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default StatusCards;
