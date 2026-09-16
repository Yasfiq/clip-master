'use client';

import React, { useEffect, useState } from 'react';
import { X, Copy, Check, Sparkles, RefreshCw, Hash, Type, FileText, Share2 } from 'lucide-react';
import { ClipCopywriting } from '@/types/copywriting';

interface CopywritingModalProps {
  clipId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

type PlatformTab = 'all' | 'youtube' | 'tiktok' | 'reels';

export const CopywritingModal: React.FC<CopywritingModalProps> = ({ clipId, isOpen, onClose }) => {
  const [data, setData] = useState<ClipCopywriting | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PlatformTab>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Editable fields so user can tweak copy before pasting
  const [editableTitle, setEditableTitle] = useState('');
  const [editableSummary, setEditableSummary] = useState('');
  const [editableHashtags, setEditableHashtags] = useState('');
  const [editableAttribution, setEditableAttribution] = useState('');

  useEffect(() => {
    if (isOpen && clipId) {
      fetchCopywriting(clipId);
    } else {
      setData(null);
      setError(null);
    }
  }, [isOpen, clipId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const fetchCopywriting = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clips/${id}/copywriting`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Gagal memuat teks copywriting');
      }
      const copy: ClipCopywriting = json.data.copywriting;
      setData(copy);
      setEditableTitle(copy.title);
      setEditableSummary(copy.hookSummary);
      setEditableHashtags(copy.hashtagString);
      setEditableAttribution(copy.attribution);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, key: string) => {
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2000);
    } catch (err) {
      console.error('Gagal menyalin teks:', err);
    }
  };

  if (!isOpen || !clipId) return null;

  // Build the compiled ready-to-paste text depending on the active tab
  const getCompiledText = (): string => {
    if (activeTab === 'youtube') {
      const ytTitle = editableTitle ? `${editableTitle} #shorts` : '#shorts';
      const parts = [editableSummary, editableHashtags, editableAttribution].filter(Boolean);
      return `Judul:\n${ytTitle}\n\nDeskripsi:\n${parts.join('\n\n')}`;
    }

    if (activeTab === 'tiktok') {
      const parts = [
        editableTitle ? `${editableTitle}!` : '',
        editableSummary,
        editableHashtags,
        editableAttribution,
      ].filter(Boolean);
      return parts.join('\n\n');
    }

    if (activeTab === 'reels') {
      const parts = [
        editableTitle ? editableTitle.toUpperCase() : '',
        editableSummary,
        editableAttribution,
        '.\n.\n.\n' + editableHashtags,
      ].filter(Boolean);
      return parts.join('\n\n');
    }

    // Default 'all'
    const parts = [
      editableTitle ? `📌 ${editableTitle}` : '',
      editableSummary,
      editableHashtags,
      editableAttribution,
    ].filter(Boolean);
    return parts.join('\n\n');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Generator Copywriting Judul dan Caption"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl max-h-[92vh] bg-zinc-900 border border-zinc-750 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm sm:text-base text-zinc-100 flex items-center gap-2">
                <span>Copywriting & Caption SEO</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-blue-950/70 text-blue-300 border border-blue-800/60 font-mono">
                  Anti-Slop AI
                </span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Siap salin untuk YouTube Shorts, TikTok, dan Instagram Reels.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchCopywriting(clipId)}
              disabled={loading}
              title="Muat ulang teks otomatis"
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
              aria-label="Tutup modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Platform Selector Tabs */}
        <div className="px-5 pt-3 pb-2 bg-zinc-950/30 border-b border-zinc-800/80 flex items-center gap-1.5 overflow-x-auto text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'all'
                ? 'bg-zinc-800 text-amber-300 border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 border-transparent hover:bg-zinc-850'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Format Umum (All-in-One)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('youtube')}
            className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'youtube'
                ? 'bg-zinc-800 text-red-400 border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 border-transparent hover:bg-zinc-850'
            }`}
          >
            <span className="font-bold text-xs">YT</span>
            <span>YouTube Shorts</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tiktok')}
            className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'tiktok'
                ? 'bg-zinc-800 text-cyan-400 border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 border-transparent hover:bg-zinc-850'
            }`}
          >
            <span className="font-bold text-xs">TT</span>
            <span>TikTok</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reels')}
            className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'reels'
                ? 'bg-zinc-800 text-pink-400 border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 border-transparent hover:bg-zinc-850'
            }`}
          >
            <span className="font-bold text-xs">IG</span>
            <span>Instagram Reels</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-7 h-7 text-amber-400 animate-spin" />
              <p className="text-xs text-zinc-400">Menyusun copywriting kontekstual anti-slop...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
              {error}
            </div>
          ) : (
            <>
              {/* Ready-to-paste preview block */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Pratinjau Format Siap Salin ({activeTab.toUpperCase()})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(getCompiledText(), 'all-compiled')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                      copiedKey === 'all-compiled'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-500 hover:bg-amber-450 text-zinc-950 font-bold'
                    }`}
                  >
                    {copiedKey === 'all-compiled' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Tersalin! ✅</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Teks Lengkap</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-3 bg-zinc-900/90 rounded-lg border border-zinc-800/80 font-sans text-xs text-zinc-200 whitespace-pre-line leading-relaxed max-h-40 overflow-y-auto select-text">
                  {getCompiledText()}
                </div>
              </div>

              {/* Editable Breakdown Sections */}
              <div className="space-y-3.5 pt-1">
                {/* 1. Title */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5 text-blue-400" />
                      <span>Judul Punchy (High-CTR)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(editableTitle, 'title')}
                      className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                    >
                      {copiedKey === 'title' ? (
                        <span className="text-emerald-400 flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Tersalin
                        </span>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Salin Judul
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={editableTitle}
                    onChange={(e) => setEditableTitle(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="Judul klip..."
                  />
                </div>

                {/* 2. Hook Summary */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Ringkasan Percakapan (1-2 Kalimat)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(editableSummary, 'summary')}
                      className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                    >
                      {copiedKey === 'summary' ? (
                        <span className="text-emerald-400 flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Tersalin
                        </span>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Salin Ringkasan
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={editableSummary}
                    onChange={(e) => setEditableSummary(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="Ringkasan poin penting..."
                  />
                </div>

                {/* 3. Hashtags */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-amber-400" />
                      <span>Hashtags Terkait</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(editableHashtags, 'hashtags')}
                      className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                    >
                      {copiedKey === 'hashtags' ? (
                        <span className="text-emerald-400 flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Tersalin
                        </span>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Salin Hashtags
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={editableHashtags}
                    onChange={(e) => setEditableHashtags(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="#topik #shorts..."
                  />
                </div>

                {/* 4. Creator Attribution */}
                {editableAttribution && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-300">
                        Atribusi Pembuat / Saluran
                      </label>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(editableAttribution, 'attribution')}
                        className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                      >
                        {copiedKey === 'attribution' ? (
                          <span className="text-emerald-400 flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Tersalin
                          </span>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" /> Salin Atribusi
                          </>
                        )}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={editableAttribution}
                      onChange={(e) => setEditableAttribution(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between text-xs text-zinc-400">
          <span>Formula anti-slop: tanpa kata buzzword kosong & berbasis konten asli.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export default CopywritingModal;
