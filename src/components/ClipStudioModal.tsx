'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { SubtitleCue, formatSrtTimestamp } from '@/pipeline/logic/srtParser';
import { StudioConfig, DEFAULT_STUDIO_CONFIG } from '@/types/clipStudio';
import {
  X,
  Loader2,
  Sparkles,
  Type,
  Image as ImageIcon,
  MessageSquare,
  Sliders,
  Play,
  Upload,
  CheckCircle,
  AlertCircle,
  Clock,
  Trash2,
  Plus,
} from 'lucide-react';

interface ClipStudioModalProps {
  clipId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialTab?: 'hook' | 'branding' | 'subtitle' | 'transition';
}

const FREEZE_OPTIONS = [0, 1.0, 1.2, 1.5, 2.0];

export default function ClipStudioModal({
  clipId,
  isOpen,
  onClose,
  onSuccess,
  initialTab = 'hook',
}: ClipStudioModalProps) {
  const [activeTab, setActiveTab] = useState<'hook' | 'branding' | 'subtitle' | 'transition'>(
    initialTab,
  );
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [studioConfig, setStudioConfig] = useState<StudioConfig>(DEFAULT_STUDIO_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reBurning, setReBurning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [videoTimestampKey, setVideoTimestampKey] = useState<number>(Date.now());

  // Logo state
  const [logoExists, setLogoExists] = useState<boolean>(false);
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const [logoUploadMsg, setLogoUploadMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchStudioData = useCallback(async () => {
    if (!clipId) return;
    setLoading(true);
    setError(null);
    setStatusMessage(null);
    try {
      const [studioRes, logoRes] = await Promise.all([
        fetch(`/api/clips/${clipId}/studio`),
        fetch('/api/settings/logo'),
      ]);

      const studioPayload = await studioRes.json();
      if (!studioRes.ok || !studioPayload.success) {
        throw new Error(studioPayload?.error?.message || 'Gagal memuat konfigurasi studio klip');
      }

      const data = studioPayload.data;
      if (data.studioConfig) {
        setStudioConfig(data.studioConfig);
      }
      if (Array.isArray(data.cues)) {
        setCues(data.cues);
      }

      if (logoRes.ok) {
        const logoPayload = await logoRes.json();
        if (logoPayload.success) {
          setLogoExists(!!logoPayload.data?.exists);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat memuat data studio');
    } finally {
      setLoading(false);
    }
  }, [clipId]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      fetchStudioData();
    }
  }, [isOpen, initialTab, fetchStudioData]);

  // Keyboard accessibility: Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !saving && !reBurning) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, saving, reBurning, onClose]);

  const handleSeek = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, seconds);
      videoRef.current.play().catch(() => {});
    }
  };

  const handleCueTextChange = (index: number, newText: string) => {
    setCues((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], text: newText };
      return updated;
    });
  };

  const handleCueTimeChange = (index: number, field: 'start' | 'end', valStr: string) => {
    const num = parseFloat(valStr);
    setCues((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: isNaN(num) ? 0 : Math.max(0, num) };
      return updated;
    });
  };

  const handleAddCueBelow = (index: number) => {
    setCues((prev) => {
      const current = prev[index];
      const next = prev[index + 1];
      const start = current ? current.end + 0.1 : 0;
      const end = next ? Math.min(next.start - 0.1, start + 2.0) : start + 2.0;

      const newCue: SubtitleCue = {
        id: (current?.id ?? 0) + 1,
        start,
        end: Math.max(start + 0.5, end),
        text: 'Teks subtitle baru',
      };

      const updated = [...prev.slice(0, index + 1), newCue, ...prev.slice(index + 1)];
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
      setError(err.message || 'Gagal merender video studio');
    } finally {
      setReBurning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-2 sm:p-4 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-editor-title"
    >
      <div
        ref={modalRef}
        className="bg-zinc-950/95 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-zinc-100 backdrop-blur-md"
      >
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-700/60 flex items-center justify-center text-indigo-400 shadow-inner">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 id="studio-editor-title" className="text-base font-bold text-zinc-100">
                Editor Subtitle Klip & Studio Workspace
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Kustomisasi headline hook, branding channel, subtitle, dan transisi video.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={reBurning || saving}
            className="text-zinc-400 hover:text-zinc-100 p-2 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
            aria-label="Tutup jendela editor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: 2 Columns */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden min-h-[480px]">
          {/* Left Column: 9:16 Video Player Preview */}
          <div className="md:col-span-5 bg-zinc-950 p-4 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-zinc-800">
            <div className="relative w-full max-w-[260px] aspect-[9/16] bg-black rounded-lg overflow-hidden border border-zinc-800 flex items-center justify-center shadow-2xl">
              <video
                ref={videoRef}
                key={videoTimestampKey}
                src={`/api/clips/${clipId}/file?t=${videoTimestampKey}`}
                controls
                className="w-full h-full object-contain"
                playsInline
              />

              {/* Live Mockup Overlay: Hook Headline */}
              {studioConfig.hookText && (
                <div className="absolute top-4 inset-x-3 pointer-events-none z-20 text-center animate-fade-in">
                  <div className="bg-amber-400 text-zinc-950 font-black text-xs uppercase px-2 py-1 rounded shadow-lg tracking-wide border border-amber-300">
                    {studioConfig.hookText}
                  </div>
                </div>
              )}

              {/* Live Mockup Overlay: Channel Logo */}
              {studioConfig.logoEnabled && logoExists && (
                <div
                  className={`absolute z-20 pointer-events-none ${
                    studioConfig.logoPosition === 'top-left'
                      ? 'top-3 left-3'
                      : studioConfig.logoPosition === 'bottom-left'
                        ? 'bottom-16 left-3'
                        : studioConfig.logoPosition === 'bottom-right'
                          ? 'bottom-16 right-3'
                          : 'top-3 right-3'
                  }`}
                  style={{ opacity: studioConfig.logoOpacity }}
                >
                  <img
                    src={`/api/settings/logo/file?t=${videoTimestampKey}`}
                    alt="Logo"
                    className="w-9 h-9 object-contain drop-shadow-md rounded"
                  />
                </div>
              )}

              {/* Live Mockup Overlay: Source Attribution */}
              {studioConfig.sourceEnabled && studioConfig.sourceText && (
                <div className="absolute bottom-4 left-3 pointer-events-none z-10 text-[9px] text-zinc-200 font-medium bg-black/60 px-1.5 py-0.5 rounded border border-zinc-700/50 backdrop-blur-xs">
                  {studioConfig.sourceText}
                </div>
              )}

              {/* Freeze frame pill badge */}
              {studioConfig.freezeDuration > 0 && (
                <div className="absolute top-2 left-2 text-[9px] font-mono bg-zinc-900/85 text-zinc-300 border border-zinc-700/60 px-1.5 py-0.5 rounded pointer-events-none z-10 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5 text-amber-400" />
                  <span>Freeze: {studioConfig.freezeDuration}s</span>
                </div>
              )}
            </div>

            <div className="mt-3 text-[11px] text-zinc-400 text-center max-w-xs">
              Mockup elemen aktif di atas video aktual. Klik badge waktu cue untuk loncat.
            </div>
          </div>

          {/* Right Column: Tabbed Studio Workspace */}
          <div className="md:col-span-7 flex flex-col h-full overflow-hidden bg-zinc-900/40">
            {/* Studio Navigation Tabs */}
            <div className="px-4 border-b border-zinc-800 flex items-center gap-1 bg-zinc-900/90 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('hook')}
                className={`py-3 px-3 text-xs font-semibold inline-flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'hook'
                    ? 'border-indigo-500 text-indigo-300 bg-zinc-800/40'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Hook & Headline</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('branding')}
                className={`py-3 px-3 text-xs font-semibold inline-flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'branding'
                    ? 'border-indigo-500 text-indigo-300 bg-zinc-800/40'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Branding & Sumber</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('subtitle')}
                className={`py-3 px-3 text-xs font-semibold inline-flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'subtitle'
                    ? 'border-indigo-500 text-indigo-300 bg-zinc-800/40'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Subtitle ({cues.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('transition')}
                className={`py-3 px-3 text-xs font-semibold inline-flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'transition'
                    ? 'border-indigo-500 text-indigo-300 bg-zinc-800/40'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Transisi</span>
              </button>
            </div>

            {/* Tab Panels */}
            <div className="flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-48 text-zinc-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  <span className="text-xs">Memuat data klip dan studio...</span>
                </div>
              ) : (
                <>
                  {/* TAB 1: Hook & Headline */}
                  {activeTab === 'hook' && (
                    <div className="space-y-6">
                      <div>
                        <label
                          htmlFor="hook-input"
                          className="block text-xs font-semibold text-zinc-200 mb-1.5"
                        >
                          Teks Headline Hook (Atas)
                        </label>
                        <input
                          id="hook-input"
                          type="text"
                          value={studioConfig.hookText}
                          onChange={(e) =>
                            setStudioConfig({ ...studioConfig, hookText: e.target.value })
                          }
                          placeholder="Contoh: RAHASIA SUKSES DI USIA MUDA"
                          className="w-full text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium placeholder:text-zinc-500"
                        />
                        <p className="text-[11px] text-zinc-400 mt-1.5">
                          Teks banner huruf kapital 3-5 kata untuk merebut perhatian audiens di 3
                          detik awal video.
                        </p>
                      </div>

                      {/* Freeze frame duration */}
                      <div>
                        <label className="block text-xs font-semibold text-zinc-200 mb-2">
                          Durasi Freeze Frame Awal
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {FREEZE_OPTIONS.map((sec) => (
                            <button
                              key={sec}
                              type="button"
                              onClick={() =>
                                setStudioConfig({ ...studioConfig, freezeDuration: sec })
                              }
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                                studioConfig.freezeDuration === sec
                                  ? 'bg-amber-400 text-zinc-950 border-amber-300 shadow-sm'
                                  : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800'
                              }`}
                            >
                              {sec === 0 ? '0s (Tanpa Freeze)' : `${sec.toFixed(1)}s`}
                            </button>
                          ))}
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1.5">
                          Menahan frame awal video selama beberapa detik agar audiens sempat membaca
                          headline hook sebelum suara dimulai.
                        </p>
                      </div>

                      {/* Live preview banner card mockup */}
                      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                        <span className="text-[11px] text-zinc-400 uppercase tracking-wider block mb-2 font-medium">
                          Simulasi Banner Hook
                        </span>
                        <div className="bg-zinc-900 p-4 rounded border border-zinc-800 text-center">
                          {studioConfig.hookText ? (
                            <div className="inline-block bg-amber-400 text-zinc-950 font-black text-sm uppercase px-3 py-1.5 rounded shadow border border-amber-300">
                              {studioConfig.hookText}
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-500 italic">
                              Masukkan teks hook di atas untuk melihat preview banner
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: Branding & Sumber */}
                  {activeTab === 'branding' && (
                    <div className="space-y-6">
                      {/* Logo Section */}
                      <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-xs font-semibold text-zinc-200">Logo Channel</h3>
                            <p className="text-[11px] text-zinc-400">
                              Tampilkan watermark logo channel di sudut video.
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={studioConfig.logoEnabled}
                              onChange={(e) =>
                                setStudioConfig({ ...studioConfig, logoEnabled: e.target.checked })
                              }
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                          </label>
                        </div>

                        {/* Status logo and upload button */}
                        <div className="flex items-center justify-between gap-3 pt-3 border-t border-zinc-850">
                          <div className="flex items-center gap-2">
                            {logoExists ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-2 py-0.5 rounded">
                                <CheckCircle className="w-3 h-3" />
                                Logo Tersedia
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-950/50 border border-amber-800/60 px-2 py-0.5 rounded">
                                <AlertCircle className="w-3 h-3" />
                                Logo Belum Ada
                              </span>
                            )}
                            {logoUploadMsg && (
                              <span className="text-[11px] text-zinc-400">{logoUploadMsg}</span>
                            )}
                          </div>

                          <div>
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
                              className="px-2.5 py-1.5 text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {uploadingLogo ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Upload className="w-3.5 h-3.5" />
                              )}
                              <span>{logoExists ? 'Ganti Logo' : 'Unggah Logo'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Opacity slider */}
                        {studioConfig.logoEnabled && (
                          <div className="pt-2 space-y-3">
                            <div>
                              <div className="flex justify-between text-xs text-zinc-300 mb-1">
                                <span>Opasitas Logo</span>
                                <span className="font-mono text-indigo-300">
                                  {Math.round(studioConfig.logoOpacity * 100)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0.5"
                                max="1.0"
                                step="0.05"
                                value={studioConfig.logoOpacity}
                                onChange={(e) =>
                                  setStudioConfig({
                                    ...studioConfig,
                                    logoOpacity: parseFloat(e.target.value),
                                  })
                                }
                                className="w-full accent-indigo-500 bg-zinc-800 h-1.5 rounded cursor-pointer"
                              />
                            </div>

                            {/* Position Selector */}
                            <div>
                              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                                Posisi Watermark
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { id: 'top-right', label: 'Pojok Kanan Atas' },
                                  { id: 'top-left', label: 'Pojok Kiri Atas' },
                                  { id: 'bottom-right', label: 'Pojok Kanan Bawah' },
                                  { id: 'bottom-left', label: 'Pojok Kiri Bawah' },
                                ].map((pos) => (
                                  <button
                                    key={pos.id}
                                    type="button"
                                    onClick={() =>
                                      setStudioConfig({
                                        ...studioConfig,
                                        logoPosition: pos.id as any,
                                      })
                                    }
                                    className={`py-1.5 px-2.5 text-xs rounded-lg border text-left transition-colors cursor-pointer ${
                                      studioConfig.logoPosition === pos.id
                                        ? 'bg-indigo-950/70 border-indigo-600 text-indigo-200'
                                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850'
                                    }`}
                                  >
                                    {pos.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Source attribution section */}
                      <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-xs font-semibold text-zinc-200">
                              Sumber Video Asli
                            </h3>
                            <p className="text-[11px] text-zinc-400">
                              Atribusi sumber konten kreator asli.
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={studioConfig.sourceEnabled}
                              onChange={(e) =>
                                setStudioConfig({
                                  ...studioConfig,
                                  sourceEnabled: e.target.checked,
                                })
                              }
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                          </label>
                        </div>

                        {studioConfig.sourceEnabled && (
                          <div>
                            <input
                              type="text"
                              value={studioConfig.sourceText}
                              onChange={(e) =>
                                setStudioConfig({ ...studioConfig, sourceText: e.target.value })
                              }
                              placeholder="Contoh: Sumber: Raditya Dika | YouTube"
                              className="w-full text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-zinc-500"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: Subtitle */}
                  {activeTab === 'subtitle' && (
                    <div className="space-y-4">
                      {/* Subtitle style selector bar */}
                      <div className="flex items-center justify-between gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                        <label
                          htmlFor="style-select"
                          className="text-xs font-semibold text-zinc-300"
                        >
                          Gaya Subtitle:
                        </label>
                        <select
                          id="style-select"
                          value={studioConfig.subtitleStyleId}
                          onChange={(e) =>
                            setStudioConfig({ ...studioConfig, subtitleStyleId: e.target.value })
                          }
                          className="text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="tiktok">TikTok (Bold Putih, Outline Hitam)</option>
                          <option value="sule">Sule (Bold Kuning, Outline Hitam Tebal)</option>
                          <option value="kamal">Kamal (Garis Tepi, Bayangan Merah)</option>
                        </select>
                      </div>

                      {/* Cue list */}
                      <div className="space-y-3">
                        {cues.length === 0 ? (
                          <div className="text-center py-10 text-zinc-500 text-xs">
                            Tidak ada baris subtitle untuk klip ini.
                          </div>
                        ) : (
                          cues.map((cue, idx) => (
                            <div
                              key={cue.id}
                              className="p-3 bg-zinc-950/80 border border-zinc-800/90 rounded-lg space-y-2 hover:border-zinc-700 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSeek(cue.start)}
                                  className="text-[10px] font-mono font-semibold bg-zinc-900 hover:bg-zinc-800 text-indigo-300 border border-zinc-700 px-2 py-1 rounded inline-flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Klik untuk memutar video pada detik ini"
                                >
                                  <Play className="w-2.5 h-2.5 fill-current" />
                                  <span>
                                    {formatSrtTimestamp(cue.start)} &rarr;{' '}
                                    {formatSrtTimestamp(cue.end)}
                                  </span>
                                </button>

                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={cue.start}
                                    onChange={(e) =>
                                      handleCueTimeChange(idx, 'start', e.target.value)
                                    }
                                    className="w-14 text-[10px] bg-zinc-900 border border-zinc-750 rounded px-1.5 py-0.5 text-zinc-200 font-mono text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    title="Mulai (detik)"
                                  />
                                  <span className="text-[10px] text-zinc-600">-</span>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={cue.end}
                                    onChange={(e) =>
                                      handleCueTimeChange(idx, 'end', e.target.value)
                                    }
                                    className="w-14 text-[10px] bg-zinc-900 border border-zinc-750 rounded px-1.5 py-0.5 text-zinc-200 font-mono text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    title="Selesai (detik)"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleAddCueBelow(idx)}
                                    className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                                    title="Tambah baris baru di bawah"
                                    aria-label="Tambah baris baru"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCue(idx)}
                                    className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                                    title="Hapus baris ini"
                                    aria-label="Hapus baris"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              <input
                                type="text"
                                value={cue.text}
                                onChange={(e) => handleCueTextChange(idx, e.target.value)}
                                placeholder="Ketik teks subtitle..."
                                className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-zinc-600"
                              />
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 4: Transisi */}
                  {activeTab === 'transition' && (
                    <div className="space-y-6">
                      <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-4 space-y-4">
                        <div>
                          <div className="flex justify-between text-xs text-zinc-300 mb-1">
                            <span className="font-semibold">Fade In (Pembuka)</span>
                            <span className="font-mono text-indigo-300">
                              {studioConfig.fadeInDuration.toFixed(1)}s
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0.0"
                            max="1.0"
                            step="0.1"
                            value={studioConfig.fadeInDuration}
                            onChange={(e) =>
                              setStudioConfig({
                                ...studioConfig,
                                fadeInDuration: parseFloat(e.target.value),
                              })
                            }
                            className="w-full accent-indigo-500 bg-zinc-800 h-1.5 rounded cursor-pointer"
                          />
                          <p className="text-[11px] text-zinc-400 mt-1">
                            Efek transisi video memudar masuk dari warna hitam di detik awal.
                          </p>
                        </div>

                        <div className="pt-3 border-t border-zinc-850">
                          <div className="flex justify-between text-xs text-zinc-300 mb-1">
                            <span className="font-semibold">Fade Out (Penutup)</span>
                            <span className="font-mono text-indigo-300">
                              {studioConfig.fadeOutDuration.toFixed(1)}s
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0.0"
                            max="1.0"
                            step="0.1"
                            value={studioConfig.fadeOutDuration}
                            onChange={(e) =>
                              setStudioConfig({
                                ...studioConfig,
                                fadeOutDuration: parseFloat(e.target.value),
                              })
                            }
                            className="w-full accent-indigo-500 bg-zinc-800 h-1.5 rounded cursor-pointer"
                          />
                          <p className="text-[11px] text-zinc-400 mt-1">
                            Efek transisi video memudar keluar ke warna hitam sebelum video selesai.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Status and Error Banners */}
            {error && (
              <div className="px-5 py-2.5 bg-rose-950/70 border-t border-rose-900/60 text-xs text-rose-300 flex items-center justify-between">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-rose-400 hover:text-rose-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {statusMessage && (
              <div className="px-5 py-2.5 bg-emerald-950/70 border-t border-emerald-900/60 text-xs text-emerald-300 flex items-center justify-between">
                <span>{statusMessage}</span>
                <button
                  type="button"
                  onClick={() => setStatusMessage(null)}
                  className="text-emerald-400 hover:text-emerald-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Bottom Action Toolbar */}
            <div className="px-5 py-3.5 border-t border-zinc-800 flex items-center justify-between gap-3 bg-zinc-950">
              <button
                type="button"
                onClick={onClose}
                disabled={saving || reBurning}
                className="px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal / Tutup
              </button>

              <div className="flex items-center gap-2">
                {/* Save Draft button (supports Simpan Subtitle matching for E2E tests) */}
                <button
                  type="button"
                  onClick={() => handleSaveDraft(true)}
                  disabled={saving || reBurning || loading}
                  className="px-3 py-1.5 text-xs font-semibold text-zinc-200 bg-zinc-850 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>Simpan Draf</span>
                  <span className="sr-only">Simpan Subtitle</span>
                </button>

                {/* Render Video Studio Button */}
                <button
                  type="button"
                  onClick={handleRenderStudio}
                  disabled={saving || reBurning || loading}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-sm cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {reBurning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Sedang Merender...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>🎬 Render Video Studio</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
