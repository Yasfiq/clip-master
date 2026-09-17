'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  Sun,
  Sunset,
  Moon,
  Sparkles,
  Download,
  FileSpreadsheet,
  FileJson,
  Flame,
  Play,
  Check,
  Copy,
  Film,
  ArrowUpDown,
  Info,
} from 'lucide-react';

export interface SchedulerClip {
  id: string;
  jobId?: string;
  startTime: number;
  endTime: number;
  duration: number;
  viralScore?: number;
  confidence?: string;
  exportPath?: string;
  thumbnailPath?: string;
  isExported?: boolean;
  hookHeadline?: string;
  jobName?: string;
}

export interface DripSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  clips: SchedulerClip[];
  jobName?: string;
}

export type DripSlotType = 'siang' | 'sore' | 'malam';

export interface DripSlotConfig {
  type: DripSlotType;
  name: string;
  timeLabel: string;
  time: string; // HH:mm
  description: string;
  platforms: string[];
  isPrimeTime?: boolean;
}

const GOLDEN_HOUR_SLOTS: DripSlotConfig[] = [
  {
    type: 'siang',
    name: 'Slot Siang',
    timeLabel: '11.45 WIB',
    time: '11:45',
    description: 'Rehat makan siang kantor & kampus (casual browsing puncak)',
    platforms: ['TikTok', 'YouTube Shorts'],
  },
  {
    type: 'sore',
    name: 'Slot Sore',
    timeLabel: '17.30 WIB',
    time: '17:30',
    description: 'Perjalanan pulang kerja & santai senja (transit traffic)',
    platforms: ['Instagram Reels', 'TikTok'],
  },
  {
    type: 'malam',
    name: 'Slot Malam',
    timeLabel: '20.15 WIB',
    time: '20:15',
    description: 'Prime Time Indonesia (retensi santai malam & viralitas maksimal)',
    platforms: ['TikTok', 'Instagram Reels', 'YouTube Shorts'],
    isPrimeTime: true,
  },
];

