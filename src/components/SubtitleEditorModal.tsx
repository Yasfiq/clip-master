'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { SubtitleCue, formatSrtTimestamp } from '@/pipeline/logic/srtParser';

interface SubtitleEditorModalProps {
  clipId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function SubtitleEditorModal({
  clipId,
  isOpen,
  onClose,
  onSuccess,
}: SubtitleEditorModalProps) {
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reBurning, setReBurning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<string>('tiktok');
  const [videoTimestampKey, setVideoTimestampKey] = useState<number>(Date.now());

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  const fetchSubtitles = useCallback(async () => {
    if (!clipId) return;
    setLoading(true);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/clips/${clipId}/subtitles`);
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload?.error?.message || 'Gagal memuat subtitle');
      }
      setCues(payload.data?.cues || []);
      if (payload.data?.subtitleStyle) {
        setStyleId(payload.data.subtitleStyle);
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat memuat subtitle');
    } finally {
      setLoading(false);
    }
  }, [clipId]);

  useEffect(() => {
    if (isOpen) {
      fetchSubtitles();
    }
  }, [isOpen, fetchSubtitles]);

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

  const handleSaveSubtitles = async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/clips/${clipId}/subtitles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cues }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload?.error?.message || 'Gagal menyimpan subtitle');
      }
      setStatusMessage('Subtitle berhasil disimpan ke disk.');
      return true;
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan subtitle');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleReBurn = async () => {
    // First save changes so re-burning uses the latest text
    const saved = await handleSaveSubtitles();
    if (!saved) return;

    setReBurning(true);
    setError(null);
    setStatusMessage('Sedang merender ulang video dengan subtitle baru. Harap tunggu...');
    try {
      const res = await fetch(`/api/clips/${clipId}/re-burn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ styleId }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload?.error?.message || 'Gagal merender ulang video');
      }

      setStatusMessage('Video berhasil dirender ulang dengan subtitle terbaru!');
      const newKey = Date.now();
      setVideoTimestampKey(newKey);
      if (videoRef.current) {
        videoRef.current.load();
      }
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Gagal merender ulang video');
    } finally {
      setReBurning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subtitle-editor-title"
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950">
          <div>
            <h2
              id="subtitle-editor-title"
              className="text-lg font-bold text-zinc-900 dark:text-zinc-100"
            >
              Editor Subtitle Klip
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Edit teks perkata, atur timing, dan render ulang subtitle ke video.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={reBurning || saving}
            className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            aria-label="Tutup jendela editor"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left Column: Video Preview */}
          <div className="md:col-span-5 bg-black p-4 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800">
            <div className="relative w-full max-w-[280px] aspect-[9/16] bg-zinc-950 rounded-lg overflow-hidden border border-zinc-800 flex items-center justify-center">
              <video
                ref={videoRef}
                key={videoTimestampKey}
                src={`/api/clips/${clipId}/file?t=${videoTimestampKey}`}
                controls
                className="w-full h-full object-contain"
                playsInline
              />
            </div>
            <div className="mt-3 text-xs text-zinc-400 text-center">
              Klik badge waktu pada cue di sebelah kanan untuk loncat ke detik tersebut.
            </div>
          </div>

          {/* Right Column: Subtitle Cues List & Configuration */}
          <div className="md:col-span-7 flex flex-col h-full overflow-hidden bg-white dark:bg-zinc-900">
            {/* Style selector & Cue count bar */}
            <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 bg-zinc-50/75 dark:bg-zinc-950/75">
              <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Total Baris: <span className="text-zinc-900 dark:text-zinc-100">{cues.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="style-select" className="text-xs text-zinc-600 dark:text-zinc-400">
                  Gaya Subtitle:
                </label>
                <select
                  id="style-select"
                  value={styleId}
                  onChange={(e) => setStyleId(e.target.value)}
                  className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-2.5 py-1 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                >
                  <option value="sule">SULE (Kuning, Stroke Hitam Tebal)</option>
                  <option value="tiktok">TikTok (Putih, Stroke Hitam)</option>
                  <option value="kamal">KAMAL (Kuning, Bayangan Merah)</option>
                </select>
              </div>
            </div>

            {/* Cue List Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-48 text-zinc-500">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-600 mb-2" />
                  <p className="text-sm">Memuat daftar subtitle...</p>
                </div>
              ) : cues.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
                    Belum ada baris subtitle untuk klip ini.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleAddCueBelow(-1)}
                    className="px-3 py-1.5 text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors"
                  >
                    + Tambah Baris Pertama
                  </button>
                </div>
              ) : (
                cues.map((cue, index) => (
                  <div
                    key={cue.id || index}
                    className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg space-y-2 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-zinc-400 dark:text-zinc-500">
                          #{cue.id}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSeek(cue.start)}
                          className="px-2 py-0.5 text-xs font-mono bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded transition-colors"
                          title="Klik untuk memutar dari detik ini"
                        >
                          {formatSrtTimestamp(cue.start)} → {formatSrtTimestamp(cue.end)}
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleAddCueBelow(index)}
                          className="px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          title="Sisipkan baris baru di bawah"
                        >
                          + Tambah
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCue(index)}
                          className="px-2 py-0.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors"
                          title="Hapus baris ini"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-[10px] text-zinc-500 mb-0.5">
                          Mulai (detik)
                        </label>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          value={cue.start}
                          onChange={(e) => handleCueTimeChange(index, 'start', e.target.value)}
                          className="w-full px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:ring-1 focus:ring-zinc-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-500 mb-0.5">
                          Selesai (detik)
                        </label>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          value={cue.end}
                          onChange={(e) => handleCueTimeChange(index, 'end', e.target.value)}
                          className="w-full px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:ring-1 focus:ring-zinc-500"
                        />
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        value={cue.text}
                        onChange={(e) => handleCueTextChange(index, e.target.value)}
                        placeholder="Ketik teks subtitle..."
                        className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Notification messages (error or status) */}
            {error && (
              <div className="px-5 py-2.5 bg-red-50 dark:bg-red-950/40 border-t border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-red-700 hover:text-red-900 font-bold ml-2"
                >
                  ✕
                </button>
              </div>
            )}

            {statusMessage && !error && (
              <div className="px-5 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border-t border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
                <span>{statusMessage}</span>
                <button
                  type="button"
                  onClick={() => setStatusMessage(null)}
                  className="text-emerald-700 hover:text-emerald-900 font-bold ml-2"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Action Bar Footer */}
            <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving || reBurning}
                className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Tutup
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveSubtitles}
                  disabled={saving || reBurning || cues.length === 0}
                  className="px-4 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Subtitle'}
                </button>

                <button
                  type="button"
                  onClick={handleReBurn}
                  disabled={saving || reBurning || cues.length === 0}
                  className="px-4 py-2 text-xs font-bold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white rounded-lg transition-colors disabled:opacity-50 shadow-sm flex items-center gap-1.5"
                >
                  {reBurning ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white dark:border-zinc-900" />
                      <span>Merender Ulang...</span>
                    </>
                  ) : (
                    <span>Render Ulang Video</span>
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
