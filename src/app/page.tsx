'use client';

import DashboardHeader from '@/components/DashboardHeader';
import JobList from '@/components/JobList';
import StatusCards from '@/components/StatusCards';
import QuickCreate from '@/components/QuickCreate';
import Navigation from '@/components/Navigation';
import JobDetail from '@/components/JobDetail';
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
                <QuickCreate onSuccess={setSelectedJob} />
              </div>
            </div>
          )}

          {/* Bottom: System status */}
          {!selectedJobId && (
            <div className="mt-8">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">System Status</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="text-sm font-medium text-green-800">Pipeline</div>
                    <div className="mt-1 text-2xl font-bold text-green-900">Ready</div>
                    <div className="text-xs text-green-700">8 stages active</div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="text-sm font-medium text-blue-800">Binaries</div>
                    <div className="mt-1 text-2xl font-bold text-blue-900">3/3</div>
                    <div className="text-xs text-blue-700">All verified</div>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="text-sm font-medium text-purple-800">Database</div>
                    <div className="mt-1 text-2xl font-bold text-purple-900">Online</div>
                    <div className="text-xs text-purple-700">SQLite connected</div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="text-sm font-medium text-amber-800">Storage</div>
                    <div className="mt-1 text-2xl font-bold text-amber-900">OK</div>
                    <div className="text-xs text-amber-700">Free space valid</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
