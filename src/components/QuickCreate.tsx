'use client';

import React, { useState } from 'react';
import useJobStore from '@/stores/useJobStore';
import { useToastStore } from '@/stores/useToastStore';

interface QuickCreateProps {
  onSuccess?: (jobId: string) => void;
  className?: string;
}

const QuickCreate: React.FC<QuickCreateProps> = ({ onSuccess, className = '' }) => {
  const addJob = useJobStore((state) => state.addJob);
  const setLoading = useJobStore((state) => state.setLoading);
  const addToast = useToastStore((state) => state.addToast);

  const [url, setUrl] = useState('');
  const [sourceType, setSourceType] = useState<'youtube' | 'local' | 'url'>('youtube');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim() && !selectedFile && sourceType !== 'local') {
      addToast('Please provide a URL or select a file', 'warning');
      return;
    }

    setIsSubmitting(true);
    setLoading(true);

    try {
      // Create job via API
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: sourceType !== 'local' ? url : undefined,
          sourcePath: sourceType === 'local' && selectedFile ? selectedFile.name : undefined,
        }),
      });

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.error?.message || 'Failed to create job');
      }
      const responseBody = await res.json();
      // API returns { success: true, data: { ...job } } envelope.
      const job = responseBody.success ? responseBody.data : responseBody;

      // Auto-start job
      const startRes = await fetch(`/api/jobs/${job.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      if (!startRes.ok) {
        const startErr = await startRes.json().catch(() => ({}));
        throw new Error(startErr.error?.message || 'Failed to start job');
      }

      // Map to UI job type
      const jobData = {
        id: job.id,
        name: job.sourceFilename || job.sourceUrl || 'Unknown source',
        sourceUrl: job.sourceUrl || undefined,
        status: 'RUNNING' as const,
        // Prisma stores progress as 0..1, UI shows 0..100.
        progress: typeof job.progress === 'number' ? Math.round(job.progress * 100) : 0,
        clipsCount: job.exportedClipsCount ?? 0,
        duration: job.sourceDuration ?? undefined,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };

      addJob(jobData);
      useJobStore.getState().connectSSE(job.id);

      addToast('Job started successfully', 'success');

      // Reset form
      setUrl('');
      setSelectedFile(null);
      onSuccess?.(jobData.id);
    } catch (err: any) {
      addToast(err.message || 'Failed to create job', 'error');
    } finally {
      setIsSubmitting(false);
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    if (file) {
      setUrl(file.name);
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
        {sourceType !== 'local' && (
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

        {/* File upload */}
        {sourceType === 'local' && (
          <div className="mb-4">
            <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-1">
              Video File
            </label>
            <div className="mt-1 flex items-center">
              <label
                htmlFor="file-upload"
                className={`flex-1 cursor-pointer py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-center hover:border-gray-400 transition-colors ${
                  selectedFile ? 'bg-gray-50' : ''
                }`}
              >
                {selectedFile ? (
                  <div className="text-sm text-gray-700">📁 {selectedFile.name}</div>
                ) : (
                  <div className="text-sm text-gray-500">
                    Click to upload or drag & drop
                    <br />
                    <span className="text-xs">MP4, MKV, MOV up to 2GB</span>
                  </div>
                )}
              </label>
              <input
                id="file-upload"
                name="file-upload"
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={handleFileChange}
                disabled={isSubmitting}
              />
            </div>
          </div>
        )}

        {/* Config summary */}
        <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-medium text-gray-700 mb-1">
            Pipeline Config (from defaults)
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-gray-600">
            <div>
              Min Duration: <span className="font-medium">10s</span>
            </div>
            <div>
              Target Duration: <span className="font-medium">30s</span>
            </div>
            <div>
              Ad Filter: <span className="font-medium">Enabled</span>
            </div>
            <div>
              Subtitles: <span className="font-medium">Enabled</span>
            </div>
          </div>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={isSubmitting || (!url && !selectedFile)}
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
