'use client';

import React, { useEffect, useState } from 'react';

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
      setErrorMsg(e.message || 'Failed to load');
      setState('error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const card = (color: string, label: string, value: string, sub: string) => (
    <div className={`${color} border rounded-lg p-4`}>
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      <div className="text-xs mt-1 opacity-80">{sub}</div>
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">System Status</h3>
        <button
          type="button"
          onClick={load}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          ↻ Refresh
        </button>
      </div>

      {state === 'loading' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {state === 'error' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          Failed to load system status: {errorMsg}
        </div>
      )}

      {state === 'ready' && data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {card(
            data.pipeline.ready
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800',
            'Pipeline',
            data.pipeline.ready ? 'Ready' : 'Degraded',
            `${data.pipeline.stageCount} stages active`,
          )}
          {card(
            data.binaries.ok === data.binaries.total
              ? 'bg-blue-50 border-blue-200 text-blue-800'
              : 'bg-red-50 border-red-200 text-red-800',
            'Binaries',
            `${data.binaries.ok}/${data.binaries.total}`,
            data.binaries.list.map((b) => b.name).join(' · '),
          )}
          {card(
            data.database.online
              ? 'bg-purple-50 border-purple-200 text-purple-800'
              : 'bg-red-50 border-red-200 text-red-800',
            'Database',
            data.database.online ? 'Online' : 'Offline',
            'SQLite connected',
          )}
          {card(
            data.storage.ok
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-red-50 border-red-200 text-red-800',
            'Storage',
            data.storage.ok ? 'OK' : 'Error',
            'Media directories ready',
          )}
        </div>
      )}
    </div>
  );
};

export default SystemStatus;
