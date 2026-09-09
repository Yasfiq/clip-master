'use client';

import React, { useEffect, useState } from 'react';
import useJobStore from '@/stores/useJobStore';
import { useToastStore } from '@/stores/useToastStore';

interface QuickCreateProps {
  onSuccess?: (jobId: string) => void;
  className?: string;
}

interface ConfigSummary {
  minSegmentDuration: number;
  targetDuration: number;
  adFilterEnabled: boolean;
  subtitleEnabled: boolean;
}

const QuickCreate: React.FC<QuickCreateProps> = ({ onSuccess, className = '' }) => {
  const addJob = useJobStore((state) => state.addJob);
  const setLoading = useJobStore((state) => state.setLoading);
  const addToast = useToastStore((state) => state.addToast);

  const [url, setUrl] = useState('');
  const [sourceType, setSourceType] = useState<'youtube' | 'url' | 'local'>('youtube');
  const [localPath, setLocalPath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [config, setConfig] = useState<ConfigSummary | null>(null);

  // Load the active config so the summary panel shows real values.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const configs = payload?.success ? payload.data : payload;
        const active = Array.isArray(configs)
          ? configs.find((c: any) => c.isDefault) || configs[0]
          : configs;
        if (active) {
          setConfig({
            minSegmentDuration: active.minSegmentDuration,
            targetDuration: active.targetDuration,
            adFilterEnabled: active.adFilterEnabled,
            subtitleEnabled: active.subtitleEnabled,
          });
        }
      })
      .catch(() => {
        /* keep null — summary hides itself */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sourceValue = sourceType === 'local' ? localPath : url;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!sourceValue.trim()) {
      addToast(
        sourceType === 'local' ? 'Provide the video path on this machine' : 'Please provide a URL',
        'warning',
      );
      return;
    }

    setIsSubmitting(true);
    setLoading(true);

    try {
      // Create job via API. Local jobs take a path on the server filesystem
      // (localhost single-operator setup); the server copies it into media/sources.
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl:
            sourceType === 'youtube' || sourceType === 'url' ? sourceValue.trim() : undefined,
          sourcePath: sourceType === 'local' ? sourceValue.trim() : undefined,
        }),
      });

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.error?.message || 'Failed to create job');
      }
      const responseBody = await res.json();
      // API returns { success: true, data: { ...job } } envelope.
      const job = responseBody.success ? responseBody.data : responseBody;

      // Auto-start job. With one-active-job concurrency the start can fail
      // with JOB_ALREADY_RUNNING; the job then simply queues in PENDING and
      // the operator starts it from the list later.
      let started = false;
      const startRes = await fetch(`/api/jobs/${job.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      if (!startRes.ok) {
        const startErr = await startRes.json().catch(() => ({}));
        if (startErr.error?.code !== 'JOB_ALREADY_RUNNING') {
          throw new Error(startErr.error?.message || 'Failed to start job');
        }
      } else {
        started = true;
      }

      // Map to UI job type
      const jobData = {
        id: job.id,
        name: job.sourceFilename || job.sourceUrl || 'Unknown source',
        sourceUrl: job.sourceUrl || undefined,
        status: started ? ('RUNNING_PHASE1' as const) : ('PENDING' as const),
        // Prisma stores progress as 0..1, UI shows 0..100.
        progress: typeof job.progress === 'number' ? Math.round(job.progress * 100) : 0,
        clipsCount: job.exportedClipsCount ?? 0,
        duration: job.sourceDuration ?? undefined,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };

      addJob(jobData);
      if (started) useJobStore.getState().connectSSE(job.id);

      addToast(
        started ? 'Job started successfully' : 'Job queued — another job is running',
        started ? 'success' : 'info',
      );

      // Reset form
      setUrl('');
      setLocalPath('');
      onSuccess?.(jobData.id);
    } catch (err: any) {
      console.error('QuickCreate submit failed:', err);
      addToast(err.message || 'Failed to create job', 'error');
    } finally {
      setIsSubmitting(false);
      setLoading(false);
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Job</h3>

      <form onSubmit={handleSubmit}>
        {/* Source type selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Source Type</label>
          <div className="flex space-x-2">
            {(['youtube', 'url', 'local'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSourceType(type)}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                  sourceType === type
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {type === 'youtube' ? 'YouTube' : type === 'url' ? 'URL' : 'Local File'}
              </button>
            ))}
          </div>
        </div>

        {/* URL input */}
        {(sourceType === 'youtube' || sourceType === 'url') && (
          <div className="mb-4">
            <label htmlFor="url-input" className="block text-sm font-medium text-gray-700 mb-1">
              {sourceType === 'youtube' ? 'YouTube URL' : 'Video URL'}
            </label>
            <input
              id="url-input"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                sourceType === 'youtube'
                  ? 'https://www.youtube.com/watch?v=...'
                  : 'https://example.com/video.mp4'
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              disabled={isSubmitting}
            />
          </div>
        )}

        {/* Local path input */}
        {sourceType === 'local' && (
          <div className="mb-4">
            <label htmlFor="local-path" className="block text-sm font-medium text-gray-700 mb-1">
              Video Path (on this machine)
            </label>
            <input
              id="local-path"
              type="text"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              placeholder="/home/you/videos/clip.mp4"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono text-sm"
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-500">
              Absolute path to a video file on this machine. It is copied into media/sources and
              processed locally — nothing leaves your disk.
            </p>
          </div>
        )}

        {/* Config summary */}
        <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-medium text-gray-700 mb-1">
            Pipeline Config{config ? ' (active defaults)' : ''}
          </div>
          {config ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-gray-600">
              <div>
                Min Segment: <span className="font-medium">{config.minSegmentDuration}s</span>
              </div>
              <div>
                Target Duration: <span className="font-medium">{config.targetDuration}s</span>
              </div>
              <div>
                Ad Filter:{' '}
                <span className="font-medium">{config.adFilterEnabled ? 'Enabled' : 'Off'}</span>
              </div>
              <div>
                Subtitles:{' '}
                <span className="font-medium">{config.subtitleEnabled ? 'Enabled' : 'Off'}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500">Loading active config…</div>
          )}
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={isSubmitting || !sourceValue.trim()}
          className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? (
            <>
              <span className="inline-block mr-2">⏳</span>
              Creating job...
            </>
          ) : (
            <>
              <span className="inline-block mr-2">🚀</span>
              Start Processing
            </>
          )}
        </button>

        <p className="mt-3 text-xs text-gray-500 text-center">
          Processing runs in background • Cancel anytime • Progress updates live
        </p>
      </form>
    </div>
  );
};

export default QuickCreate;
