'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CLIP_LENGTH_OPTIONS,
  RESOLUTION_OPTIONS,
  clipLengthToTargetSeconds,
  targetSecondsToClipLength,
  resolutionToTarget,
} from '@/pipeline/logic/configPresets';

/** Color grading presets accepted by the EDIT stage (see src/pipeline/logic/
 *  colorGrade.ts). Kept local to the panel; the server validates the same set
 *  at /api/config POST time. */
const GRADING_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'natural', label: 'Natural (original)' },
  { id: 'vivid', label: 'Vivid' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'vintage', label: 'Vintage' },
];

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
  const [isLoaded, setIsLoaded] = useState(false);
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
        setIsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setIsLoaded(true); // keep defaults, surface save errors later
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
    if (seconds !== undefined) update('targetDuration', seconds);
  };

  const saveTone =
    saveState === 'saved'
      ? 'text-emerald-300 bg-emerald-950/40 border-emerald-800/60'
      : saveState === 'error'
        ? 'text-rose-300 bg-rose-950/40 border-rose-800/60'
        : 'border-transparent';

  return (
    <div
      className={`bg-zinc-900 border border-zinc-800 rounded-xl shadow-sm overflow-hidden text-zinc-100 ${className}`}
    >
      {/* Header */}
      <div className="px-6 py-5 border-b border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-100">
          Pengaturan Klip Video (Clip Settings)
        </h2>
        <p className="text-xs text-zinc-400 mt-1">
          Konfigurasi otomatis pembuatan klip Shorts, Reels, dan TikTok.
        </p>
      </div>

      <div className="p-6 space-y-8">
        {/* ——— Create section ——— */}
        <section aria-labelledby="create-heading">
          <h3
            id="create-heading"
            className="text-xs font-semibold text-zinc-400 uppercase tracking-wider"
          >
            Klip Baru
          </h3>

          {/* Clip Length */}
          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <label className="text-xs font-medium text-zinc-300">Target Durasi Klip</label>
              <span className="text-xs text-zinc-400 font-mono tabular-nums">
                {config.targetDuration} dtk
              </span>
            </div>
            <div
              className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2"
              role="radiogroup"
              aria-label="Clip length"
            >
              {CLIP_LENGTH_OPTIONS.map((opt) => {
                const selected = clipLengthId === opt.id;
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
                    className={`min-h-[44px] px-3 py-2.5 text-xs font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 cursor-pointer ${
                      selected
                        ? 'bg-zinc-100 border-transparent text-zinc-950 font-semibold shadow-sm'
                        : 'bg-zinc-800/80 border-zinc-700 text-zinc-300 hover:bg-zinc-750 hover:text-white'
                    }`}
                  >
                    <span className="sm:hidden">{mobileLabel}</span>
                    <span className="hidden sm:inline">{desktopLabel}</span>
                    <span className="sr-only">{dur ? ` ${dur}` : ''}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500">
              Setiap klip menargetkan durasi sekitar {config.targetDuration} detik.
            </p>
          </div>

          {/* Captions */}
          <div className="mt-6 flex items-center justify-between gap-6 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3.5">
            <div>
              <p className="text-xs font-semibold text-zinc-200">
                Subtitle Otomatis (Auto captions)
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Transkrip suara Whisper dan burn-in teks subtitle ke dalam klip video
              </p>
            </div>
            <Toggle
              checked={config.subtitleEnabled}
              onChange={(v) => update('subtitleEnabled', v)}
              label="Auto captions"
            />
          </div>
        </section>

        {/* ——— Advanced ——— */}
        <AdvancedSection config={config} update={update} />

        {/* Save bar */}
        <div className="pt-4 border-t border-zinc-800 flex items-center justify-between gap-4">
          <p
            className={`text-xs px-3 py-2 rounded-md border ${saveTone} ${saveMessage ? '' : 'invisible'}`}
            role="status"
            aria-live="polite"
            data-testid="settings-save-status"
          >
            {saveMessage || '\u00a0'}
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isLoaded || saveState === 'saving'}
            className="inline-flex items-center min-h-[44px] px-5 py-2.5 border border-transparent text-xs font-semibold rounded-lg shadow-sm text-zinc-950 bg-zinc-100 hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-40 transition-colors cursor-pointer"
          >
            {saveState === 'saving' ? 'Menyimpan...' : 'Simpan Pengaturan'}
            <span className="sr-only">Save settings</span>
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
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 cursor-pointer ${
      checked ? 'bg-zinc-100' : 'bg-zinc-700'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full shadow transition-transform ${
        checked ? 'translate-x-6 bg-zinc-950' : 'translate-x-1 bg-zinc-300'
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
        className="flex w-full items-center justify-between text-xs font-semibold text-zinc-300 hover:text-zinc-100 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 rounded-md px-1 py-1"
      >
        <span className="flex items-center gap-2">
          <span id="advanced-heading">Pengaturan Lanjutan (Advanced)</span>
          <span className="text-[11px] font-normal text-zinc-500">
            Filter iklan &bull; Jumlah klip &bull; Kualitas output
          </span>
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div id={panelId} className="mt-4 space-y-6 border-t border-zinc-800 pt-5">
          {/* Ad filter */}
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold text-zinc-200">Filter Iklan Penuh (Pure Ad)</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Video yang sepenuhnya iklan ditolak sebelum diproses. Video dengan iklan sisipan
                tetap diterima.
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
                <label htmlFor="ad-threshold" className="text-xs font-medium text-zinc-300">
                  Sensitivitas Filter Iklan
                </label>
                <span className="text-xs text-zinc-400 font-mono tabular-nums">
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
                className="mt-2 w-full accent-zinc-200"
              />
              <div className="flex justify-between text-[11px] text-zinc-500">
                <span>Lebih longgar</span>
                <span>Lebih ketat</span>
              </div>
            </div>
          )}

          {/* Max clips */}
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="max-clips" className="text-xs font-medium text-zinc-300">
                Maksimum Klip Per Video
              </label>
              <span className="text-xs font-mono text-zinc-200 font-semibold">
                {config.maxClips} klip
              </span>
            </div>
            <input
              id="max-clips"
              type="range"
              min="1"
              max="50"
              step="1"
              value={config.maxClips}
              onChange={(e) => update('maxClips', Number(e.target.value))}
              className="mt-2 w-full accent-zinc-200"
            />
            <div className="flex justify-between text-[11px] text-zinc-500">
              <span>Hanya yang terbaik</span>
              <span>Hingga 50 klip</span>
            </div>
          </div>

          {/* Color grading preset */}
          <div>
            <label htmlFor="grading" className="text-xs font-medium text-zinc-300">
              Preset Color Grading
            </label>
            <select
              id="grading"
              value={config.colorGrading}
              onChange={(e) => update('colorGrading', e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            >
              {GRADING_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-500 mt-1">
              Nuansa warna diterapkan pada tahap EDIT. Pilihan Natural mempertahankan gambar asli.
            </p>
          </div>

          {/* Backsound */}
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold text-zinc-200">Musik Latar (Background Music)</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Ducking audio musik otomatis saat suara pembicara aktif bila musik tersedia di
                <span className="font-mono text-[11px] text-zinc-300"> media/assets/</span>.
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
            <label htmlFor="resolution" className="text-xs font-medium text-zinc-300">
              Resolusi &amp; Kualitas Output
            </label>
            <select
              id="resolution"
              value={config.targetResolution}
              onChange={(e) => update('targetResolution', e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            >
              {RESOLUTION_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Segment minimum */}
          <div>
            <label htmlFor="min-segment" className="text-xs font-medium text-zinc-300">
              Durasi Minimum Segmen Analisis
            </label>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                id="min-segment"
                type="range"
                min="30"
                max={Math.max(180, config.minSegmentDuration)}
                step="15"
                value={config.minSegmentDuration}
                onChange={(e) => update('minSegmentDuration', Number(e.target.value))}
                className="w-full accent-zinc-200"
              />
              <span className="w-14 text-right text-xs font-mono text-zinc-300 tabular-nums">
                {config.minSegmentDuration}s
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Jendela kandidat yang lebih pendek dari durasi ini tidak akan diproses.
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
    className={`h-4 w-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
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
