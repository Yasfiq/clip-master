'use client';

import { useRouter } from 'next/navigation';
import useJobStore from '@/stores/useJobStore';

interface DashboardHeaderProps {
  // Title displayed in header
  title?: string;
  // Optional subtitle showing job count
  subtitle?: string;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  title = 'Clip Master Dashboard',
  subtitle = 'Local video → viral clips pipeline',
}) => {
  const router = useRouter();
  const setSelectedJob = useJobStore((s) => s.setSelectedJob);

  const handleNewJob = () => {
    setSelectedJob(null);
    const el = document.getElementById('quick-create-anchor');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    router.push('/');
    let attempts = 0;
    const poll = setInterval(() => {
      attempts += 1;
      const anchor = document.getElementById('quick-create-anchor');
      if (anchor) {
        clearInterval(poll);
        anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (attempts > 20) {
        clearInterval(poll);
      }
    }, 100);
  };

  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/settings')}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Settings
        </button>
        <button
          type="button"
          onClick={handleNewJob}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          New Job
        </button>
      </div>
    </header>
  );
};

export default DashboardHeader;
