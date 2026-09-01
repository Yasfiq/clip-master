'use client';

import Navigation from '@/components/Navigation';
import ClipBrowser from '@/components/ClipBrowser';

export default function ClipsPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <Navigation activeTab="clips" />
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Clips</h1>
            <p className="text-sm text-gray-500 mt-1">Browse and download all generated clips</p>
          </div>
          <ClipBrowser />
        </div>
      </div>
    </main>
  );
}
