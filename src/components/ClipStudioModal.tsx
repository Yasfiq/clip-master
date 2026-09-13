'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { SubtitleCue, formatSrtTimestamp } from '@/pipeline/logic/srtParser';
import { StudioConfig, DEFAULT_STUDIO_CONFIG } from '@/types/clipStudio';
import {
  X,
  Loader2,
  Type,
  Image as ImageIcon,
  MessageSquare,
  Sliders,
  Play,
  Pause,
  Upload,
  Clock,
  Trash2,
  Plus,
  Scissors,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  ChevronLeft,
  Film,
  Music,
  Layers,
  Palette,
} from 'lucide-react';

interface ClipStudioModalProps {
  clipId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialTab?: 'hook' | 'branding' | 'subtitle' | 'transition' | 'audio';
}

const FREEZE_OPTIONS = [0, 1.0, 1.2, 1.5, 2.0];

function formatTimecode(sec: number): string {
  if (isNaN(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const f = Math.floor((sec % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${f.toString().padStart(2, '0')}`;
}

export default function ClipStudioModal({
  clipId,
  isOpen,
  onClose,
  onSuccess,
  initialTab = 'subtitle',
}: ClipStudioModalProps) {
  const [activeTab, setActiveTab] = useState<
    'hook' | 'branding' | 'subtitle' | 'transition' | 'audio'
  >(initialTab);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [studioConfig, setStudioConfig] = useState<StudioConfig>({
    ...DEFAULT_STUDIO_CONFIG,
    sourcePosition: DEFAULT_STUDIO_CONFIG.sourcePosition || 'top-right',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reBurning, setReBurning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [videoTimestampKey, setVideoTimestampKey] = useState<number>(Date.now());

  // Player & Timeline State
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [selectedCueIndex, setSelectedCueIndex] = useState<number | null>(0);
  const [timelineZoom, setTimelineZoom] = useState<number>(1.0); // 1x to 3x
  const [isCleanVideo, setIsCleanVideo] = useState<boolean>(true);
  const [showInspector, setShowInspector] = useState<boolean>(false);

  // Logo state
  const [logoExists, setLogoExists] = useState<boolean>(false);
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const [logoUploadMsg, setLogoUploadMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, []);

  const fetchStudioData = useCallback(
    async (signal?: AbortSignal) => {
      if (!clipId) return;
      setLoading(true);
      setError(null);
      setStatusMessage(null);
      try {
        const [studioRes, logoRes] = await Promise.all([
          fetch(`/api/clips/${clipId}/studio`, { signal }),
          fetch('/api/settings/logo', { signal }),
        ]);

        if (signal?.aborted) return;

        const studioPayload = await studioRes.json();
        if (!studioRes.ok || !studioPayload.success) {
          throw new Error(studioPayload?.error?.message || 'Gagal memuat konfigurasi studio klip');
        }

        if (signal?.aborted) return;

        const data = studioPayload.data;
        if (typeof data.isCleanVideo === 'boolean') {
          setIsCleanVideo(data.isCleanVideo);
        }
        if (typeof data.clip?.duration === 'number' && data.clip.duration > 0) {
          setDuration(data.clip.duration);
        }
        if (data.studioConfig) {
          setStudioConfig({
            ...DEFAULT_STUDIO_CONFIG,
            ...data.studioConfig,
            sourcePosition: data.studioConfig.sourcePosition || 'top-right',
          });
        }
        if (Array.isArray(data.cues)) {
          setCues(data.cues);
        }

        if (logoRes.ok) {
          const logoPayload = await logoRes.json();
          if (logoPayload.success && !signal?.aborted) {
            setLogoExists(!!logoPayload.data?.exists);
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || signal?.aborted) return;
        setError(err.message || 'Terjadi kesalahan saat memuat data studio');
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [clipId],
  );

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      const controller = new AbortController();
      fetchStudioData(controller.signal);
      return () => {
        controller.abort();
      };
    }
  }, [isOpen, initialTab, fetchStudioData]);

  // Keyboard accessibility: Close on Escape, Play/Pause on Space, ArrowLeft/ArrowRight to seek ±1s
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive =
        target.closest('button, input, textarea, select, [role="button"], [role="tab"]') !== null ||
        target.isContentEditable;

      if (e.key === 'Escape' && isOpen && !saving && !reBurning) {
        onClose();
      } else if (e.code === 'Space' && isOpen && !isInteractive) {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft' && isOpen && !isInteractive) {
        e.preventDefault();
        if (videoRef.current) {
          const targetSec = Math.max(0, videoRef.current.currentTime - 1.0);
          videoRef.current.currentTime = targetSec;
          setCurrentTime(targetSec);
        }
      } else if (e.key === 'ArrowRight' && isOpen && !isInteractive) {
        e.preventDefault();
        if (videoRef.current) {
          const maxSec = duration || videoRef.current.duration || 60;
          const targetSec = Math.min(maxSec, videoRef.current.currentTime + 1.0);
          videoRef.current.currentTime = targetSec;
          setCurrentTime(targetSec);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, saving, reBurning, duration, onClose, togglePlay]);

  const handleSeek = (seconds: number) => {
    if (videoRef.current) {
      const targetSec = Math.max(0, Math.min(seconds, duration || 60));
      videoRef.current.currentTime = targetSec;
      setCurrentTime(targetSec);
      if (!isPlaying) {
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const cur = videoRef.current.currentTime;
      setCurrentTime(cur);

      // Auto detect active cue for inspector highlight
      const activeIdx = cues.findIndex((c) => cur >= c.start && cur <= c.end);
      if (activeIdx !== -1 && activeIdx !== selectedCueIndex) {
        setSelectedCueIndex(activeIdx);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current && videoRef.current.duration) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleCueTextChange = (index: number, newText: string) => {
    setCues((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], text: newText };
      return updated;
    });
  };

  const handleCueTimingChange = (index: number, field: 'start' | 'end', val: number) => {
    setCues((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: Math.max(0, val) };
      return updated;
    });
  };

  const handleAddCue = (index: number) => {
    setCues((prev) => {
      const current = prev[index];
      const next = prev[index + 1];
      let start = current ? current.end + 0.05 : 0;
      let end = start + 1.5;

      if (next) {
        if (next.start > start + 0.2) {
          end = Math.min(start + 1.5, next.start - 0.02);
        } else {
          start = Number((start + 0.01).toFixed(2));
          end = Number(Math.max(start + 0.1, next.start - 0.01).toFixed(2));
        }
      }

      const newCue: SubtitleCue = {
        id: prev.length + 1,
        start: Number(start.toFixed(2)),
        end: Number(Math.max(start + 0.2, end).toFixed(2)),
        text: 'Teks subtitle baru',
      };

      const updated = [...prev.slice(0, index + 1), newCue, ...prev.slice(index + 1)];
      // Ensure strictly monotonically increasing start times and no overlapping cues
      for (let i = 1; i < updated.length; i++) {
        if (updated[i].start <= updated[i - 1].start) {
          updated[i].start = Number((updated[i - 1].start + 0.05).toFixed(2));
        }
        if (updated[i - 1].end > updated[i].start) {
          updated[i - 1].end = Number(
            Math.max(updated[i - 1].start + 0.2, updated[i].start - 0.02).toFixed(2),
          );
        }
        if (updated[i].end <= updated[i].start) {
          updated[i].end = Number((updated[i].start + 0.5).toFixed(2));
        }
      }
      return updated.map((c, i) => ({ ...c, id: i + 1 }));
    });
  };

  const handleDeleteCue = (index: number) => {
    setCues((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.map((c, i) => ({ ...c, id: i + 1 }));
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setLogoUploadMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/settings/logo', {
        method: 'POST',
        body: formData,
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload?.error?.message || 'Gagal mengunggah berkas logo');
      }

      setLogoExists(true);
      setStudioConfig((prev) => ({ ...prev, logoEnabled: true }));
      setLogoUploadMsg('Logo berhasil diperbarui.');
      setVideoTimestampKey(Date.now());
    } catch (err: any) {
      setLogoUploadMsg(err.message || 'Gagal mengunggah logo');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSaveDraft = async (showMessage = true): Promise<boolean> => {
    setSaving(true);
    setError(null);
    if (showMessage) setStatusMessage(null);
    try {
      const res = await fetch(`/api/clips/${clipId}/studio`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studioConfig, cues }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload?.error?.message || 'Gagal menyimpan draf studio');
      }
      if (showMessage) {
        setStatusMessage('Subtitle berhasil disimpan ke disk.');
      }
      return true;
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan draf');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleRenderStudio = async () => {
    const saved = await handleSaveDraft(false);
    if (!saved) return;

    setReBurning(true);
    setError(null);
    setStatusMessage('Sedang merender video dengan filter studio multi-layer. Harap tunggu...');
    try {
      const res = await fetch(`/api/clips/${clipId}/re-burn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studioConfig,
          styleId: studioConfig.subtitleStyleId,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload?.error?.message || 'Gagal merender video studio');
      }

      setStatusMessage('Video studio berhasil dirender ulang!');
      const newKey = Date.now();
      setVideoTimestampKey(newKey);
      if (videoRef.current) {
        videoRef.current.load();
      }
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Gagal merender ulang video');
      setStatusMessage(null);
    } finally {
      setReBurning(false);
    }
  };

  const handleClose = () => {
    if (saving || reBurning) return;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    onClose();
  };

  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    };
  }, []);

  if (!isOpen) return null;

  const videoSrc = `/api/clips/${clipId}/file?clean=1&t=${videoTimestampKey}`;
  const pixelsPerSecond = 24 * timelineZoom;
  const totalTimelineWidth = Math.max(duration * pixelsPerSecond, 800);
  const activeCue = cues.find((c) => currentTime >= c.start && currentTime <= c.end);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-editor-title"
      className="fixed inset-0 z-50 bg-[#0e0e12] text-zinc-100 flex flex-col h-screen w-screen overflow-hidden select-none font-sans"
    >
      {/* ========================================================================= */}
      {/* 1. TOP HEADER BAR (CapCut NLE Style)                                     */}
      {/* ========================================================================= */}
      <header className="h-12 bg-[#141418] border-b border-zinc-800/80 px-4 flex items-center justify-between shrink-0">
        {/* Left: Back & Project Title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving || reBurning}
            className="text-zinc-400 hover:text-white flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-zinc-800/80 transition-colors text-xs font-medium cursor-pointer disabled:opacity-50"
            aria-label="Tutup jendela editor"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Kembali</span>
          </button>

          <div className="h-4 w-px bg-zinc-700/60" />

          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center text-[10px] font-black text-white shadow-sm">
              CM
            </div>
            <h2
              id="studio-editor-title"
              className="text-xs font-semibold text-zinc-200 truncate max-w-[320px]"
            >
              Editor Subtitle Klip & Studio Workspace
            </h2>
          </div>

          <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-zinc-900 border border-zinc-750 text-[10px] text-zinc-400 font-mono">
            9:16 • 1080x1920
          </span>
        </div>

        {/* Center: Playhead Indicator */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded bg-zinc-900/90 border border-zinc-800 text-xs font-mono text-zinc-300">
          <Clock className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-zinc-100 font-semibold">{formatTimecode(currentTime)}</span>
          <span className="text-zinc-400">/</span>
          <span className="text-zinc-400">{formatTimecode(duration)}</span>
        </div>

        {/* Right: Actions (Simpan Draf & Render Video Studio) */}
        <div className="flex items-center gap-2">
          {statusMessage && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/80 border border-emerald-800/70 rounded text-[11px] text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{statusMessage}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowInspector((prev) => !prev)}
            className={`inline-flex 2xl:hidden px-2.5 py-1.5 min-h-[38px] text-xs font-semibold rounded-md border transition-colors cursor-pointer items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              showInspector
                ? 'bg-zinc-700 text-white border-zinc-600'
                : 'text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border-zinc-700'
            }`}
            title="Tampilkan / Sembunyikan Inspector Properti"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            <span>Inspector</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveDraft(true)}
            disabled={saving || reBurning || loading}
            className="px-3 py-1.5 min-h-[38px] text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
            <span>Simpan Draf</span>
            <span className="sr-only">Simpan Subtitle</span>
          </button>

          <button
            type="button"
            onClick={handleRenderStudio}
            disabled={saving || reBurning || loading}
            className="px-4 py-1.5 min-h-[38px] text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-all shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {reBurning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Sedang Merender...</span>
              </>
            ) : (
              <>
                <Film className="w-3.5 h-3.5" />
                <span>🎬 Render Video Studio</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleClose}
            disabled={saving || reBurning}
            className="text-zinc-400 hover:text-zinc-200 p-1.5 min-h-[38px] min-w-[38px] rounded hover:bg-zinc-800 transition-colors ml-1 cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Batal / Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-950/80 border-b border-red-800 text-red-200 px-4 py-2 text-xs flex items-center justify-between z-30">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-200 ml-2 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MAIN UPPER WORKSPACE: Tool Sidebar | Asset Drawer | Canvas | Inspector */}
      {/* ========================================================================= */}
      <div className="flex-1 flex overflow-hidden min-h-0 bg-[#0e0e12]">
        {/* A. CapCut Tool Icon Column (Far Left) */}
        <div className="w-16 bg-[#121216] border-r border-zinc-800/80 flex flex-col items-center py-2.5 gap-1 shrink-0 z-10">
          <button
            type="button"
            onClick={() => setActiveTab('subtitle')}
            className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-1 text-[10px] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              activeTab === 'subtitle'
                ? 'bg-blue-600/20 text-blue-400 font-semibold border border-blue-500/40 shadow-inner'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
            title="Subtitle & Auto Captions"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Subtitle</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('hook')}
            className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-1 text-[10px] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              activeTab === 'hook'
                ? 'bg-blue-600/20 text-blue-400 font-semibold border border-blue-500/40 shadow-inner'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
            title="Hook & Headline"
          >
            <Type className="w-4 h-4" />
            <span>Hook</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('branding')}
            className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-1 text-[10px] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              activeTab === 'branding'
                ? 'bg-blue-600/20 text-blue-400 font-semibold border border-blue-500/40 shadow-inner'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
            title="Branding & Sumber"
          >
            <ImageIcon className="w-4 h-4" />
            <span>Brand</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('transition')}
            className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-1 text-[10px] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              activeTab === 'transition'
                ? 'bg-blue-600/20 text-blue-400 font-semibold border border-blue-500/40 shadow-inner'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
            title="Transisi & Fade"
          >
            <Sliders className="w-4 h-4" />
            <span>Transisi</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audio')}
            className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-1 text-[10px] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              activeTab === 'audio'
                ? 'bg-blue-600/20 text-blue-400 font-semibold border border-blue-500/40 shadow-inner'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
            title="Audio & Narator AI"
          >
            <Music className="w-4 h-4" />
            <span>Audio</span>
          </button>
        </div>

        {/* B. Asset / Tool Drawer */}
        <div className="w-72 xl:w-80 2xl:w-96 bg-[#16161c] border-r border-zinc-800/80 flex flex-col overflow-hidden shrink-0">
          {/* Drawer Sub-Header */}
          <div className="h-10 px-4 border-b border-zinc-800 flex items-center justify-between bg-[#131317]">
            <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              {activeTab === 'subtitle' && <>💬 Subtitle ({cues.length} Cues)</>}
              {activeTab === 'hook' && <>🪝 Hook & Headline</>}
              {activeTab === 'branding' && <>🏷️ Branding & Sumber</>}
              {activeTab === 'transition' && <>✨ Efek Transisi</>}
              {activeTab === 'audio' && <>🎵 Audio & Narator AI</>}
            </span>

            {/* Legacy Tab Switchers for E2E Test Compatibility */}
            <div className="hidden">
              <button onClick={() => setActiveTab('hook')}>Hook & Headline</button>
              <button onClick={() => setActiveTab('branding')}>Branding & Sumber</button>
              <button onClick={() => setActiveTab('subtitle')}>Subtitle ({cues.length})</button>
              <button onClick={() => setActiveTab('transition')}>Transisi</button>
            </div>

            {activeTab === 'subtitle' && (
              <button
                type="button"
                onClick={() => handleAddCue(cues.length - 1)}
                className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Baris</span>
              </button>
            )}
          </div>

          {/* Drawer Body Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 text-zinc-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                <span className="text-xs">Memuat konfigurasi studio...</span>
              </div>
            ) : (
              <>
                {/* 1. DRAWER: SUBTITLE */}
                {activeTab === 'subtitle' && (
                  <div className="space-y-3">
                    {/* Style Preset Selector */}
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                        Gaya Subtitle (CapCut Preset)
                      </label>
                      <select
                        value={studioConfig.subtitleStyleId || 'clipajaib'}
                        onChange={(e) =>
                          setStudioConfig((prev) => ({ ...prev, subtitleStyleId: e.target.value }))
                        }
                        className="w-full text-xs bg-zinc-900 border border-zinc-750 text-zinc-100 rounded-md px-2.5 py-1.5 focus:border-blue-500 focus:outline-none"
                      >
                        <option value="clipajaib">
                          Clip Ajaib (CapCut Kuning + Outline Hitam - Standar Baku)
                        </option>
                        <option value="tiktok">TikTok Style (Putih Bersih + Outline Hitam)</option>
                        <option value="sule">Sule Style (Bold Putih Elegan)</option>
                        <option value="kamal">Kamal Style (Outline Tegas)</option>
                      </select>
                    </div>

                    {/* Cues List */}
                    <div className="space-y-2">
                      {cues.map((cue, index) => {
                        const isCueActive = currentTime >= cue.start && currentTime <= cue.end;
                        return (
                          <div
                            key={cue.id || index}
                            className={`p-2.5 rounded-lg border transition-all ${
                              isCueActive
                                ? 'bg-blue-950/40 border-blue-500 shadow-sm'
                                : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCueIndex(index);
                                  handleSeek(cue.start);
                                }}
                                className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:bg-blue-600 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                                title="Klik untuk memutar video dari detik ini"
                              >
                                <Play className="w-2.5 h-2.5 fill-current" />
                                <span>
                                  {formatSrtTimestamp(cue.start)} → {formatSrtTimestamp(cue.end)}
                                </span>
                              </button>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleAddCue(index)}
                                  className="text-zinc-400 hover:text-blue-400 p-1 rounded hover:bg-zinc-800 transition-colors"
                                  title="Tambah baris di bawah"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCue(index)}
                                  disabled={cues.length <= 1}
                                  className="text-zinc-400 hover:text-red-400 p-1 rounded hover:bg-zinc-800 transition-colors disabled:opacity-30"
                                  title="Hapus baris"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            <textarea
                              rows={2}
                              value={cue.text}
                              onChange={(e) => handleCueTextChange(index, e.target.value)}
                              placeholder="Ketik teks subtitle..."
                              className="w-full text-xs bg-zinc-950/70 border border-zinc-800 rounded p-1.5 text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none resize-none font-medium"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. DRAWER: HOOK & HEADLINE */}
                {activeTab === 'hook' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                        Teks Headline Hook
                      </label>
                      <input
                        type="text"
                        value={studioConfig.hookText || ''}
                        onChange={(e) =>
                          setStudioConfig((prev) => ({ ...prev, hookText: e.target.value }))
                        }
                        placeholder="Contoh: KEBEBASAN ADALAH SEGALANYA..."
                        className="w-full text-xs bg-zinc-900 border border-zinc-750 text-zinc-100 rounded-md px-3 py-2 focus:border-blue-500 focus:outline-none font-semibold"
                      />
                      <p className="text-[10px] text-zinc-400 mt-1">
                        Teks banner huruf kapital 3-5 kata untuk merebut perhatian audiens di 3
                        detik awal.
                      </p>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                        Posisi Teks Hook
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setStudioConfig((prev) => ({ ...prev, hookPosition: 'center' }))
                          }
                          className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                            (studioConfig.hookPosition || 'center') === 'center'
                              ? 'bg-amber-400 text-black border-amber-300 shadow-md'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                          }`}
                        >
                          Tengah Layar (Cover Baku)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setStudioConfig((prev) => ({ ...prev, hookPosition: 'top' }))
                          }
                          className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                            studioConfig.hookPosition === 'top'
                              ? 'bg-amber-400 text-black border-amber-300 shadow-md'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                          }`}
                        >
                          Atas Layar
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                        Durasi Freeze Frame Awal (Opsional)
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {FREEZE_OPTIONS.map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() =>
                              setStudioConfig((prev) => ({ ...prev, freezeDuration: sec }))
                            }
                            className={`px-3 py-1.5 text-xs font-mono font-semibold rounded-lg border transition-all cursor-pointer ${
                              studioConfig.freezeDuration === sec
                                ? 'bg-amber-400 text-black border-amber-300 shadow-sm'
                                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                            }`}
                          >
                            {sec === 0 ? '0s (Tanpa Freeze)' : `${sec.toFixed(1)}s`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. DRAWER: BRANDING & SUMBER */}
                {activeTab === 'branding' && (
                  <div className="space-y-4">
                    {/* Watermark Logo Channel */}
                    <div className="p-3 bg-zinc-900/70 border border-zinc-800 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-zinc-200 block">
                            Logo Channel
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            Tampilkan watermark logo channel.
                          </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={studioConfig.logoEnabled}
                            onChange={(e) =>
                              setStudioConfig((prev) => ({
                                ...prev,
                                logoEnabled: e.target.checked,
                              }))
                            }
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      {studioConfig.logoEnabled && (
                        <>
                          <div className="flex items-center gap-3 pt-2 border-t border-zinc-800/80">
                            {logoExists ? (
                              <div className="flex items-center gap-2">
                                <div className="w-9 h-9 rounded bg-black/60 border border-zinc-700 p-1 flex items-center justify-center">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={`/api/settings/logo/file?t=${videoTimestampKey}`}
                                    alt="Logo channel"
                                    className="max-h-full max-w-full object-contain"
                                  />
                                </div>
                                <span className="text-[11px] text-emerald-400 font-medium">
                                  ✓ Logo Tersedia
                                </span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-amber-400">⚠️ Belum ada logo</span>
                            )}

                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={handleLogoUpload}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploadingLogo}
                              className="ml-auto px-2.5 py-1 text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 rounded transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                            >
                              <Upload className="w-3 h-3" />
                              <span>Ganti Logo</span>
                            </button>
                          </div>

                          <div>
                            <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                              <span>Opasitas Logo</span>
                              <span className="font-mono text-zinc-200">
                                {Math.round(studioConfig.logoOpacity * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0.2"
                              max="1.0"
                              step="0.05"
                              value={studioConfig.logoOpacity}
                              onChange={(e) =>
                                setStudioConfig((prev) => ({
                                  ...prev,
                                  logoOpacity: parseFloat(e.target.value),
                                }))
                              }
                              className="w-full accent-blue-500 cursor-pointer"
                            />
                          </div>

                          <div>
                            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                              Posisi Watermark
                            </span>
                            <div className="grid grid-cols-2 gap-1.5">
                              {(
                                ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const
                              ).map((pos) => (
                                <button
                                  key={pos}
                                  type="button"
                                  onClick={() =>
                                    setStudioConfig((prev) => ({ ...prev, logoPosition: pos }))
                                  }
                                  className={`py-1.5 px-2 text-[11px] rounded border transition-all cursor-pointer ${
                                    studioConfig.logoPosition === pos
                                      ? 'bg-blue-600/30 text-blue-300 border-blue-500 font-semibold'
                                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                                  }`}
                                >
                                  {pos === 'top-left' && 'Pojok Kiri Atas'}
                                  {pos === 'top-right' && 'Pojok Kanan Atas'}
                                  {pos === 'bottom-left' && 'Pojok Kiri Bawah'}
                                  {pos === 'bottom-right' && 'Pojok Kanan Bawah'}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Sumber Video Asli */}
                    <div className="p-3 bg-zinc-900/70 border border-zinc-800 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-zinc-200 block">
                            Sumber Video Asli
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            Atribusi sumber konten kreator asli.
                          </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={studioConfig.sourceEnabled}
                            onChange={(e) =>
                              setStudioConfig((prev) => ({
                                ...prev,
                                sourceEnabled: e.target.checked,
                              }))
                            }
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      {studioConfig.sourceEnabled && (
                        <>
                          <input
                            type="text"
                            value={studioConfig.sourceText || ''}
                            onChange={(e) =>
                              setStudioConfig((prev) => ({ ...prev, sourceText: e.target.value }))
                            }
                            placeholder="Contoh: Source: Raditya Dika"
                            className="w-full text-xs bg-zinc-950 border border-zinc-800 text-zinc-100 rounded px-2.5 py-1.5 focus:border-blue-500 focus:outline-none font-medium mt-1"
                          />

                          <div className="pt-2 border-t border-zinc-800/80">
                            <label className="text-[11px] text-zinc-400 block mb-1.5 font-medium">
                              Posisi Atribusi Sumber
                            </label>
                            <div className="grid grid-cols-1 gap-1.5">
                              {(
                                [
                                  { pos: 'top-right', label: 'Pojok Kanan Atas - Rekomendasi' },
                                  { pos: 'top-left', label: 'Pojok Kiri Atas' },
                                  { pos: 'bottom', label: 'Bawah Tengah' },
                                ] as const
                              ).map(({ pos, label }) => {
                                const isSelected =
                                  (studioConfig.sourcePosition || 'top-right') === pos;
                                return (
                                  <button
                                    key={pos}
                                    type="button"
                                    onClick={() =>
                                      setStudioConfig((prev) => ({ ...prev, sourcePosition: pos }))
                                    }
                                    className={`py-1.5 px-2.5 text-[11px] rounded border transition-all cursor-pointer text-left flex items-center justify-between ${
                                      isSelected
                                        ? 'bg-blue-600/30 text-blue-300 border-blue-500 font-semibold'
                                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                                    }`}
                                  >
                                    <span>{label}</span>
                                    {isSelected && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. DRAWER: TRANSISI */}
                {activeTab === 'transition' && (
                  <div className="space-y-4">
                    <div className="p-3 bg-zinc-900/70 border border-zinc-800 rounded-lg space-y-3">
                      <div>
                        <div className="flex justify-between text-xs text-zinc-300 mb-1">
                          <span className="font-semibold">Fade In (Pembuka)</span>
                          <span className="font-mono text-blue-400">
                            {studioConfig.fadeInDuration.toFixed(1)}s
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1.5"
                          step="0.1"
                          value={studioConfig.fadeInDuration}
                          onChange={(e) =>
                            setStudioConfig((prev) => ({
                              ...prev,
                              fadeInDuration: parseFloat(e.target.value),
                            }))
                          }
                          className="w-full accent-blue-500 cursor-pointer"
                        />
                        <p className="text-[10px] text-zinc-400 mt-1">
                          Efek transisi video memudar masuk dari warna hitam di detik awal.
                        </p>
                      </div>

                      <div className="pt-2 border-t border-zinc-800">
                        <div className="flex justify-between text-xs text-zinc-300 mb-1">
                          <span className="font-semibold">Fade Out (Penutup)</span>
                          <span className="font-mono text-blue-400">
                            {studioConfig.fadeOutDuration.toFixed(1)}s
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="2.0"
                          step="0.1"
                          value={studioConfig.fadeOutDuration}
                          onChange={(e) =>
                            setStudioConfig((prev) => ({
                              ...prev,
                              fadeOutDuration: parseFloat(e.target.value),
                            }))
                          }
                          className="w-full accent-blue-500 cursor-pointer"
                        />
                        <p className="text-[10px] text-zinc-400 mt-1">
                          Efek transisi video memudar keluar ke warna hitam sebelum video selesai.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. DRAWER: AUDIO */}
                {activeTab === 'audio' && (
                  <div className="space-y-4">
                    <div className="p-3 bg-zinc-900/70 border border-zinc-800 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-zinc-200 block">
                            Voiceover Narator AI (Edge-TTS)
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            Narator membaca judul hook dengan ducking otomatis.
                          </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={studioConfig.hookTtsEnabled !== false}
                            onChange={(e) =>
                              setStudioConfig((prev) => ({
                                ...prev,
                                hookTtsEnabled: e.target.checked,
                              }))
                            }
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                          Pilihan Suara
                        </label>
                        <select
                          value={studioConfig.hookTtsVoice || 'id-ID-GadisNeural'}
                          onChange={(e) =>
                            setStudioConfig((prev) => ({ ...prev, hookTtsVoice: e.target.value }))
                          }
                          className="w-full text-xs bg-zinc-950 border border-zinc-800 text-zinc-100 rounded px-2.5 py-1.5 focus:border-blue-500 focus:outline-none"
                        >
                          <option value="id-ID-GadisNeural">
                            Suara Wanita (GadisNeural - CapCut Style)
                          </option>
                          <option value="id-ID-ArdiNeural">
                            Suara Pria (ArdiNeural - Deep Bass)
                          </option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* C. Center Canvas Monitor (9:16 Vertical Video Preview) */}
        <div className="flex-1 bg-[#09090c] flex flex-col items-center justify-between p-3 relative min-w-0 overflow-hidden">
          {/* Canvas Container */}
          <div className="flex-1 flex items-center justify-center w-full min-h-0">
            <div className="relative aspect-[9/16] h-full min-h-[280px] max-h-[calc(100vh-320px)] w-auto bg-black rounded-lg shadow-2xl border border-zinc-800 overflow-hidden flex items-center justify-center">
              <video
                ref={videoRef}
                src={videoSrc}
                playsInline
                preload="metadata"
                className="w-full h-full object-cover"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onError={() =>
                  setError(
                    'Gagal memuat preview video klip. Pastikan berkas media tersedia di disk.',
                  )
                }
                onClick={togglePlay}
              />

              {/* Notice when playing an already exported / hardsubbed video */}
              {!isCleanVideo && (
                <div className="absolute top-2 left-2 z-30 px-2 py-0.5 rounded bg-zinc-900/90 border border-zinc-750 text-[10px] text-amber-400 font-mono shadow-sm flex items-center gap-1.5 pointer-events-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Preview Ekspor (Hardsub)</span>
                </div>
              )}

              {/* Overlaid Mockup Layers (Matches Actual Render) */}
              {/* Layer 1A: Watermark Logo - only render if clean video */}
              {studioConfig.logoEnabled && logoExists && isCleanVideo && (
                <div
                  className={`pointer-events-none z-20 ${
                    (studioConfig.logoPosition || 'top-left') === 'top-left'
                      ? 'absolute top-4 left-4'
                      : (studioConfig.logoPosition || 'top-left') === 'top-right'
                        ? 'absolute top-4 right-4'
                        : (studioConfig.logoPosition || 'top-left') === 'bottom-left'
                          ? 'absolute bottom-6 left-4'
                          : 'absolute bottom-6 right-4'
                  }`}
                >
                  <div
                    className="w-7 h-7 rounded shadow-md overflow-hidden"
                    style={{ opacity: studioConfig.logoOpacity }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/settings/logo/file?t=${videoTimestampKey}`}
                      alt="Logo"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              )}

              {/* Layer 1B: Source Attribution Pill */}
              {studioConfig.sourceEnabled &&
                studioConfig.sourceText &&
                (() => {
                  const isLogoVisible = studioConfig.logoEnabled && logoExists && isCleanVideo;
                  const logoPos = studioConfig.logoPosition || 'top-left';
                  const sourcePos = studioConfig.sourcePosition || 'top-right';

                  let pillPlacement = 'absolute pointer-events-none z-20 ';
                  if (sourcePos === 'bottom') {
                    pillPlacement += 'bottom-28 left-1/2 -translate-x-1/2';
                  } else if (sourcePos === 'top-left') {
                    pillPlacement +=
                      isLogoVisible && logoPos === 'top-left' ? 'top-4 left-14' : 'top-4 left-4';
                  } else {
                    // top-right
                    pillPlacement +=
                      isLogoVisible && logoPos === 'top-right' ? 'top-4 right-14' : 'top-4 right-4';
                  }

                  return (
                    <div className={pillPlacement}>
                      <div className="bg-white/90 text-zinc-900 text-[9px] font-bold px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap">
                        {studioConfig.sourceText}
                      </div>
                    </div>
                  );
                })()}

              {/* Layer 2: Hook Headline Banner (Shows in first 3.1s) */}
              {currentTime <= 3.1 && studioConfig.hookText && (
                <div
                  className={`absolute left-3 right-3 text-center pointer-events-none z-20 transition-all ${
                    (studioConfig.hookPosition || 'center') === 'top'
                      ? 'top-14'
                      : 'top-1/2 -translate-y-1/2'
                  }`}
                >
                  <div className="inline-block bg-amber-400 text-black font-black uppercase text-xs sm:text-sm px-3.5 py-1.5 rounded-md shadow-2xl border-2 border-black tracking-wide">
                    {studioConfig.hookText}
                  </div>
                </div>
              )}

              {/* Layer 3: Active Subtitle Preview - only render if clean video */}
              {activeCue && isCleanVideo && (
                <div className="absolute bottom-16 left-3 right-3 text-center pointer-events-none z-20">
                  <span className="font-montserrat font-black text-amber-300 text-xs sm:text-sm px-2 py-1 rounded drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] stroke-black tracking-tight leading-snug whitespace-pre-line">
                    {activeCue.text}
                  </span>
                </div>
              )}

              {/* Freeze Frame Indicator Badge */}
              {studioConfig.freezeDuration > 0 && currentTime < studioConfig.freezeDuration && (
                <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-amber-400/90 text-black text-[9px] font-bold font-mono">
                  ⏱ Freeze: {studioConfig.freezeDuration.toFixed(1)}s
                </div>
              )}
            </div>
          </div>

          {/* Canvas Playback Controls Bar */}
          <div className="w-full max-w-md h-10 px-4 mt-2 bg-[#141418] border border-zinc-800 rounded-lg flex items-center justify-between shadow-lg shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const prevCue = cues.filter((c) => c.start < currentTime - 0.2).pop();
                  if (prevCue) handleSeek(prevCue.start);
                  else handleSeek(0);
                }}
                className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Cue Sebelumnya"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                className="w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-md transition-transform active:scale-95 cursor-pointer"
                title={isPlaying ? 'Pause (Spasi)' : 'Play (Spasi)'}
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  const nextCue = cues.find((c) => c.start > currentTime + 0.1);
                  if (nextCue) handleSeek(nextCue.start);
                }}
                className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Cue Selanjutnya"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>

              <span className="text-[11px] font-mono text-zinc-300 ml-2">
                {formatTimecode(currentTime)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.muted = !isMuted;
                    setIsMuted(!isMuted);
                  }
                }}
                className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (videoRef.current) {
                    if (document.fullscreenElement) {
                      document.exitFullscreen();
                    } else {
                      videoRef.current.requestFullscreen?.();
                    }
                  }
                }}
                className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Layar Penuh"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* D. Right Inspector Panel (Properties) */}
        <div
          className={`${
            showInspector ? 'flex w-64 xl:w-72' : 'hidden 2xl:flex'
          } 2xl:w-80 bg-[#16161c] border-l border-zinc-800/80 flex-col overflow-y-auto p-4 shrink-0 text-xs space-y-4`}
        >
          <div className="border-b border-zinc-800 pb-2">
            <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-blue-400" />
              <span>Inspector Properti</span>
            </span>
          </div>

          {/* Active Cue Properties */}
          {activeCue ? (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                  Cue Teks Terpilih (Detik {activeCue.start.toFixed(2)} - {activeCue.end.toFixed(2)}
                  )
                </label>
                <div className="p-2 rounded bg-zinc-900 border border-zinc-750 text-amber-300 font-semibold font-mono text-xs">
                  {activeCue.text}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                  Preset Warna Font CapCut
                </span>
                <div className="flex gap-2">
                  <div
                    className="w-7 h-7 rounded-full bg-[#FFE600] border-2 border-black shadow flex items-center justify-center text-[10px] font-bold text-black"
                    title="Kuning Standar Baku"
                  >
                    ✓
                  </div>
                  <div
                    className="w-7 h-7 rounded-full bg-white border border-zinc-700 shadow flex items-center justify-center text-[10px] font-bold text-black"
                    title="Putih Elegan"
                  ></div>
                  <div
                    className="w-7 h-7 rounded-full bg-[#00F0FF] border border-zinc-700 shadow flex items-center justify-center text-[10px] font-bold text-black"
                    title="Cyan Modern"
                  ></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-zinc-400 text-[11px] py-4 text-center">
              Klik balok subtitle di timeline untuk mengedit properti cue.
            </div>
          )}

          {/* Video Specs Summary */}
          <div className="pt-3 border-t border-zinc-800 space-y-2">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Spesifikasi Ekspor Klip
            </span>
            <div className="bg-zinc-900/60 p-2.5 rounded border border-zinc-800 space-y-1 text-[11px] font-mono">
              <div className="flex justify-between">
                <span className="text-zinc-400">Resolusi:</span>
                <span className="text-zinc-300">1080 x 1920 (9:16)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Frame Rate:</span>
                <span className="text-zinc-300">30 fps</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Durasi:</span>
                <span className="text-zinc-300">{duration.toFixed(1)}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Active Speaker:</span>
                <span className="text-emerald-400">Dynamic Face Crop</span>
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-blue-950/30 border border-blue-850 text-blue-300 text-[10px] leading-relaxed">
            💡 <strong>Formula Standar Baku:</strong> Gunakan Hook Kuning di 3 detik awal & subtitle
            natural per-frasa untuk retensi tinggi di TikTok & TryBuzzer.
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. MULTI-TRACK TIMELINE (CapCut NLE Style)                                */}
      {/* ========================================================================= */}
      <footer className="h-48 md:h-52 lg:h-56 bg-[#121216] border-t border-zinc-800/90 flex flex-col shrink-0 select-none overflow-hidden">
        {/* Timeline Header Toolbar */}
        <div className="h-7 px-3 bg-[#15151b] border-b border-zinc-800 flex items-center justify-between text-[11px] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 font-mono text-[10px]">
              Playhead: <strong className="text-blue-400">{formatTimecode(currentTime)}</strong>
            </span>
            <div className="h-3 w-px bg-zinc-700 mx-1" />
            <span className="text-[10px] text-zinc-400">Space: Play/Pause • Esc: Keluar</span>
          </div>

          {/* Timeline Zoom Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTimelineZoom((z) => Math.max(0.6, z - 0.2))}
              className="text-zinc-400 hover:text-white p-0.5 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min="0.6"
              max="2.5"
              step="0.1"
              value={timelineZoom}
              onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
              className="w-16 h-1 accent-blue-500 cursor-pointer"
            />
            <button
              type="button"
              onClick={() => setTimelineZoom((z) => Math.min(2.5, z + 0.2))}
              className="text-zinc-400 hover:text-white p-0.5 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTimelineZoom(1.0)}
              className="text-[10px] font-mono text-zinc-400 hover:text-white px-1.5 py-0.5 rounded bg-zinc-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              1.0x
            </button>
          </div>
        </div>

        {/* Timeline Scrollable Track Area */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-x-auto overflow-y-auto relative bg-[#0e0e12] p-1.5"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left + e.currentTarget.scrollLeft;
            const targetSec = clickX / pixelsPerSecond;
            handleSeek(targetSec);
          }}
        >
          <div
            style={{ width: `${totalTimelineWidth}px` }}
            className="relative h-full flex flex-col gap-1"
          >
            {/* A. Time Ruler (Detik Marker) */}
            <div className="h-5 relative border-b border-zinc-800 text-[9px] text-zinc-400 font-mono select-none">
              {Array.from({ length: Math.ceil((duration || 35) / 5) + 1 }).map((_, i) => {
                const sec = i * 5;
                const xPos = sec * pixelsPerSecond;
                return (
                  <div key={sec} className="absolute top-0 bottom-0" style={{ left: `${xPos}px` }}>
                    <div className="h-2 w-px bg-zinc-700" />
                    <span className="absolute top-1 left-1">{formatTimecode(sec)}</span>
                  </div>
                );
              })}
            </div>

            {/* B. Red Playhead Needle */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none transition-all duration-75"
              style={{ left: `${currentTime * pixelsPerSecond}px` }}
            >
              {/* Playhead Needle Head (Triangle) */}
              <div className="w-3 h-3 bg-red-500 absolute -top-1 -left-[5px] rotate-45 rounded-xs shadow-md" />
            </div>

            {/* TRACK 1: Hook Banner */}
            <div className="h-6 bg-zinc-900/60 rounded border border-zinc-800 relative flex items-center px-2">
              <span className="text-[10px] font-mono text-zinc-400 w-16 shrink-0 flex items-center gap-1">
                <Type className="w-3 h-3 text-amber-400" /> Hook
              </span>
              <div className="flex-1 relative h-full">
                {studioConfig.hookText && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTab('hook');
                      handleSeek(0);
                    }}
                    className="absolute top-0.5 bottom-0.5 bg-amber-500/80 hover:bg-amber-400 text-black text-[10px] font-bold px-2 rounded flex items-center truncate cursor-pointer shadow-sm border border-amber-300 transition-colors"
                    style={{ left: '0px', width: `${3.1 * pixelsPerSecond}px` }}
                    title={`Hook: ${studioConfig.hookText}`}
                  >
                    🪝 {studioConfig.hookText}
                  </div>
                )}
              </div>
            </div>

            {/* TRACK 2: Subtitle Captions Track */}
            <div className="h-7 bg-zinc-900/60 rounded border border-zinc-800 relative flex items-center px-2">
              <span className="text-[10px] font-mono text-zinc-400 w-16 shrink-0 flex items-center gap-1">
                <MessageSquare className="w-3 h-3 text-blue-400" /> Sub
              </span>
              <div className="flex-1 relative h-full">
                {cues.map((cue, idx) => {
                  const left = cue.start * pixelsPerSecond;
                  const width = Math.max(16, (cue.end - cue.start) * pixelsPerSecond);
                  const isCurrent = currentTime >= cue.start && currentTime <= cue.end;

                  return (
                    <div
                      key={cue.id || idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCueIndex(idx);
                        setActiveTab('subtitle');
                        handleSeek(cue.start);
                      }}
                      className={`absolute top-0.5 bottom-0.5 text-[9px] font-medium px-1 rounded flex items-center truncate cursor-pointer transition-all border ${
                        isCurrent
                          ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-md z-10'
                          : 'bg-blue-950/80 text-blue-200 border-blue-800 hover:bg-blue-900'
                      }`}
                      style={{ left: `${left}px`, width: `${width}px` }}
                      title={`${formatTimecode(cue.start)} - ${formatTimecode(cue.end)}: ${cue.text}`}
                    >
                      {cue.text}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* TRACK 3: Branding & Watermark */}
            <div className="h-6 bg-zinc-900/60 rounded border border-zinc-800 relative flex items-center px-2">
              <span className="text-[10px] font-mono text-zinc-400 w-16 shrink-0 flex items-center gap-1">
                <ImageIcon className="w-3 h-3 text-emerald-400" /> Brand
              </span>
              <div className="flex-1 relative h-full">
                {studioConfig.logoEnabled && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTab('branding');
                    }}
                    className="absolute top-0.5 bottom-0.5 bg-emerald-950/80 text-emerald-300 text-[9px] font-medium px-2 rounded flex items-center truncate cursor-pointer border border-emerald-800/80"
                    style={{ left: '0px', width: `${duration * pixelsPerSecond}px` }}
                  >
                    🏷️ Watermark Logo ({studioConfig.logoPosition}) •{' '}
                    {studioConfig.sourceText || 'Atribusi Sumber'}
                  </div>
                )}
              </div>
            </div>

            {/* TRACK 4: Video Master Clip */}
            <div className="h-6 bg-zinc-900/60 rounded border border-zinc-800 relative flex items-center px-2">
              <span className="text-[10px] font-mono text-zinc-400 w-16 shrink-0 flex items-center gap-1">
                <Film className="w-3 h-3 text-indigo-400" /> Video
              </span>
              <div className="flex-1 relative h-full">
                <div
                  className="absolute top-0.5 bottom-0.5 bg-indigo-950/90 text-indigo-300 text-[9px] font-mono px-2 rounded flex items-center truncate border border-indigo-800/80 shadow-inner"
                  style={{ left: '0px', width: `${duration * pixelsPerSecond}px` }}
                >
                  🎬 Footage Vertical 1080x1920 (Active Speaker Framing)
                </div>
              </div>
            </div>

            {/* TRACK 5: Audio & Ducking */}
            <div className="h-6 bg-zinc-900/60 rounded border border-zinc-800 relative flex items-center px-2">
              <span className="text-[10px] font-mono text-zinc-400 w-16 shrink-0 flex items-center gap-1">
                <Music className="w-3 h-3 text-cyan-400" /> Audio
              </span>
              <div className="flex-1 relative h-full">
                <div
                  className="absolute top-0.5 bottom-0.5 bg-cyan-950/80 text-cyan-300 text-[9px] font-mono px-2 rounded flex items-center truncate border border-cyan-800/80"
                  style={{ left: '0px', width: `${duration * pixelsPerSecond}px` }}
                >
                  🎵 Source Audio + Ducking Level (-16 LUFS)
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
