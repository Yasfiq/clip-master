'use client';

import React, { useEffect, useRef } from 'react';
import useJobStore from '@/stores/useJobStore';

interface ProgressMonitorProps {
  jobId: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // ms
}

const ProgressMonitor: React.FC<ProgressMonitorProps> = ({
  jobId,
  autoRefresh = true,
  refreshInterval = 2000,
}) => {
  const job = useJobStore((s) => s.jobs.find((j) => j.id === jobId));
  const setLoading = useJobStore((s) => s.setLoading);
  const setError = useJobStore((s) => s.setError);
  const updateJob = useJobStore((s) => s.updateJob);
  const lastUpdated = useJobStore((s) => s.lastUpdated);
  const isLoading = useJobStore((s) => s.isLoading);

  const abortRef = useRef<AbortController | null>(null);

  // Poll job status from API
  const fetchJobStatus = async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error('Failed to fetch job');
      const data = await res.json();
      // API returns { success, data: { ...job } } envelope.
      const job = data.success ? data.data : data;
      updateJob(jobId, {
        status: job.status,
        progress: job.progress,
        clipsCount: job.clipsCount,
        duration: job.duration,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    }
  };

  useEffect(() => {
    if (!autoRefresh || !jobId) return;

    // Initial fetch
    fetchJobStatus();

    // Set up polling
    const interval = setInterval(fetchJobStatus, refreshInterval);

    return () => {
      clearInterval(interval);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [jobId, autoRefresh, refreshInterval]);

  if (!job) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse mb-2" />
        <div className="h-2 bg-gray-200 rounded w-full" />
      </div>
    );
  }

  const stageMessages: Record<string, string> = {
    DISCOVER: 'Discovering video...',
    AD_FILTER: 'Filtering advertisements...',
    ANALYZE: 'Analyzing segments...',
    CUT: 'Cutting clips...',
    EDIT: 'Applying edits...',
    SUBTITLE: 'Generating subtitles...',
    EXPORT: 'Exporting clips...',
    COMPRESS: 'Compressing output...',
  };

  const getStageFromProgress = (progress: number) => {
    if (progress < 12.5) return 'DISCOVER';
    if (progress < 25) return 'AD_FILTER';
    if (progress < 37.5) return 'ANALYZE';
    if (progress < 50) return 'CUT';
    if (progress < 62.5) return 'EDIT';
    if (progress < 75) return 'SUBTITLE';
    if (progress < 87.5) return 'EXPORT';
    return 'COMPRESS';
  };

  const currentStage = getStageFromProgress(job.progress);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-500';
      case 'RUNNING':
        return 'bg-blue-500 animate-pulse';
      case 'FAILED':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const isRunning = job.status === 'RUNNING' || job.status === 'PENDING';

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(job.status)}`} />
          <span className="text-sm font-medium text-gray-700">
            {isRunning ? stageMessages[currentStage] : job.status}
          </span>
        </div>
        <span className="text-sm font-bold text-gray-900">{job.progress}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getStatusColor(
            job.status,
          )}`}
          style={{ width: `${job.progress}%` }}
        />
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {job.clipsCount > 0
            ? `${job.clipsCount} clip${job.clipsCount > 1 ? 's' : ''} found`
            : 'No clips yet'}
        </span>
        <span>
          {isRunning ? `Last updated: ${new Date(lastUpdated).toLocaleTimeString()}` : job.status}
        </span>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

export default ProgressMonitor;
