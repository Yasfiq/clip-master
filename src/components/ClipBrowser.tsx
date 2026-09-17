'use client';

import React, { useEffect, useState } from 'react';
import ClipCard from './ClipCard';
import ClipStudioModal from './ClipStudioModal';
import CopywritingModal from './CopywritingModal';
import DripSchedulerModal from './DripSchedulerModal';
import { Film, RefreshCw, Calendar, Search } from 'lucide-react';

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
  hookHeadline?: string;
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
  const [editingTab, setEditingTab] = useState<'hook' | 'branding' | 'subtitle' | 'transition'>(
    'hook',
  );
  const [copywritingClipId, setCopywritingClipId] = useState<string | null>(null);
  const [isDripModalOpen, setIsDripModalOpen] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchClips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const fetchClips = async (silent = false) => {
    if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
    }
  };

  const getJobName = (c: Clip) => c.jobName || jobs[c.jobId]?.name || c.jobId;

  const filteredClips = clips
    .filter((clip) => {
      if (jobId && clip.jobId !== jobId) return false;
      if (filter === 'exported') return clip.isExported;
      if (filter === 'pending') return !clip.isExported;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesHook = clip.hookHeadline?.toLowerCase().includes(q);
        const matchesJob = getJobName(clip)?.toLowerCase().includes(q);
        const matchesId = clip.id.toLowerCase().includes(q);
        if (!matchesHook && !matchesJob && !matchesId) return false;
      }
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

  const hasExportedClips = clips.some((c) => c.isExported);

  const handleDownloadAllZip = async () => {
    const exportedClips = clips.filter((c) => c.isExported);
    if (exportedClips.length === 0 || isZipping) return;

    setIsZipping(true);
    try {
      let res: Response;
      if (jobId) {
        res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/download-all`);
      } else {
        const uniqueJobIds = Array.from(new Set(exportedClips.map((c) => c.jobId)));
        if (uniqueJobIds.length === 1) {
          res = await fetch(`/api/jobs/${encodeURIComponent(uniqueJobIds[0])}/download-all`);
        } else {
          res = await fetch('/api/clips/batch-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clipIds: exportedClips.map((c) => c.id) }),
          });
        }
      }

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload?.error?.message || `HTTP ${res.status}`);
      }

      const disposition = res.headers.get('content-disposition');
      let filename = jobId ? `Clips_${jobId}.zip` : `Clips_Batch_${Date.now()}.zip`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) {
          filename = match[1].replace(/['"]/g, '');
        }
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      console.error('Batch ZIP download error:', e);
      alert(e.message || 'Gagal mengunduh paket ZIP');
    } finally {
      setIsZipping(false);
    }
  };

  if (loading && clips.length === 0) {
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

          {/* Actions & Filters */}
          <div className="flex items-center flex-wrap gap-2.5">
            <button
              onClick={handleDownloadAllZip}
              disabled={!hasExportedClips || isZipping}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-sm ${
                !hasExportedClips
                  ? 'bg-zinc-800/50 text-zinc-500 border border-zinc-800 cursor-not-allowed'
                  : isZipping
                    ? 'bg-indigo-950 text-indigo-300 border border-indigo-800 cursor-wait'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 cursor-pointer'
              }`}
              title={
                !hasExportedClips
                  ? 'Belum ada klip yang berstatus diekspor'
                  : `Unduh ${clips.filter((c) => c.isExported).length} klip yang sudah diekspor dalam satu file ZIP`
              }
            >
              {isZipping ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Sedang Mengompres ZIP...</span>
                </>
              ) : (
                <span>📦 Unduh Semua Klip (ZIP)</span>
              )}
            </button>

            <button
              onClick={() => setIsDripModalOpen(true)}
              disabled={filteredClips.length === 0}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-sm ${
                filteredClips.length === 0
                  ? 'bg-zinc-800/50 text-zinc-500 border border-zinc-800 cursor-not-allowed'
                  : 'bg-amber-950/60 hover:bg-amber-900/70 text-amber-200 border border-amber-700/60 cursor-pointer'
              }`}
              title="Buka kalender jadwal jam emas (WIB) untuk klip video ini"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>📅 Jadwal Jam Emas (Drip)</span>
            </button>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari klip, headline, ID..."
                className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 w-40 sm:w-52"
                aria-label="Cari klip video"
              />
            </div>

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
              onClick={() => fetchClips()}
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
                  onOpenStudio={(id, tab) => {
                    setEditingClipId(id);
                    setEditingTab(tab || 'hook');
                  }}
                  onEditSubtitle={(id) => {
                    setEditingClipId(id);
                    setEditingTab('subtitle');
                  }}
                  onOpenCopywriting={(id) => {
                    setCopywritingClipId(id);
                  }}
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
              onClick={() => fetchClips()}
              className="text-zinc-300 hover:text-white inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      )}

      {editingClipId && (
        <ClipStudioModal
          clipId={editingClipId}
          isOpen={true}
          initialTab={editingTab}
          onClose={() => setEditingClipId(null)}
          onSuccess={() => fetchClips(true)}
        />
      )}

      {copywritingClipId && (
        <CopywritingModal
          clipId={copywritingClipId}
          isOpen={true}
          onClose={() => setCopywritingClipId(null)}
        />
      )}

      {isDripModalOpen && (
        <DripSchedulerModal
          isOpen={true}
          clips={filteredClips}
          onClose={() => setIsDripModalOpen(false)}
        />
      )}
    </div>
  );
};

export default ClipBrowser;
