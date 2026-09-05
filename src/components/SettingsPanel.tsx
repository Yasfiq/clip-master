'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CLIP_LENGTH_OPTIONS,
  RESOLUTION_OPTIONS,
  clipLengthToTargetSeconds,
  targetSecondsToClipLength,
  resolutionToTarget,
} from '@/pipeline/logic/configPresets';

/**
 * The writable config surface this panel edits — exactly the columns the
 * pipeline reads (see prisma/schema.prisma PipelineConfig). Anything not
 * listed here would be UI-only illusion, so it is deliberately absent.
 */
interface PipelineConfigValues {
  adFilterEnabled: boolean;
  adScoreThreshold: number;
  minSegmentDuration: number;
  targetDuration: number;
  maxClips: number;
  colorGrading: string;
  backsoundEnabled: boolean;
  subtitleEnabled: boolean;
  targetResolution: string;
}

const DEFAULT_VALUES: PipelineConfigValues = {
  adFilterEnabled: true,
  adScoreThreshold: 0.75,
  minSegmentDuration: 120,
  targetDuration: 60,
  maxClips: 5,
  colorGrading: 'natural',
  backsoundEnabled: true,
  subtitleEnabled: true,
  targetResolution: '1080x1920',
};

interface SettingsPanelProps {
  className?: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SettingsPanel: React.FC<SettingsPanelProps> = ({ className = '' }) => {
  const [config, setConfig] = useState<PipelineConfigValues>(DEFAULT_VALUES);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState('');

  // Load the active (default) config from the server. GET /api/config returns
  // an array under { data }; the default row is the active one.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/config')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const configs = payload?.success ? payload.data : payload;
        const active = Array.isArray(configs)
          ? configs.find((c: any) => c.isDefault) || configs[0]
          : configs;
        if (active) {
          setConfig((prev) => ({ ...prev, ...pickWritable(active) }));
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true); // keep defaults, surface save errors later
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaveState('saving');
    setSaveMessage('');
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'default',
          isDefault: true,
          ...config,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error?.message || `HTTP ${res.status}`);
      }
      setSaveState('saved');
      setSaveMessage('Settings saved — they apply to the next job you create.');
      window.setTimeout(() => setSaveState('idle'), 4000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveState('error');
      setSaveMessage(msg);
    }
  };

  const update = <K extends keyof PipelineConfigValues>(key: K, value: PipelineConfigValues[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // —— Clip Length ——
  const clipLengthId = targetSecondsToClipLength(config.targetDuration);
  const onClipLength = (id: string) => {
    const seconds = clipLengthToTargetSeconds(id);
    if (seconds === undefined) {
      // Auto: pipeline picks from the source. Persist the default target so a
      // job always has a concrete row value.
      update('targetDuration', DEFAULT_VALUES.targetDuration);
    } else {
      update('targetDuration', seconds);
    }
  };

  const saveTone =
    saveState === 'saved'
      ? 'text-green-700 bg-green-50 border-green-200'
      : saveState === 'error'
        ? 'text-red-700 bg-red-50 border-red-200'
        : 'border-transparent';

  return (
    <div className={`bg-white rounded-xl shadow-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Clip Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          How your clips are made. The defaults are tuned for Shorts — most people never need to
          touch the Advanced section.
        </p>
      </div>

      <div className="p-6 space-y-8">
        {/* ——— Create section (laypeople) ——— */}
        <section aria-labelledby="create-heading">
          <h3
            id="create-heading"
            className="text-xs font-semibold text-gray-400 uppercase tracking-wider"
          >
            New clips
          </h3>

          {/* Clip Length */}
          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <label className="text-sm font-medium text-gray-900">Clip length</label>
              <span className="text-xs text-gray-400 tabular-nums">
                {clipLengthId === 'auto'
                  ? 'Automatic — pick the best length per video'
                  : `${config.targetDuration}s clips`}
              </span>
            </div>
            <div
              className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2"
              role="radiogroup"
              aria-label="Clip length"
            >
              {CLIP_LENGTH_OPTIONS.map((opt) => {
                const selected = clipLengthId === opt.id;
                // Mobile shows a short name; desktop includes the duration.
                const [name, dur] = opt.label.split(' ');
                const mobileLabel = name;
                const desktopLabel = opt.label;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onClipLength(opt.id)}
                    className={`px-2 py-2.5 text-sm font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${
                      selected
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-700'
                    }`}
                  >
                    <span className="sm:hidden">{mobileLabel}</span>
                    <span className="hidden sm:inline">{desktopLabel}</span>
                    <span className="sr-only">{dur ? ` ${dur}` : ''}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400 px-0.5">
              {clipLengthId === 'auto'
                ? 'Pipeline picks the best length per video.'
                : `Each clip targets ${config.targetDuration} seconds.`}
            </p>
          </div>

          {/* Captions */}
          <div className="mt-7 flex items-center justify-between gap-6 rounded-lg border border-gray-200 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-gray-900">Auto captions</p>
              <p className="text-sm text-gray-500 mt-0.5">
                Transcribe speech and burn subtitles into each clip
              </p>
            </div>
            <Toggle
              checked={config.subtitleEnabled}
              onChange={(v) => update('subtitleEnabled', v)}
              label="Auto captions"
            />
          </div>
        </section>

        {/* ——— Advanced (collapsed by default) ——— */}
        <AdvancedSection config={config} update={update} />

        {/* Save bar */}
        <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-4">
          <p
            className={`text-sm px-3 py-2 rounded-md border ${saveTone} ${saveMessage ? '' : 'invisible'}`}
            role="status"
            aria-live="polite"
            data-testid="settings-save-status"
          >
            {saveMessage || '\u00a0'}
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveState === 'saving'}
            className="inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 transition-colors"
          >
            {saveState === 'saving' ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Copy only writable config keys from a server row (tolerates extra columns). */
function pickWritable(row: Record<string, unknown>): Partial<PipelineConfigValues> {
  const out: Partial<PipelineConfigValues> = {};
  for (const key of Object.keys(DEFAULT_VALUES) as (keyof PipelineConfigValues)[]) {
    if (row[key] !== undefined && row[key] !== null) {
      (out as Record<string, unknown>)[key] = row[key];
    }
  }
  return out;
}

/* ————— Toggle switch ————— */
const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({
  checked,
  onChange,
  label,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
      checked ? 'bg-blue-600' : 'bg-gray-300'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

/* ————— Advanced collapsible ————— */
const AdvancedSection: React.FC<{
  config: PipelineConfigValues;
  update: <K extends keyof PipelineConfigValues>(k: K, v: PipelineConfigValues[K]) => void;
}> = ({ config, update }) => {
  const [open, setOpen] = useState(false);
  const panelId = 'advanced-panel';

  return (
    <section aria-labelledby="advanced-heading">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md px-1 py-1"
      >
        <span className="flex items-center gap-2">
          <span id="advanced-heading">Advanced</span>
          <span className="text-xs font-normal text-gray-400">
            Ad filter · number of clips · output quality
          </span>
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div id={panelId} className="mt-4 space-y-6 border-t border-gray-100 pt-5">
          {/* Ad filter */}
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-gray-900">Reject pure ad videos</p>
              <p className="text-sm text-gray-500 mt-0.5">
                Videos that are nothing but an advertisement are stopped before processing. Videos
                with ads inside real content still go through.
              </p>
            </div>
            <Toggle
              checked={config.adFilterEnabled}
              onChange={(v) => update('adFilterEnabled', v)}
              label="Reject pure ad videos"
            />
          </div>

          {config.adFilterEnabled && (
            <div className="pl-1">
              <div className="flex items-baseline justify-between">
                <label htmlFor="ad-threshold" className="text-sm font-medium text-gray-700">
                  Filter strictness
                </label>
                <span className="text-xs text-gray-400 tabular-nums">
                  {Math.round(config.adScoreThreshold * 100)}%
                </span>
              </div>
              <input
                id="ad-threshold"
                type="range"
                min="50"
                max="95"
                step="5"
                value={Math.round(config.adScoreThreshold * 100)}
                onChange={(e) => update('adScoreThreshold', Number(e.target.value) / 100)}
                className="mt-2 w-full accent-blue-600"
              />
              <div className="flex justify-between text-[11px] text-gray-400">
                <span>Fewer videos rejected</span>
                <span>More strict</span>
              </div>
            </div>
          )}

          {/* Max clips */}
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="max-clips" className="text-sm font-medium text-gray-900">
                Maximum clips per video
              </label>
              <span className="text-sm tabular-nums text-gray-700 font-medium">
                {config.maxClips}
              </span>
            </div>
            <input
              id="max-clips"
              type="range"
              min="1"
              max="10"
              step="1"
              value={config.maxClips}
              onChange={(e) => update('maxClips', Number(e.target.value))}
              className="mt-2 w-full accent-blue-600"
            />
            <div className="flex justify-between text-[11px] text-gray-400">
              <span>Just the best</span>
              <span>More clips</span>
            </div>
          </div>

          {/* Backsound */}
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-gray-900">Background music</p>
              <p className="text-sm text-gray-500 mt-0.5">
                Duck a music track under the voice when one is present in
                <span className="font-mono text-xs"> media/assets/ </span>
              </p>
            </div>
            <Toggle
              checked={config.backsoundEnabled}
              onChange={(v) => update('backsoundEnabled', v)}
              label="Background music"
            />
          </div>

          {/* Resolution */}
          <div>
            <label htmlFor="resolution" className="text-sm font-medium text-gray-900">
              Output quality
            </label>
            <select
              id="resolution"
              value={config.targetResolution}
              onChange={(e) => update('targetResolution', e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {RESOLUTION_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Segment minimum — matches analyze window lower bound */}
          <div>
            <label htmlFor="min-segment" className="text-sm font-medium text-gray-900">
              Shortest meaningful segment
            </label>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                id="min-segment"
                type="range"
                min="30"
                max="180"
                step="15"
                value={Math.min(config.minSegmentDuration, 180)}
                onChange={(e) => update('minSegmentDuration', Number(e.target.value))}
                className="w-full accent-blue-600"
              />
              <span className="w-14 text-right text-sm tabular-nums text-gray-700">
                {config.minSegmentDuration}s
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Candidate windows shorter than this are never considered.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    viewBox="0 0 20 20"
    fill="currentColor"
    className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
      clipRule="evenodd"
    />
  </svg>
);

export default SettingsPanel;
