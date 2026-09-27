import React, { RefObject } from 'react';
import {
  Eye,
  Film,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { SubtitleCue } from '@/pipeline/logic/srtParser';
import { StudioConfig, StudioClipMetadata, formatTimecode } from '@/types/clipStudio';

export interface StudioCanvasProps {
  viewMode: 'draft' | 'rendered';
  handleSwitchViewMode: (mode: 'draft' | 'rendered') => void;
  clipData: StudioClipMetadata | null;
  freezeSec: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  ttsAudioRef: RefObject<HTMLAudioElement | null>;
  videoSrc: string;
  handleTimeUpdate: () => void;
  handleLoadedMetadata: () => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  setError: (err: string | null) => void;
  togglePlay: () => void;
  studioConfig: StudioConfig;
  logoExists: boolean;
  isCleanVideo: boolean;
  videoTimestampKey: number;
  currentTime: number;
  activeCue: SubtitleCue | null;
  cues: SubtitleCue[];
  handleSeek: (sec: number) => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
}

export const StudioCanvas: React.FC<StudioCanvasProps> = ({
  viewMode,
  handleSwitchViewMode,
  clipData,
  freezeSec,
  videoRef,
  ttsAudioRef,
  videoSrc,
  handleTimeUpdate,
  handleLoadedMetadata,
  setIsPlaying,
  setError,
  togglePlay,
  studioConfig,
  logoExists,
  isCleanVideo,
  videoTimestampKey,
  currentTime,
  activeCue,
  cues,
  handleSeek,
  isMuted,
  setIsMuted,
  isPlaying,
}) => {
  return (
    <div className="flex-1 bg-[#09090c] flex flex-col items-center justify-between p-3 relative min-w-0 overflow-hidden">
      {/* Top Canvas Mode Switcher Bar */}
      <div className="w-full max-w-md flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-lg border border-zinc-800">
          <button
            type="button"
            onClick={() => handleSwitchViewMode('draft')}
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'draft'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Simulasi Draf</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchViewMode('rendered')}
            disabled={!clipData?.isExported && !clipData?.exportPath}
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'rendered'
                ? 'bg-emerald-600 text-white shadow-sm'
                : clipData?.isExported || clipData?.exportPath
                  ? 'text-zinc-400 hover:text-zinc-200'
                  : 'text-zinc-600 cursor-not-allowed opacity-50'
            }`}
            title={
              clipData?.isExported || clipData?.exportPath
                ? 'Lihat video final hasil render FFmpeg dengan freeze frame & voiceover'
                : 'Render ulang terlebih dahulu untuk melihat hasil ekspor'
            }
          >
            <Film className="w-3.5 h-3.5" />
            <span>Hasil Render (Final)</span>
            {(clipData?.isExported || clipData?.exportPath) && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
        </div>

        {freezeSec > 0 && viewMode === 'draft' && (
          <div className="text-[11px] font-mono font-semibold text-amber-400 flex items-center gap-1 bg-amber-400/10 px-2.5 py-1 rounded-md border border-amber-400/20 shadow-sm">
            <span>❄️ Freeze Frame:</span>
            <span>{freezeSec.toFixed(1)}s</span>
          </div>
        )}
      </div>

      {/* Canvas Container */}
      <div className="flex-1 flex items-center justify-center w-full min-h-0">
        <div className="relative aspect-[9/16] h-full min-h-[280px] max-h-[calc(100vh-320px)] w-auto bg-black rounded-lg shadow-2xl border border-zinc-800 overflow-hidden flex items-center justify-center">
          <video
            ref={videoRef}
            src={videoSrc}
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => {
              setIsPlaying(false);
              if (ttsAudioRef.current) ttsAudioRef.current.pause();
            }}
            onError={() =>
              setError('Gagal memuat preview video klip. Pastikan berkas media tersedia di disk.')
            }
            onClick={togglePlay}
          />

          {/* Hidden audio element for previewing TTS voiceover in draft simulation */}
          <audio ref={ttsAudioRef} preload="auto" />

          {/* Rendered Mode Notification Badge */}
          {viewMode === 'rendered' && (
            <div className="absolute top-2 left-2 z-30 px-2.5 py-1 rounded bg-zinc-950/85 border border-emerald-500/40 text-[10px] text-emerald-400 font-mono shadow-md flex items-center gap-1.5 pointer-events-none backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>🎬 Video Hasil Render (Final Hardsub & Freeze Frame)</span>
            </div>
          )}

          {/* Overlaid Mockup Layers (Draft Simulation Mode Only) */}
          {viewMode === 'draft' && (
            <>
              {/* Layer 1A: Watermark Logo */}
              {studioConfig.logoEnabled && logoExists && isCleanVideo && (
                <div
                  className={`pointer-events-none z-20 ${
                    (studioConfig.logoPosition || 'top-left') === 'top-left'
                      ? 'absolute top-4 left-4'
                      : (studioConfig.logoPosition || 'top-left') === 'top-right'
                        ? 'absolute top-4 right-4'
                        : (studioConfig.logoPosition || 'top-left') === 'bottom-left'
                          ? 'absolute bottom-6 left-4'
                          : 'absolute bottom-6 right-4'
                  }`}
                >
                  <div
                    className="w-7 h-7 rounded shadow-md overflow-hidden"
                    style={{ opacity: studioConfig.logoOpacity }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/settings/logo/file?t=${videoTimestampKey}`}
                      alt="Logo"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              )}

              {/* Layer 1B: Source Attribution Pill */}
              {studioConfig.sourceEnabled &&
                studioConfig.sourceText &&
                (() => {
                  const isLogoVisible = studioConfig.logoEnabled && logoExists && isCleanVideo;
                  const logoPos = studioConfig.logoPosition || 'top-left';
                  const sourcePos = studioConfig.sourcePosition || 'top-right';

                  let pillPlacement = 'absolute pointer-events-none z-20 ';
                  if (sourcePos === 'bottom') {
                    pillPlacement += 'bottom-28 left-1/2 -translate-x-1/2';
                  } else if (sourcePos === 'top-left') {
                    pillPlacement +=
                      isLogoVisible && logoPos === 'top-left' ? 'top-4 left-14' : 'top-4 left-4';
                  } else {
                    pillPlacement +=
                      isLogoVisible && logoPos === 'top-right' ? 'top-4 right-14' : 'top-4 right-4';
                  }

                  return (
                    <div className={pillPlacement}>
                      <div className="bg-white/90 text-zinc-900 text-[9px] font-bold px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap">
                        {studioConfig.sourceText}
                      </div>
                    </div>
                  );
                })()}

              {/* Layer 2: Hook Headline Banner (Visible during freeze frame / hook TTS duration) */}
              {currentTime < Math.max(freezeSec, 0.1) && studioConfig.hookText && (
                <div
                  className={`absolute left-3 right-3 text-center pointer-events-none z-20 transition-all ${
                    (studioConfig.hookPosition || 'center') === 'top'
                      ? 'top-14'
                      : 'top-1/2 -translate-y-1/2'
                  }`}
                >
                  <div className="inline-block bg-amber-400 text-black font-black uppercase text-xs sm:text-sm px-3.5 py-1.5 rounded-md shadow-2xl border-2 border-black tracking-wide">
                    {studioConfig.hookText}
                  </div>
                </div>
              )}

              {/* Layer 3: Active Subtitle Preview (Shown only after freeze frame ends) */}
              {activeCue && isCleanVideo && (
                <div className="absolute bottom-16 left-3 right-3 text-center pointer-events-none z-20">
                  <span className="font-montserrat font-black text-amber-300 text-xs sm:text-sm px-2 py-1 rounded drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] stroke-black tracking-tight leading-snug whitespace-pre-line">
                    {activeCue.text}
                  </span>
                </div>
              )}

              {/* Freeze Frame Indicator Badge with Countdown */}
              {freezeSec > 0 && currentTime < freezeSec && (
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-amber-400 text-black text-[10px] font-bold font-mono shadow-md flex items-center gap-1.5 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-black" />
                  <span>⏱ Freeze: {(freezeSec - currentTime).toFixed(1)}s</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Canvas Playback Controls Bar */}
      <div className="w-full max-w-md h-10 px-4 mt-2 bg-[#141418] border border-zinc-800 rounded-lg flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const prevCue = cues.filter((c) => c.start < currentTime - 0.2).pop();
              if (prevCue) handleSeek(prevCue.start);
              else handleSeek(0);
            }}
            className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Cue Sebelumnya"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-md transition-transform active:scale-95 cursor-pointer"
            title={isPlaying ? 'Pause (Spasi)' : 'Play (Spasi)'}
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              const nextCue = cues.find((c) => c.start > currentTime + 0.1);
              if (nextCue) handleSeek(nextCue.start);
            }}
            className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Cue Selanjutnya"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          <span className="text-[11px] font-mono text-zinc-300 ml-2">
            {formatTimecode(currentTime)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.muted = !isMuted;
                setIsMuted(!isMuted);
              }
            }}
            className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (videoRef.current) {
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  videoRef.current.requestFullscreen?.();
                }
              }
            }}
            className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Layar Penuh"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
