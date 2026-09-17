'use client';

import React, { useState, useEffect } from 'react';
import {
  Tv,
  RefreshCw,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  Radio,
} from 'lucide-react';
import { MonitoredChannel, DetectedVideo, YouTubeWatcherStatus } from '@/types/youtubeWatcher';

function YouTubeIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export default function YouTubeWatcherSettings() {
  const [status, setStatus] = useState<YouTubeWatcherStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [polling, setPolling] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [channelNameInput, setChannelNameInput] = useState('');
  const [addingChannel, setAddingChannel] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/system/youtube-watcher');
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload?.success && payload.data) {
        setStatus(payload.data);
      }
    } catch {
      // Keep previous status on network glitch
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async () => {
    if (!status || toggling) return;
    const targetState = !status.active;
    setToggling(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/system/youtube-watcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', active: targetState }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error?.message || `HTTP ${res.status}`);
      }
      if (payload?.success && payload.data) {
        setStatus(payload.data);
        setFeedbackMsg({
          text: targetState
            ? 'YouTube Watcher aktif: memantau unggahan channel target secara berkala'
            : 'YouTube Watcher dinonaktifkan',
          type: 'success',
        });
      }
    } catch (err: any) {
      setFeedbackMsg({
        text: `Gagal mengubah status pemantauan: ${err.message}`,
        type: 'error',
      });
    } finally {
      setToggling(false);
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  const handlePollNow = async () => {
    if (polling || status?.isPolling) return;
    setPolling(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/system/youtube-watcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'poll_now' }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error?.message || `HTTP ${res.status}`);
      }
      if (payload?.success && payload.data) {
        setStatus(payload.data);
        setFeedbackMsg({
          text: 'Pemeriksaan channel selesai: data feed terbaru telah diperbarui',
          type: 'success',
        });
      }
    } catch (err: any) {
      setFeedbackMsg({
        text: `Gagal melakukan pemeriksaan channel: ${err.message}`,
        type: 'error',
      });
    } finally {
      setPolling(false);
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = channelInput.trim();
    if (!cleanInput || addingChannel) return;

    setAddingChannel(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/system/youtube-watcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_channel',
          channel: cleanInput,
          name: channelNameInput.trim() || undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error?.message || `HTTP ${res.status}`);
      }
      if (payload?.success && payload.data) {
        setStatus(payload.data);
        setChannelInput('');
        setChannelNameInput('');
        setFeedbackMsg({
          text: `Channel ${cleanInput} berhasil ditambahkan ke daftar pantauan`,
          type: 'success',
        });
      }
    } catch (err: any) {
      setFeedbackMsg({
        text: `Gagal menambahkan channel: ${err.message}`,
        type: 'error',
      });
    } finally {
      setAddingChannel(false);
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  const handleRemoveChannel = async (channelId: string, channelName: string) => {
    if (deletingId) return;
    setDeletingId(channelId);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/system/youtube-watcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remove_channel',
          id: channelId,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error?.message || `HTTP ${res.status}`);
      }
      if (payload?.success && payload.data) {
        setStatus(payload.data);
        setFeedbackMsg({
          text: `Channel ${channelName} telah dihapus dari pemantauan`,
          type: 'success',
        });
      }
    } catch (err: any) {
      setFeedbackMsg({
        text: `Gagal menghapus channel: ${err.message}`,
        type: 'error',
      });
    } finally {
      setDeletingId(null);
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Belum pernah';
    try {
      const date = new Date(isoString);
      return (
        date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
        ' (' +
        date.toLocaleDateString([], { day: 'numeric', month: 'short' }) +
        ')'
      );
    } catch {
      return isoString;
    }
  };

  const isRefreshing = polling || status?.isPolling;

  return (
    <div
      className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-sm overflow-hidden text-zinc-100"
      data-testid="youtube-watcher-settings-card"
    >
      {/* Header with Badges, Poll Now, and Toggle Switch */}
      <div className="px-6 py-5 border-b border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`p-2.5 rounded-lg shrink-0 ${
              status?.active
                ? 'bg-rose-950/60 border border-rose-800/60 text-rose-400'
                : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
            }`}
          >
            <YouTubeIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-zinc-100">
                YouTube Channel Watcher (Pilar 1: Auto-Ingest Bebas Kuota)
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  status?.active
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}
                data-testid="youtube-watcher-badge"
              >
                {status?.active && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}
                {status?.active ? 'Aktif (Running)' : 'Nonaktif (Stopped)'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
                {status?.channels?.length ?? 0} Channel
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Otomasi deteksi unggahan baru dari channel YouTube tanpa kuota API resmi (menggunakan
              scraping yt-dlp hemat bandwidth).
            </p>
          </div>
        </div>

        {/* Action Controls: Poll Now + Toggle */}
        <div className="flex items-center gap-3 self-end lg:self-center flex-wrap">
          <button
            type="button"
            onClick={handlePollNow}
            disabled={loading || isRefreshing}
            data-testid="youtube-watcher-poll-button"
            className="inline-flex items-center justify-center min-h-[44px] px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-750 hover:text-white border border-zinc-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-2 text-zinc-400 ${
                isRefreshing ? 'animate-spin text-emerald-400' : ''
              }`}
            />
            <span>{isRefreshing ? 'Memeriksa...' : 'Periksa Sekarang'}</span>
          </button>

          <div className="flex items-center gap-2.5 pl-2 border-l border-zinc-800">
            <span className="text-xs font-medium text-zinc-300">
              {status?.active ? 'ON' : 'OFF'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={status?.active ?? false}
              aria-label="Toggle YouTube Watcher"
              disabled={loading || toggling}
              onClick={handleToggle}
              data-testid="youtube-watcher-toggle-button"
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 cursor-pointer ${
                status?.active ? 'bg-emerald-600' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  status?.active ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedbackMsg && (
        <div
          className={`mx-6 mt-4 p-3 rounded-lg text-xs border ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
          role="status"
        >
          {feedbackMsg.text}
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Add Channel Form */}
        <div className="p-4 rounded-lg bg-zinc-950/60 border border-zinc-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200 mb-2">
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>Tambah Channel Sasaran</span>
          </div>
          <p className="text-xs text-zinc-400 mb-3">
            Masukkan handle YouTube (misal:{' '}
            <code className="text-zinc-300 bg-zinc-800/80 px-1 py-0.5 rounded">@RadityaDika</code>,{' '}
            <code className="text-zinc-300 bg-zinc-800/80 px-1 py-0.5 rounded">
              @CurhatBangDennySumargo
            </code>
            ) atau URL lengkap channel.
          </p>

          <form onSubmit={handleAddChannel} className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1">
              <label htmlFor="channel-input" className="sr-only">
                Handle atau URL YouTube
              </label>
              <input
                id="channel-input"
                type="text"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                placeholder="Contoh: @RadityaDika atau https://youtube.com/@CurhatBangDennySumargo"
                disabled={addingChannel}
                data-testid="youtube-watcher-input"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-750 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:border-zinc-500 transition-colors"
              />
            </div>
            <div className="sm:w-56">
              <label htmlFor="channel-name-input" className="sr-only">
                Nama Kustom (Opsional)
              </label>
              <input
                id="channel-name-input"
                type="text"
                value={channelNameInput}
                onChange={(e) => setChannelNameInput(e.target.value)}
                placeholder="Nama channel (opsional)"
                disabled={addingChannel}
                data-testid="youtube-watcher-name-input"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-750 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:border-zinc-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={addingChannel || !channelInput.trim()}
              data-testid="youtube-watcher-add-button"
              className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-xs font-semibold text-zinc-950 bg-zinc-100 hover:bg-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              <span>{addingChannel ? 'Menambahkan...' : '+ Tambah Channel'}</span>
            </button>
          </form>
        </div>

        {/* Monitored Channels List */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Daftar Channel Terpantau
            </h3>
            <div className="text-xs text-zinc-500">
              Pemeriksaan Terakhir:{' '}
              <span className="text-zinc-300 font-mono">{formatDate(status?.lastPollAt)}</span>
            </div>
          </div>

          {!status?.channels || status.channels.length === 0 ? (
            <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-950/30 text-center text-xs text-zinc-500">
              Belum ada channel YouTube yang dipantau. Tambahkan handle atau URL channel di atas
              untuk memulai.
            </div>
          ) : (
            <div
              className="grid grid-cols-1 md:grid-cols-2 gap-3"
              data-testid="youtube-watcher-channel-list"
            >
              {status.channels.map((channel: MonitoredChannel) => (
                <div
                  key={channel.id}
                  className="p-3.5 rounded-lg bg-zinc-950/50 border border-zinc-800/80 flex items-center justify-between gap-3 hover:border-zinc-700 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-zinc-200 truncate">
                        {channel.name}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/50 text-emerald-300 border border-emerald-800/50">
                        {channel.status}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-rose-400 truncate mt-0.5">
                      {channel.handleOrUrl}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      <span>Cek terakhir: {formatDate(channel.lastCheckedAt)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveChannel(channel.id, channel.name)}
                    disabled={deletingId === channel.id}
                    aria-label={`Hapus channel ${channel.name}`}
                    title="Hapus channel dari pantauan"
                    data-testid={`delete-channel-${channel.id}`}
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30 focus:outline-none focus:ring-2 focus:ring-rose-500/40 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* History of Detected Videos Table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Riwayat Video Otomatis Terdeteksi
            </h3>
            <span className="text-xs text-zinc-400">
              Total Terdeteksi:{' '}
              <span className="font-mono font-semibold text-emerald-400">
                {status?.detectedVideos?.length ?? 0}
              </span>
            </span>
          </div>

          {!status?.detectedVideos || status.detectedVideos.length === 0 ? (
            <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-950/30 text-center text-xs text-zinc-500">
              Belum ada video baru yang otomatis terdeteksi dari channel pantauan.
            </div>
          ) : (
            <div
              className="overflow-x-auto rounded-lg border border-zinc-800"
              data-testid="youtube-watcher-detected-table"
            >
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950 text-zinc-400 uppercase tracking-wider border-b border-zinc-800 text-[10px]">
                  <tr>
                    <th className="p-2.5">Judul Video</th>
                    <th className="p-2.5">Channel</th>
                    <th className="p-2.5">Tanggal Terdeteksi</th>
                    <th className="p-2.5">Status Job</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 bg-zinc-900">
                  {status.detectedVideos.map((item: DetectedVideo) => (
                    <tr key={item.id} className="hover:bg-zinc-800/40">
                      <td className="p-2.5">
                        <div className="font-medium text-zinc-200 flex items-center gap-1.5">
                          <span className="truncate max-w-xs md:max-w-md" title={item.title}>
                            {item.title}
                          </span>
                          {item.videoUrl && (
                            <a
                              href={item.videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-zinc-500 hover:text-rose-400 shrink-0"
                              title="Buka URL YouTube"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="text-zinc-300 font-medium">{item.channelName}</div>
                        {item.channelHandle && (
                          <div className="text-[11px] text-rose-400 font-mono">
                            {item.channelHandle}
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 text-zinc-400 font-mono tabular-nums whitespace-nowrap">
                        {formatDate(item.detectedAt)}
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            item.jobStatus === 'COMPLETED'
                              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                              : item.jobStatus?.startsWith('RUNNING')
                                ? 'bg-amber-950/40 text-amber-300 border-amber-800/60'
                                : item.jobStatus === 'FAILED'
                                  ? 'bg-rose-950/40 text-rose-300 border-rose-800/60'
                                  : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                          }`}
                        >
                          {item.jobStatus || 'TERDETEKSI'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
