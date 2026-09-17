'use client';

import React, { useState, useEffect } from 'react';
import {
  FolderSync,
  FolderInput,
  FileVideo,
  Info,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Tag,
  ExternalLink,
} from 'lucide-react';

interface ProcessedFile {
  id: string;
  originalFilename: string;
  destinationFilename?: string;
  destinationPath?: string;
  jobId?: string;
  fileSizeBytes?: number;
  sourceTitle?: string;
  sourceChannel?: string;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
  processedAt: string;
}

interface WatcherStatus {
  active: boolean;
  incomingPath: string;
  sourcesPath: string;
  supportedExtensions: readonly string[];
  pendingFiles: string[];
  processedFiles: ProcessedFile[];
}

export default function FolderWatcherSettings() {
  const [status, setStatus] = useState<WatcherStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/system/watcher');
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload?.success && payload.data) {
        setStatus(payload.data);
      }
    } catch {
      // Keep previous state on error
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
      const res = await fetch('/api/system/watcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: targetState }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error?.message || `HTTP ${res.status}`);
      }
      if (payload?.success && payload.data) {
        setStatus(payload.data);
        setFeedbackMsg({
          text: targetState
            ? 'Folder Watcher aktif: memantau direktori media/incoming/'
            : 'Folder Watcher dinonaktifkan',
          type: 'success',
        });
      }
    } catch (err: any) {
      setFeedbackMsg({
        text: `Gagal mengubah status folder watcher: ${err.message}`,
        type: 'error',
      });
    } finally {
      setToggling(false);
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '-';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-sm overflow-hidden text-zinc-100"
      data-testid="folder-watcher-settings-card"
    >
      {/* Header with Toggle */}
      <div className="px-6 py-5 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`p-2.5 rounded-lg shrink-0 ${
              status?.active
                ? 'bg-emerald-950/60 border border-emerald-800/60 text-emerald-400'
                : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
            }`}
          >
            <FolderSync className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-zinc-100">
                Auto-Ingest Folder Watcher (media/incoming/)
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  status?.active
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}
                data-testid="watcher-settings-badge"
              >
                {status?.active && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}
                {status?.active ? 'Aktif (Running)' : 'Nonaktif (Stopped)'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Otomasi deteksi file video masuk di folder incoming tanpa klik tombol (Zero-Click
              Ingest).
            </p>
          </div>
        </div>

        {/* Action Toggle Switch */}
        <div className="flex items-center gap-3 self-end sm:self-center">
          <span className="text-xs font-medium text-zinc-300">{status?.active ? 'ON' : 'OFF'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={status?.active ?? false}
            aria-label="Toggle Folder Watcher"
            disabled={loading || toggling}
            onClick={handleToggle}
            data-testid="watcher-toggle-button"
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

      {/* Content & Information */}
      <div className="p-6 space-y-6">
        {/* Directory Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-zinc-950/50 border border-zinc-800/80">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-300 mb-1.5">
              <FolderInput className="w-4 h-4 text-emerald-400" />
              <span>Direktori Pengawasan (Incoming)</span>
            </div>
            <code className="text-xs font-mono text-emerald-300 bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800 block truncate">
              media/incoming/
            </code>
            <p className="text-[11px] text-zinc-400 mt-2">
              Salin atau simpan video mentah ke folder ini. Sistem memverifikasi kestabilan ukuran
              berkas sebelum mulai diproses.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-zinc-950/50 border border-zinc-800/80">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-300 mb-1.5">
              <FileVideo className="w-4 h-4 text-sky-400" />
              <span>Ekstensi Video Didukung</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {['.mp4', '.mov', '.mkv', '.webm', '.avi'].map((ext) => (
                <span
                  key={ext}
                  className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-zinc-800 text-zinc-200 border border-zinc-700"
                >
                  {ext}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-zinc-400 mt-2">
              File sementara seperti <code className="text-zinc-500">.part</code> atau{' '}
              <code className="text-zinc-500">.tmp</code> diabaikan secara otomatis.
            </p>
          </div>
        </div>

        {/* Naming Pattern Rules */}
        <div className="p-4 rounded-lg bg-zinc-950/40 border border-zinc-800/70">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200 mb-2">
            <Tag className="w-4 h-4 text-amber-400" />
            <span>Aturan Ekstraksi Channel Otomatis (Pattern Naming)</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Gunakan pola nama file berikut agar sistem otomatis mengenali nama channel dan
            memberikan atribusi visual pada klip:
          </p>
          <div className="mt-2.5 p-3 rounded-md bg-zinc-900 border border-zinc-800 font-mono text-xs text-amber-300 flex flex-col gap-1.5">
            <div>
              <span className="text-zinc-500">Pola: </span>
              Video_From_[Nama Channel]_[Judul Materi].[ext]
            </div>
            <div>
              <span className="text-zinc-500">Contoh: </span>
              Video_From_Raditya Dika_Eksperimen Watcher.mp4
            </div>
          </div>
          <div className="mt-2 text-[11px] text-zinc-400">
            Hasil: Channel = <span className="text-zinc-200 font-medium">Raditya Dika</span>, Judul
            = <span className="text-zinc-200 font-medium">Eksperimen Watcher</span>, Atribusi ={' '}
            <span className="text-zinc-200 font-medium">Sumber: Raditya Dika</span>.
          </div>
        </div>

        {/* Real-time Status & Processed List */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Monitoring &amp; Riwayat Auto-Ingest
            </h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400">Antrean Aktif:</span>
              <span
                className="font-mono font-semibold text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/50"
                data-testid="watcher-settings-pending-count"
              >
                {status?.pendingFiles?.length ?? 0}
              </span>
            </div>
          </div>

          {/* Pending files list if any */}
          {status?.pendingFiles && status.pendingFiles.length > 0 && (
            <div className="mb-3 p-3 rounded-lg bg-amber-950/30 border border-amber-800/50 text-xs text-amber-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-semibold">Sedang menstabilkan file: </span>
                <span className="font-mono">{status.pendingFiles.join(', ')}</span>
              </div>
            </div>
          )}

          {/* Processed files history */}
          {!status?.processedFiles || status.processedFiles.length === 0 ? (
            <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-950/30 text-center text-xs text-zinc-500">
              Belum ada berkas video yang di-ingest via Folder Watcher pada sesi ini.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950 text-zinc-400 uppercase tracking-wider border-b border-zinc-800 text-[10px]">
                  <tr>
                    <th className="p-2.5">Nama Berkas</th>
                    <th className="p-2.5">Channel / Judul</th>
                    <th className="p-2.5">Ukuran</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Waktu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 bg-zinc-900">
                  {status.processedFiles.map((item) => (
                    <tr key={item.id} className="hover:bg-zinc-800/40">
                      <td
                        className="p-2.5 font-mono text-zinc-300 truncate max-w-[200px]"
                        title={item.originalFilename}
                      >
                        {item.originalFilename}
                      </td>
                      <td className="p-2.5">
                        <div className="font-medium text-zinc-200">{item.sourceTitle || '-'}</div>
                        {item.sourceChannel && (
                          <div className="text-[11px] text-sky-400">📺 {item.sourceChannel}</div>
                        )}
                      </td>
                      <td className="p-2.5 text-zinc-400 font-mono tabular-nums">
                        {formatFileSize(item.fileSizeBytes)}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                            item.status === 'SUCCESS'
                              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                              : 'bg-rose-950/40 text-rose-300 border-rose-800/60'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-zinc-400 tabular-nums">
                        {formatDate(item.processedAt)}
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
