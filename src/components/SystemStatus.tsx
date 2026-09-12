'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, Activity, Terminal, Database, HardDrive } from 'lucide-react';

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

type LoadState = 'loading' | 'ready' | 'error';

const SystemStatus: React.FC = () => {
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  const load = async () => {
    setState('loading');
    try {
      const res = await fetch('/api/system/status');
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error?.message || `HTTP ${res.status}`);
      const d = payload.success ? payload.data : payload;
      setData({
        pipeline: d.pipeline,
        binaries: d.binaries,
        database: d.database,
        storage: d.storage,
      });
      setState('ready');
    } catch (e: any) {
      setErrorMsg(e.message || 'Gagal memuat status sistem');
      setState('error');
    }
  };

  useEffect(() => {
    load();
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
            data.storage.ok ? 'bg-zinc-900 border-amber-800/50' : 'bg-zinc-900 border-rose-800/50',
            'Penyimpanan Media',
            data.storage.ok ? 'Normal' : 'Error',
            'Direktori media siap',
            HardDrive,
          )}
        </div>
      )}
    </div>
  );
};

export default SystemStatus;
