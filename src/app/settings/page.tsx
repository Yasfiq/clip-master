'use client';

import Navigation from '@/components/Navigation';
import SettingsPanel from '@/components/SettingsPanel';
import FolderWatcherSettings from '@/components/FolderWatcherSettings';

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <Navigation activeTab="settings" />
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">Pengaturan Studio</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Konfigurasi parameter pipeline otomatis, auto-ingest folder watcher, dan kualitas video
          </p>
        </div>
        <FolderWatcherSettings />
        <SettingsPanel />
      </div>
    </main>
  );
}
