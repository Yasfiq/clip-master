import React from 'react';
import { Clock, Play, Plus, Trash2 } from 'lucide-react';
import { SubtitleCue, formatSrtTimestamp } from '@/pipeline/logic/srtParser';
import { StudioConfig } from '@/types/clipStudio';

export interface SubtitlePanelProps {
  cues: SubtitleCue[];
  studioConfig: StudioConfig;
  setStudioConfig: React.Dispatch<React.SetStateAction<StudioConfig>>;
  currentTime: number;
  handleSeek: (seconds: number) => void;
  setSelectedCueIndex: (idx: number) => void;
  handleCueTextChange: (index: number, newText: string) => void;
  handleNudgeAllCues: (delta: number) => void;
  handleNudgeSingleCue: (index: number, delta: number) => void;
  handleAddCue: (index: number) => void;
  handleDeleteCue: (index: number) => void;
}

export const SubtitlePanel: React.FC<SubtitlePanelProps> = ({
  cues,
  studioConfig,
  setStudioConfig,
  currentTime,
  handleSeek,
  setSelectedCueIndex,
  handleCueTextChange,
  handleNudgeAllCues,
  handleNudgeSingleCue,
  handleAddCue,
  handleDeleteCue,
}) => {
  return (
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

      {/* Timing & Audio-Sync Nudge Card */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>Sinkronisasi Timing ({cues.length} Cues)</span>
          </label>
          <span className="text-[10px] text-zinc-400 font-mono">Nudge Serentak</span>
        </div>
        <p className="text-[10px] text-zinc-400 leading-relaxed">
          Geser kemunculan subtitle agar selaras dengan ketukan suara:
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => handleNudgeAllCues(-0.25)}
            className="py-1 px-1.5 text-[10px] font-mono font-medium rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 hover:text-white transition-colors text-center"
            title="Percepat kemunculan subtitle 0.25 detik (muncul lebih awal)"
          >
            -0.25s
          </button>
          <button
            type="button"
            onClick={() => handleNudgeAllCues(-0.1)}
            className="py-1 px-1.5 text-[10px] font-mono font-medium rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 hover:text-white transition-colors text-center"
            title="Percepat kemunculan subtitle 0.10 detik"
          >
            -0.10s
          </button>
          <button
            type="button"
            onClick={() => handleNudgeAllCues(0.1)}
            className="py-1 px-1.5 text-[10px] font-mono font-medium rounded bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 border border-blue-800/60 transition-colors text-center"
            title="Tunda kemunculan subtitle 0.10 detik (lebih lambat)"
          >
            +0.10s
          </button>
          <button
            type="button"
            onClick={() => handleNudgeAllCues(0.25)}
            className="py-1 px-1.5 text-[10px] font-mono font-medium rounded bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 border border-blue-800/60 transition-colors text-center"
            title="Tunda kemunculan subtitle 0.25 detik (lebih lambat)"
          >
            +0.25s
          </button>
        </div>
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
                <div className="flex items-center gap-1">
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
                  <button
                    type="button"
                    onClick={() => handleNudgeSingleCue(index, -0.1)}
                    className="text-[9px] font-mono text-zinc-400 hover:text-zinc-200 px-1 py-0.5 rounded bg-zinc-800 hover:bg-zinc-750 transition-colors"
                    title="Nudge cue ini -0.1s"
                  >
                    -0.1s
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeSingleCue(index, 0.1)}
                    className="text-[9px] font-mono text-zinc-400 hover:text-zinc-200 px-1 py-0.5 rounded bg-zinc-800 hover:bg-zinc-750 transition-colors"
                    title="Nudge cue ini +0.1s"
                  >
                    +0.1s
                  </button>
                </div>

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
  );
};
