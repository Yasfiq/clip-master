'use client';

import Navigation from '@/components/Navigation';
import SettingsPanel from '@/components/SettingsPanel';

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <Navigation activeTab="settings" />
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure pipeline behavior, video quality, and export settings
          </p>
        </div>
        <SettingsPanel />
      </div>
    </main>
  );
}
