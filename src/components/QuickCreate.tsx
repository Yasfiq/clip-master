import React, { useEffect, useState } from 'react';
import useJobStore from '@/stores/useJobStore';
import { useToastStore } from '@/stores/useToastStore';
import { Video, Globe, HardDrive, Play, Loader2 } from 'lucide-react';

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
        sourceType === 'local'
          ? 'Masukkan jalur video di mesin ini'
          : 'Masukkan URL video yang valid',
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
        throw new Error(errPayload.error?.message || 'Gagal membuat job');
      }
      const responseBody = await res.json();
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
          throw new Error(startErr.error?.message || 'Gagal memulai job');
        }
      } else {
        started = true;
      }

      // Map to UI job type
      const jobData = {
        id: job.id,
        name: job.sourceFilename || job.sourceUrl || 'Sumber video',
        sourceUrl: job.sourceUrl || undefined,
        status: started ? ('RUNNING_PHASE1' as const) : ('PENDING' as const),
        progress: typeof job.progress === 'number' ? Math.round(job.progress * 100) : 0,
        clipsCount: job.exportedClipsCount ?? 0,
        duration: job.sourceDuration ?? undefined,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };

      addJob(jobData);
      if (started) useJobStore.getState().connectSSE(job.id);

      addToast(
        started ? 'Job berhasil dimulai' : 'Job masuk antrean (job lain sedang berjalan)',
        started ? 'success' : 'info',
      );

      // Reset form
      setUrl('');
      setLocalPath('');
      onSuccess?.(jobData.id);
    } catch (err: any) {
      console.error('QuickCreate submit failed:', err);
      addToast(err.message || 'Gagal membuat job', 'error');
    } finally {
      setIsSubmitting(false);
      setLoading(false);
    }
  };

  return (
    <div
      className={`bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm text-zinc-100 ${className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
          Buat Job Baru
        </h3>
        <span className="sr-only">Create New Job</span>
        <span className="text-[11px] text-zinc-400">Ingest video</span>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Source type selector */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-zinc-300 mb-2">Sumber Video</label>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => setSourceType('youtube')}
              aria-label="YouTube"
              className={`inline-flex items-center justify-center min-h-[44px] py-2 px-2.5 text-xs font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 ${
                sourceType === 'youtube'
                  ? 'bg-zinc-100 text-zinc-950 font-semibold border-transparent shadow-sm'
                  : 'bg-zinc-800/80 text-zinc-300 border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100'
              }`}
            >
              <Video className="w-3.5 h-3.5 mr-1.5 shrink-0 text-red-400" />
              <span>YouTube</span>
            </button>
            <button
              type="button"
              onClick={() => setSourceType('url')}
              aria-label="Direct URL"
              className={`inline-flex items-center justify-center min-h-[44px] py-2 px-2.5 text-xs font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 ${
                sourceType === 'url'
                  ? 'bg-zinc-100 text-zinc-950 font-semibold border-transparent shadow-sm'
                  : 'bg-zinc-800/80 text-zinc-300 border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100'
              }`}
            >
              <Globe className="w-3.5 h-3.5 mr-1.5 shrink-0 text-sky-400" />
              <span>URL Langsung</span>
            </button>
            <button
              type="button"
              onClick={() => setSourceType('local')}
              aria-label="Local File"
              className={`inline-flex items-center justify-center min-h-[44px] py-2 px-2.5 text-xs font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 ${
                sourceType === 'local'
                  ? 'bg-zinc-100 text-zinc-950 font-semibold border-transparent shadow-sm'
                  : 'bg-zinc-800/80 text-zinc-300 border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5 mr-1.5 shrink-0 text-emerald-400" />
              <span>File Lokal</span>
            </button>
          </div>
        </div>

        {/* URL input */}
        {(sourceType === 'youtube' || sourceType === 'url') && (
          <div className="mb-4">
            <label htmlFor="url-input" className="block text-xs font-medium text-zinc-300 mb-1.5">
              {sourceType === 'youtube' ? 'Tautan YouTube' : 'Tautan Video (Direct URL)'}
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
              className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-lg text-sm shadow-inner focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 transition-colors"
              disabled={isSubmitting}
            />
          </div>
        )}

        {/* Local path input */}
        {sourceType === 'local' && (
          <div className="mb-4">
            <label htmlFor="local-path" className="block text-xs font-medium text-zinc-300 mb-1.5">
              Jalur File Video (di mesin ini)
            </label>
            <input
              id="local-path"
              type="text"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              placeholder="/home/username/videos/sample.mp4"
              className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-lg font-mono text-xs shadow-inner focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 transition-colors"
              disabled={isSubmitting}
            />
            <p className="mt-1.5 text-[11px] text-zinc-400">
              Jalur absolut ke file video lokal. File disalin ke media/sources dan diproses di
              komputer ini.
            </p>
          </div>
        )}

        {/* Config summary */}
        <div className="mb-5 bg-zinc-950/60 border border-zinc-800 rounded-lg p-3">
          <div className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider mb-2">
            Konfigurasi Aktif {config ? '(Default)' : ''}
          </div>
          {config ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-zinc-400">
              <div>
                Segmen Min:{' '}
                <span className="font-semibold text-zinc-200">{config.minSegmentDuration} dtk</span>
              </div>
              <div>
                Target:{' '}
                <span className="font-semibold text-zinc-200">{config.targetDuration} dtk</span>
              </div>
              <div>
                Filter Iklan:{' '}
                <span
                  className={`font-semibold ${config.adFilterEnabled ? 'text-emerald-400' : 'text-zinc-400'}`}
                >
                  {config.adFilterEnabled ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
              <div>
                Subtitle:{' '}
                <span
                  className={`font-semibold ${config.subtitleEnabled ? 'text-emerald-400' : 'text-zinc-400'}`}
                >
                  {config.subtitleEnabled ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-zinc-500">Memuat konfigurasi...</div>
          )}
        </div>

        {/* Submit button */}
        <button
          type="submit"
          aria-label="Start Processing"
          disabled={isSubmitting || !sourceValue.trim()}
          className="w-full min-h-[44px] py-2.5 px-4 rounded-lg font-semibold text-sm text-zinc-950 bg-zinc-100 hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
              <span>Membuat Job...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current text-zinc-950" />
              <span>Mulai Proses Video</span>
              <span className="sr-only">Start Processing</span>
            </>
          )}
        </button>

        <p className="mt-2.5 text-[11px] text-zinc-500 text-center">
          Proses berjalan lokal • Dapat dibatalkan sewaktu-waktu
        </p>
      </form>
    </div>
  );
};

export default QuickCreate;
