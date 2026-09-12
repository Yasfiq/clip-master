'use client';

import React from 'react';
import { Play, Download, Edit3, Film, Flame } from 'lucide-react';

interface Clip {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  viralScore?: number;
  confidence?: string;
  exportPath?: string;
  thumbnailPath?: string;
  isExported: boolean;
}

interface ClipCardProps {
  clip: Clip;
  index: number;
  onPlay?: (clipId: string) => void;
  onDownload?: (clipId: string) => void;
  onEditSubtitle?: (clipId: string) => void;
}

const ClipCard: React.FC<ClipCardProps> = ({ clip, index, onPlay, onDownload, onEditSubtitle }) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getConfidenceBadge = (confidence?: string) => {
    switch (confidence) {
      case 'HIGH':
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60';
      case 'MEDIUM':
        return 'bg-amber-950/60 text-amber-300 border-amber-800/60';
      case 'LOW':
        return 'bg-rose-950/60 text-rose-300 border-rose-800/60';
      default:
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  const getViralScoreColor = (score?: number) => {
    if (!score) return 'text-zinc-500';
    if (score >= 0.8) return 'text-emerald-400';
    if (score >= 0.5) return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <article className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm hover:border-zinc-700 transition-all flex flex-col text-zinc-100">
      {/* 9:16 Portrait Thumbnail Frame */}
      <div className="relative aspect-[9/16] w-full max-h-[320px] bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-center overflow-hidden group">
        <div className="text-center flex flex-col items-center justify-center p-4">
          <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 mb-2 group-hover:scale-105 transition-transform shadow-inner">
            <Film className="w-6 h-6" />
          </div>
          <span className="text-xs font-semibold text-zinc-300">Klip #{index + 1}</span>
          <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
            {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
          </span>
        </div>

        {/* Duration badge */}
        <div className="absolute bottom-2.5 right-2.5 bg-zinc-950/80 backdrop-blur-sm text-zinc-200 text-[11px] font-mono px-2 py-0.5 rounded border border-zinc-800">
          {formatTime(clip.duration)}
        </div>

        {/* Play button overlay */}
        <button
          type="button"
          aria-label="Putar klip"
          onClick={() => onPlay?.(clip.id)}
          className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 transition-colors group cursor-pointer"
        >
          <div className="w-12 h-12 rounded-full bg-zinc-100/90 text-zinc-950 shadow-xl flex items-center justify-center opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all">
            <Play className="w-5 h-5 ml-0.5 fill-current" />
          </div>
        </button>
      </div>

      {/* Info & Metrics */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <h4 className="font-semibold text-sm text-zinc-100">Klip {index + 1}</h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                {formatTime(clip.startTime)} &rarr; {formatTime(clip.endTime)}
              </p>
            </div>

            {clip.confidence && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${getConfidenceBadge(
                  clip.confidence,
                )}`}
              >
                {clip.confidence}
              </span>
            )}
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-2">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" />
                <span>Viral Score</span>
              </div>
              <div
                className={`text-base font-bold font-mono mt-0.5 ${getViralScoreColor(clip.viralScore)}`}
              >
                {clip.viralScore ? clip.viralScore.toFixed(2) : '-'}
              </div>
            </div>
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-2">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Durasi</div>
              <div className="text-base font-bold font-mono text-zinc-200 mt-0.5">
                {formatTime(clip.duration)}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80">
          <div className="flex gap-2">
            <button
              onClick={() => onPlay?.(clip.id)}
              className="flex-1 py-2 px-3 text-xs font-semibold text-zinc-100 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Putar</span>
            </button>
            <button
              onClick={() => onDownload?.(clip.id)}
              disabled={!clip.isExported}
              className="flex-1 py-2 px-3 text-xs font-semibold text-zinc-100 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh</span>
            </button>
          </div>
          {onEditSubtitle && (
            <button
              onClick={() => onEditSubtitle(clip.id)}
              className="w-full py-2 px-3 text-xs font-semibold text-zinc-200 bg-zinc-800/90 hover:bg-zinc-750 border border-zinc-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
              <span>Edit Subtitle</span>
            </button>
          )}
        </div>

        {clip.exportPath && (
          <div
            className="mt-2 text-[10px] text-zinc-500 truncate font-mono"
            title={clip.exportPath}
          >
            {clip.exportPath}
          </div>
        )}
      </div>
    </article>
  );
};

export default ClipCard;
