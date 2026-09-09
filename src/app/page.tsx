'use client';

import DashboardHeader from '@/components/DashboardHeader';
import JobList from '@/components/JobList';
import StatusCards from '@/components/StatusCards';
import QuickCreate from '@/components/QuickCreate';
import Navigation from '@/components/Navigation';
import JobDetail from '@/components/JobDetail';
import LogViewer from '@/components/LogViewer';
import SystemStatus from '@/components/SystemStatus';
import useJobStore from '@/stores/useJobStore';

export default function DashboardPage() {
  const selectedJobId = useJobStore((state) => state.selectedJobId);
  const setSelectedJob = useJobStore((state) => state.setSelectedJob);

  return (
    <main className="min-h-screen bg-gray-50">
      <Navigation activeTab="dashboard" />
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <DashboardHeader />

          {selectedJobId ? (
            <div className="mt-8 animate-in fade-in zoom-in-95 duration-200">
              <JobDetail jobId={selectedJobId} onClose={() => setSelectedJob(null)} />
              <LogViewer jobId={selectedJobId} autoRefresh={true} maxLines={200} />
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-300">
              {/* Left column: Job list */}
              <div className="lg:col-span-2">
                <JobList onJobSelect={setSelectedJob} limit={50} />
              </div>

              {/* Right column: Sidebar */}
              <div className="space-y-6">
                {/* Status summary cards */}
                <StatusCards />

                {/* Quick create form */}
                <div id="quick-create-anchor" />
                <QuickCreate onSuccess={setSelectedJob} />
              </div>
            </div>
          )}

          {/* Bottom: System status */}
          {!selectedJobId && (
            <div className="mt-8">
              <SystemStatus />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
