import React, { RefObject } from 'react';
import { Upload } from 'lucide-react';
import { StudioConfig } from '@/types/clipStudio';

export interface BrandingPanelProps {
  studioConfig: StudioConfig;
  setStudioConfig: React.Dispatch<React.SetStateAction<StudioConfig>>;
  logoExists: boolean;
  videoTimestampKey: number;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploadingLogo: boolean;
}

export const BrandingPanel: React.FC<BrandingPanelProps> = ({
  studioConfig,
  setStudioConfig,
  logoExists,
  videoTimestampKey,
  fileInputRef,
  handleLogoUpload,
  uploadingLogo,
}) => {
  return (
    <div className="space-y-4">
      {/* Watermark Logo Channel */}
      <div className="p-3 bg-zinc-900/70 border border-zinc-800 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-zinc-200 block">Logo Channel</span>
            <span className="text-[10px] text-zinc-400">Tampilkan watermark logo channel.</span>
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
                  <span className="text-[11px] text-emerald-400 font-medium">✓ Logo Tersedia</span>
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
                {(['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setStudioConfig((prev) => ({ ...prev, logoPosition: pos }))}
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
            <span className="text-xs font-semibold text-zinc-200 block">Sumber Video Asli</span>
            <span className="text-[10px] text-zinc-400">Atribusi sumber konten kreator asli.</span>
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
              onChange={(e) => setStudioConfig((prev) => ({ ...prev, sourceText: e.target.value }))}
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
                  const isSelected = (studioConfig.sourcePosition || 'top-right') === pos;
                  return (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setStudioConfig((prev) => ({ ...prev, sourcePosition: pos }))}
                      className={`py-1.5 px-2.5 text-[11px] rounded border transition-all cursor-pointer text-left flex items-center justify-between ${
                        isSelected
                          ? 'bg-blue-600/30 text-blue-300 border-blue-500 font-semibold'
                          : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                      }`}
                    >
                      <span>{label}</span>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
