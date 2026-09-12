'use client';

import React, { useEffect, useState } from 'react';
import ClipCard from './ClipCard';
import SubtitleEditorModal from './SubtitleEditorModal';
import { Film, RefreshCw } from 'lucide-react';

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
      setError(e.message || 'Gagal memuat klip');
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
      <div className={`bg-zinc-900 border border-zinc-800 rounded-xl shadow-sm p-6 ${className}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[9/16] max-h-[300px] bg-zinc-800/60 rounded-xl mb-3" />
              <div className="h-4 bg-zinc-800 rounded w-3/4 mb-2" />
              <div className="h-3 bg-zinc-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-zinc-900 border border-zinc-800 rounded-xl shadow-sm overflow-hidden text-zinc-100 ${className}`}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Galeri Klip Video
              <span className="sr-only">Clips</span>
              <span className="ml-2 text-xs font-normal text-zinc-400">
                ({filteredClips.length} klip)
              </span>
            </h2>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2.5">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            >
              <option value="all">Semua Klip (All Clips)</option>
              <option value="exported">Sudah Diekspor (Exported)</option>
              <option value="pending">Menunggu Ekspor (Pending)</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            >
              <option value="newest">Terbaru (Newest)</option>
              <option value="duration">Durasi Terpanjang</option>
              <option value="score">Skor Tertinggi</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {filteredClips.length === 0 ? (
          <div className="text-center py-12 flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-400 mb-4 shadow-inner">
              <Film className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-zinc-200 mb-1">Belum Ada Klip Video</h3>
            <p className="text-zinc-400 text-xs max-w-sm mx-auto">
              {error ||
                (jobId
                  ? 'Belum ada klip untuk job ini. Klip akan muncul setelah tahapan pemotongan selesai.'
                  : 'Klip akan muncul di sini setelah pipeline selesai memproses video. Buat job baru untuk memulai.')}
            </p>
            <button
              onClick={fetchClips}
              className="mt-4 px-3.5 py-1.5 text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Muat Ulang</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredClips.map((clip, index) => (
              <div key={clip.id} className="flex flex-col">
                <ClipCard
                  clip={clip}
                  index={index}
                  onPlay={handlePlay}
                  onDownload={handleDownload}
                  onEditSubtitle={(id) => setEditingClipId(id)}
                />
                {/* Job info */}
                <div className="mt-1.5 px-1">
                  <span className="text-[11px] text-zinc-500 truncate block">
                    Dari: {getJobName(clip).substring(0, 30)}
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
        <div className="px-6 py-3 bg-zinc-950 border-t border-zinc-800">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>{filteredClips.filter((c) => c.isExported).length} klip terekspor</span>
            <span>
              Total durasi: {Math.floor(filteredClips.reduce((sum, c) => sum + c.duration, 0) / 60)}
              m {Math.floor(filteredClips.reduce((sum, c) => sum + c.duration, 0) % 60)}s
            </span>
            <button
              onClick={fetchClips}
              className="text-zinc-300 hover:text-white inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
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
