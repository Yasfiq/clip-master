import React from 'react';
import { Sliders } from 'lucide-react';
import { SubtitleCue } from '@/pipeline/logic/srtParser';

export interface StudioInspectorProps {
  showInspector: boolean;
  activeCue: SubtitleCue | null;
  duration: number;
}

export const StudioInspector: React.FC<StudioInspectorProps> = ({
  showInspector,
  activeCue,
  duration,
}) => {
  return (
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
              Cue Teks Terpilih (Detik {activeCue.start.toFixed(2)} - {activeCue.end.toFixed(2)})
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
  );
};
