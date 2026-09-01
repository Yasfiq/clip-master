'use client';

import React, { useState, useEffect } from 'react';

interface PipelineConfig {
  adFilterEnabled: boolean;
  adScoreThreshold: number;
  minSegmentDuration: number;
  maxSegmentDuration: number;
  targetDuration: number;
  mergeThreshold: number;
  gradingPreset: string;
  subtitleEnabled: boolean;
  subtitleLang: string;
  videoBitrate: string;
  audioBitrate: string;
  targetResolution: string;
  audioCodec: string;
  videoCodec: string;
  h264Preset: string;
  keyframeInterval: number;
  fastStart: boolean;
}

interface SettingsPanelProps {
  className?: string;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ className = '' }) => {
  const [config, setConfig] = useState<Partial<PipelineConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'video' | 'export'>('pipeline');

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        setConfig(data.config || {});
        setLoading(false);
      })
      .catch(() => {
        // Use defaults on error
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error('Failed to save');
      setMessage({ type: 'success', text: 'Settings saved successfully' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (key: keyof PipelineConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-xl shadow-sm p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-10 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'video', label: 'Video' },
    { id: 'export', label: 'Export' },
  ] as const;

  return (
    <div className={`bg-white rounded-xl shadow-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Configure pipeline behavior</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Pipeline Tab */}
        {activeTab === 'pipeline' && (
          <>
            {/* Ad Filter */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
                Advertisement Filter
              </h3>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.adFilterEnabled ?? true}
                  onChange={(e) => updateConfig('adFilterEnabled', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Enable ad detection</span>
              </label>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ad Score Threshold ({config.adScoreThreshold ?? 0.75})
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={config.adScoreThreshold ?? 0.75}
                  onChange={(e) => updateConfig('adScoreThreshold', parseFloat(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Higher = stricter filtering. Videos above this threshold rejected as pure ads.
                </p>
              </div>
            </div>

            {/* Segment Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
                Segment Settings
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Duration (s)
                  </label>
                  <input
                    type="number"
                    value={config.minSegmentDuration ?? 10}
                    onChange={(e) => updateConfig('minSegmentDuration', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Duration (s)
                  </label>
                  <input
                    type="number"
                    value={config.maxSegmentDuration ?? 60}
                    onChange={(e) => updateConfig('maxSegmentDuration', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Duration (s)
                  </label>
                  <input
                    type="number"
                    value={config.targetDuration ?? 30}
                    onChange={(e) => updateConfig('targetDuration', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Merge Threshold (s)
                  </label>
                  <input
                    type="number"
                    value={config.mergeThreshold ?? 5}
                    onChange={(e) => updateConfig('mergeThreshold', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    min="0"
                  />
                </div>
              </div>
            </div>

            {/* Color Grading */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
                Color Grading
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preset</label>
                <select
                  value={config.gradingPreset ?? 'natural'}
                  onChange={(e) => updateConfig('gradingPreset', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="natural">Natural (no grading)</option>
                  <option value="vivid">Vivid (saturated colors)</option>
                  <option value="cinematic">Cinematic (teal/orange)</option>
                  <option value="warm">Warm (golden tones)</option>
                  <option value="cool">Cool (blue tones)</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* Video Tab */}
        {activeTab === 'video' && (
          <>
            {/* Subtitles */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
                Subtitles
              </h3>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.subtitleEnabled ?? true}
                  onChange={(e) => updateConfig('subtitleEnabled', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Enable auto-subtitles (Whisper)</span>
              </label>
              {config.subtitleEnabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Language Code
                  </label>
                  <select
                    value={config.subtitleLang ?? 'id'}
                    onChange={(e) => updateConfig('subtitleLang', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="id">Indonesian</option>
                    <option value="en">English</option>
                    <option value="auto">Auto-detect</option>
                  </select>
                </div>
              )}
            </div>

            {/* Resolution */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
                Resolution
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Resolution
                </label>
                <select
                  value={config.targetResolution ?? '1080p'}
                  onChange={(e) => updateConfig('targetResolution', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="1080p">1080p (1920x1080)</option>
                  <option value="720p">720p (1280x720)</option>
                  <option value="480p">480p (854x480)</option>
                  <option value="original">Original resolution</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <>
            {/* Codec */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
                Codec Settings
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Video Codec
                  </label>
                  <select
                    value={config.videoCodec ?? 'h264'}
                    onChange={(e) => updateConfig('videoCodec', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="h264">H.264 (best compatibility)</option>
                    <option value="h265">H.265/HEVC (smaller size)</option>
                    <option value="vp9">VP9 (WebM support)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Audio Codec
                  </label>
                  <select
                    value={config.audioCodec ?? 'aac'}
                    onChange={(e) => updateConfig('audioCodec', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="aac">AAC (best compatibility)</option>
                    <option value="mp3">MP3</option>
                    <option value="opus">Opus (smaller size)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Quality */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
                Quality
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Video Bitrate
                  </label>
                  <select
                    value={config.videoBitrate ?? 'auto'}
                    onChange={(e) => updateConfig('videoBitrate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="high">High (8 Mbps)</option>
                    <option value="medium">Medium (4 Mbps)</option>
                    <option value="low">Low (2 Mbps)</option>
                    <option value="auto">Auto (CRF-based)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Audio Bitrate
                  </label>
                  <select
                    value={config.audioBitrate ?? '128k'}
                    onChange={(e) => updateConfig('audioBitrate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="192k">192 kbps</option>
                    <option value="128k">128 kbps</option>
                    <option value="96k">96 kbps</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Advanced */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
                Advanced
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    H.264 Preset
                  </label>
                  <select
                    value={config.h264Preset ?? 'medium'}
                    onChange={(e) => updateConfig('h264Preset', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="slow">Slow (smaller file, slower encode)</option>
                    <option value="medium">Medium (balanced)</option>
                    <option value="fast">Fast (larger file, faster encode)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Keyframe Interval (s)
                  </label>
                  <input
                    type="number"
                    value={config.keyframeInterval ?? 2}
                    onChange={(e) => updateConfig('keyframeInterval', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    min="1"
                    max="10"
                  />
                </div>
              </div>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.fastStart ?? true}
                  onChange={(e) => updateConfig('fastStart', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <div>
                  <span className="text-sm text-gray-700">Fast Start</span>
                  <p className="text-xs text-gray-500">
                    Enable streaming-friendly MP4 (slightly larger file)
                  </p>
                </div>
              </label>
            </div>
          </>
        )}

        {/* Message */}
        {message && (
          <div
            className={`p-3 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Save Button */}
        <div className="pt-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
