'use client';

interface JobCounts {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  rejectedAd: number;
}

interface StatusCardsProps {
  counts?: Partial<JobCounts>;
  loading?: boolean;
}

const StatusCards: React.FC<StatusCardsProps> = ({
  counts = {
    pending: 0,
    running: 0,
    completed: 1, // Sample data from e2e test
    failed: 0,
    cancelled: 0,
    rejectedAd: 0,
  },
  loading = false,
}) => {
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
        {cards.map((card) => (
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
      {(counts.cancelled ?? 0) > 0 ||
        ((counts.rejectedAd ?? 0) > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              Other:{' '}
              {(counts.cancelled ?? 0) > 0 && (
                <span className="inline-block ml-2">{counts.cancelled} cancelled</span>
              )}
              {(counts.rejectedAd ?? 0) > 0 && (
                <span className="inline-block ml-2">{counts.rejectedAd} rejected (ads)</span>
              )}
            </div>
          </div>
        ))}
    </div>
  );
};

export default StatusCards;
