import React from 'react';
import { StudioConfig } from '@/types/clipStudio';

export interface AudioPanelProps {
  studioConfig: StudioConfig;
  setStudioConfig: React.Dispatch<React.SetStateAction<StudioConfig>>;
}

export const AudioPanel: React.FC<AudioPanelProps> = ({ studioConfig, setStudioConfig }) => {
  return (
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
            onChange={(e) => setStudioConfig((prev) => ({ ...prev, hookTtsVoice: e.target.value }))}
            className="w-full text-xs bg-zinc-950 border border-zinc-800 text-zinc-100 rounded px-2.5 py-1.5 focus:border-blue-500 focus:outline-none"
          >
            <option value="id-ID-GadisNeural">Suara Wanita (GadisNeural - CapCut Style)</option>
            <option value="id-ID-ArdiNeural">Suara Pria (ArdiNeural - Deep Bass)</option>
          </select>
        </div>
      </div>
    </div>
  );
};
