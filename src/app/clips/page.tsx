'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import ClipBrowser from '@/components/ClipBrowser';

function ClipsContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get('job') || undefined;
  return (
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Clips</h1>
          <p className="text-sm text-gray-500 mt-1">Browse and download all generated clips</p>
        </div>
        <ClipBrowser jobId={jobId} />
      </div>
    </div>
  );
}

export default function ClipsPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <Navigation activeTab="clips" />
      <Suspense
        fallback={
          <div className="p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
              <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
            </div>
          </div>
        }
      >
        <ClipsContent />
      </Suspense>
    </main>
  );
}
