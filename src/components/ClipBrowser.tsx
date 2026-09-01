'use client';

import React, { useEffect, useState } from 'react';
import ClipCard from './ClipCard';

interface Clip {
  id: string;
  jobId: string;
  startTime: number;
  endTime: number;
  duration: number;
  viralScore?: number;
  confidence?: string;
  exportPath?: string;
  thumbnailPath?: string;
  isExported: boolean;
  createdAt: string;
}

interface Job {
  id: string;
  name: string;
  status: string;
}

interface ClipBrowserProps {
  className?: string;
  jobId?: string; // Optional filter by job
}

const ClipBrowser: React.FC<ClipBrowserProps> = ({ className = '', jobId }) => {
  const [clips, setClips] = useState<Clip[]>([]);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'exported' | 'pending'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'duration' | 'score'>('newest');

  useEffect(() => {
    fetchClips();
  }, [jobId]);

  const fetchClips = async () => {
    setLoading(true);
    try {
      // Fetch all jobs first to map jobId -> job name
      const jobsRes = await fetch('/api/jobs');
      const jobsData = await jobsRes.json();
      const jobMap: Record<string, Job> = {};
      (jobsData.jobs || []).forEach((j: Job) => {
        jobMap[j.id] = j;
      });
      setJobs(jobMap);

      // Fetch clips (mock for now - real API needed)
      // In production: GET /api/clips
      const mockClips: Clip[] = [];
      setClips(mockClips);
    } catch {
      setClips([]);
    } finally {
      setLoading(false);
    }
  };

  const getJobName = (jId: string) => jobs[jId]?.name || jId;

  const filteredClips = clips
    .filter((clip) => {
      if (jobId && clip.jobId !== jobId) return false;
      if (filter === 'exported') return clip.isExported;
      if (filter === 'pending') return !clip.isExported;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'duration') return b.duration - a.duration;
      if (sortBy === 'score') return (b.viralScore || 0) - (a.viralScore || 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const handlePlay = async (clipId: string) => {
    const clip = clips.find((c) => c.id === clipId);
    if (!clip?.exportPath) return;
    // Open video player or navigate to clip detail
    window.open(`/api/clips/${clipId}/file`, '_blank');
  };

  const handleDownload = async (clipId: string) => {
    const clip = clips.find((c) => c.id === clipId);
    if (!clip?.exportPath) return;
    // Trigger download
    const a = document.createElement('a');
    a.href = `/api/clips/${clipId}/file`;
    a.download = `clip_${clipId}.mp4`;
    a.click();
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-xl shadow-sm p-6 ${className}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-video bg-gray-200 rounded-lg mb-3" />
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Clips
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({filteredClips.length})
              </span>
            </h2>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
            >
              <option value="all">All Clips</option>
              <option value="exported">Exported Only</option>
              <option value="pending">Pending Export</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
            >
              <option value="newest">Newest First</option>
              <option value="duration">Longest First</option>
              <option value="score">Highest Score</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {filteredClips.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">🎬</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No clips yet</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              Clips will appear here once jobs complete processing. Create a job to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClips.map((clip, index) => (
              <div key={clip.id}>
                <ClipCard
                  clip={clip}
                  index={index}
                  onPlay={handlePlay}
                  onDownload={handleDownload}
                />
                {/* Job info */}
                <div className="mt-2 px-1">
                  <span className="text-xs text-gray-500">
                    From: {getJobName(clip.jobId).substring(0, 30)}
                    {getJobName(clip.jobId).length > 30 ? '...' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer stats */}
      {filteredClips.length > 0 && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{filteredClips.filter((c) => c.isExported).length} exported</span>
            <span>
              Total duration:{' '}
              {Math.floor(filteredClips.reduce((sum, c) => sum + c.duration, 0) / 60)}m{' '}
              {Math.floor(filteredClips.reduce((sum, c) => sum + c.duration, 0) % 60)}s
            </span>
            <button onClick={fetchClips} className="text-blue-600 hover:text-blue-800">
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClipBrowser;
