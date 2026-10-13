import React from 'react';
import { StudioConfig } from '@/types/clipStudio';

export interface TransitionPanelProps {
  studioConfig: StudioConfig;
  setStudioConfig: React.Dispatch<React.SetStateAction<StudioConfig>>;
}

export const TransitionPanel: React.FC<TransitionPanelProps> = ({
  studioConfig,
  setStudioConfig,
}) => {
  return (
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
  );
};
