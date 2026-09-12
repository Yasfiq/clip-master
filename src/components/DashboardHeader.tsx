'use client';

import { useRouter } from 'next/navigation';
import useJobStore from '@/stores/useJobStore';

import { Plus, SlidersHorizontal } from 'lucide-react';

interface DashboardHeaderProps {
  // Title displayed in header
  title?: string;
  // Optional subtitle showing job count
  subtitle?: string;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  title = 'Dasbor Studio',
  subtitle = 'Otomasi video panjang menjadi klip vertikal siap posting',
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
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-2">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/settings')}
          className="inline-flex items-center min-h-[44px] px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-lg shadow-sm hover:bg-zinc-800 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4 mr-2 text-zinc-400" />
          Pengaturan
        </button>
        <button
          type="button"
          onClick={handleNewJob}
          className="inline-flex items-center min-h-[44px] px-4 py-2 border border-transparent text-sm font-semibold rounded-lg shadow-sm text-zinc-950 bg-zinc-100 hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2 text-zinc-950" />
          Buat Job Baru
        </button>
      </div>
    </header>
  );
};

export default DashboardHeader;
