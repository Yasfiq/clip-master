'use client';

import React, { useEffect, useRef, useState } from 'react';
import useJobStore from '@/stores/useJobStore';

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

const LogViewer: React.FC<LogViewerProps> = ({
  jobId,
  autoRefresh = true,
  maxLines = 200,
  showTimestamps = true,
  filterLevel = 'ALL',
}) => {
  const logs = useJobStore((s) => s.logs[jobId] || []);
  const addLog = useJobStore((s) => s.addLog);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(filterLevel);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Read directly from SSE store
  const storeLogs = useJobStore((state) => state.logs[jobId] || []);

  const uiLogs = storeLogs.map((log) => ({
    id: log.id || Math.random().toString(36),
    level: log.level as any,
    message: log.message,
    timestamp: log.timestamp || new Date().toISOString(),
    stage: log.stage,
  }));

  // Initial fetch missing logs if we just mounted
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        if (storeLogs.length > 0) return;
        const res = await fetch(`/api/jobs/${jobId}/logs?limit=${maxLines}`);
        const data = await res.json();
        if (data.logs) {
          useJobStore.getState().setLogs(jobId, data.logs);
        }
      } catch (e) {
        // Silently fail
      }
    };
    fetchInitial();
  }, [jobId]);

  // Auto-scroll to bottom
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
        return 'text-blue-600';
      case 'WARN':
        return 'text-amber-600';
      case 'ERROR':
        return 'text-red-600';
      case 'STAGE':
        return 'text-purple-600';
      case 'DEBUG':
        return 'text-gray-500';
      default:
        return 'text-gray-700';
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'INFO':
        return 'bg-blue-100 text-blue-700';
      case 'WARN':
        return 'bg-amber-100 text-amber-700';
      case 'ERROR':
        return 'bg-red-100 text-red-700';
      case 'STAGE':
        return 'bg-purple-100 text-purple-700';
      case 'DEBUG':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Job Logs</span>
          <span className="text-xs text-gray-500">({filteredLogs.length} entries)</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Level filter */}
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value as typeof selectedLevel)}
            className="text-xs border border-gray-300 rounded px-2 py-1"
          >
            <option value="ALL">All</option>
            <option value="STAGE">Stages</option>
            <option value="INFO">Info</option>
            <option value="WARN">Warnings</option>
            <option value="ERROR">Errors</option>
          </select>

          {/* Pause/Resume */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`text-xs px-2 py-1 rounded border ${
              isPaused
                ? 'bg-green-100 text-green-700 border-green-300'
                : 'bg-gray-100 text-gray-600 border-gray-300'
            }`}
          >
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>

          {/* Clear */}
          <button
            onClick={() => useJobStore.getState().setLogs(jobId, [])}
            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Log container */}
      <div ref={containerRef} className="h-80 overflow-y-auto bg-gray-900 font-mono text-xs">
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center py-8">
              <div className="text-3xl mb-2">📋</div>
              <p>No logs yet</p>
              <p className="text-xs mt-1">{autoRefresh ? 'Waiting for pipeline output...' : ''}</p>
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {filteredLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 py-0.5">
                {showTimestamps && (
                  <span className="text-gray-500 shrink-0">[{formatTime(log.timestamp)}]</span>
                )}
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${getLevelBadge(
                    log.level,
                  )}`}
                >
                  {log.level}
                </span>
                {log.stage && <span className="text-purple-400 shrink-0">[{log.stage}]</span>}
                <span className={`flex-1 ${getLevelColor(log.level)}`}>{log.message}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Footer */}
      {isPaused && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-700">
          ⏸ Logs paused — auto-scroll disabled. Click Resume to continue.
        </div>
      )}
    </div>
  );
};

export default LogViewer;
