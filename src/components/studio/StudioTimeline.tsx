import React, { RefObject } from 'react';
import { Film, ImageIcon, MessageSquare, Music, Type, ZoomIn, ZoomOut } from 'lucide-react';
import { SubtitleCue } from '@/pipeline/logic/srtParser';
import { StudioConfig, StudioTab, formatTimecode } from '@/types/clipStudio';

export interface StudioTimelineProps {
  currentTime: number;
  timelineZoom: number;
  setTimelineZoom: React.Dispatch<React.SetStateAction<number>>;
  timelineRef: RefObject<HTMLDivElement | null>;
  totalTimelineDuration: number;
  freezeSec: number;
  viewMode: 'draft' | 'rendered';
  studioConfig: StudioConfig;
  cues: SubtitleCue[];
  dialogueTime: number;
  handleSeek: (sec: number) => void;
  setActiveTab: (tab: StudioTab) => void;
  setSelectedCueIndex: (idx: number) => void;
}

export const StudioTimeline: React.FC<StudioTimelineProps> = ({
  currentTime,
  timelineZoom,
  setTimelineZoom,
  timelineRef,
  totalTimelineDuration,
  freezeSec,
  viewMode,
  studioConfig,
  cues,
  dialogueTime,
  handleSeek,
  setActiveTab,
  setSelectedCueIndex,
}) => {
  const pixelsPerSecond = 50 * timelineZoom;
  const totalTimelineWidth = Math.max(900, totalTimelineDuration * pixelsPerSecond + 100);

  return (
    <footer className="h-48 md:h-52 lg:h-56 bg-[#121216] border-t border-zinc-800/90 flex flex-col shrink-0 select-none overflow-hidden">
      {/* Timeline Header Toolbar */}
      <div className="h-7 px-3 bg-[#15151b] border-b border-zinc-800 flex items-center justify-between text-[11px] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 font-mono text-[10px]">
            Playhead: <strong className="text-blue-400">{formatTimecode(currentTime)}</strong>
          </span>
          <div className="h-3 w-px bg-zinc-700 mx-1" />
          <span className="text-[10px] text-zinc-400">Space: Play/Pause • Esc: Keluar</span>
        </div>

        {/* Timeline Zoom Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTimelineZoom((z) => Math.max(0.6, z - 0.2))}
            className="text-zinc-400 hover:text-white p-0.5 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min="0.6"
            max="2.5"
            step="0.1"
            value={timelineZoom}
            onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
            className="w-16 h-1 accent-blue-500 cursor-pointer"
          />
          <button
            type="button"
            onClick={() => setTimelineZoom((z) => Math.min(2.5, z + 0.2))}
            className="text-zinc-400 hover:text-white p-0.5 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setTimelineZoom(1.0)}
            className="text-[10px] font-mono text-zinc-400 hover:text-white px-1.5 py-0.5 rounded bg-zinc-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            1.0x
          </button>
        </div>
      </div>

      {/* Timeline Scrollable Track Area */}
      <div
        ref={timelineRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative bg-[#0e0e12] p-1.5"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left + e.currentTarget.scrollLeft;
          const targetSec = clickX / pixelsPerSecond;
          handleSeek(targetSec);
        }}
      >
        <div
          style={{ width: `${totalTimelineWidth}px` }}
          className="relative h-full flex flex-col gap-1"
        >
          {/* A. Time Ruler (Detik Marker) */}
          <div className="h-5 relative border-b border-zinc-800 text-[9px] text-zinc-400 font-mono select-none">
            {Array.from({ length: Math.ceil(totalTimelineDuration / 5) + 1 }).map((_, i) => {
              const sec = i * 5;
              const xPos = sec * pixelsPerSecond;
              return (
                <div key={sec} className="absolute top-0 bottom-0" style={{ left: `${xPos}px` }}>
                  <div className="h-2 w-px bg-zinc-700" />
                  <span className="absolute top-1 left-1">{formatTimecode(sec)}</span>
                </div>
              );
            })}
          </div>

          {/* B. Red Playhead Needle */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none transition-all duration-75"
            style={{ left: `${currentTime * pixelsPerSecond}px` }}
          >
            {/* Playhead Needle Head (Triangle) */}
            <div className="w-3 h-3 bg-red-500 absolute -top-1 -left-[5px] rotate-45 rounded-xs shadow-md" />
          </div>

          {/* TRACK 1: Hook Banner & Freeze Frame */}
          <div className="h-6 bg-zinc-900/60 rounded border border-zinc-800 relative flex items-center px-2">
            <span className="text-[10px] font-mono text-zinc-400 w-16 shrink-0 flex items-center gap-1">
              <Type className="w-3 h-3 text-amber-400" /> Hook
            </span>
            <div className="flex-1 relative h-full">
              {studioConfig.hookText && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab('hook');
                    handleSeek(0);
                  }}
                  className="absolute top-0.5 bottom-0.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black text-[10px] font-bold px-2 rounded flex items-center truncate cursor-pointer shadow-md border border-amber-300 transition-colors"
                  style={{
                    left: '0px',
                    width: `${Math.max(freezeSec, 1.0) * pixelsPerSecond}px`,
                  }}
                  title={`Hook Freeze Frame (${freezeSec.toFixed(1)}s): ${studioConfig.hookText}`}
                >
                  <span className="shrink-0 mr-1 font-mono text-[9px] bg-black/20 px-1 rounded">
                    ❄️ {freezeSec.toFixed(1)}s
                  </span>
                  <span className="truncate">🪝 {studioConfig.hookText}</span>
                </div>
              )}
            </div>
          </div>

          {/* TRACK 2: Subtitle Captions Track */}
          <div className="h-7 bg-zinc-900/60 rounded border border-zinc-800 relative flex items-center px-2">
            <span className="text-[10px] font-mono text-zinc-400 w-16 shrink-0 flex items-center gap-1">
              <MessageSquare className="w-3 h-3 text-blue-400" /> Sub
            </span>
            <div className="flex-1 relative h-full">
              {cues.map((cue, idx) => {
                const cueOffset = viewMode === 'draft' ? freezeSec : 0;
                const left = (cue.start + cueOffset) * pixelsPerSecond;
                const width = Math.max(16, (cue.end - cue.start) * pixelsPerSecond);
                const isCurrent = dialogueTime >= cue.start && dialogueTime <= cue.end;

                return (
                  <div
                    key={cue.id || idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCueIndex(idx);
                      setActiveTab('subtitle');
                      handleSeek(cue.start + cueOffset);
                    }}
                    className={`absolute top-0.5 bottom-0.5 text-[9px] font-medium px-1 rounded flex items-center truncate cursor-pointer transition-all border ${
                      isCurrent
                        ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-md z-10'
                        : 'bg-blue-950/80 text-blue-200 border-blue-800 hover:bg-blue-900'
                    }`}
                    style={{ left: `${left}px`, width: `${width}px` }}
                    title={`${formatTimecode(cue.start)} - ${formatTimecode(cue.end)}: ${cue.text}`}
                  >
                    {cue.text}
                  </div>
                );
              })}
            </div>
          </div>

          {/* TRACK 3: Branding & Watermark */}
          <div className="h-6 bg-zinc-900/60 rounded border border-zinc-800 relative flex items-center px-2">
            <span className="text-[10px] font-mono text-zinc-400 w-16 shrink-0 flex items-center gap-1">
              <ImageIcon className="w-3 h-3 text-emerald-400" /> Brand
            </span>
            <div className="flex-1 relative h-full">
              {studioConfig.logoEnabled && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab('branding');
                  }}
                  className="absolute top-0.5 bottom-0.5 bg-emerald-950/80 text-emerald-300 text-[9px] font-medium px-2 rounded flex items-center truncate cursor-pointer border border-emerald-800/80"
                  style={{ left: '0px', width: `${totalTimelineDuration * pixelsPerSecond}px` }}
                >
                  🏷️ Watermark Logo ({studioConfig.logoPosition}) •{' '}
                  {studioConfig.sourceText || 'Atribusi Sumber'}
                </div>
              )}
            </div>
          </div>

          {/* TRACK 4: Video Master Clip */}
          <div className="h-6 bg-zinc-900/60 rounded border border-zinc-800 relative flex items-center px-2">
            <span className="text-[10px] font-mono text-zinc-400 w-16 shrink-0 flex items-center gap-1">
              <Film className="w-3 h-3 text-indigo-400" /> Video
            </span>
            <div className="flex-1 relative h-full">
              <div
                className="absolute top-0.5 bottom-0.5 bg-indigo-950/90 text-indigo-300 text-[9px] font-mono px-2 rounded flex items-center truncate border border-indigo-800/80 shadow-inner"
                style={{ left: '0px', width: `${totalTimelineDuration * pixelsPerSecond}px` }}
              >
                🎬 Footage Vertical 1080x1920 (Active Speaker Framing)
              </div>
            </div>
          </div>

          {/* TRACK 5: Audio & Ducking */}
          <div className="h-6 bg-zinc-900/60 rounded border border-zinc-800 relative flex items-center px-2">
            <span className="text-[10px] font-mono text-zinc-400 w-16 shrink-0 flex items-center gap-1">
              <Music className="w-3 h-3 text-cyan-400" /> Audio
            </span>
            <div className="flex-1 relative h-full">
              <div
                className="absolute top-0.5 bottom-0.5 bg-cyan-950/80 text-cyan-300 text-[9px] font-mono px-2 rounded flex items-center truncate border border-cyan-800/80"
                style={{ left: '0px', width: `${totalTimelineDuration * pixelsPerSecond}px` }}
              >
                🎵 Source Audio + Ducking Level (-16 LUFS)
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
