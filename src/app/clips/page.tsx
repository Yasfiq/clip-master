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
          <h1 className="text-2xl font-bold text-zinc-100">Galeri Klip Video</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Koleksi klip vertikal siap unggah untuk media sosial Anda
          </p>
        </div>
        <ClipBrowser jobId={jobId} />
      </div>
    </div>
  );
}

export default function ClipsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <Navigation activeTab="clips" />
      <Suspense
        fallback={
          <div className="p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
              <div className="h-24 bg-zinc-900 border border-zinc-800 rounded-lg animate-pulse" />
            </div>
          </div>
        }
      >
        <ClipsContent />
      </Suspense>
    </main>
  );
}
