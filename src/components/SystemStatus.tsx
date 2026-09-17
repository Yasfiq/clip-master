'use client';

import React, { useEffect, useState } from 'react';
import {
  RefreshCw,
  Activity,
  Terminal,
  Database,
  HardDrive,
  FolderSync,
  Clock,
  CheckCircle2,
} from 'lucide-react';

interface SystemStatusData {
  pipeline: { ready: boolean; stageCount: number };
  binaries: {
    ok: number;
    total: number;
    list: Array<{ name: string; ok: boolean; version: string | null }>;
  };
  database: { online: boolean };
  storage: { ok: boolean };
}

interface WatcherStatusData {
  active: boolean;
  incomingPath: string;
  sourcesPath: string;
  supportedExtensions: readonly string[];
  pendingFiles: string[];
  processedFiles: Array<{
    id: string;
    originalFilename: string;
    destinationFilename?: string;
    jobId?: string;
    sourceTitle?: string;
    sourceChannel?: string;
    status: 'SUCCESS' | 'FAILED';
    processedAt: string;
  }>;
}

type LoadState = 'loading' | 'ready' | 'error';

const SystemStatus: React.FC = () => {
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [watcherData, setWatcherData] = useState<WatcherStatusData | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  const load = async () => {
    try {
      const [sysRes, watcherRes] = await Promise.all([
        fetch('/api/system/status'),
        fetch('/api/system/watcher').catch(() => null),
      ]);
      const payload = await sysRes.json().catch(() => ({}));
      if (!sysRes.ok) throw new Error(payload?.error?.message || `HTTP ${sysRes.status}`);
      const d = payload.success ? payload.data : payload;
      setData({
        pipeline: d.pipeline,
        binaries: d.binaries,
        database: d.database,
        storage: d.storage,
      });

      if (watcherRes && watcherRes.ok) {
        const wPayload = await watcherRes.json().catch(() => null);
        if (wPayload?.success && wPayload.data) {
          setWatcherData(wPayload.data);
        }
      }
      setState('ready');
    } catch (e: any) {
      setErrorMsg(e.message || 'Gagal memuat status sistem');
      setState('error');
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      load();
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const card = (
    color: string,
    label: string,
    value: string,
    sub: string,
    Icon: React.ComponentType<{ className?: string }>,
  ) => (
    <div className={`border rounded-lg p-3.5 ${color} transition-all`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">{label}</span>
        <Icon className="w-4 h-4 text-zinc-400" />
      </div>
      <div className="mt-1 text-xl font-bold text-zinc-100">{value}</div>
      <div className="text-[11px] text-zinc-400 mt-0.5 truncate">{sub}</div>
    </div>
  );

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm text-zinc-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
          Status Sistem Lokal
        </h3>
        <button
          type="button"
          onClick={load}
          className="text-xs text-zinc-400 hover:text-zinc-100 font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {state === 'loading' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-zinc-800/60 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {state === 'error' && (
        <div className="p-3.5 bg-rose-950/40 border border-rose-900/60 rounded-lg text-xs text-rose-300">
          Gagal memuat status sistem: {errorMsg}
        </div>
      )}

      {state === 'ready' && data && (
        <>
          {/* Folder Watcher Indicator & Queue Status */}
          <div
            className="mb-4 p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl transition-all"
            data-testid="folder-watcher-indicator"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-lg ${
                    watcherData?.active
                      ? 'bg-emerald-950/60 border border-emerald-800/60 text-emerald-400'
                      : 'bg-zinc-800/80 border border-zinc-700 text-zinc-400'
                  }`}
                >
                  <FolderSync className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        watcherData?.active
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}
                      data-testid="watcher-status-badge"
                    >
                      {watcherData?.active && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                      )}
                      📁 Folder Watcher:{' '}
                      {watcherData?.active
                        ? 'Aktif (media/incoming/)'
                        : 'Nonaktif (media/incoming/)'}
                    </span>
                    <span className="text-[11px] text-zinc-500">Zero-Click Ingest</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Memantau folder{' '}
                    <code className="text-zinc-300 bg-zinc-800/70 px-1.5 py-0.5 rounded text-[11px] font-mono">
                      media/incoming/
                    </code>
                    . Video masuk otomatis diproses menjadi job.
                  </p>
                </div>
              </div>

              {/* Queue / Processing metrics */}
              <div className="flex items-center gap-2.5 text-xs flex-wrap">
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    (watcherData?.pendingFiles?.length ?? 0) > 0
                      ? 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                  }`}
                  data-testid="watcher-queue-status"
                >
                  <Clock className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="text-[10px] text-zinc-400 uppercase tracking-wider">
                      Antrean / Memproses
                    </div>
                    <div
                      className="font-semibold text-zinc-100"
                      data-testid="watcher-pending-count"
                    >
                      {watcherData?.pendingFiles?.length ?? 0} file
                    </div>
                  </div>
                </div>

                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-zinc-900 border-zinc-800 text-zinc-300"
                  data-testid="watcher-processed-status"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <div>
                    <div className="text-[10px] text-zinc-400 uppercase tracking-wider">
                      Total Terdeteksi
                    </div>
                    <div
                      className="font-semibold text-zinc-100"
                      data-testid="watcher-processed-count"
                    >
                      {watcherData?.processedFiles?.length ?? 0} file
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Active debounce / stability alert */}
            {watcherData?.pendingFiles && watcherData.pendingFiles.length > 0 && (
              <div className="mt-3 p-2.5 bg-amber-950/40 border border-amber-800/50 rounded-lg text-xs text-amber-200 flex items-center gap-2 animate-pulse">
                <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  Sedang mendeteksi kestabilan berkas masuk:{' '}
                  <span className="font-mono font-medium">
                    {watcherData.pendingFiles.join(', ')}
                  </span>
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {card(
              data.pipeline.ready
                ? 'bg-zinc-900 border-emerald-800/50'
                : 'bg-zinc-900 border-rose-800/50',
              'Pipeline',
              data.pipeline.ready ? 'Siap' : 'Terganggu',
              `${data.pipeline.stageCount} tahapan aktif`,
              Activity,
            )}
            {card(
              data.binaries.ok === data.binaries.total
                ? 'bg-zinc-900 border-sky-800/50'
                : 'bg-zinc-900 border-rose-800/50',
              'Biner Eksternal',
              `${data.binaries.ok}/${data.binaries.total}`,
              data.binaries.list.map((b) => b.name).join(' · '),
              Terminal,
            )}
            {card(
              data.database.online
                ? 'bg-zinc-900 border-indigo-800/50'
                : 'bg-zinc-900 border-rose-800/50',
              'Basis Data',
              data.database.online ? 'Online' : 'Offline',
              'SQLite terhubung',
              Database,
            )}
            {card(
              data.storage.ok
                ? 'bg-zinc-900 border-amber-800/50'
                : 'bg-zinc-900 border-rose-800/50',
              'Penyimpanan Media',
              data.storage.ok ? 'Normal' : 'Error',
              'Direktori media siap',
              HardDrive,
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SystemStatus;
