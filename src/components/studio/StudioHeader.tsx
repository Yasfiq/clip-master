import React from 'react';
import { ChevronLeft, Clock, Film, Loader2, Sliders, X } from 'lucide-react';
import { formatTimecode } from '@/types/clipStudio';

export interface StudioHeaderProps {
  currentTime: number;
  duration: number;
  statusMessage: string | null;
  showInspector: boolean;
  setShowInspector: React.Dispatch<React.SetStateAction<boolean>>;
  saving: boolean;
  reBurning: boolean;
  loading: boolean;
  handleSaveDraft: (notify?: boolean) => void;
  handleRenderStudio: () => void;
  handleClose: () => void;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  currentTime,
  duration,
  statusMessage,
  showInspector,
  setShowInspector,
  saving,
  reBurning,
  loading,
  handleSaveDraft,
  handleRenderStudio,
  handleClose,
}) => {
  return (
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
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/80 border border-emerald-800/70 rounded text-[11px] text-emerald-300">
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
  );
};