export const DripSchedulerModal: React.FC<DripSchedulerModalProps> = ({
  isOpen,
  onClose,
  clips,
  jobName,
}) => {
  // Today's date as default (YYYY-MM-DD)
  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const [startDate, setStartDate] = useState<string>(todayStr);
  const [sortMode, setSortMode] = useState<'viral' | 'chrono'>('viral');
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);
  const [titlesCache, setTitlesCache] = useState<Record<string, string>>({});

  // Reset date on open if needed
  useEffect(() => {
    if (isOpen && !startDate) {
      setStartDate(todayStr);
    }
  }, [isOpen, startDate, todayStr]);

  // Keyboard listener Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Asynchronously enrich titles from copywriting API if clip has no hookHeadline
  useEffect(() => {
    if (!isOpen || clips.length === 0) return;

    clips.forEach(async (clip) => {
      if (clip.hookHeadline || titlesCache[clip.id]) return;
      try {
        const res = await fetch(`/api/clips/${clip.id}/copywriting`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.data?.copywriting?.title) {
          setTitlesCache((prev) => ({
            ...prev,
            [clip.id]: json.data.copywriting.title,
          }));
        }
      } catch {
        // Fallback to algorithmic title
      }
    });
  }, [isOpen, clips, titlesCache]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getPunchyTitle = (clip: SchedulerClip, index: number): string => {
    if (clip.hookHeadline && clip.hookHeadline.trim()) {
      return clip.hookHeadline.trim();
    }
    if (titlesCache[clip.id]) {
      return titlesCache[clip.id];
    }
    const sourceLabel = clip.jobName || jobName;
    if (sourceLabel) {
      const clean = sourceLabel.replace(/\.[^/.]+$/, '').trim();
      return `${clean.substring(0, 32)} - Part ${index + 1}`;
    }
    return `Sorotan Utama - Bagian #${index + 1}`;
  };

  // Sort clips based on user preference
  const sortedClips = useMemo(() => {
    const list = [...clips];
    if (sortMode === 'viral') {
      // Highest viral score first to capture golden hour prime time
      return list.sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));
    }
    // Chronological order by video startTime
    return list.sort((a, b) => a.startTime - b.startTime);
  }, [clips, sortMode]);

  // Group clips into days and 3 slots per day
  const scheduleDays = useMemo(() => {
    if (sortedClips.length === 0) return [];

    const totalDays = Math.max(1, Math.ceil(sortedClips.length / 3));
    const [yearStr, monthStr, dayStr] = (startDate || todayStr).split('-');
    const baseDate = new Date(
      parseInt(yearStr, 10),
      parseInt(monthStr, 10) - 1,
      parseInt(dayStr, 10),
    );

    const days = [];

    for (let dayIdx = 0; dayIdx < totalDays; dayIdx++) {
      const currentDate = new Date(baseDate);
      currentDate.setDate(baseDate.getDate() + dayIdx);

      const y = currentDate.getFullYear();
      const m = String(currentDate.getMonth() + 1).padStart(2, '0');
      const d = String(currentDate.getDate()).padStart(2, '0');
      const isoDate = `${y}-${m}-${d}`;

      const dateLabel = currentDate.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      const slots = GOLDEN_HOUR_SLOTS.map((slotConfig, slotIdx) => {
        const clipGlobalIndex = dayIdx * 3 + slotIdx;
        const clip = sortedClips[clipGlobalIndex] || null;
        const scheduledDateTime = `${isoDate}T${slotConfig.time}:00+07:00`;

        return {
          slotConfig,
          clip,
          clipIndex: clipGlobalIndex + 1,
          scheduledDateTime,
          isoDate,
        };
      });

      days.push({
        dayNumber: dayIdx + 1,
        isoDate,
        dateLabel,
        slots,
      });
    }

    return days;
  }, [sortedClips, startDate, todayStr]);

  const getViralBadgeColor = (score?: number) => {
    if (typeof score !== 'number') {
      return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
    if (score >= 0.8) {
      return 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80';
    }
    if (score >= 0.5) {
      return 'bg-amber-950/80 text-amber-300 border-amber-700/80';
    }
    return 'bg-rose-950/80 text-rose-300 border-rose-700/80';
  };

  const getPlatformBadge = (platform: string) => {
    switch (platform) {
      case 'TikTok':
        return 'bg-zinc-950 text-pink-300 border-pink-900/60';
      case 'Instagram Reels':
        return 'bg-fuchsia-950/70 text-fuchsia-300 border-fuchsia-800/70';
      case 'YouTube Shorts':
        return 'bg-red-950/70 text-red-300 border-red-800/70';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  // Download CSV handler (Ready for Meta Business Suite & Spreadsheet Import)
  const handleDownloadCsv = () => {
    if (scheduleDays.length === 0) return;

    const headers = [
      'Date',
      'Time_WIB',
      'Timezone',
      'Scheduled_DateTime',
      'Slot_Name',
      'Clip_Number',
      'Title',
      'Duration_Formatted',
      'Duration_Seconds',
      'Viral_Score',
      'Confidence',
      'Target_Platforms',
      'Clip_ID',
      'Export_Path',
    ];

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows: string[] = [headers.join(',')];

    scheduleDays.forEach((day) => {
      day.slots.forEach((slotItem) => {
        if (!slotItem.clip) return;
        const clip = slotItem.clip;
        const title = getPunchyTitle(clip, slotItem.clipIndex - 1);

        const row = [
          escapeCsv(day.isoDate),
          escapeCsv(slotItem.slotConfig.time),
          escapeCsv('Asia/Jakarta (WIB)'),
          escapeCsv(slotItem.scheduledDateTime),
          escapeCsv(slotItem.slotConfig.name),
          escapeCsv(slotItem.clipIndex),
          escapeCsv(title),
          escapeCsv(formatTime(clip.duration)),
          escapeCsv(clip.duration.toFixed(1)),
          escapeCsv(clip.viralScore !== undefined ? clip.viralScore.toFixed(2) : ''),
          escapeCsv(clip.confidence || ''),
          escapeCsv(slotItem.slotConfig.platforms.join(', ')),
          escapeCsv(clip.id),
          escapeCsv(clip.exportPath || ''),
        ];
        rows.push(row.join(','));
      });
    });

    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Jadwal_Drip_Jam_Emas_${startDate || todayStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Download JSON handler
  const handleDownloadJson = () => {
    if (scheduleDays.length === 0) return;

    const payload = {
      generator: 'Clip Master Drip Scheduler',
      timezone: 'Asia/Jakarta (WIB)',
      startDate: startDate || todayStr,
      totalClips: sortedClips.length,
      totalDays: scheduleDays.length,
      schedule: scheduleDays.map((day) => ({
        day: day.dayNumber,
        date: day.isoDate,
        dateLabel: day.dateLabel,
        slots: day.slots.map((s) => ({
          slotType: s.slotConfig.type,
          slotName: s.slotConfig.name,
          timeLabel: s.slotConfig.timeLabel,
          time: s.slotConfig.time,
          scheduledDateTime: s.scheduledDateTime,
          platforms: s.slotConfig.platforms,
          clip: s.clip
            ? {
                id: s.clip.id,
                clipNumber: s.clipIndex,
                title: getPunchyTitle(s.clip, s.clipIndex - 1),
                duration: s.clip.duration,
                formattedDuration: formatTime(s.clip.duration),
                viralScore: s.clip.viralScore,
                confidence: s.clip.confidence,
                exportPath: s.clip.exportPath,
              }
            : null,
        })),
      })),
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Jadwal_Drip_Jam_Emas_${startDate || todayStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Copy schedule summary to clipboard
  const handleCopySummary = async () => {
    if (scheduleDays.length === 0) return;

    let text = `📅 JADWAL PUBLIKASI JAM EMAS (WIB)\n`;
    text += `Mulai: ${startDate || todayStr} | Total: ${sortedClips.length} Klip\n\n`;

    scheduleDays.forEach((day) => {
      text += `━━━━━━━━━━━━━━━━━━━━\n`;
      text += `📌 ${day.dateLabel.toUpperCase()}\n`;
      text += `━━━━━━━━━━━━━━━━━━━━\n`;

      day.slots.forEach((s) => {
        if (!s.clip) {
          text += `• ${s.slotConfig.timeLabel}: [Slot Kosong]\n`;
          return;
        }
        const title = getPunchyTitle(s.clip, s.clipIndex - 1);
        text += `• ${s.slotConfig.timeLabel} (${s.slotConfig.name})\n`;
        text += `  🎬 Klip #${s.clipIndex}: "${title}"\n`;
        text += `  ⏱ Durasi: ${formatTime(s.clip.duration)} | Skor: ${s.clip.viralScore?.toFixed(2) || '-'}\n`;
        text += `  📲 Target: ${s.slotConfig.platforms.join(', ')}\n\n`;
      });
    });

    try {
      await navigator.clipboard.writeText(text);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drip-scheduler-title"
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col text-zinc-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-950/60 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="drip-scheduler-title"
                  className="text-lg font-bold text-zinc-100 tracking-tight"
                >
                  Drip Scheduler &bull; Kalender Jam Emas
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/80">
                  WIB (Asia/Jakarta)
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Rencana perilisan bertahap 3 slot per hari pada jam-jam dengan traffic & engagement
                penonton tertinggi.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800/60 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            title="Tutup (Esc)"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Controls */}
        <div className="px-6 py-3.5 bg-zinc-900/90 border-b border-zinc-800/90 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs">
          <div className="flex items-center flex-wrap gap-3">
            {/* Start Date Picker */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="drip-start-date"
                className="text-zinc-400 font-medium whitespace-nowrap"
              >
                Tanggal Mulai:
              </label>
              <input
                id="drip-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono text-xs"
              />
            </div>

            {/* Sorting Mode */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="drip-sort-mode"
                className="text-zinc-400 font-medium whitespace-nowrap flex items-center gap-1"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
                Urutan:
              </label>
              <select
                id="drip-sort-mode"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500 text-xs"
              >
                <option value="viral">Prioritas Skor Viral (Prime Time)</option>
                <option value="chrono">Alur Cerita (Kronologis)</option>
              </select>
            </div>
          </div>

          {/* Action Download Buttons */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={handleCopySummary}
              disabled={sortedClips.length === 0}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Salin ringkasan jadwal teks ke clipboard"
            >
              {copiedSummary ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedSummary ? 'Tersalin!' : 'Salin Teks'}</span>
            </button>

            <button
              onClick={handleDownloadCsv}
              disabled={sortedClips.length === 0}
              className="px-3 py-1.5 rounded-lg border border-emerald-700/80 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-200 transition-colors inline-flex items-center gap-1.5 font-semibold shadow-sm cursor-pointer disabled:opacity-50"
              title="Unduh file CSV kalender siap impor ke Meta Business Suite / Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>📥 Unduh Jadwal (CSV)</span>
            </button>

            <button
              onClick={handleDownloadJson}
              disabled={sortedClips.length === 0}
              className="px-3 py-1.5 rounded-lg border border-indigo-700/80 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-200 transition-colors inline-flex items-center gap-1.5 font-semibold shadow-sm cursor-pointer disabled:opacity-50"
              title="Unduh jadwal terstruktur dalam format JSON"
            >
              <FileJson className="w-3.5 h-3.5 text-indigo-400" />
              <span>📥 Unduh Jadwal (JSON)</span>
            </button>
          </div>
        </div>

        {/* Campaign Metrics Ribbon */}
        {sortedClips.length > 0 && (
          <div className="px-6 py-2.5 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between flex-wrap gap-3 text-xs text-zinc-400">
            <div className="flex items-center gap-4">
              <span>
                Total Klip:{' '}
                <strong className="text-zinc-200 font-mono">{sortedClips.length}</strong>
              </span>
              <span>&bull;</span>
              <span>
                Durasi Kampanye:{' '}
                <strong className="text-zinc-200 font-mono">{scheduleDays.length} Hari</strong>
              </span>
              <span>&bull;</span>
              <span>
                Rata-rata Viral Score:{' '}
                <strong className="text-amber-300 font-mono">
                  {(
                    sortedClips.reduce((sum, c) => sum + (c.viralScore || 0), 0) /
                    (sortedClips.length || 1)
                  ).toFixed(2)}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />3 Slot Emas:
                11.45 &bull; 17.30 &bull; 20.15 WIB
              </span>
            </div>
          </div>
        )}

        {/* Content: Days Timeline */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {sortedClips.length === 0 ? (
            <div className="text-center py-16 flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-500 mb-3 shadow-inner">
                <Calendar className="w-7 h-7" />
              </div>
              <h3 className="text-base font-semibold text-zinc-200 mb-1">
                Belum Ada Klip untuk Dijadwalkan
              </h3>
              <p className="text-xs text-zinc-400 max-w-md">
                Jalankan pipeline pemotongan klip terlebih dahulu. Klip yang dihasilkan akan
                otomatis terpetakan ke kalender jam emas ini.
              </p>
            </div>
          ) : (
            scheduleDays.map((day) => (
              <div
                key={day.isoDate}
                className="bg-zinc-950/60 border border-zinc-800/90 rounded-xl p-4.5 sm:p-5 shadow-sm"
              >
                {/* Day Header */}
                <div className="flex items-center justify-between gap-3 pb-3 mb-4 border-b border-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-0.5 rounded-md bg-zinc-800 text-zinc-200 font-mono text-xs font-bold border border-zinc-700">
                      Hari {day.dayNumber}
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-zinc-100">
                      {day.dateLabel}
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400">
                    {day.slots.filter((s) => s.clip).length}/3 Slot Terisi
                  </span>
                </div>

                {/* 3 Slots Columns */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {day.slots.map((slotItem) => {
                    const { slotConfig, clip, clipIndex } = slotItem;

                    if (!clip) {
                      // Open/Empty Slot Card
                      return (
                        <div
                          key={slotConfig.type}
                          className="bg-zinc-900/40 border border-dashed border-zinc-800 rounded-xl p-4 flex flex-col justify-between min-h-[220px]"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-semibold">
                                {slotConfig.type === 'siang' && (
                                  <Sun className="w-4 h-4 text-amber-400" />
                                )}
                                {slotConfig.type === 'sore' && (
                                  <Sunset className="w-4 h-4 text-orange-400" />
                                )}
                                {slotConfig.type === 'malam' && (
                                  <Moon className="w-4 h-4 text-indigo-400" />
                                )}
                                <span>{slotConfig.name}</span>
                              </div>
                              <span className="text-[11px] font-mono text-zinc-400">
                                {slotConfig.timeLabel}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-1">
                              {slotConfig.description}
                            </p>
                          </div>

                          <div className="text-center py-6 border border-zinc-800/60 rounded-lg bg-zinc-950/30 my-2">
                            <span className="text-xs text-zinc-500 font-medium">
                              Slot Terbuka (Tanpa Klip)
                            </span>
                          </div>

                          <div className="flex items-center gap-1 flex-wrap pt-2 border-t border-zinc-800/60">
                            {slotConfig.platforms.map((p) => (
                              <span
                                key={p}
                                className={`text-[10px] px-1.5 py-0.5 rounded border opacity-50 ${getPlatformBadge(p)}`}
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    const punchyTitle = getPunchyTitle(clip, clipIndex - 1);

                    return (
                      <div
                        key={slotConfig.type}
                        className={`bg-zinc-900/90 border rounded-xl p-4 flex flex-col justify-between transition-all hover:border-zinc-700 shadow-md ${
                          slotConfig.isPrimeTime
                            ? 'border-amber-700/60 ring-1 ring-amber-500/20'
                            : 'border-zinc-800'
                        }`}
                      >
                        <div>
                          {/* Slot Header */}
                          <div className="flex items-center justify-between gap-2 mb-2.5">
                            <div className="flex items-center gap-1.5">
                              {slotConfig.type === 'siang' && (
                                <Sun className="w-4 h-4 text-amber-400" />
                              )}
                              {slotConfig.type === 'sore' && (
                                <Sunset className="w-4 h-4 text-orange-400" />
                              )}
                              {slotConfig.type === 'malam' && (
                                <Moon className="w-4 h-4 text-indigo-400" />
                              )}
                              <span className="text-xs font-bold text-zinc-100">
                                {slotConfig.name}
                              </span>
                            </div>

                            <span
                              className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                                slotConfig.isPrimeTime
                                  ? 'bg-amber-950 text-amber-300 border-amber-800'
                                  : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                              }`}
                            >
                              {slotConfig.timeLabel}
                            </span>
                          </div>

                          {/* Mini Thumbnail / Frame Preview */}
                          <div className="relative aspect-video w-full bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden mb-3 flex items-center justify-center group">
                            <div className="text-center p-2">
                              <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 mx-auto mb-1 group-hover:scale-105 transition-transform shadow-inner">
                                <Film className="w-4 h-4" />
                              </div>
                              <span className="text-[11px] font-semibold text-zinc-300">
                                Klip #{clipIndex}
                              </span>
                            </div>

                            {/* Duration Badge */}
                            <div className="absolute bottom-1.5 right-1.5 bg-black/85 backdrop-blur-sm text-zinc-200 text-[10px] font-mono px-1.5 py-0.5 rounded border border-zinc-800">
                              {formatTime(clip.duration)}
                            </div>

                            {/* Play Overlay */}
                            <button
                              type="button"
                              onClick={() => window.open(`/api/clips/${clip.id}/file`, '_blank')}
                              aria-label="Putar klip video"
                              className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/50 transition-colors cursor-pointer group"
                            >
                              <div className="w-9 h-9 rounded-full bg-zinc-100 text-zinc-950 shadow-xl flex items-center justify-center opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all">
                                <Play className="w-4 h-4 ml-0.5 fill-current" />
                              </div>
                            </button>
                          </div>

                          {/* Punchy Title */}
                          <h4
                            className="text-xs font-semibold text-zinc-100 line-clamp-2 mb-2 leading-relaxed"
                            title={punchyTitle}
                          >
                            {punchyTitle}
                          </h4>
                        </div>

                        <div>
                          {/* Badges: Viral Score & Confidence */}
                          <div className="flex items-center justify-between gap-2 pt-2.5 pb-2 border-t border-zinc-800/80 mb-2.5">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${getViralBadgeColor(
                                  clip.viralScore,
                                )}`}
                                title={`Viral Potential Score: ${
                                  clip.viralScore !== undefined ? clip.viralScore.toFixed(2) : '-'
                                }`}
                              >
                                <Flame className="w-3 h-3 text-amber-400" />
                                <span>
                                  {clip.viralScore !== undefined ? clip.viralScore.toFixed(2) : '-'}
                                </span>
                              </span>
                            </div>

                            <span className="text-[10px] font-mono text-zinc-400">
                              {formatTime(clip.startTime)} &rarr; {formatTime(clip.endTime)}
                            </span>
                          </div>

                          {/* Platforms Target Badges */}
                          <div className="flex items-center gap-1 flex-wrap">
                            {slotConfig.platforms.map((platform) => (
                              <span
                                key={platform}
                                className={`text-[10px] px-2 py-0.5 rounded-md font-medium border ${getPlatformBadge(
                                  platform,
                                )}`}
                              >
                                {platform}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-2 text-zinc-400">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-[11px]">
              <strong>Tips Jam Emas:</strong> Slot Malam (20.15 WIB) merupakan prime time dengan
              retensi santai tertinggi di Indonesia. Gunakan file CSV untuk jadwal upload otomatis
              di Meta Business Suite atau social media manager.
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-semibold transition-colors cursor-pointer"
          >
            Tutup (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};

export default DripSchedulerModal;
