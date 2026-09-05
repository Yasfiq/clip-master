'use client';

import React, { useEffect, useState } from 'react';
import useJobStore from '@/stores/useJobStore';

interface JobListProps {
  onJobSelect?: (jobId: string) => void;
  limit?: number;
}

const JobList: React.FC<JobListProps> = ({ onJobSelect, limit = 50 }) => {
  const jobs = useJobStore((state) => state.jobs);
  const isLoading = useJobStore((state) => state.isLoading);
  const error = useJobStore((state) => state.error);
  const updateJob = useJobStore((state) => state.updateJob);
  const setSelectedJob = useJobStore((state) => state.setSelectedJob);
  const lastUpdated = useJobStore((state) => state.lastUpdated);

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
    // Initial fetch
    const fetchJobs = async () => {
      try {
        const res = await fetch(`/api/jobs?limit=${limit}`);
        const data = await res.json();
        if (data.success) {
          // Map Prisma DTO -> store Job shape (field names differ).
          const mapped = (data.data.jobs as any[]).map((j) => ({
            id: j.id,
            name: j.sourceFilename || j.sourceUrl || j.id,
            sourceUrl: j.sourceUrl ?? undefined,
            status: j.status,
            // progress is 0..1 in Prisma, store Job expects 0..100.
            progress: typeof j.progress === 'number' ? Math.round(j.progress * 100) : 0,
            clipsCount: j.exportedClipsCount ?? 0,
            duration: j.sourceDuration ?? undefined,
            createdAt: j.createdAt,
            updatedAt: j.updatedAt,
          }));
          useJobStore.getState().setJobs(mapped);
        }
      } catch (e) {
        console.error('Failed to fetch jobs', e);
      }
    };

    fetchJobs();

    // Check for running jobs and connect SSE
    const checkSSE = () => {
      const state = useJobStore.getState();
      state.jobs.forEach((job) => {
        if (job.status === 'RUNNING' || job.status === 'PENDING') {
          state.connectSSE(job.id);
        }
      });
    };

    checkSSE();

    const interval = setInterval(() => {
      fetchJobs();
      checkSSE();
    }, 5000);

    return () => clearInterval(interval);
  }, [limit]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'RUNNING':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'COMPLETED':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'FAILED':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'REJECTED_AD':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getProgressColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-500';
      case 'FAILED':
      case 'CANCELLED':
      case 'REJECTED_AD':
        return 'bg-red-500';
      case 'RUNNING':
        return 'bg-blue-500';
      default:
        return 'bg-yellow-500';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const formatDuration = (seconds: number | undefined) => {
    if (!seconds) return '—';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleJobClick = (job: (typeof jobs)[number]) => {
    setSelectedJob(job.id);
    onJobSelect?.(job.id);
  };

  const handleCancel = async (job: (typeof jobs)[number]) => {
    // Call API to cancel job
    try {
      const res = await fetch(`/api/jobs/${job.id}/cancel`, { method: 'POST' });
      if (res.ok) {
        updateJob(job.id, { status: 'CANCELLED' });
      }
    } catch {
      // Handle error
    }
  };

  if (isLoading && jobs.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Jobs</h2>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Jobs</h2>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  if (filteredJobs.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Jobs</h2>
        <div className="py-12">
          <div className="text-6xl mb-4">📋</div>
          <p className="text-gray-500 text-lg mb-2">No jobs yet</p>
          <p className="text-gray-400 text-sm">Create your first job to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Recent Jobs ({filteredJobs.length})
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="pb-3">Status</th>
              <th className="pb-3">Job ID</th>
              <th className="pb-3">Source</th>
              <th className="pb-3">Progress</th>
              <th className="pb-3">Clips</th>
              <th className="pb-3">Duration</th>
              <th className="pb-3">Created</th>
              <th className="pb-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredJobs.map((job) => (
              <tr
                key={job.id}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => handleJobClick(job)}
              >
                <td className="py-3 pr-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(job.status)}`}
                  >
                    {job.status}
                  </span>
                </td>
                <td className="py-3 pr-4 font-mono text-sm text-gray-600">{job.id}</td>
                <td className="py-3 pr-4">
                  <div className="text-sm text-gray-900 truncate max-w-xs">
                    {job.sourceUrl || job.name || '—'}
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${getProgressColor(job.status)}`}
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-600 w-8">{job.progress}%</span>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <span className="text-sm text-gray-900">{job.clipsCount || 0}</span>
                </td>
                <td className="py-3 pr-4">
                  <span className="text-sm text-gray-500">{formatDuration(job.duration)}</span>
                </td>
                <td className="py-3 pr-4">
                  <span className="text-sm text-gray-500">{formatDate(job.createdAt)}</span>
                </td>
                <td className="py-3 pr-4 text-right">
                  <div
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (job.status === 'RUNNING' || job.status === 'PENDING') {
                        handleCancel(job);
                      }
                    }}
                  >
                    {job.status === 'RUNNING' || job.status === 'PENDING' ? '✕ Cancel' : '—'}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">{error}</p>
        </div>
      )}
    </div>
  );
};

export default JobList;
