import React from 'react';
import { Loader2, Pause, Volume2 } from 'lucide-react';
import { StudioConfig } from '@/types/clipStudio';

export interface HookPanelProps {
  studioConfig: StudioConfig;
  setStudioConfig: React.Dispatch<React.SetStateAction<StudioConfig>>;
  ttsPreviewLoading: boolean;
  ttsPreviewPlaying: boolean;
  handleTestTts: () => void;
  handleStopTts: () => void;
}

const FREEZE_OPTIONS = [0, 1.0, 1.2, 1.5, 2.0];

export const HookPanel: React.FC<HookPanelProps> = ({
  studioConfig,
  setStudioConfig,
  ttsPreviewLoading,
  ttsPreviewPlaying,
  handleTestTts,
  handleStopTts,
}) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
          Teks Headline Hook
        </label>
        <input
          type="text"
          value={studioConfig.hookText || ''}
          onChange={(e) => setStudioConfig((prev) => ({ ...prev, hookText: e.target.value }))}
          placeholder="Contoh: KEBEBASAN ADALAH SEGALANYA..."
          className="w-full text-xs bg-zinc-900 border border-zinc-750 text-zinc-100 rounded-md px-3 py-2 focus:border-blue-500 focus:outline-none font-semibold"
        />
        <p className="text-[10px] text-zinc-400 mt-1">
          Teks banner huruf kapital 3-5 kata untuk merebut perhatian audiens di 3 detik awal.
        </p>
      </div>

      <div>
        <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
          Posisi Teks Hook
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setStudioConfig((prev) => ({ ...prev, hookPosition: 'center' }))}
            className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
              (studioConfig.hookPosition || 'center') === 'center'
                ? 'bg-amber-400 text-black border-amber-300 shadow-md'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
          >
            Tengah Layar (Baku)
          </button>
          <button
            type="button"
            onClick={() => setStudioConfig((prev) => ({ ...prev, hookPosition: 'top' }))}
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

      {/* Voiceover Wanita AI (TTS) */}
      <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-lg space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-zinc-200 block">
              Voiceover Wanita AI (TTS)
            </span>
            <span className="text-[10px] text-zinc-400">
              Frame 1 dibekukan selama suara wanita membaca hook.
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

        {studioConfig.hookTtsEnabled !== false ? (
          <div className="space-y-2.5 pt-1 border-t border-zinc-800/80">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400">Pilihan Suara:</span>
              <span className="text-amber-400 font-semibold font-mono text-[10px]">
                Suara Wanita (GadisNeural)
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] bg-zinc-950/40 p-2 rounded border border-zinc-800">
              <span className="text-zinc-400">Durasi Freeze Frame:</span>
              <span className="text-amber-300 font-mono font-bold text-xs">
                ⏱ {(studioConfig.freezeDuration || studioConfig.hookDuration || 2.0).toFixed(2)}s
              </span>
            </div>

            <button
              type="button"
              onClick={ttsPreviewPlaying ? handleStopTts : handleTestTts}
              disabled={ttsPreviewLoading || !studioConfig.hookText?.trim()}
              className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                ttsPreviewPlaying
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-750 hover:text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed shadow-sm`}
            >
              {ttsPreviewLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span>Membuat Suara AI...</span>
                </>
              ) : ttsPreviewPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400 fill-current" />
                  <span>Hentikan Suara Voiceover</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Dengarkan Voiceover AI & Sinkron Durasi</span>
                </>
              )}
            </button>

            <p className="text-[10px] text-zinc-400 leading-relaxed bg-zinc-950/60 p-2 rounded border border-zinc-800/60">
              💡 <strong>Formula Standar Baku:</strong> 1 frame pertama video akan dibekukan selama
              audio suara wanita membaca hook. Setelah selesai diucapkan, hook menghilang dan video
              segmen langsung lanjut berputar.
            </p>
          </div>
        ) : (
          <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
            <label className="text-[10px] font-semibold text-zinc-400 block">
              Durasi Freeze Frame Manual (Detik)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {FREEZE_OPTIONS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setStudioConfig((prev) => ({ ...prev, freezeDuration: sec }))}
                  className={`px-2.5 py-1 text-xs font-mono font-semibold rounded border transition-all cursor-pointer ${
                    studioConfig.freezeDuration === sec
                      ? 'bg-amber-400 text-black border-amber-300 shadow-sm'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  {sec === 0 ? '0s' : `${sec.toFixed(1)}s`}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
