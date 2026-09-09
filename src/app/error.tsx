'use client';

import { useEffect } from 'react';

/**
 * App Router error boundary. A render crash in any page bubbles here instead
 * of blanking the whole app; the operator gets a retry button. Only catches
 * render-phase errors — API/route errors are handled by their own handlers.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the crash for local diagnosis (single-operator, no remote sink).
    console.error('App error boundary caught:', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-500 mb-6">
          A rendering error occurred. Your jobs and clips are safe on disk — reload or retry to
          continue.
        </p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
