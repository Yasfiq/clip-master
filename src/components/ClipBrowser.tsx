'use client';

import React, { useEffect, useState } from 'react';
import ClipCard from './ClipCard';
import SubtitleEditorModal from './SubtitleEditorModal';

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
  jobName?: string;
  jobStatus?: string;
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
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'exported' | 'pending'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'duration' | 'score'>('newest');
  const [editingClipId, setEditingClipId] = useState<string | null>(null);

  useEffect(() => {
    fetchClips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const fetchClips = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (jobId) params.set('jobId', jobId);

      const clipsRes = await fetch(`/api/clips?${params.toString()}`);
      const clipsPayload = await clipsRes.json().catch(() => ({}));
      if (!clipsRes.ok) throw new Error(clipsPayload?.error?.message || `HTTP ${clipsRes.status}`);
      const clipRows = clipsPayload.success ? clipsPayload.data?.clips : clipsPayload.clips;
      setClips(Array.isArray(clipRows) ? clipRows : []);

      // Fetch jobs to map jobId -> display name when the API doesn't include it.
      const jobsRes = await fetch('/api/jobs?limit=500');
      const jobsData = await jobsRes.json().catch(() => ({}));
      const jobsList = jobsData.success ? jobsData.data?.jobs : jobsData.jobs;
      const jobMap: Record<string, Job> = {};
      (jobsList || []).forEach((j: Job) => {
        jobMap[j.id] = j;
      });
      setJobs(jobMap);
    } catch (e: any) {
      setError(e.message || 'Failed to load clips');
      setClips([]);
    } finally {
      setLoading(false);
    }
  };

  const getJobName = (c: Clip) => c.jobName || jobs[c.jobId]?.name || c.jobId;

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
    // File route falls back exportPath -> editedPath -> cutPath, so preview
    // works for Phase-1 clips too. Only guard on an id.
    if (!clip) return;
    window.open(`/api/clips/${clipId}/file`, '_blank');
  };

  const handleDownload = async (clipId: string) => {
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) return;
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
              {error ||
                (jobId
                  ? 'No clips for this job yet. Clips appear after the cut stage finishes.'
                  : 'Clips will appear here once jobs complete processing. Create a job to get started.')}
            </p>
            <button
              onClick={fetchClips}
              className="mt-4 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              ⟳ Refresh
            </button>
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
                  onEditSubtitle={(id) => setEditingClipId(id)}
                />
                {/* Job info */}
                <div className="mt-2 px-1">
                  <span className="text-xs text-gray-500">
                    From: {getJobName(clip).substring(0, 30)}
                    {getJobName(clip).length > 30 ? '...' : ''}
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

      {editingClipId && (
        <SubtitleEditorModal
          clipId={editingClipId}
          isOpen={true}
          onClose={() => setEditingClipId(null)}
          onSuccess={() => fetchClips()}
        />
      )}
    </div>
  );
};

export default ClipBrowser;
