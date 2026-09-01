'use client';

import React from 'react';
import useJobStore from '@/stores/useJobStore';

interface JobDetailProps {
  jobId: string;
  onClose?: () => void;
}

const STAGES = [
  'DISCOVER',
  'AD_FILTER',
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
  ANALYZE: 3,
  CUT: 4,
  EDIT: 5,
  SUBTITLE: 6,
  EXPORT: 7,
  COMPRESS: 8,
};

const JobDetail: React.FC<JobDetailProps> = ({ jobId, onClose }) => {
  const jobs = useJobStore((s) => s.jobs);
  const clips = useJobStore((s) => s.clips);
  const job = jobs.find((j) => j.id === jobId);
  const jobClips = clips[jobId] || [];

  if (!job) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <p className="text-gray-500">Job not found</p>
      </div>
    );
  }

  // Estimate current stage from progress
  const estimateStage = (progress: number): Stage | null => {
    if (progress === 0) return 'DISCOVER';
    if (progress < 12.5) return 'DISCOVER';
    if (progress < 25) return 'AD_FILTER';
    if (progress < 37.5) return 'ANALYZE';
    if (progress < 50) return 'CUT';
    if (progress < 62.5) return 'EDIT';
    if (progress < 75) return 'SUBTITLE';
    if (progress < 87.5) return 'EXPORT';
    if (progress < 100) return 'COMPRESS';
    return null;
  };

  const currentStage = estimateStage(job.progress);

  const formatDate = (str: string) =>
    new Date(str).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const getStageStatus = (stage: Stage) => {
    if (!currentStage) return 'pending';
    const currentNum = STAGE_ORDER[currentStage];
    const stageNum = STAGE_ORDER[stage];
    if (stageNum < currentNum) return 'completed';
    if (stageNum === currentNum) return 'running';
    return 'pending';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'RUNNING':
        return 'bg-blue-100 text-blue-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{job.name || 'Unnamed Job'}</h2>
            <p className="text-sm text-blue-100 mt-1 font-mono">{job.id}</p>
          </div>
          <div className="text-right">
            <span
              className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                job.status,
              )}`}
            >
              {job.status}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-sm text-blue-100 mb-1">
            <span>Progress</span>
            <span>{job.progress}%</span>
          </div>
          <div className="h-2 bg-blue-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stage pipeline */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Pipeline Stages</h3>
        <div className="flex items-center gap-1">
          {STAGES.map((stage, idx) => {
            const status = getStageStatus(stage);
            return (
              <React.Fragment key={stage}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      status === 'completed'
                        ? 'bg-green-500 text-white'
                        : status === 'running'
                          ? 'bg-blue-500 text-white animate-pulse'
                          : 'bg-gray-200 text-gray-500'
                    }`}
                    title={stage}
                  >
                    {status === 'completed' ? '✓' : status === 'running' ? '●' : idx + 1}
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 hidden sm:block">
                    {stage.replace('_', '\n')}
                  </span>
                </div>
                {idx < STAGES.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 ${
                      getStageStatus(STAGES[idx + 1]) !== 'pending' ? 'bg-green-500' : 'bg-gray-200'
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
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-gray-500">Source</div>
          <div className="text-sm font-medium text-gray-900 truncate">
            {job.sourceUrl || job.sourcePath || '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Clips Generated</div>
          <div className="text-sm font-bold text-gray-900">{job.clipsCount || jobClips.length}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Duration</div>
          <div className="text-sm text-gray-900">
            {job.duration ? `${job.duration.toFixed(0)}s` : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Created</div>
          <div className="text-sm text-gray-900">{formatDate(job.createdAt)}</div>
        </div>
      </div>

      {/* Error message */}
      {job.errorMessage && (
        <div className="px-6 py-3 bg-red-50 border-t border-red-200">
          <div className="text-xs text-red-700 font-medium">Error</div>
          <div className="text-sm text-red-800">{job.errorMessage}</div>
          {job.errorCode && <div className="text-xs text-red-600 mt-1">Code: {job.errorCode}</div>}
        </div>
      )}

      {/* Footer actions */}
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
        <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-900">
          ← Back to list
        </button>
        {job.status === 'RUNNING' && (
          <button className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors">
            Cancel Job
          </button>
        )}
        {job.status === 'COMPLETED' && jobClips.length > 0 && (
          <button className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors">
            View Clips →
          </button>
        )}
      </div>
    </div>
  );
};

export default JobDetail;
