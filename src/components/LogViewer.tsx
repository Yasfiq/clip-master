import React, { useEffect, useMemo, useRef, useState } from 'react';
import useJobStore from '@/stores/useJobStore';
import { Play, Pause, Trash2, Terminal } from 'lucide-react';

interface LogViewerProps {
  jobId: string;
  autoRefresh?: boolean;
  maxLines?: number;
  showTimestamps?: boolean;
  filterLevel?: 'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'STAGE';
}

interface LogEntry {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'STAGE' | 'DEBUG';
  message: string;
  timestamp: string;
  stage?: string;
}

const EMPTY_LOGS: any[] = [];

const LogViewer: React.FC<LogViewerProps> = ({
  jobId,
  autoRefresh = true,
  maxLines = 200,
  showTimestamps = true,
  filterLevel = 'ALL',
}) => {
  const storeLogs = useJobStore((state) => state.logs[jobId] ?? EMPTY_LOGS);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(filterLevel);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clearedAtRef = useRef<number | null>(null);

  const uiLogs = useMemo(
    () =>
      storeLogs.map((log) => ({
        id: log.id || Math.random().toString(36),
        level: log.level as any,
        message: log.message,
        timestamp: log.timestamp || new Date().toISOString(),
        stage: log.stage,
      })),
    [storeLogs],
  );

  useEffect(() => {
    setSelectedLevel(filterLevel);
  }, [filterLevel]);

  useEffect(() => {
    clearedAtRef.current = null;
    const fetchInitial = async () => {
      try {
        if (storeLogs.length > 0) return;
        const res = await fetch(`/api/jobs/${jobId}/logs?limit=${maxLines}`);
        const data = await res.json();
        const payload = data.success ? data.data : data;
        if (payload.logs) {
          useJobStore.getState().setLogs(jobId, payload.logs);
        }
      } catch (e) {
        // Silently fail
      }
    };
    fetchInitial();
  }, [jobId, maxLines, storeLogs.length]);

  useEffect(() => {
    if (!autoRefresh) return;
    const tick = async () => {
      if (clearedAtRef.current !== null) return;
      try {
        const storeLogs = useJobStore.getState().logs[jobId] || [];
        if (storeLogs.length === 0) return;
        const tail = storeLogs[storeLogs.length - 1];
        if (!tail?.timestamp) return;
        const res = await fetch(
          `/api/jobs/${jobId}/logs?limit=${maxLines}&since=${encodeURIComponent(tail.timestamp)}`,
        );
        const data = await res.json();
        const payload = data.success ? data.data : data;
        if (
          payload.logs &&
          payload.status &&
          payload.status !== 'RUNNING_PHASE1' &&
          payload.status !== 'RUNNING_PHASE2'
        ) {
          useJobStore.getState().mergeLogs(jobId, payload.logs);
        }
      } catch (e) {
        // Network blip
      }
    };
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, jobId, maxLines]);

  useEffect(() => {
    if (!isPaused && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [uiLogs, isPaused]);

  const filteredLogs =
    selectedLevel === 'ALL' ? uiLogs : uiLogs.filter((log) => log.level === selectedLevel);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'INFO':
        return 'text-sky-300';
      case 'WARN':
        return 'text-amber-300';
      case 'ERROR':
        return 'text-rose-400';
      case 'STAGE':
        return 'text-indigo-300';
      case 'DEBUG':
        return 'text-zinc-500';
      default:
        return 'text-zinc-300';
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'INFO':
        return 'bg-sky-950/60 text-sky-400 border border-sky-800/60';
      case 'WARN':
        return 'bg-amber-950/60 text-amber-400 border border-amber-800/60';
      case 'ERROR':
        return 'bg-rose-950/60 text-rose-400 border border-rose-800/60';
      case 'STAGE':
        return 'bg-indigo-950/60 text-indigo-400 border border-indigo-800/60';
      case 'DEBUG':
        return 'bg-zinc-800 text-zinc-400 border border-zinc-750';
      default:
        return 'bg-zinc-800 text-zinc-400 border border-zinc-750';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm mt-6 text-zinc-100">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
            Log Proses Pipeline
          </span>
          <span className="text-xs text-zinc-500">({filteredLogs.length} baris)</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Level filter */}
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value as typeof selectedLevel)}
            className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          >
            <option value="ALL">Semua Level</option>
            <option value="STAGE">Tahapan (STAGE)</option>
            <option value="INFO">Informasi (INFO)</option>
            <option value="WARN">Peringatan (WARN)</option>
            <option value="ERROR">Kesalahan (ERROR)</option>
          </select>

          {/* Pause/Resume */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`text-xs px-2.5 py-1 rounded border inline-flex items-center gap-1.5 transition-colors ${
              isPaused
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/60'
                : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-750'
            }`}
          >
            {isPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3" />}
            <span>{isPaused ? 'Lanjutkan' : 'Jeda'}</span>
          </button>

          {/* Clear */}
          <button
            onClick={() => {
              clearedAtRef.current = Date.now();
              useJobStore.getState().setLogs(jobId, []);
            }}
            className="text-xs px-2.5 py-1 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-750 hover:text-zinc-200 inline-flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Bersihkan</span>
          </button>
        </div>
      </div>

      {/* Log container */}
      <div ref={containerRef} className="h-80 overflow-y-auto bg-zinc-950 font-mono text-xs">
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-500">
            <div className="text-center py-8">
              <Terminal className="w-8 h-8 text-zinc-600 mx-auto mb-2 opacity-50" />
              <p className="text-zinc-400">Belum ada catatan log</p>
              <p className="text-[11px] text-zinc-600 mt-1">
                {autoRefresh ? 'Menunggu output eksekusi pipeline...' : ''}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-1">
            {filteredLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 py-0.5 leading-relaxed font-mono">
                {showTimestamps && (
                  <span className="text-zinc-500 shrink-0 select-none">
                    [{formatTime(log.timestamp)}]
                  </span>
                )}
                <span
                  className={`shrink-0 px-1.5 py-0.2 rounded text-[10px] font-semibold ${getLevelBadge(
                    log.level,
                  )}`}
                >
                  {log.level}
                </span>
                {log.stage && (
                  <span className="text-indigo-400 shrink-0 font-semibold">[{log.stage}]</span>
                )}
                <span className={`flex-1 break-all ${getLevelColor(log.level)}`}>
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Footer */}
      {isPaused && (
        <div className="px-4 py-2 bg-amber-950/40 border-t border-amber-900/50 text-xs text-amber-300">
          Auto-scroll dijeda. Klik &apos;Lanjutkan&apos; untuk melanjutkan streaming log realtime.
        </div>
      )}
    </div>
  );
};

export default LogViewer;
